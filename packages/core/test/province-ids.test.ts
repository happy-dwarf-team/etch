import { describe, expect, it } from 'vitest';
import {
  PROVINCE_ID_KEYS,
  checkDefaultMap,
  checkProvinceIds,
  isProvinceIdScriptPath,
  parseDefaultMap,
  parseProvinceDefinitions,
  parseScript,
  readScriptedProvinceArguments,
  type ProvinceIds,
} from '../src/index.ts';

const VANILLA: ProvinceIds = { maxProvinces: 4942, maxSource: 'map/default.map of the game' };

/** The ids a text's warnings are about, with their keys, as `key id code`. */
function found(text: string, ids: ProvinceIds = VANILLA, path?: string): string[] {
  return checkProvinceIds(parseScript(text), ids, path).map(
    (d) => `${d.key} ${String(d.id)} ${d.code}`,
  );
}

describe('checkProvinceIds', () => {
  it('flags a trigger, an effect and a property whose integer is past max_provinces', () => {
    const text = [
      'e.1 = {',
      '  trigger = { owns = 5075 owns = 4941 }',
      '  immediate = { add_core = 4942 add_core = FRA capital = yes }',
      '  goto = 6000',
      '}',
    ].join('\n');
    expect(found(text)).toEqual([
      'owns 5075 province-id-out-of-range',
      'add_core 4942 province-id-out-of-range',
      'goto 6000 province-id-out-of-range',
    ]);
  });

  it('gives the range of the id and a message naming the map file', () => {
    const text = 'e = { trigger = { province_id = 5075 } }';
    const [diagnostic] = checkProvinceIds(parseScript(text), VANILLA);
    expect(diagnostic).toBeDefined();
    expect(text.slice(diagnostic?.start, diagnostic?.end)).toBe('5075');
    expect(diagnostic?.severity).toBe('warning');
    expect(diagnostic?.message).toContain('map/default.map of the game sets max_provinces = 4942');
    expect(diagnostic?.message).toContain('from 1 to 4941');
  });

  it('flags province 0', () => {
    expect(found('e = { trigger = { owns = 0 } }')).toEqual(['owns 0 province-id-out-of-range']);
  });

  it('flags a negative id, which the game reads with its sign', () => {
    expect(found('e = { trigger = { owns = -1 } immediate = { add_core = -12 } }')).toEqual([
      'owns -1 province-id-out-of-range',
      'add_core -12 province-id-out-of-range',
    ]);
  });

  it('leaves a negative integer key alone: no one knows how the game reads it', () => {
    expect(found('e = { immediate = { -5 = { add_core = ROOT } } }')).toEqual([]);
  });

  it("checks province_distance's who and trading_policy_in_node's node", () => {
    const text = [
      'e = { trigger = {',
      '  province_distance = { who = 5075 distance = 9000 }',
      '  province_distance = { who = FROM distance = 150 }',
      '  trading_policy_in_node = { node = 6000 policy = trade_policy_x }',
      '  trading_policy_in_node = { node = 1 policy = trade_policy_x }',
      '  opinion = { who = 5075 value = 10 }',
      '} }',
    ].join('\n');
    expect(found(text)).toEqual([
      'who 5075 province-id-out-of-range',
      'node 6000 province-id-out-of-range',
    ]);
  });

  it('reads keys without regard to case', () => {
    expect(found('e = { trigger = { OWNS = 5075 } }')).toEqual([
      'owns 5075 province-id-out-of-range',
    ]);
  });

  it('flags a province scope, under the key of the block it is in', () => {
    const text = 'e = { immediate = { 5075 = { add_core = ROOT } 151 = { add_core = ROOT } } }';
    expect(found(text)).toEqual(['immediate 5075 province-id-out-of-range']);
  });

  it("leaves random_list's weights alone", () => {
    const text = 'e = { immediate = { random_list = { 5000 = { add_prestige = 1 } 10 = { } } } }';
    expect(found(text)).toEqual([]);
  });

  it("checks a trigger_switch's keys only when on_trigger takes a province id", () => {
    const provinces = 'e = { immediate = { trigger_switch = { on_trigger = owns 5075 = { } } } }';
    expect(found(provinces)).toEqual(['trigger_switch 5075 province-id-out-of-range']);
    const flags =
      'e = { immediate = { trigger_switch = { on_trigger = num_of_cities 5075 = { } } } }';
    expect(found(flags)).toEqual([]);
  });

  it('leaves the top level, and the properties of a common database entry, alone', () => {
    expect(found('5075 = { }')).toEqual([]);
    const incident = 'incident_x = { 0 = { factor = 1 } 5075 = { factor = 2 } }';
    expect(found(incident, VANILLA, 'common/imperial_incidents/00_x.txt')).toEqual([]);
    const reward = 'incident_x = { effect = { 5075 = { add_base_tax = 1 } } }';
    expect(found(reward, VANILLA, 'common/imperial_incidents/00_x.txt')).toEqual([
      'effect 5075 province-id-out-of-range',
    ]);
  });

  it('checks a scripted effect’s own body', () => {
    const text = 'my_effect = { 5075 = { add_core = ROOT } }';
    expect(found(text, VANILLA, 'common/scripted_effects/my.txt')).toEqual([
      'my_effect 5075 province-id-out-of-range',
    ]);
    expect(found(text, VANILLA, 'events/my.txt')).toEqual([
      'my_effect 5075 province-id-out-of-range',
    ]);
  });

  it('skips quoted keys, dates, variables and non-integers', () => {
    const text = [
      'e = {',
      '  "5075" = { }',
      '  1444.11.11 = { }',
      '  trigger = { owns = $province$ owns = 5075.5 owns = -1.5 }',
      '}',
    ].join('\n');
    expect(found(text)).toEqual([]);
  });

  it('flags an id below max_provinces that definition.csv does not list', () => {
    const ids: ProvinceIds = {
      ...VANILLA,
      defined: new Set([1, 2, 151]),
      definedSource: 'map/definition.csv of My Mod',
    };
    const [diagnostic, ...rest] = checkProvinceIds(
      parseScript('e = { trigger = { owns = 151 owns = 3 } }'),
      ids,
    );
    expect(rest).toEqual([]);
    expect(diagnostic?.code).toBe('province-id-not-defined');
    expect(diagnostic?.id).toBe(3);
    expect(diagnostic?.message).toBe(
      'Province 3 is not in map/definition.csv of My Mod, so the map has no such province.',
    );
  });

  it("checks a scripted call's arguments that its body uses as province ids", () => {
    const ids: ProvinceIds = {
      ...VANILLA,
      calls: new Map([['give_claims', new Set(['id', 'province'])]]),
    };
    const text = [
      'e = {',
      '  immediate = {',
      '    give_claims = { id = 5075 }',
      '    Give_Claims = { Province = 6000 tag = ROOT }',
      '    give_claims = { id = 151 region = 5075 }',
      '    give_claims = { id = $province$ }',
      '    other_effect = { id = 5075 }',
      '  }',
      '}',
    ].join('\n');
    expect(found(text, ids)).toEqual([
      'id 5075 province-id-out-of-range',
      'province 6000 province-id-out-of-range',
    ]);
    // A top-level block with a scripted effect's name is its definition, or a database entry.
    expect(found('give_claims = { id = 5075 }', ids, 'common/scripted_effects/x.txt')).toEqual([]);
    // In a string's script, a body, the top level holds calls.
    const string = checkProvinceIds(
      parseScript('give_claims = { id = 5075 }'),
      ids,
      undefined,
      true,
    );
    expect(string.map((d) => `${d.key} ${String(d.id)}`)).toEqual(['id 5075']);
  });

  it('checks the keys mods give province ids that vanilla does not', () => {
    const text = [
      'e = {',
      '  trigger = {',
      '    owns_or_subject_of = 5075 is_state_core = 5076 is_territorial_core = 5077',
      '    subject_owns = 5078 is_state_core = FRA owns_or_subject_of = 151',
      '  }',
      '  immediate = { add_territorial_core = 5079 undiscover_province = 5080 }',
      '}',
    ].join('\n');
    expect(found(text).map((line) => line.split(' ').slice(0, 2).join(' '))).toEqual([
      'owns_or_subject_of 5075',
      'is_state_core 5076',
      'is_territorial_core 5077',
      'subject_owns 5078',
      'add_territorial_core 5079',
      'undiscover_province 5080',
    ]);
  });

  it('knows the keys the vanilla survey found, by kind', () => {
    expect(PROVINCE_ID_KEYS.get('owns')).toBe('trigger');
    expect(PROVINCE_ID_KEYS.get('province_id')).toBe('trigger');
    expect(PROVINCE_ID_KEYS.get('add_permanent_claim')).toBe('effect');
    expect(PROVINCE_ID_KEYS.get('home_province')).toBe('property');
    expect(PROVINCE_ID_KEYS.has('start')).toBe(false);
    expect(PROVINCE_ID_KEYS.has('random')).toBe(false);
  });
});

describe('readScriptedProvinceArguments', () => {
  /** The province arguments of scripted effect files, as `name: args`. */
  function args(...texts: string[]): string[] {
    return [...readScriptedProvinceArguments(texts.map((t) => parseScript(t)))].map(
      ([name, set]) => `${name}: ${[...set].join(' ')}`,
    );
  }

  it('takes an argument used as a province scope or as a province key’s value', () => {
    const text = [
      'colony_reward = {',
      '  if = { limit = { $Province$ = { is_empty = yes } } $province$ = { add_base_tax = 1 } }',
      '}',
      'claim_province = { if = { limit = { NOT = { is_core = $where$ } } add_permanent_claim = $where$ } }',
      'distance_check = { province_distance = { who = $target$ distance = $distance$ } }',
      'default_value = { owns = $place|151$ }',
      'country_effect = { $country$ = { add_prestige = $amount$ } }',
    ].join('\n');
    expect(args(text)).toEqual([
      'colony_reward: province',
      'claim_province: where',
      'distance_check: target',
      'default_value: place',
      // A tag or a scope at the call is not an integer, so a country scope's argument costs nothing.
      'country_effect: country',
    ]);
  });

  it("leaves random_list's weights and a trigger_switch's values alone", () => {
    const text = [
      'weights = { random_list = { $chance$ = { add_prestige = 1 } 10 = { } } }',
      'switch = { trigger_switch = { on_trigger = num_of_cities $count$ = { } } }',
    ].join('\n');
    expect(args(text)).toEqual([]);
  });

  it('follows an argument passed on to another call, through a chain, in any file order', () => {
    const outer = 'outer = { middle = { place = $where$ } }';
    const middle = 'middle = { inner = { province = $place$ } not_a_call = { x = $place$ } }';
    const inner = 'inner = { $province$ = { add_core = ROOT } }';
    expect(args(outer, middle, inner)).toEqual([
      'outer: where',
      'middle: place',
      'inner: province',
    ]);
  });

  it('joins the arguments of two definitions of one name', () => {
    expect(args('Twice = { owns = $a$ }', 'twice = { controls = $b$ }')).toEqual(['twice: a b']);
  });
});

describe('isProvinceIdScriptPath', () => {
  it('takes the script folders and leaves the rest', () => {
    expect(isProvinceIdScriptPath('events/flavorRUS.txt')).toBe(true);
    expect(isProvinceIdScriptPath('Common\\Scripted_Effects\\a.TXT')).toBe(true);
    expect(isProvinceIdScriptPath('history/countries/RUS - Russia.txt')).toBe(true);
    expect(isProvinceIdScriptPath('missions/a.txt')).toBe(true);
    expect(isProvinceIdScriptPath('decisions/a.txt')).toBe(true);
    expect(isProvinceIdScriptPath('customizable_localization/00_a.txt')).toBe(true);
    expect(isProvinceIdScriptPath('common/province_names/english.txt')).toBe(false);
    expect(isProvinceIdScriptPath('map/area.txt')).toBe(false);
    expect(isProvinceIdScriptPath('interface/a.gui')).toBe(false);
    expect(isProvinceIdScriptPath('events/readme.md')).toBe(false);
  });
});

describe('default.map', () => {
  const map = [
    'width = 5632',
    'max_provinces = 6000',
    'sea_starts = { 1252 1253 6000 }',
    'lakes = { 4000 }',
    'definitions = "my_definitions.csv"',
    'tree = { 3 4 7 10 }',
  ].join('\n');

  it('reads max_provinces, the definition file and the id lists', () => {
    const parsed = parseDefaultMap(map);
    expect(parsed.maxProvinces).toBe(6000);
    expect(parsed.definitions).toBe('my_definitions.csv');
    expect(parsed.idLists.map((list) => [list.key, list.ids.map((id) => id.text)])).toEqual([
      ['sea_starts', ['1252', '1253', '6000']],
      ['lakes', ['4000']],
    ]);
    expect(parseDefaultMap('width = 1').maxProvinces).toBeUndefined();
    expect(parseDefaultMap('width = 1').definitions).toBe('definition.csv');
  });

  it("checks its own lists against its max_provinces and the definition file's ids", () => {
    const diagnostics = checkDefaultMap(parseScript(map), {
      ids: new Set([1252, 1253]),
      source: 'map/my_definitions.csv of My Mod',
    });
    expect(diagnostics.map((d) => `${d.key} ${String(d.id)} ${d.code}`)).toEqual([
      'sea_starts 6000 province-id-out-of-range',
      'lakes 4000 province-id-not-defined',
    ]);
    expect(diagnostics[0]?.message).toContain('this file sets max_provinces = 6000');
    expect(checkDefaultMap(parseScript('lakes = { 99999 }'))).toEqual([]);
  });
});

describe('parseProvinceDefinitions', () => {
  it("takes each line's leading id and skips the header", () => {
    const text =
      'province;red;green;blue;x;x\r\n1;128;34;64;Stockholm;x\r\n4941;30;216;201;Lake;x\n\n';
    expect([...parseProvinceDefinitions(text)]).toEqual([1, 4941]);
  });
});
