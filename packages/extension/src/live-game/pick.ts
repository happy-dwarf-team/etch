// What a pick in the live game opens (spec section 7, etch#158, docs/pick-mode-checks.md): the
// definition the game reports, resolved to the playset's winning file, at the line of the `{` that
// opens it (H2), checked against Etch's model and found again by names when the file changed since
// the game read it. A template (a list row, a `core.gui` scroll bar part, an icon template from
// another file) opens the widget that references it first; an icon or a button offers its sprite
// through Etch's `.gfx` index. And **Override in my mod**: the winning file copied byte for byte
// into the edited mod. Node only, no vscode.
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseScript, readGuiFile, type InterfaceIndex, type Widget } from '@etch/core';
import type { GameFiles } from '@etch/core/playset';
import type { PickedWidget, PickEvent } from './pipe.ts';

/** A place to open: a file of the playset at a line. */
export interface PickLocation {
  /** Game-relative path with `/`. */
  readonly path: string;
  readonly absolutePath: string;
  /** The mod that supplies the file, or `game`. */
  readonly layer: string;
  /** 0-based line; 0 when the file is opened without a line. */
  readonly line: number;
  /** The file is not the edited mod's: it opens read-only, with **Override in my mod**. */
  readonly readOnly: boolean;
  /** The widget's name, for the notices. */
  readonly name: string;
}

/** How the line was found. */
export type LineMatch =
  /** A widget of that name opens its block on the reported line. */
  | 'line'
  /** The file changed since the game read it: found by the chain's names from its window. */
  | 'names'
  /** Found as the first widget of that name in the file (a stale widget opens this way). */
  | 'name'
  /** Neither: the file opens at the reported line, or at its top. */
  | 'file';

export interface PickTarget {
  /** The picked widget. */
  readonly widget: PickedWidget;
  /** What opens first: the widget, or for a template the widget that references it. */
  readonly open: PickLocation;
  readonly match: LineMatch;
  /** The picked widget's own definition when `open` is the widget referencing it ("Go to template"). */
  readonly template: PickLocation | undefined;
  /** The sprite the picked widget names, for "Go to sprite"; resolved with `spriteLocation`. */
  readonly sprite: string | undefined;
}

/** Why a pick opens nothing. */
export type PickRefusal = 'no-widget' | 'no-file';

export interface PickSources {
  readonly files: GameFiles;
  /** The edited mod's folder; every other file opens read-only. */
  readonly editedRoot: string | undefined;
  /**
   * The text of a file as the user has it: the editor's buffer when it is open, else the file on
   * disk (one character per byte, so offsets count bytes). `undefined` when it cannot be read.
   */
  readonly text: (absolutePath: string) => Promise<string | undefined>;
}

/** What a pick opens, or why it opens nothing. */
export async function resolvePick(
  pick: PickEvent,
  sources: PickSources,
): Promise<PickTarget | PickRefusal> {
  const widget = pick.chain[0];
  if (widget === undefined) return 'no-widget';
  // A stale widget has no file: it opens by name in the nearest file of its chain (H4).
  const file = widget.file ?? pick.chain.find((w) => w.file !== undefined)?.file;
  if (file === undefined) return 'no-file';
  const own = await locate(widget, pick.chain, file, sources);
  if (own === undefined) return 'no-file';
  // Where the chain's file changes above the widget, the widget was built from a template that
  // the first widget of the other file references (H3): that one opens first.
  const boundary =
    widget.file === undefined ? -1 : pick.chain.findIndex((w) => w.file !== widget.file);
  const referencing = boundary > 0 ? pick.chain[boundary] : undefined;
  let open = own.location;
  let match = own.match;
  let template: PickLocation | undefined;
  if (referencing?.file !== undefined) {
    const found = await locate(referencing, pick.chain.slice(boundary), referencing.file, sources);
    if (found !== undefined) {
      template = own.location;
      open = found.location;
      match = found.match;
    }
  }
  return { widget, open, match, template, sprite: own.sprite };
}

/** A widget of a chain in a file: its location, how it was found and its sprite. */
async function locate(
  widget: PickedWidget,
  chain: readonly PickedWidget[],
  path: string,
  sources: PickSources,
): Promise<{ location: PickLocation; match: LineMatch; sprite: string | undefined } | undefined> {
  const winner = await sources.files.find(path);
  if (winner === undefined) return undefined;
  const text = await sources.text(winner.absolutePath);
  const base = {
    path: winner.path,
    absolutePath: winner.absolutePath,
    layer: winner.layer.name,
    readOnly: !inside(winner.absolutePath, sources.editedRoot),
    name: widget.name,
  };
  const fallbackLine = widget.stale ? 0 : Math.max(0, widget.line - 1);
  if (text === undefined)
    return { location: { ...base, line: fallbackLine }, match: 'file', sprite: undefined };
  const model = readGuiFile(parseScript(text));
  const lines = lineStarts(text);
  const found = findWidget(model.definitions, widget, chain, lines);
  if (found === undefined) {
    return { location: { ...base, line: fallbackLine }, match: 'file', sprite: undefined };
  }
  return {
    location: { ...base, line: lineOf(lines, braceOf(found.widget)) },
    match: found.match,
    sprite: spriteOf(found.widget),
  };
}

/** The offset of the `{` that opens a widget's block, else of its keyword. */
function braceOf(widget: Widget): number {
  return widget.node.value?.kind === 'block' ? widget.node.value.start : widget.node.start;
}

/** Finds the picked widget in a file's definitions: by line, by the chain's names, by name. */
function findWidget(
  definitions: readonly Widget[],
  widget: PickedWidget,
  chain: readonly PickedWidget[],
  lines: readonly number[],
): { widget: Widget; match: LineMatch } | undefined {
  const name = widget.name.toLowerCase();
  const all = flatten(definitions);
  if (!widget.stale && widget.line > 0) {
    const reported = widget.line - 1;
    // The opening brace on the reported line; its keyword may be on the line before (H2).
    const atLine = all.filter(
      (w) =>
        lineOf(lines, braceOf(w)) === reported && (name === '' || w.name?.toLowerCase() === name),
    );
    if (atLine[0] !== undefined) return { widget: atLine[0], match: 'line' };
  }
  const byNames = walkNames(definitions, widget, chain);
  if (byNames !== undefined) return { widget: byNames, match: 'names' };
  const byName = name === '' ? undefined : all.find((w) => w.name?.toLowerCase() === name);
  return byName === undefined ? undefined : { widget: byName, match: 'name' };
}

/**
 * The widget by the names of its chain from the outermost parent defined in the same file: the
 * name walk for a buffer changed since the last reload. Positional steps and unnamed widgets
 * end the walk.
 */
function walkNames(
  definitions: readonly Widget[],
  widget: PickedWidget,
  chain: readonly PickedWidget[],
): Widget | undefined {
  const same: PickedWidget[] = [];
  for (const w of chain) {
    if (w !== widget && widget.file !== undefined && w.file !== widget.file) break;
    same.push(w);
  }
  const names = same.reverse().map((w) => w.name.toLowerCase());
  if (names.some((n) => n === '')) return undefined;
  // The outermost may be any definition of the file, also one nested in another.
  for (const start of flatten(definitions)) {
    if (start.name?.toLowerCase() !== names[0]) continue;
    let at: Widget | undefined = start;
    for (const n of names.slice(1)) {
      at = at.children.find((c) => c.name?.toLowerCase() === n);
      if (at === undefined) break;
    }
    if (at !== undefined) return at;
  }
  return undefined;
}

function flatten(widgets: readonly Widget[]): Widget[] {
  const out: Widget[] = [];
  const visit = (w: Widget): void => {
    out.push(w);
    w.children.forEach(visit);
  };
  widgets.forEach(visit);
  return out;
}

/** The sprite a widget names (`spriteType`, a button's `quadTextureSprite`). */
function spriteOf(widget: Widget): string | undefined {
  for (const p of widget.properties) {
    const key = p.key.text.toLowerCase();
    if ((key === 'spritetype' || key === 'quadtexturesprite') && p.value?.kind === 'scalar') {
      return p.value.text === '' ? undefined : p.value.text;
    }
  }
  return undefined;
}

/** Where Etch's `.gfx` index defines a sprite (the game knows no file or line for one, H9). */
export async function spriteLocation(
  name: string,
  index: InterfaceIndex,
  sources: PickSources,
): Promise<PickLocation | undefined> {
  const located = index.sprite(name);
  if (located === undefined) return undefined;
  const winner = await sources.files.find(located.path);
  if (winner === undefined) return undefined;
  const text = (await sources.text(winner.absolutePath)) ?? '';
  return {
    path: winner.path,
    absolutePath: winner.absolutePath,
    layer: winner.layer.name,
    line: lineOf(lineStarts(text), located.item.node.start),
    readOnly: !inside(winner.absolutePath, sources.editedRoot),
    name,
  };
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

/** The 0-based line of an offset. */
function lineOf(starts: readonly number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function inside(file: string, folder: string | undefined): boolean {
  if (folder === undefined) return false;
  const rel = relative(resolve(folder), resolve(file));
  return rel !== '' && !rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel);
}

/** What **Override in my mod** did. */
export type OverrideResult =
  | {
      readonly kind: 'copied' | 'exists';
      /** The copy in the edited mod. */
      readonly absolutePath: string;
      /** A later mod of the playset has the same file, so the copy is not what the game reads. */
      readonly laterMod: string | undefined;
    }
  /** The file is the edited mod's already, or not a file of the playset, or there is no edited mod. */
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * Copies the winning file of a game path byte for byte to the same path in the edited mod's folder
 * (spec section 7). Nothing is copied when the mod has the file already. It warns, and still copies,
 * when a later mod of the playset has the same file: the copy is then not what the game reads.
 */
export async function overrideInMod(
  path: string,
  files: GameFiles,
  editedRoot: string | undefined,
): Promise<OverrideResult> {
  if (editedRoot === undefined) {
    return {
      kind: 'refused',
      reason: 'the workspace is not a mod, so there is nothing to copy into',
    };
  }
  const winner = await files.find(path);
  if (winner === undefined)
    return { kind: 'refused', reason: `${path} is not a file of the playset` };
  const target = join(editedRoot, ...winner.path.split('/'));
  const editedIndex = files.layers.findIndex((l) => resolve(l.root) === resolve(editedRoot));
  const later = await laterLayerWith(files, winner.path, editedIndex);
  if (await exists(target)) return { kind: 'exists', absolutePath: target, laterMod: later };
  await mkdir(dirname(target), { recursive: true });
  await copyFile(winner.absolutePath, target);
  return { kind: 'copied', absolutePath: target, laterMod: later };
}

/** The first mod after the edited one (in load order) that has a file at `path`. */
async function laterLayerWith(
  files: GameFiles,
  path: string,
  editedIndex: number,
): Promise<string | undefined> {
  if (editedIndex < 0) return undefined;
  for (const layer of files.layers.slice(editedIndex + 1)) {
    if (await exists(join(layer.root, ...path.split('/')))) return layer.name;
  }
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

/** The game path of a file of the playset, by the layer whose folder holds it. */
export function gamePathOf(file: string, files: GameFiles): string | undefined {
  for (let i = files.layers.length - 1; i >= 0; i--) {
    const layer = files.layers[i];
    if (layer === undefined || !inside(file, layer.root)) continue;
    return relative(resolve(layer.root), resolve(file)).split(sep).join('/');
  }
  return undefined;
}

/**
 * The label's sources: each interface file a mod supplies, by game path, with that mod's name
 * (the plugin names the game's own as `EU4`).
 */
export async function interfaceSources(files: GameFiles): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const file of await files.list('interface', '.gui')) {
    if (files.layers.indexOf(file.layer) > 0) out[file.path.toLowerCase()] = file.layer.name;
  }
  return out;
}
