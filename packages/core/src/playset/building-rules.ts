import { decodeGameText } from '../game-text.ts';
import { parseDefaultMap } from '../script/province-ids.ts';
import { parseScript } from '../script/parse.ts';
import type { BlockNode, EntryNode, ParsedScript } from '../script/tree.ts';
import type { GameFile, GameFiles } from './game-files.ts';
import { loadProvinceTerrain, type ProvinceTerrain } from './province-terrain.ts';

/**
 * What the playset's files say of a province's building slots, for the province view's rows
 * (etch#605), as eu4.exe 1.37.5 reads them. Slot values are in thousandths, the game's fixed
 * point: a province's slots are its `allowed_num_of_buildings` modifier, cut to a whole number,
 * plus its owner's `global_allowed_num_of_buildings`, cut apart (`CProvince::GetAllowedNumberOfBuildings`
 * `0xA02D10`).
 */
export interface BuildingRules {
  /** `NDefines.NEconomy.MAX_BUILDING_SLOTS`: the most slots a province can have. */
  readonly maxSlots: number;
  /** `NDefines.NEconomy.COT_BUILDING_SLOTS`: the slots a center of trade takes from that. */
  readonly cotSlots: number;
  /** The buildings in the game's order: `common/buildings`' files by name, each file's in order. */
  readonly buildings: readonly BuildingDefinition[];
  /** The `allowed_num_of_buildings` of the static modifiers the slots use, by name. */
  readonly statics: ReadonlyMap<string, number>;
  /** The slots of a terrain category of `map/terrain.txt`, by its name. */
  readonly terrainSlots: ReadonlyMap<string, number>;
  /** A province's terrain category, from `terrain_override` and the map's bitmaps. */
  readonly terrain: ProvinceTerrain | undefined;
  /** The climates of the climate file that have a static modifier, by province id. */
  readonly climate: ReadonlyMap<number, string>;
  /**
   * The slots of every named modifier a save can give a province or a country:
   * `common/event_modifiers` and `common/province_triggered_modifiers`.
   */
  readonly modifiers: ReadonlyMap<string, Slots>;
  /** The `state_modifiers` slots of a center of trade's level, by level. */
  readonly cotStateSlots: ReadonlyMap<number, number>;
  /** The idea groups' slots: their start, each idea in order and their bonus. */
  readonly ideas: ReadonlyMap<string, IdeaSlots>;
  /** The estate privileges' `global_allowed_num_of_buildings`, by name. */
  readonly privileges: ReadonlyMap<string, number>;
  /** The technology level that unlocks a building, by building name. */
  readonly technology: ReadonlyMap<string, { readonly kind: TechKind; readonly level: number }>;
  /**
   * The levels of `common/professionalism`, in file order, which the unit panel's background is
   * drawn by (eu4.exe `0x1469250`); read with the building rules, as the save's other layouts are.
   */
  readonly professionalism: readonly ProfessionalismLevel[];
}

/** A level of `common/professionalism`. */
export interface ProfessionalismLevel {
  readonly name: string;
  /** `army_professionalism`, in thousandths: the level is reached at it. */
  readonly threshold: number;
  /** `unit_sprite_start`, the start of the unit panel's sprites at this level (`GFX_ap1_`). */
  readonly unitSpriteStart: string | undefined;
}

export type TechKind = 'adm' | 'dip' | 'mil';

/** A modifier's slots, in thousandths: its province's (`local`) and its country's (`global`). */
export interface Slots {
  readonly local: number;
  readonly global: number;
}

export interface IdeaSlots {
  readonly start: number;
  readonly ideas: readonly number[];
  readonly bonus: number;
}

export interface BuildingDefinition {
  readonly name: string;
  /** The game's index: 1 for the first building, as the save's `building_construction` writes it. */
  readonly index: number;
  /** Its `modifier`'s `allowed_num_of_buildings`, in thousandths. */
  readonly slots: number;
  readonly cost: number;
  /** `government_specific = yes`: the natives' buildings, never in the province view's rows. */
  readonly governmentSpecific: boolean;
  /** The trade goods of a manufactory; `undefined` for any other building. */
  readonly manufactory: readonly string[] | undefined;
  /** The building this one replaces (`make_obsolete`). */
  readonly makeObsolete: string | undefined;
}

const SLOTS = 'allowed_num_of_buildings';
const GLOBAL_SLOTS = 'global_allowed_num_of_buildings';
/** The static modifiers the province calculators add slots from (eu4.exe `0x95D4E0` and kin). */
const STATIC_NAMES = [
  'development',
  'city',
  'arctic',
  'tropical',
  'arid',
  'expanded_infrastructure',
];
const IDEA_KEYS = new Set([
  'start',
  'bonus',
  'trigger',
  'free',
  'category',
  'ai_will_do',
  'important',
]);

function decode(bytes: Uint8Array): string {
  return decodeGameText(bytes, 'interface').text;
}

function thousandths(text: string | undefined): number {
  const value = Number(text);
  return text === undefined || !Number.isFinite(value) ? 0 : Math.round(value * 1000);
}

function properties(entries: readonly EntryNode[]) {
  return entries.flatMap((e) => (e.kind === 'property' && e.value !== undefined ? [e] : []));
}

function scalar(block: BlockNode, key: string): string | undefined {
  for (const e of properties(block.entries)) {
    if (e.key.text === key && e.value?.kind === 'scalar') return e.value.text;
  }
  return undefined;
}

function block(parent: BlockNode, key: string): BlockNode | undefined {
  for (const e of properties(parent.entries)) {
    if (e.key.text === key && e.value?.kind === 'block') return e.value;
  }
  return undefined;
}

/** A modifier block's slots; nested blocks (conditions) are not read. */
function slotsOf(modifier: BlockNode | undefined): Slots {
  if (modifier === undefined) return { local: 0, global: 0 };
  return {
    local: thousandths(scalar(modifier, SLOTS)),
    global: thousandths(scalar(modifier, GLOBAL_SLOTS)),
  };
}

async function parseAll(files: GameFiles, list: readonly GameFile[]): Promise<ParsedScript[]> {
  return Promise.all(
    list.map(async (file) => parseScript(decode(await files.readFile(file)), { script: true })),
  );
}

async function parseOne(files: GameFiles, path: string): Promise<ParsedScript | undefined> {
  const file = await files.find(path);
  return file === undefined
    ? undefined
    : parseScript(decode(await files.readFile(file)), { script: true });
}

/** The last value a Lua define gets, in `common/defines.lua` or a mod's `common/defines/*.lua`. */
function defineIn(texts: readonly string[], name: string, fallback: number): number {
  let value = fallback;
  const pattern = new RegExp(`(?:^|[\\s.{,])${name}\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`, 'gm');
  for (const text of texts) {
    const clean = text.replace(/--[^\n]*/g, '');
    for (const match of clean.matchAll(pattern)) value = Number(match[1]);
  }
  return value;
}

/**
 * Reads the playset's building rules. `undefined` when no layer has `common/buildings`, so a
 * playset without the game's files keeps the profile's rows.
 */
export async function loadBuildingRules(files: GameFiles): Promise<BuildingRules | undefined> {
  const buildingFiles = await files.list('common/buildings', '.txt');
  if (buildingFiles.length === 0) return undefined;
  const [
    buildingTrees,
    defineTexts,
    staticTrees,
    eventTrees,
    triggeredTrees,
    cotTrees,
    ideaTrees,
    privilegeTrees,
    techTrees,
    terrainTree,
    mapText,
    professionalismTrees,
  ] = await Promise.all([
    parseAll(files, buildingFiles),
    (async () => {
      const main = await files.find('common/defines.lua');
      const list = [
        ...(main === undefined ? [] : [main]),
        ...(await files.list('common/defines', '.lua')),
      ];
      return Promise.all(list.map(async (f) => decode(await files.readFile(f))));
    })(),
    parseAll(files, await files.list('common/static_modifiers', '.txt')),
    parseAll(files, await files.list('common/event_modifiers', '.txt')),
    parseAll(files, await files.list('common/province_triggered_modifiers', '.txt')),
    parseAll(files, await files.list('common/centers_of_trade', '.txt')),
    parseAll(files, await files.list('common/ideas', '.txt')),
    parseAll(files, await files.list('common/estate_privileges', '.txt')),
    Promise.all(
      (['adm', 'dip', 'mil'] as const).map(async (kind) => ({
        kind,
        tree: await parseOne(files, `common/technologies/${kind}.txt`),
      })),
    ),
    parseOne(files, 'map/terrain.txt'),
    (async () => {
      const file = await files.find('map/default.map');
      return file === undefined ? undefined : decode(await files.readFile(file));
    })(),
    parseAll(files, await files.list('common/professionalism', '.txt')),
  ]);

  const buildings: BuildingDefinition[] = [];
  for (const tree of buildingTrees) {
    for (const e of properties(tree.entries)) {
      if (e.value?.kind !== 'block') continue;
      const body = e.value;
      const manufactory = block(body, 'manufactory');
      buildings.push({
        name: e.key.text,
        index: buildings.length + 1,
        slots: slotsOf(block(body, 'modifier')).local,
        cost: Number(scalar(body, 'cost') ?? 0),
        governmentSpecific: scalar(body, 'government_specific') === 'yes',
        manufactory:
          manufactory === undefined
            ? undefined
            : manufactory.entries.flatMap((g) => (g.kind === 'scalar' ? [g.text] : [])),
        makeObsolete: scalar(body, 'make_obsolete'),
      });
    }
  }

  const statics = new Map<string, number>();
  for (const tree of staticTrees) {
    for (const e of properties(tree.entries)) {
      if (e.value?.kind === 'block' && STATIC_NAMES.includes(e.key.text)) {
        statics.set(e.key.text, slotsOf(e.value).local);
      }
    }
  }

  const modifiers = new Map<string, Slots>();
  for (const tree of [...eventTrees, ...triggeredTrees]) {
    for (const e of properties(tree.entries)) {
      if (e.value?.kind !== 'block') continue;
      const slots = slotsOf(e.value);
      if (slots.local !== 0 || slots.global !== 0) modifiers.set(e.key.text, slots);
    }
  }

  // A level's state modifier; where a level's coastal and inland centres differ, the inland one
  // (the save does not say which a province has).
  const cotStateSlots = new Map<number, number>();
  for (const tree of cotTrees) {
    for (const e of properties(tree.entries)) {
      if (e.value?.kind !== 'block') continue;
      const level = Number(scalar(e.value, 'level'));
      if (!Number.isInteger(level)) continue;
      const slots = slotsOf(block(e.value, 'state_modifiers')).local;
      if (!cotStateSlots.has(level) || scalar(e.value, 'type') === 'inland') {
        cotStateSlots.set(level, slots);
      }
    }
  }

  const ideas = new Map<string, IdeaSlots>();
  for (const tree of ideaTrees) {
    for (const e of properties(tree.entries)) {
      if (e.value?.kind !== 'block') continue;
      const list = properties(e.value.entries)
        .filter((i) => !IDEA_KEYS.has(i.key.text) && i.value?.kind === 'block')
        .map((i) => slotsOf(i.value as BlockNode).global);
      const group = {
        start: slotsOf(block(e.value, 'start')).global,
        ideas: list,
        bonus: slotsOf(block(e.value, 'bonus')).global,
      };
      if (group.start !== 0 || group.bonus !== 0 || list.some((v) => v !== 0)) {
        ideas.set(e.key.text, group);
      }
    }
  }

  const privileges = new Map<string, number>();
  for (const tree of privilegeTrees) {
    for (const e of properties(tree.entries)) {
      if (e.value?.kind !== 'block') continue;
      const slots = slotsOf(block(e.value, 'modifier')).global;
      if (slots !== 0) privileges.set(e.key.text, slots);
    }
  }

  const technology = new Map<string, { kind: TechKind; level: number }>();
  const names = new Set(buildings.map((b) => b.name));
  for (const { kind, tree } of techTrees) {
    if (tree === undefined) continue;
    let level = 0;
    for (const e of properties(tree.entries)) {
      if (e.key.text !== 'technology' || e.value?.kind !== 'block') continue;
      for (const item of properties(e.value.entries)) {
        const name = item.key.text;
        if (names.has(name) && item.value?.kind === 'scalar' && item.value.text === 'yes') {
          if (!technology.has(name)) technology.set(name, { kind, level });
        }
      }
      level++;
    }
  }

  const professionalism: ProfessionalismLevel[] = [];
  for (const tree of professionalismTrees) {
    for (const e of properties(tree.entries)) {
      if (e.value?.kind !== 'block') continue;
      professionalism.push({
        name: e.key.text,
        threshold: thousandths(scalar(e.value, 'army_professionalism')),
        unitSpriteStart: scalar(e.value, 'unit_sprite_start'),
      });
    }
  }

  const terrainSlots = new Map<string, number>();
  const categories = terrainTree === undefined ? undefined : terrainCategories(terrainTree);
  for (const [name, body] of categories ?? []) {
    terrainSlots.set(name, thousandths(scalar(body, SLOTS)));
  }

  const map = mapText === undefined ? undefined : parseDefaultMap(mapText);
  const climateTree = await parseOne(files, `map/${map?.climate ?? 'climate.txt'}`);
  const climate = new Map<number, string>();
  for (const e of properties(climateTree?.entries ?? [])) {
    if (e.value?.kind !== 'block' || !statics.has(e.key.text)) continue;
    for (const id of e.value.entries) {
      if (id.kind === 'scalar' && /^\d+$/.test(id.text)) climate.set(Number(id.text), e.key.text);
    }
  }

  return {
    maxSlots: defineIn(defineTexts, 'MAX_BUILDING_SLOTS', 12),
    cotSlots: defineIn(defineTexts, 'COT_BUILDING_SLOTS', 2),
    buildings,
    statics,
    terrainSlots,
    terrain: await loadProvinceTerrain(files),
    climate,
    modifiers,
    cotStateSlots,
    ideas,
    privileges,
    technology,
    professionalism,
  };
}

/**
 * The level of professionalism a country has reached, as `CProfessionalismDatabase::
 * FindHighestEnabledModifier` picks it for the unit panel (eu4.exe 1.37.5 `0x1469250`): the level
 * with the highest `army_professionalism` at or below the country's, the first in file order on a
 * tie. Its `trigger` is not evaluated (the base game's and Anbennar's are all `always = yes`).
 */
export function professionalismLevel(
  levels: readonly ProfessionalismLevel[],
  professionalism: number,
): ProfessionalismLevel | undefined {
  let best: ProfessionalismLevel | undefined;
  for (const level of levels) {
    if (level.threshold > professionalism) continue;
    if (best === undefined || level.threshold > best.threshold) best = level;
  }
  return best;
}

/** The terrain categories of `map/terrain.txt`, by name, in order. */
export function terrainCategories(tree: ParsedScript): Map<string, BlockNode> {
  const out = new Map<string, BlockNode>();
  for (const e of properties(tree.entries)) {
    if (e.key.text !== 'categories' || e.value?.kind !== 'block') continue;
    for (const c of properties(e.value.entries)) {
      if (c.value?.kind === 'block') out.set(c.key.text, c.value);
    }
  }
  return out;
}
