import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import { parseScript } from '../script/parse.ts';
import {
  checkAdjacencies,
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
import type { GameFile, GameFiles } from './game-files.ts';
import { definedIds, type PlaysetProvinceIds } from './province-ids.ts';

/** A script value the game uses unchecked and the playset does not have. */
export type ScriptValueDiagnostic = ProvinceIdDiagnostic | ScriptNameDiagnostic;

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
      found.map((file) => readFile(file.absolutePath).catch(() => undefined)),
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
      found.map((file) => readFile(file.absolutePath).catch(() => undefined)),
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
  return { byKind, scripted };
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
      batch.map((file) => readFile(file.absolutePath).catch(() => undefined)),
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
    const mapText = decode(await readFile(values.ids.mapFile.absolutePath));
    const mapDiagnostics = checkDefaultMap(
      parseScript(mapText, { script: true }),
      definedIds(values.ids),
    );
    if (mapDiagnostics.length > 0) {
      findings.push({ file: values.ids.mapFile, text: mapText, diagnostics: mapDiagnostics });
    }
    filesChecked++;
    const script =
      (check: (parsed: ParsedScript, ids: ProvinceIds) => ProvinceIdDiagnostic[]) =>
      (text: string, ids: ProvinceIds): ProvinceIdDiagnostic[] =>
        check(parseScript(text, { script: true }), ids);
    const mapLists = [
      [values.ids.climateFile, script(checkClimate)],
      [values.ids.continentFile, script(checkContinents)],
      [values.ids.tradeWindsFile, script(checkTradeWinds)],
      [values.ids.positionsFile, script(checkPositions)],
      [values.ids.adjacenciesFile, checkAdjacencies],
      [values.ids.provinceGroupFile, script(checkProvinceGroups)],
    ] as const;
    for (const [file, check] of mapLists) {
      if (file === undefined) continue;
      const text = decode(await readFile(file.absolutePath));
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
