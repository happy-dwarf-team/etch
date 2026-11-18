import type { ParsedScript } from './tree.ts';

/**
 * The areas of the map and their regions, as `map/default.map` names their files (`area`,
 * `region`): the area each province is in and the region of each area, by the keys the playset's
 * localisation names them with (`oka_area` shows "Oka", `russia_region` "Russia"). The province
 * view shows them in its header, and the state tab is the area's.
 */
export interface MapAreas {
  /** The area of a province, by its id. */
  readonly area: ReadonlyMap<number, string>;
  /** The region of an area, by the area's key in lower case. */
  readonly region: ReadonlyMap<string, string>;
}

/**
 * The areas of `map/area.txt`: `oka_area = { 295 296 … }`, the province ids bare in each block,
 * beside a `color = { … }` some areas have. A province listed in two areas keeps the first.
 */
export function readAreas(parsed: ParsedScript): Map<number, string> {
  const areas = new Map<number, string>();
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    for (const item of entry.value.entries) {
      if (item.kind !== 'scalar' || !/^\d+$/.test(item.text)) continue;
      const id = Number(item.text);
      if (!areas.has(id)) areas.set(id, entry.key.text);
    }
  }
  return areas;
}

/**
 * The regions of `map/region.txt`: `russia_region = { areas = { oka_area … } }`, by the key of
 * each area in lower case. An area listed in two regions keeps the first.
 */
export function readRegions(parsed: ParsedScript): Map<string, string> {
  const regions = new Map<string, string>();
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    for (const item of entry.value.entries) {
      if (item.kind !== 'property' || item.key.text.toLowerCase() !== 'areas') continue;
      if (item.value?.kind !== 'block') continue;
      for (const area of item.value.entries) {
        if (area.kind !== 'scalar') continue;
        const key = area.text.toLowerCase();
        if (!regions.has(key)) regions.set(key, entry.key.text);
      }
    }
  }
  return regions;
}

/** The area or region of a province; `undefined` when the map does not place it in one. */
export function mapAreaOf(
  map: MapAreas,
  province: number,
  what: 'area' | 'region',
): string | undefined {
  const area = map.area.get(province);
  if (what === 'area' || area === undefined) return area;
  return map.region.get(area.toLowerCase());
}
