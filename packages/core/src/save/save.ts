/**
 * A text save, read for sample data (spec section 5, etch#154): its meta, the index of its
 * gamestate, and the blocks a view asks for, decoded (`windows-1252`) and parsed one at a time
 * into Etch's ordinary syntax tree. The whole save is never parsed as a tree (3.3–3.6 s and
 * 2.2 GB for an Anbennar save), and nothing is computed from it the way the engine would.
 *
 * The players' profile names, in the gamestate's `players_countries` and `used_client_names`, are
 * never indexed, decoded or kept (etch#154).
 */
import { parseScript } from '../script/parse.ts';
import type {
  BlockNode,
  EntryNode,
  ParsedScript,
  PropertyNode,
  ValueNode,
} from '../script/tree.ts';
import { decodeWindows1252 } from '../windows-1252.ts';
import { readSaveTexts, type SaveForm } from './container.ts';
import { indexSave, type ByteRange, type IndexOptions, type SaveIndex } from './scan.ts';

/** What a save's meta says, as written. */
export interface SaveMeta {
  /** The game date, `1444.11.11`. */
  readonly date?: string;
  /** The player's country tag. */
  readonly player?: string;
  /** The player's country's name as the game displayed it. */
  readonly displayedCountryName?: string;
  /** The game version that wrote the save, `1.37.5.0`. */
  readonly version?: string;
  readonly multiplayer: boolean;
  /** The display names of the playset's mods, in load order (`mods_enabled_names`). */
  readonly mods: readonly string[];
}

export interface Save {
  readonly form: SaveForm;
  readonly meta: SaveMeta;
  readonly index: SaveIndex;
  /** The size of the gamestate's text, in bytes. */
  readonly size: number;
  /** Every country tag, in save order. */
  readonly countries: readonly string[];
  /** Every province id, in save order. */
  readonly provinces: readonly number[];
  /** A country's block, `undefined` when the save has no such country. */
  country(tag: string): BlockNode | undefined;
  /** A province's block, `undefined` when the save has no such province. */
  province(id: number): BlockNode | undefined;
  /** The value of the first top-level entry of a key; profile names are never there. */
  top(key: string): ValueNode | undefined;
  /** Decodes and parses one range of the gamestate, as the index gives it. */
  parse(range: ByteRange): ParsedScript;
}

/** Reads a save file's bytes; throws a `SaveReadError` for a save Etch cannot read. */
export async function readSave(bytes: Uint8Array, options: IndexOptions = {}): Promise<Save> {
  const texts = await readSaveTexts(bytes);
  options.signal?.throwIfAborted();
  const gamestate = texts.gamestate;
  const index = await indexSave(gamestate, options);
  const decode = decoder();

  const parse = (range: ByteRange): ParsedScript =>
    parseScript(decode(gamestate.subarray(range.start, range.end)), { save: true });
  const entryAt = (range: ByteRange): PropertyNode | undefined => {
    const entry = parse(range).entries[0];
    return entry?.kind === 'property' ? entry : undefined;
  };
  const blockAt = (range: ByteRange | undefined): BlockNode | undefined => {
    if (range === undefined) return undefined;
    const value = entryAt(range)?.value;
    return value?.kind === 'block' ? value : undefined;
  };
  const top = (key: string): ValueNode | undefined => {
    const range = index.top.get(key)?.[0];
    return range === undefined ? undefined : entryAt(range)?.value;
  };

  const meta =
    texts.meta === undefined
      ? metaOf((key) => top(key))
      : metaOfEntries(parseScript(decode(texts.meta), { save: true }).entries);

  return {
    form: texts.form,
    meta,
    index,
    size: gamestate.length,
    countries: [...index.countries.keys()],
    provinces: [...index.provinces.keys()],
    country: (tag) => blockAt(index.countries.get(tag)),
    province: (id) => blockAt(index.provinces.get(id)),
    top,
    parse,
  };
}

function metaOfEntries(entries: readonly EntryNode[]): SaveMeta {
  const first = new Map<string, ValueNode>();
  for (const entry of entries) {
    if (entry.kind !== 'property' || entry.value === undefined) continue;
    if (!first.has(entry.key.text)) first.set(entry.key.text, entry.value);
  }
  return metaOf((key) => first.get(key));
}

function metaOf(value: (key: string) => ValueNode | undefined): SaveMeta {
  const text = (key: string): string | undefined => {
    const node = value(key);
    return node?.kind === 'scalar' ? node.text : undefined;
  };
  const date = text('date');
  const player = text('player');
  const displayedCountryName = text('displayed_country_name');
  const version = versionOf(value('savegame_version'));
  const mods: string[] = [];
  const modsNode = value('mods_enabled_names');
  if (modsNode?.kind === 'block') {
    for (const entry of modsNode.entries) {
      if (entry.kind !== 'block') continue;
      const name = scalarIn(entry, 'name');
      if (name !== undefined) mods.push(name);
    }
  }
  return {
    ...(date === undefined ? {} : { date }),
    ...(player === undefined ? {} : { player }),
    ...(displayedCountryName === undefined ? {} : { displayedCountryName }),
    ...(version === undefined ? {} : { version }),
    multiplayer: text('multi_player') === 'yes',
    mods,
  };
}

function versionOf(node: ValueNode | undefined): string | undefined {
  if (node?.kind !== 'block') return undefined;
  const parts = ['first', 'second', 'third', 'forth'].map((key) => scalarIn(node, key));
  return parts.every((part) => part !== undefined) ? parts.join('.') : undefined;
}

/** The text of a block's first scalar property of a key. */
export function scalarIn(block: BlockNode, key: string): string | undefined {
  for (const entry of block.entries) {
    if (entry.kind === 'property' && entry.key.text === key && entry.value?.kind === 'scalar') {
      return entry.value.text;
    }
  }
  return undefined;
}

/** The value of a block's first property of a key. */
export function valueIn(block: BlockNode, key: string): ValueNode | undefined {
  for (const entry of block.entries) {
    if (entry.kind === 'property' && entry.key.text === key) return entry.value;
  }
  return undefined;
}

/**
 * Node's `TextDecoder` decodes Windows-1252 ten times faster than Etch's own decoder (etch#154);
 * a Node built without full ICU has no such encoding, and the own decoder stands in.
 */
function decoder(): (bytes: Uint8Array) => string {
  try {
    const native = new TextDecoder('windows-1252');
    return (bytes) => native.decode(bytes);
  } catch {
    return decodeWindows1252;
  }
}
