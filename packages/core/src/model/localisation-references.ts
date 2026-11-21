/**
 * The values of interface and script files that the game shows as localisation keys (ADR 0008):
 * in a `.gui` file a widget's `text`, `tooltip`, `tooltipText` and `delayedTooltipText`, in a
 * script file of `events/`, `decisions/`, `missions/` or `common/` a `title`, `desc`, `name`,
 * `tooltip` or `custom_tooltip` at any depth. Vanilla 1.37.5 writes those five script keys
 * on 6,366, 8,212, 21,449, 2,322 and 5,766 lines there (counted on 21.11.2026). Not every such
 * value is a key (a `name` can be a plain word), so a caller keeps only the keys its
 * localisation defines.
 */
import type { EntryNode, ParsedScript, ScalarNode } from '../script/tree.ts';
import { keyOf } from './properties.ts';

/** A value that may name a localisation key, with the node it is written in. */
export interface LocalisationReference {
  readonly node: ScalarNode;
  /** The key as written, without quotes. */
  readonly key: string;
}

const GUI_KEYS: ReadonlySet<string> = new Set([
  'text',
  'tooltip',
  'tooltiptext',
  'delayedtooltiptext',
]);
const SCRIPT_KEYS: ReadonlySet<string> = new Set([
  'title',
  'desc',
  'name',
  'tooltip',
  'custom_tooltip',
]);
const SCRIPT_FOLDERS = ['events/', 'decisions/', 'missions/', 'common/'];

/** The keys whose values may name localisation, by a game-relative path; none for other files. */
function keysFor(path: string): ReadonlySet<string> | undefined {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  if (lower.endsWith('.gui')) return GUI_KEYS;
  if (lower.endsWith('.txt') && SCRIPT_FOLDERS.some((folder) => lower.startsWith(folder))) {
    return SCRIPT_KEYS;
  }
  return undefined;
}

/** Whether a game-relative path is a file whose values may name localisation keys. */
export function isLocalisationReferencePath(path: string): boolean {
  return keysFor(path) !== undefined;
}

/**
 * The values of a parsed file that may name localisation keys, by its game-relative path
 * (`interface/….gui`, `events/….txt`, `common/….txt`), in text order. A value that is not a
 * word or string (a block, `@constant`) or is empty is left out.
 */
export function localisationReferences(
  path: string,
  parsed: ParsedScript,
): LocalisationReference[] {
  const keys = keysFor(path);
  if (keys === undefined) return [];
  const out: LocalisationReference[] = [];
  const visit = (entries: readonly EntryNode[]): void => {
    for (const entry of entries) {
      if (entry.kind === 'block') {
        visit(entry.entries);
        continue;
      }
      if (entry.kind !== 'property') continue;
      const value = entry.value;
      if (value?.kind === 'block') visit(value.entries);
      else if (value?.kind === 'scalar' && keys.has(keyOf(entry))) {
        if (value.text !== '' && !(!value.quoted && value.text.startsWith('@'))) {
          out.push({ node: value, key: value.text });
        }
      }
    }
  };
  visit(parsed.entries);
  return out;
}
