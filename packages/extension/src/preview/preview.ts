// The preview (spec section 2): one webview beside the editor that shows the previewed window,
// follows the unsaved buffer of every game text file of the playset on each change, and publishes
// the model's diagnostics in the Problems panel. The extension host parses, models and lays out;
// the webview draws the draw list with WebGL2 (ADR 0001). Textures and fonts changed on disk are
// read again, and the preview reopens on the same window after a window reload. Its button starts
// the live game with the preview's playset (spec section 2). A window with a window profile is
// drawn in one view, chosen in `View ▾` and the Widget Outline (spec section 4). A pick in the live
// game pins the preview on the picked window, and live snapshots give its selectors, texts and the
// toggles where the profile differs from the game (spec section 7).

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import * as vscode from 'vscode';
import {
  DEFAULT_LANGUAGE,
  allWidgets,
  choosePreviewResolution,
  formatResolution,
  DRAW_LIST_VERSION,
  isSide,
  parseResolution,
  gameTextKind,
  guiDiagnostics,
  laidOutIndexOf,
  mapGameText,
  parseScript,
  readGuiFile,
  widgetAt,
  widgetHoverText,
  widgetPathAt,
  type DrawList,
  type DrawRect,
  type GameTextOffsets,
  type GuiFile,
  type ModelDiagnostic,
  type PreviewResolution,
  type ResolutionContext,
  type Screen,
  type Widget,
  type WindowLayout,
} from '@etch/core';
import { layOutPreview } from '@etch/core/playset';
import {
  activeLinks,
  evaluateView,
  layoutContentOf,
  layoutViewOf,
  liveDifferences,
  liveMatch,
  liveSelectors,
  sampleData,
  withView,
  type LiveSnapshot,
  type ProfileDiagnostic,
  type SampleData,
  type WindowView,
} from '@etch/core/profile';
import { readGameText, saveEncodingOf } from '../game-text.ts';
import {
  pickKeySetting,
  type LiveGame,
  type PickMode,
  type PickOpened,
} from '../live-game/index.ts';
import { PipeError, type SnapshotAnswer } from '../live-game/pipe.ts';
import { listSaves, savesFolder } from '../live-game/saves.ts';
import type { OutlineToggle, WidgetNavigation } from '../navigation.ts';
import { PreviewData, type LiveLayer } from './data.ts';
import { LiveSnapshots, playsetKey, snapshotOf } from './live-snapshots.ts';
import { previewHtml } from './html.ts';
import { ProfileStore, type LoadedProfile, type ProjectProblems } from './profiles.ts';
import type {
  DataAction,
  HostMessage,
  Notice,
  Point,
  PreviewMemento,
  TextureFailure,
  ViewAction,
  ViewState,
  WebviewMessage,
} from './protocol.ts';
import { RenderLoop } from './render-loop.ts';
import { PreviewSession, type SessionSettings } from './session.ts';
import {
  applyViewAction,
  chooseMember,
  initialChoice,
  savedView,
  toggleWidget,
  viewChoiceOf,
  viewId,
  viewMenu,
  type ChoiceState,
} from './views.ts';

/** The setting of the preview resolution (spec section 6), in the `etch` section. */
export const RESOLUTION_SETTING = 'previewResolution';

/** The command that chooses the preview resolution. */
export const CHOOSE_RESOLUTION = 'etch.choosePreviewResolution';

/** Where the monitor's native resolution is kept between sessions, so a cold open knows it. */
const NATIVE_SCREEN_KEY = 'etch.nativeScreen';

/** The save the preview last used, by workspace folder, read again when the preview opens. */
const SAMPLE_SAVE_KEY = 'etch.sampleSave';

/** The context key that is true while the preview is open. */
export const PREVIEW_OPEN_CONTEXT = 'etch.previewOpen';

/** The preview's webview type, which its panel serializer is registered for. */
export const PREVIEW_VIEW_TYPE = 'etch.preview';

/** One render of the previewed window, posted to the webview. */
export interface PreviewRender {
  readonly id: number;
  /** The `.gui` file that holds the window. */
  readonly uri: vscode.Uri;
  /** Its model, from the game text the window was laid out from. */
  readonly file: GuiFile;
  readonly window: Widget;
  readonly layout: WindowLayout;
  /** The draw list as posted: `textures` are webview URIs. */
  readonly drawList: DrawList;
  /** The file's text the model was read from, and the map to the editor's offsets. */
  readonly source: SourceText;
  readonly pinned: boolean;
  /** When the first change or request this render answers came in, in ms since the Unix epoch. */
  readonly requestedAt: number;
  /** The view drawn, when the window has a window profile (spec section 4). */
  readonly view?: { readonly profile: LoadedProfile; readonly view: WindowView };
  /** The sample data drawn, when the window has a window profile (spec section 5). */
  readonly sample?: SampleData;
}

/** The webview's answer to a render. */
export interface PreviewPaint {
  readonly id: number;
  readonly painted: boolean;
  readonly problems: readonly TextureFailure[];
  readonly skipped: readonly number[];
  readonly pixels?: readonly (readonly number[])[];
  /** When the pixels were drawn, in ms since the Unix epoch; for budgets (spec section 7). */
  readonly at: number;
  /** Why nothing was drawn, such as a webview without WebGL2. */
  readonly error?: string;
}

/**
 * The preview's surface for the rest of the extension (the widget outline and navigation of
 * etch#37, the resolution of etch#38) and for tests. Everything else is internal.
 */
export interface PreviewApi {
  /** Fires after each render is posted to the webview, with the model it was laid out from. */
  readonly onDidRender: vscode.Event<PreviewRender>;
  /** Fires when the webview has drawn (or failed to draw) a render. */
  readonly onDidPaint: vscode.Event<PreviewPaint>;
  /** The latest render, `undefined` before the first one or after the preview closes. */
  readonly current: PreviewRender | undefined;
  /**
   * The preview resolution and where it came from: the `etch.previewResolution` setting, the
   * player's `settings.txt` or the monitor. Changing any of them lays the window out again.
   */
  readonly resolution: PreviewResolution;
  /** The player's and the monitor's resolution, as far as the preview knows them. */
  readonly resolutionContext: ResolutionContext;
  /** The notices the preview shows above the window, such as a game that was not found. */
  readonly notices: readonly Notice[];
  /** What the toolbar, its menus and the notices show, as last posted to the webview. */
  readonly viewState: ViewState | undefined;
  /** Opens the preview beside the editor, or reveals it. */
  open(): void;
  /**
   * Makes a panel VS Code restored after a window reload the preview, on the window its memento
   * names (the panel serializer's work). A panel restored while the preview is open is closed.
   */
  restore(panel: vscode.WebviewPanel, memento: unknown): void;
  /** What the webview keeps for the next window reload; `undefined` before the first render. */
  readonly reloadState: PreviewMemento | undefined;
  /** Pins the previewed window, or unpins it. */
  togglePin(): void;
  /**
   * Starts the live game with the preview's playset (spec section 2), once the preview has one
   * with a game folder.
   */
  startLiveGame(): void;
  /** Draws the current render again and reads the straight RGBA of points of the screen. */
  probe(points: readonly Point[]): Promise<PreviewPaint>;
  /** Resolves when no render runs or waits. */
  idle(): Promise<void>;
  /**
   * What the pointer over a point of the preview screen does: outlines the widget under it and
   * returns its path and rect (core's `widgetHoverText`); `undefined` leaves the preview.
   */
  hover(point: Point | undefined): string | undefined;
  /** What a click on the preview does: reveals the widget's source (etch#37). */
  click(point: Point): Promise<boolean>;
  /** What a click in `View ▾` does (spec section 4); Save as view asks for a name. */
  viewAction(action: ViewAction): Promise<void>;
  /** What a click in `Data ▾` does (spec section 5); a save, country or province is asked for. */
  dataAction(action: DataAction): Promise<void>;
  /**
   * Reads a save file and makes it the preview's sample data, on its player and capital; resolves
   * once it is read (or refused) and the window is laid out again.
   */
  chooseSave(path: string): Promise<void>;
  /** Chooses a country or a province of the chosen save. */
  chooseData(choice: { readonly country?: string; readonly province?: number }): void;
  /** The countries and provinces of the chosen save, in the order the picks list them, and the chosen ones. */
  dataChoices(): DataChoices;
  /** Pins the window the game opens instead of the previewed one, through a link. */
  openLink(window: string): Promise<boolean>;
  /**
   * Takes a live snapshot of the previewed window from the live game (spec section 7); false when
   * the game does not show it (said to the user) or does not run.
   */
  takeSnapshot(): Promise<boolean>;
}

/** The countries and provinces of the chosen save, and the chosen ones. */
export interface DataChoices {
  readonly countries: readonly string[];
  readonly provinces: readonly number[];
  readonly country?: string;
  readonly province?: number;
}

/** The game text of a file, from its editor buffer or from disk (etch#15). */
export interface SourceText {
  /** The open document, `undefined` when the text was read from disk. */
  readonly document: vscode.TextDocument | undefined;
  /** The document version the text is from. */
  readonly version: number | undefined;
  readonly text: string;
  /** Whether the file starts with a UTF-8 byte order mark, as saved. */
  readonly bom: boolean;
  /** Offsets between the editor's text and the game text, which the model counts in. */
  readonly offsets: GameTextOffsets;
}

interface Pin {
  readonly uri: string;
  /** The window's name, compared without regard to case; else its index among the definitions. */
  readonly name: string | undefined;
  readonly index: number;
}

export class Preview implements PreviewApi, vscode.Disposable {
  private readonly extensionUri: vscode.Uri;
  private readonly output: vscode.LogOutputChannel;
  private readonly navigation: WidgetNavigation;
  private readonly memento: vscode.Memento;
  private readonly loop: RenderLoop;
  private readonly diagnostics = vscode.languages.createDiagnosticCollection('etch-preview');
  /** Problems of the mod project's window profiles (spec section 12). */
  private readonly profileDiagnostics =
    vscode.languages.createDiagnosticCollection('etch-profiles');
  private readonly profiles: ProfileStore;
  /** The view chosen for each window while the preview is open, by window name. */
  private readonly choices = new Map<string, ChoiceState>();
  /** The sample data: the chosen save, its country and province, the generated length. */
  private readonly data: PreviewData;
  /** The save to read again once the preview has painted, off the cold-open path. */
  private restoreSave: string | undefined;
  private readonly renderEmitter = new vscode.EventEmitter<PreviewRender>();
  private readonly paintEmitter = new vscode.EventEmitter<PreviewPaint>();
  private readonly subscriptions: vscode.Disposable[];

  private readonly liveGame: LiveGame | undefined;
  /** The live snapshots, the latest per window and playset (spec section 7). */
  private readonly snapshots: LiveSnapshots;
  private panel: vscode.WebviewPanel | undefined;
  private roots: string | undefined;
  /** The live game was asked to start and waits for the preview's playset. */
  private liveGameStartPending = false;
  private ready = false;
  /** A render was skipped while the panel was hidden. */
  private stale = false;
  private session: PreviewSession | undefined;
  private pin: Pin | undefined;
  /** The last previewed window, kept while the cursor is outside every definition. */
  private last: { uri: string; name: string | undefined } | undefined;
  private render: PreviewRender | undefined;
  /** What the last render drew from, to skip a render that would draw the same. */
  private renderKey: string | undefined;
  private lastDraw: HostMessage | undefined;
  private lastState: ViewState | undefined;
  /** The monitor's resolution in device pixels, as the webview last reported it. */
  private native: Screen | undefined;
  private renderCount = 0;
  private requestedAt: number | undefined;
  /** Game text files whose buffer changed, or closed, since the session last read them. */
  private readonly pending = new Map<string, vscode.Uri>();
  /** Files the session reads from an editor buffer rather than from disk. */
  private readonly fromBuffer = new Set<string>();
  /** The model diagnostics last published for each file, before texture problems are added. */
  private readonly published = new Map<string, vscode.Diagnostic[]>();
  /** The texture problems last reported for each file, added to its model diagnostics. */
  private readonly textureProblems = new Map<string, vscode.Diagnostic[]>();
  private readonly probes = new Map<number, (paint: PreviewPaint) => void>();
  /** The pointer over the preview, in screen pixels. */
  private pointer: Point | undefined;
  private lastOverlay: string | undefined;
  private lastMemento: PreviewMemento | undefined;
  /** The watchers of the session's textures and fonts on disk. */
  private watchers: vscode.Disposable | undefined;
  /** Textures and fonts changed on disk since the last render, by URI string. */
  private readonly changedAssets = new Map<string, vscode.Uri>();
  /** A texture or font was created or deleted: the session's folder listings are out of date. */
  private listingsChanged = false;

  readonly onDidRender = this.renderEmitter.event;
  readonly onDidPaint = this.paintEmitter.event;

  constructor(
    extensionUri: vscode.Uri,
    output: vscode.LogOutputChannel,
    navigation: WidgetNavigation,
    memento: vscode.Memento,
    liveGame?: LiveGame,
    pickMode?: PickMode,
    storageFolder?: string,
  ) {
    this.extensionUri = extensionUri;
    this.liveGame = liveGame;
    this.snapshots = new LiveSnapshots(storageFolder);
    this.output = output;
    this.navigation = navigation;
    this.memento = memento;
    this.profiles = new ProfileStore(extensionUri, output);
    this.data = new PreviewData(
      {
        changed: () => {
          this.request();
        },
        read: (path, ms) => {
          this.output.info(`Sample data: read ${path} in ${ms.toFixed(0)} ms.`);
        },
      },
      (path) => readFile(path),
    );
    this.native = validScreen(memento.get(NATIVE_SCREEN_KEY));
    this.loop = new RenderLoop(
      () => this.renderNow(),
      (error) => {
        this.fail(error);
      },
    );
    const profileWatcher = vscode.workspace.createFileSystemWatcher('**/.etch/profiles/*.jsonc');
    const profileChanged = (uri: vscode.Uri): void => {
      if (this.panel && isProfile(uri)) this.request();
    };
    this.subscriptions = [
      navigation.onDidHighlight(() => {
        this.updateOverlay();
      }),
      navigation.onDidToggle((toggle) => {
        this.toggle(toggle);
      }),
      profileWatcher,
      profileWatcher.onDidChange(profileChanged),
      profileWatcher.onDidCreate(profileChanged),
      profileWatcher.onDidDelete(profileChanged),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        if (this.panel && isProfile(document.uri)) this.request();
        if (!this.panel || gameTextKind(document.uri.path) === undefined) return;
        this.pending.set(document.uri.toString(), document.uri);
        this.request();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.panel && !this.pin && editor && isGui(editor.document.uri)) this.request();
      }),
      vscode.window.onDidChangeTextEditorSelection(({ textEditor }) => {
        if (this.panel && !this.pin && this.windowChanges(textEditor)) this.request();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        // The session is loaded again when the settings it was loaded with changed.
        if (this.panel && event.affectsConfiguration('etch')) this.request();
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const key = document.uri.toString();
        if (this.render?.uri.toString() !== key) this.forget(document.uri);
        // A buffer closed without saving: the playset reads the file from disk again.
        if (this.panel && this.fromBuffer.has(key)) {
          this.pending.set(key, document.uri);
          this.request();
        }
      }),
      ...(pickMode === undefined
        ? []
        : [
            pickMode.onDidPick((opened) => {
              void this.picked(opened);
            }),
          ]),
      ...(liveGame === undefined
        ? []
        : [
            liveGame.onDidPush((event) => {
              if (event.kind !== 'snapshot') return;
              if (event.snapshot !== undefined) void this.keepSnapshot(event.snapshot);
              else
                this.output.info(`No snapshot of pick ${String(event.seq)}: ${event.error ?? ''}.`);
            }),
          ]),
    ];
  }

  get current(): PreviewRender | undefined {
    return this.render;
  }

  get resolution(): PreviewResolution {
    return choosePreviewResolution(
      parseResolution(resolutionValue()) ?? { kind: 'default' },
      this.resolutionContext,
    );
  }

  get resolutionContext(): ResolutionContext {
    return { player: this.session?.player?.screen, native: this.native };
  }

  get notices(): readonly Notice[] {
    return this.lastState?.notices ?? [];
  }

  get viewState(): ViewState | undefined {
    return this.lastState;
  }

  get reloadState(): PreviewMemento | undefined {
    return this.lastMemento;
  }

  open(): void {
    if (this.panel) {
      this.panel.reveal(undefined, true);
      this.request();
      return;
    }
    this.attach(
      vscode.window.createWebviewPanel(
        PREVIEW_VIEW_TYPE,
        'Etch Preview',
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.distUri] },
      ),
    );
  }

  restore(panel: vscode.WebviewPanel, memento: unknown): void {
    if (this.panel) {
      panel.dispose();
      return;
    }
    const restored = mementoOf(memento);
    if (restored !== undefined) {
      this.last = { uri: restored.uri, name: restored.window };
      if (restored.pinned) {
        this.pin = { uri: restored.uri, name: restored.window, index: restored.index };
      }
    }
    this.attach(panel);
  }

  /** Makes a panel the preview's and renders into it. */
  private attach(panel: vscode.WebviewPanel): void {
    this.panel = panel;
    this.ready = false;
    this.roots = undefined;
    panel.webview.onDidReceiveMessage((message: WebviewMessage) => {
      this.receive(message);
    });
    panel.onDidChangeViewState(({ webviewPanel }) => {
      if (webviewPanel.visible && this.stale) this.request();
    });
    panel.onDidDispose(() => {
      this.closed();
    });
    void vscode.commands.executeCommand('setContext', PREVIEW_OPEN_CONTEXT, true);
    this.request();
  }

  startLiveGame(): void {
    if (this.liveGame === undefined) return;
    this.liveGameStartPending = true;
    if (this.session !== undefined) {
      this.startPendingLiveGame(this.session);
    } else {
      void vscode.window.showInformationMessage(
        'The live game starts with the playset of the previewed .gui file: open one.',
      );
    }
  }

  /** Starts the live game with the session's playset, if a start waits for one (spec section 6). */
  private startPendingLiveGame(session: PreviewSession): void {
    const game = this.liveGame;
    if (game === undefined || !this.liveGameStartPending) return;
    this.liveGameStartPending = false;
    const gameFolder = session.playset.gameFolder;
    if (gameFolder === undefined) {
      void vscode.window.showErrorMessage(
        'The live game needs the game folder: set etch.gamePath, or install EU4 through Steam.',
      );
      return;
    }
    void game.start({
      gameFolder,
      mods: session.playset.mods,
      display: { ...(this.native ?? this.resolution.screen), language: session.settings.language },
      editedRoot: session.playset.workspaceMod?.root,
      pickModeKey: pickKeySetting(),
    });
  }

  togglePin(): void {
    if (this.pin) {
      this.pin = undefined;
    } else if (this.render) {
      const { uri, file, window } = this.render;
      this.pin = {
        uri: uri.toString(),
        name: window.name,
        index: file.definitions.indexOf(window),
      };
    }
    this.request();
  }

  probe(points: readonly Point[]): Promise<PreviewPaint> {
    const message = this.lastDraw;
    if (!this.panel || message?.type !== 'draw') {
      return Promise.reject(new Error('the preview has drawn nothing yet'));
    }
    const id = ++this.renderCount;
    const answer = new Promise<PreviewPaint>((resolve) => this.probes.set(id, resolve));
    void this.panel.webview.postMessage({ ...message, id, probes: points } satisfies HostMessage);
    return answer;
  }

  idle(): Promise<void> {
    return this.loop.idle();
  }

  hover(point: Point | undefined): string | undefined {
    this.pointer = point;
    this.updateOverlay();
    const index = this.widgetIndexAt(point);
    return index < 0 || !this.render
      ? undefined
      : widgetHoverText(this.render.layout.widgets, index);
  }

  async click(point: Point): Promise<boolean> {
    const index = this.widgetIndexAt(point);
    const entry = this.render?.layout.widgets[index];
    if (entry === undefined || this.render?.source.document === undefined) return false;
    return this.navigation.revealSource(entry.widget.node.start);
  }

  private widgetIndexAt(point: Point | undefined): number {
    const widgets = this.render?.layout.widgets;
    return point === undefined || widgets === undefined ? -1 : widgetAt(widgets, point.x, point.y);
  }

  /** Posts the hovered and the highlighted widget's rects, when they changed. */
  private updateOverlay(): void {
    const render = this.render;
    const widgets = render?.layout.widgets ?? [];
    const hovered = this.widgetIndexAt(this.pointer);
    const highlight = this.navigation.highlighted;
    const selected =
      render &&
      highlight?.source !== undefined &&
      highlight.uri.toString() === render.uri.toString()
        ? laidOutIndexOf(widgets, highlight.source)
        : -1;
    const message: HostMessage = {
      type: 'overlay',
      ...(hovered < 0
        ? {}
        : { hover: { rect: rectOf(widgets[hovered]), text: widgetHoverText(widgets, hovered) } }),
      ...(selected < 0 ? {} : { selected: rectOf(widgets[selected]) }),
    };
    const key = JSON.stringify(message);
    if (key === this.lastOverlay) return;
    this.lastOverlay = key;
    if (this.ready) void this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    this.loop.dispose();
    this.watchers?.dispose();
    this.panel?.dispose();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.diagnostics.dispose();
    this.profileDiagnostics.dispose();
    this.renderEmitter.dispose();
    this.paintEmitter.dispose();
  }

  private get distUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.extensionUri, 'dist');
  }

  private request(): void {
    this.requestedAt ??= performance.timeOrigin + performance.now();
    this.loop.request();
  }

  /** Whether moving the cursor in an editor would preview another window. */
  private windowChanges(editor: vscode.TextEditor): boolean {
    const render = this.render;
    if (!isGui(editor.document.uri)) return false;
    if (render?.uri.toString() !== editor.document.uri.toString()) return true;
    // After an edit the change renders anyway.
    if (render.source.version !== editor.document.version) return false;
    const offset = render.source.offsets.toGame(editor.document.offsetAt(editor.selection.active));
    const top = widgetPathAt(render.file, offset)[0];
    return top !== undefined && top !== render.window;
  }

  private async renderNow(): Promise<void> {
    const panel = this.panel;
    if (panel === undefined) return;
    if (!panel.visible) {
      this.stale = true;
      return;
    }
    this.stale = false;
    const requestedAt = this.requestedAt ?? performance.timeOrigin + performance.now();
    this.requestedAt = undefined;

    const uri = this.target();
    if (uri === undefined) {
      this.allowRoots(panel, this.session?.roots ?? []);
      this.show({
        title: 'No window',
        file: '',
        notices: [{ severity: 'information', message: 'Open a .gui file to preview its windows.' }],
      });
      return;
    }

    const session = await this.sessionFor(uri);
    if (panel !== this.panel) return;
    if (this.restoreSave === undefined) {
      const saves = this.memento.get<Record<string, string>>(SAMPLE_SAVE_KEY) ?? {};
      this.restoreSave = saves[session.workspaceFolder] ?? '';
    }
    this.startPendingLiveGame(session);
    this.allowRoots(panel, session.roots);
    const { touched, changed } = await this.applyPending(session);
    const assetsChanged = await this.applyAssetChanges(session, panel);

    const source = await sourceText(uri);
    if (source === undefined) {
      this.show({
        title: 'No window',
        file: vscode.workspace.asRelativePath(uri),
        notices: [{ severity: 'error', message: 'The game cannot read this file in UTF-16.' }],
      });
      return;
    }
    const document = source.document;
    const place = await session.place(uri.fsPath);
    const file =
      (place?.wins === true ? session.guiFile(place.path) : undefined) ??
      readGuiFile(parseScript(source.text));
    const window = this.chooseWindow(uri, file, source);
    const shownPath = place?.path ?? vscode.workspace.asRelativePath(uri);
    if (window === undefined) {
      this.render = undefined;
      this.renderKey = undefined;
      this.navigation.setPreviewed(undefined);
      this.show({
        title: 'No window',
        file: shownPath,
        notices: [
          ...session.notices,
          { severity: 'information', message: 'This file defines no window to preview.' },
        ],
      });
      this.post({
        type: 'draw',
        id: ++this.renderCount,
        list: { version: DRAW_LIST_VERSION, ...this.resolution.screen, textures: [], draws: [] },
      });
      return;
    }

    // The window's profile, and the view the user chose of it.
    const screen = this.resolution.screen;
    const found = await this.profiles.load(session.playset, session.ui.index, file, window);
    if (panel !== this.panel) return;
    this.publishProfileProblems(found.project);
    const loaded = found.loaded;
    const choiceKey = (window.name ?? '').toLowerCase();
    let choice: ChoiceState | undefined;
    if (loaded !== undefined) {
      choice = this.choices.get(choiceKey) ?? initialChoice(loaded.profile);
      this.choices.set(choiceKey, choice);
    }
    const notices: Notice[] = [
      ...session.notices,
      ...found.notices.map((message) => ({ severity: 'warning' as const, message })),
    ];
    const snapshot =
      loaded === undefined || window.name === undefined
        ? undefined
        : await this.snapshots.get(sessionPlaysetKey(session), window.name);
    if (panel !== this.panel) return;
    const live = snapshot !== undefined && this.data.live ? snapshot : undefined;

    // Several events can answer one change (an edit also moves the selection).
    const key = [
      uri.toString(),
      source.version ?? 'disk',
      file.definitions.indexOf(window),
      this.pin !== undefined,
      screen.width,
      screen.height,
      session.serial,
      loaded?.key ?? '',
      JSON.stringify(choice ?? null),
      loaded === undefined ? '' : this.data.key,
      snapshot?.takenAt ?? '',
      this.liveIdentity(),
    ].join('|');
    if (!changed && !assetsChanged && key === this.renderKey) {
      // The same screen can come from another source (the setting, settings.txt, the monitor).
      if (this.lastState) {
        this.show({
          title: this.lastState.title,
          file: shownPath,
          notices,
          ...(this.lastState.menu === undefined ? {} : { menu: this.lastState.menu }),
          ...(this.lastState.data === undefined ? {} : { data: this.lastState.data }),
          ...(this.lastState.links === undefined ? {} : { links: this.lastState.links }),
        });
      }
      return;
    }
    this.renderKey = key;

    const facts = this.data.facts();
    const liveValues =
      loaded === undefined || live === undefined
        ? undefined
        : liveSelectors(loaded.profile, window, live, facts);
    const gameToggles =
      loaded === undefined || live === undefined || choice === undefined || liveValues === undefined
        ? undefined
        : liveDifferences(
            loaded.profile,
            window,
            screen,
            { ...viewChoiceOf(choice), facts, live: liveValues.values },
            live,
          );
    const view =
      loaded === undefined || choice === undefined
        ? undefined
        : evaluateView(loaded.profile, window, screen, {
            ...viewChoiceOf(choice),
            facts,
            ...(liveValues === undefined ? {} : { live: liveValues.values }),
            ...(gameToggles === undefined ? {} : { gameToggles }),
          });
    const matched = live === undefined ? undefined : liveMatch(live, window);
    const localiseKey = (key: string): string | undefined => session.localisation?.get(key);
    const choiceOfSave = this.data.choice;
    const sample =
      loaded === undefined
        ? undefined
        : sampleData(loaded.profile, window, view, {
            ...(choiceOfSave === undefined ? {} : { save: choiceOfSave }),
            localise: localiseKey,
            length: this.data.length,
            ...(matched === undefined ? {} : { live: matched.texts }),
            template: (name) => {
              const found = session.ui.index.guiType(name);
              const owner = found === undefined ? undefined : session.guiFile(found.path);
              return found === undefined || owner === undefined
                ? undefined
                : { widget: found.item, file: owner };
            },
          });
    const layout = await layOutPreview(session.ui, session.assets, file, window, {
      screen,
      localise: session.localise,
      ...(view === undefined ? {} : { view: layoutViewOf(view) }),
      ...(sample === undefined ? {} : { content: layoutContentOf(sample) }),
    });
    if (panel !== this.panel) return;
    const drawList: DrawList = {
      ...layout.drawList,
      textures: layout.drawList.textures.map((path) =>
        webviewUrl(panel, session.ui.gameFile(path)?.absolutePath ?? path),
      ),
    };
    const id = ++this.renderCount;
    const pinned = this.pin !== undefined;
    this.render = {
      id,
      uri,
      file,
      window,
      layout,
      drawList,
      source,
      pinned,
      requestedAt,
      ...(loaded === undefined || view === undefined ? {} : { view: { profile: loaded, view } }),
      ...(sample === undefined ? {} : { sample }),
    };
    this.last = { uri: uri.toString(), name: window.name };
    // The draw goes first: diagnostics are not on the warm reload's path to pixels.
    this.post({ type: 'draw', id, list: drawList });
    this.remember({
      uri: uri.toString(),
      window: window.name,
      index: file.definitions.indexOf(window),
      pinned,
    });
    panel.title = `Preview ${window.name ?? window.kind}`;
    this.show({
      title: window.name ?? window.kind,
      file: shownPath,
      notices,
      ...(loaded === undefined || view === undefined || choice === undefined
        ? {}
        : {
            menu: viewMenu(
              loaded.profile,
              view,
              choice,
              loaded.projectFile !== undefined,
              liveValues?.unknown ?? [],
            ),
          }),
      ...(loaded === undefined
        ? {}
        : {
            data: this.data.menu(
              sample,
              session.playset.mods.map((m) => m.name),
              localiseKey,
              this.liveLayer(snapshot, matched?.unmatched ?? 0),
            ),
          }),
      ...(loaded === undefined || view === undefined
        ? {}
        : {
            links: activeLinks(loaded.profile, view).map((link) => ({
              window: link.window,
              label: link.label ?? `The game opens ${link.window} instead.`,
            })),
          }),
    });
    this.navigation.setPreviewed(
      document && source.version !== undefined
        ? {
            document,
            version: source.version,
            file,
            window,
            offsets: source.offsets,
            layout: layout.widgets,
            ...(view === undefined ? {} : { view }),
            ...(sample === undefined ? {} : { sample }),
          }
        : undefined,
    );
    this.updateOverlay();
    this.renderEmitter.fire(this.render);

    const model: ModelDiagnostic[] = [
      ...(place?.wins === true
        ? session.ui.diagnostics(place.path)
        : guiDiagnostics(file, session.ui.index, session.ui.exists)),
      ...layout.diagnostics,
    ];
    this.publish(uri, model, source);
    for (const other of touched) {
      if (other.uri.toString() === uri.toString()) continue;
      this.publish(other.uri, session.ui.diagnostics(other.path), other.source);
    }
  }

  /** The `.gui` file to preview: the pinned one, else the active editor's, else the last one. */
  private target(): vscode.Uri | undefined {
    if (this.pin) return vscode.Uri.parse(this.pin.uri);
    const editor = vscode.window.activeTextEditor;
    if (editor && isGui(editor.document.uri)) return editor.document.uri;
    return this.last === undefined ? undefined : vscode.Uri.parse(this.last.uri);
  }

  /**
   * The previewed window: the pinned one, else the top-level definition that holds the cursor of
   * the file's active editor, else the one previewed last in this file, else the file's first.
   */
  private chooseWindow(uri: vscode.Uri, file: GuiFile, source: SourceText): Widget | undefined {
    const key = uri.toString();
    if (this.pin?.uri === key) {
      return named(file, this.pin.name) ?? file.definitions[this.pin.index];
    }
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.toString() === key) {
      const offset = source.offsets.toGame(editor.document.offsetAt(editor.selection.active));
      const top = widgetPathAt(file, offset)[0];
      if (top !== undefined) return top;
    }
    const last = this.last?.uri === key ? named(file, this.last.name) : undefined;
    return last ?? file.definitions[0];
  }

  /** The session of a file's playset, loaded again when the file or the settings need another. */
  private async sessionFor(uri: vscode.Uri): Promise<PreviewSession> {
    const settings = readSettings(uri);
    const workspaceFolder =
      vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? dirname(uri.fsPath);
    if (!this.listingsChanged && this.session?.serves(settings, workspaceFolder, uri.fsPath)) {
      return this.session;
    }

    const started = performance.now();
    this.listingsChanged = false;
    const session = await PreviewSession.load(settings, workspaceFolder, uri.fsPath);
    this.session = session;
    this.watch(session);
    const { gameFolder, mods } = session.playset;
    this.output.info(
      `Preview playset loaded in ${(performance.now() - started).toFixed(0)} ms: ` +
        `game ${gameFolder ?? 'not found'}, mods ${mods.map((m) => m.name).join(', ') || 'none'}`,
    );
    for (const notice of session.notices) this.output[severityLog(notice)](notice.message);
    // The new session read the files from disk; unsaved buffers count instead (etch#15).
    this.fromBuffer.clear();
    for (const document of vscode.workspace.textDocuments) {
      if (document.isDirty && gameTextKind(document.uri.path) !== undefined) {
        this.pending.set(document.uri.toString(), document.uri);
      }
    }
    return session;
  }

  /**
   * Gives the session the game text of every changed document. Returns the interface files it
   * read, for their diagnostics, and whether anything the playset reads changed.
   */
  private async applyPending(session: PreviewSession): Promise<{
    touched: { uri: vscode.Uri; path: string; source: SourceText }[];
    changed: boolean;
  }> {
    const touched: { uri: vscode.Uri; path: string; source: SourceText }[] = [];
    let changed = false;
    const uris = [...this.pending.values()];
    this.pending.clear();
    for (const uri of uris) {
      if (uri.scheme !== 'file') continue;
      const source = await sourceText(uri);
      if (source === undefined) continue;
      if (source.document) this.fromBuffer.add(uri.toString());
      else this.fromBuffer.delete(uri.toString());
      if (!(await session.update(uri.fsPath, source.text))) continue;
      changed = true;
      const place = await session.place(uri.fsPath);
      if (source.document && place !== undefined && /\.(?:gui|gfx)$/i.test(place.path)) {
        touched.push({ uri, path: place.path, source });
      }
    }
    return { touched, changed };
  }

  /**
   * Watches the session's folders for textures and fonts that change on disk. A changed file is
   * read again by the next render; a created or deleted one loads the session again, since the
   * playset keeps its folder listings.
   */
  private watch(session: PreviewSession): void {
    this.watchers?.dispose();
    const changed = (uri: vscode.Uri, listing: boolean): void => {
      if (session !== this.session || !this.panel || !isAsset(uri)) return;
      if (listing) this.listingsChanged = true;
      this.changedAssets.set(uri.toString(), uri);
      this.request();
    };
    this.watchers = vscode.Disposable.from(
      ...session.watchedRoots.map((root) => {
        // Every file, filtered by `isAsset`: a glob would compare the extension with case.
        const pattern = new vscode.RelativePattern(vscode.Uri.file(root), '**/*');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watcher.onDidChange((uri) => {
          changed(uri, false);
        });
        watcher.onDidCreate((uri) => {
          changed(uri, true);
        });
        watcher.onDidDelete((uri) => {
          changed(uri, true);
        });
        return watcher;
      }),
    );
  }

  /**
   * Makes the session and the webview read the textures and fonts changed on disk again. Returns
   * whether the playset reads any of them.
   */
  private async applyAssetChanges(
    session: PreviewSession,
    panel: vscode.WebviewPanel,
  ): Promise<boolean> {
    const uris = [...this.changedAssets.values()];
    this.changedAssets.clear();
    const urls = new Set<string>();
    let read = false;
    for (const uri of uris) {
      // A deleted or hidden file's texture may still be loaded under its own URL.
      urls.add(webviewUrl(panel, uri.fsPath));
      const place = await session.place(uri.fsPath);
      if (place === undefined) continue;
      session.assets.forget(place.path);
      const winner = session.ui.gameFile(place.path);
      if (winner !== undefined) urls.add(webviewUrl(panel, winner.absolutePath));
      read ||= place.wins;
    }
    if (urls.size > 0) this.post({ type: 'invalidate', urls: [...urls] });
    return read;
  }

  /**
   * Lets the webview read the playset's folders. Changing the roots reloads the webview, so the
   * page is set only once they are known, and the last draw is posted again when it is ready.
   */
  private allowRoots(panel: vscode.WebviewPanel, folders: readonly string[]): void {
    const roots = [this.distUri, ...folders.map((folder) => vscode.Uri.file(folder))];
    const key = roots.map((root) => root.toString()).join('\n');
    if (key === this.roots) return;
    const first = this.roots === undefined;
    this.roots = key;
    this.ready = false;
    panel.webview.options = { enableScripts: true, localResourceRoots: roots };
    if (first) panel.webview.html = previewHtml(panel.webview, this.extensionUri);
  }

  private show(state: Omit<ViewState, 'pinned' | 'pinnable' | 'resolution'>): void {
    const { screen, source } = this.resolution;
    const value = resolutionValue();
    const full: ViewState = {
      ...state,
      notices:
        parseResolution(value) === undefined
          ? [
              ...state.notices,
              {
                severity: 'warning',
                message:
                  `etch.${RESOLUTION_SETTING} "${value}" is not default, native or a width × ` +
                  'height such as 1920x1080; the preview uses the default.',
              },
            ]
          : state.notices,
      pinned: this.pin !== undefined,
      pinnable: this.pin !== undefined || this.render !== undefined,
      resolution: { text: formatResolution(screen), source },
    };
    if (JSON.stringify(full) === JSON.stringify(this.lastState)) return;
    this.lastState = full;
    if (this.ready) void this.panel?.webview.postMessage({ type: 'state', state: full });
  }

  private remember(memento: PreviewMemento): void {
    if (JSON.stringify(memento) === JSON.stringify(this.lastMemento)) return;
    this.lastMemento = memento;
    if (this.ready) void this.panel?.webview.postMessage({ type: 'remember', memento });
  }

  private post(message: HostMessage): void {
    if (message.type === 'draw') this.lastDraw = message;
    if (this.ready) void this.panel?.webview.postMessage(message);
  }

  private receive(message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        if (this.lastState)
          void this.panel?.webview.postMessage({ type: 'state', state: this.lastState });
        if (this.lastDraw) void this.panel?.webview.postMessage(this.lastDraw);
        if (this.lastMemento) {
          void this.panel?.webview.postMessage({ type: 'remember', memento: this.lastMemento });
        }
        this.lastOverlay = undefined;
        this.updateOverlay();
        break;
      case 'monitor':
        this.monitor(message.screen);
        break;
      case 'resolution':
        void vscode.commands.executeCommand(CHOOSE_RESOLUTION);
        break;
      case 'pointer':
        this.hover(message.point);
        break;
      case 'click':
        void this.click(message.point);
        break;
      case 'painted':
        this.painted({
          id: message.id,
          painted: message.painted,
          problems: message.problems,
          skipped: message.skipped,
          at: message.at,
          ...(message.pixels === undefined ? {} : { pixels: message.pixels }),
        });
        break;
      case 'failed':
        this.output.error(`The preview could not draw: ${message.message}`);
        if (message.id !== undefined) {
          this.painted({
            id: message.id,
            painted: false,
            problems: [],
            skipped: [],
            at: Date.now(),
            error: message.message,
          });
        }
        break;
      case 'pin':
        if (message.pinned !== (this.pin !== undefined)) this.togglePin();
        break;
      case 'startLiveGame':
        this.startLiveGame();
        break;
      case 'view':
        void this.viewAction(message.action);
        break;
      case 'data':
        void this.dataAction(message.action);
        break;
      case 'openLink':
        void this.openLink(message.window);
        break;
    }
  }

  async viewAction(action: ViewAction): Promise<void> {
    const render = this.render;
    const viewed = render?.view;
    if (render === undefined || viewed === undefined) return;
    const key = (render.window.name ?? '').toLowerCase();
    const choice = this.choices.get(key) ?? initialChoice(viewed.profile.profile);
    if (action.kind === 'saveView') {
      await this.saveView(
        render.window.name ?? '',
        viewed.profile,
        viewed.view,
        choice,
        action.label,
      );
      return;
    }
    if (action.kind === 'openProfile') {
      const projectExists =
        viewed.profile.projectFile !== undefined &&
        viewed.profile.profile.layers.at(-1)?.source === 'mod project';
      const target = projectExists ? viewed.profile.projectFile : viewed.profile.topFile;
      if (target !== undefined) {
        await vscode.window.showTextDocument(target, { viewColumn: vscode.ViewColumn.One });
      }
      return;
    }
    this.choices.set(key, applyViewAction(viewed.profile.profile, choice, action));
    this.request();
  }

  async dataAction(action: DataAction): Promise<void> {
    const session = this.session;
    const localise = (key: string): string | undefined => session?.localisation?.get(key);
    switch (action.kind) {
      case 'chooseSave': {
        const path = await this.pickSave(session);
        if (path !== undefined) await this.chooseSave(path);
        return;
      }
      case 'dropSave':
        this.data.drop();
        await this.rememberSave(undefined);
        return;
      case 'chooseCountry': {
        const picked = await vscode.window.showQuickPick(
          this.data
            .countries(localise)
            .map((c) => ({ label: c.label, description: c.detail, tag: c.tag })),
          {
            title: 'Country of the save',
            placeHolder: 'The country whose view the preview shows',
            matchOnDescription: true,
          },
        );
        if (picked !== undefined) this.chooseData({ country: picked.tag });
        return;
      }
      case 'chooseProvince': {
        const provinces = this.data.provinces(localise);
        const own = provinces.filter((p) => p.own);
        const items: (vscode.QuickPickItem & { id?: number })[] = [];
        const add = (label: string, list: typeof provinces): void => {
          if (list.length === 0) return;
          items.push({ label, kind: vscode.QuickPickItemKind.Separator });
          for (const p of list) items.push({ label: p.label, description: p.detail, id: p.id });
        };
        add('Of the chosen country', own);
        add(
          own.length === 0 ? 'Provinces' : 'Others, own or foreign',
          provinces.filter((p) => !p.own),
        );
        const picked = await vscode.window.showQuickPick(items, {
          title: 'Province of the save',
          placeHolder: 'Any province, own or foreign',
          matchOnDescription: true,
        });
        if (picked?.id !== undefined) this.chooseData({ province: picked.id });
        return;
      }
      case 'length':
        this.data.length = action.length;
        this.request();
        return;
      case 'live':
        this.data.live = action.on;
        this.request();
        return;
      case 'refreshLive':
        await this.takeSnapshot();
        return;
    }
  }

  // ---- The live game (spec section 7) ----------------------------------------------------------

  async takeSnapshot(): Promise<boolean> {
    const game = this.liveGame;
    const name = this.render?.window.name;
    if (game === undefined || name === undefined) return false;
    try {
      const answer = await game.snapshot(name);
      if (answer === undefined) {
        void vscode.window.showInformationMessage(
          'A live snapshot comes from the live game: start it first (Etch: Start the Live Game).',
        );
        return false;
      }
      await this.keepSnapshot(answer);
      await this.idle();
      return true;
    } catch (error) {
      const code = error instanceof PipeError ? error.code : undefined;
      void vscode.window.showInformationMessage(
        code === 'not_open'
          ? `The live game does not show ${name}: open it in the game, then take the snapshot.`
          : code === 'stale'
            ? `${name} is stale in the live game (a reload freed its definition): restart the live game first.`
            : `No live snapshot: ${String(error)}`,
      );
      return false;
    }
  }

  /** Keeps a snapshot from the live game as its window's latest, and draws it. */
  private async keepSnapshot(answer: SnapshotAnswer): Promise<void> {
    const game = this.liveGame;
    const request = game?.request;
    if (game === undefined || request === undefined) return;
    const files = game.files;
    const winner = answer.file === undefined ? undefined : await files?.find(answer.file);
    const fileHash =
      winner === undefined
        ? undefined
        : await readFile(winner.absolutePath).then(
            (bytes) => createHash('sha256').update(bytes).digest('hex'),
            () => undefined,
          );
    const snapshot = snapshotOf(answer, {
      takenAt: new Date(),
      save: game.saveName,
      fileHash,
      game: game.identity,
    });
    const key = playsetKey(
      request.gameFolder,
      request.mods.map((m) => m.name),
    );
    await this.snapshots.put(key, snapshot);
    this.output.info(
      `Live snapshot of ${snapshot.window}: ${String(snapshot.widgets.length)} widgets, ` +
        `${String(snapshot.stale)} stale left out, read in ${answer.readMs.toFixed(1)} ms.`,
    );
    this.request();
  }

  /**
   * A pick pins the preview on the picked widget's top-level window, its view from the live
   * snapshot that follows: the selectors the profile recognises set to `live` and what it does not
   * know as toggles from the game (spec section 7). A pick is a moment: the preview does not follow
   * the game afterwards.
   */
  private async picked(opened: PickOpened): Promise<void> {
    const top = opened.pick.chain.at(-1);
    const winner = top?.file === undefined ? undefined : await this.liveGame?.files?.find(top.file);
    if (winner === undefined || opened.pick.window === '') return;
    // The window by its name; the session finds it in the file when it lays it out.
    this.pin = {
      uri: vscode.Uri.file(winner.absolutePath).toString(),
      name: opened.pick.window,
      index: 0,
    };
    // The game decides now: no view, no selector set by hand, no hand toggles.
    this.choices.set(opened.pick.window.toLowerCase(), { view: undefined, set: {}, toggles: {} });
    this.data.live = true;
    if (this.panel) this.request();
    else this.open();
  }

  /** The live game process, which tells a snapshot of this game from an older one. */
  private liveIdentity(): string {
    const id = this.liveGame?.identity;
    return id === undefined ? '' : `${String(id.pid)}:${String(id.startMs)}`;
  }

  /** What `Data ▾` says of the live snapshot. */
  private liveLayer(snapshot: LiveSnapshot | undefined, unmatched: number): LiveLayer {
    const game = this.liveGame;
    const running = game?.state.status === 'ready' || game?.state.status === 'stale';
    if (snapshot === undefined) return { detail: undefined, canRefresh: running };
    const at = new Date(snapshot.takenAt);
    const id = game?.identity;
    const older =
      (snapshot.game !== undefined &&
        (id === undefined ||
          id.pid !== snapshot.game.pid ||
          id.startMs !== snapshot.game.startMs)) ||
      (snapshot.save !== undefined &&
        game?.saveName !== undefined &&
        snapshot.save !== game.saveName);
    const parts = [
      `as of ${at.toLocaleTimeString()}${snapshot.save === undefined ? '' : `, ${snapshot.save}`}`,
      ...(older ? ['older'] : []),
      ...(unmatched > 0
        ? [
            `${String(unmatched)} ${unmatched === 1 ? 'value no longer matches' : 'values no longer match'}`,
          ]
        : []),
    ];
    return { detail: parts.join(' · '), canRefresh: running };
  }

  async chooseSave(path: string): Promise<void> {
    await this.data.open(path);
    await this.rememberSave(this.data.path);
    await this.idle();
  }

  chooseData(choice: { readonly country?: string; readonly province?: number }): void {
    if (choice.country !== undefined) this.data.chooseCountry(choice.country);
    if (choice.province !== undefined) this.data.chooseProvince(choice.province);
  }

  dataChoices(): DataChoices {
    const localise = (key: string): string | undefined => this.session?.localisation?.get(key);
    return {
      countries: this.data.countries(localise).map((c) => c.tag),
      provinces: this.data.provinces(localise).map((p) => p.id),
      ...(this.data.choice?.country === undefined ? {} : { country: this.data.choice.country }),
      ...(this.data.choice?.province === undefined ? {} : { province: this.data.choice.province }),
    };
  }

  async openLink(window: string): Promise<boolean> {
    const session = this.session;
    const found = session?.ui.index.guiType(window);
    const absolute =
      found === undefined
        ? undefined
        : (await session?.playset.files.find(found.path))?.absolutePath;
    const file = found === undefined ? undefined : session?.guiFile(found.path);
    if (found === undefined || absolute === undefined || file === undefined) {
      void vscode.window.showWarningMessage(`Etch: the playset defines no window ${window}.`);
      return false;
    }
    this.pin = {
      uri: vscode.Uri.file(absolute).toString(),
      name: found.item.name,
      index: file.definitions.indexOf(found.item),
    };
    this.request();
    await this.idle();
    return true;
  }

  /**
   * Asks for a save: those of the player's `save games/` (read only) and the live game's private
   * saves, newest first, or any file (spec section 5). An ironman save is listed as not readable.
   */
  private async pickSave(session: PreviewSession | undefined): Promise<string | undefined> {
    const folder = session?.playset.profileFolder;
    const sources = [
      {
        label: "The player's saves",
        folder: folder === undefined ? undefined : savesFolder(folder),
      },
      { label: "The live game's saves", folder: this.liveGame?.savesFolder },
    ];
    const items: (vscode.QuickPickItem & { path?: string })[] = [];
    for (const source of sources) {
      if (source.folder === undefined) continue;
      const saves = await listSaves(source.folder);
      if (saves.length === 0) continue;
      items.push({ label: source.label, kind: vscode.QuickPickItemKind.Separator });
      for (const save of [...saves].sort((a, b) => b.modifiedMs - a.modifiedMs)) {
        items.push({
          label: save.name,
          description: [
            new Date(save.modifiedMs).toLocaleString(),
            ...(save.ironman ? ['ironman, not readable'] : []),
          ].join(' · '),
          path: save.path,
        });
      }
    }
    items.push({ label: '$(folder-opened) Choose a save file…' });
    const picked = await vscode.window.showQuickPick(items, {
      title: 'Save for sample data',
      placeHolder: 'A text save; an ironman save cannot be read',
    });
    if (picked === undefined) return undefined;
    if (picked.path !== undefined) return picked.path;
    const chosen = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'EU4 saves': ['eu4'] },
      ...(folder === undefined ? {} : { defaultUri: vscode.Uri.file(savesFolder(folder)) }),
      openLabel: 'Use for sample data',
    });
    return chosen?.[0]?.fsPath;
  }

  /** Keeps the chosen save's path for the workspace folder, to read it again next time. */
  private async rememberSave(path: string | undefined): Promise<void> {
    const folder = this.session?.workspaceFolder;
    if (folder === undefined) return;
    const saves = Object.entries(this.memento.get<Record<string, string>>(SAMPLE_SAVE_KEY) ?? {});
    const kept = saves.filter(([key]) => key !== folder);
    await this.memento.update(
      SAMPLE_SAVE_KEY,
      Object.fromEntries(path === undefined ? kept : [...kept, [folder, path]]),
    );
  }

  /** An eye or a radio of the Widget Outline: a hand toggle of the previewed window. */
  private toggle(toggle: OutlineToggle): void {
    const render = this.render;
    const viewed = render?.view;
    if (render === undefined || viewed === undefined) return;
    const key = (render.window.name ?? '').toLowerCase();
    const choice = this.choices.get(key) ?? initialChoice(viewed.profile.profile);
    this.choices.set(
      key,
      toggle.kind === 'widget'
        ? toggleWidget(choice, viewed.view, render.window, toggle.widget, toggle.shown)
        : chooseMember(choice, viewed.view, render.window, toggle.group, toggle.value),
    );
    this.request();
  }

  /**
   * **Save as view**: the selectors and hand toggles under a name, as a view of the mod
   * project's own profile file, which it creates when needed (spec section 4).
   */
  private async saveView(
    window: string,
    loaded: LoadedProfile,
    view: WindowView,
    choice: ChoiceState,
    named: string | undefined,
  ): Promise<void> {
    const file = loaded.projectFile;
    if (file === undefined) {
      void vscode.window.showInformationMessage(
        'Save as view writes into the mod project, beside its descriptor.mod: open a file of a mod.',
      );
      return;
    }
    const label =
      named ??
      (await vscode.window.showInputBox({
        title: 'Save as View',
        prompt: `A name for this view of ${window}, saved in ${vscode.workspace.asRelativePath(file)}`,
        validateInput: (text) => (text.trim() === '' ? 'Give the view a name.' : undefined),
      }));
    if (label === undefined) return;
    const mine = loaded.profile.views
      .filter((v) => v.origin.source === 'mod project')
      .map((v) => v.id);
    const id = viewId(label.trim(), loaded.profile, mine);
    const document = vscode.workspace.textDocuments.find(
      (d) => d.uri.toString() === file.toString(),
    );
    try {
      const before = document?.getText() ?? (await readText(file));
      const after = withView(before, window, id, savedView(label.trim(), view, choice));
      if (document !== undefined) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(file, new vscode.Range(0, 0, document.lineCount, 0), after);
        await vscode.workspace.applyEdit(edit);
        await document.save();
      } else {
        await mkdir(dirname(file.fsPath), { recursive: true });
        await writeFile(file.fsPath, after, 'utf8');
      }
    } catch (error) {
      void vscode.window.showErrorMessage(
        `Save as view could not write ${vscode.workspace.asRelativePath(file)}: ${messageOf(error)}`,
      );
      return;
    }
    this.choices.set(window.toLowerCase(), { ...choice, view: id });
    this.request();
  }

  /** Publishes the problems of the mod project's profile file, with their lines. */
  private publishProfileProblems(project: ProjectProblems | undefined): void {
    this.profileDiagnostics.clear();
    if (project === undefined) return;
    const lines = lineStarts(project.text);
    const position = (offset: number): vscode.Position => {
      let line = 0;
      while (line + 1 < lines.length && (lines[line + 1] ?? Infinity) <= offset) line++;
      return new vscode.Position(line, offset - (lines[line] ?? 0));
    };
    this.profileDiagnostics.set(
      project.uri,
      project.diagnostics.map((found: ProfileDiagnostic) => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(position(found.start), position(found.end)),
          found.message,
          SEVERITY[found.severity],
        );
        diagnostic.source = 'Etch';
        diagnostic.code = found.code;
        return diagnostic;
      }),
    );
  }

  /** Keeps the monitor's resolution, and lays out again when the preview uses it. */
  private monitor(reported: Screen): void {
    const screen = validScreen(reported);
    if (screen === undefined) return;
    if (this.native?.width === screen.width && this.native.height === screen.height) return;
    this.native = screen;
    void this.memento.update(NATIVE_SCREEN_KEY, screen);
    this.request();
  }

  private painted(paint: PreviewPaint): void {
    const probe = this.probes.get(paint.id);
    if (probe) {
      this.probes.delete(paint.id);
      probe(paint);
    }
    const render = this.render;
    if (render?.id === paint.id && paint.problems.length > 0) {
      this.publishTextureProblems(render, paint.problems);
    }
    this.paintEmitter.fire(paint);
    // The save last used is read once the preview has painted without it (spec section 5).
    const restore = this.restoreSave;
    if (restore !== undefined && paint.painted) {
      this.restoreSave = '';
      if (restore !== '') void this.data.open(restore);
    }
  }

  /** Reports the textures the webview could not load on the widgets that draw them. */
  private publishTextureProblems(render: PreviewRender, problems: readonly TextureFailure[]): void {
    const starts = new Map<number, Widget>();
    for (const { widget } of allWidgets(render.file)) starts.set(widget.node.start, widget);
    const extra: vscode.Diagnostic[] = [];
    for (const problem of problems) {
      const texture = render.drawList.textures.indexOf(problem.url);
      const path = render.layout.drawList.textures[texture] ?? problem.url;
      const sources = new Set<number>();
      for (const draw of render.drawList.draws) {
        const uses =
          draw.kind === 'progress'
            ? ('texture' in draw.first && draw.first.texture === texture) ||
              ('texture' in draw.second && draw.second.texture === texture)
            : draw.texture === texture ||
              (draw.kind === 'masked' && draw.mask === texture) ||
              (draw.kind === 'sprite' && draw.text?.texture === texture);
        if (uses) sources.add(draw.source);
      }
      for (const source of sources) {
        const widget = starts.get(source);
        if (widget === undefined) continue;
        extra.push(
          toDiagnostic(
            {
              severity: 'warning',
              code: 'unreadable-file',
              start: widget.node.key.start,
              end: widget.node.key.end,
              message: `Texture ${path} cannot be drawn: ${problem.message}.`,
            },
            render.source,
          ),
        );
      }
    }
    const key = render.uri.toString();
    this.textureProblems.set(key, extra);
    this.diagnostics.set(render.uri, [...(this.published.get(key) ?? []), ...extra]);
  }

  /** Publishes a file's model diagnostics; its texture problems go until the next paint. */
  private publish(uri: vscode.Uri, found: readonly ModelDiagnostic[], source: SourceText): void {
    this.textureProblems.delete(uri.toString());
    this.republish(uri, found, source);
  }

  /** Publishes a file's model diagnostics and keeps the texture problems last reported for it. */
  private republish(uri: vscode.Uri, found: readonly ModelDiagnostic[], source: SourceText): void {
    const key = uri.toString();
    const diagnostics = found.map((d) => toDiagnostic(d, source));
    this.published.set(key, diagnostics);
    this.diagnostics.set(uri, [...diagnostics, ...(this.textureProblems.get(key) ?? [])]);
  }

  private forget(uri: vscode.Uri): void {
    this.published.delete(uri.toString());
    this.textureProblems.delete(uri.toString());
    this.diagnostics.delete(uri);
  }

  private fail(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (this.panel && this.roots === undefined) this.allowRoots(this.panel, []);
    this.output.error(
      `Preview failed: ${error instanceof Error ? (error.stack ?? message) : message}`,
    );
    this.show({
      title: this.lastState?.title ?? 'Error',
      file: this.lastState?.file ?? '',
      notices: [{ severity: 'error', message: `The preview failed: ${message}` }],
    });
  }

  private closed(): void {
    this.panel = undefined;
    this.liveGameStartPending = false;
    this.ready = false;
    this.roots = undefined;
    this.session = undefined;
    this.watchers?.dispose();
    this.watchers = undefined;
    this.changedAssets.clear();
    this.listingsChanged = false;
    this.lastMemento = undefined;
    this.render = undefined;
    this.renderKey = undefined;
    this.pointer = undefined;
    this.lastOverlay = undefined;
    this.navigation.setPreviewed(undefined);
    this.lastDraw = undefined;
    this.lastState = undefined;
    this.pin = undefined;
    this.pending.clear();
    this.fromBuffer.clear();
    this.published.clear();
    this.diagnostics.clear();
    this.profileDiagnostics.clear();
    this.choices.clear();
    for (const resolve of this.probes.values()) {
      resolve({
        id: -1,
        painted: false,
        problems: [],
        skipped: [],
        at: Date.now(),
        error: 'closed',
      });
    }
    this.probes.clear();
    void vscode.commands.executeCommand('setContext', PREVIEW_OPEN_CONTEXT, false);
  }
}

function readSettings(uri: vscode.Uri): SessionSettings {
  const settings = vscode.workspace.getConfiguration('etch', uri);
  return {
    gamePath: settings.get<string>('gamePath', ''),
    playset: settings.get<string[]>('playset', []),
    language: settings.get<string>('language', DEFAULT_LANGUAGE),
  };
}

/** The `etch.previewResolution` setting as written. */
function resolutionValue(): string {
  return vscode.workspace.getConfiguration('etch').get<string>(RESOLUTION_SETTING, 'default');
}

/** A screen from storage or the webview, `undefined` unless both sides are valid. */
function validScreen(value: unknown): Screen | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { width, height } = value as Partial<Screen>;
  return typeof width === 'number' && typeof height === 'number' && isSide(width) && isSide(height)
    ? { width, height }
    : undefined;
}

/** Whether a file is a mod project's window profile, `.etch/profiles/<window>.jsonc`. */
function isProfile(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && /\/\.etch\/profiles\/[^/]+\.jsonc$/i.test(uri.path);
}

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isGui(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && /\.gui$/i.test(uri.path);
}

/** Whether a file is a texture or a font, which layout and the webview read from disk. */
function isAsset(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && /\.(?:dds|tga|fnt)$/i.test(uri.path);
}

/** The URL the webview fetches a file of the playset from. */
function webviewUrl(panel: vscode.WebviewPanel, absolutePath: string): string {
  return panel.webview.asWebviewUri(vscode.Uri.file(absolutePath)).toString();
}

/** A memento the webview kept, checked: it comes back from VS Code's storage. */
function mementoOf(state: unknown): PreviewMemento | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const { uri, window, index, pinned } = state as Record<string, unknown>;
  if (typeof uri !== 'string' || (window !== undefined && typeof window !== 'string')) {
    return undefined;
  }
  return {
    uri,
    window,
    index: typeof index === 'number' && Number.isInteger(index) ? index : 0,
    pinned: pinned === true,
  };
}

function openDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  const key = uri.toString();
  return vscode.workspace.textDocuments.find((d) => d.uri.toString() === key);
}

function named(file: GuiFile, name: string | undefined): Widget | undefined {
  if (name === undefined) return undefined;
  const key = name.toLowerCase();
  return file.definitions.find((w) => w.name?.toLowerCase() === key);
}

const SEVERITY: Readonly<Record<ModelDiagnostic['severity'], vscode.DiagnosticSeverity>> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

/**
 * The game text of a `.gui`, `.gfx` or localisation file: its open document's, as the next save
 * writes it, else the file's on disk. `undefined` for a document in UTF-16, which the game cannot
 * read, or a file that cannot be read.
 */
async function sourceText(uri: vscode.Uri): Promise<SourceText | undefined> {
  const kind = gameTextKind(uri.path);
  if (kind === undefined) return undefined;
  const document = openDocument(uri);
  if (document === undefined) {
    const game = await readGameText(uri).catch(() => undefined);
    if (game === undefined) return undefined;
    return { document, version: undefined, text: game.text, bom: game.bom, offsets: IDENTITY };
  }
  const version = document.version;
  const text = document.getText();
  const encoding = await saveEncodingOf(document, text).catch(() => undefined);
  const mapped = encoding && mapGameText(text, kind, encoding);
  if (!mapped) return undefined;
  return { document, version, text: mapped.text, bom: encoding.id === 'utf8bom', offsets: mapped };
}

const IDENTITY: GameTextOffsets = { toGame: (offset) => offset, toEditor: (offset) => offset };

/** The editor position of a game text offset. */
function positionOf(source: SourceText, offset: number): vscode.Position {
  if (source.document && source.version === source.document.version) {
    return source.document.positionAt(source.offsets.toEditor(offset));
  }
  // Read from disk: lines and columns of the game text itself.
  const text = source.text;
  const at = Math.min(Math.max(0, offset), text.length);
  let line = 0;
  let start = 0;
  for (let i = text.indexOf('\n'); i !== -1 && i < at; i = text.indexOf('\n', i + 1)) {
    line++;
    start = i + 1;
  }
  return new vscode.Position(line, at - start);
}

function rectOf(entry: DrawRect | undefined): DrawRect {
  return entry === undefined
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: entry.x, y: entry.y, width: entry.width, height: entry.height };
}

function toDiagnostic(found: ModelDiagnostic, source: SourceText): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(positionOf(source, found.start), positionOf(source, found.end)),
    found.message,
    SEVERITY[found.severity],
  );
  diagnostic.source = 'Etch';
  diagnostic.code = found.code;
  return diagnostic;
}

function severityLog(notice: Notice): 'error' | 'warn' | 'info' {
  return notice.severity === 'error' ? 'error' : notice.severity === 'warning' ? 'warn' : 'info';
}

/** The playset key of a session's snapshots: its game folder and mods by name, in load order. */
function sessionPlaysetKey(session: PreviewSession): string {
  return playsetKey(
    session.playset.gameFolder,
    session.playset.mods.map((m) => m.name),
  );
}
