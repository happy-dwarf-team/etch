import { open } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import {
  bmpSize,
  canalBitmapPath,
  readCanalDefinitions,
  type BitmapSize,
  type CanalBitmaps,
} from '../script/canals.ts';
import { mapFilePath, readMapFileNames } from '../script/map-files.ts';
import { parseScript } from '../script/parse.ts';
import {
  parseDefaultMap,
  parseProvinceDefinitions,
  readScriptedProvinceArguments,
  type ProvinceArguments,
  type ProvinceIds,
} from '../script/province-ids.ts';
import type { ParsedScript } from '../script/tree.ts';
import type { GameFile, GameFiles } from './game-files.ts';

/** The playset's province ids, and the files they came from. */
export interface PlaysetProvinceIds extends ProvinceIds {
  /** The winning `map/default.map`. */
  readonly mapFile: GameFile;
  /** The winning definition file `map/default.map` names, when a layer has it. */
  readonly definitionFile: GameFile | undefined;
  /** The winning climate file `map/default.map` names (`climate`), when a layer has it. */
  readonly climateFile?: GameFile | undefined;
  /** The winning continent file `map/default.map` names (`continent`), when a layer has it. */
  readonly continentFile?: GameFile | undefined;
  /** The winning trade winds file `map/default.map` names (`trade_winds`), when a layer has it. */
  readonly tradeWindsFile?: GameFile | undefined;
  /** The winning positions file `map/default.map` names (`positions`), when a layer has it. */
  readonly positionsFile?: GameFile | undefined;
  /** The winning adjacencies file `map/default.map` names (`adjacencies`), when a layer has it. */
  readonly adjacenciesFile?: GameFile | undefined;
  /** The winning province group file `map/default.map` names (`provincegroup`), when a layer has it. */
  readonly provinceGroupFile?: GameFile | undefined;
  /** The sizes of the river map and of the canal bitmaps `map/default.map`'s canals name. */
  readonly canalBitmaps?: CanalBitmaps | undefined;
  /** Whether a layer has each file `map/default.map` names (`MAP_FILE_KEYS`), by game path in lower case. */
  readonly mapFiles?: ReadonlyMap<string, boolean> | undefined;
}

/** A script file's text as the game reads it: Windows-1252, without a leading UTF-8 BOM. */
function decode(bytes: Uint8Array): string {
  return decodeGameText(bytes, 'interface').text;
}

/**
 * The province ids of the playset's map: `max_provinces` of the winning `map/default.map`, a mod's
 * when it has one, and the ids of the winning definition file it names (`definitions`,
 * `map/definition.csv` by default), and its climate, continent, trade winds, positions, adjacencies and province group files.
 * `undefined` when no layer has `map/default.map` or it sets no `max_provinces`.
 */
export async function loadProvinceIds(files: GameFiles): Promise<PlaysetProvinceIds | undefined> {
  const mapFile = await files.find('map/default.map');
  if (mapFile === undefined) return undefined;
  const mapText = decode(await files.readFile(mapFile));
  const map = parseDefaultMap(mapText);
  if (map.maxProvinces === undefined) return undefined;
  const definitionFile = await files.find(`map/${map.definitions}`);
  const defined =
    definitionFile === undefined
      ? undefined
      : parseProvinceDefinitions(decode(await files.readFile(definitionFile)));
  return {
    maxProvinces: map.maxProvinces,
    maxSource: describe(mapFile),
    defined,
    definedSource: definitionFile === undefined ? undefined : describe(definitionFile),
    calls: await loadScriptedProvinceArguments(files),
    mapFile,
    definitionFile,
    climateFile: await files.find(`map/${map.climate}`),
    continentFile: await files.find(`map/${map.continent}`),
    tradeWindsFile: await files.find(`map/${map.tradeWinds}`),
    positionsFile: await files.find(`map/${map.positions}`),
    adjacenciesFile: await files.find(`map/${map.adjacencies}`),
    provinceGroupFile: await files.find(`map/${map.provinceGroup}`),
    canalBitmaps: await loadCanalBitmaps(files, map.rivers, mapText),
    mapFiles: await loadMapFiles(files, mapText),
  };
}

/** Whether a layer has each file `map/default.map` names (`MAP_FILE_KEYS`), by game path in lower case. */
export async function loadMapFiles(
  files: GameFiles,
  mapText: string,
): Promise<Map<string, boolean>> {
  const present = new Map<string, boolean>();
  for (const name of readMapFileNames(parseScript(mapText, { script: true })).values()) {
    const path = mapFilePath(name.text);
    present.set(path.toLowerCase(), (await files.find(path)) !== undefined);
  }
  return present;
}

/**
 * The size of the playset's river map and of each canal's bitmap that `map/default.map` names
 * (`map/<name>_river.bmp`, `null` when no layer has it), read from their headers.
 */
export async function loadCanalBitmaps(
  files: GameFiles,
  rivers: string,
  mapText: string,
): Promise<CanalBitmaps> {
  const canals = new Map<string, BitmapSize | null>();
  for (const canal of readCanalDefinitions(parseScript(mapText, { script: true }))) {
    const name = canal.name?.text;
    if (name === undefined || canals.has(name.toLowerCase())) continue;
    const file = await files.find(canalBitmapPath(name));
    canals.set(
      name.toLowerCase(),
      file === undefined ? null : ((await headerSize(files, file)) ?? null),
    );
  }
  const riversFile = await files.find(`map/${rivers}`);
  return {
    rivers: riversFile === undefined ? undefined : await headerSize(files, riversFile),
    riversPath: `map/${rivers}`,
    canals,
  };
}

/**
 * A BMP file's size from its first bytes only (a river map is megabytes); `undefined` when it
 * cannot be read or is no BMP.
 */
async function headerSize(files: GameFiles, file: GameFile): Promise<BitmapSize | undefined> {
  try {
    if (file.archiveEntry !== undefined)
      return bmpSize((await files.readFile(file)).subarray(0, 26));
    const handle = await open(file.absolutePath, 'r');
    try {
      const bytes = new Uint8Array(26);
      const { bytesRead } = await handle.read(bytes, 0, bytes.byteLength, 0);
      return bmpSize(bytes.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

/** The folders of the scripted effects and triggers, whose arguments can be province ids. */
const SCRIPTED_FOLDERS: readonly string[] = ['common/scripted_effects', 'common/scripted_triggers'];

/**
 * The arguments the playset's scripted effects and triggers use as province ids, read from the
 * winning `.txt` files of `common/scripted_effects` and `common/scripted_triggers` in path order
 * (`readScriptedProvinceArguments`). A file that cannot be read is skipped.
 */
export async function loadScriptedProvinceArguments(files: GameFiles): Promise<ProvinceArguments> {
  const parsed: ParsedScript[] = [];
  for (const folder of SCRIPTED_FOLDERS) {
    const found = await files.list(folder, '.txt');
    const texts = await Promise.all(
      found.map((file) => files.readFile(file).catch(() => undefined)),
    );
    for (const bytes of texts) {
      if (bytes !== undefined) parsed.push(parseScript(decode(bytes), { script: true }));
    }
  }
  return readScriptedProvinceArguments(parsed);
}

function describe(file: GameFile): string {
  return file.layer.name === 'game'
    ? `${file.path} of the game`
    : `${file.path} of ${file.layer.name}`;
}

/** The definition file's ids in the form `checkDefaultMap` takes, when it was read. */
export function definedIds(
  ids: PlaysetProvinceIds,
): { readonly ids: ReadonlySet<number>; readonly source: string } | undefined {
  return ids.defined === undefined || ids.definedSource === undefined
    ? undefined
    : { ids: ids.defined, source: ids.definedSource };
}
