/**
 * The driver's side of `game.ps1`: one PowerShell 7 process per action, whose last output line is
 * one JSON object, and the lab's game lock that a whole run holds (corpus/README.md).
 */
import { execFile, execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameLauncher, GameRecord, StopResult } from './run.ts';
import type { CursorState } from './view.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** The lab's variable: a process whose value is the lock's token belongs to that lock. */
export const GAME_LOCK_VARIABLE = 'EU4LAB_GAME_LOCK_TOKEN';

/** Where the lab is (its `scripts/lib/LabProcess.psm1`) and the capture host install. */
export interface GameScript {
  readonly lab: string;
  readonly hostDir: string;
}

export function scriptArgs(script: GameScript, args: readonly string[]): string[] {
  return [
    '-NoProfile',
    '-NonInteractive',
    '-File',
    join(here, 'game.ps1'),
    '-Lab',
    script.lab,
    '-HostDir',
    script.hostDir,
    ...args,
  ];
}

/** Runs one action; the child gets this process's environment, the lock's token with it. */
export function runGameScript(
  script: GameScript,
  args: readonly string[],
): Promise<Record<string, unknown>> {
  return new Promise((ok, fail) => {
    execFile(
      'pwsh',
      scriptArgs(script, args),
      { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const last = stdout.trim().split(/\r?\n/).pop() ?? '';
        if (error !== null) {
          fail(
            new Error(
              `game.ps1 ${args.join(' ')} failed: ${stderr.trim() || last || error.message}`,
            ),
          );
          return;
        }
        try {
          ok(JSON.parse(last) as Record<string, unknown>);
        } catch {
          fail(new Error(`game.ps1 ${args.join(' ')} printed no JSON: ${last}`));
        }
      },
    );
  });
}

export function gameScript(script: GameScript): GameLauncher {
  const run = (args: string[]): Promise<Record<string, unknown>> => runGameScript(script, args);
  return {
    async check() {
      const answer = await run(['-Action', 'Check']);
      return String(answer['copyExe']);
    },
    async start(profile, save) {
      const answer = await run([
        '-Action',
        'Start',
        '-ProfileDir',
        profile,
        ...(save !== undefined ? ['-Save', save] : []),
      ]);
      return answer as unknown as GameRecord;
    },
    mouse: {
      read: async () => cursorState(await run(['-Action', 'Cursor'])),
      pin: async (x, y) =>
        cursorState(await run(['-Action', 'Pin', '-X', String(x), '-Y', String(y)])),
      async release() {
        await run(['-Action', 'Release']);
      },
    },
    async stop(record) {
      const { writeFile, mkdtemp } = await import('node:fs/promises');
      const { tmpdir } = await import('node:os');
      const file = join(await mkdtemp(join(tmpdir(), 'etch-capture-')), 'game.json');
      await writeFile(file, JSON.stringify(record));
      return (await run(['-Action', 'Stop', '-Record', file])) as StopResult;
    },
  };
}

function cursorState(answer: Record<string, unknown>): CursorState {
  if (typeof answer['unavailable'] === 'string') return { unavailable: answer['unavailable'] };
  const clip = answer['clip'] as Record<string, unknown> | undefined;
  return {
    x: Number(answer['x']),
    y: Number(answer['y']),
    clip: {
      left: Number(clip?.['left']),
      top: Number(clip?.['top']),
      right: Number(clip?.['right']),
      bottom: Number(clip?.['bottom']),
    },
  };
}

/** The lab's game lock as a run holds it. */
export interface GameLock {
  readonly token: string;
  readonly owner: string;
  /** The run was started under a batch's lock and holds that one; releasing leaves it held. */
  readonly inherited: boolean;
  readonly expiresAt: Date;
  /** Gives the lock back (once) and puts back the variable this process had before. */
  release(): Promise<void>;
  /** The same for a signal handler, where nothing asynchronous runs any more. */
  releaseSync(): void;
}

/**
 * Takes the lab's game lock for this process (`game.ps1 -Action Lock`), held until it is released
 * or this process exits, and sets `EU4LAB_GAME_LOCK_TOKEN` so that every `game.ps1` the run
 * starts belongs to it. Rejects with the lab's message when another session holds it.
 */
export async function enterGameLock(
  script: GameScript,
  owner: string,
  minutes: number,
): Promise<GameLock> {
  const answer = await runGameScript(script, [
    '-Action',
    'Lock',
    '-Owner',
    owner,
    '-Minutes',
    String(minutes),
    '-HolderPid',
    String(process.pid),
  ]);
  const token = String(answer['token']);
  const inherited = answer['inherited'] === true;
  const previous = process.env[GAME_LOCK_VARIABLE];
  process.env[GAME_LOCK_VARIABLE] = token;
  let released = false;
  const unlock = ['-Action', 'Unlock', '-Token', token];
  const restore = (): boolean => {
    if (released) return false;
    released = true;
    if (process.env[GAME_LOCK_VARIABLE] === token) {
      if (previous === undefined) Reflect.deleteProperty(process.env, GAME_LOCK_VARIABLE);
      else process.env[GAME_LOCK_VARIABLE] = previous;
    }
    return !inherited;
  };
  return {
    token,
    owner: String(answer['owner']),
    inherited,
    expiresAt: new Date(String(answer['expiresUtc'])),
    async release() {
      if (restore()) await runGameScript(script, unlock);
    },
    releaseSync() {
      if (restore()) execFileSync('pwsh', scriptArgs(script, unlock), { windowsHide: true });
    },
  };
}

/** Runs `body` under the run's game lock and releases it on every path out of `body`. */
export async function withGameLock<T>(
  script: GameScript,
  owner: string,
  minutes: number,
  body: (lock: GameLock) => Promise<T>,
): Promise<T> {
  const lock = await enterGameLock(script, owner, minutes);
  try {
    return await body(lock);
  } finally {
    await lock.release();
  }
}

/**
 * What Ctrl+C does: Node ends before any `finally` runs, and the mouse clip and the lock outlive
 * the process (the lock only until the lab sees its holder gone). So the handler releases the
 * mouse, then the lock, each on its own, and exits.
 */
export function interruptHandler(steps: {
  readonly releaseMouse: () => void;
  readonly lock: () => GameLock | undefined;
  readonly exit: (code: number) => void;
  readonly print: (line: string) => void;
}): (signal: string) => void {
  return (signal) => {
    try {
      steps.releaseMouse();
      steps.print(`${signal}: the mouse is released.`);
    } catch {
      steps.print(`${signal}: the mouse could not be released; press Ctrl+Alt+Del.`);
    }
    const lock = steps.lock();
    try {
      lock?.releaseSync();
      if (lock !== undefined && !lock.inherited)
        steps.print(`${signal}: the game lock is released.`);
    } catch {
      steps.print(
        `${signal}: the game lock could not be released; the lab drops it with this process.`,
      );
    }
    steps.exit(130);
  };
}
