import { describe, expect, it } from 'vitest';
import {
  Localisation,
  checkProvinceIds,
  parseScript,
  provinceIdsIn,
  readScriptedProvinceArguments,
  type ProvinceIds,
} from '../src/index.ts';
import { keepLocalisationKeys } from '../src/playset/localisation.ts';

/** The province ids of a text, as `key id` with the id's text at its range. */
function uses(
  text: string,
  path?: string,
  calls?: ReturnType<typeof readScriptedProvinceArguments>,
): string[] {
  return provinceIdsIn(parseScript(text), path, calls).map(
    (use) => `${use.key} ${String(use.id)} ${text.slice(use.start, use.end)}`,
  );
}

describe('provinceIdsIn', () => {
  it('lists the values of province keys and the keys of province scopes, not tags or flags', () => {
    const text = [
      'e.1 = {',
      '  trigger = { owns = 151 is_core = TUR }',
      '  immediate = { add_core = 151 add_core = FRA capital = yes 1234 = { add_base_tax = 1 } }',
      '}',
    ].join('\n');
    expect(uses(text, 'events/e.txt')).toEqual([
      'owns 151 151',
      'add_core 151 151',
      'immediate 1234 1234',
    ]);
  });

  it('lists every id the check reads, also the ids the map has', () => {
    const text = 'e.1 = { trigger = { owns = 151 owns = 5075 } }';
    const ids: ProvinceIds = { maxProvinces: 4942, maxSource: 'map/default.map of the game' };
    expect(uses(text, 'events/e.txt').map((use) => use.split(' ')[1])).toEqual(['151', '5075']);
    expect(checkProvinceIds(parseScript(text), ids, 'events/e.txt').map((d) => d.id)).toEqual([
      5075,
    ]);
  });

  it("reads a scripted call's province arguments and a folder's province lists", () => {
    const effects = parseScript('give_province = { $province$ = { add_core = ROOT } }');
    const calls = readScriptedProvinceArguments([effects]);
    expect(
      uses('e.1 = { immediate = { give_province = { province = 151 } } }', 'events/e.txt', calls),
    ).toEqual(['province 151 151']);
    expect(
      uses('my_region = { provinces = { 151 152 } }', 'common/colonial_regions/00_regions.txt'),
    ).toEqual(['provinces 151 151', 'provinces 152 152']);
  });

  it('takes a negative value of a key, as the check does, but no negative scope', () => {
    expect(
      uses('e.1 = { trigger = { owns = -1 } immediate = { -2 = { } } }', 'events/e.txt'),
    ).toEqual(['owns -1 -1']);
  });
});

describe('keepLocalisationKeys', () => {
  it('keeps the header and the matching keys, so that the localisation holds only those', () => {
    const text = [
      '\uFEFFl_english:',
      ' # The provinces',
      ' PROV151:0 "Constantinople"',
      ' PROV151_desc:0 "A city"',
      ' ETCH_TITLE:0 "The Etch window"',
      '',
    ].join('\n');
    const kept = keepLocalisationKeys(text, /^PROV\d+$/);
    expect(kept.split('\n')).toEqual([
      '\uFEFFl_english:',
      ' # The provinces',
      ' PROV151:0 "Constantinople"',
      '',
    ]);
    const localisation = Localisation.load('english', [
      { path: 'localisation/prov_names_l_english.yml', layer: 0, text: kept, bom: true },
    ]);
    expect(localisation.get('PROV151')).toBe('Constantinople');
    expect(localisation.get('ETCH_TITLE')).toBeUndefined();
    expect(localisation.size).toBe(1);
  });
});
