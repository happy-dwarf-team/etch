import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import {
  checkProfile,
  layerProfiles,
  readCustomGui,
  readProfile,
  scriptedSkeleton,
  withMembers,
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
\tpotential = { always = yes }
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
});
