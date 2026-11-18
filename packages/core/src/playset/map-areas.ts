import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import { readAreas, readRegions, type MapAreas } from '../script/map-areas.ts';
import { parseScript } from '../script/parse.ts';
import { parseDefaultMap } from '../script/province-ids.ts';
import type { GameFiles } from './game-files.ts';

/** A script file's text as the game reads it: Windows-1252, without a leading UTF-8 BOM. */
function decode(bytes: Uint8Array): string {
  return decodeGameText(bytes, 'interface').text;
}

/**
 * The playset's areas and regions: the winning area and region files that the winning
 * `map/default.map` names (`area.txt` and `region.txt` when it names none). `undefined` when no
 * layer has the area file; without a region file, areas have no region.
 */
export async function loadMapAreas(files: GameFiles): Promise<MapAreas | undefined> {
  const mapFile = await files.find('map/default.map');
  const map =
    mapFile === undefined
      ? undefined
      : parseDefaultMap(decode(await readFile(mapFile.absolutePath)));
  const [areaFile, regionFile] = await Promise.all([
    files.find(`map/${map?.area ?? 'area.txt'}`),
    files.find(`map/${map?.region ?? 'region.txt'}`),
  ]);
  if (areaFile === undefined) return undefined;
  const parse = async (path: string) => parseScript(decode(await readFile(path)), { script: true });
  const [areas, regions] = await Promise.all([
    parse(areaFile.absolutePath),
    regionFile === undefined ? undefined : parse(regionFile.absolutePath),
  ]);
  return {
    area: readAreas(areas),
    region: regions === undefined ? new Map() : readRegions(regions),
  };
}
