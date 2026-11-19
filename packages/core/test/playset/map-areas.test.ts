import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mapAreaOf } from '../../src/index.ts';
import { GameFiles, loadMapAreas, type GameFilesLayer } from '../../src/playset/index.ts';
import { makeTree, removeTree } from './fixture.ts';

describe('areas and regions of a playset', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTree({
      'game/map/default.map': 'max_provinces = 10\n',
      'game/map/area.txt': 'oka_area = { 1 2 }\nkazan_area = { color = { 1 2 3 } 3 }\n',
      'game/map/region.txt': 'russia_region = { areas = { oka_area } }\n',
      // A map mod with its own file names; a UTF-8 BOM, which the game skips.
      'map/map/default.map':
        'max_provinces = 20\narea = "big_area.txt"\nregion = "big_region.txt"\n',
      'map/map/big_area.txt': '﻿big_area = { 1 12 }\n',
      'map/map/big_region.txt': 'big_region = { areas = { big_area } }\n',
      // A mod with an area file and no region file, and no default.map.
      'areas/map/area.txt': 'lone_area = { 4 }\n',
    });
  });

  afterEach(async () => {
    await removeTree(root);
  });

  const layer = (name: string): GameFilesLayer => ({
    name,
    root: join(root, name),
    replacePaths: [],
  });

  it("reads the files the winning default.map names, by area and by the area's region", async () => {
    const game = await loadMapAreas(new GameFiles([layer('game')]));
    expect(game?.area.get(1)).toBe('oka_area');
    // The colour block of an area does not give provinces.
    expect([...(game?.area.keys() ?? [])]).toEqual([1, 2, 3]);
    expect(game === undefined ? undefined : mapAreaOf(game, 2, 'region')).toBe('russia_region');
    expect(game === undefined ? undefined : mapAreaOf(game, 3, 'region')).toBeUndefined();

    const big = await loadMapAreas(new GameFiles([layer('game'), layer('map')]));
    expect(big?.area.get(12)).toBe('big_area');
    expect(big?.area.has(2)).toBe(false);
    expect(big?.region.get('big_area')).toBe('big_region');
  });

  it('gives areas without regions when no layer has the region file', async () => {
    const lone = await loadMapAreas(new GameFiles([layer('areas')]));
    expect(lone?.area.get(4)).toBe('lone_area');
    expect(lone?.region.size).toBe(0);
  });

  it('gives nothing without an area file', async () => {
    expect(await loadMapAreas(new GameFiles([layer('none')]))).toBeUndefined();
  });
});
