// The live game process (spec section 6, ADR 0005, etch#49, kept from 1.x's game host): one per
// machine through a lock file, started from the private install with a fresh session id, ready
// once `anvil-game.ready` is reported over a pipe whose handshake names that process, run in the
// foreground as the player's game, and closed only after its PID, path and creation time match
// what Etch started. Node only, no vscode.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, realpath, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PreparedInstall } from './install.ts';
import {
  HostPipe,
  PipeError,
  newSessionId,
  type Hello,
  type PickModeRequest,
  type PipeEvent,
  type ReloadRequest,
} from './pipe.ts';
import {
  childProcesses,
  creationUnixMs,
  normalizePath,
  processIdentity,
  processesNamed,
  sameIdentity,
  stopVerified,
  type ProcessIdentity,
  type StopOutcome,
} from './windows.ts';
import { PING_TIMEOUT_MS, SILENT_MS } from './watchdog.ts';

/** The game's crash reporter, closed without sending a report (spec section 1). */
export const CRASH_REPORTER = 'CrashReporter.exe';

/** Steam's ids, without which `eu4.exe` started outside Steam would hand itself to Steam. */
const STEAM_ENVIRONMENT = { SteamAppId: '236850', SteamGameId: '236850' };

/**
 * How long the plugin's pipe may take to come up: Anvil loads it in its main phase, a few hundred
 * milliseconds after the process starts (live), long before the game's own loading.
 */
export const PIPE_TIMEOUT_MS = 120_000;
/** How long a start may take before the player is offered to stop it; it is not ended. */
export const SLOW_START_MS = 120_000;
/** How often a start that is not ready yet is logged. */
const START_PROGRESS_MS = 30_000;

/**
 * The live game's environment: this process's, with Steam's ids and the session id, and without
 * the `ANVIL_TONGS_*` overrides of Tongs' settings, which could open its pipe (spec section 6).
 */
export function gameEnvironment(
  base: NodeJS.ProcessEnv,
  session: string,
): Record<string, string | undefined> {
  const env = Object.fromEntries(
    Object.entries(base).filter(([name]) => !name.toUpperCase().startsWith('ANVIL_TONGS_')),
  );
  return { ...env, ...STEAM_ENVIRONMENT, ETCH_HOST_SESSION: session };
}

/** The lock file: who owns the machine's one live game, and which game process it started. */
export interface HostLock {
  readonly formatVersion: 1;
  /** The extension host that owns the live game. */
  readonly owner: ProcessIdentity;
  readonly session: string;
  /** The game process, once it is started. */
  readonly game?: ProcessIdentity;
  /** The folder the game's executables run from, for its crash reporter. */
  readonly gameFolder?: string;
}

/** 1.x's lock file name, kept so that a 1.x game host and the live game never run together. */
export function lockPath(storageFolder: string): string {
  return join(storageFolder, 'game-host.lock');
}

/**
 * The game ended while it started, or its plugin stopped answering: a crash for the watchdog
 * (etch#51), unlike a start Etch refused or cancelled.
 */
export class HostCrashedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostCrashedError';
  }
}

/** Another VS Code window owns the live game. */
export class HostBusyError extends Error {
  constructor() {
    super('Another VS Code window runs the live game; Etch runs one live game per machine.');
    this.name = 'HostBusyError';
  }
}

export interface LockOptions {
  readonly path: string;
  readonly owner: ProcessIdentity;
  readonly log?: (message: string) => void;
}

/**
 * Takes the lock for a new session. A lock whose owner still runs is another window's live game:
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
  throw new Error(`The live game lock ${options.path} could not be taken.`);
}

/**
 * Closes the live game a VS Code window that is gone left running, if the lock names one, and
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
          `Closing the live game of a VS Code window that is gone (PID ${String(held.game.pid)}).`,
        );
      }
      const outcome = await closeGame(held.game, held.gameFolder, options.log);
      if (outcome !== 'terminated' && outcome !== 'already-exited') {
        throw new Error(`The orphaned live game could not be closed: ${outcome}.`);
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
 * Closes a live game process after checking its identity, then any crash reporter it started,
 * each after the same check; no report is sent.
 */
export async function closeGame(
  game: ProcessIdentity,
  gameFolder: string | undefined,
  log?: (message: string) => void,
): Promise<StopOutcome> {
  const outcome = await stopVerified(game);
  log?.(`Live game PID ${String(game.pid)}: ${outcome}.`);
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
  /**
   * How long the plugin's pipe may take to come up (`PIPE_TIMEOUT_MS` when not given). Once it is
   * up there is no limit to the start: a game that loads for minutes keeps loading (spec section 6).
   */
  readonly pipeTimeoutMs?: number;
  /** How long pings may go unanswered while the game starts (`SILENT_MS` when not given). */
  readonly silentMs?: number;
  /** Called once when the start takes `SLOW_START_MS`, so that the player can stop it. */
  readonly onSlow?: () => void;
  readonly log?: (message: string) => void;
  /** Cancels the start: the game is closed and the lock released. */
  readonly signal?: AbortSignal;
}

/** Times from process creation, in milliseconds. */
export interface StartTimes {
  readonly pipe: number;
  readonly ready: number;
}

/**
 * The game a live game starts of itself on Exit to Main Menu may run without Anvil (live: it wrote
 * no Anvil log), so its plugin's pipe never comes up: it is not the live game after this long.
 */
const ADOPT_PIPE_TIMEOUT_MS = 15_000;

/** A process the live game started of itself serves no session pipe: it is not the live game. */
export class NotTheLiveGameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotTheLiveGameError';
  }
}

/** How often an adopted process, which is not Node's child, is checked for its exit. */
const ADOPTED_POLL_MS = 1_000;

/** A started and ready live game. */
export class LiveGameProcess {
  readonly identity: ProcessIdentity;
  readonly session: string;
  readonly hello: Hello;
  readonly times: StartTimes;
  private readonly pipe: HostPipe;
  private readonly options: StartOptions;
  private readonly exited: Promise<number | null>;
  private ended = false;
  private stopping: Promise<StopOutcome> | undefined;
  private cleaning: Promise<void> | undefined;

  private constructor(fields: {
    identity: ProcessIdentity;
    session: string;
    hello: Hello;
    times: StartTimes;
    pipe: HostPipe;
    options: StartOptions;
    exited: Promise<number | null>;
  }) {
    this.identity = fields.identity;
    this.session = fields.session;
    this.hello = fields.hello;
    this.times = fields.times;
    this.pipe = fields.pipe;
    this.options = fields.options;
    this.exited = fields.exited;
    void this.exited.then(() => {
      this.ended = true;
      // A game that ends by itself (a crash, a quit) leaves no reporter and no lock behind.
      if (this.stopping === undefined) this.cleaning ??= this.cleanUp();
    });
  }

  /**
   * Starts the live game and waits until it is ready: takes the lock, starts `eu4.exe` from the
   * install with `ETCH_HOST_SESSION`, records its identity in the lock, greets the plugin (whose
   * `pid` and `process_start_ms` must be the process Etch started) and waits for `ready`. The game
   * runs in the foreground, as the player's game. On any failure the game is closed and the lock
   * released.
   */
  static async start(options: StartOptions): Promise<LiveGameProcess> {
    const log = options.log ?? (() => undefined);
    const session = newSessionId();
    await acquireLock(options.lock, session);
    let child: ChildProcess | undefined;
    let identity: ProcessIdentity | undefined;
    try {
      const { install } = options;
      child = spawn(install.exe, [...install.arguments], {
        cwd: install.gameFolder,
        env: gameEnvironment(process.env, session),
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
      if (started.pid === undefined) throw new Error('The live game did not start.');
      identity = await processIdentity(started.pid);
      if (identity === undefined) throw new Error('The live game exited at once.');
      // Windows reports the image's final path, after any junction or link on the way.
      const expected = await realpath(install.exe);
      if (normalizePath(identity.imagePath) !== normalizePath(expected)) {
        throw new Error(`PID ${String(started.pid)} is ${identity.imagePath}, not the live game.`);
      }
      await writeLock(options, session, identity);
      log(`Live game started: PID ${String(identity.pid)}, session ${session}.`);
      return await LiveGameProcess.greet(options, session, identity, exited, log);
    } catch (error) {
      if (identity !== undefined) await closeGame(identity, options.originalGameFolder, log);
      else if (child?.exitCode === null) child.kill();
      await releaseLock(options.lock);
      throw error;
    }
  }

  /**
   * Takes over the process a live game started of itself when it ended through Exit to Main Menu
   * (H6): the same command line and environment, so its plugin serves the same session's pipe. Its
   * image must be the live game's and its plugin must answer for it; then it is recorded in the
   * lock and waited for until ready, like a start. On any failure it is closed and the lock
   * released.
   */
  static async adopt(
    options: StartOptions,
    session: string,
    identity: ProcessIdentity,
  ): Promise<LiveGameProcess> {
    const log = options.log ?? (() => undefined);
    try {
      const expected = await realpath(options.install.exe);
      if (normalizePath(identity.imagePath) !== normalizePath(expected)) {
        throw new Error(`PID ${String(identity.pid)} is ${identity.imagePath}, not the live game.`);
      }
      await writeLock(options, session, identity);
      log(`Live game restarted itself: PID ${String(identity.pid)}, session ${session}.`);
      return await LiveGameProcess.greet(
        { ...options, pipeTimeoutMs: ADOPT_PIPE_TIMEOUT_MS },
        session,
        identity,
        waitForExit(identity),
        log,
      );
    } catch (error) {
      await closeGame(identity, options.originalGameFolder, log);
      await releaseLock(options.lock);
      throw error;
    }
  }

  /**
   * Greets the plugin of a started or adopted process and waits until the game is ready, for as
   * long as the process lives and its plugin answers: a cold start of a big playset takes minutes
   * (the 2.0.0 trial: over two in Anbennar's playset). Logs its progress every
   * `START_PROGRESS_MS`.
   */
  private static async greet(
    options: StartOptions,
    session: string,
    identity: ProcessIdentity,
    exited: Promise<number | null>,
    log: (message: string) => void,
  ): Promise<LiveGameProcess> {
    const created = creationUnixMs(identity);
    let alive = true;
    void exited.then(() => {
      alive = false;
    });
    const check = (): void => {
      if (!alive) throw new HostCrashedError('The live game exited while it started.');
      if (options.signal?.aborted === true) throw new Error('The live game start was cancelled.');
    };
    let pipe: HostPipe | undefined;
    const pipeDeadline = Date.now() + (options.pipeTimeoutMs ?? PIPE_TIMEOUT_MS);
    try {
      let pipeMs: number | undefined;
      for (;;) {
        check();
        if (Date.now() > pipeDeadline) {
          throw new NotTheLiveGameError(
            `PID ${String(identity.pid)} serves no session pipe after ${String(options.pipeTimeoutMs ?? PIPE_TIMEOUT_MS)} ms: it runs without Etch's plugin.`,
          );
        }
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
            `not the live game (PID ${String(identity.pid)} at ${String(created)}).`,
        );
      }
      log(`Live game pipe up after ${String(pipeMs)} ms: plugin ${hello.plugin}.`);
      if (!hello.tree)
        log("Tongs' tongs.ui is missing: reloads run without the stale-window check.");
      let ready = hello.ready;
      const silentMs = options.silentMs ?? SILENT_MS;
      let answered = Date.now();
      let told = Date.now();
      let slow = false;
      while (!ready) {
        check();
        await delay(250);
        try {
          const ping = await pipe.ping(Math.min(silentMs, PING_TIMEOUT_MS));
          ready = ping.ready;
          answered = Date.now();
          if (Date.now() - told >= START_PROGRESS_MS) {
            told = Date.now();
            log(
              `The live game is still starting after ${seconds(Date.now() - created)}: frame ` +
                `${String(ping.frame)}, its window ${ping.responding ? 'responds' : 'does not respond'}.`,
            );
          }
        } catch (error) {
          // A pipe that breaks is most often a game that ends; say so when it does.
          if (!(error instanceof PipeError) || error.code !== 'timeout') {
            await Promise.race([exited, delay(1_000)]);
            check();
            throw error;
          }
          if (Date.now() - answered >= silentMs) {
            check();
            throw new HostCrashedError(
              `Etch's plugin gave no answer to a ping for ${seconds(Date.now() - answered)} while the game started.`,
            );
          }
        }
        if (!slow && Date.now() - created >= SLOW_START_MS) {
          slow = true;
          options.onSlow?.();
        }
      }
      const readyMs = Date.now() - created;
      log(`Live game ready after ${String(readyMs)} ms.`);
      return new LiveGameProcess({
        identity,
        session,
        hello,
        times: { pipe: pipeMs, ready: readyMs },
        pipe,
        options,
        exited,
      });
    } catch (error) {
      pipe?.close();
      throw error;
    }
  }

  /** Resolves with the exit code when the game process ends, however it ends (`null` when unknown). */
  get onExit(): Promise<number | null> {
    return this.exited;
  }

  get alive(): boolean {
    return !this.ended;
  }

  ping(timeoutMs?: number) {
    return this.pipe.ping(timeoutMs);
  }

  reload(request: ReloadRequest, timeoutMs?: number) {
    return this.pipe.reload(request, timeoutMs);
  }

  save(timeoutMs?: number) {
    return this.pipe.save(timeoutMs);
  }

  confirm(path: string, timeoutMs?: number) {
    return this.pipe.confirm(path, timeoutMs);
  }

  pickMode(request: PickModeRequest, timeoutMs?: number) {
    return this.pipe.pickMode(request, timeoutMs);
  }

  snapshot(window: string, timeoutMs?: number) {
    return this.pipe.snapshot(window, timeoutMs);
  }

  /** The plugin's pushes: picks, their snapshots, pick mode changes. Returns what stops them. */
  onEvent(listener: (event: PipeEvent) => void): () => void {
    return this.pipe.onEvent(listener);
  }

  /** Sends one request over the session pipe (docs/plugin-protocol.md). */
  request(body: { type: string } & Record<string, unknown>, timeoutMs?: number) {
    return this.pipe.request(body, timeoutMs);
  }

  /**
   * The process the game started of itself as it ended (Exit to Main Menu, H6): an `eu4.exe` child
   * of this process with the same image, looked for until `withinMs` passes. `undefined` when none
   * came: the game quit.
   */
  async restartedAs(withinMs = 10_000): Promise<ProcessIdentity | undefined> {
    const deadline = Date.now() + withinMs;
    const image = normalizePath(this.identity.imagePath);
    for (;;) {
      const children = await childProcesses(this.identity, GAME_EXE).catch(() => []);
      const child = children.find((c) => normalizePath(c.imagePath) === image);
      if (child !== undefined || Date.now() > deadline) return child;
      await delay(500);
    }
  }

  /** The options the process was started with, to adopt the process it starts of itself. */
  get startOptions(): StartOptions {
    return this.options;
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

  /** Resolves once a process that ended by itself has released the lock and its reporter. */
  async cleanedUp(): Promise<void> {
    await this.exited;
    await (this.stopping ?? this.cleaning);
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

/** The game's executable name, of the live game and of the player's game. */
export const GAME_EXE = 'eu4.exe';

/**
 * The player's own game, if it runs: an `eu4.exe` from their game folder. The live game is not
 * started beside it (spec section 6).
 */
export async function playerGameRunning(gameFolder: string): Promise<ProcessIdentity | undefined> {
  const exe = normalizePath(
    await realpath(join(gameFolder, GAME_EXE)).catch(() => join(gameFolder, GAME_EXE)),
  );
  const running = await processesNamed(GAME_EXE);
  return running.find((p) => normalizePath(p.imagePath) === exe);
}

async function writeLock(
  options: StartOptions,
  session: string,
  identity: ProcessIdentity,
): Promise<void> {
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
}

/** Resolves when a process that is not Node's child ends; its exit code is not known. */
async function waitForExit(identity: ProcessIdentity): Promise<number | null> {
  for (;;) {
    await delay(ADOPTED_POLL_MS);
    const now = await processIdentity(identity.pid).catch(() => identity);
    if (now === undefined || !sameIdentity(now, identity)) return null;
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(0)} s`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
