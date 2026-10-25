// The preview (spec section 2): one webview beside the editor that shows the previewed window,
// follows the unsaved buffer of every game text file of the playset on each change, and publishes
// the model's diagnostics in the Problems panel. The extension host parses, models and lays out;
// the webview draws the draw list with WebGL2 (ADR 0001). Textures and fonts changed on disk are
// read again, and the preview reopens on the same window after a window reload.

import { dirname } from 'node:path';
import * as vscode from 'vscode';
import {
  DEFAULT_LANGUAGE,
  allWidgets,
  choosePreviewResolution,
  formatResolution,
  isSide,
  parseResolution,
  gameTextKind,
  guiDiagnostics,
  laidOutIndexOf,
  mapGameText,
  parseScript,
  previewCrop,
  readGuiFile,
  textureReloadNames,
  widgetAt,
  widgetHoverText,
  widgetPathAt,
  writePreviewCopy,
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
import { readGameText, saveEncodingOf } from '../game-text.ts';
import type { GameHost, GameHostState, JobOutcome } from '../game-host/index.ts';
import type { WidgetNavigation } from '../navigation.ts';
import { previewHtml } from './html.ts';
import type {
  HostMessage,
  Notice,
  Point,
  PreviewBackend,
  PreviewMemento,
  TextureFailure,
  ViewState,
  WebviewMessage,
} from './protocol.ts';
import { RenderLoop } from './render-loop.ts';
import { PreviewSession, type PlaysetPlace, type SessionSettings } from './session.ts';

/** The setting of the preview resolution (spec section 6), in the `etch` section. */
export const RESOLUTION_SETTING = 'previewResolution';

/** The command that chooses the preview resolution. */
export const CHOOSE_RESOLUTION = 'etch.choosePreviewResolution';

/** Where the monitor's native resolution is kept between sessions, so a cold open knows it. */
const NATIVE_SCREEN_KEY = 'etch.nativeScreen';

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
}

/** A game host image the webview drew (spec sections 4 and 7). */
export interface HostImagePaint {
  /** The job that captured it, with the plugin's times. */
  readonly outcome: Extract<JobOutcome, { ok: true }>;
  /** When the webview drew it, in ms since the Unix epoch. */
  readonly at: number;
  /** From the first change the job answered to the drawn image, in milliseconds. */
  readonly fromChangeMs: number;
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
  /** Fires when the webview has drawn an image from the game host. */
  readonly onDidPaintHostImage: vscode.Event<HostImagePaint>;
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
  /** The preview backend the switch shows. */
  readonly backend: PreviewBackend;
  /**
   * Switches the preview backend. The game host starts at the first switch to it (spec section 4),
   * and a start that failed is tried again.
   */
  setBackend(backend: PreviewBackend): void;
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

/** The game host's image the preview shows, as posted to the webview. */
interface HostImage {
  readonly draw: Extract<HostMessage, { type: 'draw' }>;
  readonly url: string;
  readonly screen: Screen;
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
  private readonly renderEmitter = new vscode.EventEmitter<PreviewRender>();
  private readonly paintEmitter = new vscode.EventEmitter<PreviewPaint>();
  private readonly hostPaintEmitter = new vscode.EventEmitter<HostImagePaint>();
  private readonly subscriptions: vscode.Disposable[];

  private readonly gameHost: GameHost | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private roots: string | undefined;
  private backendValue: PreviewBackend = 'offline';
  /** The preview switched to the game host and has not handed it a playset yet. */
  private hostStartPending = false;
  /** What the last `show` was given, to show again when the game host's state changes. */
  private lastShown: Omit<ViewState, 'pinned' | 'pinnable' | 'backend' | 'resolution'> | undefined;
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
  /** `texturefile` values of textures saved since the last game host job, for `reloadtexture`. */
  private readonly hostTextures = new Set<string>();
  /** A localisation file was saved since the last game host job: it adds `reloadloc`. */
  private hostLocalisation = false;
  /** What the last game host job was made from, to skip a job that would show the same. */
  private hostJobKey: string | undefined;
  /** The preview copy's diagnostics for the last job. */
  private hostCopyDiagnostics: readonly ModelDiagnostic[] = [];
  /** Why the game host cannot show the window, or why its last job failed. */
  private hostProblem: Notice | undefined;
  private hostImage: HostImage | undefined;
  /** Game host images posted and not drawn yet, by draw id. */
  private readonly hostDraws = new Map<number, Extract<JobOutcome, { ok: true }>>();

  readonly onDidRender = this.renderEmitter.event;
  readonly onDidPaint = this.paintEmitter.event;
  readonly onDidPaintHostImage = this.hostPaintEmitter.event;

  constructor(
    extensionUri: vscode.Uri,
    output: vscode.LogOutputChannel,
    navigation: WidgetNavigation,
    memento: vscode.Memento,
    gameHost?: GameHost,
  ) {
    this.extensionUri = extensionUri;
    this.gameHost = gameHost;
    this.output = output;
    this.navigation = navigation;
    this.memento = memento;
    this.native = validScreen(memento.get(NATIVE_SCREEN_KEY));
    this.loop = new RenderLoop(
      () => this.renderNow(),
      (error) => {
        this.fail(error);
      },
    );
    this.subscriptions = [
      ...(gameHost === undefined
        ? []
        : [
            gameHost.onDidChangeState((state) => {
              if (state.status !== 'ready') this.hostJobKey = undefined;
              if (this.lastShown !== undefined) this.show(this.lastShown);
              // A game host that got ready lays the window out at its screen and runs a job.
              if (this.panel && this.backendValue === 'game-host') this.request();
            }),
            gameHost.onDidFinishJob((outcome) => {
              this.hostJobDone(outcome);
            }),
          ]),
      navigation.onDidHighlight(() => {
        this.updateOverlay();
      }),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
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
      vscode.workspace.onDidSaveTextDocument((document) => {
        // The game host reads localisation from disk: a save reloads it (spec section 4).
        if (this.panel && this.backendValue === 'game-host' && /\.yml$/i.test(document.uri.path)) {
          this.hostLocalisation = true;
          this.request();
        }
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

  get backend(): PreviewBackend {
    return this.backendValue;
  }

  setBackend(backend: PreviewBackend): void {
    this.backendValue = backend;
    this.hostStartPending = backend === 'game-host';
    if (backend === 'game-host') this.useGameHost();
    else this.gameHost?.use(undefined);
    if (this.lastShown !== undefined) this.show(this.lastShown);
  }

  /**
   * Hands the game host the preview's playset and display after a switch to it, which starts it
   * (again after a failed start or a stop), once the preview has a playset with a game folder.
   */
  private useGameHost(): void {
    const host = this.gameHost;
    const session = this.session;
    if (host === undefined || !this.hostStartPending || this.panel === undefined) return;
    const gameFolder = session?.playset.gameFolder;
    if (session === undefined || gameFolder === undefined) return;
    this.hostStartPending = false;
    host.use({
      gameFolder,
      mods: session.playset.mods,
      display: { ...(this.native ?? this.resolution.screen), language: session.settings.language },
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
    this.renderEmitter.dispose();
    this.paintEmitter.dispose();
    this.hostPaintEmitter.dispose();
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
        list: { version: 1, ...this.resolution.screen, textures: [], draws: [] },
      });
      return;
    }

    // Several events can answer one change (an edit also moves the selection).
    const host = this.readyHost();
    // The game host draws at its own screen (spec section 6), so the window is laid out there.
    const screen = host?.screen ?? this.resolution.screen;
    const key = [
      uri.toString(),
      source.version ?? 'disk',
      file.definitions.indexOf(window),
      this.pin !== undefined,
      screen.width,
      screen.height,
      session.serial,
      this.backendValue,
      host?.pid ?? '',
    ].join('|');
    const hostWork = host !== undefined && (this.hostTextures.size > 0 || this.hostLocalisation);
    if (!changed && !assetsChanged && !hostWork && key === this.renderKey) {
      // The same screen can come from another source (the setting, settings.txt, the monitor).
      if (this.lastState) {
        this.show({ title: this.lastState.title, file: shownPath, notices: session.notices });
      }
      return;
    }
    this.renderKey = key;

    const layout = await layOutPreview(session.ui, session.assets, file, window, {
      screen,
      localise: session.localise,
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
    this.render = { id, uri, file, window, layout, drawList, source, pinned, requestedAt };
    this.last = { uri: uri.toString(), name: window.name };
    // The draw goes first: diagnostics are not on the warm reload's path to pixels. The game host's
    // last image stays until its next one comes.
    const hostImage = this.shownHostImage(screen);
    if (hostImage === undefined) this.post({ type: 'draw', id, list: drawList });
    else if (this.lastDraw !== hostImage.draw) this.post(hostImage.draw);
    const copyDiagnostics =
      host === undefined
        ? []
        : this.submitHostJob(host.screen, {
            session,
            uri,
            place,
            source,
            file,
            window,
            layout,
            id,
          });
    this.remember({
      uri: uri.toString(),
      window: window.name,
      index: file.definitions.indexOf(window),
      pinned,
    });
    panel.title = `Preview ${window.name ?? window.kind}`;
    this.show({ title: window.name ?? window.kind, file: shownPath, notices: session.notices });
    this.navigation.setPreviewed(
      document && source.version !== undefined
        ? {
            document,
            version: source.version,
            file,
            window,
            offsets: source.offsets,
            layout: layout.widgets,
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
      ...copyDiagnostics,
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
      // The game host reads the saved texture again only when told (spec section 4).
      if (place.wins && this.backendValue === 'game-host' && /\.(?:dds|tga)$/i.test(place.path)) {
        for (const name of textureReloadNames(session.ui.index, place.path)) {
          this.hostTextures.add(name);
        }
      }
    }
    if (urls.size > 0) this.post({ type: 'invalidate', urls: [...urls] });
    return read;
  }

  /**
   * Lets the webview read the playset's folders. Changing the roots reloads the webview, so the
   * page is set only once they are known, and the last draw is posted again when it is ready.
   */
  private allowRoots(panel: vscode.WebviewPanel, folders: readonly string[]): void {
    const roots = [
      this.distUri,
      ...folders.map((folder) => vscode.Uri.file(folder)),
      // The game host's images, which the webview draws like textures.
      ...(this.gameHost === undefined ? [] : [vscode.Uri.file(this.gameHost.capturesFolder)]),
    ];
    const key = roots.map((root) => root.toString()).join('\n');
    if (key === this.roots) return;
    const first = this.roots === undefined;
    this.roots = key;
    this.ready = false;
    panel.webview.options = { enableScripts: true, localResourceRoots: roots };
    if (first) panel.webview.html = previewHtml(panel.webview, this.extensionUri);
  }

  private show(state: Omit<ViewState, 'pinned' | 'pinnable' | 'backend' | 'resolution'>): void {
    this.lastShown = state;
    this.useGameHost();
    const { screen, source } = this.resolution;
    const value = resolutionValue();
    let full: ViewState = {
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
      backend: this.backendValue,
      resolution: { text: formatResolution(screen), source },
    };
    if (this.backendValue === 'game-host' && this.gameHost !== undefined) {
      full = {
        ...full,
        notices: [
          gameHostNotice(this.gameHost.state, this.session),
          ...this.hostNotices(),
          ...full.notices,
        ],
      };
    }
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
      case 'backend':
        this.setBackend(message.backend);
        if (this.lastState)
          void this.panel?.webview.postMessage({ type: 'state', state: this.lastState });
        break;
    }
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
    const outcome = this.hostDraws.get(paint.id);
    if (outcome !== undefined) {
      this.hostDraws.delete(paint.id);
      if (paint.painted) {
        const fromChangeMs = paint.at - outcome.requestedAt;
        this.output.info(
          `Game host image of job ${String(outcome.job)} drawn ${fromChangeMs.toFixed(0)} ms after the change.`,
        );
        this.hostPaintEmitter.fire({ outcome, at: paint.at, fromChangeMs });
      }
    }
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
            : draw.texture === texture || (draw.kind === 'masked' && draw.mask === texture);
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
    this.diagnostics.set(render.uri, [...(this.published.get(key) ?? []), ...extra]);
  }

  private publish(uri: vscode.Uri, found: readonly ModelDiagnostic[], source: SourceText): void {
    const diagnostics = found.map((d) => toDiagnostic(d, source));
    this.published.set(uri.toString(), diagnostics);
    this.diagnostics.set(uri, diagnostics);
  }

  private forget(uri: vscode.Uri): void {
    this.published.delete(uri.toString());
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

  /** The game host while the preview shows it and it is ready, with its screen. */
  private readyHost(): { screen: Screen; pid: number } | undefined {
    const host = this.gameHost;
    if (host === undefined || this.backendValue !== 'game-host') return undefined;
    const { state, screen } = host;
    return state.status === 'ready' && screen !== undefined
      ? { screen, pid: state.pid }
      : undefined;
  }

  /** The game host's image, while the preview shows the game host at that image's screen. */
  private shownHostImage(screen: Screen): HostImage | undefined {
    const image = this.hostImage;
    if (this.backendValue !== 'game-host' || image === undefined) return undefined;
    return image.screen.width === screen.width && image.screen.height === screen.height
      ? image
      : undefined;
  }

  /**
   * Writes the preview copy of the previewed window and hands the game host a job for it (spec
   * section 4), unless the last job showed the same. Returns the copy's diagnostics.
   */
  private submitHostJob(
    screen: Screen,
    render: {
      session: PreviewSession;
      uri: vscode.Uri;
      place: PlaysetPlace | undefined;
      source: SourceText;
      file: GuiFile;
      window: Widget;
      layout: WindowLayout;
      id: number;
    },
  ): readonly ModelDiagnostic[] {
    const host = this.gameHost;
    const { session, uri, place, source, file, window, layout, id } = render;
    if (host === undefined) return [];
    const jobKey = [
      uri.toString(),
      source.version ?? 'disk',
      file.definitions.indexOf(window),
      screen.width,
      screen.height,
      session.serial,
      host.state.status === 'ready' ? host.state.pid : '',
    ].join('|');
    const extra = this.hostTextures.size > 0 || this.hostLocalisation;
    if (jobKey === this.hostJobKey && !extra) return this.hostCopyDiagnostics;
    this.hostJobKey = jobKey;
    this.hostCopyDiagnostics = [];
    if (place === undefined || !/^interface[\\/]/i.test(place.path) || window.name === undefined) {
      this.setHostProblem({
        severity: 'warning',
        message:
          'The game host previews named windows of .gui files in the interface folder of the game ' +
          'or of a mod of the playset.',
      });
      return [];
    }
    const copy = writePreviewCopy({
      path: place.path,
      text: source.text,
      bom: source.bom,
      window: window.name,
      screen,
      // The playset's own definitions; the overlay mod is not part of it.
      isTopLevelName: (name) => session.ui.index.guiType(name) !== undefined,
    });
    this.hostCopyDiagnostics = copy.diagnostics;
    if (copy.files === undefined) {
      const why = copy.diagnostics.find((d) => d.severity === 'error') ?? copy.diagnostics[0];
      this.setHostProblem({
        severity: 'warning',
        message: `The game host cannot show this window${why === undefined ? '.' : `: ${why.message}`}`,
      });
      return copy.diagnostics;
    }
    const crop = previewCrop(layout.widgets, screen);
    if (crop === undefined) {
      this.setHostProblem({
        severity: 'warning',
        message: "No part of this window is on the game host's screen.",
      });
      return copy.diagnostics;
    }
    if (this.hostProblem?.severity === 'warning') this.setHostProblem(undefined);
    const submitted = host.submit({
      copies: copy.files,
      crop,
      textures: [...this.hostTextures],
      localisation: this.hostLocalisation,
      requestedAt: this.render?.requestedAt ?? Date.now(),
      tag: id,
    });
    if (submitted) {
      this.hostTextures.clear();
      this.hostLocalisation = false;
    } else {
      this.output.warn('The game host took no job: it is not ready.');
      this.hostJobKey = undefined;
    }
    return copy.diagnostics;
  }

  /** Keeps why the game host cannot show the window, and logs it when it changes. */
  private setHostProblem(problem: Notice | undefined): void {
    if (problem !== undefined && problem.message !== this.hostProblem?.message) {
      this.output[severityLog(problem)](problem.message);
    }
    this.hostProblem = problem;
  }

  /** Shows a finished job's image, or why there is none. */
  private hostJobDone(outcome: JobOutcome): void {
    const panel = this.panel;
    const screen = this.gameHost?.screen;
    if (panel === undefined || this.backendValue !== 'game-host' || screen === undefined) return;
    if (!outcome.ok) {
      this.setHostProblem({
        severity: 'error',
        message: `The game host could not draw the window (${outcome.code}): ${outcome.message}`,
      });
    } else {
      // A failed job is over once one succeeds.
      if (this.hostProblem?.severity === 'error') this.setHostProblem(undefined);
      const { crop, path } = outcome.image;
      const url = webviewUrl(panel, path);
      const draw: Extract<HostMessage, { type: 'draw' }> = {
        type: 'draw',
        id: ++this.renderCount,
        list: {
          version: 1,
          ...screen,
          textures: [url],
          draws: [
            {
              kind: 'sprite',
              texture: 0,
              shader: 'default',
              source: this.render?.window.node.start ?? 0,
              ...crop,
              sx: 0,
              sy: 0,
              sw: crop.width,
              sh: crop.height,
            },
          ],
        },
      };
      const previous = this.hostImage?.url;
      this.hostImage = { draw, url, screen };
      this.hostDraws.set(draw.id, outcome);
      this.post(draw);
      // Each image has a file of its own; the last one's texture is no longer needed.
      if (previous !== undefined && previous !== url) {
        this.post({ type: 'invalidate', urls: [previous] });
      }
    }
    if (this.lastShown !== undefined) this.show(this.lastShown);
  }

  /** What the preview says about the game host's work beside its state. */
  private hostNotices(): Notice[] {
    const notices: Notice[] = [];
    if (this.hostProblem !== undefined) notices.push(this.hostProblem);
    const host = this.readyHost();
    const chosen = this.resolution.screen;
    if (
      host !== undefined &&
      (host.screen.width !== chosen.width || host.screen.height !== chosen.height)
    ) {
      notices.push({
        severity: 'information',
        message:
          `The game host runs at ${formatResolution(host.screen)}, so the preview shows that ` +
          `resolution instead of ${formatResolution(chosen)}.`,
      });
    }
    return notices;
  }

  private closed(): void {
    this.panel = undefined;
    this.backendValue = 'offline';
    this.hostStartPending = false;
    this.lastShown = undefined;
    this.gameHost?.use(undefined);
    this.ready = false;
    this.roots = undefined;
    this.session = undefined;
    this.watchers?.dispose();
    this.watchers = undefined;
    this.changedAssets.clear();
    this.listingsChanged = false;
    this.hostTextures.clear();
    this.hostLocalisation = false;
    this.hostJobKey = undefined;
    this.hostCopyDiagnostics = [];
    this.hostProblem = undefined;
    this.hostImage = undefined;
    this.hostDraws.clear();
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

/** What the preview says about the game host while it shows it. */
function gameHostNotice(state: GameHostState, session: PreviewSession | undefined): Notice {
  if (session !== undefined && session.playset.gameFolder === undefined) {
    return { severity: 'error', message: 'The game host needs the game folder (etch.gamePath).' };
  }
  switch (state.status) {
    case 'stopped':
      return { severity: 'information', message: 'The game host is stopped.' };
    case 'starting':
      return {
        severity: 'information',
        message: 'The game host is starting; this takes about 15 seconds.',
      };
    case 'ready':
      return {
        severity: 'information',
        message: `The game host draws the preview (ready after ${(state.readyMs / 1000).toFixed(1)} s).`,
      };
    case 'stopping':
      return { severity: 'information', message: 'The game host is stopping.' };
    case 'busy':
      return {
        severity: 'warning',
        message: 'Another VS Code window runs the game host; Etch runs one per machine.',
      };
    case 'failed':
      return { severity: 'error', message: `The game host is not running: ${state.message}` };
  }
}
