import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import {
  evaluateView,
  layerProfiles,
  liveContent,
  liveDifferences,
  liveMatch,
  liveSelectors,
  liveTextures,
  liveView,
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

  it('gives the sprite, frame and flag the game drew as the widget’s state', () => {
    const shield = { type: 'icon', sprite: 'GFX_shield_small', frame: 1, flag: 'RUS' };
    const plugin = [
      w('provinceview', true),
      w('provinceview/province_window', true),
      w('provinceview/province_window/culture', true, shield),
    ];
    const widgets = liveWidgetsOf(plugin);
    expect(widgets[2]).toMatchObject(shield);
    expect(widgets[1]).not.toHaveProperty('sprite');
    const match = liveMatch(snapshot(plugin), WINDOW);
    expect(match.texts.state?.('provinceview/province_window/culture')).toMatchObject({
      sprite: 'GFX_shield_small',
      frame: 1,
      flag: 'RUS',
    });
    expect(match.texts.state?.('provinceview/province_window')).not.toHaveProperty('sprite');
  });

  it('gives the texture, rebels and slices the game drew instead as the widget’s state', () => {
    const icon = { type: 'icon', sprite: 'GFX_idea_unknown', texture: 'gfx/interface/a.dds' };
    const shield = { type: 'icon', sprite: 'GFX_shield_small', rebels: 'anti_tax_rebels' };
    const pie = {
      type: 'icon',
      sprite: 'GFX_trade_power_chart_small',
      slices: [{ percent: 100, color: '#a53a3aff' }],
    };
    const plugin = [
      w('provinceview', true),
      w('provinceview/province_window', true),
      w('provinceview/province_window/culture', true, icon),
      w('provinceview/province_window/religion', true, shield),
      w('provinceview/province_window/terrain', true, pie),
      w('provinceview/province_window/trade', true, { slices: [] }),
    ];
    const widgets = liveWidgetsOf(plugin);
    expect(widgets.slice(2, 5)).toMatchObject([icon, shield, pie]);
    expect(widgets[5]).not.toHaveProperty('slices');
    const { texts } = liveMatch(snapshot(plugin), WINDOW);
    expect(texts.state?.('provinceview/province_window/culture')).toMatchObject({
      texture: 'gfx/interface/a.dds',
    });
    expect(texts.state?.('provinceview/province_window/religion')).toMatchObject({
      rebels: 'anti_tax_rebels',
    });
    expect(texts.state?.('provinceview/province_window/terrain')?.slices).toEqual(pie.slices);
    expect(texts.state?.('provinceview/province_window')).not.toHaveProperty('texture');
    // The files the playset looks up before it draws the snapshot, each once.
    const twice = [...plugin, w('provinceview/province_window/owner', true, icon)];
    expect(liveTextures(snapshot(twice))).toEqual(['gfx/interface/a.dds']);
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
      // Where the game showed it: the preview moves what the game's code moved (etch#253).
      rect: expect.any(Array) as unknown,
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

  it('finds selectors whose rules only fit together (etch#257)', () => {
    // As Anbennar's `hre-foreign`: `extra` shows only for a foreign province in the empire. One
    // selector at a time, `owner` meets the default `hre` and `hre` the default `owner`.
    const together = profile(`
      "selectors": {
        "owner": { "kind": "data", "fact": "province.ownedByPlayer", "default": "yes" },
        "hre": { "kind": "data", "fact": "province.inHre", "values": { "yes": "In the empire", "no": "Outside" }, "default": "no" }
      },
      "rules": {
        "hidden": { "hide": ["provinceview/extra"] },
        "foreign": { "when": { "owner": "no" }, "hide": ["provinceview/province_window/queue_window"] },
        "hre-foreign": { "when": { "hre": "yes", "owner": "no" }, "show": ["provinceview/extra"] }
      }`);
    const live = liveSelectors(
      together,
      WINDOW,
      snapshot([
        w('provinceview', true),
        w('provinceview/province_window', true),
        w('provinceview/province_window/queue_window', false),
        w('provinceview/extra', true),
      ]),
    );
    expect(live.unknown).toEqual([]);
    expect(live.values).toMatchObject({ owner: 'no', hre: 'yes' });
  });

  it('takes no evidence from a text box the game keeps shown with nothing in it', () => {
    const empty = FOREIGN.map((x) =>
      x.path.endsWith('queue_window') ? { ...x, visible: true, type: 'text', text: '' } : x,
    );
    const live = liveSelectors(PROFILE, WINDOW, snapshot(empty));
    expect(live.unknown).toEqual([]);
    // It stays shown: a toggle keeps what the profile hides as the game has it.
    const taken = snapshot(empty);
    expect(
      liveDifferences(PROFILE, WINDOW, taken.screen, { live: live.values }, taken),
    ).toMatchObject({ 'provinceview/province_window/queue_window': true });
  });

  it('compares only what the snapshot has, under a parent the game showed', () => {
    const taken = snapshot([
      w('provinceview', true),
      w('provinceview/province_window', false),
      // Its parent is hidden in the game: whatever it says of itself is not compared.
      w('provinceview/province_window/queue_window', true),
      w('provinceview/state_window', true),
    ]);
    expect(
      liveDifferences(PROFILE, WINDOW, taken.screen, { live: { owner: 'no' } }, taken),
    ).toEqual(
      // The tab group shows the province window and hides the state window; the game had the other.
      { 'provinceview/province_window': false, 'provinceview/state_window': true },
    );
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

describe('a live snapshot without a profile (etch#255)', () => {
  const window = readGuiFile(
    parseScript(`guiTypes = {
      windowType = { name = "w"
        instantTextBoxType = { name = "title" text = "TITLE" }
        guiButtonType = { name = "hidden" }
        iconType = { name = "unread" }
      }
    }`),
  ).definitions[0] as Widget;
  const snapshot: LiveSnapshot = {
    formatVersion: 1,
    window: 'w',
    takenAt: '2026-11-03T00:00:00Z',
    screen: { width: 1920, height: 1080 },
    widgets: [
      {
        path: 'w',
        type: 'window',
        visible: true,
        enabled: true,
        checked: false,
        rect: [0, 0, 10, 10],
      },
      {
        path: 'w/title',
        type: 'text',
        visible: true,
        enabled: true,
        checked: false,
        text: 'Holy Roman Empire',
        rect: [0, 0, 10, 10],
      },
      {
        path: 'w/hidden',
        type: 'button',
        visible: false,
        enabled: true,
        checked: false,
        rect: [0, 0, 1, 1],
      },
    ],
    stale: 0,
  };
  const texts = liveMatch(snapshot, window).texts;
  const [title, hidden, unread] = window.children;

  it("gives the window the game's texts and states", () => {
    const content = liveContent(window, texts);
    expect(title === undefined ? undefined : content.text(title, undefined)).toBe(
      'Holy Roman Empire',
    );
    expect(hidden === undefined ? undefined : content.state?.(hidden, undefined)?.visible).toBe(
      false,
    );
    expect(unread === undefined ? undefined : content.text(unread, undefined)).toBeUndefined();
  });

  it('answers only for the window itself, not for a row or another window', () => {
    const adopted = [{ name: 'extra', text: 'Adopted' }];
    const content = liveContent(window, {
      text: (path) => (path === 'w/title' ? 'Title' : undefined),
      adopted: (path) => (path === 'w/title' ? adopted : []),
    });
    const other = readGuiFile(parseScript('guiTypes = { iconType = { name = "x" } }'))
      .definitions[0] as Widget;
    if (title === undefined) throw new Error('no title');
    expect(content.text(title, undefined)).toBe('Title');
    expect(content.text(title, 0)).toBeUndefined();
    expect(content.text(other, undefined)).toBeUndefined();
    // Without the game's states, a widget has none.
    expect(content.state?.(title, undefined)).toBeUndefined();
    expect(content.state?.(title, 0)).toBeUndefined();
    expect(content.rows(title)).toBeUndefined();
    expect(content.adopted?.(title, undefined)).toEqual(adopted);
    expect(content.adopted?.(title, 0)).toEqual([]);
    expect(content.adopted?.(other, undefined)).toEqual([]);
    // Without adopted widgets at all, none.
    expect(liveContent(window, { text: () => undefined }).adopted?.(title, undefined)).toEqual([]);
    expect(liveContent(window, texts).state?.(other, undefined)).toBeUndefined();
  });

  it('keeps the half of a _large pair the game does not create undrawn (etch#272)', () => {
    const pair = readGuiFile(
      parseScript(`guiTypes = {
        windowType = { name = "p"
          iconType = { name = "bg" }
          iconType = { name = "bg_large" }
        }
      }`),
    ).definitions[0] as Widget;
    const [small, large] = pair.children;
    const none = liveMatch({ ...snapshot, window: 'p', widgets: [] }, pair).texts;
    // At 1920×1080 the game creates only bg_large; the snapshot says nothing of bg.
    const view = liveView(pair, none, SCREEN);
    expect(small === undefined ? undefined : view.shows(small)).toBe(false);
    expect(large === undefined ? undefined : view.shows(large)).toBe(true);
  });

  it('hides what the game hid and draws what the snapshot does not have', () => {
    const view = liveView(window, texts, SCREEN);
    expect(view.shows(window)).toBe(true);
    expect(title === undefined ? undefined : view.shows(title)).toBe(true);
    expect(hidden === undefined ? undefined : view.shows(hidden)).toBe(false);
    expect(unread === undefined ? undefined : view.shows(unread)).toBe(true);
  });

  it('keeps the size steps and the rows of a window without a profile', () => {
    const windowNamed = (text: string): Widget =>
      readGuiFile(parseScript(`guiTypes = { ${text} }`)).definitions[0] as Widget;
    const trade = windowNamed(`windowType = { name = "countrytradeview"
      windowType = { name = "trade_node_list_window"
        listboxType = { name = "tradenode_list" }
      }
    }`);
    const list = widgetsAt(trade, 'countrytradeview/trade_node_list_window/tradenode_list')[0];
    expect(list).toBeDefined();
    const tradeView = liveView(trade, liveMatch({ ...snapshot, widgets: [] }, trade).texts, SCREEN);
    expect(list === undefined ? undefined : tradeView.stepped?.(list)).toBe('grown');

    const stability = windowNamed(`windowType = { name = "countrystabilityview"
      windowType = { name = "cv_governmentrebels_handlerebels"
        buttonType = { name = "back_button" }
      }
    }`);
    const back = widgetsAt(
      stability,
      'countrystabilityview/cv_governmentrebels_handlerebels/back_button',
    )[0];
    expect(back).toBeDefined();
    const stabilityView = liveView(
      stability,
      liveMatch({ ...snapshot, widgets: [] }, stability).texts,
      SCREEN,
    );
    expect(back === undefined ? undefined : stabilityView.stepped?.(back)).toBe('moved');
    expect(back === undefined ? undefined : stabilityView.steppedFurther?.(back)).toBe(30);

    const shield = windowNamed('windowType = { name = "shield" }');
    const shieldView = liveView(
      shield,
      liveMatch({ ...snapshot, widgets: [] }, shield).texts,
      SCREEN,
    );
    expect(shieldView.row?.(shield)).toMatchObject({
      start: 'shield_position',
      step: 'shield_offset',
    });
  });
});
