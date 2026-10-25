import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { Screen } from '@etch/core';
import { JobQueue, pruneCaptures, runJob, type JobChange, type JobOutcome } from './jobs.ts';
import {
  copySize,
  gameHostLayout,
  installExists,
  prepareInstall,
  removeInstall,
  type GameHostLayout,
  type GameHostMod,
  type HostDisplay,
  type PreparedInstall,
} from './install.ts';
import {
  GameHostProcess,
  HostBusyError,
  HostCrashedError,
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
  requestChange,
  watch as watchHang,
  type HostStartRequest,
} from './watchdog.ts';
import { processIdentity, type ProcessIdentity } from './windows.ts';

/**
 * The game host install in the extension's global storage: created on first use after one
 * confirmation, checked and brought up to date before every start, and removed by command. One
 * operation runs at a time.
 */
export class GameHostInstall {
  readonly layout: GameHostLayout;
  private readonly buildsFolder: string;
  private readonly output: vscode.LogOutputChannel;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(storageFolder: string, buildsFolder: string, output: vscode.LogOutputChannel) {
    this.layout = gameHostLayout(storageFolder);
    this.buildsFolder = buildsFolder;
    this.output = output;
  }

  /**
   * The install ready for a start with this playset, or `undefined` when the player declined to
   * create it. Throws `GameHostInstallError` when it cannot be used, such as for an `eu4.exe` other
   * than the pinned build.
   */
  prepare(
    gameFolder: string,
    mods: readonly GameHostMod[],
    display: HostDisplay,
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
        this.output.warn(`Game host install: installed again ${prepared.restored.join(', ')}`);
      }
      this.output.info(
        `Game host install ready in ${String(Math.round(performance.now() - started))} ms: ${this.layout.root}`,
      );
      return prepared;
    });
  }

  /** Removes the install; false when there was none. */
  remove(): Promise<boolean> {
    return this.serial(async () => {
      const removed = await removeInstall(this.layout);
      if (removed) this.output.info(`Game host install removed: ${this.layout.root}`);
      return removed;
    });
  }

  private async confirmCreate(gameFolder: string): Promise<boolean> {
    const megabytes = Math.ceil((await copySize(gameFolder)) / 1e6);
    const create = 'Create';
    const answer = await vscode.window.showInformationMessage(
      'Create the game host install?',
      {
        modal: true,
        detail:
          `The game host runs a private copy of EU4 in Etch's storage: links to the game's folders, ` +
          `a copy of its top-level files (about ${String(megabytes)} MB), Anvil, Bellows and Etch's ` +
          `plugin, and a profile of its own. Your game folder, profile and mods are not changed. ` +
          `Etch: Remove the Game Host Install removes it again.`,
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

/** What the game host is doing, for the preview's notices. */
export type GameHostState =
  | { readonly status: 'stopped' }
  | { readonly status: 'starting' }
  | { readonly status: 'ready'; readonly pid: number; readonly readyMs: number }
  /** It restarts (spec section 4); the preview keeps its last image, marked as stale. */
  | { readonly status: 'restarting'; readonly reason: string }
  | { readonly status: 'stopping' }
  /** Another VS Code window runs the machine's game host. */
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly message: string };

/** Where the game host's images go, in the extension's global storage; the webview reads them. */
export function capturesFolder(storageFolder: string): string {
  return join(storageFolder, 'captures');
}

/**
 * What a game host start needs from the preview: the player's game folder, which the install
 * links to, the playset in load order and the display. A change of it restarts the game host.
 */
export type GameHostRequest = HostStartRequest;

/** How long the game host runs without a game host preview (spec section 4). */
export const IDLE_STOP_MS = 30 * 60_000;

/** The restart reason of a start that is not a restart. */
const START = 'start';

/** How long a restart waits before it closes the game, for more changes to join it. */
const RESTART_SETTLE_MS = 300;

/**
 * The machine's one game host, owned by this VS Code window: started on demand, stopped by
 * command, when the window closes (`stop` from `deactivate`) or after `IDLE_STOP_MS` without a
 * game host preview. Its watchdog (etch#51) restarts it for a start-up-only file, a new request, a
 * dead process, a hang or a console fault, and stops it after `CRASH_LIMIT` crashes in
 * `CRASH_WINDOW_MS` until a manual start. A start, a restart, a stop and a removal of the install
 * never overlap.
 */
export class GameHost implements vscode.Disposable {
  readonly install: GameHostInstall;
  private readonly output: vscode.LogOutputChannel;
  private readonly lockFile: string;
  private readonly emitter = new vscode.EventEmitter<GameHostState>();
  private readonly jobEmitter = new vscode.EventEmitter<JobOutcome>();
  /** The folder the plugin writes job images to. */
  readonly capturesFolder: string;
  private readonly restarts = new RestartQueue((take) => this.cycle(take));
  private readonly crashes = new CrashLimit();
  private jobs: JobQueue | undefined;
  /** The number of the last job of the game host's earlier processes since its manual start. */
  private lastJob = 0;
  /** The screen of the running game host. */
  private display: Screen | undefined;
  private current: GameHostState = { status: 'stopped' };
  private process: GameHostProcess | undefined;
  /** What the game host should run with: the preview's latest request. */
  private wanted: GameHostRequest | undefined;
  /** What the running or starting game host runs with. */
  private runs: GameHostRequest | undefined;
  /** Cancels the start or restart that runs. */
  private abort: AbortController | undefined;
  /** Ends the hang watch of the running process. */
  private watching: AbortController | undefined;
  /** The file whose change the game host was last given, for the crash diagnostic. */
  private lastChange: string | undefined;
  private idle: NodeJS.Timeout | undefined;
  private owner: Promise<ProcessIdentity> | undefined;
  private idleMs = IDLE_STOP_MS;

  readonly onDidChangeState = this.emitter.event;
  /** Fires when a preview job ends, with its image or why there is none. */
  readonly onDidFinishJob = this.jobEmitter.event;

  constructor(storageFolder: string, buildsFolder: string, output: vscode.LogOutputChannel) {
    this.install = new GameHostInstall(storageFolder, buildsFolder, output);
    this.output = output;
    this.lockFile = lockPath(storageFolder);
    this.capturesFolder = capturesFolder(storageFolder);
  }

  /**
   * The game host's screen: the size its preview copies cover and its crops are cut from. While it
   * restarts, the screen it restarts at.
   */
  get screen(): Screen | undefined {
    if (this.process !== undefined) return this.display;
    const runs = this.runs;
    return this.current.status === 'restarting' && runs !== undefined
      ? { width: runs.display.width, height: runs.display.height }
      : undefined;
  }

  /**
   * Hands the running game host a change of the previewed window (spec section 4): one job runs
   * at a time, and later changes coalesce. `file` is the edited file, named if the game host
   * crashes. False when the game host is not ready.
   */
  submit(change: JobChange, file?: string): boolean {
    if (this.jobs === undefined || this.current.status !== 'ready') return false;
    if (file !== undefined) this.lastChange = file;
    this.jobs.submit(change);
    return true;
  }

  /** Resolves when no preview job runs or waits, for Etch's own tests. */
  async jobsIdle(): Promise<void> {
    await this.jobs?.idle();
  }

  get state(): GameHostState {
    return this.current;
  }

  /** The running game process, for Etch's own tests. */
  get running(): GameHostProcess | undefined {
    return this.process;
  }

  /** Whether the game host runs, starts or restarts. */
  private get active(): boolean {
    return this.process !== undefined || this.restarts.busy;
  }

  /**
   * Called by the preview: with a request at a switch to the game host, which starts it when it is
   * not running (also after the crash limit stopped it); with `undefined` when it stops showing it,
   * which starts the idle timer.
   */
  use(request: GameHostRequest | undefined): void {
    if (request === undefined) {
      if (this.active) this.armIdle();
      return;
    }
    this.disarmIdle();
    if (this.active) this.update(request);
    else void this.start(request);
  }

  /**
   * Called by the preview while it shows the game host, with its playset and display: a game host
   * that runs or starts with another restarts. A stopped one stays stopped.
   */
  update(request: GameHostRequest): void {
    this.wanted = request;
    const runs = this.runs;
    if (!this.active || runs === undefined) return;
    const change = requestChange(runs, request);
    if (change !== undefined) this.restart(change);
  }

  /**
   * Restarts a game host that runs or starts, for a change it reads only when it starts (spec
   * section 4), such as a saved `.gfx` file. Restarts asked for meanwhile coalesce into one.
   */
  restart(reason: string, file?: string): void {
    if (!this.active) return;
    if (file !== undefined) this.lastChange = file;
    this.output.info(`The game host restarts: ${reason}.`);
    this.restarts.request(reason);
    if (this.process !== undefined) this.set({ status: 'restarting', reason });
  }

  /**
   * Starts the game host (a manual start, which forgets earlier crashes) and waits until it is
   * ready or the start failed (see `state`).
   */
  start(request: GameHostRequest): Promise<void> {
    this.wanted = request;
    if (this.active) return this.restarts.idle();
    this.crashes.reset();
    this.lastJob = 0;
    this.lastChange = undefined;
    this.restarts.request(START);
    return this.restarts.idle();
  }

  /** Stops the game host (also one still starting or restarting); false when there was none. */
  async stop(): Promise<boolean> {
    this.disarmIdle();
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
      this.output.info('The game host stopped.');
      this.set({ status: 'stopped' });
    } else {
      this.set({ status: 'failed', message: `The game host could not be closed: ${outcome}.` });
    }
    return true;
  }

  /** Stops the game host, then removes its install; refuses while another window runs it. */
  async removeInstall(): Promise<boolean> {
    await this.stop();
    if (await lockHeldElsewhere(await this.lockOptions())) throw new HostBusyError();
    return this.install.remove();
  }

  /** Closes a game host that a VS Code window which is gone left running. */
  async closeOrphan(): Promise<void> {
    try {
      // Most activations find no lock, and need no identity of their own.
      if ((await readLock(this.lockFile)) === undefined) return;
      await closeOrphan(await this.lockOptions());
    } catch (error) {
      this.output.error(`An orphaned game host was not closed: ${String(error)}`);
    }
  }

  /** For Etch's own tests: how long the game host runs without a game host preview. */
  setIdleTime(ms: number): void {
    this.idleMs = ms;
  }

  dispose(): void {
    this.disarmIdle();
    void this.stop();
    this.emitter.dispose();
    this.jobEmitter.dispose();
  }

  /**
   * One start or restart: closes the running process, takes the restarts asked for so far and
   * starts the game host with the latest request. False when it should stay down.
   */
  private async cycle(take: () => readonly string[]): Promise<boolean> {
    const abort = new AbortController();
    this.abort = abort;
    try {
      const old = this.process;
      if (old !== undefined) {
        // Files saved together (Save All, a checkout) come as several changes: one restart.
        await new Promise((resolve) => setTimeout(resolve, RESTART_SETTLE_MS));
        if (abort.signal.aborted) return false;
        this.release();
        const outcome = await old.stop();
        if (outcome !== 'terminated' && outcome !== 'already-exited') {
          this.set({ status: 'failed', message: `The game host could not be closed: ${outcome}.` });
          return false;
        }
      }
      const request = this.wanted;
      if (abort.signal.aborted || request === undefined) return false;
      const reasons = take().filter((reason) => reason !== START);
      const restart = reasons.length > 0;
      this.runs = request;
      this.set(
        restart ? { status: 'restarting', reason: reasons.join('; ') } : { status: 'starting' },
      );
      return await this.startProcess(request, restart, abort.signal);
    } finally {
      if (this.abort === abort) this.abort = undefined;
    }
  }

  private async startProcess(
    request: GameHostRequest,
    restart: boolean,
    signal: AbortSignal,
  ): Promise<boolean> {
    try {
      const prepared = await this.install.prepare(
        request.gameFolder,
        request.mods,
        request.display,
      );
      if (prepared === undefined) {
        this.set({ status: 'failed', message: 'The game host install was not created.' });
        return false;
      }
      if (signal.aborted) return false;
      const started = await GameHostProcess.start({
        install: prepared,
        originalGameFolder: request.gameFolder,
        lock: await this.lockOptions(),
        log: (message) => {
          this.output.info(message);
        },
        signal,
      });
      this.process = started;
      this.display = { width: request.display.width, height: request.display.height };
      // A restart keeps the images, so that the preview can show the last one meanwhile.
      if (!restart) await rm(this.capturesFolder, { recursive: true, force: true });
      await mkdir(this.capturesFolder, { recursive: true });
      this.jobs = this.jobQueue(started, prepared.overlayFolder, this.lastJob);
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
      this.output.error(`The game host did not start: ${message}`);
      this.set({ status: 'failed', message });
      return false;
    }
  }

  /**
   * Watches the started process: an exit Etch did not ask for, and a hang, are crashes. Once a
   * restart is asked for, the process is about to be closed anyway: nothing more counts.
   */
  private watch(started: GameHostProcess): void {
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

  /** Whether `process` is the ready game host, with no restart asked for. */
  private serving(process: GameHostProcess): boolean {
    return this.process === process && this.current.status === 'ready';
  }

  /**
   * A crash: restarts the game host, or after `CRASH_LIMIT` crashes in `CRASH_WINDOW_MS` stops it
   * with the end of `error.log` and the file changed just before. False when it stopped.
   */
  private async crashed(reason: string): Promise<boolean> {
    this.output.warn(`The game host crashed: ${reason}.`);
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
      (this.lastChange === undefined ? '' : `Changed just before: ${this.lastChange}. `) +
      (tail.length === 0
        ? 'error.log has no lines.'
        : `The end of error.log:\n${tail.map((line) => `  ${line}`).join('\n')}`);
    this.output.error(`The game host stopped. ${message}`);
    this.set({ status: 'failed', message });
    return false;
  }

  /** Lets go of the running process: its jobs and its hang watch end. */
  private release(): void {
    this.process = undefined;
    this.watching?.abort();
    this.watching = undefined;
    if (this.jobs !== undefined) this.lastJob = this.jobs.last;
    this.jobs?.dispose();
    this.jobs = undefined;
    this.display = undefined;
  }

  private jobQueue(process: GameHostProcess, overlayFolder: string, first: number): JobQueue {
    const target = {
      overlayFolder,
      capturesFolder: this.capturesFolder,
      request: process.request.bind(process),
    };
    const shown: string[] = [];
    return new JobQueue(
      (change, job) => runJob(target, change, job),
      (outcome) => {
        if (outcome.ok) {
          const { plugin } = outcome;
          this.output.info(
            `Game host job ${String(outcome.job)}: ${outcome.ms.job.toFixed(0)} ms ` +
              `(copies ${outcome.ms.copies.toFixed(1)} ms; in the game: commands ${String(plugin.commands)}, ` +
              `black ${String(plugin.black)}, white ${String(plugin.white)}, recovery ${String(plugin.recover)}, ` +
              `file ${String(plugin.write)} ms), crop ${String(outcome.image.crop.width)}×` +
              String(outcome.image.crop.height),
          );
          // The image on screen and the new one stay; older ones go.
          shown.push(outcome.image.path);
          if (shown.length > 2) shown.shift();
          void pruneCaptures(this.capturesFolder, shown);
        } else {
          this.output.warn(
            `Game host job ${String(outcome.job)} failed (${outcome.code}): ${outcome.message}`,
          );
        }
        for (const command of outcome.commands) {
          if (!command.success && !command.line.startsWith('window close')) {
            this.output.warn(`  "${command.line}" answered: ${command.text || 'nothing'}`);
          }
        }
        this.jobEmitter.fire(outcome);
        // After a console fault the plugin refuses every later job (docs/plugin-protocol.md).
        if (!outcome.ok && outcome.code === 'game_fault' && this.serving(process)) {
          void this.crashed(`a console call faulted: ${outcome.message}`);
        }
      },
      first,
    );
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

  private armIdle(): void {
    this.disarmIdle();
    this.idle = setTimeout(() => {
      const minutes = Math.round(this.idleMs / 60_000);
      this.output.info(`The game host stops: no game host preview for ${String(minutes)} minutes.`);
      void this.stop();
    }, this.idleMs);
  }

  private disarmIdle(): void {
    if (this.idle !== undefined) clearTimeout(this.idle);
    this.idle = undefined;
  }

  private set(state: GameHostState): void {
    if (JSON.stringify(state) === JSON.stringify(this.current)) return;
    this.current = state;
    this.emitter.fire(state);
  }
}
