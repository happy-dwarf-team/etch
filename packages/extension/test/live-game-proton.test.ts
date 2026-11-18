import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ProtonError,
  compatToolName,
  findProton,
  readablePath,
  protonCommand,
  windowsPathOf,
} from '../src/live-game/proton.ts';

const CONFIG = (name: string) => `"InstallConfigStore"
{
\t"Software"
\t{
\t\t"Valve"
\t\t{
\t\t\t"Steam"
\t\t\t{
\t\t\t\t"CompatToolMapping"
\t\t\t\t{
\t\t\t\t\t"0" { "name" "default-proton" "config" "" "priority" "75" }
\t\t\t\t\t"236850" { "name" "${name}" "config" "" "priority" "250" }
\t\t\t\t}
\t\t\t}
\t\t}
\t}
}`;

describe('the compatibility tool of EU4', () => {
  it("is Steam's mapping of the app, else its default", () => {
    expect(compatToolName(CONFIG('my-proton-slr'), '236850')).toBe('my-proton-slr');
    expect(compatToolName(CONFIG('x').replace('"236850"', '"999"'), '236850')).toBe(
      'default-proton',
    );
    expect(compatToolName('"InstallConfigStore" { }', '236850')).toBeUndefined();
  });
});

/** A path as Steam writes it in a VDF string, where a backslash starts an escape. */
const vdf = (path: string): string => path.replaceAll('\\', '\\\\');

// Steam's Linux layout. Proton only starts the game on Linux, but finding it reads only files, so
// the layout runs on any file system, Windows CI's too.
describe('findProton and protonCommand', () => {
  let root: string;
  let home: string;
  let game: string;

  const write = async (path: string, text = ''): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  };

  /** Steam in ~/.local/share/Steam, EU4 and its prefix in a second library, a runtime tool with an entry point. */
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'etch-proton-'));
    home = join(root, 'home');
    const steam = join(home, '.local', 'share', 'Steam');
    const library = join(root, 'lib');
    game = join(library, 'steamapps', 'common', 'Europa Universalis IV');
    await write(join(steam, 'config', 'config.vdf'), CONFIG('my-proton-slr'));
    await write(
      join(steam, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders" { "0" { "path" "${vdf(steam)}" } "1" { "path" "${vdf(library)}" "apps" { "236850" "1" } } }`,
    );
    await write(join(steam, 'compatibilitytools.d', 'my-proton-slr', 'proton'), '#!/bin/sh\n');
    await write(
      join(steam, 'compatibilitytools.d', 'my-proton-slr', 'toolmanifest.vdf'),
      '"manifest" { "version" "2" "commandline" "/proton %verb%" "require_tool_appid" "4183110" }',
    );
    await write(
      join(steam, 'steamapps', 'appmanifest_4183110.acf'),
      '"AppState" { "appid" "4183110" "installdir" "SteamLinuxRuntime_sniper" }',
    );
    await write(
      join(steam, 'steamapps', 'common', 'SteamLinuxRuntime_sniper', '_v2-entry-point'),
      '#!/bin/sh\n',
    );
    await write(join(game, 'eu4.exe'), 'exe');
    await mkdir(join(library, 'steamapps', 'compatdata', '236850', 'pfx'), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('finds Steam, the tool, its runtime entry point and the prefix next to the game', async () => {
    const setup = await findProton(game, { env: {}, homedir: home });
    expect(setup.toolName).toBe('my-proton-slr');
    expect(setup.protonScript).toBe(
      join(setup.steamRoot, 'compatibilitytools.d', 'my-proton-slr', 'proton'),
    );
    expect(setup.entryPoint).toBe(
      join(setup.steamRoot, 'steamapps', 'common', 'SteamLinuxRuntime_sniper', '_v2-entry-point'),
    );
    expect(setup.compatData).toBe(join(root, 'lib', 'steamapps', 'compatdata', '236850'));
    expect(setup.libraries).toContain(join(root, 'lib'));
  });

  it("builds Steam's command for the game, and one for another program of the same container", async () => {
    const setup = await findProton(game, { env: {}, homedir: home });
    const exe = join(root, 'private', 'game', 'eu4.exe');
    const start = protonCommand(setup, 'waitforexitandrun', exe, ['-userdir=Z:/p/'], {
      cwd: dirname(exe),
      installPath: dirname(exe),
      extraPaths: [join(root, 'private')],
      env: { ETCH_HOST_SESSION: 'a'.repeat(32) },
    });
    expect(start.command).toBe(setup.entryPoint);
    expect(start.args).toEqual([
      '--verb=waitforexitandrun',
      '--',
      setup.protonScript,
      'waitforexitandrun',
      exe,
      '-userdir=Z:/p/',
    ]);
    expect(start.env['STEAM_COMPAT_DATA_PATH']).toBe(setup.compatData);
    expect(start.env['STEAM_COMPAT_CLIENT_INSTALL_PATH']).toBe(setup.steamRoot);
    expect(start.env['SteamAppId']).toBe('236850');
    expect(start.env['ETCH_HOST_SESSION']).toBe('a'.repeat(32));
    expect(start.env['PRESSURE_VESSEL_FILESYSTEMS_RW']).toBe(join(root, 'private'));
    const other = protonCommand(setup, 'run', '/x/tool.exe', ['Z:\\state'], {
      cwd: '/x',
      installPath: '/x',
    });
    expect(other.args.slice(0, 3)).toEqual(['--verb=run', '--', setup.protonScript]);
    expect(other.args.slice(3)).toEqual(['run', '/x/tool.exe', 'Z:\\state']);
  });

  it('runs a tool without a runtime through its own script', async () => {
    await write(
      join(
        home,
        '.local',
        'share',
        'Steam',
        'compatibilitytools.d',
        'my-proton-slr',
        'toolmanifest.vdf',
      ),
      '"manifest" { }',
    );
    const setup = await findProton(game, { env: {}, homedir: home });
    expect(setup.entryPoint).toBeUndefined();
    const start = protonCommand(setup, 'waitforexitandrun', '/g/eu4.exe', [], {
      cwd: '/g',
      installPath: '/g',
    });
    expect(start.command).toBe(setup.protonScript);
    expect(start.args).toEqual(['waitforexitandrun', '/g/eu4.exe']);
  });

  it('says what is missing', async () => {
    await expect(findProton(game, { env: {}, homedir: join(root, 'nowhere') })).rejects.toThrow(
      /Steam was not found/,
    );
    await rm(join(root, 'lib', 'steamapps', 'compatdata'), { recursive: true });
    await expect(findProton(game, { env: {}, homedir: home })).rejects.toBeInstanceOf(ProtonError);
    await expect(findProton(game, { env: {}, homedir: home })).rejects.toThrow(
      /start the game once from Steam/,
    );
  });

  it('says which tool or runtime is missing, and when Steam maps no tool', async () => {
    const steam = join(home, '.local', 'share', 'Steam');
    await rm(join(steam, 'steamapps', 'common', 'SteamLinuxRuntime_sniper'), { recursive: true });
    await expect(findProton(game, { env: {}, homedir: home })).rejects.toThrow(
      'The Steam Linux Runtime (app 4183110) the tool needs was not found.',
    );
    await rm(join(steam, 'compatibilitytools.d'), { recursive: true });
    await expect(findProton(game, { env: {}, homedir: home })).rejects.toThrow(
      'The compatibility tool my-proton-slr was not found (set ETCH_PROTON to its folder).',
    );
    await write(join(steam, 'config', 'config.vdf'), '"InstallConfigStore" { }');
    await expect(findProton(game, { env: {}, homedir: home })).rejects.toThrow(
      'Steam has no compatibility tool for EU4.',
    );
  });

  it('takes the tool from ETCH_PROTON first, and the tool in a library', async () => {
    const own = join(root, 'own-proton');
    await write(join(own, 'proton'), '#!/bin/sh\n');
    const env = { ETCH_PROTON: own };
    expect((await findProton(game, { env, homedir: home })).protonScript).toBe(join(own, 'proton'));
    // An empty override is no override; a tool Steam installed sits in a library's steamapps/common.
    const steam = join(home, '.local', 'share', 'Steam');
    await rm(join(steam, 'compatibilitytools.d'), { recursive: true });
    const installed = join(root, 'lib', 'steamapps', 'common', 'my-proton-slr');
    await write(join(installed, 'proton'), '#!/bin/sh\n');
    const setup = await findProton(game, { env: { ETCH_PROTON: '' }, homedir: home });
    expect(setup.protonScript).toBe(join(installed, 'proton'));
    expect(setup.entryPoint).toBeUndefined();
  });

  it("finds the prefix in another library when the game's has none", async () => {
    const steam = join(home, '.local', 'share', 'Steam');
    await rm(join(root, 'lib', 'steamapps', 'compatdata'), { recursive: true });
    await mkdir(join(steam, 'steamapps', 'compatdata', '236850', 'pfx'), { recursive: true });
    const setup = await findProton(game, { env: {}, homedir: home });
    expect(setup.compatData).toBe(join(setup.steamRoot, 'steamapps', 'compatdata', '236850'));
  });

  it('writes a unix path as the game sees it', () => {
    expect(windowsPathOf('/run/media/x/eu4.exe')).toBe('Z:\\run\\media\\x\\eu4.exe');
  });

  it("reads the host's /usr and /etc through /run/host in a Flatpak sandbox only", () => {
    const tool = '/usr/share/steam/compatibilitytools.d/proton-cachyos-slr/proton';
    expect(readablePath(tool, true)).toBe(`/run/host${tool}`);
    expect(readablePath(tool, false)).toBe(tool);
    expect(readablePath('/home/p/.steam/steam/x', true)).toBe('/home/p/.steam/steam/x');
  });
});
