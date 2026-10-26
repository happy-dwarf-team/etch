/// <reference types="node" />
// The run's game lock through the real game.ps1 and PowerShell 7, against fake-lab.psm1 in a temp
// lab: no game starts, and the machine's own lab lock is never touched.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GAME_LOCK_VARIABLE,
  enterGameLock,
  gameScript,
  interruptHandler,
  withGameLock,
  type GameScript,
} from '../../src/corpus/driver/game-script.ts';
import { makeTree, removeTree } from '../playset/fixture.ts';

const HOST_FILES: Record<string, string> = {
  'game/eu4.exe': 'not a game',
  'game/version.dll': 'not anvil',
  'game/anvil/anvil.toml': 'disabled_plugins = ["anvil-overlay"]\n',
  'game/anvil/data/tongs/settings.toml': 'enabled = true\n',
  'game/anvil/plugins/tongs/tongs.dll': 'not tongs',
};

const sha = (text: string): string => createHash('sha256').update(text).digest('hex').toUpperCase();

interface Call {
  readonly call: string;
  readonly token: string | null;
  readonly args: Record<string, unknown>;
}

const trees: string[] = [];
let outer: string | undefined;
beforeEach(() => {
  outer = process.env[GAME_LOCK_VARIABLE];
  Reflect.deleteProperty(process.env, GAME_LOCK_VARIABLE);
});
afterEach(async () => {
  if (outer === undefined) Reflect.deleteProperty(process.env, GAME_LOCK_VARIABLE);
  else process.env[GAME_LOCK_VARIABLE] = outer;
  await Promise.all(trees.splice(0).map(removeTree));
});

/** A temp lab with fake-lab.psm1 as its module, and a host install whose hashes match host.json. */
async function fixture(): Promise<{
  script: GameScript;
  lockFile: string;
  profile: string;
  calls: () => Promise<Call[]>;
}> {
  const tree = await makeTree({
    ...Object.fromEntries(Object.entries(HOST_FILES).map(([path, text]) => [`host/${path}`, text])),
    'host/profiles/vanilla/profile/settings.txt': '',
    'lab/work/.keep': '',
  });
  trees.push(tree);
  // The long path: a runner's temp folder can be an 8.3 name (RUNNER~1), and game.ps1 cuts the
  // plugins' paths by the length of the host folder as given.
  const root = realpathSync.native(tree);
  const hashes = {
    copyExe: sha(HOST_FILES['game/eu4.exe'] ?? ''),
    versionDll: sha(HOST_FILES['game/version.dll'] ?? ''),
    anvilToml: sha(HOST_FILES['game/anvil/anvil.toml'] ?? ''),
    tongsSettings: sha(HOST_FILES['game/anvil/data/tongs/settings.toml'] ?? ''),
    plugins: [
      {
        path: 'anvil\\plugins\\tongs\\tongs.dll',
        sha256: sha(HOST_FILES['game/anvil/plugins/tongs/tongs.dll'] ?? ''),
      },
    ],
  };
  await writeFile(join(root, 'host', 'host.json'), JSON.stringify({ hashes }));
  await mkdir(join(root, 'lab', 'scripts', 'lib'), { recursive: true });
  await copyFile(
    join(import.meta.dirname, 'fake-lab.psm1'),
    join(root, 'lab', 'scripts', 'lib', 'LabProcess.psm1'),
  );
  const work = join(root, 'lab', 'work');
  return {
    script: { lab: join(root, 'lab'), hostDir: join(root, 'host') },
    lockFile: join(work, 'game.lock'),
    profile: join(root, 'host', 'profiles', 'vanilla', 'profile'),
    calls: async () => {
      const text = await readFile(join(work, 'calls.jsonl'), 'utf8').catch(() => '');
      return text
        .split(/\r?\n/)
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as Call);
    },
  };
}

const exists = (file: string): Promise<boolean> =>
  readFile(file).then(
    () => true,
    () => false,
  );

describe.runIf(process.platform === 'win32')('the game lock of a capture run', () => {
  it('holds one lock for the run, and every game.ps1 the run starts belongs to it', async () => {
    const { script, lockFile, profile, calls } = await fixture();
    const launcher = gameScript(script);

    const token = await withGameLock(script, 'etch corpus test', 240, async (lock) => {
      expect(lock.inherited).toBe(false);
      expect(process.env[GAME_LOCK_VARIABLE]).toBe(lock.token);
      expect(lock.expiresAt.getTime()).toBeGreaterThan(Date.now() + 230 * 60_000);
      // Two sessions, as a run has them; Check also hashes the Steam game's eu4.exe, which CI
      // does not have, and Start runs the same preflight.
      for (let session = 0; session < 2; session++) {
        const record = await launcher.start(profile, undefined);
        expect(await exists(lockFile)).toBe(true);
        const stop = await launcher.stop(record);
        expect(stop.ok).toBe(true);
      }
      return lock.token;
    });

    const all = await calls();
    const session = [
      'Assert-LabPreflight',
      'Assert-LabPreflight',
      'Assert-NoGameRunning',
      'Start-LabGame',
      'Open-VerifiedSession',
    ];
    expect(all.map((c) => c.call)).toEqual([
      'Enter-LabGameLock',
      ...session,
      ...session,
      'Exit-LabGameLock',
    ]);
    // Held by this Node process, so it ends with the run even when Node is killed.
    expect(all[0]?.args).toEqual({
      owner: 'etch corpus test',
      minutes: 240,
      holderPid: process.pid,
    });
    expect(all.slice(1, -1).every((c) => c.token === token)).toBe(true);
    expect(all.at(-1)?.args).toEqual({ token });
    expect(await exists(lockFile)).toBe(false);
    expect(process.env[GAME_LOCK_VARIABLE]).toBeUndefined();
  }, 60_000);

  it('releases the lock when the run fails', async () => {
    const { script, lockFile, calls } = await fixture();

    await expect(
      withGameLock(script, 'etch corpus test', 240, () => Promise.reject(new Error('broken'))),
    ).rejects.toThrow('broken');

    expect((await calls()).map((c) => c.call)).toEqual(['Enter-LabGameLock', 'Exit-LabGameLock']);
    expect(await exists(lockFile)).toBe(false);
    expect(process.env[GAME_LOCK_VARIABLE]).toBeUndefined();
  }, 30_000);

  it('releases the mouse and the lock on Ctrl+C, then exits', async () => {
    const { script, lockFile, calls } = await fixture();
    const lock = await enterGameLock(script, 'etch corpus test', 240);
    const steps: string[] = [];
    const handler = interruptHandler({
      releaseMouse: () => steps.push('mouse'),
      lock: () => lock,
      exit: (code) => steps.push(`exit ${String(code)}`),
      print: (line) => steps.push(line),
    });

    handler('SIGINT');
    await lock.release();

    expect(steps).toEqual([
      'mouse',
      'SIGINT: the mouse is released.',
      'SIGINT: the game lock is released.',
      'exit 130',
    ]);
    // Released once: the run's own release after the handler finds nothing more to do.
    expect((await calls()).map((c) => c.call)).toEqual(['Enter-LabGameLock', 'Exit-LabGameLock']);
    expect(await exists(lockFile)).toBe(false);
    expect(process.env[GAME_LOCK_VARIABLE]).toBeUndefined();
  }, 30_000);

  it('stops before anything starts when another session holds the lock', async () => {
    const { script, lockFile, calls } = await fixture();
    const held = JSON.stringify({
      owner: 'lab series',
      token: 'f'.repeat(32),
      expiresUtc: new Date(Date.now() + 3_600_000).toISOString(),
    });
    await writeFile(lockFile, held);
    let ran = false;

    await expect(
      withGameLock(script, 'etch corpus test', 240, () => {
        ran = true;
        return Promise.resolve();
      }),
    ).rejects.toThrow("The lab game lock is held by 'lab series'");

    expect(ran).toBe(false);
    expect((await calls()).map((c) => c.call)).toEqual(['Enter-LabGameLock']);
    expect(await readFile(lockFile, 'utf8')).toBe(held);
    expect(process.env[GAME_LOCK_VARIABLE]).toBeUndefined();
  }, 30_000);

  it('keeps the lock of the batch it was started under, and leaves it to the batch', async () => {
    const { script, lockFile, profile, calls } = await fixture();
    const token = 'b'.repeat(32);
    await writeFile(
      lockFile,
      JSON.stringify({
        owner: 'lab batch',
        token,
        expiresUtc: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    process.env[GAME_LOCK_VARIABLE] = token;

    await withGameLock(script, 'etch corpus test', 240, async (lock) => {
      expect(lock).toMatchObject({ token, owner: 'lab batch', inherited: true });
      await gameScript(script).start(profile, undefined);
    });

    const all = await calls();
    expect(all.map((c) => c.call)).not.toContain('Enter-LabGameLock');
    expect(all.map((c) => c.call)).not.toContain('Exit-LabGameLock');
    expect(all.find((c) => c.call === 'Start-LabGame')?.token).toBe(token);
    expect(await exists(lockFile)).toBe(true);
    expect(process.env[GAME_LOCK_VARIABLE]).toBe(token);
  }, 30_000);
});
