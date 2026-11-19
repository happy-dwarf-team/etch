// The province id checks on entries that are not `key = value`: anonymous blocks, bare values, a
// key without a value, and short lines of the adjacencies file.
import { describe, expect, it } from 'vitest';
import {
  checkAdjacencies,
  checkProvinceIds,
  parseDefaultMap,
  parseScript,
  readScriptedProvinceArguments,
  type ProvinceIds,
} from '../src/index.ts';

const IDS: ProvinceIds = { maxProvinces: 100, maxSource: 'map/default.map of the game' };

describe('province ids in entries other than key = value', () => {
  it('looks into anonymous blocks and skips bare values and keys without a value', () => {
    const text = [
      'e = {',
      '  immediate = {',
      '    { add_core = 500 { owns = 600 } }',
      '    FRA 12',
      '    add_core =',
      '    every_owned_province = { limit = { } 700 = { } }',
      '  }',
      '}',
    ].join('\n');
    const found = checkProvinceIds(parseScript(text), IDS).map((d) => `${d.key} ${String(d.id)}`);
    expect(found).toEqual(['add_core 500', 'owns 600', 'every_owned_province 700']);
  });

  it("reads a scripted call's province arguments through anonymous blocks", () => {
    const effects = parseScript(
      [
        'flag = yes',
        'with_block = { { add_core = $where$ } owner = }',
        'no_province = { set_country_flag = $flag$ }',
        'passes = { with_block = { where = $target$ } no_province = { flag = $x$ } }',
      ].join('\n'),
    );
    const args = readScriptedProvinceArguments([effects]);
    expect([...args].map(([name, set]) => `${name}: ${[...set].join(',')}`)).toEqual([
      'with_block: where',
      'passes: target',
    ]);
  });

  it("skips default.map's bare values and keys without a value", () => {
    const map = parseDefaultMap('max_provinces = 10\nstray\ndefinitions =\nsea_starts = { 3 4 }\n');
    expect(map.maxProvinces).toBe(10);
    expect(map.definitions).toBe('definition.csv');
  });

  it('reads a missing or non-numeric To of an adjacency as 0, which it does not check', () => {
    const text = ['From;To;Type;Through', '5;x;land;-1', '6', '7;;sea;', '8;300;sea;400'].join(
      '\n',
    );
    expect(checkAdjacencies(text, IDS).map((d) => `${d.key} ${String(d.id)}`)).toEqual([
      'to 300',
      'through 400',
    ]);
  });
});
