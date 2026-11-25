/**
 * Completion in `.gui` files (ADR 0008): what the cursor stands on, read from the text against
 * the keys EU4 1.37.5 reads for each widget (`GUI_SCHEMAS`), and the playset's own `.gui` files
 * for spelling and order. The extension offers from them the widgets `guiTypes` holds, the keys a
 * widget takes and the child widgets it creates, the fields of a value block (`position`), the
 * values a key takes, and sprite and font names from the playset's `.gfx` files.
 *
 * The keys are exactly the ones the game reads at that place; the playset only ranks them by use
 * and gives the spelling it writes most (`listboxType` for the table's `listBoxType`). Values are
 * an enum's words or `yes` and `no` where the game reads one, and for a word the game reads as
 * text, the playset's values when it writes few of them and none is a number (`clicksound`).
 */
import { keyOf, parseNumber } from '../model/properties.ts';
import { isFontKey } from '../model/references.ts';
import {
  GUI_ROOT_PLACE,
  guiPlaceInside,
  guiPlaceKeys,
  guiValueKind,
  guiValueWords,
  type GuiPlace,
} from '../model/gui-structure.ts';
import type { GuiFile } from '../model/gui.ts';
import type { GuiSchemaName, GuiValueKind } from '../model/gui-schema.ts';
import { parseScript } from '../script/parse.ts';
import type { BlockNode, EntryNode, PropertyNode } from '../script/tree.ts';

/** Where the cursor stands, for completion: on a key, or on the value of a widget's key. */
export type GuiCompletionContext = GuiKeyContext | GuiValueContext;

export interface GuiKeyContext {
  readonly kind: 'key';
  /** The block whose keys the completion offers. */
  readonly place: GuiPlace;
  /** The word under the cursor that the completion replaces, as offsets of the text. */
  readonly start: number;
  readonly end: number;
}

export interface GuiValueContext {
  /** `sprite` for a key the game reads as a sprite (and a list's `background`), `font` for fonts. */
  readonly kind: 'sprite' | 'font' | 'value';
  /** The widget's schema and its key as written. */
  readonly schema: GuiSchemaName;
  readonly widget: string;
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
    const place = placeAt(text, offset);
    if (place?.kind !== 'widget') return undefined;
    const key = (value[1] ?? '').toLowerCase();
    const start = offset - (value[3] ?? '').length;
    const end = offset + (VALUE_AFTER.exec(after)?.[0].length ?? 0);
    const quoted = value[2] !== undefined;
    const valueKind = guiValueKind(place.schema, key);
    const kind =
      valueKind === 'sprite' || (key === 'background' && place.schema === 'listBox')
        ? 'sprite'
        : isFontKey(key)
          ? 'font'
          : 'value';
    return {
      kind,
      schema: place.schema,
      widget: place.written,
      key,
      start,
      end,
      quoted,
      closed: quoted && text[end] === '"',
    };
  }

  const word = KEY_BEFORE.exec(before);
  if (word === null) return undefined;
  const start = offset - (word[1] ?? '').length;
  if (/=\s*$/.test(text.slice(Math.max(0, start - 200), start))) return undefined;
  const place = placeAt(text, offset);
  if (place === undefined) return undefined;
  return {
    kind: 'key',
    place,
    start,
    end: offset + (KEY_AFTER.exec(after)?.[0].length ?? 0),
  };
}

/** The place of the block holding the offset: `guiTypes`, a widget's block or a value block. */
function placeAt(text: string, offset: number): GuiPlace | undefined {
  const chain = blockChain(parseScript(text).entries, offset);
  const [first, ...rest] = chain;
  if (first === undefined || keyOf(first) !== 'guitypes') return undefined;
  let place: GuiPlace | undefined = GUI_ROOT_PLACE;
  for (const property of rest) {
    place = guiPlaceInside(place, property);
    if (place === undefined) return undefined;
  }
  return place;
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

/** A key or value as the completion offers it, with how often the playset writes it. */
export interface GuiWord {
  /** The playset's most common spelling, or the table's when the playset does not write it. */
  readonly written: string;
  readonly count: number;
}

export interface GuiKeyWord extends GuiWord {
  /** The child widget's schema for a widget key. */
  readonly widget: GuiSchemaName | undefined;
  /** What the game reads the value as; `undefined` for a widget and `if_resolution`. */
  readonly value: GuiValueKind | 'int' | 'length' | undefined;
  /** Whether the key takes a block (`position = { … }`) rather than a word. */
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
  quoted = 0;

  add(written: string, quoted: boolean): void {
    this.spellings.set(written, (this.spellings.get(written) ?? 0) + 1);
    this.count++;
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

/** How a place is tallied: `guiTypes`, a widget's schema, or a value block's kind. */
function placeKey(place: GuiPlace): string {
  return place.kind === 'root' ? 'root' : place.kind === 'widget' ? place.schema : place.block;
}

/** How often the playset's `.gui` files write each key and value, at each place of the table. */
export class GuiVocabulary {
  private readonly keyMap = new Map<string, Map<string, Tally>>();
  private readonly valueMap = new Map<string, Map<string, Tally>>();

  private constructor() {}

  static of(files: readonly GuiFile[]): GuiVocabulary {
    const vocabulary = new GuiVocabulary();
    for (const file of files) {
      for (const guiTypes of file.guiTypes) {
        if (guiTypes.value?.kind === 'block') vocabulary.read(GUI_ROOT_PLACE, guiTypes.value);
      }
    }
    return vocabulary;
  }

  private read(place: GuiPlace, block: BlockNode): void {
    const where = placeKey(place);
    const keys = this.keyMap.get(where) ?? new Map<string, Tally>();
    this.keyMap.set(where, keys);
    for (const entry of block.entries) {
      if (entry.kind !== 'property') continue;
      const key = keyOf(entry);
      tally(keys, key).add(entry.key.text, false);
      const value = entry.value;
      if (value?.kind === 'block') {
        const inside = guiPlaceInside(place, entry);
        if (inside !== undefined) this.read(inside, value);
      } else if (value?.kind === 'scalar' && place.kind === 'widget') {
        const id = `${place.schema}|${key}`;
        const values = this.valueMap.get(id) ?? new Map<string, Tally>();
        this.valueMap.set(id, values);
        tally(values, value.text.toLowerCase()).add(value.text, value.quoted);
      }
    }
  }

  /**
   * The keys the game reads at a place, the ones the playset writes most first: the widgets of
   * `guiTypes`; a widget's child widgets and keys (and `if_resolution`); a value block's fields.
   */
  keys(place: GuiPlace): GuiKeyWord[] {
    const seen = this.keyMap.get(placeKey(place));
    return byCount(
      guiPlaceKeys(place).map((key) => {
        const found = seen?.get(key.written.toLowerCase());
        const value = key.value;
        return {
          written: found?.written ?? key.written,
          count: found?.count ?? 0,
          widget: key.widget,
          value: isPlainValue(value) ? value : undefined,
          block:
            key.widget !== undefined ||
            key.written === 'if_resolution' ||
            (value !== undefined && !isPlainValue(value)) ||
            value === 'floats',
        };
      }),
    );
  }

  /**
   * The values of a widget's key (in lower case), the most used first: an enum's words, or `yes`
   * and `no`, where the game reads one; for a key the game reads as text, the playset's values
   * when they are at most 16 and none is a number; none otherwise.
   */
  values(schema: GuiSchemaName, key: string): GuiValueWord[] {
    const map = this.valueMap.get(`${schema}|${key}`);
    const kind = guiValueKind(schema, key);
    const words = kind === undefined ? undefined : guiValueWords(kind);
    if (words !== undefined) {
      return byCount(
        words.map((word) => {
          const seen = map?.get(word.toLowerCase());
          return seen === undefined
            ? {
                written: word,
                count: 0,
                quoted: kind === 'orientation' || kind === 'containerOrientation',
              }
            : { written: seen.written, count: seen.count, quoted: seen.quoted * 2 > seen.count };
        }),
      );
    }
    if (kind !== 'text' || map === undefined || map.size > MAX_VALUES) return [];
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

const PLAIN_VALUES = new Set<string>([
  'text',
  'sprite',
  'bool',
  'int',
  'float',
  'length',
  'orientation',
  'containerOrientation',
  'animation',
  'textFormat',
  'verticalAlignment',
]);

function isPlainValue(value: string | undefined): value is GuiValueKind | 'int' | 'length' {
  return value !== undefined && PLAIN_VALUES.has(value);
}
