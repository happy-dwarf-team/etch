// The preview's sample data state (spec section 5): reading a save off the render path, choosing
// its country and province, the picks' lists, `Data ▾` and the playset check.
import { describe, expect, it, vi } from 'vitest';
import { PreviewData, modsMismatch } from '../src/preview/data.ts';

const SAVE = `EU4txt
date=1444.11.11
player="SWE"
displayed_country_name="Sweden"
mods_enabled_names={
	{
		filename="mod/ugc_1.mod"
		name="Proper 2K UI Enhanced"
	}
}
provinces={
-1={
		name="Stockholm"
		owner="SWE"
		controller="SWE"
	}
-2={
		name="Kalmar"
		owner="DAN"
		controller="SWE"
	}
-3={
		name="Uncharted"
	}
}
countries={
	DAN={ capital=2 owned_provinces={ 2 } }
	SWE={ capital=1 owned_provinces={ 1 } }
}
`;

const bytes = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'latin1'));

const LOC: Record<string, string> = { SWE: 'Sweden', DAN: 'Denmark', PROV1: 'Stockholm' };
const localise = (key: string): string | undefined => LOC[key];

function data(files: Record<string, string>): {
  data: PreviewData;
  changed: ReturnType<typeof vi.fn>;
} {
  const changed = vi.fn();
  const read = (path: string): Promise<Uint8Array> => {
    const text = files[path];
    return text === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(bytes(text));
  };
  return { data: new PreviewData({ changed }, read), changed };
}

describe('PreviewData', () => {
  it('starts with no save: generated text, the files layer on', () => {
    const { data: d } = data({});
    const menu = d.menu(undefined, [], localise);
    expect(menu.label).toBe('Data: generated, typical');
    expect(menu.save).toEqual({ state: 'none' });
    expect(menu.layers.map((l) => [l.id, l.on, l.canToggle])).toEqual([
      ['hand', true, false],
      ['live', true, true],
      ['save', false, false],
      ['files', true, false],
      ['generated', true, false],
    ]);
    expect(d.facts()).toEqual({});
  });

  it('reads a save on its player and capital, and tells the preview twice', async () => {
    const { data: d, changed } = data({ 'a.eu4': SAVE });
    const keyBefore = d.key;
    const opening = d.open('a.eu4');
    expect(d.menu(undefined, [], localise).save).toEqual({ state: 'loading', name: 'a.eu4' });
    await opening;
    expect(changed).toHaveBeenCalledTimes(2);
    expect(d.choice?.country).toBe('SWE');
    expect(d.choice?.province).toBe(1);
    expect(d.key).not.toBe(keyBefore);
    expect(d.facts()).toMatchObject({ 'province.ownedByPlayer': 'yes' });
    const menu = d.menu(undefined, ['Proper 2K UI Enhanced'], localise);
    expect(menu.save).toEqual({
      state: 'ready',
      name: 'a.eu4',
      date: '1444.11.11',
      country: 'Sweden',
      province: 'Stockholm',
    });
    expect(menu.label).toBe('Data: Stockholm · 1444.11.11');
  });

  it('chooses another province or country, and lists them for a pick', async () => {
    const { data: d } = data({ 'a.eu4': SAVE });
    await d.open('a.eu4');
    d.chooseProvince(2);
    expect(d.facts()).toMatchObject({ 'province.ownedByPlayer': 'no', 'province.occupied': 'yes' });
    d.chooseCountry('DAN');
    expect(d.facts()).toMatchObject({ 'province.ownedByPlayer': 'yes' });
    // Not in the save: nothing changes.
    d.chooseProvince(99);
    expect(d.choice?.province).toBe(2);
    expect(d.countries(localise).map((c) => [c.tag, c.label])).toEqual([
      ['DAN', 'Denmark'],
      ['SWE', 'Sweden'],
    ]);
    expect(d.countries(localise)[1]?.detail).toBe("SWE · the save's player");
    expect(d.provinces(localise).map((p) => [p.id, p.label, p.own])).toEqual([
      [2, 'Province 2', true],
      [1, 'Stockholm', false],
      [3, 'Province 3', false],
    ]);
  });

  it('names a save it cannot read: a binary (ironman) one, a missing file', async () => {
    const { data: d } = data({ 'iron.eu4': 'EU4bin\u0001\u0000' });
    await d.open('iron.eu4');
    const menu = d.menu(undefined, [], localise);
    expect(menu.save.state).toBe('failed');
    expect(menu.save.problem).toMatch(/ironman/);
    expect(menu.layers.find((l) => l.id === 'save')?.detail).toMatch(/ironman/);
    await d.open('gone.eu4');
    expect(d.menu(undefined, [], localise).save.problem).toMatch(/cannot be read: ENOENT/);
  });

  it('drops a save, and a save chosen while another is read wins', async () => {
    const { data: d } = data({ 'a.eu4': SAVE, 'b.eu4': SAVE.replace('Stockholm', 'Uppsala') });
    const first = d.open('a.eu4');
    const second = d.open('b.eu4');
    await Promise.all([first, second]);
    expect(d.path).toBe('b.eu4');
    expect(d.menu(undefined, [], localise).save.province).toBe('Uppsala');
    d.drop();
    expect(d.path).toBeUndefined();
    expect(d.choice).toBeUndefined();
  });

  it("counts the texts each layer fills from the sample data's counts", () => {
    const { data: d } = data({});
    const sample = {
      text: () => undefined,
      rows: () => undefined,
      state: () => undefined,
      counts: { hand: 1, live: 0, save: 0, files: 2, generated: 5 },
      lists: [
        {
          id: 'provinceview/**/units',
          list: 'units',
          template: 'unit',
          count: 4,
          bySet: false,
          layer: 'generated' as const,
          drawn: true,
        },
        {
          id: 'provinceview/**/hidden',
          list: 'hidden',
          template: 'entry',
          count: 2,
          bySet: true,
          layer: 'save' as const,
          drawn: false,
        },
      ],
    };
    const menu = d.menu(sample, [], localise);
    expect(menu.layers.map((l) => l.count)).toEqual([1, 0, 0, 2, 5]);
    expect(menu.layers[0]).toMatchObject({ id: 'hand', label: 'By hand', on: true });
    // Only the lists the view draws, with where their number comes from.
    expect(menu.lists).toEqual([
      {
        id: 'provinceview/**/units',
        label: 'units (unit)',
        count: 4,
        bySet: false,
        detail: 'generated',
      },
    ]);
  });

  it('keeps the texts typed by hand by window, and sets the number of entries of a list', () => {
    let kept: unknown;
    const changed = vi.fn();
    const store = {
      get: () => ({ provinceview: { 'provinceview/a': 'Kept' } }),
      set: (texts: unknown) => {
        kept = texts;
      },
    };
    const d = new PreviewData({ changed }, () => Promise.reject(new Error('none')), store);
    expect(d.handTexts('ProvinceView').text('PROVINCEVIEW/A')).toBe('Kept');
    d.setHandText('provinceview', 'provinceview/b', 'Typed');
    expect(kept).toEqual({
      provinceview: { 'provinceview/a': 'Kept', 'provinceview/b': 'Typed' },
    });
    d.setHandText('provinceview', 'provinceview/A', undefined);
    expect(d.handText('provinceview', 'provinceview/a')).toBeUndefined();
    d.clearHand('provinceview');
    expect(kept).toEqual({});
    expect(d.handTexts('topbar').text('topbar/x')).toBeUndefined();

    expect(d.entryCounts('provinceview')('list')).toBeUndefined();
    d.setEntries('provinceview', 'list', 7);
    expect(d.entryCounts('PROVINCEVIEW')('list')).toBe(7);
    d.setEntries('provinceview', 'list', 1000);
    expect(d.entryCounts('provinceview')('list')).toBe(100);
    d.setEntries('provinceview', 'list', undefined);
    expect(d.entryCounts('provinceview')('list')).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(6);
  });
});

describe('modsMismatch', () => {
  it("says how the save's mods differ from the playset's, by name without case", () => {
    expect(modsMismatch(['Anbennar', 'P2KE'], ['anbennar', 'p2ke'])).toBeUndefined();
    expect(modsMismatch(['Anbennar'], ['Anbennar', 'P2KE Patch - Anbennar'])).toBe(
      'This save was made without P2KE Patch - Anbennar; values the playset lacks fall through.',
    );
    expect(modsMismatch(['A', 'B', 'C', 'D', 'E'], [])).toBe(
      'This save was made with A, B, C and 2 more; values the playset lacks fall through.',
    );
  });
});
