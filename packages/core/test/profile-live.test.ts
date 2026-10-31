import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import {
  evaluateView,
  layerProfiles,
  liveDifferences,
  liveMatch,
  liveSelectors,
  liveWidgetsOf,
  readLiveSnapshot,
  readProfile,
  widgetsAt,
  type LiveSnapshot,
  type PluginWidget,
  type WindowProfile,
} from '../src/profile/index.ts';

const FILE = readGuiFile(
  parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    windowType = {
      name = "province_window"
      windowType = { name = "queue_window" }
      windowType = { name = "foreign_province_window" }
      instantTextBoxType = { name = "culture" }
      listboxType = { name = "rows" }
    }
    windowType = { name = "state_window" }
    iconType = { name = "extra" }
  }
}`),
);
const WINDOW = FILE.definitions[0] as Widget;
const SCREEN = { width: 1920, height: 1080 };

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
    "tab": { "kind": "ui", "values": { "province": "Province", "state": "State" } }
  },
  "groups": {
    "tab": { "selector": "tab", "members": { "province": "provinceview/province_window", "state": "provinceview/state_window" } }
  },
  "rules": {
    "own": { "when": { "owner": "yes" }, "hide": ["provinceview/province_window/foreign_province_window"] },
    "foreign": { "when": { "owner": "no" }, "hide": ["provinceview/province_window/queue_window"] }
  }`);

const w = (path: string, visible: boolean, more: Partial<PluginWidget> = {}): PluginWidget => ({
  path,
  type: 'window',
  visible,
  enabled: true,
  checked: false,
  text: undefined,
  rect: [0, 0, 1, 1],
  ...more,
});

const snapshot = (
  widgets: PluginWidget[],
  screen = { width: 1280, height: 720 },
): LiveSnapshot => ({
  formatVersion: 1,
  window: 'provinceview',
  takenAt: '2026-10-27T06:00:00.000Z',
  screen,
  widgets: liveWidgetsOf(widgets),
  stale: 0,
});

// A foreign province on the province tab: the queue hidden, the foreign window shown.
const FOREIGN = [
  w('provinceview', true),
  w('provinceview/province_window', true),
  w('provinceview/province_window/queue_window', false),
  w('provinceview/province_window/foreign_province_window', true),
  w('provinceview/province_window/culture', true, { type: 'text', text: 'Svea' }),
  w('provinceview/province_window/rows', true, { type: 'listbox' }),
  w('provinceview/province_window/rows/culture_item[1]', true),
  w('provinceview/province_window/rows/culture_item[1]/name', true, {
    type: 'text',
    text: 'Swedish',
  }),
  w('provinceview/province_window/rows/culture_item[2]', true),
  w('provinceview/province_window/rows/culture_item[2]/name', true, {
    type: 'text',
    text: 'Finnish',
  }),
  w('provinceview/province_window/rows/scrollbar', true, { type: 'other' }),
  w('provinceview/state_window', false),
  w('provinceview/extra', false, { type: 'icon' }),
];

describe('liveWidgetsOf', () => {
  it('numbers a list box’s rows by position and keeps everything else', () => {
    const paths = liveWidgetsOf(FOREIGN).map((x) => x.path);
    expect(paths).toContain('provinceview/province_window/rows/row[1]/name');
    expect(paths).toContain('provinceview/province_window/rows/row[2]');
    expect(paths).toContain('provinceview/province_window/rows/scrollbar');
    expect(paths).toContain('provinceview/province_window/culture');
  });
});

describe('liveMatch', () => {
  it('gives the texts by path, rows by position, and counts those the window lacks', () => {
    const match = liveMatch(
      snapshot([
        ...FOREIGN,
        w('provinceview/gone', true, { type: 'text', text: 'old' }),
        // Copies the game's code builds under a widget of the file do not count.
        w('provinceview/province_window/unit[2]', false),
        w('provinceview/province_window/unit[2]/unit_name', false, {
          type: 'text',
          text: 'Unit Type',
        }),
      ]),
      WINDOW,
    );
    expect(match.texts.text('ProvinceView/province_window/culture')).toBe('Svea');
    expect(match.texts.text('provinceview/province_window/rows/row[2]/name')).toBe('Finnish');
    expect(match.texts.text('provinceview/gone')).toBeUndefined();
    expect(match.unmatched).toBe(1);
  });

  it('gives the text with the game’s colour codes when the snapshot has them', () => {
    const match = liveMatch(
      snapshot([
        w('provinceview', true),
        w('provinceview/province_window', true),
        w('provinceview/province_window/culture', true, {
          type: 'text',
          text: '0.45',
          markup: '§G0.45§!',
        }),
      ]),
      WINDOW,
    );
    expect(match.texts.text('provinceview/province_window/culture')).toBe('§G0.45§!');
    const [plain] = liveWidgetsOf([w('x', true, { text: 'Svea', markup: 'Svea' })]);
    expect(plain).not.toHaveProperty('markup');
  });
});

describe('liveMatch with the profile', () => {
  const FILE_PLACED = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    windowType = { name = "general_buildings_window" }
    OverlappingElementsBoxType = { name = "cores_box" }
    listboxType = { name = "rows" }
    listboxType = { name = "hidden_rows" }
  }
  windowType = { name = "slot" instantTextBoxType = { name = "label" } guiButtonType = { name = "building" } }
  windowType = { name = "CoreShieldItem" }
}`),
  );
  const window = FILE_PLACED.definitions[0] as Widget;
  const placed = profile(`
    "repeaters": {
      "provinceview/general_buildings_window": { "template": "slot", "place": { "start": { "x": 0, "y": 0 } } },
      "provinceview/cores_box": { "template": "CoreShieldItem" },
      "provinceview/rows": { "template": "slot" },
      "provinceview/hidden_rows": { "template": "slot" }
    }`);
  const match = liveMatch(
    snapshot([
      w('provinceview', true),
      w('provinceview/general_buildings_window', true),
      w('provinceview/general_buildings_window/slot[1]', true),
      w('provinceview/general_buildings_window/slot[1]/building', true, {
        type: 'button',
        enabled: false,
      }),
      w('provinceview/general_buildings_window/slot[2]', true),
      w('provinceview/general_buildings_window/slot[2]/label', true, { type: 'text', text: '20' }),
      w('provinceview/general_buildings_window/slot[2]/building', false, { type: 'button' }),
      // A single entry has no [n]; core shields sit in the box or beside it.
      w('provinceview/cores_box', true, { type: 'other' }),
      w('provinceview/CoreShieldItem', true),
      w('provinceview/rows', true, { type: 'listbox' }),
      w('provinceview/hidden_rows', false, { type: 'listbox' }),
    ]),
    window,
    placed,
  );

  it("names the entries the game's code places as rows and counts them", () => {
    expect(match.texts.rows?.('provinceview/general_buildings_window')).toBe(2);
    expect(match.texts.text('provinceview/general_buildings_window/row[2]/label')).toBe('20');
    expect(match.texts.rows?.('provinceview/cores_box')).toBe(1);
    expect(match.unmatched).toBe(0);
  });

  it('gives each widget the state the game showed, and no rows for a list it hid', () => {
    expect(match.texts.state?.('provinceview/general_buildings_window/row[1]/building')).toEqual({
      visible: true,
      enabled: false,
      checked: false,
    });
    expect(
      match.texts.state?.('provinceview/general_buildings_window/row[2]/building')?.visible,
    ).toBe(false);
    // A shown list without rows has none; a hidden one leaves the number to the sample data.
    expect(match.texts.rows?.('provinceview/rows')).toBe(0);
    expect(match.texts.rows?.('provinceview/hidden_rows')).toBeUndefined();
  });
});

describe('liveSelectors', () => {
  it('takes the resolution from the game window and the values whose rules predict what it showed', () => {
    const live = liveSelectors(PROFILE, WINDOW, snapshot(FOREIGN));
    expect(live.values).toEqual({ screen: 'small', owner: 'no', tab: 'province' });
    expect(live.unknown).toEqual([]);
  });

  it('says unknown when no value predicts it, and the default when several do', () => {
    const both = FOREIGN.map((x) =>
      x.path.endsWith('queue_window') ? { ...x, visible: true } : x,
    );
    const live = liveSelectors(PROFILE, WINDOW, snapshot(both, SCREEN));
    expect(live.unknown).toEqual(['owner']);
    expect(live.values['screen']).toBe('large');
    // Nothing the tab group names is in the snapshot: every value fits, so the default.
    const bare = liveSelectors(PROFILE, WINDOW, snapshot([w('provinceview', true)]));
    expect(bare.values['tab']).toBe('province');
  });
});

describe('liveDifferences', () => {
  it('names the paths where the profile predicts otherwise than the game showed', () => {
    // The game hid `extra`, which no rule hides.
    const shot = snapshot(FOREIGN);
    const live = liveSelectors(PROFILE, WINDOW, shot);
    const toggles = liveDifferences(PROFILE, WINDOW, SCREEN, { live: live.values }, shot);
    expect(toggles).toEqual({ 'provinceview/extra': false });
    const view = evaluateView(PROFILE, WINDOW, SCREEN, { live: live.values, gameToggles: toggles });
    const extra = widgetsAt(WINDOW, 'provinceview/extra')[0] as Widget;
    expect(view.widgets.get(extra)).toMatchObject({ shown: false, fromGame: true, byHand: false });
    expect(view.gameToggles).toBe(1);
    expect(view.handToggles).toBe(0);
    // A hand toggle still wins.
    const hand = evaluateView(PROFILE, WINDOW, SCREEN, {
      live: live.values,
      gameToggles: toggles,
      toggles: { 'provinceview/extra': true },
    });
    expect(hand.widgets.get(extra)).toMatchObject({ shown: true, fromGame: false, byHand: true });
  });

  it('takes the live resolution over the screen', () => {
    const view = evaluateView(PROFILE, WINDOW, SCREEN, { live: { screen: 'small' } });
    expect(view.selectors.find((s) => s.selector.id === 'screen')).toMatchObject({
      value: 'small',
      source: 'live',
    });
  });
});

describe('readLiveSnapshot', () => {
  it('reads format 1 only', () => {
    expect(readLiveSnapshot(snapshot(FOREIGN))?.window).toBe('provinceview');
    expect(readLiveSnapshot({ ...snapshot(FOREIGN), formatVersion: 2 })).toBeUndefined();
    expect(readLiveSnapshot(null)).toBeUndefined();
  });
});
