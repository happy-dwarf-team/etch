import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  layoutWindow,
  parseScript,
  readGuiFile,
  type LayoutInput,
  type Widget,
} from '../src/index.ts';
import {
  evaluateView,
  layerProfiles,
  layoutViewOf,
  readProfile,
  screenLayoutView,
  withView,
  widgetsAt,
  type WindowProfile,
} from '../src/profile/index.ts';
import { InterfaceIndex } from '../src/model/interface-index.ts';
import { profileVisibility, type CapturedWidget } from '../src/corpus/index.ts';

const FILE = readGuiFile(
  parseScript(`guiTypes = {
  positionType = { name = "top_section_position_big" position = { x = 42 y = -68 } }
  positionType = { name = "top_section_lowres_history_pos" position = { x = -25 y = 40 } }
  windowType = {
    name = "provinceview"
    size = { x = 400 y = 600 }
    windowType = {
      name = "top_section_window"
      position = { x = 42 y = 21 }
      size = { x = 100 y = 100 }
      iconType = { name = "history" position = { x = 5 y = 6 } }
    }
    windowType = {
      name = "province_window"
      size = { x = 10 y = 10 }
      windowType = { name = "queue_window" size = { x = 5 y = 5 } }
      windowType = { name = "foreign_province_window" size = { x = 5 y = 5 } }
      windowType = { name = "build_army_view" size = { x = 5 y = 5 } }
      windowType = { name = "build_navy_view" size = { x = 5 y = 5 } }
    }
    windowType = { name = "state_window" size = { x = 10 y = 10 } }
    windowType = { name = "select_building" size = { x = 10 y = 10 } }
    windowType = { name = "select_building_large" size = { x = 10 y = 10 } }
  }
}`),
);
const WINDOW = FILE.definitions.find((w) => w.name === 'provinceview') as Widget;
const SMALL = { width: 1280, height: 720 };
const LARGE = { width: 1920, height: 1080 };

function profile(text: string): WindowProfile {
  const { file, diagnostics } = readProfile(
    `{ "formatVersion": 1, "window": "provinceview", ${text} }`,
    { layer: 0, source: 'vanilla', file: 'provinceview.jsonc' },
  );
  expect(diagnostics).toEqual([]);
  return layerProfiles('provinceview', file === undefined ? [] : [file]);
}

const PROFILE = profile(`
  "selectors": {
    "screen": { "kind": "resolution", "values": { "small": { "maxHeight": 813 }, "large": { "minHeight": 814 } } },
    "owner": { "kind": "data", "fact": "province.ownedByPlayer" },
    "tab": { "kind": "ui", "values": { "province": "Province", "state": "State" } },
    "sub": { "kind": "ui", "values": { "none": "None", "army": "Build army", "navy": "Build navy" } }
  },
  "groups": {
    "tab": { "selector": "tab", "members": { "province": "provinceview/province_window", "state": "provinceview/state_window" } },
    "sub": { "selector": "sub", "none": true, "members": {
      "army": "provinceview/province_window/build_army_view", "navy": "provinceview/province_window/build_navy_view" } }
  },
  "rules": {
    "own": { "when": { "owner": "yes" }, "hide": ["provinceview/province_window/foreign_province_window"] },
    "foreign": { "when": { "owner": "no" }, "hide": ["provinceview/province_window/queue_window"] },
    "building": { "when": { "sub": ["army", "navy"] }, "hide": ["provinceview/province_window/*_window"] }
  }`);

const at = (path: string): Widget => widgetsAt(WINDOW, path)[0] as Widget;

describe('selectors', () => {
  it('takes the screen for resolution, then by hand, live, the save, the default', () => {
    const value = (choice: Parameters<typeof evaluateView>[3], id: string) =>
      evaluateView(PROFILE, WINDOW, SMALL, choice).selectors.find((s) => s.selector.id === id);
    expect(value({}, 'screen')).toMatchObject({ value: 'small', source: 'auto' });
    expect(value({ set: { screen: 'large' } }, 'screen')).toMatchObject({ value: 'small' });
    expect(value({}, 'owner')).toMatchObject({ value: 'yes', source: 'default' });
    const save = { facts: { 'province.ownedByPlayer': 'no' } };
    expect(value(save, 'owner')).toMatchObject({ value: 'no', source: 'save' });
    expect(value({ ...save, live: { owner: 'yes' } }, 'owner')).toMatchObject({ source: 'live' });
    expect(value({ ...save, set: { owner: 'yes' } }, 'owner')).toMatchObject({ source: 'you' });
    expect(value({ set: { owner: 'maybe' } }, 'owner')).toMatchObject({ source: 'default' });
  });
});

describe('widgets', () => {
  it('shows the member of the selector value of each group', () => {
    const view = evaluateView(PROFILE, WINDOW, LARGE, { set: { tab: 'state' } });
    expect(view.drawn(at('provinceview/state_window'))).toBe(true);
    expect(view.drawn(at('provinceview/province_window'))).toBe(false);
    // Inside a hidden window nothing is drawn.
    expect(view.drawn(at('provinceview/province_window/queue_window'))).toBe(false);
    expect(view.groups.map((g) => [g.group.id, g.chosen])).toEqual([
      ['tab', 'state'],
      ['sub', undefined],
    ]);
  });

  it('applies the rules in order, later ones winning', () => {
    const foreign = evaluateView(PROFILE, WINDOW, LARGE, { set: { owner: 'no' } });
    expect(foreign.drawn(at('provinceview/province_window/queue_window'))).toBe(false);
    expect(foreign.drawn(at('provinceview/province_window/foreign_province_window'))).toBe(true);
    const army = evaluateView(PROFILE, WINDOW, LARGE, { set: { owner: 'no', sub: 'army' } });
    expect(army.drawn(at('provinceview/province_window/foreign_province_window'))).toBe(false);
    expect(army.widgets.get(at('provinceview/province_window/foreign_province_window'))?.why).toBe(
      'rule building',
    );
  });

  it('lets a hand toggle win over the profile, and counts it', () => {
    const queue = 'provinceview/province_window/queue_window';
    const view = evaluateView(PROFILE, WINDOW, LARGE, {
      set: { owner: 'no' },
      toggles: { [queue]: true, 'provinceview/nothing': false },
    });
    expect(view.handToggles).toBe(1);
    expect(view.widgets.get(at(queue))).toMatchObject({
      shown: true,
      profileShown: false,
      byHand: true,
      why: 'by hand (profile: hidden)',
    });
  });

  it('creates one of each _large pair by the screen height, which no toggle changes', () => {
    const small = evaluateView(PROFILE, WINDOW, SMALL, {
      toggles: { 'provinceview/select_building_large': true },
    });
    expect(small.drawn(at('provinceview/select_building'))).toBe(true);
    expect(small.drawn(at('provinceview/select_building_large'))).toBe(false);
    expect(small.widgets.get(at('provinceview/select_building_large'))).toMatchObject({
      created: false,
      why: 'not created below 814 px',
    });
    const large = evaluateView(PROFILE, WINDOW, LARGE);
    expect(large.drawn(at('provinceview/select_building'))).toBe(false);
    expect(large.drawn(at('provinceview/select_building_large'))).toBe(true);
  });
});

describe('layout of a view', () => {
  const input = (view: ReturnType<typeof evaluateView>, screen = LARGE): LayoutInput => ({
    file: FILE,
    index: InterfaceIndex.of([], [{ path: 'interface/provinceview.gui', file: FILE }]),
    exists: () => false,
    assets: { textureSize: () => undefined, font: () => undefined },
    screen,
    view: layoutViewOf(view),
  });

  it('neither lays out nor draws what the view hides', () => {
    const layout = layoutWindow(
      WINDOW,
      input(evaluateView(PROFILE, WINDOW, LARGE, { set: { tab: 'state' } })),
    );
    const names = layout.widgets.map((w) => w.widget.name);
    expect(names).toContain('state_window');
    expect(names).not.toContain('province_window');
    expect(names).not.toContain('queue_window');
    expect(names).not.toContain('select_building');
  });

  it("applies the engine's positionType moves of the screen height", () => {
    const rect = (screen: typeof LARGE, name: string) =>
      layoutWindow(WINDOW, input(evaluateView(PROFILE, WINDOW, screen), screen)).widgets.find(
        (w) => w.widget.name === name,
      );
    expect(rect(LARGE, 'top_section_window')).toMatchObject({ x: 42, y: -68 });
    expect(rect(LARGE, 'history')).toMatchObject({ x: 47, y: -62 });
    expect(rect(SMALL, 'top_section_window')).toMatchObject({ x: 42, y: 21 });
    expect(rect(SMALL, 'history')).toMatchObject({ x: 17, y: 61 });
  });

  it('applies the screen rules to a window without a profile too (etch#272)', () => {
    const layout = (screen: typeof LARGE) =>
      layoutWindow(WINDOW, {
        ...input(evaluateView(PROFILE, WINDOW, screen), screen),
        view: screenLayoutView(WINDOW, screen),
      });
    const large = layout(LARGE);
    expect(large.widgets.find((w) => w.widget.name === 'top_section_window')).toMatchObject({
      x: 42,
      y: -68,
    });
    expect(large.widgets.map((w) => w.widget.name)).not.toContain('select_building');
    expect(large.widgets.map((w) => w.widget.name)).toContain('select_building_large');
    // Nothing else is hidden: without a profile every other widget is drawn.
    expect(large.widgets.map((w) => w.widget.name)).toContain('state_window');
    expect(large.widgets.map((w) => w.widget.name)).toContain('queue_window');
    const small = layout(SMALL);
    expect(small.widgets.find((w) => w.widget.name === 'history')).toMatchObject({ x: 17, y: 61 });
    expect(small.widgets.map((w) => w.widget.name)).not.toContain('select_building_large');
  });

  it('moves what a rule names', () => {
    const moved = profile(
      `"rules": { "m": { "position": { "provinceview/state_window": "top_section_lowres_history_pos" } } }`,
    );
    const layout = layoutWindow(WINDOW, input(evaluateView(moved, WINDOW, LARGE)));
    expect(layout.widgets.find((w) => w.widget.name === 'state_window')).toMatchObject({
      x: -25,
      y: 40,
    });
  });
});

describe('Save as view', () => {
  const view = { label: 'Mine', set: { tab: 'state' }, toggles: { 'provinceview/bg': false } };

  it('writes a new file with the view', () => {
    const text = withView(undefined, 'provinceview', 'mine', view);
    const { file, diagnostics } = readProfile(text, { layer: 2, source: 'mod project', file: 'p' });
    expect(diagnostics).toEqual([]);
    expect(file?.views[0]).toMatchObject({
      id: 'mine',
      label: 'Mine',
      set: [{ selector: 'tab', value: 'state' }],
    });
  });

  it('adds a view to a file, keeping its comments, and replaces one of the same id', () => {
    const before = `{
  // Mine.
  "formatVersion": 1,
  "window": "provinceview",
  "views": {
    "a": { "label": "A" } // the first
  }
}`;
    const added = withView(before, 'provinceview', 'mine', view);
    expect(added).toContain('// the first');
    const read = (text: string) =>
      readProfile(text, { layer: 2, source: 'mod project', file: 'p' });
    expect(read(added).diagnostics).toEqual([]);
    expect(read(added).file?.views.map((v) => v.id)).toEqual(['a', 'mine']);
    const replaced = withView(added, 'provinceview', 'a', { ...view, label: 'New A' });
    expect(read(replaced).file?.views.map((v) => ('label' in v ? v.label : ''))).toEqual([
      'New A',
      'Mine',
    ]);
    const noViews = withView(
      '{ "formatVersion": 1, "window": "provinceview", }',
      'provinceview',
      'mine',
      view,
    );
    expect(read(noViews).file?.views.map((v) => v.id)).toEqual(['mine']);
    expect(() =>
      withView('{ "formatVersion": 1 "window": 2 }', 'provinceview', 'x', view),
    ).toThrow();
  });
});

describe('profileVisibility', () => {
  const captured = (
    path: string,
    visible: boolean,
    children: CapturedWidget[] = [],
  ): CapturedWidget => ({
    path,
    name: path.split('/').pop() ?? '',
    type: 'window',
    visible,
    rect: { x: 0, y: 0, w: 1, h: 1 },
    children,
  });

  it('compares every widget of the window with what the game showed', () => {
    const top = (visible: boolean): CapturedWidget =>
      captured('provinceview/top_section_window', visible, [
        { ...captured('provinceview/top_section_window/history', true), text: '' },
      ]);
    const root = captured('provinceview', true, [
      top(true),
      captured('provinceview/province_window', true, [
        captured('provinceview/province_window/queue_window', true),
        captured('provinceview/province_window/foreign_province_window', true),
        captured('provinceview/province_window/build_army_view', false),
      ]),
      captured('provinceview/state_window', false),
    ]);
    const own = profileVisibility(
      PROFILE,
      WINDOW,
      LARGE,
      { owner: 'yes', tab: 'province', sub: 'none', other: 'x' },
      root,
    );
    expect(own.window).toBe('provinceview');
    expect(own.mismatches).toEqual([
      { path: 'provinceview/province_window/foreign_province_window', game: true },
    ]);
    // Every captured widget but the empty text history, which draws nothing either way;
    // build_navy_view is in the window but the game did not build it.
    expect(own.compared).toBe(7);
    // A widget the profile does not name is drawn: the game hiding it is a mismatch.
    const hidden = profileVisibility(
      PROFILE,
      WINDOW,
      LARGE,
      { owner: 'yes', tab: 'province', sub: 'none' },
      { ...root, children: [top(false), ...(root.children ?? []).slice(1)] },
    );
    expect(hidden.mismatches.map((m) => m.path)).toEqual([
      'provinceview/top_section_window',
      'provinceview/top_section_window/history',
      'provinceview/province_window/foreign_province_window',
    ]);
    // Tongs counts a widget wholly outside the screen hidden for where it is (tongs#74): whether
    // the game shows it is not known, so it is left out with what is inside it.
    const parked = profileVisibility(
      PROFILE,
      WINDOW,
      LARGE,
      { owner: 'yes', tab: 'province', sub: 'none' },
      {
        ...root,
        children: [
          { ...top(false), rect: { x: 119415, y: -2, w: 131, h: 37 } },
          ...(root.children ?? []).slice(1),
        ],
      },
    );
    expect(parked.mismatches.map((m) => m.path)).toEqual([
      'provinceview/province_window/foreign_province_window',
    ]);
    expect(parked.compared).toBe(6);
    const foreign = profileVisibility(
      PROFILE,
      WINDOW,
      LARGE,
      { owner: 'no', tab: 'province', sub: 'none' },
      root,
    );
    expect(foreign.mismatches.map((m) => m.path)).toEqual([
      'provinceview/province_window/queue_window',
    ]);
  });
});

describe("the ledger's pages (the coverage survey)", () => {
  const file = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "ledger"
    size = { x = 100 y = 100 }
    listboxType = { name = "default_listbox" size = { x = 50 y = 50 } }
    windowType = { name = "ledger_index" size = { x = 50 y = 50 } }
  }
}`),
  );
  const window = file.definitions[0] as Widget;
  const written = readProfile(
    readFileSync(new URL('../../../profiles/vanilla/ledger.jsonc', import.meta.url), 'utf8'),
    { layer: 0, source: 'vanilla', file: 'ledger.jsonc' },
  ).file;
  const profile = layerProfiles('ledger', written === undefined ? [] : [written]);
  const drawn = (page: string) => {
    const view = evaluateView(profile, window, LARGE, { set: { page } });
    return ['default_listbox', 'ledger_index'].filter((name) =>
      widgetsAt(window, `ledger/${name}`).some((w) => view.drawn(w)),
    );
  };

  it('shows the index or the table', () => {
    expect(drawn('index')).toEqual(['ledger_index']);
    expect(drawn('table')).toEqual(['default_listbox']);
  });
});

describe("the lobby's chosen country (the coverage survey)", () => {
  const file = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "country_selection_panel"
    size = { x = 100 y = 100 }
    windowType = { name = "lobby" size = { x = 100 y = 100 }
      windowType = { name = "right" size = { x = 100 y = 100 }
        windowType = { name = "no_player" size = { x = 10 y = 10 } }
        windowType = { name = "singleplayer" size = { x = 10 y = 10 } }
      }
    }
  }
}`),
  );
  const window = file.definitions[0] as Widget;
  const written = readProfile(
    readFileSync(
      new URL('../../../profiles/vanilla/country_selection_panel.jsonc', import.meta.url),
      'utf8',
    ),
    { layer: 0, source: 'vanilla', file: 'country_selection_panel.jsonc' },
  ).file;
  const profile = layerProfiles('country_selection_panel', written === undefined ? [] : [written]);
  const drawn = (country: string) => {
    const view = evaluateView(profile, window, LARGE, { set: { page: 'lobby', country } });
    return ['no_player', 'singleplayer'].filter((name) =>
      widgetsAt(window, `country_selection_panel/lobby/right/${name}`).some((w) => view.drawn(w)),
    );
  };

  it('hides the lobby on the main menu, and the main menu on its other pages', () => {
    const shown = (page: string) => {
      const view = evaluateView(profile, window, LARGE, { set: { page } });
      return widgetsAt(window, 'country_selection_panel/lobby').some((w) => view.drawn(w));
    };
    expect(['main-menu', 'lobby', 'nation-designer', 'credits', 'settings'].map(shown)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it("shows the country's panel once one is chosen", () => {
    expect(drawn('none')).toEqual(['no_player']);
    expect(drawn('chosen')).toEqual(['singleplayer']);
  });
});

describe('size steps of a country view (etch#274)', () => {
  const file = readGuiFile(
    parseScript(`guiTypes = {
  positionType = { name = "countrysubjectsview_scaling_large_min_inc" position = { x = 900 y = 148 } }
  positionType = { name = "countrysubjectsview_scaling_huge_min_inc" position = { x = 1080 y = 328 } }
  windowType = {
    name = "countrysubjectview"
    size = { x = 600 y = 600 }
    listboxType = { name = "subjects_listbox" position = { x = 10 y = 20 } size = { x = 50 y = 100 } }
    windowType = { name = "country_subjects_info" position = { x = 0 y = 0 } size = { x = 10 y = 10 } }
    windowType = { name = "subject_military_focus_window" position = { x = 520 y = 455 } size = { x = 10 y = 10 } }
    windowType = { name = "other" position = { x = 5 y = 5 } size = { x = 10 y = 10 } }
  }
}`),
  );
  const window = file.definitions.find((w) => w.name === 'countrysubjectview') as Widget;
  const rects = (height: number) => {
    const screen = { width: 1920, height };
    const layout = layoutWindow(window, {
      file,
      index: InterfaceIndex.of([], [{ path: 'interface/countrysubjectsview.gui', file }]),
      exists: () => false,
      assets: { textureSize: () => undefined, font: () => undefined },
      screen,
      view: screenLayoutView(window, screen),
    });
    const rect = (name: string) => {
      const w = layout.widgets.find((l) => l.widget.name === name);
      return w === undefined ? undefined : [w.x, w.y, w.width, w.height];
    };
    return {
      info: rect('country_subjects_info'),
      focus: rect('subject_military_focus_window'),
      list: rect('subjects_listbox'),
      other: rect('other'),
    };
  };

  it('moves and lengthens what the game does by the step the screen reaches', () => {
    expect(rects(720)).toEqual({
      info: [0, 0, 10, 10],
      focus: [520, 455, 10, 10],
      list: [10, 20, 50, 100],
      other: [5, 5, 10, 10],
    });
    expect(rects(900)).toMatchObject({
      info: [0, 148, 10, 10],
      list: [10, 20, 50, 248],
      other: [5, 5, 10, 10],
    });
    expect(rects(1080)).toMatchObject({
      info: [0, 328, 10, 10],
      focus: [520, 783, 10, 10],
      list: [10, 20, 50, 428],
    });
  });

  it('moves a button further than the step where the game does, only when a step applies', () => {
    const diplomacy = readGuiFile(
      parseScript(`guiTypes = {
  positionType = { name = "countrydiploview_scaling_large_min_inc" position = { x = 900 y = 114 } }
  positionType = { name = "countrydiploview_scaling_huge_min_inc" position = { x = 1080 y = 304 } }
  windowType = {
    name = "countrydiplomacyview"
    size = { x = 600 y = 600 }
    guiButtonType = { name = "button_createvassals" position = { x = 394 y = 521 } }
    guiButtonType = { name = "button_view_player_country" position = { x = 394 y = 521 } }
  }
}`),
    );
    const view = diplomacy.definitions.find((w) => w.name === 'countrydiplomacyview') as Widget;
    const ys = (height: number) => {
      const screen = { width: 1920, height };
      const layout = layoutWindow(view, {
        file: diplomacy,
        index: InterfaceIndex.of(
          [],
          [{ path: 'interface/countrydiplomacyview.gui', file: diplomacy }],
        ),
        exists: () => false,
        assets: { textureSize: () => undefined, font: () => undefined },
        screen,
        view: screenLayoutView(view, screen),
      });
      return layout.widgets.slice(1).map((w) => w.y);
    };
    expect(ys(720)).toEqual([521, 521]);
    expect(ys(900)).toEqual([640, 635]);
    expect(ys(1080)).toEqual([830, 825]);
  });
});

describe('a row of top-level widgets (etch#278)', () => {
  const file = readGuiFile(
    parseScript(`guiTypes = {
  guiButtonType = { name = "shield" position = { x = 0 y = 0 } Orientation = "UPPER_LEFT" }
  positionType = { name = "shield_position" position = { x = -13 y = -270 } }
  positionType = { name = "shield_offset" position = { x = 70 y = 0 } }
}`),
  );
  const shield = file.definitions.find((w) => w.name === 'shield') as Widget;
  const at = (width: number, height: number, instance?: { index: number; count: number }) => {
    const screen = { width, height };
    const layout = layoutWindow(shield, {
      file,
      index: InterfaceIndex.of([], [{ path: 'interface/frontend.gui', file }]),
      exists: () => false,
      assets: { textureSize: () => undefined, font: () => undefined },
      screen,
      view: screenLayoutView(shield, screen),
      ...(instance === undefined ? {} : { instance }),
    });
    const w = layout.widgets[0];
    return w === undefined ? undefined : [w.x, w.y];
  };

  it('places each bookmark shield in the row the game centers near the bottom', () => {
    // The coverage survey's vanilla menu: eleven shields.
    expect(at(1920, 1080, { index: 0, count: 11 })).toEqual([562, 810]);
    expect(at(1920, 1080, { index: 10, count: 11 })).toEqual([1262, 810]);
    expect(at(1280, 720, { index: 0, count: 11 })).toEqual([242, 450]);
    // Alone, a shield takes the middle of the row.
    expect(at(1920, 1080)).toEqual([912, 810]);
  });
});

describe("a rule's offset (the diplomacy view's labels)", () => {
  const file = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "countrydiplomacyview"
    size = { x = 600 y = 600 }
    iconType = { name = "secondary_religion_icon" position = { x = 100 y = 120 } }
    iconType = { name = "religious_school_icon" position = { x = 100 y = 120 } }
    instantTextBoxType = { name = "label_nation" position = { x = 132 y = 123 } maxWidth = 200 maxHeight = 32 }
    instantTextBoxType = { name = "label_fog" position = { x = 132 y = 145 } maxWidth = 170 maxHeight = 24 }
  }
}`),
  );
  const window = file.definitions.find((w) => w.name === 'countrydiplomacyview') as Widget;
  const { file: written, diagnostics } = readProfile(
    `{ "formatVersion": 1, "window": "countrydiplomacyview",
      "selectors": { "religionIcon": { "kind": "data", "label": "Religion icon", "fact": "country.religionIcon",
        "values": { "none": "None", "secondary": "Secondary", "school": "School" } } },
      "groups": { "religionIcon": { "selector": "religionIcon", "none": true, "members": {
        "secondary": "countrydiplomacyview/secondary_religion_icon",
        "school": "countrydiplomacyview/religious_school_icon" } } },
      "rules": { "labels": { "when": { "religionIcon": "none" }, "offset": {
        "countrydiplomacyview/label_nation": { "x": -20 },
        "countrydiplomacyview/label_fog": { "x": -20 } } } } }`,
    { layer: 0, source: 'vanilla', file: 'countrydiplomacyview.jsonc' },
  );
  const labels = (icon: string) => {
    expect(diagnostics).toEqual([]);
    const profile = layerProfiles('countrydiplomacyview', written === undefined ? [] : [written]);
    const view = evaluateView(profile, window, LARGE, { facts: { 'country.religionIcon': icon } });
    const layout = layoutWindow(window, {
      file,
      index: InterfaceIndex.of([], [{ path: 'interface/countrydiplomacyview.gui', file }]),
      exists: () => false,
      assets: { textureSize: () => undefined, font: () => undefined },
      screen: LARGE,
      view: layoutViewOf(view),
    });
    const at = (name: string) => {
      const w = layout.widgets.find((l) => l.widget.name === name);
      return w === undefined ? undefined : [w.x, w.y];
    };
    return { nation: at('label_nation'), fog: at('label_fog') };
  };

  it('moves the labels 20 px left without a religion icon, as eu4.exe does', () => {
    expect(labels('none')).toEqual({ nation: [112, 123], fog: [112, 145] });
    expect(labels('secondary')).toEqual({ nation: [132, 123], fog: [132, 145] });
    expect(labels('school')).toEqual({ nation: [132, 123], fog: [132, 145] });
  });
});

describe('the diplomacy view of another country (the coverage survey)', () => {
  const file = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "countrydiplomacyview"
    size = { x = 100 y = 100 }
    instantTextBoxType = { name = "sort_name" maxWidth = 50 }
    listboxType = { name = "diploaction_list" size = { x = 50 y = 50 } }
    instantTextBoxType = { name = "label_rivals" maxWidth = 50 }
  }
}`),
  );
  const window = file.definitions[0] as Widget;
  const written = readProfile(
    readFileSync(
      new URL('../../../profiles/vanilla/countrydiplomacyview.jsonc', import.meta.url),
      'utf8',
    ),
    { layer: 0, source: 'vanilla', file: 'countrydiplomacyview.jsonc' },
  ).file;
  const profile = layerProfiles('countrydiplomacyview', written === undefined ? [] : [written]);
  const drawn = (country: string) => {
    const view = evaluateView(profile, window, LARGE, { set: { country } });
    return ['sort_name', 'diploaction_list', 'label_rivals'].filter((name) =>
      widgetsAt(window, `countrydiplomacyview/${name}`).some((w) => view.drawn(w)),
    );
  };

  it("shows the relations list for the player's country and the action list for another", () => {
    expect(drawn('own')).toEqual(['sort_name']);
    expect(drawn('other')).toEqual(['diploaction_list', 'label_rivals']);
  });
});

describe('the military tab with Cradle of Civilization (etch#254)', () => {
  const file = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "countrymilitaryview"
    show_position = { x = 0 y = 140 }
    size = { x = 1024 y = 600 }
    windowType = { name = "army_professionalism" position = { x = 32 y = 96 } size = { x = 280 y = 16 } }
    iconType = { name = "CoCbackground" position = { x = -7 y = -10 } }
    guiButtonType = { name = "close_button" position = { x = 514 y = -1 } }
    instantTextBoxType = { name = "window_title" position = { x = 15 y = 78 } maxWidth = 512 maxHeight = 20 }
    guiButtonType = { name = "infantry_type_button" position = { x = 57 y = 134 } }
  }
}`),
  );
  const window = file.definitions[0] as Widget;
  const shipped = readFileSync(
    new URL('../../../profiles/vanilla/countrymilitaryview.jsonc', import.meta.url),
    'utf8',
  );
  const { file: written, diagnostics } = readProfile(shipped, {
    layer: 0,
    source: 'vanilla',
    file: 'countrymilitaryview.jsonc',
  });
  const placed = (cradle: string) => {
    expect(diagnostics).toEqual([]);
    const profile = layerProfiles('countrymilitaryview', written === undefined ? [] : [written]);
    const view = evaluateView(profile, window, LARGE, {
      facts: { 'game.cradleOfCivilization': cradle },
    });
    const layout = layoutWindow(window, {
      file,
      index: InterfaceIndex.of([], [{ path: 'interface/countrymilitaryview.gui', file }]),
      exists: () => false,
      assets: { textureSize: () => undefined, font: () => undefined },
      screen: LARGE,
      view: layoutViewOf(view),
    });
    const at = (name: string) => {
      const w = layout.widgets.find((l) => l.widget.name === name);
      return w === undefined ? undefined : w.y;
    };
    return [
      'countrymilitaryview',
      'army_professionalism',
      'CoCbackground',
      'close_button',
      'window_title',
      'infantry_type_button',
    ].map(at);
  };

  it('moves the tab down by army_professionalism, keeping its background, close button and title', () => {
    // The survey's captures: the tab at y 156, infantry_type_button at 290, the title at 218.
    expect(placed('yes')).toEqual([156, 252, 130, 139, 218, 290]);
    expect(placed('no')).toEqual([140, 236, 130, 139, 218, 274]);
  });
});

describe("a rule's hidePosition (the menubar's war overview button)", () => {
  const file = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "menubar"
    size = { x = 2048 y = 100 }
    fullScreen = yes
    windowType = { name = "messagelog_window" position = { x = -1325 y = -100 } show_position = { x = -1325 y = -100 } hide_position = { x = -1325 y = 10 } size = { x = 770 y = 100 } Orientation = "LOWER_RIGHT" }
    windowType = { name = "WarOverviewButtonWindow" position = { x = -840 y = -65 } show_position = { x = -840 y = -175 } hide_position = { x = -840 y = -65 } size = { x = 300 y = 40 } Orientation = "LOWER_RIGHT" }
  }
}`),
  );
  const window = file.definitions.find((w) => w.name === 'menubar') as Widget;
  const { file: written, diagnostics } = readProfile(
    `{ "formatVersion": 1, "window": "menubar",
      "selectors": { "messageLog": { "kind": "ui", "label": "Message log", "values": { "closed": "Closed", "open": "Open" } } },
      "groups": { "messageLog": { "selector": "messageLog", "none": true, "members": { "open": "menubar/messagelog_window" } } },
      "rules": { "below": { "when": { "messageLog": "closed" }, "hidePosition": ["menubar/WarOverviewButtonWindow"] } } }`,
    { layer: 0, source: 'vanilla', file: 'menubar.jsonc' },
  );
  const button = (log: string) => {
    expect(diagnostics).toEqual([]);
    const profile = layerProfiles('menubar', written === undefined ? [] : [written]);
    const view = evaluateView(profile, window, LARGE, { set: { messageLog: log } });
    const layout = layoutWindow(window, {
      file,
      index: InterfaceIndex.of([], [{ path: 'interface/menubar.gui', file }]),
      exists: () => false,
      assets: { textureSize: () => undefined, font: () => undefined },
      screen: LARGE,
      view: layoutViewOf(view),
    });
    const w = layout.widgets.find((l) => l.widget.name === 'WarOverviewButtonWindow');
    return w === undefined ? undefined : [w.x, w.y];
  };

  it('keeps the button at its hide_position while the log is closed', () => {
    expect(button('closed')).toEqual([1080, 1015]);
    expect(button('open')).toEqual([1080, 905]);
  });
});
