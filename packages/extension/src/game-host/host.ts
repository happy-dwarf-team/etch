import * as vscode from 'vscode';
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
  closeOrphan,
  lockHeldElsewhere,
  lockPath,
  readLock,
  type LockOptions,
} from './process.ts';
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
  | { readonly status: 'stopping' }
  /** Another VS Code window runs the machine's game host. */
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly message: string };

/** What a game host start needs from the preview. */
export interface GameHostRequest {
  /** The player's game folder, which the install links to. */
  readonly gameFolder: string;
  /** The playset in load order. */
  readonly mods: readonly GameHostMod[];
  readonly display: HostDisplay;
}

/** How long the game host runs without a game host preview (spec section 4). */
export const IDLE_STOP_MS = 30 * 60_000;

/**
 * The machine's one game host, owned by this VS Code window: started on demand, stopped by
 * command, when the window closes (`stop` from `deactivate`) or after `IDLE_STOP_MS` without a
 * game host preview. A start, a stop and a removal of the install never overlap.
 */
export class GameHost implements vscode.Disposable {
  readonly install: GameHostInstall;
  private readonly output: vscode.LogOutputChannel;
  private readonly lockFile: string;
  private readonly emitter = new vscode.EventEmitter<GameHostState>();
  private current: GameHostState = { status: 'stopped' };
  private process: GameHostProcess | undefined;
  private starting: Promise<void> | undefined;
  private abort: AbortController | undefined;
  private idle: NodeJS.Timeout | undefined;
  private owner: Promise<ProcessIdentity> | undefined;
  private idleMs = IDLE_STOP_MS;

  readonly onDidChangeState = this.emitter.event;

  constructor(storageFolder: string, buildsFolder: string, output: vscode.LogOutputChannel) {
    this.install = new GameHostInstall(storageFolder, buildsFolder, output);
    this.output = output;
    this.lockFile = lockPath(storageFolder);
  }

  get state(): GameHostState {
    return this.current;
  }

  /** The running game process, for Etch's own tests. */
  get running(): GameHostProcess | undefined {
    return this.process;
  }

  /**
   * Called by the preview: with a request while it shows the game host, which starts it when it is
   * not running; with `undefined` when it stops showing it, which starts the idle timer.
   */
  use(request: GameHostRequest | undefined): void {
    if (request === undefined) {
      if (this.process !== undefined || this.starting !== undefined) this.armIdle();
      return;
    }
    this.disarmIdle();
    if (this.process !== undefined || this.starting !== undefined) return;
    void this.start(request);
  }

  /** Starts the game host and waits until it is ready or the start failed (see `state`). */
  start(request: GameHostRequest): Promise<void> {
    if (this.starting !== undefined) return this.starting;
    if (this.process !== undefined) return Promise.resolve();
    const abort = new AbortController();
    this.abort = abort;
    this.set({ status: 'starting' });
    this.starting = (async () => {
      try {
        const prepared = await this.install.prepare(
          request.gameFolder,
          request.mods,
          request.display,
        );
        if (prepared === undefined) {
          this.set({ status: 'failed', message: 'The game host install was not created.' });
          return;
        }
        if (abort.signal.aborted) {
          this.set({ status: 'stopped' });
          return;
        }
        const started = await GameHostProcess.start({
          install: prepared,
          originalGameFolder: request.gameFolder,
          lock: await this.lockOptions(),
          log: (message) => {
            this.output.info(message);
          },
          signal: abort.signal,
        });
        this.process = started;
        this.set({ status: 'ready', pid: started.identity.pid, readyMs: started.times.ready });
        void started.onExit.then((code) => {
          if (this.process !== started) return;
          this.process = undefined;
          this.disarmIdle();
          this.output.warn(`The game host exited by itself (exit code ${String(code)}).`);
          this.set({
            status: 'failed',
            message: `The game host exited (exit code ${String(code)}).`,
          });
        });
      } catch (error) {
        if (error instanceof HostBusyError) {
          this.set({ status: 'busy' });
        } else if (abort.signal.aborted) {
          this.set({ status: 'stopped' });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          this.output.error(`The game host did not start: ${message}`);
          this.set({ status: 'failed', message });
        }
      } finally {
        this.starting = undefined;
        this.abort = undefined;
      }
    })();
    return this.starting;
  }

  /** Stops the game host (also one still starting); false when there was none. */
  async stop(): Promise<boolean> {
    this.disarmIdle();
    const wasStarting = this.starting !== undefined;
    this.abort?.abort();
    await this.starting;
    const running = this.process;
    if (running === undefined) {
      if (this.current.status !== 'busy') this.set({ status: 'stopped' });
      return wasStarting;
    }
    this.process = undefined;
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
