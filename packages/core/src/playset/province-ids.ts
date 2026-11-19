import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
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
  const map = parseDefaultMap(decode(await readFile(mapFile.absolutePath)));
  if (map.maxProvinces === undefined) return undefined;
  const definitionFile = await files.find(`map/${map.definitions}`);
  const defined =
    definitionFile === undefined
      ? undefined
      : parseProvinceDefinitions(decode(await readFile(definitionFile.absolutePath)));
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
  };
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
      found.map((file) => readFile(file.absolutePath).catch(() => undefined)),
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
