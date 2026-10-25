/**
 * The preview copy writer (spec section 4, etch#16, etch#22): the game text of the previewed
 * window's `.gui` file, with every top-level name prefixed, and the previewed window wrapped in a
 * full-screen backdrop window. Two copies go into the overlay mod's `interface` folder,
 * `etch_<file>.gui` over black and `etchw_<file>.gui` over white; a job reloads both and opens
 * their wrappers in turn.
 *
 * The copy keeps every byte of the original except what the rules of etch#16 change:
 * - every top-level name (each direct child of a `guiTypes` block, whatever its kind) gets the
 *   prefix, because a reload of an unprefixed name replaces the playset's live definition;
 * - a value the engine looks up in the global registry gets the prefix when, ignoring case, it
 *   names a top-level definition of the same file: `scrollbartype`, `parent` on a top-level
 *   definition, and a `guiButtonType`'s `tooltip` naming a text box type. Values that name
 *   another file's definitions, nested names, nested `parent`, `background` and scroll bar parts
 *   stay as written. Matching goes by key and position, never by a search of the text;
 * - a second top-level definition of a name is left out, since a reload of a file that defines
 *   a name twice frees the old definition twice;
 * - file-level `default_*sound` keys are left out, since a reload would apply them game-wide.
 *
 * One rule comes from the wrapper (etch#50): the previewed window's own `position` takes the value
 * of its `show_position`. `window open` animates a top-level window from its `hide_position` to
 * its `show_position`, but the wrapped window is nested and stays at its `position` (in the live
 * run `countrydiplomacyview` stayed at x = −600, off the screen), while the offline renderer lays
 * a window out at its `show_position`.
 */
import type { Screen } from '../model/gui.ts';
import { readGuiFile, type Widget } from '../model/gui.ts';
import { diagnostic, type ModelDiagnostic } from '../model/diagnostics.ts';
import { keyOf, propertiesOf } from '../model/properties.ts';
import { parseScript } from '../script/parse.ts';
import type { EntryNode, PropertyNode, ScalarNode } from '../script/tree.ts';
import { encodeDecodedWindows1252 } from '../windows-1252.ts';
import {
  BACKDROP_COLOURS,
  BACKDROP_TEXTURE_SIZE,
  backdropSprite,
  type BackdropColour,
} from './backdrop.ts';

/** The prefix of the copy over each backdrop colour, for its file and its top-level names. */
export const PREVIEW_COPY_PREFIXES: Readonly<Record<BackdropColour, string>> = {
  black: 'etch_',
  white: 'etchw_',
};

/** The suffix that turns a copy's window name into the name of its wrapper. */
export const BACKDROP_WRAPPER_SUFFIX = '_backdrop';

/** Top-level kinds `window open` can show (etch#16); it has no type check, so no other goes to it. */
const OPENABLE_KINDS = new Set(['windowtype', 'eu3dialogtype']);

/** File-level keys that set the game's default button sounds on every reload (etch#16). */
const SOUND_KEYS = new Set([
  'default_clicksound',
  'default_oversound',
  'default_downsound',
  'default_upsound',
]);

const TEXT_BOX_KINDS = new Set(['textBoxType', 'instantTextBoxType']);

/**
 * The scale that makes a 32 px backdrop sprite cover the screen. 120 is what etch#22 verified at
 * 3440×1440; larger screens get the next scale that covers them.
 */
function backdropScale(screen: Screen): number {
  return Math.max(
    120,
    Math.ceil(Math.max(screen.width, screen.height) / BACKDROP_TEXTURE_SIZE) + 1,
  );
}

export interface PreviewCopyRequest {
  /**
   * The original's path relative to the game or mod folder, with `/` or `\`, such as
   * `interface/goto.gui`; files in a subfolder of `interface` are copied under a flattened name.
   */
  readonly path: string;
  /** The original's game text, as `decodeGameText` or the editor buffer gives it. */
  readonly text: string;
  /** Whether the original starts with a UTF-8 byte order mark; the copies then start with one too. */
  readonly bom?: boolean;
  /** The previewed window's top-level name, as the offline preview shows it (any case). */
  readonly window: string;
  /** The game host's screen, the size the wrapper covers. */
  readonly screen: Screen;
  /**
   * Whether another file of the playset defines a top-level name, ignoring case; the writer asks
   * for every name the copies define and refuses to write when one is taken. It must not count
   * the preview copies themselves. Without it only the file itself is checked.
   */
  readonly isTopLevelName?: (name: string) => boolean;
}

/** One of the two copies. */
export interface PreviewCopyFile {
  readonly colour: BackdropColour;
  /** Its path inside the overlay mod: `interface/etch_<file>.gui` or `interface/etchw_<file>.gui`. */
  readonly path: string;
  /** Its file name, which `reload` takes. */
  readonly fileName: string;
  /** The full-screen wrapper window, which `window open` and `window close` take. */
  readonly wrapper: string;
  /** The previewed window's name inside the wrapper, which a capture or tree read addresses. */
  readonly window: string;
  readonly text: string;
  /** The text as the game reads it: Windows-1252, with the original's byte order mark if any. */
  readonly bytes: Uint8Array;
  /** Where each part of `text` comes from in the original, for `originalOffset`. */
  readonly spans: readonly CopySpan[];
}

/**
 * A part of a copy's text from `copy` on: kept from the original at `original` on, or, when
 * `inserted`, written by the copy writer in place of (or before) the original at `original`.
 */
export interface CopySpan {
  readonly copy: number;
  readonly original: number;
  readonly inserted: boolean;
}

export interface PreviewCopy {
  /** The copies over black and over white, or `undefined` when the window cannot be previewed. */
  readonly files: readonly [PreviewCopyFile, PreviewCopyFile] | undefined;
  /** Why there are no copies, or what the copies leave out; ranges are in the original's text. */
  readonly diagnostics: readonly ModelDiagnostic[];
}

/** Whether a file of the overlay mod's `interface` folder is a preview copy, cleared before each start. */
export function isPreviewCopyFile(fileName: string): boolean {
  return /^etchw?_.*\.gui$/i.test(fileName);
}

/**
 * The copies' path inside the overlay mod for an original's path, or `undefined` when the
 * original is not a `.gui` file in an `interface` folder. A file of a subfolder is copied as
 * `interface/etch_<folder>__<file>.gui`, so two originals with one name do not share a copy.
 */
export function previewCopyPath(path: string, colour: BackdropColour): string | undefined {
  const segments = path.split(/[\\/]+/).filter((s) => s !== '' && s !== '.');
  const at = segments.findIndex((s) => s.toLowerCase() === 'interface');
  const inner = segments.slice(at + 1);
  if (at < 0 || inner.length === 0 || !/\.gui$/i.test(inner.at(-1) ?? '')) return undefined;
  return `interface/${PREVIEW_COPY_PREFIXES[colour]}${inner.join('__')}`;
}

/** A top-level entry of a `guiTypes` block that the game registers by name. */
interface TopLevel {
  readonly node: PropertyNode;
  readonly names: readonly ScalarNode[];
  /** The registry name: the last `name` the block writes. */
  readonly name: string;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/**
 * Writes the two preview copies of the window `request.window`. There are no copies when the file
 * has no such top-level definition, when it is not a kind `window open` can show, when its block
 * is not closed, or when a name the copies define is already taken.
 */
export function writePreviewCopy(request: PreviewCopyRequest): PreviewCopy {
  const diagnostics: ModelDiagnostic[] = [];
  const fail = (d: ModelDiagnostic): PreviewCopy => ({
    files: undefined,
    diagnostics: [...diagnostics, d],
  });
  const whole = { start: 0, end: 0 };
  if (previewCopyPath(request.path, 'black') === undefined) {
    return fail(
      diagnostic(
        'error',
        'not-previewable',
        whole,
        `${request.path} is not a .gui file of an interface folder; the game host cannot preview it.`,
      ),
    );
  }

  const parsed = parseScript(request.text);
  const { kept, edits } = topLevelEntries(parsed.entries, diagnostics);
  const target = request.window.toLowerCase();
  const window = kept.find((t) => t.name.toLowerCase() === target);
  if (window === undefined) {
    return fail(
      diagnostic(
        'error',
        'not-previewable',
        whole,
        `This file has no top-level definition named ${request.window}.`,
      ),
    );
  }
  const windowName = window.name;
  if (!OPENABLE_KINDS.has(keyOf(window.node))) {
    return fail(
      diagnostic(
        'warning',
        'game-host-window-kind',
        window.node.key,
        `The game host cannot show a top-level ${window.node.key.text}; only windowType and ` +
          'eu3dialogtype windows can be opened by name (etch#16). The offline preview still shows it.',
      ),
    );
  }
  if (window.node.value?.kind !== 'block' || !window.node.value.closed) {
    return fail(
      diagnostic(
        'error',
        'not-previewable',
        window.node.key,
        `The block of ${windowName} is not closed, so the game host cannot wrap it.`,
      ),
    );
  }

  const names = new Map<string, TopLevel>();
  for (const t of kept) names.set(t.name.toLowerCase(), t);
  for (const property of window.node.value.entries) {
    if (property.kind === 'property' && keyOf(property) === 'parent') {
      diagnostics.push(
        diagnostic(
          'warning',
          'wrapped-parent',
          property,
          `Inside the backdrop wrapper ${windowName} is a nested window, and the game looks its ` +
            'parent up among the wrapper’s children instead of the top-level definitions, so ' +
            'the game host may not apply what it inherits.',
        ),
      );
    }
  }

  const wrapperClash = names.get((windowName + BACKDROP_WRAPPER_SUFFIX).toLowerCase());
  if (wrapperClash !== undefined) {
    return fail(
      diagnostic(
        'error',
        'copy-name-taken',
        wrapperClash.node.key,
        `This file defines ${wrapperClash.name}, the name the preview copy gives the backdrop ` +
          `wrapper of ${windowName}; rename it to preview the window in the game host.`,
      ),
    );
  }
  for (const prefix of Object.values(PREVIEW_COPY_PREFIXES)) {
    const needed = [
      ...kept.map((t) => prefix + t.name),
      prefix + windowName + BACKDROP_WRAPPER_SUFFIX,
    ];
    const taken = needed.find((n) => request.isTopLevelName?.(n) === true);
    if (taken !== undefined) {
      return fail(
        diagnostic(
          'error',
          'copy-name-taken',
          window.node.key,
          `Another file of the playset defines ${taken} at top level, a name the preview copy needs; ` +
            'a reload of the copy would replace it for the whole game.',
        ),
      );
    }
  }

  const shownAt = showPositionEdit(request.text, window.node.value.entries);
  const file = readGuiFile(parsed);
  const references = registryReferences(file.definitions, names);
  const eol = request.text.includes('\r\n') ? '\r\n' : '\n';
  const files = BACKDROP_COLOURS.map((colour) => {
    const prefix = PREVIEW_COPY_PREFIXES[colour];
    const copyWindow = prefix + windowName;
    const wrapper = copyWindow + BACKDROP_WRAPPER_SUFFIX;
    const copyEdits: Edit[] = [...edits];
    for (const t of kept) {
      for (const n of t.names) copyEdits.push(prefixed(n, prefix));
    }
    for (const n of references) copyEdits.push(prefixed(n, prefix));
    if (shownAt !== undefined) copyEdits.push(shownAt);
    const [head, tail] = wrapperText(wrapper, colour, request.screen, eol);
    copyEdits.push(
      { start: window.node.start, end: window.node.start, text: head },
      { start: window.node.end, end: window.node.end, text: tail },
    );
    const { text, spans } = applyEdits(request.text, copyEdits);
    const path = previewCopyPath(request.path, colour) ?? '';
    const body = encodeDecodedWindows1252(text);
    const bytes = request.bom ? withBom(body) : body;
    return {
      colour,
      path,
      fileName: path.slice('interface/'.length),
      wrapper,
      window: copyWindow,
      text,
      bytes,
      spans,
    };
  });

  const [black, white] = files as [PreviewCopyFile, PreviewCopyFile];
  return { files: [black, white], diagnostics: diagnostics.sort((a, b) => a.start - b.start) };
}

/**
 * The edit that gives a window's `position` the value of its `show_position`, among its own
 * properties (the last of each applies); none when it lacks either.
 */
function showPositionEdit(text: string, entries: readonly EntryNode[]): Edit | undefined {
  let position: PropertyNode | undefined;
  let shown: PropertyNode | undefined;
  for (const entry of entries) {
    if (entry.kind !== 'property' || entry.value === undefined) continue;
    const key = keyOf(entry);
    if (key === 'position') position = entry;
    else if (key === 'show_position') shown = entry;
  }
  if (position?.value === undefined || shown?.value === undefined) return undefined;
  return {
    start: position.value.start,
    end: position.value.end,
    text: text.slice(shown.value.start, shown.value.end),
  };
}

/**
 * The top-level entries the copy keeps, and the edits that leave out the rest: every
 * `guiTypes` block's named blocks, without a second definition of a name, and without
 * file-level `default_*sound` keys.
 */
function topLevelEntries(
  entries: readonly EntryNode[],
  diagnostics: ModelDiagnostic[],
): { kept: TopLevel[]; edits: Edit[] } {
  const kept: TopLevel[] = [];
  const edits: Edit[] = [];
  const first = new Map<string, TopLevel>();
  for (const entry of entries) {
    if (entry.kind !== 'property') continue;
    const key = keyOf(entry);
    if (SOUND_KEYS.has(key)) {
      edits.push({ start: entry.start, end: entry.end, text: '' });
      diagnostics.push(
        diagnostic(
          'information',
          'copy-leaves-out',
          entry,
          `The preview copy leaves out ${entry.key.text}: a reload would set the game's default ` +
            'button sound from it.',
        ),
      );
      continue;
    }
    if (key !== 'guitypes' || entry.value?.kind !== 'block') continue;
    for (const child of propertiesOf(entry.value)) {
      if (child.value?.kind !== 'block') continue;
      const names = propertiesOf(child.value).flatMap((p) =>
        keyOf(p) === 'name' && p.value?.kind === 'scalar' ? [p.value] : [],
      );
      const last = names.at(-1);
      if (last === undefined) continue;
      const top: TopLevel = { node: child, names, name: last.text };
      const lower = top.name.toLowerCase();
      const earlier = first.get(lower);
      if (earlier === undefined) {
        first.set(lower, top);
        kept.push(top);
        continue;
      }
      edits.push({ start: child.start, end: child.end, text: '' });
      diagnostics.push(
        diagnostic(
          'warning',
          'copy-leaves-out',
          last,
          `The preview copy leaves out this second top-level definition of ${top.name} and ` +
            `keeps the one at offset ${String(earlier.node.start)}; the game itself keeps one of ` +
            'the two at random, and a reload of a file that defines a name twice can crash it (etch#16).',
        ),
      );
    }
  }
  return { kept, edits };
}

/**
 * Values the engine looks up in the global registry that name a top-level definition of this
 * file (etch#16): `scrollbartype` in any widget (list boxes, smooth list boxes and instant text
 * boxes verified; it never names a sibling), `parent` on a top-level definition, and a
 * `guiButtonType`'s `tooltip` when it names a text box type. `if_resolution` blocks count too.
 * A value written as a `@constant` is left as it is.
 */
function registryReferences(
  definitions: readonly Widget[],
  names: ReadonlyMap<string, TopLevel>,
): ScalarNode[] {
  const out: ScalarNode[] = [];
  const kinds = new Map<string, string>();
  for (const w of definitions) {
    if (w.name !== undefined && !kinds.has(w.name.toLowerCase()))
      kinds.set(w.name.toLowerCase(), w.kind);
  }
  const visit = (widget: Widget, topLevel: boolean): void => {
    const properties = [
      ...widget.properties.filter((p) => keyOf(p) !== 'if_resolution'),
      ...widget.resolutionBlocks.flatMap((b) => b.entries),
    ];
    for (const property of properties) {
      const value = property.value;
      if (value?.kind !== 'scalar' || value.text === '' || value.text.startsWith('@')) continue;
      const target = value.text.toLowerCase();
      if (!names.has(target)) continue;
      const key = keyOf(property);
      const named = kinds.get(target);
      if (
        key === 'scrollbartype' ||
        (key === 'parent' && topLevel) ||
        (key === 'tooltip' &&
          widget.kind === 'guiButtonType' &&
          named !== undefined &&
          TEXT_BOX_KINDS.has(named))
      ) {
        out.push(value);
      }
    }
    for (const child of widget.children) visit(child, false);
  };
  for (const definition of definitions) visit(definition, true);
  return out;
}

/** The edit that puts the prefix in front of a scalar's text, inside its quotes. */
function prefixed(node: ScalarNode, prefix: string): Edit {
  const at = node.quoted ? node.start + 1 : node.start;
  return { start: at, end: at, text: prefix };
}

/**
 * The text before and after the previewed window's block: a full-screen window at (0, 0) whose
 * first child is the scaled backdrop icon and whose second is the window, nested and unchanged
 * (etch#22 verified that this changes none of the window's pixels).
 */
function wrapperText(
  wrapper: string,
  colour: BackdropColour,
  screen: Screen,
  eol: string,
): [string, string] {
  const head = [
    'windowType = {',
    `\t\tname = "${wrapper}"`,
    '\t\tposition = { x = 0 y = 0 }',
    `\t\tsize = { x = ${String(screen.width)} y = ${String(screen.height)} }`,
    '\t\tmoveable = 0',
    '\t\tfullscreen = yes',
    '\t\ticonType = {',
    '\t\t\tname = "etch_backdrop_fill"',
    `\t\t\tspriteType = "${backdropSprite(colour)}"`,
    '\t\t\tposition = { x = 0 y = 0 }',
    `\t\t\tscale = ${String(backdropScale(screen))}`,
    '\t\t}',
    '\t\t',
  ].join(eol);
  return [head, `${eol}\t}`];
}

/**
 * Applies non-overlapping edits; inserts at one offset keep their order. Returns the text and
 * where each part of it comes from.
 */
function applyEdits(
  text: string,
  edits: readonly Edit[],
): { text: string; spans: readonly CopySpan[] } {
  const sorted = edits
    .map((edit, order) => ({ edit, order }))
    .sort((a, b) => a.edit.start - b.edit.start || a.edit.end - b.edit.end || a.order - b.order);
  const parts: string[] = [];
  const spans: CopySpan[] = [];
  let at = 0;
  let length = 0;
  const push = (part: string, original: number, inserted: boolean): void => {
    if (part === '') return;
    spans.push({ copy: length, original, inserted });
    parts.push(part);
    length += part.length;
  };
  for (const { edit } of sorted) {
    if (edit.start < at) continue; // inside a range already left out
    push(text.slice(at, edit.start), at, false);
    push(edit.text, edit.start, true);
    at = edit.end;
  }
  push(text.slice(at), at, false);
  return { text: parts.join(''), spans };
}

/**
 * The offset in the original's text that an offset of a copy's text comes from; text the copy
 * writer added (the wrapper, a prefix, the moved `position`) maps to where it went in.
 */
export function originalOffset(copy: PreviewCopyFile, offset: number): number {
  let low = 0;
  let high = copy.spans.length - 1;
  let found: CopySpan | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const span = copy.spans[middle];
    if (span === undefined) break;
    if (span.copy <= offset) {
      found = span;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found === undefined) return 0;
  return found.inserted ? found.original : found.original + (offset - found.copy);
}

function withBom(body: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(body, 3);
  return bytes;
}
