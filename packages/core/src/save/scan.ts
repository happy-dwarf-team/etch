/**
 * The index of a save's gamestate (spec section 5, etch#154): one pass over its bytes that
 * records the byte range of every top-level entry and of each child of `countries` and
 * `provinces`, so that a view decodes and parses only the blocks it needs. No tree and no strings
 * are built on the way, except the keys of those entries.
 *
 * The pass yields to the event loop every two megabytes, so that indexing a 110 MB gamestate
 * (0.6 s on the maintainer's machine, etch#154) does not hold the extension host still.
 *
 * `players_countries` and `used_client_names`, which hold the players' profile names, are left out
 * of the index, so nothing Etch reads from a save can carry them (etch#154).
 */
import { setImmediate } from 'node:timers/promises';

/** A half-open range `[start, end)` of bytes of the gamestate. */
export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export interface SaveIndex {
  /** Each top-level entry's range (`key=value`, the key included), by key, in save order. */
  readonly top: ReadonlyMap<string, readonly ByteRange[]>;
  /** Each country's block (`TAG={…}`), by tag, in save order. */
  readonly countries: ReadonlyMap<string, ByteRange>;
  /** Each province's block (`-ID={…}`), by its id, in save order. */
  readonly provinces: ReadonlyMap<number, ByteRange>;
}

export interface IndexOptions {
  /** Ends the pass early with the signal's reason. */
  readonly signal?: AbortSignal;
  /** Bytes between two yields to the event loop; 2 MB when not given. */
  readonly step?: number;
}

/**
 * Top-level entries the index never records: `players_countries` holds the player's profile name,
 * `used_client_names` those of a multiplayer game's players.
 */
const LEFT_OUT = new Set(['players_countries', 'used_client_names']);

const TAB_OR_SPACE_MAX = 32;
const LF = 10;
const CR = 13;
const QUOTE = 34;
const HASH = 35;
const EQ = 61;
const BACKSLASH = 92;
const LBRACE = 123;
const RBRACE = 125;
const LT = 60;
const GT = 62;

/** Indexes a gamestate's bytes, as {@link readSaveTexts} gives them. */
export async function indexSave(bytes: Uint8Array, options: IndexOptions = {}): Promise<SaveIndex> {
  const top = new Map<string, ByteRange[]>();
  const countries = new Map<string, ByteRange>();
  const provinces = new Map<number, ByteRange>();
  const step = options.step ?? 2 << 20;
  const n = bytes.length;

  // Depth 0 is the gamestate's top level; depth 1 the children of `countries` or `provinces`.
  // For each of the two: the pending key, whether `=` followed it, and the block it opened.
  let depth = 0;
  let key0: string | undefined;
  let key0Start = 0;
  let eq0 = false;
  let open0: string | undefined;
  let open0Start = 0;
  let key1: string | undefined;
  let key1Start = 0;
  let eq1 = false;
  let open1: string | undefined;
  let open1Start = 0;
  /** What the children at depth 1 are: 1 countries, 2 provinces, 0 neither. */
  let container = 0;

  const record0 = (key: string, range: ByteRange): void => {
    if (LEFT_OUT.has(key)) return;
    const list = top.get(key);
    if (list === undefined) top.set(key, [range]);
    else list.push(range);
  };
  const record1 = (key: string, range: ByteRange): void => {
    if (container === 1) countries.set(key, range);
    else if (container === 2 && key.charCodeAt(0) === 45 /* - */) {
      const id = Number(key.slice(1));
      if (Number.isInteger(id)) provinces.set(id, range);
    }
  };

  let i = 0;
  let next = step;
  while (i < n) {
    if (i >= next) {
      next = i + step;
      await setImmediate();
      options.signal?.throwIfAborted();
    }
    const c = bytes[i] ?? 0;
    if (c <= TAB_OR_SPACE_MAX) {
      i++;
      continue;
    }
    if (c === HASH) {
      while (i < n && bytes[i] !== LF && bytes[i] !== CR) i++;
      continue;
    }
    if (c === LBRACE) {
      if (depth === 0) {
        open0 = eq0 ? key0 : undefined;
        open0Start = key0Start;
        container = open0 === 'countries' ? 1 : open0 === 'provinces' ? 2 : 0;
        key0 = undefined;
        eq0 = false;
      } else if (depth === 1 && container !== 0) {
        open1 = eq1 ? key1 : undefined;
        open1Start = key1Start;
        key1 = undefined;
        eq1 = false;
      }
      depth++;
      i++;
      continue;
    }
    if (c === RBRACE) {
      if (depth > 0) depth--;
      i++;
      if (depth === 0) {
        if (open0 !== undefined) record0(open0, { start: open0Start, end: i });
        open0 = undefined;
        container = 0;
      } else if (depth === 1 && container !== 0) {
        if (open1 !== undefined) record1(open1, { start: open1Start, end: i });
        open1 = undefined;
      }
      continue;
    }
    if (c === EQ || c === LT || c === GT) {
      i++;
      if (bytes[i] === EQ) i++;
      if (depth === 0) eq0 = key0 !== undefined;
      else if (depth === 1) eq1 = key1 !== undefined;
      continue;
    }
    // A string or a word: a key, or a scalar value of the pending key.
    const start = i;
    if (c === QUOTE) {
      i++;
      while (i < n) {
        const d = bytes[i];
        if (d === QUOTE) break;
        i += d === BACKSLASH ? 2 : 1;
      }
      i = Math.min(n, i + 1);
    } else {
      i++;
      while (i < n) {
        const d = bytes[i] ?? 0;
        if (
          d <= TAB_OR_SPACE_MAX ||
          d === LBRACE ||
          d === RBRACE ||
          d === EQ ||
          d === QUOTE ||
          d === HASH ||
          d === LT ||
          d === GT
        ) {
          break;
        }
        i++;
      }
    }
    if (depth === 0) {
      if (eq0 && key0 !== undefined) {
        record0(key0, { start: key0Start, end: i });
        key0 = undefined;
        eq0 = false;
      } else {
        key0 = keyText(bytes, start, i);
        key0Start = start;
        eq0 = false;
      }
    } else if (depth === 1 && container !== 0) {
      if (eq1 && key1 !== undefined) {
        key1 = undefined;
        eq1 = false;
      } else {
        key1 = keyText(bytes, start, i);
        key1Start = start;
        eq1 = false;
      }
    }
  }
  // A block the save never closes runs to its end.
  if (depth > 1 && container !== 0 && open1 !== undefined)
    record1(open1, { start: open1Start, end: n });
  if (depth > 0 && open0 !== undefined) record0(open0, { start: open0Start, end: n });
  return { top, countries, provinces };
}

/** A key's text, without quotes; keys are ASCII. */
function keyText(bytes: Uint8Array, start: number, end: number): string {
  if (bytes[start] === QUOTE) {
    start++;
    if (end > start && bytes[end - 1] === QUOTE) end--;
  }
  let text = '';
  for (let i = start; i < end; i++) text += String.fromCharCode(bytes[i] ?? 0);
  return text;
}
