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
 * and collections a repeater can list. Three country keys are what the game's code makes of the
 * save's values (`DERIVED_COUNTRY_KEYS`): `score`, `army_strength` and `unit_sprite_start`, and
 * one province key is what it makes of the playset's map: `terrain` (`DERIVED_PROVINCE_KEYS`).
 * One province collection is laid out as the game's code lays it out from the save and the
 * playset's files: `building_slots`, the province view's building rows (`BUILDING_SLOT_FIELDS`).
 */
import { professionalismLevel, type BuildingRules } from '../playset/building-rules.ts';
import type { BlockNode, ValueNode } from '../script/tree.ts';
import type { MapAreas } from '../script/map-areas.ts';
import { scalarIn, valueIn, type Save } from '../save/save.ts';
import { buildingSlots, type BuildingSlot } from './building-slots.ts';

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
  'terrain',
];

/**
 * Province keys the game's code works out from the playset's files, with the building rules:
 * `terrain`, the province's terrain category, as the game picks it when it loads the map
 * (`terrain_override`, else the map's bitmaps; `province-terrain.ts`). The province view draws
 * `GFX_combat_terrain_<terrain>` in `province_terrain` (the map's terrain category of a province,
 * eu4.exe 1.37.5 `0x1347A50`).
 */
export const DERIVED_PROVINCE_KEYS = ['terrain'] as const;

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
  'building_slots',
];

/**
 * The fields of a `building_slots` entry, the province view's building rows as eu4.exe 1.37.5
 * lays them out (`building-slots.ts`), seen by the country chosen in `Data ▾`:
 *
 * - `kind`: `construction`, `built`, `empty` or `locked`; `building`, the building's name;
 * - `canbuild`, `destroy`, `progress` (a construction) and `locked`: `yes` or `no`;
 * - `required_development`, the locked row's number;
 * - `sprite`, the building's icon (`GFX_temple`, `GFX_locked_building_slot`), and
 *   `culture_sprite`, its owner's graphical culture's (`GFX_temple_easterngfx`), which the game
 *   draws where the playset defines it.
 */
export const BUILDING_SLOT_FIELDS = [
  'kind',
  'building',
  'canbuild',
  'destroy',
  'progress',
  'locked',
  'required_development',
  'sprite',
  'culture_sprite',
] as const;

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
  'current_power_projection',
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
  'score',
  'army_strength',
  'unit_sprite_start',
];

/**
 * Country keys that are sums of the save's values, added up as eu4.exe 1.37.5 does, in
 * thousandths (the game's fixed point):
 *
 * - `score`, the diplomacy view's score (the country's score, `0x2C6430`): the country's
 *   `age_score` of every age, and its `card_score` when the game's age scoring is off (the 29th
 *   of `gameplaysettings`' `setgameplayoptions` is 0), else its `vc_age_score` of every age.
 * - `army_strength`, the men of the country's armies, in thousands as the save writes manpower:
 *   the `strength` of every `regiment` of every `army` (the diplomacy view's
 *   `land_forcelimit_value`, `0xEFD450`; a regiment at full strength is 1.000, which the save
 *   leaves out).
 * - `unit_sprite_start`, the `unit_sprite_start` of the level of `common/professionalism` the
 *   country's `army_professionalism` has reached (`GFX_ap6_` at 1.0 in the base game), which the
 *   unit panel's sprites start with (`<start>regiment_bg`, eu4.exe `0x1469250`); it needs the
 *   building rules, which read the levels.
 */
export const DERIVED_COUNTRY_KEYS = ['score', 'army_strength', 'unit_sprite_start'] as const;

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

/** The playset's files a save collection is laid out with, when it is not the save's own. */
export interface SaveRules {
  /** The building rules, for `building_slots`; without them the collection is not read. */
  readonly buildings?: BuildingRules | undefined;
  /** The areas, for a state's center of trade. */
  readonly map?: MapAreas | undefined;
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
  readonly rules: SaveRules;
  private readonly blocks = new Map<SaveScope, BlockNode | undefined>();
  private slots: readonly RepeaterEntry[] | undefined;

  constructor(
    save: Save,
    country: string | undefined,
    province: number | undefined,
    rules: SaveRules = {},
  ) {
    this.save = save;
    this.country = country;
    this.province = province;
    this.rules = rules;
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
    if (block === undefined) return undefined;
    if (path.scope === 'country' || path.scope === 'owner') {
      if (path.key === 'score') return thousandths(scoreOf(block, this.save));
      if (path.key === 'army_strength') return thousandths(armyStrengthOf(block));
      if (path.key === 'unit_sprite_start') {
        const levels = this.rules.buildings?.professionalism;
        if (levels === undefined) return undefined;
        const level = professionalismLevel(levels, raw(scalarIn(block, 'army_professionalism')));
        return level?.unitSpriteStart;
      }
    }
    if (path.scope === 'province' && path.key === 'terrain') {
      return this.province === undefined
        ? undefined
        : this.rules.buildings?.terrain?.category.get(this.province);
    }
    return scalarIn(block, path.key);
  }

  /** The entries of a collection, for a repeater. */
  entries(path: SavePath): readonly RepeaterEntry[] | undefined {
    if (path.scope === 'entry' || path.scope === 'meta') return undefined;
    if (path.scope === 'province' && path.key === 'building_slots') return this.buildingSlots();
    const block = this.block(path.scope);
    const value = block === undefined ? undefined : valueIn(block, path.key);
    if (value?.kind !== 'block') return undefined;
    return entriesOf(value);
  }

  private buildingSlots(): readonly RepeaterEntry[] | undefined {
    const rules = this.rules.buildings;
    if (rules === undefined || this.province === undefined) return undefined;
    if (this.slots !== undefined) return this.slots;
    const owner = this.owner;
    const country = owner === undefined ? undefined : this.save.country(owner);
    const culture = country === undefined ? undefined : scalarIn(country, 'graphical_culture');
    const rows = buildingSlots(this.save, this.province, this.country, rules, this.rules.map);
    this.slots = rows.map((row) => slotEntry(row, culture));
    return this.slots;
  }
}

const NO_NODE = { start: 0, end: 0, quoted: false } as const;

function slotEntry(row: BuildingSlot, culture: string | undefined): RepeaterEntry {
  const yes = (b: boolean) => (b ? 'yes' : 'no');
  const sprite =
    row.building !== undefined
      ? `GFX_${row.building}`
      : row.kind === 'locked'
        ? 'GFX_locked_building_slot'
        : 'GFX_building_default';
  const fields = new Map<string, string>([
    ['kind', row.kind],
    ['canbuild', yes(row.canbuild)],
    ['destroy', yes(row.destroy)],
    ['progress', yes(row.kind === 'construction')],
    ['locked', yes(row.kind === 'locked')],
    ['sprite', sprite],
    [
      'culture_sprite',
      row.building !== undefined && culture !== undefined ? `${sprite}_${culture}` : sprite,
    ],
  ]);
  if (row.building !== undefined) fields.set('building', row.building);
  if (row.requiredDevelopment !== undefined) {
    fields.set('required_development', String(row.requiredDevelopment));
  }
  return {
    key: row.kind,
    value: { kind: 'scalar', text: row.building ?? row.kind, ...NO_NODE },
    fields,
  };
}

/** A number of the save in thousandths, as the game holds it; 0 when it is not one. */
function raw(text: string | undefined): number {
  const value = Number(text);
  return text === undefined || !Number.isFinite(value) ? 0 : Math.round(value * 1000);
}

/** The thousandths of every number of a list (`age_score={ 1.5 2.0 }`), added up. */
function listRaw(block: BlockNode, key: string): number {
  const list = valueIn(block, key);
  if (list?.kind !== 'block') return 0;
  return list.entries.reduce((sum, e) => sum + (e.kind === 'scalar' ? raw(e.text) : 0), 0);
}

function thousandths(value: number): string {
  return (value / 1000).toFixed(3);
}

/** The country's score (`0x2C6430`) from the save, in thousandths. */
function scoreOf(country: BlockNode, save: Save): number {
  const settings = save.top('gameplaysettings');
  const options = settings?.kind === 'block' ? valueIn(settings, 'setgameplayoptions') : undefined;
  const option =
    options?.kind === 'block' ? options.entries.filter((e) => e.kind === 'scalar')[28] : undefined;
  const ageScoring = option?.kind === 'scalar' && option.text !== '0';
  return (
    listRaw(country, 'age_score') +
    (ageScoring ? listRaw(country, 'vc_age_score') : raw(scalarIn(country, 'card_score')))
  );
}

/** The men of a country's armies in thousandths of thousands: every regiment's strength. */
function armyStrengthOf(country: BlockNode): number {
  let sum = 0;
  for (const army of country.entries) {
    if (army.kind !== 'property' || army.key.text !== 'army' || army.value?.kind !== 'block')
      continue;
    for (const regiment of army.value.entries) {
      if (
        regiment.kind !== 'property' ||
        regiment.key.text !== 'regiment' ||
        regiment.value?.kind !== 'block'
      )
        continue;
      // A regiment at full strength has none: the save leaves out the default 1.000.
      sum += raw(scalarIn(regiment.value, 'strength') ?? '1');
    }
  }
  return sum;
}

/** One child of a save collection: `key=value`, a bare value, or a block. */
export interface RepeaterEntry {
  readonly key?: string;
  readonly value: ValueNode;
  /** Values Etch lays out itself (`building_slots`), read before the block's keys. */
  readonly fields?: ReadonlyMap<string, string>;
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
  const field = entry.fields?.get(key);
  if (field !== undefined) return field;
  const scalar = entry.value.kind === 'scalar' ? entry.value.text : undefined;
  if (key === 'key') return entry.key;
  if (key === 'value') return scalar;
  if (key === 'self')
    return scalar === 'yes' && entry.key !== undefined ? entry.key : (scalar ?? entry.key);
  return entry.value.kind === 'block' ? scalarIn(entry.value, key) : undefined;
}
