/**
 * The save paths a window profile can name (spec section 5, ADR 0006): a key of the chosen
 * province, of the chosen country, of the province's owner, or of the save's meta. A profile can
 * use only these, so a mod's profile cannot ask for what Etch does not read; a new key needs an
 * Etch release, as a new fact does. Values are taken as the save writes them: whatever the engine
 * works out (income, unrest, supply) is not in a save and comes from the other layers.
 *
 * ```
 * provinces.{province}.<key>   the province chosen in Data ▾
 * countries.{country}.<key>    the country chosen in Data ▾ (the save's player by default)
 * countries.{owner}.<key>      the chosen province's owner
 * meta.<key>                   date, player, displayed_country_name
 * ```
 *
 * Inside a repeater's field, `entry` is one child of the collection the repeater names in
 * `from`: `entry.key` its key (`temple` of `buildings={ temple=yes }`), `entry.value` its value,
 * `entry.<key>` a key of its block, and `entry` alone its value, or its key when the value is
 * `yes`.
 *
 * The keys were read from the province and country blocks of the vanilla corpus save and the
 * Anbennar saves of etch#154: scalar keys the province view and the corpus windows can show,
 * and collections a repeater can list.
 */
import type { BlockNode, ValueNode } from '../script/tree.ts';
import { scalarIn, valueIn, type Save } from '../save/save.ts';

export type SaveScope = 'province' | 'country' | 'owner' | 'meta';

/** Scalar keys of a province block. */
const PROVINCE_KEYS = [
  'name',
  'owner',
  'controller',
  'previous_controller',
  'trade',
  'original_culture',
  'native_culture',
  'culture',
  'religion',
  'original_religion',
  'capital',
  'is_city',
  'garrison',
  'base_tax',
  'original_tax',
  'base_production',
  'base_manpower',
  'likely_rebels',
  'trade_goods',
  'local_autonomy',
  'devastation',
  'center_of_trade',
  'trade_power',
  'hre',
  'unrest',
  'nationalism',
  'colonysize',
  'native_size',
  'native_ferocity',
  'native_hostileness',
  'original_coloniser',
  'missionary_progress',
  'active_trade_company',
  'winter',
];

/** Collections of a province block. */
const PROVINCE_COLLECTIONS = [
  'buildings',
  'building_builders',
  'cores',
  'claims',
  'great_projects',
  'institutions',
  'discovered_by',
  'modifier',
];

/** Scalar keys of a country block. */
const COUNTRY_KEYS = [
  'government_rank',
  'government_name',
  'capital',
  'original_capital',
  'trade_port',
  'treasury',
  'estimated_monthly_income',
  'inflation',
  'corruption',
  'prestige',
  'stability',
  'legitimacy',
  'devotion',
  'republican_tradition',
  'meritocracy',
  'horde_unity',
  'army_tradition',
  'navy_tradition',
  'army_professionalism',
  'mercantilism',
  'splendor',
  'absolutism',
  'war_exhaustion',
  'papal_influence',
  'piety',
  'innovativeness',
  'great_power_score',
  'manpower',
  'max_manpower',
  'sailors',
  'max_sailors',
  'religion',
  'dominant_religion',
  'religious_unity',
  'primary_culture',
  'dominant_culture',
  'technology_group',
  'unit_type',
  'national_focus',
  'base_tax',
  'development',
  'raw_development',
  'realm_development',
  'num_of_cities',
  'average_unrest',
  'average_autonomy',
];

/** Collections of a country block. */
const COUNTRY_COLLECTIONS = [
  'active_idea_groups',
  'owned_provinces',
  'core_provinces',
  'allies',
  'subjects',
  'active_policy',
];

const META_KEYS = ['date', 'player', 'displayed_country_name'];

const SCOPES: ReadonlyMap<string, SaveScope> = new Map([
  ['provinces.{province}', 'province'],
  ['countries.{country}', 'country'],
  ['countries.{owner}', 'owner'],
  ['meta', 'meta'],
]);

const KEYS: Readonly<
  Record<SaveScope, { scalars: readonly string[]; collections: readonly string[] }>
> = {
  province: { scalars: PROVINCE_KEYS, collections: PROVINCE_COLLECTIONS },
  country: { scalars: COUNTRY_KEYS, collections: COUNTRY_COLLECTIONS },
  owner: { scalars: COUNTRY_KEYS, collections: COUNTRY_COLLECTIONS },
  meta: { scalars: META_KEYS, collections: [] },
};

/** A save path read: its scope and key, or an entry field of a repeater. */
export type SavePath =
  | { readonly scope: SaveScope; readonly key: string; readonly collection: boolean }
  /** `key`, `value`, `self` (`entry` alone) or a key of the entry's block. */
  | { readonly scope: 'entry'; readonly key: string };

/**
 * A save path of a profile, or why Etch does not know it. `collection` asks for a repeater's
 * `from`; `entry` allows a repeater field's `entry` paths.
 */
export function readSavePath(
  path: string,
  options: { readonly collection?: boolean; readonly entry?: boolean } = {},
): SavePath | { readonly problem: string } {
  const trimmed = path.trim();
  if (options.entry === true && (trimmed === 'entry' || trimmed.startsWith('entry.'))) {
    const rest = trimmed.slice('entry.'.length);
    if (trimmed === 'entry') return { scope: 'entry', key: 'self' };
    if (rest === '' || rest.includes('.')) {
      return { problem: `"${path}" is entry, entry.key, entry.value or entry.<key>.` };
    }
    return { scope: 'entry', key: rest };
  }
  const dot = trimmed.lastIndexOf('.');
  const scope = SCOPES.get(trimmed.slice(0, dot));
  const key = trimmed.slice(dot + 1);
  if (dot < 0 || scope === undefined) {
    return {
      problem:
        `"${path}" is not a save path Etch reads: it starts with ${[...SCOPES.keys()].join(', ')}` +
        (options.entry === true ? ', or entry' : '') +
        '.',
    };
  }
  const known = KEYS[scope];
  const collection = options.collection === true;
  const keys = collection ? known.collections : known.scalars;
  if (!keys.includes(key)) {
    const what = collection ? 'collection' : 'value';
    return {
      problem:
        `Etch reads no ${what} "${key}" of ${trimmed.slice(0, dot)}; a new save path needs an Etch ` +
        `release. Known: ${keys.join(', ') || 'none'}.`,
    };
  }
  return { scope, key, collection };
}

/** The save paths Etch knows, for the documentation. */
export function knownSavePaths(): {
  readonly scope: string;
  readonly scalars: readonly string[];
  readonly collections: readonly string[];
}[] {
  return [...SCOPES].map(([prefix, scope]) => ({ scope: prefix, ...KEYS[scope] }));
}

/**
 * The chosen save, country and province, with their blocks parsed once and kept while the choice
 * holds, so that a warm reload does not parse them again.
 */
export class SaveChoice {
  readonly save: Save;
  /** The country tag, as chosen; `undefined` when the save has none. */
  readonly country: string | undefined;
  readonly province: number | undefined;
  private readonly blocks = new Map<SaveScope, BlockNode | undefined>();

  constructor(save: Save, country: string | undefined, province: number | undefined) {
    this.save = save;
    this.country = country;
    this.province = province;
  }

  /** The province's owner tag, `undefined` for an uncolonised one. */
  get owner(): string | undefined {
    const block = this.block('province');
    return block === undefined ? undefined : scalarIn(block, 'owner');
  }

  block(scope: SaveScope): BlockNode | undefined {
    if (this.blocks.has(scope)) return this.blocks.get(scope);
    let block: BlockNode | undefined;
    if (scope === 'province' && this.province !== undefined)
      block = this.save.province(this.province);
    else if (scope === 'country' && this.country !== undefined)
      block = this.save.country(this.country);
    else if (scope === 'owner') {
      const owner = this.owner;
      block = owner === undefined ? undefined : this.save.country(owner);
    }
    this.blocks.set(scope, block);
    return block;
  }

  /** A scalar value at a path, as the save writes it; `undefined` when the save lacks it. */
  value(path: SavePath, entry?: RepeaterEntry): string | undefined {
    if (path.scope === 'entry')
      return entry === undefined ? undefined : entryValue(entry, path.key);
    if (path.scope === 'meta') {
      const meta = this.save.meta;
      if (path.key === 'date') return meta.date;
      if (path.key === 'player') return meta.player;
      if (path.key === 'displayed_country_name') return meta.displayedCountryName;
      return undefined;
    }
    const block = this.block(path.scope);
    return block === undefined ? undefined : scalarIn(block, path.key);
  }

  /** The entries of a collection, for a repeater. */
  entries(path: SavePath): readonly RepeaterEntry[] | undefined {
    if (path.scope === 'entry' || path.scope === 'meta') return undefined;
    const block = this.block(path.scope);
    const value = block === undefined ? undefined : valueIn(block, path.key);
    if (value?.kind !== 'block') return undefined;
    return entriesOf(value);
  }
}

/** One child of a save collection: `key=value`, a bare value, or a block. */
export interface RepeaterEntry {
  readonly key?: string;
  readonly value: ValueNode;
}

function entriesOf(block: BlockNode): RepeaterEntry[] {
  const out: RepeaterEntry[] = [];
  for (const entry of block.entries) {
    if (entry.kind === 'property') {
      if (entry.value !== undefined) out.push({ key: entry.key.text, value: entry.value });
    } else {
      out.push({ value: entry });
    }
  }
  return out;
}

function entryValue(entry: RepeaterEntry, key: string): string | undefined {
  const scalar = entry.value.kind === 'scalar' ? entry.value.text : undefined;
  if (key === 'key') return entry.key;
  if (key === 'value') return scalar;
  if (key === 'self')
    return scalar === 'yes' && entry.key !== undefined ? entry.key : (scalar ?? entry.key);
  return entry.value.kind === 'block' ? scalarIn(entry.value, key) : undefined;
}
