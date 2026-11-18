/**
 * The sprite names script files write, by the folder that reads them: an event's `picture`, a
 * mission's `icon` and an estate privilege's `icon`. Each names a `spriteType` of the playset's
 * `.gfx` files as it is written, without a `GFX_` prefix added. The keys and their depths are the
 * only ones vanilla 1.37.5 uses there (checked on 18.11.2026): 6,191 event pictures at the event's
 * top level and 382 inside a `picture = { trigger = { … } picture = … }` block, 4,813 mission icons
 * in a mission of a series, 426 privilege icons in a privilege. An `icon` elsewhere in `common` is
 * not always a sprite (a government reform's names a texture file), so it is left out.
 */
import type { BlockNode, EntryNode, ParsedScript, PropertyNode } from '../script/tree.ts';
import { keyOf } from './properties.ts';
import type { SpriteReference } from './references.ts';

/** How a folder's files name sprites: the key, and how many blocks deep it is written. */
interface ScriptSpriteKey {
  readonly folder: string;
  readonly key: string;
  /** Blocks between the file's top level and the key: 1 for `event = { picture = … }`. */
  readonly depth: number;
}

const SCRIPT_SPRITE_KEYS: readonly ScriptSpriteKey[] = [
  { folder: 'events/', key: 'picture', depth: 1 },
  { folder: 'missions/', key: 'icon', depth: 2 },
  { folder: 'common/estate_privileges/', key: 'icon', depth: 1 },
];

function keyFor(path: string): ScriptSpriteKey | undefined {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  if (!lower.endsWith('.txt')) return undefined;
  return SCRIPT_SPRITE_KEYS.find(({ folder }) => lower.startsWith(folder));
}

/** Whether a game-relative path is a script file that names sprites (`scriptSpriteReferences`). */
export function isSpriteScriptPath(path: string): boolean {
  return keyFor(path) !== undefined;
}

/**
 * The sprite names of a parsed script file, by its game-relative path (`events/…`, `missions/…`,
 * `common/estate_privileges/…`), in text order; none for any other path.
 */
export function scriptSpriteReferences(path: string, parsed: ParsedScript): SpriteReference[] {
  const spec = keyFor(path);
  if (spec === undefined) return [];
  const out: SpriteReference[] = [];
  const visit = (entries: readonly EntryNode[], depth: number): void => {
    for (const entry of entries) {
      if (entry.kind !== 'property') continue;
      const value = entry.value;
      if (depth === spec.depth && keyOf(entry) === spec.key) {
        if (value?.kind === 'scalar') push(entry, out);
        // A conditional event picture: `picture = { trigger = { … } picture = NAME }`.
        else if (value?.kind === 'block') pushMembers(value, spec.key, out);
      } else if (depth < spec.depth && value?.kind === 'block') {
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
