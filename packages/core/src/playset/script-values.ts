import { decodeGameText } from '../game-text.ts';
import { checkCanals, type CanalDiagnostic } from '../script/canals.ts';
import {
  checkCountryFiles,
  checkCountryHistory,
  checkCountryHistoryMissing,
  countryFilePath,
  countryHistoryTag,
  countryTagsMissing,
  REQUIRED_COUNTRY_TAGS,
  firstCountryTags,
  isCountryTagsPath,
  readCountryFiles,
  checkCountryContent,
  type CountryContentDiagnostic,
  type CountryFileDiagnostic,
  type CountryHistoryDiagnostic,
  type CountryHistoryFile,
  type CountryHistoryMissingDiagnostic,
  type CountryTagDiagnostic,
  type CountryTagsMissingDiagnostic,
} from '../script/country-files.ts';
import {
  checkProvinceHistory,
  provinceHistoryId,
  type ProvinceHistoryDiagnostic,
} from '../script/province-history.ts';
import { checkMapFiles, type MapFileDiagnostic } from '../script/map-files.ts';
import {
  checkTechnologyTables,
  isTechnologyPath,
  readTechnologyTables,
  type TechnologyTableDiagnostic,
} from '../script/technology-tables.ts';
import { parseScript } from '../script/parse.ts';
import {
  checkAdjacencies,
  checkDefinitions,
  checkClimate,
  checkPositions,
  checkProvinceGroups,
  checkTradeWinds,
  checkContinents,
  checkDefaultMap,
  checkProvinceIds,
  isProvinceIdScriptPath,
  type ProvinceIdDiagnostic,
  type ProvinceIds,
} from '../script/province-ids.ts';
import {
  checkScriptNames,
  showsOwnTooltip,
  readBareNames,
  readIdeaNames,
  readReligionNames,
  readTopLevelNames,
  type ScriptNameDiagnostic,
  type ScriptNameKind,
  type ScriptNames,
  type ScriptNameSets,
} from '../script/script-names.ts';
import type { EntryNode, ParsedScript, ScalarNode } from '../script/tree.ts';
import { GameFiles, type GameFile } from './game-files.ts';
import { definedIds, type PlaysetProvinceIds } from './province-ids.ts';

/**
 * A script value the game uses unchecked and the playset does not have, a canal of
 * `map/default.map` the game cannot load or build, or a map file it names that the playset lacks.
 */
export type ScriptValueDiagnostic =
  | ProvinceIdDiagnostic
  | ScriptNameDiagnostic
  | CanalDiagnostic
  | MapFileDiagnostic
  | CountryFileDiagnostic
  | CountryTagDiagnostic
  | CountryHistoryDiagnostic
  | CountryHistoryMissingDiagnostic
  | ProvinceHistoryDiagnostic
  | CountryTagsMissingDiagnostic
  | CountryContentDiagnostic
  | TechnologyTableDiagnostic;

/** What script values are checked against; a check without its part is skipped. */
export interface ScriptValues {
  /** The map's province ids, when the playset has a map. */
  readonly ids?: ProvinceIds | undefined;
  /** The names the playset defines, when it has them. */
  readonly names?: ScriptNames | undefined;
}

/** A script file's text as the game reads it: Windows-1252, without a leading UTF-8 BOM. */
function decode(bytes: Uint8Array): string {
  return decodeGameText(bytes, 'interface').text;
}

/**
 * The province ids and names in a parsed script file that the playset does not have, in text
 * order. `path` is the file's game-relative path (see `checkProvinceIds`).
 */
export function checkScriptValues(
  parsed: ParsedScript,
  values: ScriptValues,
  path?: string,
): ScriptValueDiagnostic[] {
  const found: ScriptValueDiagnostic[] = [];
  if (values.ids !== undefined) found.push(...checkProvinceIds(parsed, values.ids, path));
  if (values.names !== undefined) found.push(...checkScriptNames(parsed, values.names));
  const countryFiles = values.names?.countryFiles;
  if (countryFiles !== undefined && path !== undefined && isCountryTagsPath(path)) {
    const missing = values.names?.countryTagsMissing;
    if (missing !== undefined && missing.path.toLowerCase() === path.toLowerCase()) {
      found.push(countryTagsMissing(missing.tags));
    }
    const firsts = values.names?.countryTags;
    found.push(
      ...checkCountryFiles(
        parsed,
        countryFiles,
        firsts === undefined ? undefined : { path, firsts },
      ),
    );
    const histories = values.names?.countryHistories;
    // A playset without any history/countries file is not one the game starts: nothing to say.
    if (firsts !== undefined && histories !== undefined && histories.size > 0) {
      found.push(...checkCountryHistoryMissing(parsed, path, firsts, histories));
    }
  }
  const histories = values.names?.countryHistories;
  if (histories !== undefined && path !== undefined) {
    const shared = checkCountryHistory(path, histories);
    if (shared !== undefined) found.push(shared);
  }
  const provinces = values.names?.provinceHistories;
  if (provinces !== undefined && path !== undefined) {
    const shared = checkProvinceHistory(path, provinces);
    if (shared !== undefined) found.push(shared);
  }
  const contentTags =
    path === undefined ? undefined : values.names?.countryFileTags?.get(path.toLowerCase());
  if (contentTags !== undefined) found.push(...checkCountryContent(parsed, contentTags));
  const tables = values.names?.technologyTables;
  if (tables !== undefined && path !== undefined && isTechnologyPath(path)) {
    found.push(...checkTechnologyTables(parsed, tables));
  }
  for (const { string, ownTooltip } of scriptStrings(parsed.entries)) {
    // The string's script starts after its opening quote; script strings have no escapes, so
    // offsets in it map one to one.
    const inner = parseScript(string.text, { script: true });
    // A string that does not parse cleanly is text, not script: a title such as "12 = {".
    if (inner.diagnostics.length > 0) continue;
    const offset = string.start + 1;
    const shifted = (d: ScriptValueDiagnostic): ScriptValueDiagnostic => ({
      ...d,
      start: d.start + offset,
      end: d.end + offset,
    });
    if (values.ids !== undefined) {
      found.push(...checkProvinceIds(inner, values.ids, undefined, true).map(shifted));
    }
    if (values.names !== undefined) {
      found.push(...checkScriptNames(inner, values.names, ownTooltip, true).map(shifted));
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/**
 * Quoted values that hold script: a scripted effect's or trigger's argument such as vanilla's
 * `first_effect = "…"` of `simple_dynamic_effect`, which the game puts in place of `$first_effect$`
 * and runs. A quoted value with an `=` in it that parses without a syntax error is taken for
 * script; the game runs it as a trigger or an effect, so its integer keys are province scopes from
 * its top level on. `ownTooltip` is whether the string is inside a block that shows its own
 * tooltip (`custom_trigger_tooltip`).
 */
function scriptStrings(
  entries: readonly EntryNode[],
): { string: ScalarNode; ownTooltip: boolean }[] {
  const found: { string: ScalarNode; ownTooltip: boolean }[] = [];
  const visit = (list: readonly EntryNode[], ownTooltip: boolean): void => {
    for (const entry of list) {
      if (entry.kind === 'block') {
        visit(entry.entries, ownTooltip);
      } else if (entry.kind === 'property') {
        const value = entry.value;
        if (value?.kind === 'block') {
          visit(value.entries, ownTooltip || showsOwnTooltip(entry.key.text));
        } else if (value?.kind === 'scalar' && value.quoted && value.text.includes('=')) {
          found.push({ string: value, ownTooltip });
        }
      }
    }
  };
  visit(entries, false);
  return found;
}

/** Reads a file's top-level blocks as names of a kind. */
function topLevel(kind: ScriptNameKind): (parsed: ParsedScript, into: ScriptNameSets) => void {
  return (parsed, into) => {
    readTopLevelNames(parsed, kind, into);
  };
}

/** Where each kind of name is defined: a `common` folder and how its files are read. */
const NAME_FOLDERS: readonly {
  readonly folder: string;
  readonly read: (parsed: ParsedScript, into: ScriptNameSets) => void;
}[] = [
  { folder: 'common/ideas', read: readIdeaNames },
  { folder: 'common/religions', read: readReligionNames },
  { folder: 'common/policies', read: topLevel('policy') },
  { folder: 'common/rebel_types', read: topLevel('rebel-type') },
  { folder: 'common/disasters', read: topLevel('disaster') },
  { folder: 'common/institutions', read: topLevel('institution') },
  { folder: 'common/estate_agendas', read: topLevel('estate-agenda') },
  { folder: 'common/advisortypes', read: topLevel('advisor-type') },
];

/** Files directly in `common` whose bare words are names: the graphical cultures. */
const NAME_FILES: readonly { readonly path: string; readonly kind: ScriptNameKind }[] = [
  { path: 'common/graphicalculturetype.txt', kind: 'graphical-culture' },
];

/** The folders whose top-level blocks are scripted effects and triggers, which script calls. */
const SCRIPTED_FOLDERS: readonly string[] = ['common/scripted_effects', 'common/scripted_triggers'];

/**
 * The names the playset defines: idea groups and ideas (`common/ideas`), religions and orthodox
 * icons (`common/religions`), policies, rebel types and disasters, each from the winning `.txt`
 * files directly in its folder. A folder no layer has a file in adds no kind, so its names are not
 * checked; `undefined` when no folder has one. With them, the scripted effects and triggers, whose
 * calls' arguments are not checked.
 */
export async function loadScriptNames(files: GameFiles): Promise<ScriptNames | undefined> {
  const byKind: ScriptNameSets = new Map();
  for (const { folder, read } of NAME_FOLDERS) {
    const found = await files.list(folder, '.txt');
    const texts = await Promise.all(
      found.map((file) => files.readFile(file).catch(() => undefined)),
    );
    for (const bytes of texts) {
      if (bytes !== undefined) read(parseScript(decode(bytes), { script: true }), byKind);
    }
  }
  for (const { path, kind } of NAME_FILES) {
    const bytes = await files.read(path).catch(() => undefined);
    if (bytes !== undefined)
      readBareNames(parseScript(decode(bytes), { script: true }), kind, byKind);
  }
  if (byKind.size === 0) return undefined;
  const scripted = new Set<string>();
  for (const folder of SCRIPTED_FOLDERS) {
    const found = await files.list(folder, '.txt');
    const texts = await Promise.all(
      found.map((file) => files.readFile(file).catch(() => undefined)),
    );
    for (const bytes of texts) {
      if (bytes === undefined) continue;
      for (const entry of parseScript(decode(bytes), { script: true }).entries) {
        if (entry.kind === 'property' && entry.value?.kind === 'block') {
          scripted.add(entry.key.text.toLowerCase());
        }
      }
    }
  }
  return {
    byKind,
    scripted,
    countryFiles: await loadCountryFiles(files),
    countryTags: await loadCountryTags(files),
    countryTagsMissing: await loadCountryTagsMissing(files),
    countryHistories: await loadCountryHistories(files),
    provinceHistories: await loadProvinceHistories(files),
    countryFileTags: await loadCountryFileTags(files),
    technologyTables: await loadTechnologyTables(files),
  };
}

/**
 * Whether a layer has each technology table the playset's `common/technology.txt` names, by game
 * path in lower case; a path Etch does not check (`countryFilePath`) is left out.
 */
export async function loadTechnologyTables(files: GameFiles): Promise<Map<string, boolean>> {
  const present = new Map<string, boolean>();
  const file = await files.find('common/technology.txt');
  const bytes = file === undefined ? undefined : await files.readFile(file).catch(() => undefined);
  if (bytes === undefined) return present;
  for (const { file: name } of readTechnologyTables(parseScript(decode(bytes), { script: true }))) {
    const path = countryFilePath(name.text);
    if (path === undefined || present.has(path.toLowerCase())) continue;
    present.set(path.toLowerCase(), (await files.find(path)) !== undefined);
  }
  return present;
}

/**
 * Whether a layer has each country file the playset's `common/country_tags` files name, by game
 * path in lower case; a path Etch does not check (`countryFilePath`) is left out.
 */
export async function loadCountryFiles(files: GameFiles): Promise<Map<string, boolean>> {
  const present = new Map<string, boolean>();
  for (const file of await files.list('common/country_tags', '.txt')) {
    const bytes = await files.readFile(file).catch(() => undefined);
    if (bytes === undefined) continue;
    for (const { file: name } of readCountryFiles(parseScript(decode(bytes), { script: true }))) {
      const path = countryFilePath(name.text);
      if (path === undefined || present.has(path.toLowerCase())) continue;
      present.set(path.toLowerCase(), (await files.find(path)) !== undefined);
    }
  }
  return present;
}

/**
 * The `common/country_tags` file that defines each tag first, in the order the game reads the
 * playset's files (`firstCountryTags`).
 */
export async function loadCountryTags(files: GameFiles): Promise<Map<string, string>> {
  const parsed: { path: string; parsed: ParsedScript }[] = [];
  for (const file of await files.list('common/country_tags', '.txt')) {
    const bytes = await files.readFile(file).catch(() => undefined);
    if (bytes !== undefined) {
      parsed.push({ path: file.path, parsed: parseScript(decode(bytes), { script: true }) });
    }
  }
  return firstCountryTags(parsed);
}

/**
 * The tags whose country file the game checks after reading them (`checkCountryContent`), by the
 * file's game path in lower case: every tag of the playset's `common/country_tags` files in the
 * order the game reads them, without a tag defined before (the game leaves it out) and without
 * the first two, which the game does not check (vanilla's `REB`, whose file has no ship names).
 */
export async function loadCountryFileTags(files: GameFiles): Promise<Map<string, string[]>> {
  const byFile = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const file of await files.list('common/country_tags', '.txt')) {
    const bytes = await files.readFile(file).catch(() => undefined);
    if (bytes === undefined) continue;
    for (const { tag, file: name } of readCountryFiles(
      parseScript(decode(bytes), { script: true }),
    )) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      const path = countryFilePath(name.text);
      if (seen.size <= 2 || path === undefined) continue;
      const key = path.toLowerCase();
      const tags = byFile.get(key) ?? [];
      tags.push(tag);
      byFile.set(key, tags);
    }
  }
  return byFile;
}

/**
 * The first of the playset's `common/country_tags` files and the tags the game needs that no file
 * defines, when that first file is a mod's: the game's own files define them all, so a playset
 * lacks one only through a mod that replaces them.
 */
export async function loadCountryTagsMissing(
  files: GameFiles,
): Promise<{ path: string; tags: string[] } | undefined> {
  const list = await files.list('common/country_tags', '.txt');
  const first = list[0];
  if (first === undefined || first.layer === files.layers[0]) return undefined;
  const tags = await loadCountryTags(files);
  const missing = REQUIRED_COUNTRY_TAGS.filter((tag) => !tags.has(tag));
  return missing.length === 0 ? undefined : { path: first.path, tags: missing };
}

/**
 * The playset's `history/countries` files by the tag the game reads each for, each with whether it
 * has the name of a file of the game's (the first layer's) that the playset reads.
 */
export function loadCountryHistories(files: GameFiles): Promise<Map<string, CountryHistoryFile[]>> {
  return loadHistoryFiles(files, 'history/countries', countryHistoryTag);
}

/**
 * The playset's `history/provinces` files by the province the game reads each for, each with
 * whether it has the name of a file of the game's (the first layer's) that the playset reads.
 */
export function loadProvinceHistories(
  files: GameFiles,
): Promise<Map<number, CountryHistoryFile[]>> {
  return loadHistoryFiles(files, 'history/provinces', provinceHistoryId);
}

/**
 * The `.txt` files of a history folder by what `keyOf` reads each for, each with whether it has the
 * name of one of the game's own files that the playset reads (no layer replaces the folder).
 */
async function loadHistoryFiles<K>(
  files: GameFiles,
  folder: string,
  keyOf: (path: string) => K | undefined,
): Promise<Map<K, CountryHistoryFile[]>> {
  const game = files.layers[0];
  const replaced = files.replacesGameFolder(folder);
  const gameNames = new Set<string>();
  if (game !== undefined && !replaced) {
    for (const file of await new GameFiles([game]).list(folder, '.txt')) {
      gameNames.add(file.path.toLowerCase());
    }
  }
  const byKey = new Map<K, CountryHistoryFile[]>();
  for (const file of await files.list(folder, '.txt')) {
    const key = keyOf(file.path);
    if (key === undefined) continue;
    const list = byKey.get(key) ?? [];
    list.push({ path: file.path, game: gameNames.has(file.path.toLowerCase()) });
    byKey.set(key, list);
  }
  return byKey;
}

/** The diagnostics the playset check sums up per mod instead of listing them in Problems. */
export const SUMMARISED_CODES: ReadonlySet<ScriptValueDiagnostic['code']> = new Set([
  'province-history-shared',
  'country-history-missing',
]);

/** One mod's diagnostics of a summarised code (`SUMMARISED_CODES`) in a playset check. */
export interface ScriptValueSummary {
  readonly code: ScriptValueDiagnostic['code'];
  /** The layer's name (`game` for the game's own files). */
  readonly layer: string;
  /** The line for the notification and the Output channel. */
  readonly message: string;
  /** Each diagnostic with the file it is in, in path order. */
  readonly entries: readonly {
    readonly finding: ScriptValueFinding;
    readonly diagnostic: ScriptValueDiagnostic;
  }[];
}

/**
 * Splits a playset check's findings into those for Problems and one summary per mod and
 * summarised code: a popular mod has hundreds of second province histories or tags without a
 * history file, each true but not worth an entry of its own. Findings left with no diagnostic are
 * dropped.
 */
export function summariseFindings(findings: readonly ScriptValueFinding[]): {
  findings: ScriptValueFinding[];
  summaries: ScriptValueSummary[];
} {
  const kept: ScriptValueFinding[] = [];
  const groups = new Map<string, ScriptValueSummary['entries'][number][]>();
  for (const finding of findings) {
    const own: ScriptValueDiagnostic[] = [];
    for (const diagnostic of finding.diagnostics) {
      if (!SUMMARISED_CODES.has(diagnostic.code)) {
        own.push(diagnostic);
        continue;
      }
      const key = `${diagnostic.code}\n${finding.file.layer.name}`;
      const group = groups.get(key) ?? [];
      group.push({ finding, diagnostic });
      groups.set(key, group);
    }
    if (own.length > 0) kept.push({ ...finding, diagnostics: own });
  }
  const summaries: ScriptValueSummary[] = [];
  for (const [key, entries] of groups) {
    const [code = '', layer = ''] = key.split('\n');
    const of = layer === 'game' ? 'the game' : layer;
    const count = entries.length;
    const message =
      code === 'province-history-shared'
        ? `${String(count)} ${count === 1 ? 'file' : 'files'} of ${of} ${count === 1 ? 'adds' : 'add'} a second history to provinces of the game`
        : `${String(count)} ${count === 1 ? 'tag' : 'tags'} of ${of} ${count === 1 ? 'has' : 'have'} no history/countries file`;
    summaries.push({
      code: code as ScriptValueDiagnostic['code'],
      layer,
      message,
      entries,
    });
  }
  return { findings: kept, summaries };
}

/** A file of the playset with script values it does not have. */
export interface ScriptValueFinding {
  readonly file: GameFile;
  /** The file's text as the game reads it (Windows-1252, no BOM), which the ranges index. */
  readonly text: string;
  readonly diagnostics: readonly ScriptValueDiagnostic[];
}

/** The folders whose `.txt` files, subfolders included, the playset check reads. */
const SCRIPT_FOLDERS: readonly string[] = [
  'common',
  'events',
  'decisions',
  'missions',
  'history',
  'customizable_localization',
];

/** How many files are read at once. */
const READ_AHEAD = 16;

/**
 * Every province id and name in the script files the playset loads (the winning copy of each file
 * under `common`, `events`, `decisions`, `missions`, `history` and `customizable_localization`)
 * and every province id in the
 * lists of its `map/default.map` and its climate, continent, trade winds, positions and province group
 * files and the ids of its adjacencies file that the playset does not have, by file in path order. Files a later layer overrides or a `replace_path` hides are not read: the game does not load them.
 */
export async function findScriptValueProblems(
  files: GameFiles,
  values: {
    readonly ids?: PlaysetProvinceIds | undefined;
    readonly names?: ScriptNames | undefined;
  },
): Promise<{ findings: ScriptValueFinding[]; filesChecked: number }> {
  const scripts: GameFile[] = [];
  for (const folder of SCRIPT_FOLDERS) scripts.push(...(await filesUnder(files, folder)));
  const checked = scripts.filter((file) => isProvinceIdScriptPath(file.path));
  const findings: ScriptValueFinding[] = [];
  for (let i = 0; i < checked.length; i += READ_AHEAD) {
    const batch = checked.slice(i, i + READ_AHEAD);
    // A file deleted or locked since the listing is skipped, as the game would not read it either.
    const texts = await Promise.all(
      batch.map((file) => files.readFile(file).catch(() => undefined)),
    );
    batch.forEach((file, j) => {
      const bytes = texts[j];
      if (bytes === undefined) return;
      const text = decode(bytes);
      const diagnostics = checkScriptValues(parseScript(text, { script: true }), values, file.path);
      if (diagnostics.length > 0) findings.push({ file, text, diagnostics });
    });
  }
  let filesChecked = checked.length;
  if (values.ids !== undefined) {
    const mapText = decode(await files.readFile(values.ids.mapFile));
    const mapParsed = parseScript(mapText, { script: true });
    const mapDiagnostics: ScriptValueDiagnostic[] = checkDefaultMap(
      mapParsed,
      definedIds(values.ids),
    );
    if (values.ids.canalBitmaps !== undefined) {
      mapDiagnostics.push(...checkCanals(mapParsed, values.ids.canalBitmaps));
    }
    if (values.ids.mapFiles !== undefined) {
      mapDiagnostics.push(...checkMapFiles(mapParsed, values.ids.mapFiles));
    }
    mapDiagnostics.sort((a, b) => a.start - b.start);
    if (mapDiagnostics.length > 0) {
      findings.push({ file: values.ids.mapFile, text: mapText, diagnostics: mapDiagnostics });
    }
    filesChecked++;
    const script =
      (check: (parsed: ParsedScript, ids: ProvinceIds) => ProvinceIdDiagnostic[]) =>
      (text: string, ids: ProvinceIds): ProvinceIdDiagnostic[] =>
        check(parseScript(text, { script: true }), ids);
    const mapLists = [
      [values.ids.definitionFile, checkDefinitions],
      [values.ids.climateFile, script(checkClimate)],
      [values.ids.continentFile, script(checkContinents)],
      [values.ids.tradeWindsFile, script(checkTradeWinds)],
      [values.ids.positionsFile, script(checkPositions)],
      [values.ids.adjacenciesFile, checkAdjacencies],
      [values.ids.provinceGroupFile, script(checkProvinceGroups)],
    ] as const;
    for (const [file, check] of mapLists) {
      if (file === undefined) continue;
      const text = decode(await files.readFile(file));
      const diagnostics = check(text, values.ids);
      if (diagnostics.length > 0) findings.push({ file, text, diagnostics });
      filesChecked++;
    }
  }
  findings.sort((a, b) => compareText(a.file.path.toLowerCase(), b.file.path.toLowerCase()));
  return { findings, filesChecked };
}

/** The `.txt` files of a folder and its subfolders, as the playset wins them. */
async function filesUnder(files: GameFiles, folder: string): Promise<GameFile[]> {
  const found = await files.list(folder, '.txt');
  for (const sub of await files.folders(folder)) found.push(...(await filesUnder(files, sub)));
  return found;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
