import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import {
  FACTS,
  checkProfile,
  layerProfiles,
  otherVersionNotice,
  parseJsonc,
  profileModMatches,
  profilePattern,
  readProfile,
  widgetsAt,
  windowPaths,
  type ProfileFile,
  type ProfileOrigin,
} from '../src/profile/index.ts';

const WINDOW = readGuiFile(
  parseScript(`guiTypes = {
  positionType = { name = "big_pos" position = { x = 1 y = 2 } }
  windowType = {
    name = "provinceview"
    windowType = {
      name = "province_window"
      instantTextBoxType = { name = "tax_value" }
      windowType = { name = "queue_window" }
      windowType = { name = "foreign_province_window" }
      guiButtonType = { name = "close_button" }
    }
    windowType = { name = "state_window" guiButtonType = { name = "close_button" } }
    windowType = { name = "select_building" }
    windowType = { name = "select_building_large" }
    iconType = { name = "bg" }
    iconType = { name = "bg" }
  }
}`),
).definitions.find((w) => w.name === 'provinceview') as Widget;

const VANILLA: ProfileOrigin = { layer: 0, source: 'vanilla', file: 'vanilla/provinceview.jsonc' };
const PROJECT: ProfileOrigin = {
  layer: 1,
  source: 'mod project',
  file: '.etch/profiles/provinceview.jsonc',
};

function read(text: string, origin = VANILLA): ProfileFile {
  const { file, diagnostics } = readProfile(text, origin);
  expect(diagnostics).toEqual([]);
  if (file === undefined) throw new Error('not read');
  return file;
}

const BASE = `{
  // The vanilla province view.
  "formatVersion": 1,
  "window": "provinceview",
  "checkedWith": "1.37.5",
  "selectors": {
    "screen": {
      "kind": "resolution",
      "values": { "small": { "maxHeight": 813 }, "large": { "minHeight": 814 } },
    },
    "owner": { "kind": "data", "fact": "province.ownedByPlayer", "values": { "yes": "Own", "no": "Foreign" } },
    "tab": { "kind": "ui", "values": { "province": "Province", "state": "State" } },
  },
  "groups": {
    "tab": { "selector": "tab", "members": { "province": "provinceview/province_window", "state": "provinceview/state_window" } },
  },
  "rules": {
    "foreign": { "when": { "owner": "no" }, "hide": ["provinceview/province_window/queue_window"] },
    "big": { "when": { "screen": "large" }, "position": { "provinceview/province_window": "big_pos" } },
  },
  "views": {
    "own": { "label": "Own province", "set": { "owner": "yes", "tab": "province" } },
    "state": { "label": "State tab", "set": { "tab": "state" } },
  },
  "defaultView": "own",
}`;

describe('JSONC', () => {
  it('reads comments and trailing commas and keeps ranges', () => {
    const text = '{ /* a */ "a": [1, true, null,], // b\n "b": "x\\u0041" , }';
    const { root } = parseJsonc(text);
    expect(root?.kind).toBe('object');
    if (root?.kind !== 'object') return;
    expect(root.members.map((m) => m.key)).toEqual(['a', 'b']);
    const b = root.members[1];
    expect(b?.value).toMatchObject({ kind: 'string', value: 'xA' });
    expect(text.slice(b?.keyRange.start, b?.keyRange.end)).toBe('"b"');
  });

  it('stops at the first syntax error with its place', () => {
    const { root, error } = parseJsonc('{ "a": 1 "b": 2 }');
    expect(root).toBeUndefined();
    expect(error).toMatchObject({ message: 'Expected a comma or a closing brace', start: 9 });
  });
});

describe('reading a profile file', () => {
  it('reads every section in file order', () => {
    const file = read(BASE);
    expect(file.window).toBe('provinceview');
    expect(file.checkedWith).toBe('1.37.5');
    expect(file.selectors.map((s) => s.id)).toEqual(['screen', 'owner', 'tab']);
    const screen = file.selectors[0];
    expect(screen !== undefined && !('removed' in screen) && screen.values).toEqual([
      { id: 'small', label: 'small', maxHeight: 813 },
      { id: 'large', label: 'large', minHeight: 814 },
    ]);
    expect(file.defaultView?.id).toBe('own');
  });

  it('gives a data selector its fact values when it writes none', () => {
    const file = read(`{ "formatVersion": 1, "window": "w",
      "selectors": { "gp": { "kind": "data", "fact": "province.hasGreatProjects", "default": "no" } } }`);
    expect(file.selectors[0]).toMatchObject({
      values: [{ id: 'yes' }, { id: 'no' }],
      default: 'no',
    });
  });

  it('skips a faulty entry with an error at its place and keeps the rest', () => {
    const text = `{ "formatVersion": 1, "window": "w",
      "rules": {
        "bad": { "when": { "a": "b" }, "hdie": ["w/x"] },
        "good": { "hide": ["w/x"] }
      } }`;
    const { file, diagnostics } = readProfile(text, VANILLA);
    expect(file?.rules.map((r) => r.id)).toEqual(['good']);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', code: 'profile-format' });
    expect(text.slice(diagnostics[0]?.start, diagnostics[0]?.end)).toBe('"hdie"');
  });

  it('reports an unknown top-level property and applies the rest', () => {
    const { file, diagnostics } = readProfile(
      '{ "formatVersion": 1, "window": "w", "rulez": {} }',
      VANILLA,
    );
    expect(file?.window).toBe('w');
    expect(diagnostics.map((d) => d.message)).toEqual(['Unknown property "rulez".']);
  });

  it('skips a file with a newer formatVersion with a notice', () => {
    const { file, diagnostics } = readProfile('{ "formatVersion": 2, "window": "w" }', VANILLA);
    expect(file).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({ severity: 'warning', code: 'profile-newer-format' });
  });

  it('records null as the removal of a lower entry', () => {
    const file = read('{ "formatVersion": 1, "window": "w", "views": { "state": null } }', PROJECT);
    expect(file.views[0]).toMatchObject({ removed: true, id: 'state' });
  });

  it('refuses a rule without effects and bounds outside resolution selectors', () => {
    const { diagnostics } = readProfile(
      `{ "formatVersion": 1, "window": "w",
        "selectors": { "t": { "kind": "ui", "values": { "a": { "maxHeight": 3 } } } },
        "rules": { "r": { "when": { "t": "a" } } } }`,
      VANILLA,
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Only a resolution value has bounds.',
      'Rule "r" has no effect: show, hide, notCreated, position or frame.',
    ]);
  });
});

describe('layers', () => {
  it('replaces whole entries by key, adds new ones and removes with null', () => {
    const project = read(
      `{ "formatVersion": 1, "window": "provinceview",
        "rules": { "foreign": { "when": { "owner": "no" }, "hide": ["provinceview/province_window/tax_value"] } },
        "views": { "state": null, "mine": { "label": "Mine", "set": { "tab": "state" } } },
        "defaultView": "mine" }`,
      PROJECT,
    );
    const profile = layerProfiles('provinceview', [read(BASE), project]);
    expect(profile.rules.map((r) => r.id)).toEqual(['foreign', 'big']);
    expect(profile.rules[0]?.hide.map((h) => h.path)).toEqual([
      'provinceview/province_window/tax_value',
    ]);
    expect(profile.rules[0]?.origin).toBe(PROJECT);
    expect(profile.views.map((v) => v.id)).toEqual(['own', 'mine']);
    expect(profile.defaultView).toBe('mine');
    expect(profile.layers).toEqual([VANILLA, PROJECT]);
  });

  it('matches a source with a mod by Workshop id, else by name', () => {
    expect(
      profileModMatches({ remoteFileId: '1385440355' }, { name: 'X', workshopId: '1385440355' }),
    ).toBe(true);
    expect(
      profileModMatches(
        { remoteFileId: '1', name: 'Anbennar' },
        { name: 'anbennar', workshopId: '2' },
      ),
    ).toBe(false);
    expect(profileModMatches({ remoteFileId: '1', name: 'Anbennar' }, { name: 'anbennar' })).toBe(
      true,
    );
  });

  it('gives a notice for a file checked with another version', () => {
    const file = read(BASE);
    expect(otherVersionNotice(file, '1.37.5')).toBeUndefined();
    expect(otherVersionNotice(file, '1.38.0')).toMatchObject({
      severity: 'information',
      code: 'profile-other-version',
    });
  });
});

describe('paths', () => {
  it('writes paths as Tongs does, with [n] for siblings that share a name', () => {
    const paths = windowPaths(WINDOW).map((p) => p.path);
    expect(paths).toContain('provinceview/province_window/close_button');
    expect(paths).toContain('provinceview/bg[2]');
  });

  it('matches *, ** and names without regard to case', () => {
    const names = (path: string): string[] => widgetsAt(WINDOW, path).map((w) => w.name ?? '');
    expect(names('provinceview/**/close_button')).toEqual(['close_button', 'close_button']);
    expect(names('provinceview/Select_Building*')).toEqual([
      'select_building',
      'select_building_large',
    ]);
    expect(names('**/queue_window')).toEqual(['queue_window']);
    expect(names('provinceview/state_window/**')).toEqual(['close_button']);
    expect(names('provinceview/bg[2]')).toHaveLength(1);
    expect(profilePattern('a/**/**/b')).toHaveProperty('problem');
  });
});

describe('load checks', () => {
  const check = (...texts: string[]) =>
    checkProfile(
      layerProfiles(
        'provinceview',
        texts.map((text, layer) => read(text, layer === 0 ? VANILLA : PROJECT)),
      ),
      { window: WINDOW, positionType: (name) => name.toLowerCase() === 'big_pos' },
    );

  it('passes a sound profile unchanged', () => {
    const { profile, diagnostics } = check(BASE);
    expect(diagnostics).toEqual([]);
    expect(profile.rules).toHaveLength(2);
    expect(profile.defaultView).toBe('own');
  });

  it('skips entries with a missing path, an unknown selector or value, in the file that wrote them', () => {
    const project = `{ "formatVersion": 1, "window": "provinceview",
      "rules": {
        "path": { "hide": ["provinceview/nothing"] },
        "selector": { "when": { "nope": "x" }, "hide": ["provinceview/bg"] },
        "value": { "when": { "tab": "ledger" }, "hide": ["provinceview/bg"] },
        "move": { "position": { "provinceview/bg[1]": "small_pos" } }
      },
      "views": { "res": { "set": { "screen": "small" } } } }`;
    const { profile, diagnostics } = check(BASE, project);
    expect(profile.rules.map((r) => r.id)).toEqual(['foreign', 'big']);
    expect(profile.views.map((v) => v.id)).toEqual(['own', 'state']);
    expect(diagnostics.map((d) => [d.code, d.file])).toEqual([
      ['profile-unknown-path', PROJECT.file],
      ['profile-unknown-name', PROJECT.file],
      ['profile-unknown-value', PROJECT.file],
      ['profile-unknown-name', PROJECT.file],
      ['profile-unknown-name', PROJECT.file],
    ]);
    const missing = diagnostics[0];
    expect(project.slice(missing?.start, missing?.end)).toBe('"provinceview/nothing"');
  });

  it('checks facts and group members against the selector', () => {
    const { profile, diagnostics } = check(`{ "formatVersion": 1, "window": "provinceview",
      "selectors": {
        "fake": { "kind": "data", "fact": "province.isLovely", "values": { "yes": "y" } },
        "owner": { "kind": "data", "fact": "province.ownedByPlayer", "values": { "own": "y", "no": "n" } },
        "sub": { "kind": "ui", "values": { "none": "None", "queue": "Queue", "foreign": "Foreign" } }
      },
      "groups": {
        "strict": { "selector": "sub", "members": { "queue": "provinceview/province_window/queue_window" } },
        "loose": { "selector": "sub", "none": true, "members": { "queue": "provinceview/province_window/queue_window" } }
      } }`);
    expect(profile.selectors.map((s) => s.id)).toEqual(['sub']);
    expect(profile.groups.map((g) => g.id)).toEqual(['loose']);
    expect(diagnostics.map((d) => d.code)).toEqual([
      'profile-unknown-fact',
      'profile-unknown-fact',
      'profile-unknown-value',
    ]);
  });

  it('reports a default view no layer defines', () => {
    const { profile, diagnostics } = check(
      BASE,
      '{ "formatVersion": 1, "window": "provinceview", "defaultView": "gone" }',
    );
    expect(profile.defaultView).toBe('own');
    expect(diagnostics).toMatchObject([{ code: 'profile-unknown-name', file: PROJECT.file }]);
  });
});

describe('the JSON Schema', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../../profiles/window-profile.schema.json', import.meta.url), 'utf8'),
  ) as {
    properties: Record<string, unknown>;
    definitions: Record<string, { properties?: Record<string, { enum?: string[] }> }>;
  };

  it('names the facts Etch implements', () => {
    expect(schema.definitions['selector']?.properties?.['fact']?.enum).toEqual(
      FACTS.map((f) => f.name),
    );
  });

  it('has the properties the reader reads', () => {
    expect(Object.keys(schema.properties).sort()).toEqual([
      '$schema',
      'checkedWith',
      'content',
      'defaultView',
      'formatVersion',
      'groups',
      'links',
      'mod',
      'repeaters',
      'rules',
      'selectors',
      'views',
      'window',
    ]);
    const keys = (name: string): string[] =>
      Object.keys(schema.definitions[name]?.properties ?? {}).sort();
    expect(keys('selector')).toEqual(['default', 'fact', 'kind', 'label', 'note', 'values']);
    expect(keys('group')).toEqual(['label', 'members', 'none', 'selector']);
    expect(keys('rule')).toEqual([
      'frame',
      'hide',
      'notCreated',
      'note',
      'position',
      'show',
      'when',
    ]);
    expect(keys('view')).toEqual(['label', 'set', 'toggles']);
    const source = ['decimals', 'engine', 'format', 'generated', 'loc', 'save', 'transform'];
    expect(keys('source')).toEqual(source);
    expect(keys('content')).toEqual([...source, 'note'].sort());
    expect(keys('repeater')).toEqual(['count', 'fields', 'from', 'note', 'template']);
    expect(keys('link')).toEqual(['label', 'when', 'window']);
  });
});
