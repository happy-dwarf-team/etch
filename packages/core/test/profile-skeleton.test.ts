import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import {
  checkProfile,
  layerProfiles,
  readCustomGui,
  readProfile,
  plainLabelText,
  scriptedSkeleton,
  withMembers,
  withSkeleton,
  type ProfileOrigin,
} from '../src/profile/index.ts';

// Made-up names in the game's layout: a mod's panel with two scripted parts, one of them twice.
const WINDOW = readGuiFile(
  parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    windowType = {
      name = "my_panel"
      guiButtonType = { name = "my_button" }
      iconType = { name = "my_icon" }
      iconType = { name = "my_icon" }
      iconType = { name = "plain_icon" }
    }
  }
}`),
).definitions.find((w) => w.name === 'provinceview') as Widget;

const CUSTOM_GUI = `# My panel
custom_window = {
\tname = my_panel
\tpotential = {
\t\thas_country_flag = my_panel_open # opened by a decision
\t}
}
custom_button = {
\tname = my_button
\tpotential = { owner = { ai = no } }
\teffect = { add_prestige = 1 }
}
custom_icon = {
\tname = my_icon
\tpotential = { has_country_flag = my_icon_shown }
}
custom_icon = {
\tname = plain_icon
}
custom_icon = {
\tname = not_in_this_window
\tpotential = { always = no }
}
`;

const PROJECT: ProfileOrigin = {
  layer: 0,
  source: 'mod project',
  file: '.etch/profiles/provinceview.jsonc',
};

describe('readCustomGui', () => {
  it('reads the entries with a potential, the potential on one line without comments', () => {
    const entries = readCustomGui(CUSTOM_GUI, 'common/custom_gui/my_panel.txt');
    expect(entries.map((e) => [e.type, e.name])).toEqual([
      ['custom_window', 'my_panel'],
      ['custom_button', 'my_button'],
      ['custom_icon', 'my_icon'],
      ['custom_icon', 'not_in_this_window'],
    ]);
    expect(entries[0]?.potential).toBe('potential = { has_country_flag = my_panel_open }');
    expect(entries[0]?.file).toBe('common/custom_gui/my_panel.txt');
  });

  it('cuts a long potential', () => {
    const long = `custom_icon = { name = x potential = { ${'always = yes '.repeat(40)}} }`;
    const potential = readCustomGui(long, 'a.txt')[0]?.potential ?? '';
    expect(potential.length).toBe(160 + 'potential = '.length);
    expect(potential.endsWith('…')).toBe(true);
  });
});

describe('scriptedSkeleton', () => {
  const entries = readCustomGui(CUSTOM_GUI, 'common/custom_gui/my_panel.txt');

  it('gives each scripted widget of the window a selector and a rule hiding it', () => {
    const { selectors, rules } = scriptedSkeleton(WINDOW, entries);
    expect(selectors.map(([id]) => id)).toEqual(['my_panel', 'my_button', 'my_icon']);
    expect(selectors[1]?.[1]).toEqual({
      kind: 'scripted',
      label: 'my_button',
      values: { shown: 'Shown', hidden: 'Hidden' },
      note: 'common/custom_gui/my_panel.txt, custom_button: potential = { owner = { ai = no } }',
    });
    expect(rules).toEqual([
      ['my_panel-hidden', { when: { my_panel: 'hidden' }, hide: ['provinceview/my_panel'] }],
      [
        'my_button-hidden',
        { when: { my_button: 'hidden' }, hide: ['provinceview/my_panel/my_button'] },
      ],
      [
        'my_icon-hidden',
        {
          when: { my_icon: 'hidden' },
          hide: ['provinceview/my_panel/my_icon[1]', 'provinceview/my_panel/my_icon[2]'],
        },
      ],
    ]);
  });

  it('takes the later entry of a name, as a later file wins', () => {
    const later = readCustomGui(
      'custom_button = { name = MY_BUTTON potential = { is_year = 1500 } }',
      'common/custom_gui/zz_override.txt',
    );
    const { selectors } = scriptedSkeleton(WINDOW, [...entries, ...later]);
    const button = selectors.find(([id]) => id === 'my_button')?.[1] as { note: string };
    expect(button.note).toBe(
      'common/custom_gui/zz_override.txt, custom_button: potential = { is_year = 1500 }',
    );
  });

  it('writes a profile file that Etch reads and checks without a problem', () => {
    const { selectors, rules } = scriptedSkeleton(WINDOW, entries);
    let text = withMembers(undefined, 'provinceview', 'selectors', selectors).text;
    text = withMembers(text, 'provinceview', 'rules', rules).text;
    const { file, diagnostics } = readProfile(text, PROJECT);
    expect(diagnostics).toEqual([]);
    if (file === undefined) throw new Error('not read');
    const checked = checkProfile(layerProfiles('provinceview', [file]), {
      window: WINDOW,
      positionType: () => false,
    });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.profile.selectors.map((s) => s.id)).toEqual([
      'my_panel',
      'my_button',
      'my_icon',
    ]);
    expect(checked.profile.rules).toHaveLength(3);
  });
});

// Made-up names: four religion panels, a tag panel tested once, and constant potentials.
const GROUPED = readGuiFile(
  parseScript(`guiTypes = {
  windowType = {
    name = "countryreligionview"
    iconType = { name = "faith_a" }
    iconType = { name = "faith_b" }
    iconType = { name = "faith_b2" }
    iconType = { name = "faith_c" }
    iconType = { name = "faith_root" }
    iconType = { name = "only_tag" }
    iconType = { name = "never_icon" }
    iconType = { name = "never_icon" }
    iconType = { name = "always_icon" }
  }
}`),
).definitions.find((w) => w.name === 'countryreligionview') as Widget;

const GROUPED_GUI = `custom_icon = { name = faith_a potential = { religion = faith_one } }
custom_icon = { name = faith_b potential = { religion = faith_two } }
custom_icon = { name = faith_b2 potential = { religion = faith_two } }
custom_icon = { name = faith_c potential = { religion = other } }
custom_icon = { name = faith_root potential = { religion = ROOT } }
custom_icon = { name = only_tag potential = { tag = AAA } }
custom_icon = { name = never_icon potential = { always = no } }
custom_icon = { name = always_icon potential = { ALWAYS = yes } }
`;

describe('scriptedSkeleton with constant and exclusive potentials', () => {
  const entries = readCustomGui(GROUPED_GUI, 'common/custom_gui/faiths.txt');

  it('reads the only test of a potential', () => {
    expect(entries.map((e) => e.test)).toEqual([
      { key: 'religion', value: 'faith_one' },
      { key: 'religion', value: 'faith_two' },
      { key: 'religion', value: 'faith_two' },
      { key: 'religion', value: 'other' },
      { key: 'religion', value: 'ROOT' },
      { key: 'tag', value: 'AAA' },
      { key: 'always', value: 'no' },
      { key: 'always', value: 'yes' },
    ]);
    expect(
      readCustomGui('custom_icon = { name = x potential = { a = 1 b = 2 } }', 'a.txt')[0]?.test,
    ).toBeUndefined();
    expect(
      readCustomGui('custom_icon = { name = x potential = { a > 1 } }', 'a.txt')[0]?.test,
    ).toBeUndefined();
  });

  it('leaves out always = yes and always hides always = no', () => {
    const { rules, alwaysShown, parts } = scriptedSkeleton(GROUPED, entries);
    expect(alwaysShown).toEqual(['always_icon']);
    expect(rules.find(([id]) => id === 'never_icon-never')).toEqual([
      'never_icon-never',
      {
        note: 'common/custom_gui/faiths.txt, custom_icon: potential = { always = no }: the game never shows it',
        hide: ['countryreligionview/never_icon[1]', 'countryreligionview/never_icon[2]'],
      },
    ]);
    expect(parts).toContainEqual({ rules: ['never_icon-never'] });
  });

  it('gives the widgets testing one single-valued trigger one selector', () => {
    const { selectors, rules, parts } = scriptedSkeleton(GROUPED, entries);
    // A test against a scope and a trigger tested once stay selectors of their own.
    expect(selectors.map(([id]) => id)).toEqual(['faith_root', 'only_tag', 'scripted-religion']);
    expect(selectors[2]?.[1]).toEqual({
      kind: 'scripted',
      label: 'religion (scripted)',
      values: {
        faith_one: 'faith_one',
        faith_two: 'faith_two',
        other: 'other',
        another: 'Another religion',
      },
      note: 'faith_a, faith_b, faith_b2, faith_c test religion against one value each, so at most one of them shows',
    });
    expect(rules.filter(([id]) => id.startsWith('scripted-religion'))).toEqual([
      [
        'scripted-religion-faith_one',
        {
          when: { 'scripted-religion': ['faith_two', 'other', 'another'] },
          hide: ['countryreligionview/faith_a'],
        },
      ],
      [
        'scripted-religion-faith_two',
        {
          when: { 'scripted-religion': ['faith_one', 'other', 'another'] },
          hide: ['countryreligionview/faith_b', 'countryreligionview/faith_b2'],
        },
      ],
      [
        'scripted-religion-other',
        {
          when: { 'scripted-religion': ['faith_one', 'faith_two', 'another'] },
          hide: ['countryreligionview/faith_c'],
        },
      ],
    ]);
    expect(parts).toContainEqual({
      selector: 'scripted-religion',
      rules: [
        'scripted-religion-faith_one',
        'scripted-religion-faith_two',
        'scripted-religion-other',
      ],
    });
  });

  it('writes a profile file that Etch reads and checks without a problem', () => {
    const { selectors, rules } = scriptedSkeleton(GROUPED, entries);
    let text = withMembers(undefined, 'countryreligionview', 'selectors', selectors).text;
    text = withMembers(text, 'countryreligionview', 'rules', rules).text;
    const origin = { ...PROJECT, file: '.etch/profiles/countryreligionview.jsonc' };
    const { file, diagnostics } = readProfile(text, origin);
    expect(diagnostics).toEqual([]);
    if (file === undefined) throw new Error('not read');
    const checked = checkProfile(layerProfiles('countryreligionview', [file]), {
      window: GROUPED,
      positionType: () => false,
    });
    expect(checked.diagnostics).toEqual([]);
    expect(checked.profile.rules).toHaveLength(rules.length);
  });
});

describe('withMembers', () => {
  it('adds to an existing file only the ids it does not have, keeping its comments', () => {
    const before = `{
  // My own profile.
  "formatVersion": 1,
  "window": "provinceview",
  "selectors": {
    "my_button": { "kind": "scripted", "label": "Mine", "values": { "a": "A" } }, // by hand
  },
}
`;
    const result = withMembers(before, 'provinceview', 'selectors', [
      ['my_button', { kind: 'scripted', label: 'Generated', values: { shown: 'Shown' } }],
      ['my_icon', { kind: 'scripted', label: 'my_icon', values: { shown: 'Shown' } }],
    ]);
    expect(result.added).toEqual(['my_icon']);
    expect(result.kept).toEqual(['my_button']);
    expect(result.text).toContain('// My own profile.');
    expect(result.text).toContain('"label": "Mine"');
    expect(result.text).not.toContain('Generated');
    const { diagnostics } = readProfile(result.text, PROJECT);
    expect(diagnostics).toEqual([]);
  });

  it('starts a blank file, and refuses a file or a section that is no object', () => {
    const blank = withMembers('  \n', 'provinceview', 'selectors', [
      ['a', { kind: 'scripted', label: 'A', values: { shown: 'Shown' } }],
    ]);
    expect(blank.added).toEqual(['a']);
    expect(readProfile(blank.text, PROJECT).diagnostics).toEqual([]);
    expect(() => withMembers('[]', 'provinceview', 'rules', [['r', {}]])).toThrow(
      'The file is not an object.',
    );
    expect(() =>
      withMembers('{ "formatVersion": 1, "rules": 2 }', 'provinceview', 'rules', [['r', {}]]),
    ).toThrow('"rules" is not an object.');
  });
});

describe('scriptedSkeleton ids', () => {
  it('gives names of one selector id a selector and a rule each, the later with a suffix', () => {
    const window = readGuiFile(
      parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    iconType = { name = "my.icon" }
    iconType = { name = "my-icon" }
  }
}`),
    ).definitions.find((w) => w.name === 'provinceview') as Widget;
    const scripted = readCustomGui(
      'custom_icon = { name = my.icon potential = { has_country_flag = a } }\n' +
        'custom_icon = { name = my-icon potential = { has_country_flag = b } }',
      'common/custom_gui/dots.txt',
    );
    const { selectors, rules } = scriptedSkeleton(window, scripted);
    expect(selectors.map(([id]) => id)).toEqual(['my-icon', 'my-icon-2']);
    expect(rules).toEqual([
      ['my-icon-hidden', { when: { 'my-icon': 'hidden' }, hide: ['provinceview/my.icon'] }],
      ['my-icon-2-hidden', { when: { 'my-icon-2': 'hidden' }, hide: ['provinceview/my-icon'] }],
    ]);
  });

  it('keeps a group selector apart from a widget named after it', () => {
    const window = readGuiFile(
      parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    iconType = { name = "tag_a" }
    iconType = { name = "tag_b" }
    iconType = { name = "scripted.tag" }
  }
}`),
    ).definitions.find((w) => w.name === 'provinceview') as Widget;
    const scripted = readCustomGui(
      'custom_icon = { name = tag_a potential = { tag = AAA } }\n' +
        'custom_icon = { name = tag_b potential = { tag = BBB } }\n' +
        'custom_icon = { name = scripted.tag potential = { has_country_flag = a } }',
      'common/custom_gui/tags.txt',
    );
    const { selectors } = scriptedSkeleton(window, scripted);
    expect(selectors.map(([id]) => id)).toEqual(['scripted-tag-2', 'scripted-tag']);
  });
});

describe('scriptedSkeleton with one potential for several widgets', () => {
  const window = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    iconType = { name = "page_a" }
    iconType = { name = "page_b" }
    iconType = { name = "page_c" }
    iconType = { name = "page_d" }
    iconType = { name = "other_page" }
  }
}`),
  ).definitions.find((w) => w.name === 'provinceview') as Widget;
  const scripted = readCustomGui(
    'custom_icon = { name = page_a potential = { has_country_flag = page_one } }\n' +
      'custom_icon = { name = page_b potential = {\n  has_country_flag=page_one # the first page\n} }\n' +
      'custom_icon = { name = page_c potential = { has_country_flag = page_one } }\n' +
      'custom_icon = { name = other_page potential = { has_country_flag = page_two } }\n' +
      'custom_icon = { name = page_d potential = { has_country_flag = page_one } }',
    'common/custom_gui/pages.txt',
  );

  it('gives widgets with the same potential one selector and one rule', () => {
    const { selectors, rules, parts } = scriptedSkeleton(window, scripted);
    expect(selectors.map(([id]) => id)).toEqual(['page_a', 'other_page']);
    const shared = selectors[0]?.[1] as { label: string; note: string };
    expect(shared.label).toBe('page_a and 3 more');
    expect(shared.note).toContain('the same potential as page_b, page_c, page_d');
    expect(rules).toEqual([
      [
        'page_a-hidden',
        {
          when: { page_a: 'hidden' },
          hide: [
            'provinceview/page_a',
            'provinceview/page_b',
            'provinceview/page_c',
            'provinceview/page_d',
          ],
        },
      ],
      ['other_page-hidden', { when: { other_page: 'hidden' }, hide: ['provinceview/other_page'] }],
    ]);
    expect(parts).toEqual([
      { selector: 'page_a', rules: ['page_a-hidden'] },
      { selector: 'other_page', rules: ['other_page-hidden'] },
    ]);
  });

  it('names both widgets of a pair in the label', () => {
    const pair = scripted.filter((entry) =>
      ['page_a', 'page_b', 'other_page'].includes(entry.name),
    );
    const { selectors } = scriptedSkeleton(window, pair);
    expect((selectors[0]?.[1] as { label: string }).label).toBe('page_a, page_b');
  });

  it('keeps a widget a lower layer has a selector of out of the shared one', () => {
    const hideOf = (rules: readonly (readonly [string, unknown])[], id: string): unknown =>
      (rules.find(([rule]) => rule === id)?.[1] as { hide: string[] } | undefined)?.hide;
    const later = scriptedSkeleton(window, scripted, undefined, new Set(['page_b']));
    expect(later.selectors.map(([id]) => id)).toEqual(['page_a', 'page_b', 'other_page']);
    expect((later.selectors[0]?.[1] as { label: string }).label).toBe('page_a and 2 more');
    expect(hideOf(later.rules, 'page_a-hidden')).toEqual([
      'provinceview/page_a',
      'provinceview/page_c',
      'provinceview/page_d',
    ]);
    expect(hideOf(later.rules, 'page_b-hidden')).toEqual(['provinceview/page_b']);
    // The first one taken: the next widget of that potential stands for the rest.
    const first = scriptedSkeleton(window, scripted, undefined, new Set(['page_a']));
    expect(first.parts).toEqual([
      { selector: 'page_a', rules: ['page_a-hidden'] },
      { selector: 'page_b', rules: ['page_b-hidden'] },
      { selector: 'other_page', rules: ['other_page-hidden'] },
    ]);
    expect(hideOf(first.rules, 'page_b-hidden')).toEqual([
      'provinceview/page_b',
      'provinceview/page_c',
      'provinceview/page_d',
    ]);
  });
});

describe('withSkeleton', () => {
  const entries = readCustomGui(CUSTOM_GUI, 'common/custom_gui/my_panel.txt');

  it("adds no rule for a selector the file already had, so the file's own values stay valid", () => {
    const before = `{
  "formatVersion": 1,
  "window": "provinceview",
  "selectors": {
    "my_button": { "kind": "scripted", "label": "Mine", "values": { "a": "A" } },
  },
}
`;
    const skeleton = scriptedSkeleton(WINDOW, entries);
    const result = withSkeleton(before, 'provinceview', skeleton);
    expect(result.selectors).not.toContain('my_button');
    expect(result.rules).not.toContain('my_button-hidden');
    expect(result.kept).toEqual(['my_button']);
    const { file, diagnostics } = readProfile(result.text, PROJECT);
    expect(diagnostics).toEqual([]);
    if (file === undefined) throw new Error('not read');
    const checked = checkProfile(layerProfiles('provinceview', [file]), {
      window: WINDOW,
      positionType: () => false,
    });
    expect(checked.diagnostics).toEqual([]);
  });

  it('keeps the selectors and the rules it added before, a second time', () => {
    const skeleton = scriptedSkeleton(WINDOW, entries);
    const first = withSkeleton(undefined, 'provinceview', skeleton);
    const again = withSkeleton(first.text, 'provinceview', skeleton);
    expect(again.text).toBe(first.text);
    expect(again.selectors).toEqual([]);
    expect(again.rules).toEqual([]);
    expect([...again.kept].sort()).toEqual([...first.selectors, ...first.rules].sort());
  });
});

describe('labels from localisation', () => {
  it('turns a localised text into a short plain label', () => {
    expect(plainLabelText('£no£ Is not allowed to §YDisable§! this')).toBe(
      'Is not allowed to Disable this',
    );
    expect(plainLabelText('Costs $COST$ gold for [Root.GetName]\\nNow')).toBe(
      'Costs … gold for … Now',
    );
    expect(plainLabelText('----- Federation Standing -----\\nRank: $RANK$')).toBe(
      'Federation Standing Rank: …',
    );
    expect(plainLabelText('§G£yes£§!')).toBeUndefined();
    expect(plainLabelText('word '.repeat(30))?.length).toBe(60);
  });

  it('labels a widget with its tooltip and a group value with its name', () => {
    const gui = `custom_icon = { name = faith_a potential = { religion = faith_one } }
custom_icon = { name = faith_b potential = { religion = faith_two } }
custom_icon = { name = only_tag potential = { tag = AAA } tooltip = only_tag_tt }
custom_icon = { name = faith_root potential = { religion = ROOT } tooltip = missing_tt }
`;
    const localisation: Record<string, string> = {
      only_tag_tt: '§YOpen§! the §Gtag§! panel',
      faith_one: 'First Faith',
    };
    const { selectors } = scriptedSkeleton(
      GROUPED,
      readCustomGui(gui, 'common/custom_gui/faiths.txt'),
      (key) => localisation[key],
    );
    const labels = Object.fromEntries(
      selectors.map(([id, s]) => [id, s as { label: string; values: object }]),
    );
    expect(labels['only_tag']?.label).toBe('only_tag: Open the tag panel');
    expect(labels['faith_root']?.label).toBe('faith_root');
    expect(labels['scripted-religion']?.values).toEqual({
      faith_one: 'First Faith',
      faith_two: 'faith_two',
      other: 'Another religion',
    });
  });
});
