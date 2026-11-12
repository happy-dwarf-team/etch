import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreparedInstall } from '../src/live-game/install.ts';
import { LiveGameProcess, type LockOptions } from '../src/live-game/process.ts';
import { windowsPathOf } from '../src/live-game/proton.ts';
import { processIdentity } from '../src/live-game/windows.ts';

// The Linux launch end to end with stand-ins for what only a Proton machine has: a `proton` script that starts a process
// whose command line begins with a Windows path (as a Wine process's does), and a plugin pipe served as a Unix socket. Not the real game: that is for a player to try.
const linux = process.platform === 'linux' ? describe : describe.skip;

linux('the live game started through Proton', () => {
  let root: string;
  let server: Server | undefined;
  const saved: Record<string, string | undefined> = {};

  const write = async (path: string, text: string, mode?: number): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
    if (mode !== undefined) await chmod(path, mode);
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'etch-proton-start-'));
    for (const name of ['HOME', 'ETCH_HOST_BRIDGE_DIR', 'ETCH_PIPE_DIRECT', 'XDG_DATA_HOME'])
      saved[name] = process.env[name];
    process.env['HOME'] = join(root, 'home');
    delete process.env['XDG_DATA_HOME'];
    process.env['ETCH_HOST_BRIDGE_DIR'] = join(root, 'bridge');
    process.env['ETCH_PIPE_DIRECT'] = join(root, 'pipes');
    await mkdir(join(root, 'pipes'), { recursive: true });
  });

  afterEach(async () => {
    server?.close();
    server = undefined;
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
    await rm(root, { recursive: true, force: true });
  });

  it('starts the game with the compat environment and the folder for the plugin socket, finds its Wine process and stops cleanly', async () => {
    const steam = join(root, 'home', '.local', 'share', 'Steam');
    const library = join(root, 'lib');
    const originalGame = join(library, 'steamapps', 'common', 'Europa Universalis IV');
    const privateGame = join(root, 'storage', 'private', 'game');
    const exe = join(privateGame, 'eu4.exe');
    const loader = join(root, 'wine64-preloader');
    await copyFile('/usr/bin/sleep', loader); // a binary whose name is a Wine loader's
    await write(
      join(steam, 'config', 'config.vdf'),
      '"InstallConfigStore" { "Software" { "Valve" { "Steam" { "CompatToolMapping" { "236850" { "name" "fake-proton" } } } } } }',
    );
    await write(
      join(steam, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders" { "0" { "path" "${steam}" } "1" { "path" "${library}" } }`,
    );
    await write(
      join(steam, 'compatibilitytools.d', 'fake-proton', 'toolmanifest.vdf'),
      '"manifest" { }',
    );
    // Proton: `waitforexitandrun <exe>` runs the "game" under the Windows path of the exe.
    await write(
      join(steam, 'compatibilitytools.d', 'fake-proton', 'proton'),
      `#!/bin/bash
echo "$@" >> "${root}/proton.log"; echo "compat=$STEAM_COMPAT_DATA_PATH app=$SteamAppId session=$ETCH_HOST_SESSION bridge=$ETCH_HOST_BRIDGE_DIR" >> "${root}/proton.log"
verb=$1; shift
case "$verb" in
  waitforexitandrun) exe=$1; exec -a "Z:\${exe//\\//\\\\}" "${loader}" 120 ;;
esac
`,
      0o755,
    );
    await write(join(originalGame, 'eu4.exe'), 'original');
    await mkdir(join(library, 'steamapps', 'compatdata', '236850', 'pfx'), { recursive: true });
    await write(exe, 'private copy');
    const install: PreparedInstall = {
      exe,
      gameFolder: privateGame,
      profileFolder: join(root, 'storage', 'private', 'profile'),
      savesFolder: join(root, 'storage', 'private', 'save games'),
      arguments: ['-userdir=Z:/profile/'],
      restored: [],
      settings: { copied: [], autosaveOn: false },
      continueSave: undefined,
    };
    const lock: LockOptions = {
      path: join(root, 'game-host.lock'),
      owner: (await processIdentity(process.pid)) ?? {
        pid: process.pid,
        imagePath: process.execPath,
        creationFileTime: '1',
      },
    };
    // The plugin: serves the session's pipe once the start has logged the session, answering with a Windows pid.
    const log = (message: string): void => {
      const session = /session ([0-9a-f]{32})/.exec(message)?.[1];
      if (session === undefined || server !== undefined) return;
      // The plugin's socket state file, which the extension removes when the game has ended.
      void write(
        join(root, 'bridge', `etch-host-${session}.json`),
        '{"port": 1, "token": "t", "pid": 1}',
      );
      server = createServer((socket) => {
        socket.setEncoding('utf8');
        let buffered = '';
        socket.on('data', (chunk: string) => {
          buffered += chunk;
          for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
            const request = JSON.parse(buffered.slice(0, end)) as { id: number };
            buffered = buffered.slice(end + 1);
            socket.write(
              `${JSON.stringify({ id: request.id, ok: true, protocol: 2, plugin: '2.7.0', session, pid: 4242, process_start_ms: Date.now(), ready: true, frame: 5, tree: false })}\n`,
            );
          }
        });
      });
      server.listen(join(root, 'pipes', `etch-host-${session}`));
    };

    const host = await LiveGameProcess.start({
      install,
      originalGameFolder: originalGame,
      lock,
      launcher: 'proton',
      log,
    });

    // The identity is the Wine process: its image is the exe's Windows path, and it is not the launcher.
    expect(host.identity.imagePath).toBe(windowsPathOf(exe));
    expect(host.hello.pid).toBe(4242); // the Windows pid; not the Linux one, which is what identity holds
    expect(host.identity.pid).not.toBe(4242);
    const protonLog = await readFile(join(root, 'proton.log'), 'utf8');
    expect(protonLog).toContain(`waitforexitandrun ${exe} -userdir=Z:/profile/`);
    expect(protonLog).toContain(
      `compat=${join(library, 'steamapps', 'compatdata', '236850')} app=236850 session=${host.session} bridge=${join(root, 'bridge')}`,
    );
    // The folder for the plugin's state file is made for the user only.
    expect((await stat(join(root, 'bridge'))).mode & 0o777).toBe(0o700);
    const stateFile = join(root, 'bridge', `etch-host-${host.session}.json`);
    expect((await stat(stateFile)).isFile()).toBe(true);
    expect(await host.stop()).toBe('terminated');
    await expect(stat(stateFile)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await processIdentity(host.identity.pid)).toBeUndefined();
  }, 60_000);
});
