import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  decodeGameText,
  errorLogDiagnostics,
  parseScript,
  readGuiFile,
  type InterfaceIndex,
  type ModelDiagnostic,
} from '@etch/core';
import {
  GameFiles,
  PlaysetInterface,
  findProfileFolder,
  systemEnvironment,
} from '@etch/core/playset';
import * as vscode from 'vscode';
import { ErrorLogTail, collapseErrorLog, textureDrawnMissing } from './error-log.ts';
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
  type PrepareOptions,
  type PreparedInstall,
} from './install.ts';
import {
  CRASH_REPORTER,
  HostBusyError,
  HostCrashedError,
  LiveGameProcess,
  NotTheLiveGameError,
  closeOrphan,
  lockHeldElsewhere,
  lockPath,
  playerGameRunning,
  readLock,
  type LockOptions,
} from './process.ts';
import {
  PipeError,
  type PipeEvent,
  type PickModeRequest,
  type ReloadAnswer,
  type ReloadRequest,
  type SnapshotAnswer,
} from './pipe.ts';
import {
  HUD_FILES,
  HUD_LIMIT,
  PANEL_TESTED,
  planReload,
  visibleReloads,
  type ReloadPlan,
} from './policy.ts';
import { listSaves, liveSettings, newestSave, savesFolder, type SaveFile } from './saves.ts';
import {
  CRASH_LIMIT,
  CRASH_WINDOW_MS,
  CrashLimit,
  RestartQueue,
  errorLogPath,
  logTail,
  watch as watchHang,
} from './watchdog.ts';
import { childProcesses, processIdentity, type ProcessIdentity } from './windows.ts';

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
    options: Omit<PrepareOptions, 'layout' | 'buildsFolder'>,
  ): Promise<PreparedInstall | undefined> {
    return this.serial(async () => {
      if (!(await installExists(this.layout)) && !(await this.confirmCreate(options.gameFolder))) {
        return undefined;
      }
      const started = performance.now();
      const prepared = await prepareInstall({
        ...options,
        layout: this.layout,
        buildsFolder: this.buildsFolder,
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
          `a copy of its top-level files (about ${String(megabytes)} MB), Anvil, Bellows, Tongs and ` +
          `Etch's plugin, and a profile of its own. Your game folder, profile and mods are not changed. ` +
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
  /**
   * It runs, but needs a planned restart, for these reasons; reloads wait until the player restarts
   * it (spec section 6).
   */
  | { readonly status: 'stale'; readonly pid: number; readonly reasons: readonly string[] }
  /** It restarts after a crash or for a planned restart (spec section 6). */
  | { readonly status: 'restarting'; readonly reason: string }
  | { readonly status: 'stopping' }
  /** Another VS Code window runs the machine's live game. */
  | { readonly status: 'busy' }
  | { readonly status: 'failed'; readonly message: string };

/**
 * What a start of the live game needs: the player's game folder, which the install links to, the
 * playset in load order and the display for a player without settings.
 */
export interface LiveGameRequest {
  readonly gameFolder: string;
  readonly mods: readonly LiveGameMod[];
  readonly display: LiveGameDisplay;
  /** The edited mod's folder: files elsewhere open read-only after a pick (spec section 7). */
  readonly editedRoot?: string | undefined;
  /** The pick mode key (`etch.liveGame.pickModeKey`), in the plugin's spelling. */
  readonly pickModeKey?: string | undefined;
}

/** The restart reason of a start that is not a restart. */
const START = 'start';
/**
 * The save the live game makes before a stop or a planned restart: the game's autosave, which the
 * next start continues as the newest private save (spec section 6; the console's `savegame`
 * writes nothing, live).
 */
export const AUTOSAVE = 'autosave.eu4';
/** How long after a reload's answer `error.log` is read: the game writes the lines of a few frames. */
const ERROR_LOG_SETTLE_MS = 250;
/** Anbennar's Workshop item: its achievements prompt shows before a save loads (H7). */
const ANBENNAR_WORKSHOP_ID = '1385440355';
/** The prompt's button the live game clicks after a start from a save in Anbennar's playset. */
const ACHIEVEMENTS_PROMPT = 'DefaultConfirm/AgreeButton';
/** How long a start from a save may take to load it, the prompt included (about 100 s, H7). */
const LOAD_TIMEOUT_MS = 300_000;
/** The views a restart closes and the player may want back: the province view and the country view. */
const REOPENED_VIEWS = /^(?:provinceview|countryview)$/i;
/** Diagnostic source of the live game's Problems. */
const SOURCE = 'Etch live game';
/** The memento key that records the first start's confirmation. */
const CONFIRMED_KEY = 'etch.liveGame.confirmed';
/**
 * How long a save before a stop or a planned restart may take; a game that does not write it (live:
 * one with stale windows on screen deadlocked in `autosave`) is closed anyway and the next start
 * continues the newest save there is.
 */
const STOP_SAVE_MS = 30_000;

/** What the player chose to start: a save of the private `save games/` by name, or the main menu. */
type StartAt = { readonly save: string | SaveFile | undefined };

/**
 * The machine's one live game, owned by this VS Code window: started on request, stopped by
 * command or when the window closes (`stop` from `deactivate`), both saving first. Its watchdog
 * (etch#51) restarts it at the newest private save after a dead process or a hang, and stops it
 * after `CRASH_LIMIT` crashes in `CRASH_WINDOW_MS` until a manual start; a quit from the game is a
 * stop, and the process the game starts of itself on Exit to Main Menu is adopted (H6). A start, a
 * restart, a stop and a removal of the install never overlap. The reload policy comes with the
 * next part of M8 (spec section 13).
 */
export class LiveGame implements vscode.Disposable {
  readonly install: PrivateInstall;
  private readonly output: vscode.LogOutputChannel;
  private readonly memento: vscode.Memento;
  private readonly lockFile: string;
  private readonly emitter = new vscode.EventEmitter<LiveGameState>();
  private readonly restarts = new RestartQueue((take) => this.cycle(take));
  private readonly crashes = new CrashLimit();
  private current: LiveGameState = { status: 'stopped' };
  private process: LiveGameProcess | undefined;
  /** What the live game starts with: the latest start's request. */
  private wanted: LiveGameRequest | undefined;
  /** Where the next start or restart begins. */
  private startAt: StartAt = { save: undefined };
  /** Cancels the start or restart that runs. */
  private abort: AbortController | undefined;
  /** Ends the hang watch of the running process. */
  private watching: AbortController | undefined;
  private owner: Promise<ProcessIdentity> | undefined;
  /** Reloads run one after another, in the order the files were saved. */
  private reloads: Promise<unknown> = Promise.resolve();
  /** The running process's `error.log`, read from where the last reload left it. */
  private errorLog: ErrorLogTail | undefined;
  /** Rebuilds since the process started: HUD rebuilds leak (spec section 6). */
  private hudRebuilds = 0;
  private panelRebuilds = 0;
  /** When the running process got ready, to tell textures created after it (H9). */
  private readyAt = 0;
  /** The playset's interface index, built on the first texture saved, for its spellings. */
  private index: Promise<InterfaceIndex> | undefined;
  /** The live game's Problems: `error.log` lines and the game's answers, on the saved files. */
  readonly diagnostics = vscode.languages.createDiagnosticCollection('etch-live-game');
  /** The views on screen at the last reload, said after a restart that cannot reopen them (H8). */
  private lastViews: readonly string[] = [];
  /** The next ready process comes from a restart, not a start. */
  private restarting = false;
  /** Said once per game session: reloads do not run in ironman or multiplayer. */
  private notAvailableSaid = 0;

  readonly onDidChangeState = this.emitter.event;
  private readonly pushEmitter = new vscode.EventEmitter<PipeEvent>();
  /** The plugin's pushes: picks, their snapshots and pick mode changes (spec section 7). */
  readonly onDidPush = this.pushEmitter.event;

  constructor(
    storageFolder: string,
    buildsFolder: string,
    output: vscode.LogOutputChannel,
    memento: vscode.Memento,
  ) {
    this.install = new PrivateInstall(storageFolder, buildsFolder, output);
    this.output = output;
    this.memento = memento;
    this.lockFile = lockPath(storageFolder);
  }

  get state(): LiveGameState {
    return this.current;
  }

  /** The running game process, for Etch's own tests. */
  get running(): LiveGameProcess | undefined {
    return this.process;
  }

  /** The private profile's saves folder. */
  get savesFolder(): string {
    return savesFolder(this.install.layout.profile);
  }

  /** Whether the live game runs, starts or restarts. */
  private isActive(): boolean {
    return this.process !== undefined || this.restarts.busy;
  }

  /**
   * Starts the live game on the player's request (a manual start, which forgets earlier crashes):
   * refuses while the player's own game runs, asks for the first start's confirmation, and lets the
   * player choose where it starts (spec section 6). Waits until it is ready or the start failed
   * (see `state`). A live game that runs already keeps running.
   */
  async start(request: LiveGameRequest): Promise<void> {
    if (this.isActive()) return this.restarts.idle();
    const playerGame = await playerGameRunning(request.gameFolder).catch(() => undefined);
    if (playerGame !== undefined) {
      void vscode.window.showWarningMessage(
        `Your own EU4 runs (PID ${String(playerGame.pid)}). The live game counts as your EU4 ` +
          'session for Steam, so it starts only when your game is closed.',
      );
      return;
    }
    const playerProfile = await this.playerProfile(request.gameFolder);
    if (!(await this.confirmFirstStart(playerProfile))) return;
    const startAt = await this.chooseStart(playerProfile);
    // Another start may have begun while the player chose.
    if (startAt === undefined || this.isActive()) return;
    this.wanted = request;
    this.startAt = startAt;
    this.crashes.reset();
    this.restarts.request(START);
    return this.restarts.idle();
  }

  /**
   * Stops the live game (also one still starting or restarting), saving a loaded game first;
   * false when there was none.
   */
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
    await this.saveBeforeStop(running);
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
    this.pushEmitter.dispose();
    this.diagnostics.dispose();
  }

  // ---- Pick mode -------------------------------------------------------------------------------

  /** The playset the live game runs, as one file system; `undefined` before a start. */
  get files(): GameFiles | undefined {
    return this.wanted === undefined ? undefined : playsetFiles(this.wanted);
  }

  /** The edited mod's folder of the running playset. */
  get editedRoot(): string | undefined {
    return this.wanted?.editedRoot;
  }

  /**
   * Sends a `pick_mode` request to the running game (docs/plugin-protocol.md); `undefined` when no
   * game is ready to take it.
   */
  async pickMode(request: PickModeRequest) {
    const running = this.process;
    if (
      running === undefined ||
      (this.current.status !== 'ready' && this.current.status !== 'stale')
    ) {
      return undefined;
    }
    return running.pickMode(request);
  }

  /**
   * A live snapshot of a top-level window the game shows (spec section 7). Rejects with
   * `PipeError` `not_open` or `stale`; `undefined` when no game runs.
   */
  async snapshot(window: string): Promise<SnapshotAnswer | undefined> {
    const running = this.process;
    if (
      running === undefined ||
      (this.current.status !== 'ready' && this.current.status !== 'stale')
    ) {
      return undefined;
    }
    return running.snapshot(window);
  }

  // ---- Reloads ---------------------------------------------------------------------------------

  /**
   * A file of the playset was saved: reloads it into the running game, or asks for a planned
   * restart, or says why nothing happens (spec section 6). Reloads run one at a time; while a
   * restart is needed they wait for it.
   */
  fileSaved(file: string): Promise<void> {
    const next = this.reloads.then(() => this.reload(file));
    this.reloads = next.catch(() => undefined);
    return next;
  }

  /** Restarts the live game now for the planned restart it needs (spec section 6). */
  async restartNow(): Promise<void> {
    const state = this.current;
    if (state.status !== 'stale' && state.status !== 'ready') return;
    const reasons = state.status === 'stale' ? state.reasons : ['asked for'];
    const running = this.process;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Restarting the live game' },
      async (progress) => {
        if (running !== undefined) {
          progress.report({ message: 'saving' });
          await this.saveFor(running, 'the planned restart');
        }
        progress.report({ message: 'starting' });
        this.restarts.request(`planned restart: ${reasons.join('; ')}`);
        await this.restarts.idle();
      },
    );
  }

  private async reload(file: string): Promise<void> {
    const running = this.process;
    const request = this.wanted;
    if (running === undefined || request === undefined) return;
    const files = playsetFiles(request);
    const plan = await planReload({
      file,
      files,
      index: () => (this.index ??= PlaysetInterface.load(files).then((p) => p.index)),
      drawnMissing: async (path) => {
        // Only a texture created after the start can have been drawn missing.
        const created = await stat(file).then(
          (s) => s.birthtimeMs,
          () => 0,
        );
        return created > this.readyAt && textureDrawnMissing(this.errorLogPath, path);
      },
    });
    const uri = vscode.Uri.file(file);
    switch (plan.kind) {
      case 'none':
        if (plan.why === 'overridden') {
          this.output.info(`Not reloaded: ${plan.path ?? file}: ${plan.reason}.`);
          this.diagnostics.set(uri, [
            problem(
              vscode.DiagnosticSeverity.Warning,
              'game-original-differs',
              `Saving this file changes nothing in the live game: ${plan.reason}.`,
            ),
          ]);
        }
        return;
      case 'restart':
        this.restartNeeded(`${plan.path}: ${plan.reason}`);
        return;
      case 'reload':
        break;
    }
    if (this.current.status === 'stale') {
      this.output.info(`${plan.path} waits for the planned restart.`);
      return;
    }
    if (this.current.status !== 'ready') return;
    const answer = await this.run(running, plan.request, plan.path);
    if (answer === undefined) return;
    let last = answer;
    if (plan.thenVisible && answer.check !== undefined) {
      const visible = visibleReloads(answer.check.visible.map((w) => w.file));
      if (visible !== undefined) {
        const more = await this.run(running, visible, plan.path);
        if (more === undefined) return;
        last = more;
        for (const line of visible.lines) {
          this.count(HUD_FILES.has(line.slice('reload '.length).toLowerCase()) ? 'hud' : 'panel');
        }
      }
    }
    this.count(plan.rebuild);
    await this.report(uri, plan, [answer, ...(last === answer ? [] : [last])]);
    if (last.check !== undefined) {
      this.lastViews = last.check.visible
        .map((w) => w.name)
        .filter((name) => REOPENED_VIEWS.test(name));
    }
    const stale = last.check?.stale.filter((w) => w.visible) ?? [];
    if (stale.length > 0) {
      this.restartNeeded(
        `${stale.map((w) => w.name).join(', ')} went stale on screen after ${plan.path} was reloaded (H3)`,
      );
    } else if (this.hudRebuilds >= HUD_LIMIT) {
      this.restartNeeded(
        `${String(this.hudRebuilds)} HUD rebuilds, the tested range of the HUD's leaks`,
      );
    }
    const closed = answer.closed;
    if (closed.length > 0) {
      void vscode.window.showInformationMessage(
        `The live game closed ${closed.join(', ')} to reload ${plan.path}: open it again to see the change.`,
      );
    }
  }

  /** Runs one reload job; `undefined` when it did not run (said in the log or to the player). */
  private async run(
    running: LiveGameProcess,
    request: ReloadRequest,
    path: string,
  ): Promise<ReloadAnswer | undefined> {
    // Lines written before the job are not the job's.
    await this.errorLog?.read();
    const started = performance.now();
    try {
      const answer = await running.reload(request);
      this.output.info(
        `Reloaded ${path} in ${(performance.now() - started).toFixed(0)} ms ` +
          `(main thread ${answer.runMs.toFixed(0)} ms, waited ${answer.queuedMs.toFixed(0)} ms): ` +
          answer.lines.map((l) => `${l.line} → ${l.success ? 'ok' : 'refused'}`).join(', ') +
          (answer.check === undefined
            ? ''
            : `; ${String(answer.check.checked)} windows checked, ` +
              `${String(answer.check.stale.length)} stale, ` +
              `${String(answer.check.roots.after - answer.check.roots.before)} more top-level windows`),
      );
      return answer;
    } catch (error) {
      if (error instanceof PipeError && error.code === 'not_available') {
        const session = (await running.ping().catch(() => undefined))?.gameSession?.number ?? 0;
        if (this.notAvailableSaid !== session) {
          this.notAvailableSaid = session;
          void vscode.window.showWarningMessage(
            `The live game did not reload ${path}: ${error.message}.`,
          );
        }
        return undefined;
      }
      if (
        error instanceof PipeError &&
        (error.code === 'console_fault' || error.code === 'console_broken')
      ) {
        if (this.serving(running)) {
          this.release();
          await running.stop();
          await this.crashed(`the game's console faulted while it reloaded ${path}`);
        }
        return undefined;
      }
      this.output.warn(`${path} was not reloaded: ${String(error)}`);
      return undefined;
    }
  }

  /** Counts a rebuild of the HUD or of a panel. */
  private count(rebuild: 'hud' | 'panel' | undefined): void {
    if (rebuild === 'hud') this.hudRebuilds++;
    if (rebuild === 'panel') {
      this.panelRebuilds++;
      if (this.panelRebuilds === PANEL_TESTED + 1) {
        this.output.info(
          `${String(this.panelRebuilds)} panel rebuilds: past the tested range of their leaks.`,
        );
      }
    }
  }

  /**
   * The saved file's Problems from the live game: the console's refusals and the new `error.log`
   * lines, repeats collapsed and the game's own binding lines left out (spec section 6).
   */
  private async report(
    uri: vscode.Uri,
    plan: ReloadPlan & { kind: 'reload' },
    answers: readonly ReloadAnswer[],
  ): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ERROR_LOG_SETTLE_MS));
    const lines = collapseErrorLog((await this.errorLog?.read()) ?? []).map((l) =>
      l.count > 1 ? `${l.line} (×${String(l.count)})` : l.line,
    );
    const problems: vscode.Diagnostic[] = [];
    for (const answer of answers) {
      for (const line of answer.lines) {
        // "Reload failed" for a texture no window holds is not an error (spec section 6).
        if (line.success || plan.texture) continue;
        problems.push(
          problem(
            vscode.DiagnosticSeverity.Error,
            'game-console-answer',
            `The live game refused \`${line.line}\`: ${line.text.trim() || 'no answer'}`,
          ),
        );
      }
    }
    if (lines.length > 0) {
      const text = await readFile(uri.fsPath).then(
        (bytes) => decodeGameText(bytes, 'interface').text,
        () => undefined,
      );
      const window =
        text !== undefined && plan.path.toLowerCase().endsWith('.gui')
          ? readGuiFile(parseScript(text)).definitions[0]
          : undefined;
      if (text !== undefined && window !== undefined) {
        const document = await vscode.workspace.openTextDocument(uri).then(
          (d) => d,
          () => undefined,
        );
        for (const d of errorLogDiagnostics({
          text,
          path: plan.path,
          window,
          errorLog: lines,
          offline: [],
        })) {
          problems.push(fromModel(d, document));
        }
      } else {
        for (const line of lines) {
          problems.push(
            problem(vscode.DiagnosticSeverity.Warning, 'game-error-log', `error.log: ${line}`),
          );
        }
      }
    }
    this.diagnostics.set(uri, problems);
  }

  /** Asks for a planned restart with its reason; reloads wait until the player restarts (spec section 6). */
  private restartNeeded(reason: string): void {
    const state = this.current;
    if (state.status !== 'ready' && state.status !== 'stale') return;
    const reasons = state.status === 'stale' ? state.reasons : [];
    if (reasons.includes(reason)) return;
    this.output.warn(`Restart needed: ${reason}.`);
    this.set({ status: 'stale', pid: state.pid, reasons: [...reasons, reason] });
    const now = 'Restart now';
    void vscode.window
      .showWarningMessage(`Restart needed: ${reason}.`, now, 'Later')
      .then((answer) => (answer === now ? this.restartNow() : undefined));
  }

  private get errorLogPath(): string {
    return errorLogPath(this.install.layout.profile);
  }

  // ---- Starting --------------------------------------------------------------------------------

  private async playerProfile(gameFolder: string): Promise<string | undefined> {
    return findProfileFolder(gameFolder, systemEnvironment()).catch(() => undefined);
  }

  /**
   * The first start's confirmation (spec section 6), once per machine: the game runs in the
   * foreground, takes the player's settings, copies their saves and counts as their Steam session.
   */
  private async confirmFirstStart(playerProfile: string | undefined): Promise<boolean> {
    if (this.memento.get<boolean>(CONFIRMED_KEY) === true) return true;
    const settings =
      playerProfile === undefined
        ? undefined
        : await readFile(join(playerProfile, 'settings.txt'), 'latin1').catch(() => undefined);
    const autosaveOff = settings !== undefined && liveSettings(settings).autosaveOn;
    const start = 'Start';
    const answer = await vscode.window.showInformationMessage(
      'Start the live game?',
      {
        modal: true,
        detail:
          'The live game is EU4 itself, with your playset: it runs in the foreground, takes your ' +
          'settings (resolution, graphics, sound, UI scale, language) at every start, and plays ' +
          'copies of your saves in a profile of its own. Changes to its settings do not last, and ' +
          'nothing is written back to your profile or saves. While it runs it counts as your EU4 ' +
          'session for Steam: Steam will not start your own game beside it, and shows you playing.' +
          (autosaveOff
            ? ' Your autosave is off; the live game autosaves monthly, so that a crash loses little.'
            : ''),
      },
      start,
    );
    if (answer !== start) return false;
    await this.memento.update(CONFIRMED_KEY, true);
    return true;
  }

  /**
   * Where the live game starts (spec section 6): **Continue** (the newest private save), **Main
   * menu**, then the player's saves, newest first; a chosen player save is copied into the private
   * saves. Ironman saves show but cannot be chosen. `undefined` when the player cancelled.
   */
  private async chooseStart(playerProfile: string | undefined): Promise<StartAt | undefined> {
    const privateSaves = this.savesFolder;
    const [newest, playerSaves] = await Promise.all([
      newestSave(privateSaves),
      playerProfile === undefined ? Promise.resolve([]) : listSaves(savesFolder(playerProfile)),
    ]);
    type Item = vscode.QuickPickItem & { readonly pick?: StartAt | SaveFile };
    const items: Item[] = [];
    if (newest !== undefined) {
      items.push({
        label: '$(debug-continue) Continue',
        description: newest.name,
        detail: `The live game's newest save, ${age(newest.modifiedMs)}`,
        pick: { save: newest.name },
      });
    }
    items.push({ label: '$(home) Main menu', pick: { save: undefined } });
    if (playerSaves.length > 0) {
      items.push({ label: 'Your saves', kind: vscode.QuickPickItemKind.Separator });
      for (const save of playerSaves) {
        items.push(
          save.ironman
            ? {
                label: `$(lock) ${save.name}`,
                description: 'reload does not work in ironman',
                detail: age(save.modifiedMs),
              }
            : { label: save.name, detail: `${age(save.modifiedMs)}, played as a copy`, pick: save },
        );
      }
    }
    for (;;) {
      const chosen = await vscode.window.showQuickPick(items, {
        title: 'Start the live game',
        placeHolder: 'Where should the live game start?',
        matchOnDescription: true,
      });
      if (chosen === undefined) return undefined;
      const pick = chosen.pick;
      if (pick === undefined) {
        void vscode.window.showInformationMessage(
          `${chosen.label.replace(/^\$\([^)]*\) /, '')} is an ironman save: the live game cannot ` +
            'reload in ironman, so it is not copied.',
        );
        continue;
      }
      // A player's save is copied into the private saves once the install exists.
      return 'path' in pick ? { save: pick } : pick;
    }
  }

  // ---- Running ---------------------------------------------------------------------------------

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
      this.restarting = reasons.length > 0;
      if (reasons.length > 0) {
        // A restart begins at the newest private save: an autosave, a manual save or the save
        // made before a stop (spec section 6).
        const newest = await newestSave(this.savesFolder);
        this.startAt = { save: newest?.name };
      }
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
      const prepared = await this.install.prepare({
        gameFolder: request.gameFolder,
        mods: request.mods,
        display: request.display,
        playerProfile: await this.playerProfile(request.gameFolder),
        continueSave: this.startAt.save,
        pickModeKey: request.pickModeKey,
      });
      if (prepared === undefined) {
        this.set({ status: 'failed', message: 'The private install was not created.' });
        return false;
      }
      if (signal.aborted) return false;
      const chosen = this.startAt.save;
      this.startAt = { save: prepared.continueSave };
      this.output.info(
        `The live game takes ${prepared.settings.copied.join(' and ') || 'no settings'} from your ` +
          `profile${prepared.settings.autosaveOn ? ', with a monthly autosave' : ''}, and starts ` +
          (prepared.continueSave === undefined
            ? 'in the main menu.'
            : typeof chosen === 'object'
              ? `from your save ${chosen.name}, copied into its saves as ${prepared.continueSave}.`
              : `from ${prepared.continueSave}.`),
      );
      const started = await LiveGameProcess.start({
        install: prepared,
        originalGameFolder: request.gameFolder,
        lock: await this.lockOptions(),
        log: (message) => {
          this.output.info(message);
        },
        signal,
      });
      await this.serve(started);
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

  /** Makes a ready process the live game and watches it. */
  private async serve(started: LiveGameProcess): Promise<void> {
    this.process = started;
    this.hudRebuilds = 0;
    this.panelRebuilds = 0;
    this.readyAt = Date.now();
    this.index = undefined;
    this.errorLog = new ErrorLogTail(this.errorLogPath);
    // The pipe and its pushes end with the process.
    started.onEvent((event) => {
      if (this.process === started) this.pushEmitter.fire(event);
    });
    const startLines = await this.errorLog.skip();
    this.output.info(`The live game's error.log had ${String(startLines)} lines at ready.`);
    this.watch(started);
    this.set({ status: 'ready', pid: started.identity.pid, readyMs: started.times.ready });
    if (this.restarting && this.lastViews.length > 0) {
      // The game's own province selection is not called yet (H8): the player reopens the view.
      void vscode.window.showInformationMessage(
        `The live game restarted on the map: open ${this.lastViews.join(' and ')} again; Etch ` +
          'cannot reopen it yet.',
      );
    }
    this.restarting = false;
    this.lastViews = [];
    const anbennar = this.wanted?.mods.some((m) => m.workshopId === ANBENNAR_WORKSHOP_ID) === true;
    if (this.startAt.save !== undefined && anbennar) void this.answerPrompt(started);
  }

  /**
   * Answers Anbennar's achievements prompt, which shows before a save loads, so that a restart
   * reaches the loaded game without the player (spec section 6, H7). The save's own events are
   * left to the player. Tries until the save is loaded or `LOAD_TIMEOUT_MS` passes.
   */
  private async answerPrompt(started: LiveGameProcess): Promise<void> {
    const deadline = performance.now() + LOAD_TIMEOUT_MS;
    let answered = 0;
    while (this.process === started && performance.now() < deadline) {
      const ping = await started.ping().catch(() => undefined);
      if (ping?.gameSession !== undefined) return;
      // Enter until the prompt is gone: one may come before the game takes keys.
      const answer = await started.confirm(ACHIEVEMENTS_PROMPT).catch(() => undefined);
      if (answer?.pressed === true) answered++;
      else if (answered > 0 && answer?.found === false) {
        this.output.info("Answered Anbennar's achievements prompt.");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }

  /**
   * Watches the started process: a hang, and an exit Etch did not ask for, are crashes, except an
   * exit the player chose in the game. Once a restart is asked for, the process is about to be
   * closed anyway: nothing more counts.
   */
  private watch(started: LiveGameProcess): void {
    const watching = new AbortController();
    this.watching = watching;
    void started.onExit.then(async (code) => {
      if (!this.serving(started)) return;
      this.release();
      await this.exited(started, code);
    });
    void watchHang(started, { signal: watching.signal }).then(async (hang) => {
      if (!this.serving(started)) return;
      await this.crashed(`the game hangs: ${hang}`);
    });
  }

  /**
   * The game ended by itself. Exit to Main Menu ends in a process the game starts of itself (H6),
   * which is adopted after its identity checks. Otherwise exit code 0, or an unknown code without a
   * crash reporter, is the player quitting: a stop. Anything else is a crash.
   */
  private async exited(old: LiveGameProcess, code: number | null): Promise<void> {
    const reporter =
      code === null
        ? (await childProcesses(old.identity, CRASH_REPORTER).catch(() => [])).length > 0
        : false;
    if (code === 0 || (code === null && !reporter)) {
      const child = await old.restartedAs();
      await old.cleanedUp();
      if (child !== undefined) {
        this.set({ status: 'starting' });
        try {
          const adopted = await LiveGameProcess.adopt(
            {
              install: old.startOptions.install,
              originalGameFolder: old.startOptions.originalGameFolder,
              lock: await this.lockOptions(),
              log: (message) => {
                this.output.info(message);
              },
            },
            old.session,
            child,
          );
          await this.serve(adopted);
        } catch (error) {
          const why = error instanceof Error ? error.message : String(error);
          if (!(error instanceof NotTheLiveGameError)) {
            await this.crashed(`the game restarted itself and the new process failed: ${why}`);
            return;
          }
          // Not a crash and not a second game (spec section 6): it was closed after its checks.
          this.output.info(
            `The game restarted itself after Exit to Main Menu and was closed: ${why}`,
          );
          this.set({ status: 'stopped' });
          void vscode.window.showInformationMessage(
            'The live game was exited to the main menu, and the game it started again runs without ' +
              "Etch's plugin, so Etch closed it. Start the live game again to continue.",
          );
        }
        return;
      }
      this.output.info('The live game was quit in the game.');
      this.set({ status: 'stopped' });
      return;
    }
    await this.crashed(`the game exited (exit code ${String(code)})`);
  }

  /** Whether `process` is the ready live game, with no restart asked for. */
  private serving(process: LiveGameProcess): boolean {
    return (
      this.process === process &&
      (this.current.status === 'ready' || this.current.status === 'stale')
    );
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

  /**
   * Saves a loaded game before a stop (spec section 6), so that the next start can continue it.
   * Nothing to save in the main menu; the console refuses ironman and multiplayer games.
   */
  private async saveBeforeStop(running: LiveGameProcess): Promise<void> {
    await this.saveFor(running, 'the stop');
  }

  /**
   * Saves a loaded game as `autosave.eu4` through the plugin and waits until the game has written
   * it (a newer file whose size stays the same for a moment), so that the next start can continue
   * it. Nothing to save in the main menu; the console refuses ironman and multiplayer games.
   */
  private async saveFor(running: LiveGameProcess, what: string): Promise<void> {
    try {
      const ping = await running.ping();
      const session = ping.gameSession;
      if (session === undefined || session.ironman || session.multiplayer) return;
      const path = join(this.savesFolder, AUTOSAVE);
      const read = () =>
        stat(path).then(
          (s) => `${String(s.mtimeMs)}/${String(s.size)}`,
          () => '',
        );
      const before = await read();
      const started = performance.now();
      const saved = await running.save(STOP_SAVE_MS);
      // The game writes the file after the console's answer: wait until it changed and settled.
      let last = before;
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const now = await read();
        if (now !== before && now !== '' && now === last) break;
        last = now;
        if (performance.now() - started > STOP_SAVE_MS)
          throw new Error(`${AUTOSAVE} was not written`);
      }
      this.output.info(
        `Saved the live game as ${AUTOSAVE} for ${what} in ${(performance.now() - started).toFixed(0)} ms` +
          `${saved.success ? '' : `; the game answered: ${saved.text}`}.`,
      );
    } catch (error) {
      this.output.warn(`The live game was not saved for ${what}: ${String(error)}`);
    }
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

/** The playset's files as the live game reads them: the game folder, then the mods in load order. */
function playsetFiles(request: LiveGameRequest): GameFiles {
  return new GameFiles([
    { name: 'game', root: request.gameFolder, replacePaths: [] },
    ...request.mods.map((mod) => ({
      name: mod.name,
      root: mod.root,
      replacePaths: mod.replacePaths ?? [],
    })),
  ]);
}

function problem(
  severity: vscode.DiagnosticSeverity,
  code: string,
  message: string,
  range = new vscode.Range(0, 0, 0, 0),
): vscode.Diagnostic {
  const d = new vscode.Diagnostic(range, message, severity);
  d.source = SOURCE;
  d.code = code;
  return d;
}

/** A diagnostic of the extension's model, by offsets, on the saved document's lines. */
function fromModel(
  d: ModelDiagnostic,
  document: vscode.TextDocument | undefined,
): vscode.Diagnostic {
  const range =
    document === undefined
      ? new vscode.Range(0, 0, 0, 0)
      : new vscode.Range(document.positionAt(d.start), document.positionAt(d.end));
  return problem(
    d.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : d.severity === 'warning'
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information,
    d.code,
    d.message,
    range,
  );
}

/** How long ago a time was, for the quick pick. */
function age(ms: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - ms) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${String(hours)} h ago`;
  return new Date(ms).toLocaleDateString();
}
