import { readFile } from 'node:fs/promises';
import { parseScript } from '../script/parse.ts';
import {
  checkDefaultMap,
  checkProvinceIds,
  isProvinceIdScriptPath,
  parseDefaultMap,
  parseProvinceDefinitions,
  type ProvinceIdDiagnostic,
  type ProvinceIds,
} from '../script/province-ids.ts';
import type { GameFile, GameFiles } from './game-files.ts';

/** The playset's province ids, and the files they came from. */
export interface PlaysetProvinceIds extends ProvinceIds {
  /** The winning `map/default.map`. */
  readonly mapFile: GameFile;
  /** The winning definition file `map/default.map` names, when a layer has it. */
  readonly definitionFile: GameFile | undefined;
}

const DECODER = new TextDecoder('windows-1252');

/**
 * The province ids of the playset's map: `max_provinces` of the winning `map/default.map`, a mod's
 * when it has one, and the ids of the winning definition file it names (`definitions`,
 * `map/definition.csv` by default). `undefined` when no layer has `map/default.map` or it sets no
 * `max_provinces`.
 */
export async function loadProvinceIds(files: GameFiles): Promise<PlaysetProvinceIds | undefined> {
  const mapFile = await files.find('map/default.map');
  if (mapFile === undefined) return undefined;
  const map = parseDefaultMap(DECODER.decode(await readFile(mapFile.absolutePath)));
  if (map.maxProvinces === undefined) return undefined;
  const definitionFile = await files.find(`map/${map.definitions}`);
  const defined =
    definitionFile === undefined
      ? undefined
      : parseProvinceDefinitions(DECODER.decode(await readFile(definitionFile.absolutePath)));
  return {
    maxProvinces: map.maxProvinces,
    maxSource: describe(mapFile),
    defined,
    definedSource: definitionFile === undefined ? undefined : describe(definitionFile),
    mapFile,
    definitionFile,
  };
}

function describe(file: GameFile): string {
  return file.layer.name === 'game'
    ? `${file.path} of the game`
    : `${file.path} of ${file.layer.name}`;
}

/** A file of the playset with province ids its map does not have. */
export interface ProvinceIdFinding {
  readonly file: GameFile;
  /** The file's text as the game reads it (Windows-1252), which the ranges index. */
  readonly text: string;
  readonly diagnostics: readonly ProvinceIdDiagnostic[];
}

/** The folders whose `.txt` files, subfolders included, the playset check reads. */
const SCRIPT_FOLDERS: readonly string[] = ['common', 'events', 'decisions', 'missions', 'history'];

/** How many files are read at once. */
const READ_AHEAD = 16;

/**
 * Every province id in the script files the playset loads (the winning copy of each file under
 * `common`, `events`, `decisions`, `missions` and `history`) and in the lists of its
 * `map/default.map` that its map does not have, by file in path order. Files a later layer
 * overrides or a `replace_path` hides are not read: the game does not load them.
 */
export async function findProvinceIdProblems(
  files: GameFiles,
  ids: PlaysetProvinceIds,
): Promise<{ findings: ProvinceIdFinding[]; filesChecked: number }> {
  const scripts: GameFile[] = [];
  for (const folder of SCRIPT_FOLDERS) scripts.push(...(await filesUnder(files, folder)));
  const checked = scripts.filter((file) => isProvinceIdScriptPath(file.path));
  const findings: ProvinceIdFinding[] = [];
  for (let i = 0; i < checked.length; i += READ_AHEAD) {
    const batch = checked.slice(i, i + READ_AHEAD);
    const texts = await Promise.all(batch.map((file) => readFile(file.absolutePath)));
    batch.forEach((file, j) => {
      const bytes = texts[j];
      if (bytes === undefined) return;
      const text = DECODER.decode(bytes);
      const diagnostics = checkProvinceIds(parseScript(text), ids, file.path);
      if (diagnostics.length > 0) findings.push({ file, text, diagnostics });
    });
  }
  const mapText = DECODER.decode(await readFile(ids.mapFile.absolutePath));
  const mapDiagnostics = checkDefaultMap(parseScript(mapText), definedIds(ids));
  if (mapDiagnostics.length > 0) {
    findings.push({ file: ids.mapFile, text: mapText, diagnostics: mapDiagnostics });
  }
  findings.sort((a, b) => compareText(a.file.path.toLowerCase(), b.file.path.toLowerCase()));
  return { findings, filesChecked: checked.length + 1 };
}

/** The definition file's ids in the form `checkDefaultMap` takes, when it was read. */
export function definedIds(
  ids: PlaysetProvinceIds,
): { readonly ids: ReadonlySet<number>; readonly source: string } | undefined {
  return ids.defined === undefined || ids.definedSource === undefined
    ? undefined
    : { ids: ids.defined, source: ids.definedSource };
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
