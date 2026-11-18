// Local only: reads the installed game's map and localisation in place, read only, and checks the
// area and region names a profile's `map` source gives against what the game showed in the
// corpus's province views. Runs when ETCH_GAME_PATH names the game folder and is skipped otherwise
// (CI has no game).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapAreaOf } from '../src/index.ts';
import { GameFiles, loadMapAreas, loadPlaysetLocalisation } from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

interface Captured {
  readonly path: string;
  readonly text?: string;
  readonly children?: readonly Captured[];
}

/** The texts the game showed in a corpus record of vanilla at 1920×1080, by widget name. */
function shown(view: string): Map<string, string> {
  const record = JSON.parse(
    readFileSync(
      new URL(`../../../corpus/captures/vanilla/1920x1080/${view}.json`, import.meta.url),
      'utf8',
    ),
  ) as { widgets: Captured[] };
  const texts = new Map<string, string>();
  const walk = (w: Captured): void => {
    if (w.text !== undefined) texts.set(w.path.split('/').at(-1) ?? '', w.text);
    for (const child of w.children ?? []) walk(child);
  };
  for (const root of record.widgets) walk(root);
  return texts;
}

describe.skipIf(gamePath === undefined)("the vanilla map's areas and regions", () => {
  const files = new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]);

  it.each([
    ['province', 148],
    ['province-foreign', 4702],
  ])('name what the %s view of the corpus showed (province %i)', async (view, province) => {
    const [map, loc] = await Promise.all([
      loadMapAreas(files),
      loadPlaysetLocalisation(files, 'english'),
    ]);
    if (map === undefined) throw new Error('no map/area.txt');
    const name = (what: 'area' | 'region') => {
      const key = mapAreaOf(map, province, what);
      return key === undefined ? undefined : (loc.get(key) ?? key);
    };
    const game = shown(view);
    expect(name('area')).toBe(game.get('area_name'));
    expect(name('area')).toBe(game.get('states_tab_button'));
    expect(name('region')).toBe(game.get('region_name'));
  });

  it("names Kaluga's area and region as the live game shows them", async () => {
    const map = await loadMapAreas(files);
    if (map === undefined) throw new Error('no map/area.txt');
    expect(mapAreaOf(map, 296, 'area')).toBe('oka_area');
    expect(mapAreaOf(map, 296, 'region')).toBe('russia_region');
  });
});
