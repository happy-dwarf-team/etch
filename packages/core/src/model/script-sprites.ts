/**
 * The sprite names script files write, by the folder that reads them: an event's `picture`, a
 * mission's `icon`, an estate privilege's `icon`, and the keys of eleven `common` folders listed
 * in {@link SCRIPT_SPRITE_KEYS}. Each names a `spriteType` of the playset's `.gfx` files as it is
 * written, without a `GFX_` prefix added. The keys and their depths are the only ones vanilla
 * 1.37.5 uses there: on 18.11.2026, 6,191 event pictures at the event's top level and 382 inside a
 * `picture = { trigger = { … } picture = … }` block, 4,813 mission icons in a mission of a series,
 * 426 privilege icons in a privilege; on 21.11.2026, the `common` keys below, each of whose values
 * in vanilla is a sprite of the game's `.gfx` files (none names anything else). An `icon` elsewhere
 * in `common` is not always a sprite (a government reform's names a texture file), so it is left
 * out, as is `professionalism`'s `unit_sprite_start`, the start of sprite names, not a name.
 */
import type { BlockNode, EntryNode, ParsedScript, PropertyNode } from '../script/tree.ts';
import { keyOf } from './properties.ts';
import type { SpriteReference } from './references.ts';

/** How a folder's files name sprites: the key, and how many blocks deep it is written. */
export interface ScriptSpriteKey {
  /** The game-relative folder, with `/` separators and no trailing `/`. */
  readonly folder: string;
  readonly key: string;
  /** Blocks between the file's top level and the key: 1 for `event = { picture = … }`. */
  readonly depth: number;
}

/** Every key that names a sprite in a script folder, with the count vanilla 1.37.5 writes. */
export const SCRIPT_SPRITE_KEYS: readonly ScriptSpriteKey[] = [
  { folder: 'events', key: 'picture', depth: 1 },
  { folder: 'missions', key: 'icon', depth: 2 },
  { folder: 'common/estate_privileges', key: 'icon', depth: 1 },
  // 10 church aspects.
  { folder: 'common/church_aspects', key: 'sprite', depth: 1 },
  // 8 federation advancements.
  { folder: 'common/federation_advancements', key: 'gfx', depth: 1 },
  // 26 mechanics' alert icons; 63 icons of their interactions, in `interactions = { <name> = { icon … } }`.
  { folder: 'common/government_mechanics', key: 'alert_icon_gfx', depth: 1 },
  { folder: 'common/government_mechanics', key: 'icon', depth: 3 },
  // 28 holy orders.
  { folder: 'common/holy_orders', key: 'icon', depth: 1 },
  // 6 ranks of army professionalism.
  { folder: 'common/professionalism', key: 'marker_sprite', depth: 1 },
  // 7 pictures of the Muslim schools, three blocks deep.
  { folder: 'common/religions', key: 'picture', depth: 3 },
  // 9 religious conversion centres.
  { folder: 'common/religious_conversions', key: 'map_icon', depth: 1 },
  // 23, 25 and 25 of the subject types.
  { folder: 'common/subject_types', key: 'sprite', depth: 1 },
  { folder: 'common/subject_types', key: 'diplomacy_overlord_sprite', depth: 1 },
  { folder: 'common/subject_types', key: 'diplomacy_subject_sprite', depth: 1 },
  // 15 trade company investments.
  { folder: 'common/tradecompany_investments', key: 'sprite', depth: 1 },
  // 9 trading policies.
  { folder: 'common/trading_policies', key: 'button_gfx', depth: 1 },
];

/** The script folders whose files name sprites, each once, in the order of the keys. */
export const SPRITE_SCRIPT_FOLDERS: readonly string[] = [
  ...new Set(SCRIPT_SPRITE_KEYS.map(({ folder }) => folder)),
];

function keysFor(path: string): ScriptSpriteKey[] {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  if (!lower.endsWith('.txt')) return [];
  return SCRIPT_SPRITE_KEYS.filter(({ folder }) => lower.startsWith(`${folder}/`));
}

/** Whether a game-relative path is a script file that names sprites (`scriptSpriteReferences`). */
export function isSpriteScriptPath(path: string): boolean {
  return keysFor(path).length > 0;
}

/**
 * The sprite names of a parsed script file, by its game-relative path (`events/…`, `missions/…`,
 * a folder of {@link SPRITE_SCRIPT_FOLDERS}), in text order; none for any other path.
 */
export function scriptSpriteReferences(path: string, parsed: ParsedScript): SpriteReference[] {
  const specs = keysFor(path);
  if (specs.length === 0) return [];
  const deepest = Math.max(...specs.map(({ depth }) => depth));
  const out: SpriteReference[] = [];
  const visit = (entries: readonly EntryNode[], depth: number): void => {
    for (const entry of entries) {
      if (entry.kind !== 'property') continue;
      const value = entry.value;
      const key = keyOf(entry);
      const spec = specs.find((s) => s.depth === depth && s.key === key);
      if (spec !== undefined) {
        if (value?.kind === 'scalar') push(entry, out);
        // A conditional event picture: `picture = { trigger = { … } picture = NAME }`.
        else if (value?.kind === 'block') pushMembers(value, spec.key, out);
      } else if (depth < deepest && value?.kind === 'block') {
        visit(value.entries, depth + 1);
      }
    }
  };
  visit(parsed.entries, 0);
  return out;
}

function pushMembers(block: BlockNode, key: string, out: SpriteReference[]): void {
  for (const entry of block.entries) {
    if (entry.kind === 'property' && keyOf(entry) === key) push(entry, out);
  }
}

function push(property: PropertyNode, out: SpriteReference[]): void {
  const value = property.value;
  if (value?.kind === 'scalar' && value.text !== '') out.push({ node: value, name: value.text });
}
