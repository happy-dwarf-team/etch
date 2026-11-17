import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import {
  parseDefaultMap,
  parseProvinceDefinitions,
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

/** A script file's text as the game reads it: Windows-1252, without a leading UTF-8 BOM. */
function decode(bytes: Uint8Array): string {
  return decodeGameText(bytes, 'interface').text;
}

/**
 * The province ids of the playset's map: `max_provinces` of the winning `map/default.map`, a mod's
 * when it has one, and the ids of the winning definition file it names (`definitions`,
 * `map/definition.csv` by default). `undefined` when no layer has `map/default.map` or it sets no
 * `max_provinces`.
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
    mapFile,
    definitionFile,
  };
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
