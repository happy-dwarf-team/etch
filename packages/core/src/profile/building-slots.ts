/**
 * The province view's building slots as eu4.exe 1.37.5 lays them out (etch#605), from the save
 * and the playset's building rules: the province view's rebuild of its building
 * rows (`0x138EF20`) and the refresh of one row (`0x138A100`).
 *
 * The rows, in order: the building under construction; the built buildings in the game's order,
 * up to the province's cap (`MAX_BUILDING_SLOTS`, less `COT_BUILDING_SLOTS` with a center of
 * trade); empty rows up to the slots the province has; and one locked row while it has fewer
 * slots than its cap. The slots are the province's `allowed_num_of_buildings`, cut to a whole
 * number, plus the owner's `global_allowed_num_of_buildings`, cut apart (`0xA02D10`).
 *
 * What the save cannot give is left out of the sum: a monument's tier, and the conditions of a
 * province's or country's modifiers (only their plain values count). Building costs are the
 * files' `cost`, without the country's modifiers.
 */
import type { BuildingDefinition, BuildingRules } from '../playset/building-rules.ts';
import type { MapAreas } from '../script/map-areas.ts';
import { scalarIn, valueIn, type Save } from '../save/save.ts';
import type { BlockNode } from '../script/tree.ts';

export type BuildingSlotKind = 'construction' | 'built' | 'empty' | 'locked';

export interface BuildingSlot {
  readonly kind: BuildingSlotKind;
  /** The building of a construction or built row. */
  readonly building?: string;
  /** Whether the green frame (`building_canbuild`) shows: something can be built there now. */
  readonly canbuild: boolean;
  /** Whether `building_destroy` shows. */
  readonly destroy: boolean;
  /** The locked row's number: the development the next slot needs. */
  readonly requiredDevelopment?: number;
}

/** What the slot sum of a province is made of, in thousandths. */
export interface ProvinceSlots {
  readonly province: number;
  readonly country: number;
  /** The slots the province has, its cap and the locked row's development. */
  readonly allowed: number;
  readonly cap: number;
  readonly requiredDevelopment: number | undefined;
}

function raw(text: string | undefined): number {
  const value = Number(text);
  return text === undefined || !Number.isFinite(value) ? 0 : Math.round(value * 1000);
}

function each(block: BlockNode, key: string): BlockNode[] {
  return block.entries.flatMap((e) =>
    e.kind === 'property' && e.key.text === key && e.value?.kind === 'block' ? [e.value] : [],
  );
}

function scalars(block: BlockNode, key: string): string[] {
  return block.entries.flatMap((e) =>
    e.kind === 'property' && e.key.text === key && e.value?.kind === 'scalar' ? [e.value.text] : [],
  );
}

/** The names of a `buildings={ temple=yes }` block's buildings. */
function builtIn(province: BlockNode): Set<string> {
  const block = valueIn(province, 'buildings');
  const out = new Set<string>();
  if (block?.kind !== 'block') return out;
  for (const e of block.entries) {
    if (e.kind === 'property' && e.value?.kind === 'scalar' && e.value.text === 'yes') {
      out.add(e.key.text);
    }
  }
  return out;
}

function development(province: BlockNode): number {
  return (
    raw(scalarIn(province, 'base_tax')) +
    raw(scalarIn(province, 'base_production')) +
    raw(scalarIn(province, 'base_manpower'))
  );
}

/** The countries whose state an area is, from the save's `map_area_data`. */
function statesOf(save: Save): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const data = save.top('map_area_data');
  if (data?.kind !== 'block') return out;
  for (const area of data.entries) {
    if (area.kind !== 'property' || area.value?.kind !== 'block') continue;
    const countries = new Set<string>();
    for (const state of each(area.value, 'state')) {
      for (const cs of each(state, 'country_state')) {
        const tag = scalarIn(cs, 'country');
        if (tag !== undefined) countries.add(tag);
      }
    }
    out.set(area.key.text.toLowerCase(), countries);
  }
  return out;
}

const stateCache = new WeakMap<Save, Map<string, Set<string>>>();
const areaProvinces = new WeakMap<MapAreas, Map<string, number[]>>();

function provincesOfArea(map: MapAreas, area: string): readonly number[] {
  let byArea = areaProvinces.get(map);
  if (byArea === undefined) {
    byArea = new Map();
    for (const [id, a] of map.area) {
      const key = a.toLowerCase();
      byArea.set(key, [...(byArea.get(key) ?? []), id]);
    }
    areaProvinces.set(map, byArea);
  }
  return byArea.get(area.toLowerCase()) ?? [];
}

/** The province part of the slot sum (`_MODIFIER_ALLOWED_NUM_OF_BUILDINGS_`), in thousandths. */
export function provinceSlotSum(
  save: Save,
  id: number,
  province: BlockNode,
  rules: BuildingRules,
  map: MapAreas | undefined,
): number {
  const statics = rules.statics;
  const owner = scalarIn(province, 'owner');
  let sum = Math.trunc((development(province) * (statics.get('development') ?? 0)) / 1000);
  if (scalarIn(province, 'is_city') === 'yes') sum += statics.get('city') ?? 0;
  const terrain = rules.terrain?.category.get(id);
  if (terrain !== undefined) sum += rules.terrainSlots.get(terrain) ?? 0;
  const climate = rules.climate.get(id);
  if (climate !== undefined) sum += statics.get(climate) ?? 0;
  const built = builtIn(province);
  for (const b of rules.buildings) if (built.has(b.name)) sum += b.slots;
  sum +=
    Number(scalarIn(province, 'expand_infrastructure') ?? 0) *
    (statics.get('expanded_infrastructure') ?? 0);
  for (const m of each(province, 'modifier')) {
    const name = scalarIn(m, 'modifier');
    if (name !== undefined) sum += rules.modifiers.get(name)?.local ?? 0;
  }
  for (const name of scalars(province, 'triggered_modifier')) {
    sum += rules.modifiers.get(name)?.local ?? 0;
  }
  // The state's center of trade modifier, for a province in its owner's state that the owner
  // controls (`CalcStateModifiers` `0x95DB70`): the highest center of the area's provinces the
  // owner has.
  const area = map?.area.get(id);
  if (owner !== undefined && area !== undefined && map !== undefined) {
    let states = stateCache.get(save);
    if (states === undefined) stateCache.set(save, (states = statesOf(save)));
    if (
      states.get(area.toLowerCase())?.has(owner) === true &&
      scalarIn(province, 'controller') === owner
    ) {
      let level = 0;
      for (const other of provincesOfArea(map, area)) {
        const block = other === id ? province : save.province(other);
        if (block === undefined || scalarIn(block, 'owner') !== owner) continue;
        level = Math.max(level, Number(scalarIn(block, 'center_of_trade') ?? 0));
      }
      sum += rules.cotStateSlots.get(level) ?? 0;
    }
  }
  return sum;
}

/** The country part (`_MODIFIER_GLOBAL_ALLOWED_NUM_OF_BUILDINGS_`), in thousandths. */
export function countrySlotSum(country: BlockNode, rules: BuildingRules): number {
  let sum = 0;
  for (const m of each(country, 'modifier')) {
    const name = scalarIn(m, 'modifier');
    if (name !== undefined) sum += rules.modifiers.get(name)?.global ?? 0;
  }
  const groups = valueIn(country, 'active_idea_groups');
  if (groups?.kind === 'block') {
    for (const e of groups.entries) {
      if (e.kind !== 'property' || e.value?.kind !== 'scalar') continue;
      const group = rules.ideas.get(e.key.text);
      if (group === undefined) continue;
      const taken = Number(e.value.text);
      sum += group.start;
      group.ideas.slice(0, taken).forEach((v) => (sum += v));
      if (taken >= group.ideas.length) sum += group.bonus;
    }
  }
  for (const estate of each(country, 'estate')) {
    const granted = valueIn(estate, 'granted_privileges');
    if (granted?.kind !== 'block') continue;
    for (const p of granted.entries) {
      const name = p.kind === 'block' ? p.entries.find((x) => x.kind === 'scalar') : undefined;
      if (name?.kind === 'scalar') sum += rules.privileges.get(name.text) ?? 0;
    }
  }
  return sum;
}

/** The slots of a province: `0xA02D10`, `0xA03020` and `0xA03250`. */
export function provinceSlots(
  save: Save,
  id: number,
  rules: BuildingRules,
  map: MapAreas | undefined,
): ProvinceSlots | undefined {
  const province = save.province(id);
  const owner = province === undefined ? undefined : scalarIn(province, 'owner');
  if (province === undefined || owner === undefined) return undefined;
  const country = save.country(owner);
  const p = provinceSlotSum(save, id, province, rules, map);
  const g = country === undefined ? 0 : countrySlotSum(country, rules);
  const cot = Number(scalarIn(province, 'center_of_trade') ?? 0) > 0;
  const cap = rules.maxSlots - (cot ? rules.cotSlots : 0);
  const allowed = Math.min(Math.trunc(p / 1000) + Math.trunc(g / 1000), cap);
  const perDevelopment = rules.statics.get('development') ?? 0;
  const need = (Math.trunc(p / 1000) + 1) * 1000 - p;
  const requiredDevelopment =
    perDevelopment > 0
      ? Math.ceil((development(province) + Math.trunc((need * 1000) / perDevelopment)) / 1000)
      : undefined;
  return { province: p, country: g, allowed, cap, requiredDevelopment };
}

/** The buildings up a building's `make_obsolete` chain: those that replace it, nearest first. */
function replacements(rules: BuildingRules, name: string): BuildingDefinition[] {
  const out: BuildingDefinition[] = [];
  let current = name;
  for (let guard = 0; guard < rules.buildings.length; guard++) {
    const next = rules.buildings.find((b) => b.makeObsolete === current);
    if (next === undefined || out.includes(next)) break;
    out.push(next);
    current = next.name;
  }
  return out;
}

/** The province's list of possible buildings (`0xA035A0`): no trigger is evaluated. */
function possibleBuildings(
  province: BlockNode,
  viewer: BlockNode | undefined,
  viewerTag: string | undefined,
  rules: BuildingRules,
): BuildingDefinition[] {
  const owner = scalarIn(province, 'owner');
  if (viewer === undefined || owner === undefined || owner !== viewerTag) return [];
  if (valueIn(province, 'building_construction') !== undefined) return [];
  const built = builtIn(province);
  const tech = valueIn(viewer, 'technology');
  const level = (kind: string) =>
    tech?.kind === 'block' ? Number(scalarIn(tech, `${kind}_tech`) ?? 0) : 0;
  const goods = scalarIn(province, 'trade_goods');
  return rules.buildings.filter((b) => {
    if (b.governmentSpecific || built.has(b.name)) return false;
    if (replacements(rules, b.name).some((r) => built.has(r.name))) return false;
    const unlock = rules.technology.get(b.name);
    if (unlock === undefined || level(unlock.kind) < unlock.level) return false;
    // `manufactory = { all }` (Anbennar's mage tower) takes every trade good: the game lists one
    // where the save's captures show it can be built.
    return (
      b.manufactory === undefined ||
      (goods !== undefined && (b.manufactory.includes(goods) || b.manufactory.includes('all')))
    );
  });
}

/** The province view's building rows of a province, seen by the country `viewer`. */
export function buildingSlots(
  save: Save,
  id: number,
  viewerTag: string | undefined,
  rules: BuildingRules,
  map: MapAreas | undefined,
): BuildingSlot[] {
  const province = save.province(id);
  const slots = provinceSlots(save, id, rules, map);
  if (province === undefined || slots === undefined) return [];
  const owner = scalarIn(province, 'owner');
  const controlled = scalarIn(province, 'controller') === owner;
  const viewer = viewerTag === undefined ? undefined : save.country(viewerTag);
  const owns = viewerTag !== undefined && viewerTag === owner;
  const treasury = viewer === undefined ? 0 : Number(scalarIn(viewer, 'treasury') ?? 0);
  const possible = possibleBuildings(province, viewer, viewerTag, rules);
  const built = builtIn(province);
  const construction = valueIn(province, 'building_construction');
  const constructing =
    construction?.kind === 'block'
      ? rules.buildings.find((b) => b.index === Number(scalarIn(construction, 'building')))
      : undefined;

  const rows: BuildingSlot[] = [];
  if (constructing !== undefined) {
    rows.push({
      kind: 'construction',
      building: constructing.name,
      canbuild: false,
      destroy: false,
    });
  }
  for (const b of rules.buildings) {
    if (rows.length >= slots.cap) break;
    if (!built.has(b.name)) continue;
    const upgrade = replacements(rules, b.name)
      .filter((r) => possible.includes(r))
      .at(-1);
    rows.push({
      kind: 'built',
      building: b.name,
      canbuild:
        upgrade !== undefined &&
        owns &&
        controlled &&
        treasury >= upgrade.cost &&
        constructing === undefined,
      destroy: owns,
    });
  }
  const filled = rows.length;
  while (rows.length < slots.allowed && rows.length < slots.cap) {
    rows.push({ kind: 'empty', canbuild: possible.length > 0 && controlled, destroy: false });
  }
  if (slots.allowed < slots.cap && rows.length < slots.cap) {
    const free = slots.allowed - filled;
    rows.push({
      kind: 'locked',
      canbuild: possible.length > 0 && free <= 0 && possible.some((b) => b.slots >= 1000),
      destroy: false,
      ...(slots.requiredDevelopment === undefined
        ? {}
        : { requiredDevelopment: slots.requiredDevelopment }),
    });
  }
  return rows;
}
