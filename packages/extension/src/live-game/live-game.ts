import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { ErrorLogTail } from './error-log.ts';
import {
  copySize,
  gameHostLayout,
  installExists,
  prepareInstall,
  privateInstallLayout,
  removeInstall,
  type InstallLayout,
  type LiveGameDisplay,
  type LiveGameMod,
  type PreparedInstall,
} from './install.ts';
import {
  HostBusyError,
  HostCrashedError,
  LiveGameProcess,
  closeOrphan,
  lockHeldElsewhere,
  lockPath,
  readLock,
  type LockOptions,
} from './process.ts';
import {
  CRASH_LIMIT,
  CRASH_WINDOW_MS,
  CrashLimit,
  RestartQueue,
  errorLogPath,
  logTail,
  watch as watchHang,
} from './watchdog.ts';
import { processIdentity, type ProcessIdentity } from './windows.ts';

/**
 * The private install in the extension's global storage: created on first use after one
 * confirmation, checked and brought up to date before every start, and removed by command. One
 * operation runs at a time.
 */
export class PrivateInstall {
  readonly layout: InstallLayout;
  private readonly storageFolder: string;
  private readonly buildsFolder: string;
  private readonly output: vscode.LogOutputChannel;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(storageFolder: string, buildsFolder: string, output: vscode.LogOutputChannel) {
    this.layout = privateInstallLayout(storageFolder);
    this.storageFolder = storageFolder;
    this.buildsFolder = buildsFolder;
    this.output = output;
  }

  /**
   * The install ready for a start with this playset, or `undefined` when the player declined to
   * create it. Throws `PrivateInstallError` when it cannot be used, such as for an `eu4.exe` other
   * than the pinned build.
   */
  prepare(
    gameFolder: string,
    mods: readonly LiveGameMod[],
    display: LiveGameDisplay,
  ): Promise<PreparedInstall | undefined> {
    return this.serial(async () => {
      if (!(await installExists(this.layout)) && !(await this.confirmCreate(gameFolder))) {
        return undefined;
      }
      const started = performance.now();
      const prepared = await prepareInstall({
        layout: this.layout,
        gameFolder,
        buildsFolder: this.buildsFolder,
        mods,
        display,
      });
      if (prepared.restored.length > 0) {
        this.output.warn(`Private install: installed again ${prepared.restored.join(', ')}`);
      }
      this.output.info(
        `Private install ready in ${String(Math.round(performance.now() - started))} ms: ${this.layout.root}`,
      );
      return prepared;
    });
  }

  /** Removes the install; false when there was none. */
  remove(): Promise<boolean> {
    return this.serial(async () => {
      const removed = await removeInstall(this.layout);
      if (removed) this.output.info(`Private install removed: ${this.layout.root}`);
      return removed;
    });
  }

  /**
   * Removes Etch 1.x's game host install and its images, through the same removal (ADR 0005);
   * false when there was none.
   */
  removeGameHostInstall(): Promise<boolean> {
    return this.serial(async () => {
      const layout = gameHostLayout(this.storageFolder);
      const removed = await removeInstall(layout);
      await rm(join(this.storageFolder, 'captures'), { recursive: true, force: true });
      if (removed) this.output.info(`Etch 1.x's game host install removed: ${layout.root}`);
      return removed;
    });
  }

  private async confirmCreate(gameFolder: string): Promise<boolean> {
    const megabytes = Math.ceil((await copySize(gameFolder)) / 1e6);
    const create = 'Create';
    const answer = await vscode.window.showInformationMessage(
      'Create the private install?',
      {
        modal: true,
        detail:
          `The live game runs a private copy of EU4 in Etch's storage: links to the game's folders, ` +
          `a copy of its top-level files (about ${String(megabytes)} MB), Anvil, Bellows and Etch's ` +
          `plugin, and a profile of its own. Your game folder, profile and mods are not changed. ` +
          `Etch: Remove the Private Install removes it again.`,
      },
      create,
    );
    return answer === create;
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** What the live game is doing. */
export type LiveGameState =
  | { readonly status: 'stopped' }
  | { readonly status: 'starting' }
  | { readonly status: 'ready'; readonly pid: number; readonly readyMs: number }
  /** It restarts after a crash (spec section 6). */
  | { readonly status: 'restarting'; readonly reason: string }
  | { readonly status: 'stopping' }
  /** Another VS Code window runs the machine's live game. */
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly message: string };

/**
 * What a start of the live game needs: the player's game folder, which the install links to, the
 * playset in load order and the display.
 */
export interface LiveGameRequest {
  readonly gameFolder: string;
  readonly mods: readonly LiveGameMod[];
  readonly display: LiveGameDisplay;
}

/** The restart reason of a start that is not a restart. */
const START = 'start';

/**
 * The machine's one live game, owned by this VS Code window: started on request, stopped by
 * command or when the window closes (`stop` from `deactivate`). Its watchdog (etch#51) restarts it
 * after a dead process or a hang, and stops it after `CRASH_LIMIT` crashes in `CRASH_WINDOW_MS`
 * until a manual start. A start, a restart, a stop and a removal of the install never overlap.
 * Saves, the player's settings and the reload policy come with M8 (spec section 13).
 */
export class LiveGame implements vscode.Disposable {
  readonly install: PrivateInstall;
  private readonly output: vscode.LogOutputChannel;
  private readonly lockFile: string;
  private readonly emitter = new vscode.EventEmitter<LiveGameState>();
  private readonly restarts = new RestartQueue((take) => this.cycle(take));
  private readonly crashes = new CrashLimit();
  private current: LiveGameState = { status: 'stopped' };
  private process: LiveGameProcess | undefined;
  /** What the live game starts with: the latest start's request. */
  private wanted: LiveGameRequest | undefined;
  /** Cancels the start or restart that runs. */
  private abort: AbortController | undefined;
  /** Ends the hang watch of the running process. */
  private watching: AbortController | undefined;
  private owner: Promise<ProcessIdentity> | undefined;

  readonly onDidChangeState = this.emitter.event;

  constructor(storageFolder: string, buildsFolder: string, output: vscode.LogOutputChannel) {
    this.install = new PrivateInstall(storageFolder, buildsFolder, output);
    this.output = output;
    this.lockFile = lockPath(storageFolder);
  }

  get state(): LiveGameState {
    return this.current;
  }

  /** The running game process, for Etch's own tests. */
  get running(): LiveGameProcess | undefined {
    return this.process;
  }

  /** Whether the live game runs, starts or restarts. */
  private get active(): boolean {
    return this.process !== undefined || this.restarts.busy;
  }

  /**
   * Starts the live game (a manual start, which forgets earlier crashes) and waits until it is
   * ready or the start failed (see `state`). A live game that runs already keeps running.
   */
  start(request: LiveGameRequest): Promise<void> {
    if (this.active) return this.restarts.idle();
    this.wanted = request;
    this.crashes.reset();
    this.restarts.request(START);
    return this.restarts.idle();
  }

  /** Stops the live game (also one still starting or restarting); false when there was none. */
  async stop(): Promise<boolean> {
    const wasStarting = this.restarts.busy;
    this.restarts.clear();
    this.abort?.abort();
    await this.restarts.idle();
    const running = this.process;
    if (running === undefined) {
      if (this.current.status !== 'busy') this.set({ status: 'stopped' });
      return wasStarting;
    }
    this.release();
    this.set({ status: 'stopping' });
    const outcome = await running.stop();
    if (outcome === 'terminated' || outcome === 'already-exited') {
      this.output.info('The live game stopped.');
      this.set({ status: 'stopped' });
    } else {
      this.set({ status: 'failed', message: `The live game could not be closed: ${outcome}.` });
    }
    return true;
  }

  /** Stops the live game, then removes its install; refuses while another window runs it. */
  async removeInstall(): Promise<boolean> {
    await this.stop();
    if (await lockHeldElsewhere(await this.lockOptions())) throw new HostBusyError();
    return this.install.remove();
  }

  /**
   * Removes Etch 1.x's game host install, unless a 1.x window still runs its game host; false
   * when nothing was removed.
   */
  async removeGameHostInstall(): Promise<boolean> {
    if (await lockHeldElsewhere(await this.lockOptions())) return false;
    return this.install.removeGameHostInstall();
  }

  /** Closes a live game (or 1.x game host) that a VS Code window which is gone left running. */
  async closeOrphan(): Promise<void> {
    try {
      // Most activations find no lock, and need no identity of their own.
      if ((await readLock(this.lockFile)) === undefined) return;
      await closeOrphan(await this.lockOptions());
    } catch (error) {
      this.output.error(`An orphaned live game was not closed: ${String(error)}`);
    }
  }

  dispose(): void {
    void this.stop();
    this.emitter.dispose();
  }

  /**
   * One start or restart: closes the running process, takes the restarts asked for so far and
   * starts the live game with the latest request. False when it should stay down.
   */
  private async cycle(take: () => readonly string[]): Promise<boolean> {
    const abort = new AbortController();
    this.abort = abort;
    try {
      const old = this.process;
      if (old !== undefined) {
        this.release();
        const outcome = await old.stop();
        if (outcome !== 'terminated' && outcome !== 'already-exited') {
          this.set({ status: 'failed', message: `The live game could not be closed: ${outcome}.` });
          return false;
        }
      }
      const request = this.wanted;
      if (abort.signal.aborted || request === undefined) return false;
      const reasons = take().filter((reason) => reason !== START);
      this.set(
        reasons.length > 0
          ? { status: 'restarting', reason: reasons.join('; ') }
          : { status: 'starting' },
      );
      return await this.startProcess(request, abort.signal);
    } finally {
      if (this.abort === abort) this.abort = undefined;
    }
  }

  private async startProcess(request: LiveGameRequest, signal: AbortSignal): Promise<boolean> {
    try {
      const prepared = await this.install.prepare(
        request.gameFolder,
        request.mods,
        request.display,
      );
      if (prepared === undefined) {
        this.set({ status: 'failed', message: 'The private install was not created.' });
        return false;
      }
      if (signal.aborted) return false;
      const started = await LiveGameProcess.start({
        install: prepared,
        originalGameFolder: request.gameFolder,
        lock: await this.lockOptions(),
        log: (message) => {
          this.output.info(message);
        },
        signal,
      });
      this.process = started;
      const startLines = await new ErrorLogTail(errorLogPath(prepared.profileFolder)).skip();
      this.output.info(`The live game's error.log had ${String(startLines)} lines at ready.`);
      this.watch(started);
      this.set({ status: 'ready', pid: started.identity.pid, readyMs: started.times.ready });
      return true;
    } catch (error) {
      if (signal.aborted) return false;
      if (error instanceof HostBusyError) {
        this.set({ status: 'busy' });
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      // A game that dies or hangs while it starts is a crash: it starts again, up to the limit.
      if (error instanceof HostCrashedError) return this.crashed(message);
      this.output.error(`The live game did not start: ${message}`);
      this.set({ status: 'failed', message });
      return false;
    }
  }

  /**
   * Watches the started process: an exit Etch did not ask for, and a hang, are crashes. Once a
   * restart is asked for, the process is about to be closed anyway: nothing more counts.
   */
  private watch(started: LiveGameProcess): void {
    const watching = new AbortController();
    this.watching = watching;
    void started.onExit.then(async (code) => {
      if (!this.serving(started)) return;
      this.release();
      await this.crashed(`the game exited (exit code ${String(code)})`);
    });
    void watchHang(started, { signal: watching.signal }).then(async (hang) => {
      if (!this.serving(started)) return;
      await this.crashed(`the game hangs: ${hang}`);
    });
  }

  /** Whether `process` is the ready live game, with no restart asked for. */
  private serving(process: LiveGameProcess): boolean {
    return this.process === process && this.current.status === 'ready';
  }

  /**
   * A crash: restarts the live game, or after `CRASH_LIMIT` crashes in `CRASH_WINDOW_MS` stops it
   * with the end of `error.log`. False when it stopped.
   */
  private async crashed(reason: string): Promise<boolean> {
    this.output.warn(`The live game crashed: ${reason}.`);
    if (!this.crashes.crash(performance.now())) {
      this.restarts.request(reason);
      this.set({ status: 'restarting', reason });
      return true;
    }
    // From a running start the cycle ends by returning false; from the watch, nothing runs.
    this.restarts.clear();
    const running = this.process;
    this.release();
    if (running !== undefined) await running.stop();
    const tail = await logTail(errorLogPath(this.install.layout.profile));
    const message =
      `It crashed ${String(CRASH_LIMIT)} times in ${String(CRASH_WINDOW_MS / 60_000)} minutes ` +
      `(last: ${reason}) and stays stopped until it is started again. ` +
      (tail.length === 0
        ? 'error.log has no lines.'
        : `The end of error.log:\n${tail.map((line) => `  ${line}`).join('\n')}`);
    this.output.error(`The live game stopped. ${message}`);
    this.set({ status: 'failed', message });
    return false;
  }

  /** Lets go of the running process: its hang watch ends. */
  private release(): void {
    this.process = undefined;
    this.watching?.abort();
    this.watching = undefined;
  }

  private async lockOptions(): Promise<LockOptions> {
    this.owner ??= processIdentity(process.pid).then((identity) => {
      if (identity === undefined) throw new Error("The extension host's identity cannot be read.");
      return identity;
    });
    return {
      path: this.lockFile,
      owner: await this.owner,
      log: (message) => {
        this.output.info(message);
      },
    };
  }

  private set(state: LiveGameState): void {
    if (JSON.stringify(state) === JSON.stringify(this.current)) return;
    this.current = state;
    this.emitter.fire(state);
  }
}
