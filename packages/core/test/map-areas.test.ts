// The map's areas and regions (`map/area.txt`, `map/region.txt`), for a profile's `map` source.
import { describe, expect, it } from 'vitest';
import { mapAreaOf, parseDefaultMap, parseScript, readAreas, readRegions } from '../src/index.ts';

const AREAS = parseScript(
  `oka_area = {
	295 296 297
}
macedonia_area = {
	color = { 120 40 40 }
	146 147 148
}
# A province listed twice keeps its first area.
second_area = { 296 4702 }
empty_area = { }
`,
  { script: true },
);

const REGIONS = parseScript(
  `russia_region = {
	areas = {
		oka_area
		Moscow_Area
	}
	monsoon = { 00.06.01 00.09.30 }
}
balkan_region = {
	areas = { macedonia_area }
}
# An area listed in two regions keeps its first.
other_region = { areas = { oka_area second_area } }
sea_region = { }
`,
  { script: true },
);

describe('the areas and regions of the map', () => {
  it('reads the province ids of each area and skips its colour', () => {
    const areas = readAreas(AREAS);
    expect(areas.get(296)).toBe('oka_area');
    expect(areas.get(148)).toBe('macedonia_area');
    expect(areas.get(4702)).toBe('second_area');
    expect(areas.has(120)).toBe(false);
    expect(areas.size).toBe(7);
  });

  it('reads the areas of each region by their keys in lower case', () => {
    const regions = readRegions(REGIONS);
    expect(regions.get('oka_area')).toBe('russia_region');
    expect(regions.get('moscow_area')).toBe('russia_region');
    expect(regions.get('macedonia_area')).toBe('balkan_region');
    expect(regions.get('second_area')).toBe('other_region');
    expect(regions.size).toBe(4);
  });

  it("gives a province's area, and its area's region", () => {
    const map = { area: readAreas(AREAS), region: readRegions(REGIONS) };
    expect(mapAreaOf(map, 296, 'area')).toBe('oka_area');
    expect(mapAreaOf(map, 296, 'region')).toBe('russia_region');
    expect(mapAreaOf(map, 1, 'area')).toBeUndefined();
    expect(mapAreaOf(map, 1, 'region')).toBeUndefined();
    expect(mapAreaOf({ ...map, region: new Map() }, 296, 'region')).toBeUndefined();
  });

  it("reads the area and region files' names from map/default.map", () => {
    expect(parseDefaultMap('max_provinces = 10')).toMatchObject({
      area: 'area.txt',
      region: 'region.txt',
    });
    expect(parseDefaultMap('area = "my_areas.txt"\nregion = "my_regions.txt"')).toMatchObject({
      area: 'my_areas.txt',
      region: 'my_regions.txt',
    });
  });
});
