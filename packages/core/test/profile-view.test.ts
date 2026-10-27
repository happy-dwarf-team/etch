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
  widgetsAt,
  type WindowProfile,
} from '../src/profile/index.ts';
import { InterfaceIndex } from '../src/model/interface-index.ts';

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
