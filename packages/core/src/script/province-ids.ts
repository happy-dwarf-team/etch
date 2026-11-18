/**
 * Province ids in script files that the map in use does not have (anvil#426). The game takes the id
 * of `owns = 5075`, of a `5075 = { … }` scope and of the other keys below without a range check and
 * writes nothing to `error.log`; `owns` reads past the province table, which crashed the game when
 * that memory was not committed (checked in the game on 16.11.2026). The map's ids are those below
 * `max_provinces` of `map/default.map`, and, when it is read, those that `map/definition.csv` lists.
 */
import { parseScript } from './parse.ts';
import type { BlockNode, EntryNode, ParsedScript, ScalarNode, SourceRange } from './tree.ts';

/** What a script key's integer value is to the game. */
export type ProvinceIdKeyKind = 'trigger' | 'effect' | 'property';

/**
 * Keys whose integer value is a province id. Each one is used in vanilla 1.37.5's `common`,
 * `events`, `decisions` and `missions` with integer values only of provinces in
 * `map/definition.csv` (checked on 16.11.2026, 1 to 4938 across 4704 uses of `province_id`). A
 * key that also takes a tag, a scope or a name (`add_core = FRA`, `capital = yes`) is only checked
 * when its value is an integer. Keys whose integers vanilla uses for other things (`start`, a year;
 * `random`, a chance) are left out.
 *
 * Vanilla gives no integer to six more keys that mods use with province ids (18.11.2026, the 68
 * Workshop items of the EU4 engine lab): `owns_or_subject_of` (2256 uses), the name that replaced
 * `owns_or_vassal_of` in 1.20, which the game still maps to it, `is_state_core`,
 * `is_territorial_core`, `subject_owns`, `add_territorial_core` and `undiscover_province`. Their
 * classes read the id with `atoi` and index the province table without a range check, as `owns`
 * does (the lab's `docs/script-unchecked-indexes.md`); that these keywords name those classes is
 * read from the class names, the game's keyword strings and the 1.20 patch notes.
 */
export const PROVINCE_ID_KEYS: ReadonlyMap<string, ProvinceIdKeyKind> = new Map<
  string,
  ProvinceIdKeyKind
>([
  // Triggers.
  ['province_id', 'trigger'],
  ['owns', 'trigger'],
  ['owns_core_province', 'trigger'],
  ['owns_or_non_sovereign_subject_of', 'trigger'],
  ['owns_or_vassal_of', 'trigger'],
  ['controls', 'trigger'],
  ['capital', 'trigger'],
  ['is_core', 'trigger'],
  ['is_claim', 'trigger'],
  ['is_permanent_claim', 'trigger'],
  ['has_discovered', 'trigger'],
  ['higher_development_than', 'trigger'],
  ['is_neighbor_of_province', 'trigger'],
  ['same_trade_node_as', 'trigger'],
  ['owns_or_subject_of', 'trigger'],
  ['is_state_core', 'trigger'],
  ['is_territorial_core', 'trigger'],
  ['subject_owns', 'trigger'],
  // Effects.
  ['add_core', 'effect'],
  ['remove_core', 'effect'],
  ['add_claim', 'effect'],
  ['add_permanent_claim', 'effect'],
  ['remove_claim', 'effect'],
  ['set_capital', 'effect'],
  ['discover_province', 'effect'],
  ['war_goal_province', 'effect'],
  ['add_territorial_core', 'effect'],
  ['undiscover_province', 'effect'],
  // Properties of database entries and blocks: an event's `goto`, a decision's `do_not_core`, an
  // advisor's or trade node's `location`, a mercenary company's `home_province`, a bookmark's
  // `center`, an institution's `historical_start_province`, a religion's `center_of_religion` and
  // `seat_of_papacy`.
  ['goto', 'property'],
  ['do_not_core', 'property'],
  ['location', 'property'],
  ['home_province', 'property'],
  ['center', 'property'],
  ['historical_start_province', 'property'],
  ['center_of_religion', 'property'],
  ['seat_of_papacy', 'property'],
]);

/**
 * Members of block triggers whose integer value is a province id, by the block's key. The game
 * reads `province_distance`'s `who` with `sscanf` and logs only ids below 1, and
 * `trading_policy_in_node`'s `node` with `atoi`, taking ids below 2 for the scope's province; a
 * larger id indexes the province table unchecked (the lab's `docs/script-unchecked-indexes.md`,
 * 16.11.2026). A war goal's `province` (`history/wars`, and saves) is read with `atoi` and kept;
 * the war goal's name, description and controller index the province table with it, checking only
 * that it is not negative (the EU4 engine lab, `CWarGoal`, 18.11.2026). Vanilla gives it 233
 * integers, all on its map.
 */
export const PROVINCE_ID_MEMBERS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['province_distance', new Set(['who'])],
  ['trading_policy_in_node', new Set(['node'])],
  ['war_goal', new Set(['province'])],
]);

/**
 * Blocks whose integer keys are not provinces: `random_list`'s weights. A `trigger_switch`'s keys
 * are values of its `on_trigger`, provinces only when that is one of `PROVINCE_ID_KEYS`. Every other
 * `<integer> = { … }` in a trigger or an effect is a province scope.
 */
const NON_PROVINCE_INTEGER_KEYS: ReadonlySet<string> = new Set(['random_list']);

/**
 * `common` folders whose top-level blocks are themselves triggers or effects, so that a province
 * scope can be a top-level block's child. In the other `common` folders a top-level block is a
 * database entry whose children are its properties (an imperial incident's `0 = { factor = 1 }`),
 * and scopes start one level deeper.
 */
const COMMON_SCRIPT_FOLDERS: readonly string[] = [
  'common/scripted_effects/',
  'common/scripted_triggers/',
  'common/on_actions/',
];

/** How deep a block's children must be for an integer key to be a province scope. */
function firstScopeDepth(path: string | undefined): number {
  if (path === undefined) return 1;
  const lower = path.toLowerCase().replace(/\\/g, '/');
  if (!lower.startsWith('common/')) return 1;
  return COMMON_SCRIPT_FOLDERS.some((folder) => lower.startsWith(folder)) ? 1 : 2;
}

/** The province ids of the map in use. */
export interface ProvinceIds {
  /** `max_provinces` of `map/default.map`: ids run from 1 to `maxProvinces - 1`. */
  readonly maxProvinces: number;
  /** Where `max_provinces` came from, for messages, such as `map/default.map of the game`. */
  readonly maxSource: string;
  /** The ids `map/definition.csv` lists, when it was read. */
  readonly defined?: ReadonlySet<number> | undefined;
  /** Where `defined` came from, for messages, such as `map/definition.csv of My Mod`. */
  readonly definedSource?: string | undefined;
  /**
   * The arguments of the playset's scripted effects and triggers that their bodies use as province
   * ids, by the scripted effect's or trigger's name in lower case (`readScriptedProvinceArguments`).
   * A call's integer value of such an argument is checked like `owns = 151`.
   */
  readonly calls?: ProvinceArguments | undefined;
}

/** Argument names in lower case, by the scripted effect's or trigger's name in lower case. */
export type ProvinceArguments = ReadonlyMap<string, ReadonlySet<string>>;

/** A whole scalar that is one `$argument$`, with or without a `|default`; group 1 is the name. */
const ARGUMENT = /^\$([^$|]+)(?:\|[^$]*)?\$$/;

/** What one scripted effect's or trigger's body does with its arguments. */
interface ScriptedBody {
  /** Arguments it uses as province ids itself, in lower case. */
  readonly direct: Set<string>;
  /** Arguments it passes on to a call (`other = { member = $arg$ }`), all in lower case. */
  readonly passed: { readonly callee: string; readonly member: string; readonly arg: string }[];
}

/**
 * The scripted effects and triggers of `common/scripted_effects` and `common/scripted_triggers`
 * files, read for the arguments their bodies use as province ids: an argument that is a province
 * scope's key (`$province$ = { … }`), the value of one of `PROVINCE_ID_KEYS` (`owns = $province$`)
 * or a member of `PROVINCE_ID_MEMBERS`, or that is passed on to another scripted call's argument
 * of that kind (vanilla's `mal_determine_offer_acceptance` passes `$province$` to
 * `mal_will_accept_offer`). The game puts the call's text in place of the argument, so
 * `create_colony_mission_reward = { province = 1104 }` scopes to province 1104 unchecked. When
 * two files define the same name, the arguments of both count: which one the game keeps was not
 * read.
 */
export function readScriptedProvinceArguments(files: readonly ParsedScript[]): ProvinceArguments {
  const bodies = new Map<string, ScriptedBody>();
  for (const parsed of files) {
    for (const entry of parsed.entries) {
      if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
      const name = entry.key.text.toLowerCase();
      const body = bodies.get(name) ?? { direct: new Set<string>(), passed: [] };
      readBody(entry.value.entries, { key: '', scopes: true }, body);
      bodies.set(name, body);
    }
  }
  const found = new Map<string, Set<string>>();
  for (const [name, body] of bodies) found.set(name, new Set(body.direct));
  // Passing an argument on makes it a province argument when the callee's member is one; repeat
  // until nothing changes, for chains of calls.
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, body] of bodies) {
      const own = found.get(name);
      if (own === undefined) continue;
      for (const { callee, member, arg } of body.passed) {
        if (!own.has(arg) && found.get(callee)?.has(member) === true) {
          own.add(arg);
          changed = true;
        }
      }
    }
  }
  return new Map([...found].filter(([, args]) => args.size > 0));
}

function readBody(entries: readonly EntryNode[], parent: Parent, body: ScriptedBody): void {
  for (const entry of entries) {
    if (entry.kind === 'block') {
      readBody(entry.entries, parent, body);
      continue;
    }
    if (entry.kind !== 'property') continue;
    const key = entry.key.text.toLowerCase();
    const value = entry.value;
    if (value?.kind === 'scalar') {
      const arg = ARGUMENT.exec(value.text)?.[1]?.toLowerCase();
      if (arg === undefined) continue;
      if (PROVINCE_ID_KEYS.has(key) || PROVINCE_ID_MEMBERS.get(parent.key)?.has(key) === true) {
        body.direct.add(arg);
      } else if (parent.key !== '') {
        body.passed.push({ callee: parent.key, member: key, arg });
      }
      continue;
    }
    if (value?.kind !== 'block') continue;
    if (parent.scopes && !entry.key.quoted) {
      const arg = ARGUMENT.exec(entry.key.text)?.[1]?.toLowerCase();
      if (arg !== undefined) body.direct.add(arg);
    }
    readBody(value.entries, { key, scopes: scopesIn(key, value) }, body);
  }
}

export type ProvinceIdDiagnosticCode =
  /** A province id of 0 or at least `max_provinces`: no province of the map has it. */
  | 'province-id-out-of-range'
  /** A province id below `max_provinces` that `map/definition.csv` does not list. */
  | 'province-id-not-defined'
  /** A `history/provinces` file whose name gives no province of the map: the game skips it. */
  | 'province-history-not-read';

/** A province id the map does not have; the range is the id's scalar (empty, at the start, for a file name). */
export interface ProvinceIdDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: ProvinceIdDiagnosticCode;
  readonly message: string;
  /** The province id as written. */
  readonly id: number;
  /** The key the id is the value of, or the parent block's key for a `<id> = { … }` scope. */
  readonly key: string;
}

/**
 * Whether a game-relative path is a script file whose triggers and effects this check reads:
 * `.txt` under `common`, `events`, `decisions`, `missions`, `history` or
 * `customizable_localization`, whose `defined_text` entries hold triggers the game evaluates when
 * it shows a text that names them (vanilla's `owns = 310`, `province_id = 400`).
 * `common/province_names` is left out: its keys are province ids, but with names as values, not
 * scopes.
 */
export function isProvinceIdScriptPath(path: string): boolean {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  if (!lower.endsWith('.txt')) return false;
  if (lower.startsWith('common/province_names/')) return false;
  return /^(?:common|events|decisions|missions|history|customizable_localization)\//.test(lower);
}

/**
 * The province ids in a parsed script file that the map does not have, in text order. `path`, the
 * file's game-relative path, tells how deep its province scopes start (`firstScopeDepth`); without
 * it they start in the top-level blocks. `body` reads the text as the body of a trigger or an
 * effect, such as a scripted effect's string argument, whose own top-level integer keys are
 * province scopes.
 */
export function checkProvinceIds(
  parsed: ParsedScript,
  ids: ProvinceIds,
  path?: string,
  body = false,
): ProvinceIdDiagnostic[] {
  const found: ProvinceIdDiagnostic[] = [];
  const root = { key: '', scopes: body };
  walk(parsed.entries, root, 0, body ? 0 : firstScopeDepth(path), ids, found);
  const member = body || path === undefined ? undefined : provinceEntryMember(path);
  if (member !== undefined) {
    for (const entry of parsed.entries) {
      if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
      for (const property of entry.value.entries) {
        if (property.kind !== 'property' || property.key.text.toLowerCase() !== member.key)
          continue;
        const value = property.value;
        if (member.list && value?.kind === 'block') {
          for (const scalar of bareScalars(value)) checkScalar(scalar, member.key, ids, found);
        } else if (!member.list && value?.kind === 'scalar') {
          checkScalar(value, member.key, ids, found, true);
        }
      }
    }
  }
  if (!body && path !== undefined) {
    const skipped = provinceHistoryNotRead(path, ids);
    if (skipped !== undefined) found.push(skipped);
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * A warning for a `history/provinces` file the game never reads, at the start of the file. The game
 * takes a file's province from its name with `atoi` (`123 - Name.txt` is province 123, a name without
 * a leading number province 0) and reads only the files of provinces from 1 to `max_provinces - 1`;
 * the others it skips without a line in `error.log` (`CLoadProvinces`, the EU4 engine lab,
 * 18.11.2026). Files in folders below `history/provinces` are not names it reads.
 */
export function provinceHistoryNotRead(
  path: string,
  ids: ProvinceIds,
): ProvinceIdDiagnostic | undefined {
  const match = /^history\/provinces\/([^/]+)\.txt$/i.exec(path.replace(/\\/g, '/'));
  if (match === null) return undefined;
  const name = match[1] ?? '';
  const id = Number(/^\s*([+-]?\d+)/.exec(name)?.[1] ?? 0);
  const last = ids.maxProvinces - 1;
  if (id >= 1 && id <= last) return undefined;
  const given = id === 0 ? 'does not start with a province id' : `gives province ${String(id)}`;
  return {
    severity: 'warning',
    code: 'province-history-not-read',
    message:
      `The game never reads this province history: its file name ${given}, and the game reads ` +
      `only the files of provinces 1 to ${String(last)} (${ids.maxSource} sets max_provinces = ` +
      `${String(ids.maxProvinces)}). It skips the file without a line in error.log.`,
    id,
    key: 'history/provinces',
    start: 0,
    end: 0,
  };
}

/**
 * Folders whose entries list their provinces in a block of bare ids, with that block's key, or give
 * their province in a property. The game reads each list as integers with no range check (it logs
 * only an id listed twice) and then indexes the province table with every id: a colonial region's
 * center point while the file is read and its name, each trade company region's provinces when the
 * game starts (`InitTradeCompanyRegions`), and a trade node's `members`, whose provinces it writes
 * its node into (`InitializeProvinces`; the EU4 engine lab, 18.11.2026). A trade node's `location` is a `PROVINCE_ID_KEYS` property. Vanilla lists
 * 3290 ids in the regions and 3369 in the trade nodes, all on its map.
 *
 * A great project's (a monument's) `start` is its province, a property of a key that other folders
 * use for years. The game reads it as an integer with no range check, and when a new game starts it
 * looks up every project the start date has built in the province table at that index, unchecked
 * (`CCurrentGameState::InitGreatProjects`), and `CGreatProjectType::OnCreated` writes the project
 * into that province (the EU4 engine lab, 18.11.2026). Vanilla gives 138 ids, all on its map.
 */
const PROVINCE_ENTRY_MEMBERS: readonly (readonly [folder: string, key: string, list: boolean])[] = [
  ['common/colonial_regions/', 'provinces', true],
  ['common/trade_companies/', 'provinces', true],
  ['common/tradenodes/', 'members', true],
  ['common/great_projects/', 'start', false],
];

/** The member of a folder's entries that holds province ids: a list of them, or a single one. */
function provinceEntryMember(path: string): { key: string; list: boolean } | undefined {
  const lower = path.toLowerCase().replace(/\\/g, '/');
  const found = PROVINCE_ENTRY_MEMBERS.find(([folder]) => lower.startsWith(folder));
  return found === undefined ? undefined : { key: found[1], list: found[2] };
}

/**
 * The block a walk is in: its key, whether its integer keys are province scopes, and whether it
 * can be a call to a scripted effect or trigger, whose members are its arguments.
 */
interface Parent {
  readonly key: string;
  readonly scopes: boolean;
  readonly call?: boolean;
}

function walk(
  entries: readonly EntryNode[],
  parent: Parent,
  depth: number,
  scopeDepth: number,
  ids: ProvinceIds,
  found: ProvinceIdDiagnostic[],
): void {
  for (const entry of entries) {
    if (entry.kind === 'block') {
      walk(entry.entries, parent, depth + 1, scopeDepth, ids, found);
      continue;
    }
    if (entry.kind !== 'property') continue;
    const key = entry.key.text.toLowerCase();
    const value = entry.value;
    if (value?.kind === 'scalar') {
      if (
        PROVINCE_ID_KEYS.has(key) ||
        PROVINCE_ID_MEMBERS.get(parent.key)?.has(key) === true ||
        (parent.call && ids.calls?.get(parent.key)?.has(key) === true)
      ) {
        checkScalar(value, key, ids, found, true);
      }
      continue;
    }
    if (value?.kind !== 'block') continue;
    if (parent.scopes && depth >= scopeDepth && !entry.key.quoted) {
      checkScalar(entry.key, parent.key, ids, found);
    }
    // A top-level block of a file is a definition or a database entry, not a call; in a string's
    // script, which is a body, it is one.
    const call = depth >= Math.min(scopeDepth, 1);
    walk(
      value.entries,
      { key, scopes: scopesIn(key, value), call },
      depth + 1,
      scopeDepth,
      ids,
      found,
    );
  }
}

/** Whether a block's integer keys are province scopes. */
function scopesIn(key: string, block: BlockNode): boolean {
  if (NON_PROVINCE_INTEGER_KEYS.has(key)) return false;
  if (key !== 'trigger_switch') return true;
  for (const entry of block.entries) {
    if (
      entry.kind === 'property' &&
      entry.key.text.toLowerCase() === 'on_trigger' &&
      entry.value?.kind === 'scalar'
    ) {
      return PROVINCE_ID_KEYS.has(entry.value.text.toLowerCase());
    }
  }
  return false;
}

/**
 * Checks a scalar that is a province id when it is an integer. `signed` takes a leading `-` too:
 * the game reads a key's value with `atoi`, which keeps the sign, so `owns = -1` indexes before
 * the province table; how it reads a `-1 = { … }` scope's key is not known, so keys stay unsigned.
 */
function checkScalar(
  scalar: ScalarNode,
  key: string,
  ids: ProvinceIds,
  found: ProvinceIdDiagnostic[],
  signed = false,
): void {
  if (!(signed ? /^-?\d+$/ : /^\d+$/).test(scalar.text)) return;
  const id = Number(scalar.text);
  const problem = provinceIdProblem(id, ids);
  if (problem === undefined) return;
  found.push({ ...problem, severity: 'warning', id, key, start: scalar.start, end: scalar.end });
}

/** Why the map does not have a province id, or `undefined` when it has it. */
export function provinceIdProblem(
  id: number,
  ids: ProvinceIds,
): { code: ProvinceIdDiagnosticCode; message: string } | undefined {
  const last = ids.maxProvinces - 1;
  if (id < 1 || id > last) {
    return {
      code: 'province-id-out-of-range',
      message:
        `Province ${String(id)} is not on the map: ${ids.maxSource} sets max_provinces = ` +
        `${String(ids.maxProvinces)}, so province ids run from 1 to ${String(last)}. The game ` +
        'does not check the id or report it in error.log, and reading such a province can ' +
        'crash the game.',
    };
  }
  if (ids.defined !== undefined && !ids.defined.has(id)) {
    return {
      code: 'province-id-not-defined',
      message:
        `Province ${String(id)} is not in ${ids.definedSource ?? 'map/definition.csv'}, so the ` +
        'map has no such province.',
    };
  }
  return undefined;
}

/** The lists of province ids `map/default.map` holds. */
export const DEFAULT_MAP_ID_LISTS: readonly string[] = [
  'sea_starts',
  'only_used_for_random',
  'lakes',
  'force_coastal',
];

/** What Etch reads from `map/default.map`. */
export interface DefaultMap {
  /** `max_provinces`, when the file sets an integer. */
  readonly maxProvinces: number | undefined;
  /** `definitions`: the province definition file's name in `map/`, `definition.csv` by default. */
  readonly definitions: string;
  /** `climate`: the climate file's name in `map/`, `climate.txt` by default. */
  readonly climate: string;
  /** `continent`: the continent file's name in `map/`, `continent.txt` by default. */
  readonly continent: string;
  /** `area`: the area file's name in `map/`, `area.txt` by default. */
  readonly area: string;
  /** `region`: the region file's name in `map/`, `region.txt` by default. */
  readonly region: string;
  /** The lists of province ids (`sea_starts`, `lakes`, …), each id with its range. */
  readonly idLists: readonly { readonly key: string; readonly ids: readonly ScalarNode[] }[];
}

/** Reads `map/default.map`'s text; the last `max_provinces` and `definitions` win. */
export function parseDefaultMap(text: string): DefaultMap {
  return readDefaultMap(parseScript(text, { script: true }));
}

function readDefaultMap(parsed: ParsedScript): DefaultMap {
  let maxProvinces: number | undefined;
  let definitions = 'definition.csv';
  let climate = 'climate.txt';
  let continent = 'continent.txt';
  let area = 'area.txt';
  let region = 'region.txt';
  const idLists: { key: string; ids: ScalarNode[] }[] = [];
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property') continue;
    const key = entry.key.text.toLowerCase();
    const value = entry.value;
    if (key === 'max_provinces' && value?.kind === 'scalar' && /^\d+$/.test(value.text)) {
      maxProvinces = Number(value.text);
    } else if (key === 'definitions' && value?.kind === 'scalar' && value.text !== '') {
      definitions = value.text;
    } else if (key === 'climate' && value?.kind === 'scalar' && value.text !== '') {
      climate = value.text;
    } else if (key === 'continent' && value?.kind === 'scalar' && value.text !== '') {
      continent = value.text;
    } else if (key === 'area' && value?.kind === 'scalar' && value.text !== '') {
      area = value.text;
    } else if (key === 'region' && value?.kind === 'scalar' && value.text !== '') {
      region = value.text;
    } else if (DEFAULT_MAP_ID_LISTS.includes(key) && value?.kind === 'block') {
      idLists.push({ key, ids: bareScalars(value) });
    }
  }
  return { maxProvinces, definitions, climate, continent, area, region, idLists };
}

function bareScalars(block: BlockNode): ScalarNode[] {
  return block.entries.filter((entry): entry is ScalarNode => entry.kind === 'scalar');
}

/**
 * The province ids in `map/default.map`'s own lists (`sea_starts`, `lakes`, `force_coastal`,
 * `only_used_for_random`) that the map does not have, checked against the file's own
 * `max_provinces` and, when given, the ids of its definition file.
 */
export function checkDefaultMap(
  parsed: ParsedScript,
  defined?: { readonly ids: ReadonlySet<number>; readonly source: string },
): ProvinceIdDiagnostic[] {
  const map = readDefaultMap(parsed);
  if (map.maxProvinces === undefined) return [];
  const ids: ProvinceIds = {
    maxProvinces: map.maxProvinces,
    maxSource: 'this file',
    defined: defined?.ids,
    definedSource: defined?.source,
  };
  const found: ProvinceIdDiagnostic[] = [];
  for (const list of map.idLists) {
    for (const scalar of list.ids) checkScalar(scalar, list.key, ids, found);
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * The lists of province ids in the climate file (`map/climate.txt`, as `map/default.map`'s `climate`
 * names it). The game reads each as integers and marks every province's template in it, at
 * `templates + id × 0x230`, with no range check and no `error.log` line (`CMap::ReadClimate`, the
 * EU4 engine lab, 18.11.2026): an id past the map writes past the table while the map loads. It
 * also keeps only the id's low 16 bits. Vanilla 1.37.5 lists 3675 ids, all on its map.
 */
export const CLIMATE_ID_LISTS: readonly string[] = [
  'tropical',
  'arid',
  'arctic',
  'mild_winter',
  'normal_winter',
  'severe_winter',
  'impassable',
  'mild_monsoon',
  'normal_monsoon',
  'severe_monsoon',
];

/** The province ids in a climate file's lists (`CLIMATE_ID_LISTS`) that the map does not have. */
export function checkClimate(parsed: ParsedScript, ids: ProvinceIds): ProvinceIdDiagnostic[] {
  const found: ProvinceIdDiagnostic[] = [];
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    const key = entry.key.text.toLowerCase();
    if (!CLIMATE_ID_LISTS.includes(key)) continue;
    for (const scalar of bareScalars(entry.value)) checkScalar(scalar, key, ids, found, true);
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * The negative province ids in the continent file (`map/continent.txt`, as `map/default.map`'s
 * `continent` names it), whose every top-level block lists a continent's provinces. The game reads
 * each id with `atoi` (`CContinent::Read`), and `CMap::ApplyContinents` skips an id at or past the
 * end of the province table but not a negative one: it reads and writes the continent of the
 * "province" before the table (the EU4 engine lab, 18.11.2026). Ids past the map are left alone,
 * since the game skips them.
 */
export function checkContinents(parsed: ParsedScript, ids: ProvinceIds): ProvinceIdDiagnostic[] {
  const found: ProvinceIdDiagnostic[] = [];
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    const key = entry.key.text.toLowerCase();
    for (const scalar of bareScalars(entry.value)) {
      // `-0` is province 0; a linear pattern, then the sign (CodeQL js/polynomial-redos).
      if (/^-\d+$/.test(scalar.text) && Number(scalar.text) < 0) {
        checkScalar(scalar, key, ids, found, true);
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * The province ids of a `map/definition.csv` text: the leading integer of each line, which is how
 * the game's lines start (`1;128;34;64;Stockholm;x`). The header line and lines without one are
 * skipped.
 */
export function parseProvinceDefinitions(text: string): Set<number> {
  const ids = new Set<number>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s*;/.exec(line);
    if (match?.[1] !== undefined) ids.add(Number(match[1]));
  }
  return ids;
}
