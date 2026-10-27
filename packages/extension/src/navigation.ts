// The widget outline and navigation between the preview and the source (spec
// section 2). Both come from the extension's model of the previewed window,
// for both preview backends.
//
// API for the preview panel (etch#36), through the `WidgetNavigation` that
// `activate` creates:
//
// - `setPreviewed(previewed)`: the previewed window, its model and its layout,
//   after every change of the window or its layout; `undefined` hands the
//   choice back to the editor (below). Until the preview calls it, the
//   previewed window is the top-level window that contains the cursor in the
//   active `.gui` editor, kept while the cursor is outside every window.
// - `revealSource(source)`: a click on a widget in the preview. Reveals and
//   selects the widget's source in its editor and selects it in the outline.
//   `source` is the widget's `widget.node.start`, as a draw's `source` gives
//   it.
// - `onDidHighlight` and `highlighted`: the widget to highlight in the
//   preview, by the same source offset. It follows the cursor in the editor
//   and clicks in the outline.
// - Hover in the preview: core's `widgetAt` and `widgetHoverText` over the
//   layout's widgets give the widget under the mouse, its path and its rect.
//
// Offsets in the model, the layout and the draw list count game text, which
// the editor's text can differ from (etch#15); `MappedGameText` maps them.
//
// With a window profile the outline draws the view in (spec section 2, etch#159): the members
// of an exclusive group are radios under a "(one of)" header, every other widget has an eye, a
// hand toggle is marked, and a widget the game does not create at this screen height is struck
// through. Its eyes and radios fire `onDidToggle` for the preview.

import * as vscode from 'vscode';
import {
  findDefinition,
  laidOutIndexOf,
  mapGameText,
  parseScript,
  readGuiFile,
  widgetHoverText,
  widgetLabel,
  widgetPathAt,
  type GameTextOffsets,
  type GuiFile,
  type LaidOutWidget,
  type Widget,
  type WidgetKind,
} from '@etch/core';
import type { GroupState, WindowView } from '@etch/core/profile';
import { saveEncodingOf } from './game-text.ts';

/** The tree view of the previewed window's widgets. */
export const OUTLINE_VIEW = 'etch.widgetOutline';

/** Reveals a widget of the previewed window in its editor: `(source: number)`. */
export const REVEAL_WIDGET_SOURCE = 'etch.revealWidgetSource';

/** Shows or hides a widget of the outline by hand: `(widget)`. */
export const SHOW_WIDGET = 'etch.outline.show';
export const HIDE_WIDGET = 'etch.outline.hide';
/** Chooses a member of an exclusive group by hand: `(widget)`, or a "(none)" entry. */
export const CHOOSE_MEMBER = 'etch.outline.choose';

/** Set while Etch runs; the outline view shows only then. */
const OUTLINE_CONTEXT = 'etch.widgetOutline.available';

const NO_WINDOW = 'Open a .gui file to see the widgets of its window.';
/** While the preview is closed, the outline follows the editor after this pause in typing. */
/** While the preview is closed the outline follows the editor; a short debounce spares bursts of typing. */
const DEBOUNCE_MS = 30;

/** The previewed window and the model it comes from. */
export interface PreviewedWindow {
  readonly document: vscode.TextDocument;
  /** The document version the model was read from. */
  readonly version: number;
  readonly file: GuiFile;
  /** A top-level definition of `file`. */
  readonly window: Widget;
  /** The map between the document's offsets and the model's. */
  readonly offsets: GameTextOffsets;
  /** The window laid out on the preview screen, when the preview has done so. */
  readonly layout?: readonly LaidOutWidget[];
  /** The view drawn, when the window has a window profile. */
  readonly view?: WindowView;
}

/** A hand toggle from the outline: an eye, or a radio of an exclusive group (`undefined`: none). */
export type OutlineToggle =
  | { readonly kind: 'widget'; readonly widget: Widget; readonly shown: boolean }
  | { readonly kind: 'group'; readonly group: string; readonly value: string | undefined };

/** A "(one of)" header over the members of an exclusive group, or its "(none)" radio. */
interface GroupNode {
  readonly kind: 'group' | 'none';
  readonly state: GroupState;
  readonly parent: Widget;
}

type OutlineNode = Widget | GroupNode;

function isGroupNode(node: OutlineNode): node is GroupNode {
  return 'state' in node;
}

/** The widget to highlight in the preview. */
export interface WidgetHighlight {
  readonly uri: vscode.Uri;
  /** The widget's `node.start` in the game text; `undefined` for none. */
  readonly source: number | undefined;
}

/** A `.gui` document read into the model. */
interface GuiModel {
  readonly document: vscode.TextDocument;
  readonly version: number;
  readonly file: GuiFile;
  readonly offsets: GameTextOffsets;
}

function isGui(document: vscode.TextDocument): boolean {
  return /\.gui$/i.test(document.uri.path);
}

/** Reads a document's game text into the model; `undefined` when the game cannot read it. */
async function readModel(document: vscode.TextDocument): Promise<GuiModel | undefined> {
  const version = document.version;
  const text = document.getText();
  const encoding = await saveEncodingOf(document, text).catch(() => undefined);
  const game = encoding && mapGameText(text, 'interface', encoding);
  if (!game) {
    return undefined;
  }
  return { document, version, file: readGuiFile(parseScript(game.text)), offsets: game };
}

const ICONS: Partial<Record<WidgetKind, string>> = {
  windowType: 'window',
  eu3dialogtype: 'window',
  containerWindowType: 'window',
  iconType: 'symbol-color',
  guiButtonType: 'symbol-event',
  buttonType: 'symbol-event',
  checkboxType: 'check',
  instantTextBoxType: 'symbol-text',
  textBoxType: 'symbol-text',
  editBoxType: 'symbol-string',
  listboxType: 'list-unordered',
  smoothListboxType: 'list-unordered',
  gridBoxType: 'list-flat',
  OverlappingElementsBoxType: 'list-flat',
  scrollbarType: 'symbol-ruler',
  extendedScrollbarType: 'symbol-ruler',
  positionType: 'location',
  shieldtype: 'shield',
};

/** The previewed window's widgets as a tree, in file order, with its view drawn in. */
class OutlineTree implements vscode.TreeDataProvider<OutlineNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private previewed: PreviewedWindow | undefined;
  private parents = new Map<Widget, OutlineNode | undefined>();
  private ids = new Map<Widget, string>();
  /** The exclusive group a widget is a member of, and the group's header node. */
  private memberOf = new Map<Widget, { node: GroupNode; value: string }>();
  /** The group headers among each widget's children. */
  private headers = new Map<Widget, GroupNode[]>();

  show(previewed: PreviewedWindow | undefined): void {
    this.previewed = previewed;
    this.parents = new Map();
    this.ids = new Map();
    this.memberOf = new Map();
    this.headers = new Map();
    if (previewed) {
      const parentOf = new Map<Widget, Widget>();
      const walk = (widget: Widget, id: string): void => {
        this.ids.set(widget, id);
        widget.children.forEach((child, i) => {
          parentOf.set(child, widget);
          walk(child, `${id}/${String(i)}`);
        });
      };
      walk(previewed.window, '0');
      // A group's header sits in the parent its members share; members elsewhere stay where
      // they are, with their radio.
      for (const state of previewed.view?.groups ?? []) {
        const first = state.members.flatMap((m) => m.widgets)[0];
        const parent = first && parentOf.get(first);
        if (parent === undefined) continue;
        const node: GroupNode = { kind: 'group', state, parent };
        this.headers.set(parent, [...(this.headers.get(parent) ?? []), node]);
        for (const member of state.members) {
          for (const widget of member.widgets) {
            this.memberOf.set(widget, { node, value: member.value });
          }
        }
      }
      for (const [child, parent] of parentOf) {
        const group = this.memberOf.get(child)?.node;
        this.parents.set(child, group?.parent === parent ? group : parent);
      }
      this.parents.set(previewed.window, undefined);
    }
    this.changed.fire();
  }

  has(widget: Widget): boolean {
    return this.parents.has(widget);
  }

  getChildren(element?: OutlineNode): OutlineNode[] {
    if (!this.previewed) return [];
    if (element === undefined) return [this.previewed.window];
    if (isGroupNode(element)) {
      if (element.kind === 'none') return [];
      const members = element.parent.children.filter((c) => this.memberOf.get(c)?.node === element);
      return element.state.group.none
        ? [...members, { kind: 'none', state: element.state, parent: element.parent }]
        : members;
    }
    const headers = this.headers.get(element) ?? [];
    const nodes: OutlineNode[] = [];
    for (const child of element.children) {
      const group = this.memberOf.get(child)?.node;
      if (group?.parent !== element) {
        nodes.push(child);
      } else if (!nodes.includes(group)) {
        nodes.push(group);
      }
    }
    return [...nodes, ...headers.filter((h) => !nodes.includes(h))];
  }

  getParent(element: OutlineNode): OutlineNode | undefined {
    return isGroupNode(element) ? element.parent : this.parents.get(element);
  }

  getTreeItem(node: OutlineNode): vscode.TreeItem {
    if (isGroupNode(node)) return this.groupItem(node);
    const widget = node;
    const collapsible =
      widget.children.length === 0
        ? vscode.TreeItemCollapsibleState.None
        : this.parents.get(widget) === undefined
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed;
    const state = this.previewed?.view?.widgets.get(widget);
    const created = state?.created !== false;
    // Not created at this screen height: struck through (spec section 2).
    const label = created ? widgetLabel(widget) : struck(widgetLabel(widget));
    const item = new vscode.TreeItem(label, collapsible);
    const id = this.ids.get(widget);
    if (id !== undefined) item.id = id;
    const notes: string[] = widget.name === undefined ? [] : [widget.kind];
    const member = this.memberOf.get(widget);
    if (state !== undefined && this.parents.get(widget) !== undefined) {
      if (!created) notes.push('not created');
      else if (!state.shown) notes.push('hidden');
      if (state.byHand) notes.push('by hand');
      if (member !== undefined) {
        const chosen = member.node.state.chosen === member.value;
        item.iconPath = new vscode.ThemeIcon(
          chosen ? 'circle-large-filled' : 'circle-large-outline',
        );
        item.contextValue = created ? 'etch.member' : 'etch.notCreated';
      } else {
        item.iconPath = new vscode.ThemeIcon(ICONS[widget.kind] ?? 'symbol-field');
        item.contextValue = !created
          ? 'etch.notCreated'
          : state.shown
            ? 'etch.shown'
            : 'etch.hidden';
      }
    } else {
      item.iconPath = new vscode.ThemeIcon(ICONS[widget.kind] ?? 'symbol-field');
    }
    item.description = notes.join(' · ');
    item.tooltip = this.tooltip(widget);
    item.command = {
      title: 'Reveal Widget Source',
      command: REVEAL_WIDGET_SOURCE,
      arguments: [widget.node.start],
    };
    return item;
  }

  private groupItem(node: GroupNode): vscode.TreeItem {
    const { group, chosen, byHand } = node.state;
    if (node.kind === 'none') {
      const item = new vscode.TreeItem('(none)', vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(
        chosen === undefined ? 'circle-large-filled' : 'circle-large-outline',
      );
      item.contextValue = 'etch.member';
      return item;
    }
    const item = new vscode.TreeItem('(one of)', vscode.TreeItemCollapsibleState.Expanded);
    item.id = `${this.ids.get(node.parent) ?? ''}#${group.id}`;
    item.description = [group.label ?? group.id, ...(byHand ? ['by hand'] : [])].join(' · ');
    item.tooltip = `Exclusive group ${group.id}: the member of selector ${group.selector} shows.`;
    item.iconPath = new vscode.ThemeIcon('list-selection');
    return item;
  }

  private tooltip(widget: Widget): string {
    const layout = this.previewed?.layout;
    const index = layout ? laidOutIndexOf(layout, widget.node.start) : -1;
    const why = this.previewed?.view?.widgets.get(widget)?.why;
    const suffix = why === undefined ? '' : `\n${why}`;
    if (layout && index >= 0) return widgetHoverText(layout, index) + suffix;
    const path: string[] = [];
    for (let step: Widget | undefined = widget; step; step = this.widgetParent(step)) {
      path.unshift(widgetLabel(step));
    }
    return `${path.join(' › ')}\n${widget.kind}${suffix}`;
  }

  /** The widget a widget is a child of, past a group header. */
  widgetParent(widget: Widget): Widget | undefined {
    const parent = this.parents.get(widget);
    return parent === undefined ? undefined : isGroupNode(parent) ? parent.parent : parent;
  }

  /** What a radio of the outline chooses: the group and the member's value, `undefined` for none. */
  choice(node: OutlineNode): { group: string; value: string | undefined } | undefined {
    if (isGroupNode(node)) {
      return node.kind === 'none' ? { group: node.state.group.id, value: undefined } : undefined;
    }
    const member = this.memberOf.get(node);
    return member && { group: member.node.state.group.id, value: member.value };
  }

  dispose(): void {
    this.changed.dispose();
  }
}

/** The widget outline and navigation between the preview and the source. */
export class WidgetNavigation implements vscode.Disposable {
  private readonly tree = new OutlineTree();
  /** The outline's tree view. */
  readonly outline: vscode.TreeView<OutlineNode>;
  private readonly highlightEvents = new vscode.EventEmitter<WidgetHighlight>();
  /** Fires when the widget to highlight in the preview changes. */
  readonly onDidHighlight = this.highlightEvents.event;
  private readonly toggleEvents = new vscode.EventEmitter<OutlineToggle>();
  /** Fires when an eye or a radio of the outline is clicked. */
  readonly onDidToggle = this.toggleEvents.event;
  private readonly subscriptions: vscode.Disposable[];

  private current: PreviewedWindow | undefined;
  /** Whether the preview chose the previewed window; otherwise it follows the editor. */
  private fromPreview = false;
  /** The model of the `.gui` document the editor follows. */
  private model: GuiModel | undefined;
  private highlightedWidget: Widget | undefined;
  private lastHighlight: WidgetHighlight | undefined;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Counts model reads, so that only the latest one is used. */
  private reads = 0;
  private disposed = false;

  constructor() {
    this.outline = vscode.window.createTreeView(OUTLINE_VIEW, {
      treeDataProvider: this.tree,
      showCollapseAll: true,
    });
    this.outline.message = NO_WINDOW;
    void vscode.commands.executeCommand('setContext', OUTLINE_CONTEXT, true);
    this.subscriptions = [
      this.outline,
      vscode.commands.registerCommand(REVEAL_WIDGET_SOURCE, (source: number) =>
        this.revealSource(source),
      ),
      vscode.commands.registerCommand(SHOW_WIDGET, (node: OutlineNode) => {
        this.toggle(node, true);
      }),
      vscode.commands.registerCommand(HIDE_WIDGET, (node: OutlineNode) => {
        this.toggle(node, false);
      }),
      vscode.commands.registerCommand(CHOOSE_MEMBER, (node: OutlineNode) => {
        const choice = this.tree.choice(node);
        if (choice !== undefined) this.toggleEvents.fire({ kind: 'group', ...choice });
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && isGui(editor.document)) void this.follow(editor.document);
      }),
      vscode.window.onDidChangeTextEditorSelection(({ textEditor }) => {
        this.onCursor(textEditor);
      }),
      vscode.workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
        if (contentChanges.length > 0 && document === this.model?.document) {
          this.schedule(document);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document === this.model?.document) this.model = undefined;
        if (!this.fromPreview && document === this.current?.document) this.show(undefined);
      }),
      this.outline.onDidChangeVisibility(({ visible }) => {
        if (visible) this.revealInOutline();
      }),
    ];
    const active = vscode.window.activeTextEditor;
    if (active && isGui(active.document)) void this.follow(active.document);
  }

  /** An eye of the outline: shows or hides a widget of the previewed window by hand. */
  toggle(node: OutlineNode, shown: boolean): void {
    if (!('kind' in node) || 'state' in node || this.current?.view === undefined) return;
    this.toggleEvents.fire({ kind: 'widget', widget: node, shown });
  }

  /** The previewed window, whoever chose it. */
  get previewed(): PreviewedWindow | undefined {
    return this.current;
  }

  /** The widget highlighted in the preview and the outline. */
  get highlighted(): WidgetHighlight | undefined {
    return this.lastHighlight;
  }

  /**
   * Sets the previewed window from the preview, which then decides it until it passes
   * `undefined`; the window then follows the cursor in the active `.gui` editor again.
   */
  setPreviewed(previewed: PreviewedWindow | undefined): void {
    this.fromPreview = previewed !== undefined;
    if (previewed) {
      this.show(previewed);
      return;
    }
    const active = vscode.window.activeTextEditor;
    if (active && isGui(active.document)) {
      void this.follow(active.document);
    } else {
      this.show(undefined);
    }
  }

  /**
   * Reveals a widget of the previewed window in its editor, selects its key there and selects
   * it in the outline. `source` is the widget's `node.start`; another offset reveals the
   * innermost widget around it. Resolves to whether a widget was found.
   */
  async revealSource(source: number): Promise<boolean> {
    const previewed = this.current;
    if (!previewed) return false;
    const widget = this.widgetAt(previewed, source, true);
    if (!widget) return false;
    const { document, offsets } = previewed;
    const range = new vscode.Range(
      document.positionAt(offsets.toEditor(widget.node.key.start)),
      document.positionAt(offsets.toEditor(widget.node.key.end)),
    );
    const visible = vscode.window.visibleTextEditors.find((editor) => editor.document === document);
    const editor = await vscode.window.showTextDocument(document.uri, {
      viewColumn: visible?.viewColumn ?? vscode.ViewColumn.One,
      selection: range,
    });
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    if (this.current === previewed) this.highlight(widget);
    return true;
  }

  /** The widget of the previewed window that starts at `source`, else the innermost around it. */
  private widgetAt(previewed: PreviewedWindow, source: number, exact: boolean): Widget | undefined {
    const startingAt = (widget: Widget): Widget | undefined =>
      widget.node.start === source
        ? widget
        : widget.children.reduce<Widget | undefined>(
            (found, child) => found ?? startingAt(child),
            undefined,
          );
    const found = exact ? startingAt(previewed.window) : undefined;
    if (found) return found;
    const path = widgetPathAt(previewed.file, source);
    return path[0] === previewed.window ? path.at(-1) : undefined;
  }

  private schedule(document: vscode.TextDocument): void {
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.follow(document);
      }, DEBOUNCE_MS),
    );
  }

  /** Reads a `.gui` document the editor shows and, unless the preview decides, previews from it. */
  private async follow(document: vscode.TextDocument): Promise<void> {
    if (this.model?.document !== document || this.model.version !== document.version) {
      const read = ++this.reads;
      const model = await readModel(document);
      if (read !== this.reads) return; // A later read wins.
      if (this.disposed || document.isClosed || document.version !== model?.version) {
        if (!model && !this.disposed && !this.fromPreview) this.show(undefined);
        return;
      }
      this.model = model;
    }
    if (this.fromPreview) return;
    const editor = this.editorOf(document);
    this.chooseWindow(this.model, editor);
  }

  /** The window at the cursor, else the one previewed before by name, else the first. */
  private chooseWindow(model: GuiModel, editor: vscode.TextEditor | undefined): void {
    const { file, offsets, document } = model;
    const atCursor = editor
      ? widgetPathAt(file, offsets.toGame(document.offsetAt(editor.selection.active)))[0]
      : undefined;
    const before =
      this.current?.document === document && this.current.window.name !== undefined
        ? findDefinition(file, this.current.window.name)
        : undefined;
    const window = atCursor ?? before ?? file.definitions[0];
    const current = this.current;
    if (
      current?.document === document &&
      current.version === model.version &&
      current.window === window
    ) {
      if (editor) this.onCursor(editor);
      return;
    }
    this.show(window && { document, version: model.version, file, window, offsets: model.offsets });
  }

  private show(previewed: PreviewedWindow | undefined): void {
    this.current = previewed;
    this.tree.show(previewed);
    this.outline.message = previewed ? '' : NO_WINDOW;
    this.outline.description = previewed ? widgetLabel(previewed.window) : '';
    this.highlightedWidget = undefined;
    const editor = previewed && this.editorOf(previewed.document);
    if (editor) {
      this.onCursor(editor);
    } else {
      this.highlight(undefined);
    }
  }

  private editorOf(document: vscode.TextDocument): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    return active?.document === document
      ? active
      : vscode.window.visibleTextEditors.find((editor) => editor.document === document);
  }

  /** Highlights the widget at the cursor; following the editor, the cursor may change window. */
  private onCursor(editor: vscode.TextEditor): void {
    const { document } = editor;
    if (!this.fromPreview && this.model?.document === document) {
      if (this.model.version !== document.version) return; // A new model is on its way.
      const window = widgetPathAt(
        this.model.file,
        this.model.offsets.toGame(document.offsetAt(editor.selection.active)),
      )[0];
      if (window && window !== this.current?.window) {
        this.chooseWindow(this.model, editor);
        return;
      }
    }
    const previewed = this.current;
    if (previewed?.document !== document || previewed.version !== document.version) return;
    const offset = previewed.offsets.toGame(document.offsetAt(editor.selection.active));
    this.highlight(this.widgetAt(previewed, offset, false));
  }

  private highlight(widget: Widget | undefined): void {
    const previewed = this.current;
    this.highlightedWidget = widget;
    const next: WidgetHighlight | undefined = previewed && {
      uri: previewed.document.uri,
      source: widget?.node.start,
    };
    const last = this.lastHighlight;
    if (next?.uri.toString() !== last?.uri.toString() || next?.source !== last?.source) {
      this.lastHighlight = next;
      if (next) this.highlightEvents.fire(next);
    }
    this.revealInOutline();
  }

  private revealInOutline(): void {
    const widget = this.highlightedWidget;
    if (!widget || !this.outline.visible || !this.tree.has(widget)) return;
    this.outline.reveal(widget, { select: true, focus: false }).then(undefined, () => {
      // The tree changed before it could reveal; the next highlight reveals again.
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.highlightEvents.dispose();
    this.toggleEvents.dispose();
    this.tree.dispose();
  }
}

/** A label struck through, for a widget the game does not create at this screen height. */
function struck(text: string): string {
  return text.replace(/./gu, (c) => `${c}\u0336`);
}
