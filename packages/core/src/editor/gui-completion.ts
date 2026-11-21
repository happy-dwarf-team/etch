/**
 * Completion in `.gui` files (ADR 0008): what the cursor stands on, read from the text and the
 * model, and the vocabulary of the playset's own `.gui` files. The extension offers from them
 * the widget types a window holds, the keys a widget type takes, the values a key takes, and
 * sprite and font names from the playset's `.gfx` files.
 *
 * The vocabulary is what the playset writes, counted, not a schema: a key or a child type is
 * offered for a widget type when some `.gui` file of the playset writes it there. Values are
 * offered for a key only when the playset writes few of them and none is a number
 * (`alwaysTransparent`, `format`, `clicksound`); `orientation` offers the anchors of the exe's
 * token table.
 */
import { ANCHOR_NAMES } from '../layout/window.ts';
import {
  readGuiFile,
  widgetPathAt,
  type GuiFile,
  type Widget,
  type WidgetKind,
} from '../model/gui.ts';
import { keyOf, parseNumber } from '../model/properties.ts';
import { isFontKey, isSpriteKey } from '../model/references.ts';
import { parseScript } from '../script/parse.ts';
import type { EntryNode, PropertyNode } from '../script/tree.ts';

/** Where the cursor stands, for completion: on a key, or on the value of a widget's key. */
export type GuiCompletionContext = GuiKeyContext | GuiValueContext;

export interface GuiKeyContext {
  readonly kind: 'key';
  /** The widget whose block holds the cursor; `undefined` directly inside `guiTypes`. */
  readonly widget: WidgetKind | undefined;
  /** The word under the cursor that the completion replaces, as offsets of the text. */
  readonly start: number;
  readonly end: number;
}

export interface GuiValueContext {
  /** `sprite` and `font` for the keys `guiDiagnostics` checks as such, `value` for the rest. */
  readonly kind: 'sprite' | 'font' | 'value';
  readonly widget: WidgetKind;
  /** The key, in lower case. */
  readonly key: string;
  /** The value's text the completion replaces, inside the quotes when there is an opening one. */
  readonly start: number;
  readonly end: number;
  /** Whether the value has its opening quote, and whether its closing one follows `end`. */
  readonly quoted: boolean;
  readonly closed: boolean;
}

const VALUE_BEFORE = /([A-Za-z_][\w.]*)\s*=\s*(")?([^\s"{}=#]*)$/;
const KEY_BEFORE = /(?:^|[\s{}])([A-Za-z_]\w*)?$/;
const VALUE_AFTER = /^[^\s"{}=#]*/;
const KEY_AFTER = /^\w*/;

/** Where the cursor stands in a `.gui` file's text, or `undefined` where Etch offers nothing. */
export function guiCompletionAt(text: string, offset: number): GuiCompletionContext | undefined {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const before = text.slice(lineStart, offset);
  if (before.replace(/"[^"]*"/g, '').includes('#')) return undefined;
  const after = text.slice(
    offset,
    text.indexOf('\n', offset) < 0 ? undefined : text.indexOf('\n', offset),
  );

  const value = VALUE_BEFORE.exec(before);
  if (value !== null) {
    const widget = widgetAt(text, offset);
    if (widget === undefined) return undefined;
    const key = (value[1] ?? '').toLowerCase();
    const start = offset - (value[3] ?? '').length;
    const end = offset + (VALUE_AFTER.exec(after)?.[0].length ?? 0);
    const quoted = value[2] !== undefined;
    const kind = isSpriteKey(key, widget) ? 'sprite' : isFontKey(key) ? 'font' : 'value';
    return { kind, widget, key, start, end, quoted, closed: quoted && text[end] === '"' };
  }

  const word = KEY_BEFORE.exec(before);
  if (word === null) return undefined;
  const start = offset - (word[1] ?? '').length;
  if (/=\s*$/.test(text.slice(Math.max(0, start - 200), start))) return undefined;
  const block = blockAt(text, offset);
  if (block === undefined) return undefined;
  return {
    kind: 'key',
    widget: block.widget,
    start,
    end: offset + (KEY_AFTER.exec(after)?.[0].length ?? 0),
  };
}

/** The widget whose own block holds the offset (or one of its `if_resolution` blocks). */
function widgetAt(text: string, offset: number): WidgetKind | undefined {
  const block = blockAt(text, offset);
  return block?.widget;
}

/** The block holding the offset: a widget's, or `guiTypes` itself (`widget` undefined). */
function blockAt(text: string, offset: number): { widget: WidgetKind | undefined } | undefined {
  const parsed = parseScript(text);
  const chain = blockChain(parsed.entries, offset);
  const last = chain.at(-1);
  if (last === undefined) return undefined;
  if (chain.length === 1) return keyOf(last) === 'guitypes' ? { widget: undefined } : undefined;
  const path = widgetPathAt(readGuiFile(parsed), offset);
  const widget: Widget | undefined = path.at(-1);
  if (widget === undefined) return undefined;
  if (last === widget.node) return { widget: widget.kind };
  if (keyOf(last) === 'if_resolution' && chain.at(-2) === widget.node) {
    return { widget: widget.kind };
  }
  return undefined;
}

/** The properties whose block holds the offset, from the file's top level inward. */
function blockChain(entries: readonly EntryNode[], offset: number): PropertyNode[] {
  const chain: PropertyNode[] = [];
  let level = entries;
  for (;;) {
    const hit = level.find(
      (entry): entry is PropertyNode =>
        entry.kind === 'property' &&
        entry.value?.kind === 'block' &&
        entry.value.start < offset &&
        (offset < entry.value.end || !entry.value.closed),
    );
    if (hit?.value?.kind !== 'block') return chain;
    chain.push(hit);
    level = hit.value.entries;
  }
}

/** A widget type, key or value as the playset writes it, with how often. */
export interface GuiWord {
  /** Its most common spelling in the playset. */
  readonly written: string;
  readonly count: number;
}

export interface GuiKeyWord extends GuiWord {
  /** Whether the playset writes a block after the key (`position = { … }`) more than a word. */
  readonly block: boolean;
}

export interface GuiValueWord extends GuiWord {
  /** Whether the playset writes the value in quotes more often than not. */
  readonly quoted: boolean;
}

/** At most this many distinct values make a key's values a set worth offering. */
const MAX_VALUES = 16;

class Tally {
  readonly spellings = new Map<string, number>();
  count = 0;
  blocks = 0;
  quoted = 0;

  add(written: string, block: boolean, quoted: boolean): void {
    this.spellings.set(written, (this.spellings.get(written) ?? 0) + 1);
    this.count++;
    if (block) this.blocks++;
    if (quoted) this.quoted++;
  }

  get written(): string {
    let best = '';
    let most = 0;
    for (const [written, count] of this.spellings) {
      if (count > most) [best, most] = [written, count];
    }
    return best;
  }
}

function tally(map: Map<string, Tally>, key: string): Tally {
  let found = map.get(key);
  if (found === undefined) {
    found = new Tally();
    map.set(key, found);
  }
  return found;
}

function byCount<T extends GuiWord>(words: T[]): T[] {
  return words.sort((a, b) => b.count - a.count || a.written.localeCompare(b.written));
}

/** The widget types, keys and values the playset's `.gui` files write, by widget type. */
export class GuiVocabulary {
  private readonly top = new Map<string, Tally>();
  private readonly children = new Map<WidgetKind, Map<string, Tally>>();
  private readonly keyMap = new Map<WidgetKind, Map<string, Tally>>();
  private readonly valueMap = new Map<string, Map<string, Tally>>();

  private constructor() {}

  static of(files: readonly GuiFile[]): GuiVocabulary {
    const vocabulary = new GuiVocabulary();
    for (const file of files) {
      for (const widget of file.definitions) {
        tally(vocabulary.top, widget.kind).add(widget.kind, true, false);
        vocabulary.read(widget);
      }
    }
    return vocabulary;
  }

  private read(widget: Widget): void {
    const keys = this.keyMap.get(widget.kind) ?? new Map<string, Tally>();
    this.keyMap.set(widget.kind, keys);
    const entries = [...widget.properties, ...widget.resolutionBlocks.flatMap((b) => b.entries)];
    for (const property of entries) {
      const key = keyOf(property);
      const value = property.value;
      tally(keys, key).add(property.key.text, value?.kind === 'block', false);
      if (value?.kind !== 'scalar') continue;
      const values = this.valueMap.get(`${widget.kind}|${key}`) ?? new Map<string, Tally>();
      this.valueMap.set(`${widget.kind}|${key}`, values);
      tally(values, value.text.toLowerCase()).add(value.text, false, value.quoted);
    }
    const children = this.children.get(widget.kind) ?? new Map<string, Tally>();
    this.children.set(widget.kind, children);
    for (const child of widget.children) {
      tally(children, child.kind).add(child.kind, true, false);
      this.read(child);
    }
  }

  /** The widget types written directly inside `guiTypes`, the most used first. */
  topKinds(): GuiWord[] {
    return words(this.top);
  }

  /** The widget types written inside a widget of this type, the most used first. */
  childKinds(kind: WidgetKind): GuiWord[] {
    return words(this.children.get(kind));
  }

  /** The keys written in a widget of this type, child widgets left out, the most used first. */
  keys(kind: WidgetKind): GuiKeyWord[] {
    const map = this.keyMap.get(kind);
    if (map === undefined) return [];
    return byCount(
      [...map.values()].map((t) => ({
        written: t.written,
        count: t.count,
        block: t.blocks * 2 > t.count,
      })),
    );
  }

  /**
   * The values of a key (in lower case) in a widget of this type, the most used first: for
   * `orientation` the exe's anchors, for any other key the playset's values when they are at
   * most 16 and none is a number, and none otherwise.
   */
  values(kind: WidgetKind, key: string): GuiValueWord[] {
    const map = this.valueMap.get(`${kind}|${key}`);
    if (key === 'orientation') {
      return byCount(
        ANCHOR_NAMES.map((name) => {
          const seen = map?.get(name);
          return seen === undefined
            ? { written: name.toUpperCase(), count: 0, quoted: true }
            : { written: seen.written, count: seen.count, quoted: seen.quoted * 2 > seen.count };
        }),
      );
    }
    if (map === undefined || map.size > MAX_VALUES) return [];
    if ([...map.keys()].some((value) => parseNumber(value.replace(/%$/, '')) !== undefined)) {
      return [];
    }
    return byCount(
      [...map.values()].map((t) => ({
        written: t.written,
        count: t.count,
        quoted: t.quoted * 2 > t.count,
      })),
    );
  }
}

function words(map: Map<string, Tally> | undefined): GuiWord[] {
  if (map === undefined) return [];
  return byCount([...map.values()].map((t) => ({ written: t.written, count: t.count })));
}
