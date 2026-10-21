// The preview (spec section 2): one webview beside the editor that shows the previewed window,
// follows the unsaved buffer of every game text file of the playset on each change, and publishes
// the model's diagnostics in the Problems panel. The extension host parses, models and lays out;
// the webview draws the draw list with WebGL2 (ADR 0001).

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
import { readGameText, saveEncodingOf } from '../game-text.ts';
import type { WidgetNavigation } from '../navigation.ts';
import { previewHtml } from './html.ts';
import type {
  HostMessage,
  Notice,
  Point,
  TextureFailure,
  ViewState,
  WebviewMessage,
} from './protocol.ts';
import { RenderLoop } from './render-loop.ts';
import { PreviewSession, type SessionSettings } from './session.ts';

/** The setting of the preview resolution (spec section 6), in the `etch` section. */
export const RESOLUTION_SETTING = 'previewResolution';

/** The command that chooses the preview resolution. */
export const CHOOSE_RESOLUTION = 'etch.choosePreviewResolution';

/** Where the monitor's native resolution is kept between sessions, so a cold open knows it. */
const NATIVE_SCREEN_KEY = 'etch.nativeScreen';

/** The context key that is true while the preview is open. */
export const PREVIEW_OPEN_CONTEXT = 'etch.previewOpen';

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
  /** Opens the preview beside the editor, or reveals it. */
  open(): void;
  /** Pins the previewed window, or unpins it. */
  togglePin(): void;
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
  private readonly renderEmitter = new vscode.EventEmitter<PreviewRender>();
  private readonly paintEmitter = new vscode.EventEmitter<PreviewPaint>();
  private readonly subscriptions: vscode.Disposable[];

  private panel: vscode.WebviewPanel | undefined;
  private roots: string | undefined;
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

  readonly onDidRender = this.renderEmitter.event;
  readonly onDidPaint = this.paintEmitter.event;

  constructor(
    extensionUri: vscode.Uri,
    output: vscode.LogOutputChannel,
    navigation: WidgetNavigation,
    memento: vscode.Memento,
  ) {
    this.extensionUri = extensionUri;
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

  open(): void {
    if (this.panel) {
      this.panel.reveal(undefined, true);
      this.request();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'etch.preview',
      'Etch Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.distUri] },
    );
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
    this.panel?.dispose();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.diagnostics.dispose();
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
    this.allowRoots(panel, session.roots);
    const { touched, changed } = await this.applyPending(session);

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
    const { screen } = this.resolution;
    const key = [
      uri.toString(),
      source.version ?? 'disk',
      file.definitions.indexOf(window),
      this.pin !== undefined,
      screen.width,
      screen.height,
      session.serial,
    ].join('|');
    if (!changed && key === this.renderKey) {
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
      textures: layout.drawList.textures.map((path) => {
        const found = session.ui.gameFile(path);
        const absolute = found?.absolutePath ?? path;
        return panel.webview.asWebviewUri(vscode.Uri.file(absolute)).toString();
      }),
    };
    const id = ++this.renderCount;
    const pinned = this.pin !== undefined;
    this.render = { id, uri, file, window, layout, drawList, source, pinned, requestedAt };
    this.last = { uri: uri.toString(), name: window.name };
    // The draw goes first: diagnostics are not on the warm reload's path to pixels.
    this.post({ type: 'draw', id, list: drawList });
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
    if (this.session?.serves(settings, workspaceFolder, uri.fsPath) === true) return this.session;

    const started = performance.now();
    const session = await PreviewSession.load(settings, workspaceFolder, uri.fsPath);
    this.session = session;
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

  private show(state: Omit<ViewState, 'pinned' | 'pinnable' | 'backend' | 'resolution'>): void {
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
      backend: 'offline',
      resolution: { text: formatResolution(screen), source },
    };
    if (JSON.stringify(full) === JSON.stringify(this.lastState)) return;
    this.lastState = full;
    if (this.ready) void this.panel?.webview.postMessage({ type: 'state', state: full });
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
        if (message.backend === 'game-host') {
          void vscode.window.showInformationMessage(
            'The game host preview backend comes in a later release of Etch.',
          );
        }
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

  private closed(): void {
    this.panel = undefined;
    this.ready = false;
    this.roots = undefined;
    this.session = undefined;
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
    return { document, version: undefined, text: game.text, offsets: IDENTITY };
  }
  const version = document.version;
  const text = document.getText();
  const encoding = await saveEncodingOf(document, text).catch(() => undefined);
  const mapped = encoding && mapGameText(text, kind, encoding);
  if (!mapped) return undefined;
  return { document, version, text: mapped.text, offsets: mapped };
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
