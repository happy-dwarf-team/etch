import { describe, expect, it } from 'vitest';
import {
  PROVINCE_ID_KEYS,
  checkClimate,
  checkAdjacencies,
  checkPositions,
  checkProvinceGroups,
  checkTradeWinds,
  checkContinents,
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

  it("checks a war goal's province in a war's history", () => {
    const text = [
      'name = "Test War"',
      '1444.11.11 = { add_attacker = SWE add_defender = DAN }',
      'war_goal = { type = take_claim casus_belli = cb_claim province = 5075 }',
      'war_goal = { type = take_claim casus_belli = cb_claim province = 12 }',
      'war_goal = { type = superiority casus_belli = cb_insult tag = DAN }',
    ].join('\n');
    expect(found(text, VANILLA, 'history/wars/test.txt')).toEqual([
      'province 5075 province-id-out-of-range',
    ]);
  });

  it('checks the provinces lists of colonial regions and trade company regions', () => {
    const text = [
      'colonial_test = {',
      '  color = { 200 100 50 }',
      '  provinces = { 12 5075 0 }',
      '  culture = { 1 = 5 }',
      '}',
    ].join('\n');
    const lists = [
      'provinces 5075 province-id-out-of-range',
      'provinces 0 province-id-out-of-range',
    ];
    expect(found(text, VANILLA, 'common/colonial_regions/00_test.txt')).toEqual(lists);
    expect(found(text, VANILLA, 'Common\\Trade_Companies\\00_test.txt')).toEqual(lists);
    // Elsewhere a `provinces` block's bare integers are not province ids Etch knows of.
    expect(found(text, VANILLA, 'common/ideas/00_test.txt')).toEqual([]);
    expect(found('provinces = { 5075 }', VANILLA, 'common/colonial_regions/x.txt')).toEqual([]);
  });

  it('flags a province history file whose name gives no province of the map', () => {
    const text = 'owner = SWE\n1500.1.1 = { controller = DAN }';
    const at = (path: string): string[] => found(text, VANILLA, path);
    expect(at('history/provinces/1 - Uppland.txt')).toEqual([]);
    expect(at('history/provinces/4941-Last.txt')).toEqual([]);
    expect(at('History\\Provinces\\4942 - Past.txt')).toEqual([
      'history/provinces 4942 province-history-not-read',
    ]);
    expect(at('history/provinces/0 - Nothing.txt')).toEqual([
      'history/provinces 0 province-history-not-read',
    ]);
    // `atoi` of a name without a leading number is 0.
    expect(at('history/provinces/Uppland.txt')).toEqual([
      'history/provinces 0 province-history-not-read',
    ]);
    // Not names the game reads: subfolders, other history, a body, no path.
    expect(at('history/provinces/old/9999.txt')).toEqual([]);
    expect(at('history/countries/9999 - X.txt')).toEqual([]);
    expect(
      checkProvinceIds(parseScript(text), VANILLA, 'history/provinces/9999.txt', true),
    ).toEqual([]);
    const [warning] = checkProvinceIds(
      parseScript(text),
      VANILLA,
      'history/provinces/4999 - A.txt',
    );
    expect(warning).toMatchObject({ start: 0, end: 0, id: 4999, severity: 'warning' });
    expect(warning?.message).toBe(
      'The game never reads this province history: its file name gives province 4999, and the ' +
        'game reads only the files of provinces 1 to 4941 (map/default.map of the game sets ' +
        'max_provinces = 4942). It skips the file without a line in error.log.',
    );
    expect(
      checkProvinceIds(parseScript(text), VANILLA, 'history/provinces/x.txt')[0]?.message,
    ).toMatch(/^The game never reads this province history: its file name does not start with a/);
  });

  it("checks a trade node's members and location, not its paths", () => {
    const text = [
      'test_node = {',
      '  location = 4943',
      '  outgoing = { name = "other" path = { 9000 } control = { 3351.0 607.0 } }',
      '  members = { 4064 4942 }',
      '  provinces = { 9001 }',
      '}',
    ].join('\n');
    expect(found(text, VANILLA, 'common/tradenodes/00_tradenodes.txt')).toEqual([
      'location 4943 province-id-out-of-range',
      'members 4942 province-id-out-of-range',
    ]);
  });

  it("checks a great project's start province, not other folders' start", () => {
    const text = [
      'test_monument = {',
      '  start = 4942',
      '  date = 1.01.01',
      '  build_trigger = { owns = 151 }',
      '}',
      'other_monument = { start = -1 }',
      'built_later = { start = 151 start_tier = 1 }',
    ].join('\n');
    expect(found(text, VANILLA, 'common/great_projects/01_monuments.txt')).toEqual([
      'start 4942 province-id-out-of-range',
      'start -1 province-id-out-of-range',
    ]);
    // A year elsewhere, and a `start` below the entry's level.
    expect(found(text, VANILLA, 'common/advisortypes/00_test.txt')).toEqual([]);
    expect(
      found('m = { keep_trigger = { start = 9999 } }', VANILLA, 'common/great_projects/x.txt'),
    ).toEqual([]);
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

describe('continent file', () => {
  it('flags the negative ids of every list, which the game does not skip', () => {
    const text = [
      'europe = { 1 -5 9999 0 -0 }',
      'island_check_provinces = { -1 }',
      'new_world = { }',
      'equator = 3',
    ].join('\n');
    const diagnostics = checkContinents(parseScript(text), VANILLA);
    expect(diagnostics.map((d) => `${d.key} ${String(d.id)} ${d.code}`)).toEqual([
      'europe -5 province-id-out-of-range',
      'island_check_provinces -1 province-id-out-of-range',
    ]);
    expect(text.slice(diagnostics[0]?.start, diagnostics[0]?.end)).toBe('-5');
  });

  it('runs in time linear in a long value that is almost a negative id', () => {
    const started = performance.now();
    expect(checkContinents(parseScript(`europe = { -${'1'.repeat(100_000)}x }`), VANILLA)).toEqual(
      [],
    );
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('climate file', () => {
  it('checks every list of provinces, not the equator', () => {
    const text = [
      'tropical = { 151 4942 }',
      'arid = { -1 }',
      'arctic = { 1 }',
      'mild_winter = { 2 } normal_winter = { 3 } SEVERE_WINTER = { 70000 }',
      'impassable = { 5000 }',
      'mild_monsoon = { 4 } normal_monsoon = { 5 } severe_monsoon = { 9999 }',
      'equator_y_on_province_image = 9999',
      'other = { 9999 }',
    ].join('\n');
    const diagnostics = checkClimate(parseScript(text), {
      ...VANILLA,
      defined: new Set([1, 2, 3, 4, 5, 151]),
      definedSource: 'map/definition.csv of the game',
    });
    expect(diagnostics.map((d) => `${d.key} ${String(d.id)} ${d.code}`)).toEqual([
      'tropical 4942 province-id-out-of-range',
      'arid -1 province-id-out-of-range',
      'severe_winter 70000 province-id-out-of-range',
      'impassable 5000 province-id-out-of-range',
      'severe_monsoon 9999 province-id-out-of-range',
    ]);
    const first = diagnostics[0];
    expect(text.slice(first?.start, first?.end)).toBe('4942');
    expect(
      checkClimate(parseScript('arctic = { 7 }'), { ...VANILLA, defined: new Set([1]) })[0]?.code,
    ).toBe('province-id-not-defined');
  });
});

describe('trade winds file', () => {
  it('checks every key, with its sign, and leaves comments and quoted keys alone', () => {
    const text = [
      '# province id = rotation in degrees',
      '1571 = 0',
      '-1 = 30',
      '4942 = -30',
      '"9999" = 10',
      '0 = 5',
      'name = 7',
    ].join('\n');
    const diagnostics = checkTradeWinds(parseScript(text), VANILLA);
    expect(diagnostics.map((d) => `${d.key} ${String(d.id)} ${d.code}`)).toEqual([
      'trade_winds -1 province-id-out-of-range',
      'trade_winds 4942 province-id-out-of-range',
      'trade_winds 0 province-id-out-of-range',
    ]);
    const first = diagnostics[0];
    expect(text.slice(first?.start, first?.end)).toBe('-1');
    expect(
      checkTradeWinds(parseScript('7 = 0'), { ...VANILLA, defined: new Set([1]) })[0]?.code,
    ).toBe('province-id-not-defined');
  });
});

describe('adjacencies file', () => {
  it("checks From and To of every line up to the first negative From, and a sea link's Through", () => {
    const text = [
      'From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment',
      '6;12;sea;1310;-1;-1;-1;-1;;Gotland-Uppland',
      '4942;-5;sea;5000;-1;-1;-1;-1;;all three',
      '7; 4950 ;land;-1;-1;-1;-1;-1;;Through is not read on land',
      '0;9999;sea;9999;;;;;;From 0 is skipped',
      '# 9999;9999',
      '8;x;canal;-1',
      '-1;-1;;-1;-1;-1;-1;-1;;',
      '9999;9999;sea;9999',
    ].join('\r\n');
    const diagnostics = checkAdjacencies(text, VANILLA);
    expect(diagnostics.map((d) => `${d.key} ${String(d.id)} ${d.code}`)).toEqual([
      'from 4942 province-id-out-of-range',
      'to -5 province-id-out-of-range',
      'through 5000 province-id-out-of-range',
      'to 4950 province-id-out-of-range',
    ]);
    expect(diagnostics.map((d) => text.slice(d.start, d.end))).toEqual([
      '4942',
      '-5',
      '5000',
      '4950',
    ]);
    expect(checkAdjacencies('1;7;sea;3', { ...VANILLA, defined: new Set([1, 3]) })).toMatchObject([
      { key: 'to', id: 7, code: 'province-id-not-defined' },
    ]);
  });
});

describe('positions file', () => {
  it('checks the negative keys only, which the game does not skip', () => {
    const text = [
      '#Stockholm',
      '1 = { position = { 3085.000 1723.000 } rotation = { 0.000 } }',
      '-1 = { position = { 1.000 2.000 } }',
      '4942 = { }',
      '0 = { }',
      '-0 = { }',
      '"-5" = { }',
      '-30000 = { }',
    ].join('\n');
    const diagnostics = checkPositions(parseScript(text), VANILLA);
    expect(diagnostics.map((d) => `${d.key} ${String(d.id)} ${d.code}`)).toEqual([
      'positions -1 province-id-out-of-range',
      'positions -30000 province-id-out-of-range',
    ]);
    const first = diagnostics[0];
    expect(text.slice(first?.start, first?.end)).toBe('-1');
  });
});

describe('province group file', () => {
  it('checks the negative ids of each group only, which the game does not skip', () => {
    const text = [
      '#mytestgroup = {',
      '#\t1 2 3',
      '#}',
      'Golden_Coast = { 1 -1 4942 0 -0 "-5" }',
      'empty = { }',
      'far = { -30000 }',
    ].join('\n');
    const diagnostics = checkProvinceGroups(parseScript(text), VANILLA);
    expect(diagnostics.map((d) => `${d.key} ${String(d.id)} ${d.code}`)).toEqual([
      'golden_coast -1 province-id-out-of-range',
      // The game reads every value of a group with `atoi`, a quoted one too.
      'golden_coast -5 province-id-out-of-range',
      'far -30000 province-id-out-of-range',
    ]);
    expect(text.slice(diagnostics[0]?.start, diagnostics[0]?.end)).toBe('-1');
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
    expect(parseDefaultMap('width = 1').climate).toBe('climate.txt');
    expect(parseDefaultMap('climate = "my_climate.txt"').climate).toBe('my_climate.txt');
    expect(parseDefaultMap('width = 1').tradeWinds).toBe('trade_winds.txt');
    expect(parseDefaultMap('trade_winds = "winds.txt"').tradeWinds).toBe('winds.txt');
    expect(parseDefaultMap('width = 1').positions).toBe('positions.txt');
    expect(parseDefaultMap('positions = "places.txt"').positions).toBe('places.txt');
    expect(parseDefaultMap('width = 1').adjacencies).toBe('adjacencies.csv');
    expect(parseDefaultMap('adjacencies = "links.csv"').adjacencies).toBe('links.csv');
    expect(parseDefaultMap('width = 1').provinceGroup).toBe('provincegroup.txt');
    expect(parseDefaultMap('provincegroup = "groups.txt"').provinceGroup).toBe('groups.txt');
    expect(parseDefaultMap('width = 1').continent).toBe('continent.txt');
    expect(parseDefaultMap('continent = "lands.txt"').continent).toBe('lands.txt');
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
