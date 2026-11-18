// The save paths of window profiles (spec v2 section 14): what `SaveChoice` reads for each scope,
// the meta values, and the entries of a repeater's collection.
import { describe, expect, it } from 'vitest';
import { SaveChoice, readSavePath, type SavePath } from '../src/profile/index.ts';
import { readSave, type Save } from '../src/save/index.ts';

const SAVE_TEXT = `EU4txt
date=1444.11.11
player="SWE"
displayed_country_name="Kingdom of Sweden"
provinces={
-1={
		name="Stockholm"
		owner="SWE"
		cores={ "SWE" "DAN" }
		buildings={ temple=yes marketplace=no }
	}
-2={
		name="Uncharted"
	}
}
countries={
	SWE={ capital=1 subjects={ norway={ tag="NOR" since=1440.1.1 } } }
}
`;

async function save(): Promise<Save> {
  return readSave(new Uint8Array(Buffer.from(SAVE_TEXT, 'latin1')));
}

function path(text: string, options: { collection?: boolean; entry?: boolean } = {}): SavePath {
  const read = readSavePath(text, options);
  if ('problem' in read) throw new Error(read.problem);
  return read;
}

function problem(text: string, options: { collection?: boolean; entry?: boolean } = {}): string {
  const read = readSavePath(text, options);
  return 'problem' in read ? read.problem : '';
}

describe('SaveChoice', () => {
  it('reads the meta values the save writes, and nothing else of meta', async () => {
    const choice = new SaveChoice(await save(), 'SWE', 1);
    expect(choice.value(path('meta.date'))).toBe('1444.11.11');
    expect(choice.value(path('meta.player'))).toBe('SWE');
    expect(choice.value(path('meta.displayed_country_name'))).toBe('Kingdom of Sweden');
    // A path readSavePath does not give; meta has no collections either.
    expect(choice.value({ scope: 'meta', key: 'speed', collection: false })).toBeUndefined();
    expect(choice.entries({ scope: 'meta', key: 'date', collection: true })).toBeUndefined();
  });

  it('reads the province, its owner and the country, and remembers the blocks', async () => {
    const choice = new SaveChoice(await save(), 'SWE', 1);
    expect(choice.owner).toBe('SWE');
    expect(choice.value(path('provinces.{province}.name'))).toBe('Stockholm');
    expect(choice.value(path('countries.{owner}.capital'))).toBe('1');
    expect(choice.value(path('countries.{country}.capital'))).toBe('1');
    expect(choice.block('country')).toBe(choice.block('country'));
  });

  it('has no owner, owner block or country block where the save has none', async () => {
    const uncolonised = new SaveChoice(await save(), undefined, 2);
    expect(uncolonised.owner).toBeUndefined();
    expect(uncolonised.block('owner')).toBeUndefined();
    expect(uncolonised.value(path('countries.{owner}.capital'))).toBeUndefined();
    expect(uncolonised.value(path('countries.{country}.capital'))).toBeUndefined();
    expect(uncolonised.entries(path('countries.{country}.subjects', { collection: true }))).toBe(
      undefined,
    );
    const nowhere = new SaveChoice(await save(), 'SWE', undefined);
    expect(nowhere.owner).toBeUndefined();
    expect(nowhere.value(path('provinces.{province}.name'))).toBeUndefined();
  });

  it("gives a collection's entries, keyed, bare or blocks, and their entry fields", async () => {
    const choice = new SaveChoice(await save(), 'SWE', 1);
    const field = (text: string) => path(text, { entry: true });

    const cores = choice.entries(path('provinces.{province}.cores', { collection: true })) ?? [];
    expect(cores.map((e) => choice.value(field('entry'), e))).toEqual(['SWE', 'DAN']);
    expect(cores.map((e) => choice.value(field('entry.key'), e))).toEqual([undefined, undefined]);

    const buildings =
      choice.entries(path('provinces.{province}.buildings', { collection: true })) ?? [];
    // `self` is the key of a `key=yes` entry, else its value.
    expect(buildings.map((e) => choice.value(field('entry'), e))).toEqual(['temple', 'no']);
    expect(buildings.map((e) => choice.value(field('entry.value'), e))).toEqual(['yes', 'no']);
    expect(buildings.map((e) => choice.value(field('entry.tag'), e))).toEqual([
      undefined,
      undefined,
    ]);

    const subjects =
      choice.entries(path('countries.{country}.subjects', { collection: true })) ?? [];
    expect(subjects.map((e) => choice.value(field('entry.key'), e))).toEqual(['norway']);
    expect(subjects.map((e) => choice.value(field('entry.tag'), e))).toEqual(['NOR']);
    // A block entry has no value of its own: `self` falls back to its key.
    expect(subjects.map((e) => choice.value(field('entry'), e))).toEqual(['norway']);

    // An entry path without an entry, and a collection the save writes as a value or not at all.
    expect(choice.value(field('entry.tag'))).toBeUndefined();
    expect(choice.entries(path('countries.{country}.allies', { collection: true }))).toBe(
      undefined,
    );
    expect(choice.entries({ scope: 'country', key: 'capital', collection: true })).toBe(undefined);
    expect(choice.entries({ scope: 'entry', key: 'self' })).toBeUndefined();
  });
});

describe('readSavePath', () => {
  it('reads entry paths only where a repeater field allows them', () => {
    expect(readSavePath('entry', { entry: true })).toEqual({ scope: 'entry', key: 'self' });
    expect(readSavePath(' entry.tag ', { entry: true })).toEqual({ scope: 'entry', key: 'tag' });
    for (const bad of ['entry.', 'entry.a.b']) {
      expect(readSavePath(bad, { entry: true })).toEqual({
        problem: `"${bad}" is entry, entry.key, entry.value or entry.<key>.`,
      });
    }
    expect(problem('entry.tag')).toMatch(/^"entry\.tag" is not a save path Etch reads: .*meta\.$/);
    expect(problem('nothing', { entry: true })).toMatch(/, or entry\.$/);
  });

  it('names the known values or collections of a scope it does not know a key of', () => {
    expect(problem('meta.speed')).toMatch(
      /^Etch reads no value "speed" of meta; .* Known: date, player, displayed_country_name\.$/,
    );
    expect(problem('meta.date', { collection: true })).toMatch(
      /^Etch reads no collection "date" of meta; .* Known: none\.$/,
    );
  });
});
