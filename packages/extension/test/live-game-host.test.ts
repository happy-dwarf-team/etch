import { execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  flatpakInstancePid,
  hostRemove,
  hostShell,
  hostSpawn,
  isFlatpak,
  shellQuote,
} from '../src/live-game/host.ts';

/** Whether a POSIX `sh` runs here: always on Linux, through Git for Windows on Windows CI. */
function hasShell(): boolean {
  try {
    execFileSync('sh', ['-c', 'true'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const withShell = hasShell() ? describe : describe.skip;

withShell('shellQuote', () => {
  // The words the shell sees must be exactly the strings that went in, whatever they contain.
  const awkward = [
    'plain',
    '/home/user/.local/state/etch',
    'with space',
    "o'brien",
    "'",
    "''",
    "a'b'c",
    '$(touch /tmp/etch-injected)',
    '`touch /tmp/etch-injected`',
    'semi; colon && amp | pipe',
    'back\\slash',
    'double"quote',
    'new\nline',
    '',
  ];

  it.each(awkward)('gives %j back unchanged', (value) => {
    const printed = execFileSync('sh', ['-c', `printf %s ${shellQuote(value)}`], {
      encoding: 'utf8',
    });
    expect(printed).toBe(value);
  });

  it('keeps several quoted words apart', () => {
    const words = ["o'brien", 'a b'];
    const script = `printf '%s\\n' ${words.map(shellQuote).join(' ')}`;
    expect(execFileSync('sh', ['-c', script], { encoding: 'utf8' })).toBe("o'brien\na b\n");
  });
});

withShell('hostShell', () => {
  it("returns the script's output", async () => {
    await expect(hostShell(`printf %s ${shellQuote("it's here")}`, false)).resolves.toBe(
      "it's here",
    );
  });

  it('rejects when the script fails, with the error as the cause', async () => {
    const failed = hostShell('exit 3', false);
    await expect(failed).rejects.toThrow(/Command failed/);
    await expect(failed).rejects.toHaveProperty('cause.code', 3);
  });
});

describe('the host outside a Flatpak sandbox', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'etch-host-'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  /** Waits for a child to exit, or for the error that it could not start. */
  function ended(child: ChildProcess): Promise<number | Error> {
    return new Promise((resolve) => {
      child.once('error', resolve);
      child.once('exit', (code) => {
        resolve(code ?? -1);
      });
    });
  }

  it('is a sandbox only where its info file is, and never on Windows', () => {
    expect(isFlatpak()).toBe(process.platform !== 'win32' && existsSync('/.flatpak-info'));
  });

  it('starts a program in the folder, with the variables added to its environment', async () => {
    const child = hostSpawn(
      process.execPath,
      ['-e', "require('fs').writeFileSync('out.txt', process.env.ETCH_HOST_TEST + process.cwd())"],
      { cwd: folder, env: { ETCH_HOST_TEST: 'from etch:' }, flatpak: false },
    );
    expect(await ended(child)).toBe(0);
    const written = await readFile(join(folder, 'out.txt'), 'utf8');
    expect(written.startsWith('from etch:')).toBe(true);
    expect(written.toLowerCase()).toContain(folder.toLowerCase().slice(-12));
  });

  it('starts a program through flatpak-spawn on the host in a sandbox', async () => {
    const child = hostSpawn('proton', ['run', 'eu4.exe'], {
      cwd: '/games/eu4',
      env: { STEAM_COMPAT_DATA_PATH: '/data/236850', WINEDLLOVERRIDES: 'version=n,b' },
      flatpak: true,
    });
    expect(child.spawnargs).toEqual([
      'flatpak-spawn',
      '--host',
      '--watch-bus',
      '--directory=/games/eu4',
      '--env=STEAM_COMPAT_DATA_PATH=/data/236850',
      '--env=WINEDLLOVERRIDES=version=n,b',
      'proton',
      'run',
      'eu4.exe',
    ]);
    // Without flatpak-spawn here the start fails; the child is waited for either way.
    await ended(child);
  });

  it('runs a script through flatpak-spawn in a sandbox', async () => {
    if (hasFlatpakSpawn()) return;
    await expect(hostShell('true', true)).rejects.toThrow(/flatpak-spawn/);
  });

  it('deletes a file, and is quiet when there is none', async () => {
    const file = join(folder, "it's.txt");
    await writeFile(file, 'x');
    await hostRemove(file);
    expect(existsSync(file)).toBe(false);
    await expect(hostRemove(file)).resolves.toBeUndefined();
  });

  it("has no Flatpak instance's PID", async () => {
    if (isFlatpak()) return;
    await expect(flatpakInstancePid()).resolves.toBeUndefined();
  });
});

function hasFlatpakSpawn(): boolean {
  try {
    execFileSync('flatpak-spawn', ['--help'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
