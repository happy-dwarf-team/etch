import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GameFiles,
  findScriptValueProblems,
  loadProvinceIds,
  type GameFilesLayer,
} from '../../src/playset/index.ts';
import { addFiles, makeTree, removeTree } from './fixture.ts';

const GAME_MAP = 'max_provinces = 10\nsea_starts = { 8 9 }\n';

/** The first 26 bytes of a BMP file of the given size, all the canal check reads. */
function bmpHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes.set([0x42, 0x4d]);
  const view = new DataView(bytes.buffer);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  return bytes;
}
const GAME_DEFINITIONS = 'province;red;green;blue;x;x\n1;1;1;1;A;x\n2;2;2;2;B;x\n9;256;9;9;I;x\n';

describe('province ids of a playset', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTree({
      'game/map/default.map': GAME_MAP,
      'game/map/definition.csv': GAME_DEFINITIONS,
      'game/events/game.txt': 'e = { trigger = { owns = 12 } }',
      'game/events/overridden.txt': 'e = { trigger = { owns = 13 } }',
      'game/decisions/hidden.txt': 'd = { x = { allow = { owns = 14 } } }',
      // A map mod: more provinces, its own definition file under another name.
      'map/map/default.map':
        'max_provinces = 20\ndefinitions = "big.csv"\nclimate = "big_climate.txt"\nlakes = { 2 15 25 }\n',
      'map/map/big.csv': '1;1;1;1;A;x\n2;2;2;2;B;x\n12;1;1;1;L;x\n13;1;1;1;M;x\n-3;1;1;1;N;x\n',
      'game/map/climate.txt': 'tropical = { 1 2 }\narid = { 9 }\n',
      'game/map/continent.txt': 'europe = { 1 -3 50 }\n',
      'game/map/trade_winds.txt': '# direction\n1 = 0\n-1 = 30\n12 = -15\n',
      'game/map/positions.txt': '1 = { position = { 1 2 } }\n-2 = { }\n50 = { }\n',
      'game/map/provincegroup.txt': '#example = { 1 2 3 }\ncoast = { 1 -4 50 }\n',
      'game/map/adjacencies.csv':
        'From;To;Type;Through;start_x;start_y;stop_x;stop_y;Comment\r\n' +
        '1;12;sea;2;-1;-1;-1;-1;Strait\r\n2;9;land;-1;-1;-1;-1;-1;\r\n-1;-1;;-1;-1;-1;-1;-1;\r\n' +
        '30;31;sea;32;-1;-1;-1;-1;after the end\r\n',
      // The map mod's climate file, under the name its default.map gives.
      'map/map/big_climate.txt': 'arctic = { 12 14 30 }\n',
      'map/events/overridden.txt': 'e = { immediate = { 13 = { add_core = ROOT } } }',
      // A mod for the vanilla map in the same playset.
      'other/events/other.txt':
        'e = {\n  trigger = { owns = 12 owns = 5 }\n  immediate = { add_core = 30 claim = { where = 40 } }\n}\n',
      'other/common/scripted_effects/fx.txt':
        'fx = { 25 = { add_core = ROOT } }\nclaim = { add_claim = $where$ }',
      'other/common/province_names/names.txt': '25 = "Far"',
      'other/decisions/shown.txt': 'd = { x = { allow = { owns = 99 } } }',
    });
  });

  afterEach(async () => {
    await removeTree(root);
  });

  function playset(...mods: GameFilesLayer[]): GameFiles {
    return new GameFiles([{ name: 'game', root: join(root, 'game'), replacePaths: [] }, ...mods]);
  }

  const mapMod: () => GameFilesLayer = () => ({
    name: 'Big Map',
    root: join(root, 'map'),
    replacePaths: [],
  });
  const otherMod: () => GameFilesLayer = () => ({
    name: 'Other',
    root: join(root, 'other'),
    replacePaths: ['decisions'],
  });

  it("reads the game's map without mods", async () => {
    const ids = await loadProvinceIds(playset());
    expect(ids?.maxProvinces).toBe(10);
    expect(ids?.maxSource).toBe('map/default.map of the game');
    expect([...(ids?.defined ?? [])]).toEqual([1, 2, 9]);
    expect(ids?.definedSource).toBe('map/definition.csv of the game');
    expect([...(ids?.calls ?? [])]).toEqual([]);
  });

  it('reads the arguments its scripted effects use as province ids', async () => {
    const ids = await loadProvinceIds(playset(otherMod()));
    expect([...(ids?.calls ?? [])]).toEqual([['claim', new Set(['where'])]]);
  });

  it("takes a mod's default.map and the definition file it names", async () => {
    const ids = await loadProvinceIds(playset(mapMod()));
    expect(ids?.maxProvinces).toBe(20);
    expect(ids?.maxSource).toBe('map/default.map of Big Map');
    expect([...(ids?.defined ?? [])]).toEqual([1, 2, 12, 13]);
    expect(ids?.definitionFile?.path).toBe('map/big.csv');
    expect(ids?.definedSource).toBe('map/big.csv of Big Map');
    expect(ids?.climateFile?.path).toBe('map/big_climate.txt');
    expect((await loadProvinceIds(playset()))?.climateFile?.path).toBe('map/climate.txt');
    // The map mod has no continent file of its own: the game's wins.
    expect(ids?.continentFile?.layer.name).toBe('game');
    expect(ids?.tradeWindsFile?.path).toBe('map/trade_winds.txt');
    expect(ids?.positionsFile?.path).toBe('map/positions.txt');
    expect(ids?.adjacenciesFile?.path).toBe('map/adjacencies.csv');
    expect(ids?.provinceGroupFile?.path).toBe('map/provincegroup.txt');
  });

  it('is undefined without a default.map', async () => {
    const files = new GameFiles([{ name: 'Other', root: join(root, 'other'), replacePaths: [] }]);
    expect(await loadProvinceIds(files)).toBeUndefined();
  });

  it('finds, file by file, the ids the vanilla map lacks', async () => {
    const files = playset(otherMod());
    const ids = await loadProvinceIds(files);
    if (ids === undefined) throw new Error('no map');
    const { findings, filesChecked } = await findScriptValueProblems(files, { ids });
    const summary = findings.map((finding) => [
      finding.file.layer.name,
      finding.file.path,
      finding.diagnostics.map((d) => `${d.key} ${String('id' in d ? d.id : d.name)} ${d.code}`),
    ]);
    expect(summary).toEqual([
      ['Other', 'common/scripted_effects/fx.txt', ['fx 25 province-id-out-of-range']],
      // `replace_path = "decisions"` hides the game's decisions/hidden.txt (owns = 14).
      ['Other', 'decisions/shown.txt', ['owns 99 province-id-out-of-range']],
      ['game', 'events/game.txt', ['owns 12 province-id-out-of-range']],
      [
        'Other',
        'events/other.txt',
        [
          'owns 12 province-id-out-of-range',
          'owns 5 province-id-not-defined',
          'add_core 30 province-id-out-of-range',
          // The scripted effect `claim` uses its `where` as a province id.
          'where 40 province-id-out-of-range',
        ],
      ],
      ['game', 'events/overridden.txt', ['owns 13 province-id-out-of-range']],
      // The lines after the -1 line are not read.
      ['game', 'map/adjacencies.csv', ['to 12 province-id-out-of-range']],
      // 50 is past the map, which the game skips in a continent; -3 it does not.
      ['game', 'map/continent.txt', ['europe -3 province-id-out-of-range']],
      ['game', 'map/default.map', ['sea_starts 8 province-id-not-defined']],
      ['game', 'map/definition.csv', ['red 9 province-colour-out-of-range']],
      // 50 is past the map, which the game skips in the positions file; -2 it does not.
      ['game', 'map/positions.txt', ['positions -2 province-id-out-of-range']],
      // 50 is past the map, which the game skips in a province group; -4 it does not.
      ['game', 'map/provincegroup.txt', ['coast -4 province-id-out-of-range']],
      [
        'game',
        'map/trade_winds.txt',
        ['trade_winds -1 province-id-out-of-range', 'trade_winds 12 province-id-out-of-range'],
      ],
    ]);
    // Five script files, default.map, definition.csv, climate.txt, continent.txt, trade_winds.txt,
    // positions.txt, adjacencies.csv and provincegroup.txt; common/province_names is not read.
    expect(filesChecked).toBe(13);
    const other = findings.find((finding) => finding.file.path === 'events/other.txt');
    const first = other?.diagnostics[0];
    expect(other?.text.slice(first?.start, first?.end)).toBe('12');
  });

  it('reads a file with a UTF-8 byte order mark, as the game does', async () => {
    await addFiles(root, {
      'bom/history/countries/X.txt': '\uFEFFcapital = 50\n',
    });
    const files = playset({ name: 'Bom', root: join(root, 'bom'), replacePaths: [] });
    const ids = await loadProvinceIds(files);
    if (ids === undefined) throw new Error('no map');
    const { findings } = await findScriptValueProblems(files, { ids });
    const bom = findings.find((finding) => finding.file.path === 'history/countries/X.txt');
    expect(bom?.diagnostics.map((d) => `${d.key} ${String('id' in d ? d.id : d.name)}`)).toEqual([
      'capital 50',
    ]);
    expect(bom?.text.slice(bom.diagnostics[0]?.start, bom.diagnostics[0]?.end)).toBe('50');
  });

  it("checks a map's canals against its own river map and the playset's canal bitmaps", async () => {
    await addFiles(root, {
      'game/map/rivers.bmp': bmpHeader(100, 50),
      'game/map/suez_canal_river.bmp': bmpHeader(16, 16),
      'canals/map/default.map':
        'max_provinces = 10\nrivers = "my_rivers.bmp"\n' +
        'canal_definition = { name = "suez_canal" x = 90 y = 10 }\n' +
        'canal_definition = { name = "mine" x = 1 y = 1 }\n' +
        'canal_definition = { name = "lost" x = 1 y = 1 }\n',
      'canals/map/my_rivers.bmp': bmpHeader(200, 50),
      'canals/map/mine_river.bmp': bmpHeader(8, 64),
    });
    const files = playset({ name: 'Canals', root: join(root, 'canals'), replacePaths: [] });
    const ids = await loadProvinceIds(files);
    expect(ids?.canalBitmaps).toEqual({
      rivers: { width: 200, height: 50 },
      riversPath: 'map/my_rivers.bmp',
      canals: new Map([
        ['suez_canal', { width: 16, height: 16 }],
        ['mine', { width: 8, height: 64 }],
        ['lost', null],
      ]),
    });
    if (ids === undefined) throw new Error('no map');
    const { findings } = await findScriptValueProblems(files, { ids });
    const map = findings.find((finding) => finding.file.path === 'map/default.map');
    // Suez fits the mod's wider river map; the mod's own canal is taller than it.
    expect(map?.diagnostics.map((d) => `${d.key} ${d.code}`)).toEqual([
      'y canal-outside-map',
      'name canal-bitmap-missing',
    ]);
    // The game's own default.map has no canals.
    const game = await loadProvinceIds(playset());
    expect(game?.canalBitmaps).toEqual({
      rivers: { width: 100, height: 50 },
      riversPath: 'map/rivers.bmp',
      canals: new Map(),
    });
  });

  it("checks against a map mod's default.map, and its own lists", async () => {
    const files = playset(mapMod(), otherMod());
    const ids = await loadProvinceIds(files);
    if (ids === undefined) throw new Error('no map');
    const { findings } = await findScriptValueProblems(files, { ids });
    const summary = findings.map((finding) => [
      finding.file.path,
      finding.diagnostics.map((d) => `${d.key} ${String('id' in d ? d.id : d.name)} ${d.code}`),
    ]);
    expect(summary).toEqual([
      ['common/scripted_effects/fx.txt', ['fx 25 province-id-out-of-range']],
      ['decisions/shown.txt', ['owns 99 province-id-out-of-range']],
      // 12 is on the big map; events/overridden.txt is the map mod's copy, and 13 is defined.
      [
        'events/other.txt',
        [
          'owns 5 province-id-not-defined',
          'add_core 30 province-id-out-of-range',
          'where 40 province-id-out-of-range',
        ],
      ],
      // The game's adjacencies file: 9 is not in the big map's definitions.
      ['map/adjacencies.csv', ['to 9 province-id-not-defined']],
      // The map mod's definition file, under the name its default.map gives.
      ['map/big.csv', ['province -3 province-id-out-of-range']],
      [
        'map/big_climate.txt',
        ['arctic 14 province-id-not-defined', 'arctic 30 province-id-out-of-range'],
      ],
      ['map/continent.txt', ['europe -3 province-id-out-of-range']],
      [
        'map/default.map',
        ['lakes 15 province-id-not-defined', 'lakes 25 province-id-out-of-range'],
      ],
      ['map/positions.txt', ['positions -2 province-id-out-of-range']],
      ['map/provincegroup.txt', ['coast -4 province-id-out-of-range']],
      // 12 is on the big map.
      ['map/trade_winds.txt', ['trade_winds -1 province-id-out-of-range']],
    ]);
    expect(findings.at(-1)?.file.layer.name).toBe('game');
    expect(findings.at(-2)?.file.layer.name).toBe('game');
    expect(findings.at(-3)?.file.layer.name).toBe('game');
    expect(findings.at(-4)?.file.layer.name).toBe('Big Map');
  });
});
