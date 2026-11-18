import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GameFiles,
  checkScriptValues,
  findScriptValueProblems,
  loadProvinceIds,
  loadScriptNames,
} from '../../src/playset/index.ts';
import { parseScript, type ScriptNames } from '../../src/script/index.ts';
import { makeTree, removeTree } from './fixture.ts';

describe('script values of a playset', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTree({
      'game/map/default.map': 'max_provinces = 10\n',
      'game/common/ideas/00_basic_ideas.txt':
        'quantity_ideas = { start = { x = 1 } levee_en_masse = { y = 1 } }\n',
      'game/common/ideas/00_country_ideas.txt': 'SWE_ideas = { smaland_proverb = { y = 1 } }\n',
      'game/events/game.txt': 'e = { immediate = { add_idea_group = quantity_ideas } }',
      // A mod that replaces the country ideas and adds a group of its own.
      'mod/common/ideas/00_country_ideas.txt': 'XYZ_ideas = { xyz_idea = { y = 1 } }\n',
      'mod/common/ideas/mod_ideas.txt': 'mod_ideas = { mod_idea = { y = 1 } }\n',
      'mod/events/mod.txt': [
        'e = {',
        '  immediate = {',
        '    add_idea_group = mod_ideas',
        '    remove_idea = smaland_proverb',
        '    owns = 12',
        '    remove_idea_group = SWE_ideas',
        '  }',
        '}',
      ].join('\n'),
    });
  });

  afterEach(async () => {
    await removeTree(root);
  });

  function playset(): GameFiles {
    return new GameFiles([
      { name: 'game', root: join(root, 'game'), replacePaths: [] },
      { name: 'Mod', root: join(root, 'mod'), replacePaths: [] },
    ]);
  }

  it('reads the idea groups and ideas of the winning common/ideas files', async () => {
    const names = await loadScriptNames(playset());
    expect([...(names?.byKind.get('idea-group') ?? [])].sort()).toEqual([
      'XYZ_ideas',
      'mod_ideas',
      'quantity_ideas',
    ]);
    expect([...(names?.byKind.get('idea') ?? [])].sort()).toEqual([
      'levee_en_masse',
      'mod_idea',
      'xyz_idea',
    ]);
  });

  it('reads only the kinds the playset has files for', async () => {
    const names = await loadScriptNames(playset());
    expect([...(names?.byKind.keys() ?? [])]).toEqual(['idea-group', 'idea']);
  });

  it('is undefined without any file that defines names', async () => {
    const files = new GameFiles([{ name: 'game', root: join(root, 'none'), replacePaths: [] }]);
    expect(await loadScriptNames(files)).toBeUndefined();
  });

  it('finds province ids and names in one pass, in text order', async () => {
    const files = playset();
    const ids = await loadProvinceIds(files);
    const names = await loadScriptNames(files);
    const { findings, filesChecked } = await findScriptValueProblems(files, { ids, names });
    const summary = findings.map((finding) => [
      finding.file.path,
      finding.diagnostics.map((d) => `${d.key} ${finding.text.slice(d.start, d.end)} ${d.code}`),
    ]);
    expect(summary).toEqual([
      [
        'events/mod.txt',
        [
          'remove_idea smaland_proverb unknown-idea',
          'owns 12 province-id-out-of-range',
          'remove_idea_group SWE_ideas unknown-idea-group',
        ],
      ],
    ]);
    // Three ideas files, two event files and default.map.
    expect(filesChecked).toBe(6);
  });

  it('checks names without a map, and ids without names', async () => {
    const text = 'e = { immediate = { add_idea_group = no_ideas owns = 12 } }';
    const files = playset();
    const ids = await loadProvinceIds(files);
    const names = await loadScriptNames(files);
    const codes = (values: Parameters<typeof checkScriptValues>[1]): string[] =>
      checkScriptValues(parseScript(text), values).map((d) => d.code);
    expect(codes({ names })).toEqual(['unknown-idea-group']);
    expect(codes({ ids })).toEqual(['province-id-out-of-range']);
    expect(codes({})).toEqual([]);
  });

  it("checks the script of a scripted effect's string arguments", async () => {
    // Vanilla's missions pass script to simple_dynamic_effect in strings, over several lines.
    const text = [
      'm = {',
      '  effect = {',
      '    simple_dynamic_effect = {',
      '      first_limit = "owns = 12"',
      '      first_effect = "',
      '        11 = { add_core = ROOT }',
      '        add_idea_group = no_ideas',
      '        3 = { add_core = ROOT }',
      '      "',
      '      first_custom_tooltip = "a = b"',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const files = playset();
    const ids = await loadProvinceIds(files);
    const names = await loadScriptNames(files);
    const found = checkScriptValues(parseScript(text, { script: true }), { ids, names });
    expect(found.map((d) => `${d.key} ${text.slice(d.start, d.end)} ${d.code}`)).toEqual([
      'owns 12 province-id-out-of-range',
      ' 11 province-id-out-of-range',
      'add_idea_group no_ideas unknown-idea-group',
    ]);
  });

  it("skips a tooltip key in a string inside a custom_trigger_tooltip, as the block's own", () => {
    const names: ScriptNames = { byKind: new Map([['policy', new Set(['a_policy'])]]) };
    const inside = 'c = { custom_trigger_tooltip = { s = { t = "has_active_policy = none" } } }';
    const outside = 'c = { s = { t = "has_active_policy = none" } }';
    const codes = (text: string): string[] =>
      checkScriptValues(parseScript(text, { script: true }), { names }).map((d) => d.code);
    expect(codes(inside)).toEqual([]);
    expect(codes(outside)).toEqual(['unknown-policy']);
  });

  it('leaves a quoted value without script alone', async () => {
    const files = playset();
    const ids = await loadProvinceIds(files);
    const text = 'e = { title = "12 = {" desc = "owns 12" }';
    expect(checkScriptValues(parseScript(text, { script: true }), { ids })).toEqual([]);
  });
});
