import { describe, expect, it } from 'vitest';
import {
  SCRIPT_NAME_KEYS,
  checkScriptNames,
  parseScript,
  readIdeaNames,
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

function names(): ScriptNames {
  const ideaGroups = new Set<string>();
  const ideas = new Set<string>();
  readIdeaNames(parseScript(IDEAS), { ideaGroups, ideas });
  return { ideaGroups, ideas, source: 'common/ideas of the playset' };
}

/** The names a text's warnings are about, as `key name code`. */
function found(text: string): string[] {
  return checkScriptNames(parseScript(text), names()).map((d) => `${d.key} ${d.name} ${d.code}`);
}

describe('readIdeaNames', () => {
  it('takes the top-level blocks as idea groups and their other blocks as ideas', () => {
    const { ideaGroups, ideas } = names();
    expect([...ideaGroups]).toEqual(['aristocracy_ideas', 'SWE_ideas']);
    expect([...ideas]).toEqual(['noble_knights', 'serfdom', 'smaland_proverb']);
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

  it('compares names case-sensitively, as the game does', () => {
    expect(found('e = { immediate = { add_idea_group = swe_ideas } }')).toEqual([
      'add_idea_group swe_ideas unknown-idea-group',
    ]);
  });

  it('skips the triggers that log an unknown name, and arguments of a scripted effect', () => {
    const text = [
      'fx = {',
      '  add_idea_group = $group$',
      '  remove_idea = $idea$',
      '}',
      'e = { trigger = { has_idea_group = no_such_ideas has_idea = no_such_idea } }',
    ].join('\n');
    expect(found(text)).toEqual([]);
  });

  it('gives the range of the name and a message naming the source', () => {
    const text = 'e = { immediate = { add_idea_group = "quantity_idea" } }';
    const [diagnostic] = checkScriptNames(parseScript(text), names());
    expect(text.slice(diagnostic?.start, diagnostic?.end)).toBe('"quantity_idea"');
    expect(diagnostic?.message).toMatch(
      /^No idea group 'quantity_idea' in common\/ideas of the playset \(names are case-sensitive\)\. The game does not check add_idea_group's idea group or report it in error\.log/,
    );
    expect(diagnostic?.severity).toBe('warning');
  });

  it('knows only effects', () => {
    expect([...SCRIPT_NAME_KEYS.keys()]).toEqual([
      'add_idea_group',
      'remove_idea_group',
      'remove_idea',
    ]);
  });
});
