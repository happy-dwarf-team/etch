// The province view's building slots (etch#605): the playset's rules, the slot sum and the rows
// eu4.exe 1.37.5 lays out, on a small playset and save written here.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameFiles } from '../src/playset/game-files.ts';
import { loadBuildingRules, type BuildingRules } from '../src/playset/building-rules.ts';
import { loadMapAreas } from '../src/playset/map-areas.ts';
import { loadProvinceTerrain } from '../src/playset/province-terrain.ts';
import { buildingSlots, provinceSlots } from '../src/profile/building-slots.ts';
import { SaveChoice, readSavePath } from '../src/profile/save-paths.ts';
import { readSave, type Save } from '../src/save/save.ts';
import type { MapAreas } from '../src/script/map-areas.ts';

const FILES: Record<string, string> = {
  'common/defines.lua': `NDefines = {\nNEconomy = {\n\tMAX_BUILDING_SLOTS = 12, -- most\n\tCOT_BUILDING_SLOTS = 2,\n},\n}\n`,
  'common/buildings/00_buildings.txt': `
temple = { cost = 100 modifier = { local_tax_modifier = 0.4 } }
courthouse = { cost = 100 modifier = { allowed_num_of_buildings = 1 } }
cathedral = { make_obsolete = temple cost = 300 }
manufactory = { cost = 500 }
weapons = { manufactory = { copper iron } }
native_palisade = { government_specific = yes }
`,
  'common/static_modifiers/00_static_modifiers.txt': `
development = { allowed_num_of_buildings = 0.1 }
city = { allowed_num_of_buildings = 2 }
arctic = { allowed_num_of_buildings = -1 }
expanded_infrastructure = { allowed_num_of_buildings = 1 }
`,
  'common/technologies/adm.txt': `
monarch_power = ADM
technology = { temple = yes weapons = yes native_palisade = yes }
technology = { courthouse = yes }
technology = { cathedral = yes }
`,
  'common/event_modifiers/00_event_modifiers.txt': `
big_mod = { allowed_num_of_buildings = 1 }
country_mod = { global_allowed_num_of_buildings = 1 }
`,
  'common/centers_of_trade/00_centers_of_trade.txt': `
port = { level = 3 type = coastal state_modifiers = { allowed_num_of_buildings = 2 } }
hub = { level = 3 type = inland state_modifiers = { allowed_num_of_buildings = 1 } }
`,
  'common/ideas/00_ideas.txt': `
x_ideas = { start = { } bonus = { global_allowed_num_of_buildings = 1 } trigger = { } free = yes
  a = { } b = { global_allowed_num_of_buildings = 1 } }
`,
  'map/default.map': `max_provinces = 4\nsea_starts = { 3 }\n`,
  'map/area.txt': `a_area = { 1 2 }\n`,
  'map/climate.txt': `arctic = { 2 }\n`,
  'map/terrain.txt': `
categories = {
  pti = { }
  ocean = { is_water = yes }
  farmlands = { allowed_num_of_buildings = 1 terrain_override = { 1 } }
  grasslands = { }
  forest = { type = forest }
}
terrain = {
  grasslands = { type = grasslands color = { 0 } }
  forest_12 = { type = forest color = { 12 } }
  ocean = { type = ocean color = { 15 } }
}
tree = { }
`,
  'map/definition.csv': `province;red;green;blue;x;x\n1;10;0;0;a;x\n2;20;0;0;b;x\n3;30;0;0;c;x\n`,
};

const SAVE_TEXT = `EU4txt
date=1719.3.17
player="SWE"
provinces={
-1={
		owner="SWE"
		controller="SWE"
		is_city=yes
		base_tax=5.000
		base_production=4.000
		base_manpower=3.000
		trade_goods=iron
		center_of_trade=3
		expand_infrastructure=1
		buildings={ temple=yes courthouse=yes }
		modifier={
			modifier="big_mod"
			date=-1.1.1
		}
	}
-2={
		owner="DAN"
		controller="DAN"
		base_tax=1.000
		base_production=1.000
		base_manpower=1.000
		trade_goods=grain
		buildings={ temple=yes }
		building_construction={
			building=3
			builder="DAN"
		}
	}
}
countries={
	SWE={
		treasury=1000.000
		graphical_culture="easterngfx"
		technology={ adm_tech=3 dip_tech=3 mil_tech=3 }
		modifier={
			modifier="country_mod"
			date=-1.1.1
		}
		active_idea_groups={ x_ideas=2 }
	}
	DAN={ technology={ adm_tech=3 } }
}
map_area_data{
a_area={
		state={
			area="a_area"
			country_state={
				country="SWE"
			}
		}
	}
}
`;

let folder: string;
let rules: BuildingRules;
let map: MapAreas | undefined;
let save: Save;

/** An uncompressed bitmap, bottom row first as the file stores it: 8-bit indices or 24-bit `[r, g, b]`. */
function bitmap(width: number, rows: readonly (readonly (number | readonly number[])[])[]): Buffer {
  const bits = typeof rows[0]?.[0] === 'number' ? 8 : 24;
  const stride = Math.ceil((width * (bits / 8)) / 4) * 4;
  const palette = bits === 8 ? 1024 : 0;
  const offset = 54 + palette;
  const out = Buffer.alloc(offset + stride * rows.length);
  out.write('BM', 0, 'latin1');
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(offset, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(rows.length, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(bits, 28);
  // Rows as given are top first; the file stores the bottom one first.
  [...rows].reverse().forEach((row, r) => {
    row.forEach((pixel, x) => {
      const at = offset + r * stride + x * (bits / 8);
      if (typeof pixel === 'number') out[at] = pixel;
      else {
        out[at] = pixel[2] ?? 0;
        out[at + 1] = pixel[1] ?? 0;
        out[at + 2] = pixel[0] ?? 0;
      }
    });
  });
  return out;
}

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'etch-slots-'));
  for (const [path, text] of Object.entries(FILES)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text, 'latin1');
  }
  // Province 2: 3 grassland pixels and 2 forest ones, which count twice; province 3 is sea.
  const p1 = [10, 0, 0];
  const p2 = [20, 0, 0];
  const p3 = [30, 0, 0];
  await writeFile(
    join(folder, 'map/provinces.bmp'),
    bitmap(4, [
      [p1, p2, p2, p2],
      [p3, p2, p2, p3],
    ]),
  );
  await writeFile(
    join(folder, 'map/terrain.bmp'),
    bitmap(4, [
      [0, 0, 0, 12],
      [15, 0, 12, 15],
    ]),
  );
  const files = new GameFiles([{ name: 'game', root: folder, replacePaths: [] }]);
  const loaded = await loadBuildingRules(files);
  if (loaded === undefined) throw new Error('no rules');
  rules = loaded;
  map = await loadMapAreas(files);
  save = await readSave(new Uint8Array(Buffer.from(SAVE_TEXT, 'latin1')));
});

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('the building rules', () => {
  it('reads the defines, the buildings in order and what unlocks them', () => {
    expect(rules.maxSlots).toBe(12);
    expect(rules.cotSlots).toBe(2);
    expect(rules.buildings.map((b) => `${String(b.index)} ${b.name}`)).toEqual([
      '1 temple',
      '2 courthouse',
      '3 cathedral',
      '4 manufactory',
      '5 weapons',
      '6 native_palisade',
    ]);
    expect(rules.technology.get('cathedral')).toEqual({ kind: 'adm', level: 2 });
    expect(rules.statics.get('development')).toBe(100);
    // Where a level's coastal and inland centres differ, the inland one.
    expect(rules.cotStateSlots.get(3)).toBe(1000);
  });

  it("picks a province's terrain as the game does: override, then weighted pixels of its kind", async () => {
    const terrain = await loadProvinceTerrain(
      new GameFiles([{ name: 'game', root: folder, replacePaths: [] }]),
    );
    expect(terrain?.category.get(1)).toBe('farmlands');
    // 3 grassland pixels against 2 forest ones counted twice.
    expect(terrain?.category.get(2)).toBe('forest');
    // A sea counts its water pixels only.
    expect(terrain?.category.get(3)).toBe('ocean');
  });
});

describe('the building slots', () => {
  it('adds up the province and the owner apart, in thousandths', () => {
    // 1.2 development, 2 city, 1 farmlands, 1 courthouse, 1 infrastructure, 1 modifier, 1 the
    // state's center of trade; the owner: 1 modifier, 1 idea and 1 the ideas' bonus.
    expect(provinceSlots(save, 1, rules, map)).toEqual({
      province: 8200,
      country: 3000,
      allowed: 10,
      cap: 10,
      requiredDevelopment: 20,
    });
  });

  it('lays out the built buildings, the free slots, and canbuild for the viewer', () => {
    const rows = buildingSlots(save, 1, 'SWE', rules, map);
    expect(rows.map((r) => `${r.kind} ${r.building ?? ''}`.trim())).toEqual([
      'built temple',
      'built courthouse',
      ...Array<string>(8).fill('empty'),
    ]);
    // The temple has its cathedral unlocked; the courthouse has no upgrade.
    expect(rows.map((r) => r.canbuild)).toEqual([true, false, ...Array<boolean>(8).fill(true)]);
    expect(rows.map((r) => r.destroy)).toEqual([true, true, ...Array<boolean>(8).fill(false)]);
  });

  it("shows a foreign province's construction and locked slot, without canbuild", () => {
    const rows = buildingSlots(save, 2, 'SWE', rules, map);
    expect(rows).toEqual([
      { kind: 'construction', building: 'cathedral', canbuild: false, destroy: false },
      { kind: 'built', building: 'temple', canbuild: false, destroy: false },
      { kind: 'locked', canbuild: false, destroy: false, requiredDevelopment: 20 },
    ]);
  });

  it('is a save collection with the fields a repeater reads', () => {
    const choice = new SaveChoice(save, 'SWE', 1, { buildings: rules, map });
    const from = readSavePath('provinces.{province}.building_slots', { collection: true });
    if ('problem' in from) throw new Error(from.problem);
    const entries = choice.entries(from) ?? [];
    expect(entries).toHaveLength(10);
    const field = (row: number, key: string) => {
      const path = readSavePath(`entry.${key}`, { entry: true });
      if ('problem' in path) throw new Error(path.problem);
      return choice.value(path, entries[row]);
    };
    expect(field(0, 'sprite')).toBe('GFX_temple');
    expect(field(0, 'culture_sprite')).toBe('GFX_temple_easterngfx');
    expect(field(0, 'canbuild')).toBe('yes');
    expect(field(9, 'kind')).toBe('empty');
    // Without the rules, the profile's count stays.
    expect(new SaveChoice(save, 'SWE', 1).entries(from)).toBeUndefined();
  });
});
