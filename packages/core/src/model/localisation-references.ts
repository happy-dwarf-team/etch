/**
 * The values of interface and script files that the game shows as localisation keys (ADR 0008):
 * in a `.gui` file a widget's `text`, `tooltip`, `tooltipText` and `delayedTooltipText`, in a
 * script file of `events/`, `decisions/`, `missions/` or `common/` a `title`, `desc`, `name`,
 * `tooltip` or `custom_tooltip` at any depth. Vanilla 1.37.5 writes those five script keys
 * on 6,366, 8,212, 21,449, 2,322 and 5,766 lines there (counted on 21.11.2026). Not every such
 * value is a key (a `name` can be a plain word), so a caller keeps only the keys its
 * localisation defines.
 *
 * Eight more keys of `common/` come from the fields CWTools' EU4 rules type as `localisation`,
 * each kept because vanilla 1.37.5's values of it are defined English keys (counted on
 * 25.11.2026, values defined of values written): `war_name` 87 of 87, `prov_desc` 61 of 62 and
 * `country_desc` 32 of 32 and `elector_relation` 1 of 1 in `wargoal_types`, `demands_description`
 * 50 of 50 in `rebel_types`, `mercenary_desc_key` 29 of 29 in `mercenary_companies`,
 * `custom_ai_explanation` 16 of 16 in `ruler_personalities` and `ancestor_personalities`,
 * `reform_tooltip` 3 of 3 in `religions`. Three more on 26.11.2026 (etch#756): `alert_tooltip` 65 of 65
 * in `new_diplomatic_actions`, `crusade_name` 7 of 7 in `religions`, `cooldown_desc` 6 of 6 in
 * `government_mechanics`. Rule fields whose vanilla values are not keys are left
 * out: `dynasty` (8 of 648), `leader` (0 of 145), `leader_dynasty` (0 of 87), achievements'
 * `localization` (24 of 401), `expire_message_type` and the `expiration_message_*` pair, and `key`
 * (1,254 of 1,945, most of them in missions and events, where it names no text). The
 * `localisation_synced` fields (`monarch_name`, `attach_leader`, a leader's `type`) are names,
 * and `dlc_metadata`'s `tooltip_desc` and `tooltip_reason` are not in a script folder.
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
  'war_name',
  'prov_desc',
  'country_desc',
  'elector_relation',
  'demands_description',
  'mercenary_desc_key',
  'custom_ai_explanation',
  'reform_tooltip',
  'alert_tooltip',
  'crusade_name',
  'cooldown_desc',
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
