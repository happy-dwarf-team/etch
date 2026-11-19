import { mkdir, writeFile } from 'node:fs/promises';
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
import { addFiles, makeTree, removeTree } from './fixture.ts';

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
      // Triggers of a defined_text, which the game evaluates when it shows the text.
      'mod/customizable_localization/mod_texts.txt': [
        'defined_text = {',
        '  name = GetModText',
        '  text = { localisation_key = a trigger = { owns = 11 has_idea = no_idea } }',
        '  text = { localisation_key = b trigger = { 4 = { has_idea = mod_idea } } }',
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

  it('reads the scripted effects and triggers, whose calls take arguments', async () => {
    const files = new GameFiles([
      { name: 'game', root: join(root, 'game'), replacePaths: [] },
      { name: 'Calls', root: join(root, 'calls'), replacePaths: [] },
    ]);
    await mkdir(join(root, 'calls', 'common', 'scripted_effects'), { recursive: true });
    await mkdir(join(root, 'calls', 'common', 'scripted_triggers'), { recursive: true });
    await writeFile(
      join(root, 'calls', 'common', 'scripted_effects', 'fx.txt'),
      'pick_ideas = { add_idea_group = $group$ }\n',
    );
    const triggers = 'Has_Ideas = { has_idea = no_idea }\nflag = yes\n';
    await writeFile(join(root, 'calls', 'common', 'scripted_triggers', 't.txt'), triggers);
    const names = await loadScriptNames(files);
    expect([...(names?.scripted ?? [])].sort()).toEqual(['has_ideas', 'pick_ideas']);
    if (names === undefined) return;
    const codes = (text: string): string[] =>
      checkScriptValues(parseScript(text, { script: true }), { names }).map(
        (d) => `${d.key} ${d.code}`,
      );
    // A call's arguments are not checked, in a file and in a string's script.
    expect(codes('e = { immediate = { pick_ideas = { add_idea_group = no_ideas } } }')).toEqual([]);
    expect(
      codes('e = { effect = { first_effect = "pick_ideas = { add_idea_group = no_ideas }" } }'),
    ).toEqual([]);
    // The scripted trigger's definition, at the top level of its file, is.
    expect(codes(triggers)).toEqual(['has_idea unknown-idea']);
  });

  it('reads the graphical cultures of the winning common/graphicalculturetype.txt', async () => {
    const files = new GameFiles([
      { name: 'game', root: join(root, 'game'), replacePaths: [] },
      { name: 'Cultures', root: join(root, 'cultures'), replacePaths: [] },
    ]);
    await mkdir(join(root, 'game', 'common'), { recursive: true });
    await writeFile(join(root, 'game', 'common', 'graphicalculturetype.txt'), 'westerngfx\n');
    await mkdir(join(root, 'cultures', 'common'), { recursive: true });
    await writeFile(
      join(root, 'cultures', 'common', 'graphicalculturetype.txt'),
      'westerngfx\nelvengfx # a comment\n',
    );
    const names = await loadScriptNames(files);
    expect([...(names?.byKind.get('graphical-culture') ?? [])]).toEqual(['westerngfx', 'elvengfx']);
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
        'customizable_localization/mod_texts.txt',
        ['owns 11 province-id-out-of-range', 'has_idea no_idea unknown-idea'],
      ],
      [
        'events/mod.txt',
        [
          'remove_idea smaland_proverb unknown-idea',
          'owns 12 province-id-out-of-range',
          'remove_idea_group SWE_ideas unknown-idea-group',
        ],
      ],
    ]);
    // Three ideas files, two event files, a customizable localisation file and default.map.
    expect(filesChecked).toBe(7);
  });

  it("warns about a country_tags file's tag whose country file no layer has", async () => {
    await addFiles(root, {
      'game/common/country_tags/00_countries.txt': 'SWE = "countries/Sweden.txt"\n',
      'game/common/countries/Sweden.txt': 'graphical_culture = westerngfx\n',
      'mod/common/country_tags/01_mod.txt':
        'XYZ = "countries/Xyz.txt"\nLST = "countries/Lost.txt"\nSW2 = "countries/sweden.txt"\n',
      'mod/common/countries/Xyz.txt': 'graphical_culture = westerngfx\n',
    });
    const files = playset();
    const names = await loadScriptNames(files);
    // The mod's own file, the game's in another case, and one no layer has.
    expect(names?.countryFiles).toEqual(
      new Map([
        ['common/countries/sweden.txt', true],
        ['common/countries/xyz.txt', true],
        ['common/countries/lost.txt', false],
      ]),
    );
    const { findings } = await findScriptValueProblems(files, { names });
    const tags = findings.find((finding) => finding.file.path === 'common/country_tags/01_mod.txt');
    expect(tags?.diagnostics.map((d) => `${d.key} ${d.code}`)).toEqual([
      'LST country-file-missing',
    ]);
  });

  it("reports what the game logs about a tag's country file, but not for the first two tags", async () => {
    await addFiles(root, {
      'game/common/country_tags/00_countries.txt':
        'REB = "countries/Rebels.txt"\nPIR = "countries/Pirates.txt"\nNAT = "countries/Natives.txt"\n',
      'game/common/countries/Rebels.txt': '',
      'game/common/countries/Pirates.txt': '',
      'game/common/countries/Natives.txt':
        'color = { 1 2 3 }\nmonarch_names = { "A" = 1 }\n' +
        'leader_names = { a b c d e f g h i j }\nship_names = { a b c d e f g h i j }\n',
      'mod/common/country_tags/zz_mod.txt':
        'NAT = "countries/Empty.txt"\nZZE = "countries/Empty.txt"\nZZF = "countries/Empty.txt"\n',
      'mod/common/countries/Empty.txt':
        'monarch_names = { "A" = 1 }\nleader_names = { a b c d e f g h i j }\n' +
        'ship_names = { a b c d e f g h i j }\n',
    });
    const files = playset();
    const names = await loadScriptNames(files);
    expect([...(names?.countryFileTags ?? [])]).toEqual([
      ['common/countries/natives.txt', ['NAT']],
      ['common/countries/empty.txt', ['ZZE', 'ZZF']],
    ]);
    const { findings } = await findScriptValueProblems(files, { names });
    const content = findings.flatMap((finding) =>
      finding.diagnostics
        .filter((d) => d.code === 'country-file-content')
        .map((d) => [finding.file.path, d.message]),
    );
    expect(content).toEqual([
      [
        'common/countries/Empty.txt',
        'This file has no color: the game logs "ZZE has no color defined." in error.log (and ' +
          'for the other tag that names this file).',
      ],
    ]);
  });

  it("warns at a mod's first country_tags file when the playset lacks a tag the game needs", async () => {
    await addFiles(root, {
      'game/common/country_tags/00_countries.txt':
        'REB = "countries/Rebels.txt"\nPIR = "countries/Pirates.txt"\nNAT = "countries/Natives.txt"\n',
      // The mod's file of the same name replaces the game's, without REB.
      'mod/common/country_tags/00_countries.txt':
        'PIR = "countries/Pirates.txt"\nNAT = "countries/Natives.txt"\n',
      'mod/common/country_tags/zz_mod.txt': 'SWE = "countries/Sweden.txt"\n',
    });
    const files = playset();
    const names = await loadScriptNames(files);
    expect(names?.countryTagsMissing).toEqual({
      path: 'common/country_tags/00_countries.txt',
      tags: ['REB'],
    });
    const { findings } = await findScriptValueProblems(files, { names });
    const required = findings.flatMap((finding) =>
      finding.diagnostics
        .filter((d) => d.code === 'country-tags-required')
        .map((d) => [finding.file.path, finding.file.layer.name, d.message, d.start]),
    );
    expect(required).toEqual([
      [
        'common/country_tags/00_countries.txt',
        'Mod',
        'No common/country_tags file of the playset defines REB: the game needs it and stops ' +
          'while it starts, after "Missing REB country tag" in error.log.',
        0,
      ],
    ]);

    // The game's own files are not checked: they define the three.
    const game = new GameFiles([{ name: 'game', root: join(root, 'game'), replacePaths: [] }]);
    expect((await loadScriptNames(game))?.countryTagsMissing).toBeUndefined();
  });

  it('warns about a tag an earlier country_tags file of the playset defines', async () => {
    await addFiles(root, {
      'game/common/country_tags/00_countries.txt': 'SWE = "countries/Sweden.txt"\n',
      'game/common/countries/Sweden.txt': 'graphical_culture = westerngfx\n',
      'mod/common/country_tags/zz_mod.txt':
        'XYZ = "countries/Sweden.txt"\nSWE = "countries/Lost.txt"\n',
    });
    const files = playset();
    const names = await loadScriptNames(files);
    expect([...(names?.countryTags ?? [])]).toEqual([
      ['SWE', 'common/country_tags/00_countries.txt'],
      ['XYZ', 'common/country_tags/zz_mod.txt'],
    ]);
    const { findings } = await findScriptValueProblems(files, { names });
    const tags = findings.find((finding) => finding.file.path === 'common/country_tags/zz_mod.txt');
    // The game keeps the game's SWE and does not read Lost.txt: not a missing file.
    expect(tags?.diagnostics.map((d) => `${d.key} ${d.code}`)).toEqual([
      'SWE country-tag-duplicate',
    ]);
  });

  it("warns about a mod's country history that does not replace the game's", async () => {
    await addFiles(root, {
      'game/history/countries/SWE - Sweden.txt': 'capital = 1\n',
      'game/history/countries/DAN - Denmark.txt': 'capital = 12\n',
      'mod/history/countries/SWE - My Sweden.txt': 'capital = 2\n',
      // The same name replaces the game's file: one file.
      'mod/history/countries/dan - denmark.txt': 'capital = 13\n',
    });
    const files = playset();
    const names = await loadScriptNames(files);
    expect(names?.countryHistories?.get('SWE')?.map((file) => [file.path, file.game])).toEqual([
      ['history/countries/SWE - My Sweden.txt', false],
      ['history/countries/SWE - Sweden.txt', true],
    ]);
    const { findings } = await findScriptValueProblems(files, { names });
    expect(
      findings.flatMap((finding) =>
        finding.diagnostics
          .filter((d) => d.code.startsWith('country-'))
          .map((d) => `${finding.file.path} ${d.key} ${d.code}`),
      ),
    ).toEqual(['history/countries/SWE - My Sweden.txt SWE country-history-shared']);

    // A mod that replaces the folder has only its own files.
    const replacing = new GameFiles([
      { name: 'game', root: join(root, 'game'), replacePaths: [] },
      { name: 'Mod', root: join(root, 'mod'), replacePaths: ['history/countries/'] },
    ]);
    const own = await loadScriptNames(replacing);
    expect(own?.countryHistories?.get('SWE')).toEqual([
      { path: 'history/countries/SWE - My Sweden.txt', game: false },
    ]);
  });

  it('warns about a table of the winning common/technology.txt that no layer has', async () => {
    await addFiles(root, {
      'game/common/technology.txt': 'tables = { adm_tech = "technologies/adm.txt" }\n',
      'game/common/technologies/adm.txt': 'monarch_power = ADM\n',
      'mod/common/technology.txt':
        'tables = {\n  adm_tech = "technologies/adm.txt"\n  dip_tech = "technologies/dip.txt"\n}\n',
    });
    const files = playset();
    const names = await loadScriptNames(files);
    // The game's file for adm_tech; the mod's technology.txt, which replaces the game's, adds one
    // no layer has.
    expect(names?.technologyTables).toEqual(
      new Map([
        ['common/technologies/adm.txt', true],
        ['common/technologies/dip.txt', false],
      ]),
    );
    const { findings } = await findScriptValueProblems(files, { names });
    const technology = findings.find((finding) => finding.file.path === 'common/technology.txt');
    expect(technology?.diagnostics.map((d) => `${d.key} ${d.code}`)).toEqual([
      'dip_tech technology-table-missing',
    ]);
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
