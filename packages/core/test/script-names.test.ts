import { describe, expect, it } from 'vitest';
import {
  SCRIPT_NAME_KEYS,
  SCRIPT_NAME_MEMBERS,
  checkScriptNames,
  parseScript,
  readIdeaNames,
  readReligionNames,
  readTopLevelNames,
  type ScriptNameSets,
  type ScriptNames,
} from '../src/index.ts';

const IDEAS = [
  'aristocracy_ideas = {',
  '  category = MIL',
  '  start = { cavalry_power = 0.1 }',
  '  bonus = { leader_siege = 1 }',
  '  trigger = { always = yes }',
  '  ai_will_do = { factor = 1 }',
  '  noble_knights = { cavalry_power = 0.15 }',
  '  serfdom = { global_manpower_modifier = 0.15 }',
  '}',
  'SWE_ideas = {',
  '  free = yes',
  '  smaland_proverb = { infantry_cost = -0.1 }',
  '}',
].join('\n');

const RELIGIONS = [
  'christian = {',
  '  center_of_religion = 118',
  '  flag_emblem_index_range = { 1 57 }',
  '  catholic = { color = { 1 1 0 } icon = 1 papacy = { x = 1 } }',
  '  orthodox = {',
  '    icon = 3',
  '    orthodox_icons = { icon_michael = { discipline = 0.05 } icon_eleusa = { x = 1 } }',
  '  }',
  '}',
  'muslim = {',
  '  religious_schools = { hanafi_school = { x = 1 } }',
  '  sunni = { icon = 7 }',
  '}',
].join('\n');

function names(): ScriptNames {
  const byKind: ScriptNameSets = new Map();
  readIdeaNames(parseScript(IDEAS), byKind);
  readReligionNames(parseScript(RELIGIONS), byKind);
  readTopLevelNames(parseScript('the_combination_act = { x = 1 }'), 'policy', byKind);
  readTopLevelNames(parseScript('nationalist_rebels = { x = 1 }'), 'rebel-type', byKind);
  readTopLevelNames(parseScript('civil_war = { x = 1 }'), 'disaster', byKind);
  readTopLevelNames(parseScript('feudalism = { x = 1 }'), 'institution', byKind);
  readTopLevelNames(parseScript('estate_nobles_hire_advisor = { x = 1 }'), 'estate-agenda', byKind);
  return { byKind };
}

/** The names a text's warnings are about, as `key name code`. */
function found(text: string, known: ScriptNames = names()): string[] {
  return checkScriptNames(parseScript(text), known).map((d) => `${d.key} ${d.name} ${d.code}`);
}

describe('reading names', () => {
  it('takes the top-level blocks as idea groups and their other blocks as ideas', () => {
    const { byKind } = names();
    expect([...(byKind.get('idea-group') ?? [])]).toEqual(['aristocracy_ideas', 'SWE_ideas']);
    expect([...(byKind.get('idea') ?? [])]).toEqual([
      'noble_knights',
      'serfdom',
      'smaland_proverb',
    ]);
  });

  it('takes the blocks of a religion group that set an icon as religions, and their icons', () => {
    const { byKind } = names();
    expect([...(byKind.get('religion') ?? [])]).toEqual(['catholic', 'orthodox', 'sunni']);
    expect([...(byKind.get('icon') ?? [])]).toEqual(['icon_michael', 'icon_eleusa']);
  });
});

describe('checkScriptNames', () => {
  it('flags the idea groups and ideas of the effects that crash on an unknown name', () => {
    const text = [
      'e = {',
      '  immediate = {',
      '    add_idea_group = aristocracy_ideas',
      '    add_idea_group = aristrocracy_ideas',
      '    remove_idea_group = maritime_ideas',
      '    remove_idea = serfdom',
      '    remove_idea = serfdon',
      '    if = { limit = { always = yes } add_idea_group = SWE_ideas }',
      '  }',
      '}',
    ].join('\n');
    expect(found(text)).toEqual([
      'add_idea_group aristrocracy_ideas unknown-idea-group',
      'remove_idea_group maritime_ideas unknown-idea-group',
      'remove_idea serfdon unknown-idea',
    ]);
  });

  it('flags the names of the triggers and effects whose tooltip crashes', () => {
    const text = [
      'd = {',
      '  allow = {',
      '    has_active_policy = the_combination_act',
      '    has_active_policy = the_combinaton_act',
      '    had_active_policy = { policy = no_policy days = 10 }',
      '    likely_rebels = nationalist_rebels',
      '    likely_rebels = nationalists_rebels',
      '    has_disaster_progress = { disaster = civil_war value = 5 }',
      '    has_disaster_progress = { disaster = civl_war value = 5 }',
      '    current_icon = icon_michael',
      '    current_icon = icon_nicholas',
      '    num_of_religion = { religion = sunni value = 1 }',
      '    num_of_religion = { religion = protestant value = 1 }',
      '    num_of_religion = { secondary = yes value = 1 }',
      '  }',
      '  effect = { enable_religion = catholic enable_religion = anglican }',
      '}',
    ].join('\n');
    expect(found(text)).toEqual([
      'has_active_policy the_combinaton_act unknown-policy',
      'policy no_policy unknown-policy',
      'likely_rebels nationalists_rebels unknown-rebel-type',
      'disaster civl_war unknown-disaster',
      'current_icon icon_nicholas unknown-icon',
      'religion protestant unknown-religion',
      'enable_religion anglican unknown-religion',
    ]);
  });

  it('flags the rebel types, estate agendas and institutions of the keys found later', () => {
    const text = [
      't = {',
      '  has_spawned_rebels = nationalist_rebels',
      '  has_spawned_rebels = nationalist_rebel',
      '  has_not_spawned_rebels = noble_rebels',
      '  has_active_estate_agenda = estate_nobles_hire_advisor',
      '  has_active_estate_agenda = estate_nobles_hire_adviser',
      '  provincial_institution_progress = { which = feudalism value = 1 }',
      '  provincial_institution_progress = { which = feudalsim value = 1 }',
      '  custom_trigger_tooltip = {',
      '    tooltip = x',
      '    provincial_institution_progress = { which = renaissance value = 1 }',
      '  }',
      '}',
    ].join('\n');
    expect(found(text)).toEqual([
      'has_spawned_rebels nationalist_rebel unknown-rebel-type',
      'has_not_spawned_rebels noble_rebels unknown-rebel-type',
      'has_active_estate_agenda estate_nobles_hire_adviser unknown-estate-agenda',
      'which feudalsim unknown-institution',
      'which renaissance unknown-institution',
    ]);
    const [trigger] = checkScriptNames(
      parseScript('t = { provincial_institution_progress = { which = x value = 1 } }'),
      names(),
    );
    expect(trigger?.message).toMatch(/: evaluating the trigger crashes the game \(tried in the/);
  });

  it('skips the tooltip keys inside a custom_trigger_tooltip, not the effects', () => {
    const text = [
      't = {',
      '  custom_trigger_tooltip = {',
      '    tooltip = my_tt',
      '    OR = { current_icon = icon_nicholas has_active_policy = no_policy }',
      '  }',
      '  custom_trigger_tooltip = { tooltip = x num_of_religion = { religion = y value = 1 } }',
      '  custom_trigger_tooltip = { tooltip = x had_active_policy = { policy = z days = 1 } }',
      '  effect = { custom_trigger_tooltip = { remove_idea = serfdon } }',
      '}',
    ].join('\n');
    expect(found(text)).toEqual([
      'religion y unknown-religion',
      'policy z unknown-policy',
      'remove_idea serfdon unknown-idea',
    ]);
  });

  it('compares the tooltip kinds ignoring case', () => {
    expect(found('t = { enable_religion = Catholic likely_rebels = Nationalist_Rebels }')).toEqual(
      [],
    );
  });

  it('does not take a religion group block without an icon as a religion', () => {
    expect(found('t = { enable_religion = flag_emblem_index_range }')).toEqual([
      'enable_religion flag_emblem_index_range unknown-religion',
    ]);
  });

  it('reads a block member only inside its block', () => {
    expect(found('e = { trigger = { religion = protestant policy = no_policy } }')).toEqual([]);
  });

  it('compares names case-sensitively, as the game does', () => {
    expect(found('e = { immediate = { add_idea_group = swe_ideas } }')).toEqual([
      'add_idea_group swe_ideas unknown-idea-group',
    ]);
  });

  it('skips arguments of a scripted effect, prefixed scopes and religion scopes', () => {
    const text = [
      'fx = {',
      '  add_idea_group = $group$',
      '  remove_idea = $idea$',
      '  likely_rebels = event_target:rebels',
      '  num_of_religion = { religion = ROOT value = 1 }',
      '  num_of_religion = { religion = FROM value = 1 }',
      '  num_of_religion = { religion = PREVPREV value = 1 }',
      '  num_of_religion = { religion = FROMFROM value = 1 }',
      '  enable_religion = PREVFROM',
      '  num_of_religion = { religion = TUR value = 1 }',
      '}',
    ].join('\n');
    expect(found(text)).toEqual([]);
  });

  it('skips has_idea_group, which logs an unknown name, and names the log line of has_idea', () => {
    const text = 'e = { trigger = { has_idea_group = no_such_ideas has_idea = no_such_idea } }';
    expect(found(text)).toEqual(['has_idea no_such_idea unknown-idea']);
    const [logged] = checkScriptNames(parseScript(text), names());
    expect(logged?.message).toBe(
      "No idea 'no_such_idea' in common/ideas of the playset (names are case-sensitive). The " +
        'game logs "Invalid idea" in error.log for has_idea\'s idea but keeps the missing name: ' +
        'showing the tooltip crashes the game, for example when a player hovers over the ' +
        'decision, mission or option that uses it (tried in the game).',
    );
  });

  it('does not check a kind the playset has no files for', () => {
    const byKind: ScriptNameSets = new Map();
    readIdeaNames(parseScript(IDEAS), byKind);
    const text = 'e = { trigger = { likely_rebels = any_rebels } effect = { remove_idea = x } }';
    expect(found(text, { byKind })).toEqual(['remove_idea x unknown-idea']);
  });

  it('gives the range of the name and a message naming the folder and the crash', () => {
    const text = 'e = { immediate = { add_idea_group = "quantity_idea" } }';
    const [effect] = checkScriptNames(parseScript(text), names());
    expect(text.slice(effect?.start, effect?.end)).toBe('"quantity_idea"');
    expect(effect?.message).toBe(
      "No idea group 'quantity_idea' in common/ideas of the playset (names are case-sensitive). " +
        "The game does not check add_idea_group's idea group or report it in error.log: " +
        'running the effect crashes the game (tried in the game), and so does showing its tooltip.',
    );
    expect(effect?.severity).toBe('warning');
    const [tooltip] = checkScriptNames(parseScript('t = { current_icon = x }'), names());
    expect(tooltip?.message).toBe(
      "No orthodox icon 'x' in common/religions of the playset. The game does not check " +
        "current_icon's orthodox icon or report it in error.log: showing the tooltip crashes " +
        'the game, for example when a player hovers over the decision, mission or option that ' +
        'uses it (tried in the game).',
    );
    const [read] = checkScriptNames(parseScript('t = { has_not_spawned_rebels = x }'), names());
    expect(read?.message).toMatch(
      /: showing the tooltip reads through the missing name, .*\(read in the game's code, not tried in the game\)\.$/,
    );
  });

  it('says which crashes were only read in the code', () => {
    const read = [
      ...[...SCRIPT_NAME_KEYS].filter(([, key]) => !key.seenInGame).map(([name]) => name),
      ...[...SCRIPT_NAME_MEMBERS].flatMap(([block, members]) =>
        [...members].filter(([, key]) => !key.seenInGame).map(([name]) => `${block}.${name}`),
      ),
    ];
    expect(read).toEqual(['remove_idea', 'has_not_spawned_rebels']);
  });

  it('knows these keys and block members', () => {
    expect([...SCRIPT_NAME_KEYS.keys()]).toEqual([
      'add_idea_group',
      'remove_idea_group',
      'remove_idea',
      'has_active_policy',
      'enable_religion',
      'likely_rebels',
      'current_icon',
      'has_spawned_rebels',
      'has_not_spawned_rebels',
      'has_active_estate_agenda',
      'has_idea',
    ]);
    expect([...SCRIPT_NAME_MEMBERS.keys()]).toEqual([
      'had_active_policy',
      'has_disaster_progress',
      'num_of_religion',
      'provincial_institution_progress',
    ]);
  });
});
