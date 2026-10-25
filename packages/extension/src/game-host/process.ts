// The game host process (spec section 4, ADR 0003, etch#49): one per machine through a lock file,
// started from the game host install with a fresh session id, ready once `anvil-game.ready` is
// reported over a pipe whose handshake names that process, kept behind VS Code, and closed only
// after its PID, path and creation time match what Etch started. Node only, no vscode.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PreparedInstall } from './install.ts';
import { HostPipe, PipeError, newSessionId, type Hello } from './pipe.ts';
import {
  childProcesses,
  creationUnixMs,
  foregroundWindow,
  keepBehind,
  normalizePath,
  processIdentity,
  sameIdentity,
  stopVerified,
  type GameWindow,
  type ProcessIdentity,
  type StopOutcome,
} from './windows.ts';

/** The game's crash reporter, closed without sending a report (spec section 1). */
export const CRASH_REPORTER = 'CrashReporter.exe';

/** Steam's ids, without which `eu4.exe` started outside Steam would hand itself to Steam. */
const STEAM_ENVIRONMENT = { SteamAppId: '236850', SteamGameId: '236850' };

/** The lock file: who owns the machine's one game host, and which game process it started. */
export interface HostLock {
  readonly formatVersion: 1;
  /** The extension host that owns the game host. */
  readonly owner: ProcessIdentity;
  readonly session: string;
  /** The game process, once it is started. */
  readonly game?: ProcessIdentity;
  /** The folder the game's executables run from, for its crash reporter. */
  readonly gameFolder?: string;
}

export function lockPath(storageFolder: string): string {
  return join(storageFolder, 'game-host.lock');
}

/** Another VS Code window owns the game host. */
export class HostBusyError extends Error {
  constructor() {
    super('Another VS Code window runs the game host; Etch runs one game host per machine.');
    this.name = 'HostBusyError';
  }
}

export interface LockOptions {
  readonly path: string;
  readonly owner: ProcessIdentity;
  readonly log?: (message: string) => void;
}

/**
 * Takes the lock for a new session. A lock whose owner still runs is another window's game host:
 * `HostBusyError`. A lock whose owner is gone (VS Code crashed) names an orphan, which is closed
 * after its identity is checked, together with its crash reporter, before the lock is taken.
 */
export async function acquireLock(options: LockOptions, session: string): Promise<void> {
  const lock: HostLock = { formatVersion: 1, owner: options.owner, session };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await writeFile(options.path, `${JSON.stringify(lock, null, 2)}\n`, { flag: 'wx' });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if ((await clearLock(options)) === 'busy') throw new HostBusyError();
  }
  throw new Error(`The game host lock ${options.path} could not be taken.`);
}

/**
 * Closes the game host a VS Code window that is gone left running, if the lock names one, and
 * removes its lock. True when it found one.
 */
export async function closeOrphan(options: LockOptions): Promise<boolean> {
  const held = await readLock(options.path);
  if (held === undefined) return false;
  return (await clearLock(options)) === 'cleared';
}

/** Whether a live extension host other than this one holds the lock. */
export async function lockHeldElsewhere(options: LockOptions): Promise<boolean> {
  const held = await readLock(options.path);
  if (held === undefined) return (await lockAgeMs(options.path)) < FRESH_LOCK_MS;
  if (sameIdentity(held.owner, options.owner)) return false;
  return isAlive(held.owner);
}

/** A lock younger than this that cannot be read yet is being written by another window. */
const FRESH_LOCK_MS = 10_000;

/**
 * Looks at a lock that is there: `busy` when a live extension host other than this one holds it
 * (or another window is writing it), else closes the game it names (an orphan, or this extension
 * host's own earlier session) and removes the lock: `cleared`.
 */
async function clearLock(options: LockOptions): Promise<'busy' | 'cleared'> {
  const held = await readLock(options.path);
  if (held === undefined) {
    if ((await lockAgeMs(options.path)) < FRESH_LOCK_MS) return 'busy';
  } else {
    const own = sameIdentity(held.owner, options.owner);
    if (!own && (await isAlive(held.owner))) return 'busy';
    if (held.game !== undefined) {
      if (!own) {
        options.log?.(
          `Closing the game host of a VS Code window that is gone (PID ${String(held.game.pid)}).`,
        );
      }
      const outcome = await closeGame(held.game, held.gameFolder, options.log);
      if (outcome !== 'terminated' && outcome !== 'already-exited') {
        throw new Error(`The orphaned game host could not be closed: ${outcome}.`);
      }
    }
  }
  await unlink(options.path).catch(() => undefined);
  return 'cleared';
}

async function isAlive(identity: ProcessIdentity): Promise<boolean> {
  const now = await processIdentity(identity.pid);
  return now !== undefined && sameIdentity(now, identity);
}

async function lockAgeMs(path: string): Promise<number> {
  return stat(path).then(
    (info) => Date.now() - info.mtimeMs,
    () => Number.POSITIVE_INFINITY,
  );
}

/** The lock's contents, `undefined` when there is none or it cannot be read. */
export async function readLock(path: string): Promise<HostLock | undefined> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8')) as Partial<HostLock> | null;
    return value?.formatVersion === 1 && typeof value.owner?.pid === 'number'
      ? (value as HostLock)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Releases the lock if this owner holds it. */
export async function releaseLock(options: LockOptions): Promise<void> {
  const held = await readLock(options.path);
  if (held === undefined || sameIdentity(held.owner, options.owner)) {
    await unlink(options.path).catch(() => undefined);
  }
}

/**
 * Closes a game host process after checking its identity, then any crash reporter it started,
 * each after the same check; no report is sent.
 */
export async function closeGame(
  game: ProcessIdentity,
  gameFolder: string | undefined,
  log?: (message: string) => void,
): Promise<StopOutcome> {
  const outcome = await stopVerified(game);
  log?.(`Game host PID ${String(game.pid)}: ${outcome}.`);
  await closeCrashReporters(game, gameFolder, log);
  return outcome;
}

async function closeCrashReporters(
  game: ProcessIdentity,
  gameFolder: string | undefined,
  log?: (message: string) => void,
): Promise<void> {
  const folders = [dirname(game.imagePath), ...(gameFolder === undefined ? [] : [gameFolder])].map(
    (f) => `${normalizePath(f)}\\`,
  );
  for (const reporter of await childProcesses(game, CRASH_REPORTER)) {
    const path = normalizePath(reporter.imagePath);
    if (!folders.some((folder) => path.startsWith(folder))) {
      log?.(`Left ${reporter.imagePath} (PID ${String(reporter.pid)}) alone: not the game's.`);
      continue;
    }
    log?.(`Crash reporter PID ${String(reporter.pid)}: ${await stopVerified(reporter)}.`);
  }
}

export interface StartOptions {
  readonly install: PreparedInstall;
  /** The folder the game install's junctions point into, where its crash reporter may run from. */
  readonly originalGameFolder: string;
  readonly lock: LockOptions;
  /** How long the game may take to report `anvil-game.ready`. */
  readonly readyTimeoutMs?: number;
  readonly log?: (message: string) => void;
  /** Cancels the start: the game is closed and the lock released. */
  readonly signal?: AbortSignal;
}

/** Times from process creation, in milliseconds. */
export interface StartTimes {
  readonly pipe: number;
  readonly ready: number;
  /** When the game's window was first found; `undefined` when it never was. */
  readonly window: number | undefined;
  /** How often the window had taken the foreground and was sent behind VS Code. */
  readonly sentBehind: number;
}

const NO_WINDOW: GameWindow = {
  found: false,
  iconic: false,
  wasForeground: false,
  width: 0,
  height: 0,
};

/** A started and ready game host. */
export class GameHostProcess {
  readonly identity: ProcessIdentity;
  readonly session: string;
  readonly hello: Hello;
  readonly times: StartTimes;
  readonly window: GameWindow;
  private readonly pipe: HostPipe;
  private readonly child: ChildProcess;
  private readonly options: StartOptions;
  private readonly exited: Promise<number | null>;
  private stopping: Promise<StopOutcome> | undefined;

  private constructor(fields: {
    identity: ProcessIdentity;
    session: string;
    hello: Hello;
    times: StartTimes;
    window: GameWindow;
    pipe: HostPipe;
    child: ChildProcess;
    options: StartOptions;
    exited: Promise<number | null>;
  }) {
    this.identity = fields.identity;
    this.session = fields.session;
    this.hello = fields.hello;
    this.times = fields.times;
    this.window = fields.window;
    this.pipe = fields.pipe;
    this.child = fields.child;
    this.options = fields.options;
    this.exited = fields.exited;
    // A game that ends by itself (a crash) leaves no reporter and no lock behind.
    void this.exited.then(async () => {
      if (this.stopping === undefined) await this.cleanUp();
    });
  }

  /**
   * Starts the game host and waits until it is ready: takes the lock, starts `eu4.exe` from the
   * install with `ETCH_HOST_SESSION`, records its identity in the lock, greets the plugin (whose
   * `pid` and `process_start_ms` must be the process Etch started), waits for `ready` and sends
   * the window behind VS Code. On any failure the game is closed and the lock released.
   */
  static async start(options: StartOptions): Promise<GameHostProcess> {
    const log = options.log ?? (() => undefined);
    const session = newSessionId();
    await acquireLock(options.lock, session);
    let child: ChildProcess | undefined;
    let identity: ProcessIdentity | undefined;
    let pipe: HostPipe | undefined;
    try {
      const foreground = await foregroundWindow().catch(() => undefined);
      const { install } = options;
      child = spawn(install.exe, [...install.arguments], {
        cwd: install.gameFolder,
        env: { ...process.env, ...STEAM_ENVIRONMENT, ETCH_HOST_SESSION: session },
        stdio: 'ignore',
        windowsHide: false,
      });
      const started = child;
      const exited = new Promise<number | null>((resolve) => {
        started.once('exit', (code) => {
          resolve(code);
        });
      });
      await new Promise<void>((resolve, reject) => {
        started.once('spawn', resolve);
        started.once('error', reject);
      });
      if (started.pid === undefined) throw new Error('The game host did not start.');
      identity = await processIdentity(started.pid);
      if (identity === undefined) throw new Error('The game host exited at once.');
      // Windows reports the image's final path, after any junction or link on the way.
      const expected = await realpath(install.exe);
      if (normalizePath(identity.imagePath) !== normalizePath(expected)) {
        throw new Error(`PID ${String(started.pid)} is ${identity.imagePath}, not the game host.`);
      }
      await writeFile(
        options.lock.path,
        `${JSON.stringify(
          {
            formatVersion: 1,
            owner: options.lock.owner,
            session,
            game: identity,
            gameFolder: options.originalGameFolder,
          } satisfies HostLock,
          null,
          2,
        )}\n`,
      );
      log(`Game host started: PID ${String(identity.pid)}, session ${session}.`);

      const created = creationUnixMs(identity);
      const deadline = Date.now() + (options.readyTimeoutMs ?? 120_000);
      let alive = true;
      void exited.then(() => {
        alive = false;
      });
      const check = (): void => {
        if (!alive) throw new Error('The game host exited while it started.');
        if (options.signal?.aborted === true) throw new Error('The game host start was cancelled.');
        if (Date.now() > deadline) throw new Error('The game host did not get ready in time.');
      };
      let pipeMs: number | undefined;
      for (;;) {
        check();
        try {
          pipe = await HostPipe.connect(session);
          pipeMs = Date.now() - created;
          break;
        } catch (error) {
          if (!(error instanceof PipeError) || error.code !== 'no_pipe') throw error;
          await delay(100);
        }
      }
      const { hello } = pipe;
      if (hello.pid !== identity.pid || Math.abs(hello.process_start_ms - created) > 1) {
        throw new Error(
          `The pipe answered for PID ${String(hello.pid)} started at ${String(hello.process_start_ms)}, ` +
            `not the game host (PID ${String(identity.pid)} at ${String(created)}).`,
        );
      }
      log(`Game host pipe up after ${String(pipeMs)} ms: plugin ${hello.plugin}.`);
      // The game's window takes the foreground when it appears and may take it again while the
      // game loads: it goes behind VS Code each time, and is never left minimised.
      const game = identity;
      let windowMs: number | undefined;
      let sentBehind = 0;
      const behind = async (): Promise<GameWindow | undefined> => {
        const found = await keepBehind(game, foreground).catch(() => undefined);
        if (found?.found === true) {
          windowMs ??= Date.now() - created;
          if (found.wasForeground) sentBehind++;
        }
        return found;
      };
      let ready = hello.ready;
      while (!ready) {
        check();
        await Promise.all([delay(250), behind()]);
        const answered = pipe.ping();
        try {
          ready = (await answered).ready;
        } catch (error) {
          // A pipe that breaks is most often a game that ends; say so when it does.
          await Promise.race([exited, delay(1_000)]);
          check();
          throw error;
        }
      }
      const readyMs = Date.now() - created;
      const window = (await behind()) ?? NO_WINDOW;
      log(
        `Game host ready after ${String(readyMs)} ms; window ${String(window.width)}×${String(window.height)} ` +
          `from ${String(windowMs)} ms, sent behind VS Code ${String(sentBehind)} times` +
          `${window.iconic ? ', restored' : ''}.`,
      );
      return new GameHostProcess({
        identity,
        session,
        hello,
        times: { pipe: pipeMs, ready: readyMs, window: windowMs, sentBehind },
        window,
        pipe,
        child,
        options,
        exited,
      });
    } catch (error) {
      pipe?.close();
      if (identity !== undefined) await closeGame(identity, options.originalGameFolder, log);
      else if (child?.exitCode === null) child.kill();
      await releaseLock(options.lock);
      throw error;
    }
  }

  /** Resolves with the exit code when the game process ends, however it ends. */
  get onExit(): Promise<number | null> {
    return this.exited;
  }

  get alive(): boolean {
    return this.child.exitCode === null && this.child.signalCode === null;
  }

  ping() {
    return this.pipe.ping();
  }

  /** Sends one request over the session pipe (docs/plugin-protocol.md). */
  request(body: { type: string } & Record<string, unknown>, timeoutMs?: number) {
    return this.pipe.request(body, timeoutMs);
  }

  /** Sends the game's window behind VS Code again and restores it if it was minimised. */
  keepBehind(foreground?: string): Promise<GameWindow> {
    return keepBehind(this.identity, foreground);
  }

  /** Closes the game after checking its identity, and its crash reporter; releases the lock. */
  stop(): Promise<StopOutcome> {
    this.stopping ??= (async () => {
      this.pipe.close();
      const outcome = await closeGame(
        this.identity,
        this.options.originalGameFolder,
        this.options.log,
      );
      await this.cleanUp();
      return outcome;
    })();
    return this.stopping;
  }

  private async cleanUp(): Promise<void> {
    this.pipe.close();
    await closeCrashReporters(
      this.identity,
      this.options.originalGameFolder,
      this.options.log,
    ).catch((error: unknown) => {
      this.options.log?.(`Crash reporters not checked: ${String(error)}`);
    });
    await releaseLock(this.options.lock);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
