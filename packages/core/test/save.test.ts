// The save reader (spec section 5, etch#154) on small saves written here: both text forms, the
// binary form refused, the index of countries and provinces, escapes and strings over lines, and
// the player's profile name never read.
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/index.ts';
import {
  SaveReadError,
  indexSave,
  readSave,
  scalarIn,
  valueIn,
  type Save,
} from '../src/save/index.ts';

const META = `date=1444.11.11
save_game="test.eu4"
player="A33"
displayed_country_name="Verne"
savegame_version={
	first=1
	second=37
	third=5
	forth=0
	name="Inca"
}
mods_enabled_names={
	{
		filename="mod/ugc_1385440355.mod"
		name="Anbennar: A Fantasy Total Conversion"
	}
 {
		filename="mod/ugc_3290499798.mod"
		name="Proper 2K UI Enhanced"
	}
}
multi_player=no
`;

const GAMESTATE = `date=1444.11.11
player="A33"
players_countries={
	"Some Profile Name"
	"A33"
}
flags={
	countries={ not_this={ a=1 } }
}
provinces={
-1={
		name="Stockholm \\"the \\\\ fair\\" }
upon two lines"
		owner="SWE"
		base_tax=3.000
		buildings={
			temple=yes
		}
	}
-2={
		name="Kalmar"
		owner="A33"
		great_projects={
			"kalmar_castle"
		}
	}
}
countries={
	---={
		name="---"
	}
	A33={
		treasury=54.968
		capital=51
	}
}
`;

/** A zip of the entries, stored or deflated as given. */
function zip(entries: readonly { name: string; text: string; stored?: boolean }[]): Uint8Array {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = Buffer.from(entry.text, 'latin1');
    const data = entry.stored === true ? raw : deflateRawSync(raw);
    const name = Buffer.from(entry.name, 'latin1');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.stored === true ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.stored === true ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    parts.push(local, name, data);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const size = directory.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, ...directory, end]));
}

const latin1 = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'));

const zipped = (): Uint8Array =>
  zip([
    { name: 'meta', text: `EU4txt\n${META}` },
    { name: 'gamestate', text: `EU4txt\n${GAMESTATE}` },
    { name: 'ai', text: 'EU4txt\nai={}', stored: true },
  ]);

const plain = (): Uint8Array =>
  latin1(`EU4txt\n${META}${GAMESTATE.replace(/^date=.*\nplayer=.*\n/, '')}`);

function checkContent(save: Save): void {
  expect(save.countries).toEqual(['---', 'A33']);
  expect(save.provinces).toEqual([1, 2]);
  expect(scalarIn(save.country('A33') ?? fail(), 'treasury')).toBe('54.968');
  const stockholm = save.province(1) ?? fail();
  expect(scalarIn(stockholm, 'name')).toBe('Stockholm "the \\ fair" }\nupon two lines');
  expect(scalarIn(stockholm, 'base_tax')).toBe('3.000');
  expect(valueIn(stockholm, 'buildings')?.kind).toBe('block');
  expect(scalarIn(save.province(2) ?? fail(), 'owner')).toBe('A33');
  expect(save.province(3)).toBeUndefined();
  expect(save.country('SWE')).toBeUndefined();
  // A `countries` block below the top level is not the countries.
  expect(save.country('not_this')).toBeUndefined();
}

function fail(): never {
  throw new Error('missing');
}

describe('readSave', () => {
  it('reads a zipped text save: meta from its entry, blocks from the gamestate', async () => {
    const save = await readSave(zipped());
    expect(save.form).toBe('zip');
    expect(save.meta).toEqual({
      date: '1444.11.11',
      player: 'A33',
      displayedCountryName: 'Verne',
      version: '1.37.5.0',
      multiplayer: false,
      mods: ['Anbennar: A Fantasy Total Conversion', 'Proper 2K UI Enhanced'],
    });
    checkContent(save);
    expect(save.top('date')).toMatchObject({ kind: 'scalar', text: '1444.11.11' });
  });

  it('reads a plain text save, an autosave: meta from the top level', async () => {
    const save = await readSave(plain());
    expect(save.form).toBe('plain');
    expect(save.meta.player).toBe('A33');
    expect(save.meta.version).toBe('1.37.5.0');
    expect(save.meta.mods).toHaveLength(2);
    checkContent(save);
  });

  it('gives the same index however often it yields to the event loop', async () => {
    const save = await readSave(plain(), { step: 7 });
    checkContent(save);
  });

  it('never reads players_countries, which holds the player’s profile name', async () => {
    for (const bytes of [zipped(), plain()]) {
      const save = await readSave(bytes);
      expect(save.index.top.has('players_countries')).toBe(false);
      expect(save.top('players_countries')).toBeUndefined();
      const kept = JSON.stringify({
        meta: save.meta,
        top: [...save.index.top.keys()].map((key) => save.top(key)),
        countries: save.countries.map((tag) => save.country(tag)),
        provinces: save.provinces.map((id) => save.province(id)),
      });
      expect(kept).not.toContain('Some Profile Name');
    }
  });

  it('refuses a binary save, plain or zipped, before inflating its gamestate', async () => {
    const binary = latin1('EU4bin\u0001\u0000\u0003\u0000');
    await expect(readSave(binary)).rejects.toMatchObject({ problem: 'binary' });
    const zipBinary = zip([
      { name: 'meta', text: 'EU4bin\u0001\u0000' },
      // Not deflate data: it would fail to inflate if it were read.
      { name: 'gamestate', text: 'not inflated', stored: true },
    ]);
    const error = await readSave(zipBinary).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SaveReadError);
    expect((error as SaveReadError).problem).toBe('binary');
    expect((error as Error).message).toMatch(/ironman/);
  });

  it('names a file that is not a save, and a damaged zip', async () => {
    await expect(readSave(latin1('{ "json": true }'))).rejects.toMatchObject({
      problem: 'not-a-save',
    });
    await expect(readSave(zip([{ name: 'readme', text: 'x' }]))).rejects.toMatchObject({
      problem: 'not-a-save',
    });
    const cut = zipped().subarray(0, 40);
    await expect(readSave(cut)).rejects.toMatchObject({ problem: 'damaged' });
  });
});

describe('indexSave', () => {
  it('records each top-level entry with its key, duplicates kept, and runs an unclosed block to the end', async () => {
    const text = 'a=1\nb={ x=1 }\na="two"\nprovinces={\n-5={ name="Open"';
    const bytes = latin1(text);
    const index = await indexSave(bytes);
    const slices = (key: string) =>
      (index.top.get(key) ?? []).map((r) => text.slice(r.start, r.end));
    expect(slices('a')).toEqual(['a=1', 'a="two"']);
    expect(slices('b')).toEqual(['b={ x=1 }']);
    const five = index.provinces.get(5);
    expect(five && text.slice(five.start, five.end)).toBe('-5={ name="Open"');
  });

  it('stops when its signal aborts', async () => {
    const controller = new AbortController();
    controller.abort(new Error('another save'));
    await expect(indexSave(plain(), { signal: controller.signal, step: 8 })).rejects.toThrow(
      'another save',
    );
  });
});

describe('parseScript of a save', () => {
  it('reads escapes and strings over several lines only in a save', () => {
    const text = 'name="a \\"b\\" c\nd"\nnext=1';
    const save = parseScript(text, { save: true });
    expect(save.diagnostics).toEqual([]);
    expect(save.entries).toHaveLength(2);
    expect(save.entries[0]).toMatchObject({ value: { text: 'a "b" c\nd', quoted: true } });
    // An interface file ends a string at its line.
    expect(parseScript(text).diagnostics.map((d) => d.code)).toContain('unterminated-string');
  });

  it('keeps a backslash that escapes nothing, as in a path', () => {
    const save = parseScript('path="gfx\\interface\\x.dds"', { save: true });
    expect(save.entries[0]).toMatchObject({ value: { text: 'gfx\\interface\\x.dds' } });
  });
});
