import { describe, expect, it } from 'vitest';
import {
  InterfaceIndex,
  laidOutWithin,
  layoutWindow,
  mechanicRows,
  mechanicShowing,
  parseScript,
  readBasicAbilities,
  readGfxFile,
  readGovernmentMechanics,
  readGuiFile,
  readScriptedWidgets,
  withMechanics,
  type GovernmentMechanic,
  type LayoutInput,
  type LayoutView,
  type Widget,
  type WindowLayout,
} from '../src/index.ts';

const SCREEN = { width: 1920, height: 1080 };

const MECHANICS = `
drake_mechanic = {
  available = { has_reform = drake_reform }
  powers = {
    drake_power = { gui = drake_bar max = 100 }
    lone_power = { gui = lone_bar }
    first_power = { show_before_interactions = yes }
  }
  interactions = {
    one = { icon = GFX_one gui = drake_button cost_type = drake_power }
    two = { icon = GFX_two gui = drake_button cost_type = drake_power center = no }
    three = { icon = GFX_three cost_type = lone_power }
    four = { icon = GFX_four }
  }
}
empty_mechanic = { powers = { unused = { gui = unused_bar } } }
`;

const GUI = `guiTypes = {
  positionType = { name = "specific_governments_list_position" position = { x = 32 y = 230 } }
  windowType = {
    name = "countrygovernmentview"
    position = { x = 0 y = 140 }
    size = { x = 1024 y = 100 }
    iconType = { name = "drake_bg" spriteType = "GFX_one" position = { x = 32 y = 237 } scripted = yes }
    iconType = { name = "other_bg" spriteType = "GFX_one" position = { x = 32 y = 237 } scripted = yes }
    iconType = { name = "open_bg" spriteType = "GFX_one" position = { x = 32 y = 237 } scripted = yes }
    smoothListboxType = { name = "specific_governments_list" position = { x = 32 y = 228 } size = { x = 300 y = 122 } }
  }
  windowType = {
    name = "government_mechanic_interactions"
    size = { x = 300 y = 100 }
    smoothListboxType = { name = "government_interaction_list" size = { x = 300 y = 100 } horizontal = 1 }
  }
  windowType = {
    name = "government_interaction_type"
    size = { x = 100 y = 100 }
    guiButtonType = { name = "government_interaction_button" quadTextureSprite = "GFX_placeholder" position = { x = 8 y = 4 } }
    iconType = { name = "government_power_bar" spriteType = "GFX_one" position = { x = 20 y = 78 } }
    iconType = { name = "government_power_bar_frame" spriteType = "GFX_one" position = { x = 6 y = 74 } }
  }
  windowType = {
    name = "government_shared_power"
    size = { x = 300 y = 20 }
    iconType = { name = "government_power_bar" spriteType = "GFX_one" position = { x = 35 y = 3 } }
  }
  windowType = {
    name = "drake_button"
    size = { x = 100 y = 90 }
    position = { x = 10 y = 0 }
    guiButtonType = { name = "government_interaction_button" quadTextureSprite = "GFX_placeholder" position = { x = 10 y = 0 } }
    iconType = { name = "government_power_bar" spriteType = "GFX_one" position = { x = 20 y = 77 } }
  }
  windowType = {
    name = "drake_bar"
    size = { x = 300 y = 10 }
    iconType = { name = "bar" spriteType = "GFX_one" position = { x = 55 y = -80 } }
    iconType = { name = "frame" spriteType = "GFX_one" position = { x = 10 y = -100 } }
  }
  windowType = { name = "lone_bar" size = { x = 300 y = 10 } }
  windowType = { name = "unused_bar" size = { x = 300 y = 10 } }
}`;

const GFX = `spriteTypes = {
  spriteType = { name = "GFX_one" texturefile = "gfx/one.dds" }
  spriteType = { name = "GFX_two" texturefile = "gfx/two.dds" }
  spriteType = { name = "GFX_three" texturefile = "gfx/two.dds" }
  spriteType = { name = "GFX_four" texturefile = "gfx/two.dds" }
  spriteType = { name = "GFX_placeholder" texturefile = "gfx/one.dds" }
}`;

function setUp(gui = GUI): { input: LayoutInput; window: Widget; view: LayoutView } {
  const file = readGuiFile(parseScript(gui));
  const index = InterfaceIndex.of(
    [{ path: 'interface/x.gfx', file: readGfxFile(parseScript(GFX)) }],
    [{ path: 'interface/x.gui', file }],
  );
  const input: LayoutInput = {
    file,
    index,
    exists: () => true,
    assets: {
      textureSize: (path) =>
        path === 'gfx/one.dds' ? { width: 82, height: 82 } : { width: 60, height: 60 },
      font: () => ({ problem: 'no fonts here' }),
    },
    screen: SCREEN,
  };
  const window = file.definitions.find((d) => d.name === 'countrygovernmentview') as Widget;
  const view: LayoutView = {
    shows: () => true,
    movedTo: () => undefined,
    frame: () => undefined,
  };
  return { input, window, view };
}

function mechanic(name = 'drake_mechanic'): GovernmentMechanic {
  return readGovernmentMechanics(MECHANICS).find((m) => m.name === name) as GovernmentMechanic;
}

function lay(
  mechanics: readonly GovernmentMechanic[],
  scripted = '',
  gui = GUI,
): { layout: WindowLayout; window: Widget } {
  const { input, window, view } = setUp(gui);
  const hosted = withMechanics(
    {
      mechanics,
      scripted: readScriptedWidgets(scripted),
      index: input.index,
      screen: SCREEN,
    },
    view,
    undefined,
  );
  if (hosted === null) throw new Error('no list');
  return { layout: layoutWindow(window, { ...input, ...hosted }), window };
}

function rect(layout: WindowLayout, name: string, nth = 0): readonly number[] {
  const w = layout.widgets.filter((widget) => widget.widget.name === name)[nth];
  if (w === undefined) throw new Error(`no ${name}`);
  return [w.x, w.y, w.width, w.height];
}

describe('reading the government mechanics', () => {
  it('reads powers, interactions and the reforms of a mechanic', () => {
    expect(mechanic()).toEqual({
      name: 'drake_mechanic',
      reforms: ['drake_reform'],
      everyPlayer: false,
      powers: [
        { name: 'drake_power', gui: 'drake_bar', showBeforeInteractions: false },
        { name: 'lone_power', gui: 'lone_bar', showBeforeInteractions: false },
        { name: 'first_power', gui: undefined, showBeforeInteractions: true },
      ],
      interactions: [
        {
          name: 'one',
          gui: 'drake_button',
          icon: 'GFX_one',
          costType: 'drake_power',
          center: true,
        },
        {
          name: 'two',
          gui: 'drake_button',
          icon: 'GFX_two',
          costType: 'drake_power',
          center: false,
        },
        { name: 'three', gui: undefined, icon: 'GFX_three', costType: 'lone_power', center: true },
        { name: 'four', gui: undefined, icon: 'GFX_four', costType: undefined, center: true },
      ],
    });
  });

  it('tells which mechanics every player has', () => {
    const everyPlayer = (available: string): boolean | undefined =>
      readGovernmentMechanics(`m = { ${available} }`)[0]?.everyPlayer;
    expect(everyPlayer('')).toBe(true);
    expect(everyPlayer('available = { ai = no }')).toBe(true);
    expect(everyPlayer('available = { always = yes }')).toBe(true);
    expect(everyPlayer('available = { has_reform = r }')).toBe(false);
    expect(everyPlayer('available = { ai = no has_dlc = "x" }')).toBe(false);
  });

  it('reads what the basic reforms give, and no others', () => {
    expect(
      readBasicAbilities(`monarchy_mechanic = { basic_reform = yes
          government_abilities = { first_mechanic second_mechanic } }
        other_reform = { government_abilities = { third_mechanic } }`),
    ).toEqual(['first_mechanic', 'second_mechanic']);
  });

  it('reads only named custom_ entries of custom_gui', () => {
    expect(
      readScriptedWidgets(`custom_icon = { name = a potential = { ai = no } }
        custom_window = { name = b }
        custom_text_box = { potential = { ai = no } }
        other = { name = c }`).map((w) => w.name),
    ).toEqual(['a', 'b']);
  });
});

describe('the rows of a mechanic', () => {
  it('puts first powers, interactions three to a row, then the other powers', () => {
    const rows = mechanicRows(mechanic());
    expect(
      rows.map((row) =>
        row.kind === 'power' ? row.power.name : row.interactions.map((i) => i.name),
      ),
    ).toEqual(['first_power', ['one', 'two', 'three'], ['four'], 'drake_power']);
  });

  it('gives a power one interaction alone costs no row', () => {
    expect(mechanicShowing([mechanic()], 'drake_bar')?.name).toBe('drake_mechanic');
    expect(mechanicShowing([mechanic()], 'DRAKE_BUTTON')?.name).toBe('drake_mechanic');
    expect(mechanicShowing([mechanic()], 'lone_bar')).toBeUndefined();
    expect(mechanicShowing([mechanic()], 'nothing')).toBeUndefined();
  });

  it('gives a power no interaction costs a row', () => {
    expect(mechanicShowing([mechanic('empty_mechanic')], 'unused_bar')?.name).toBe(
      'empty_mechanic',
    );
  });
});

describe('the government view with a mechanic', () => {
  const two = (): GovernmentMechanic => ({
    name: 'two_rows',
    reforms: [],
    everyPlayer: false,
    powers: [{ name: 'p', gui: 'drake_bar', showBeforeInteractions: false }],
    interactions: ['a', 'b', 'c'].map((name) => ({
      name,
      gui: 'drake_button',
      icon: 'GFX_one',
      costType: 'p',
      center: true,
    })),
  });

  it('centres the list at its positionType when its rows do not fill it', () => {
    // 230 + 122 / 2 - 100 / 2 below the window's 140, as Russia's list shows at 381.
    expect(rect(lay([two()]).layout, 'specific_governments_list')).toEqual([32, 381, 300, 100]);
  });

  it('leaves the list at its positionType when its rows fill it', () => {
    const tall = GUI.replace(
      'name = "drake_bar"\n    size = { x = 300 y = 10 }',
      'name = "drake_bar"\n    size = { x = 300 y = 40 }',
    );
    expect(rect(lay([two()], '', tall).layout, 'specific_governments_list')[1]).toBe(370);
  });

  it('gives negative positions their place from the row, as the game does', () => {
    const { layout } = lay([two()]);
    expect(rect(layout, 'drake_bar')).toEqual([32, 471, 300, 10]);
    expect(rect(layout, 'frame').slice(0, 2)).toEqual([42, 371]);
    expect(rect(layout, 'bar').slice(0, 2)).toEqual([87, 391]);
  });

  it('stacks the rows and sets the interactions row to its tallest window', () => {
    const { layout } = lay([two()]);
    expect(rect(layout, 'government_mechanic_interactions')).toEqual([32, 381, 300, 90]);
    expect([0, 1, 2].map((n) => rect(layout, 'drake_button', n).slice(0, 2))).toEqual([
      [32, 381],
      [132, 381],
      [232, 381],
    ]);
  });

  it('gives a button its icon, centred in its window unless the interaction says no', () => {
    const { layout } = lay([mechanic()]);
    const buttons = layout.widgets.filter((w) => w.widget.name === 'government_interaction_button');
    const textureOf = (n: number): string | undefined => {
      const button = buttons[n];
      const draw = button === undefined ? undefined : layout.drawList.draws[button.drawStart];
      return draw?.kind === 'sprite' ? layout.drawList.textures[draw.texture] : undefined;
    };
    expect(textureOf(0)).toBe('gfx/one.dds');
    expect(textureOf(1)).toBe('gfx/two.dds');
    // 100 px window, 82 px icon: 10 + 9 from the window at 32 + (no window position).
    expect(buttons[0]?.x).toBe(51);
    // `center = no`: where its .gui says.
    expect(buttons[1]?.x).toBe(142);
  });

  it('shows the bar in an interaction only for a power it alone costs', () => {
    const { layout } = lay([mechanic()]);
    const bars = layout.widgets.filter(
      (w) => w.widget.name === 'government_power_bar' && w.row !== undefined,
    );
    // `three` costs lone_power alone; `one` and `two` share theirs, `four` costs none. The shared
    // power's own row and `first_power` show theirs.
    const frames = layout.widgets.filter((w) => w.widget.name === 'government_power_bar_frame');
    expect(frames).toHaveLength(1);
    expect(bars).toHaveLength(2);
  });

  it('takes the scripted widgets a mechanic decides, and leaves the others', () => {
    const shown = (widgets: string, name: string): boolean =>
      lay([mechanic()], widgets).layout.widgets.some((w) => w.widget.name === name);
    expect(shown('', 'other_bg')).toBe(true);
    const scripted = `
      custom_icon = { name = drake_bg potential = { has_reform = drake_reform } }
      custom_icon = { name = other_bg potential = {
        ai = no OR = { has_government_mechanic = another has_reform = another_reform } } }
      custom_icon = { name = open_bg potential = { has_country_flag = something } }`;
    expect(shown(scripted, 'drake_bg')).toBe(true);
    expect(shown(scripted, 'other_bg')).toBe(false);
    expect(shown(scripted, 'open_bg')).toBe(true);
  });

  it('moves a mechanic by the rows of the ones before it, as the game does', () => {
    const dummy: GovernmentMechanic = {
      name: 'dummy',
      reforms: [],
      everyPlayer: true,
      powers: [],
      interactions: ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({
        name,
        gui: 'tiny_button',
        icon: undefined,
        costType: undefined,
        center: true,
      })),
    };
    const gui = GUI.replace(
      'windowType = { name = "lone_bar"',
      'windowType = { name = "tiny_button" size = { x = 1 y = 1 } }\n  windowType = { name = "lone_bar"',
    );
    const { layout } = lay([dummy, two()], '', gui);
    // Two rows of 1 px above 100 px: 230 + 61 - 51 + 140, and the bar's row 92 px further down.
    expect(rect(layout, 'specific_governments_list')[1]).toBe(380);
    expect(rect(layout, 'drake_bar')[1]).toBe(472);
    expect(rect(layout, 'frame')[1]).toBe(372);
  });

  it('has nothing to fill without the list', () => {
    const { input, view } = setUp('guiTypes = { windowType = { name = "countrygovernmentview" } }');
    expect(
      withMechanics(
        { mechanics: [], scripted: [], index: input.index, screen: SCREEN },
        view,
        undefined,
      ),
    ).toBeNull();
  });

  it('keeps a mechanic window as a layout of its own, with its parents', () => {
    const { layout } = lay([two()]);
    const bar = layout.widgets.find((w) => w.widget.name === 'drake_bar')?.widget;
    if (bar === undefined) throw new Error('no drake_bar');
    const own = laidOutWithin(layout.widgets, bar);
    expect(own.map((w) => [w.widget.name, w.parent])).toEqual([
      ['drake_bar', -1],
      ['bar', 0],
      ['frame', 0],
    ]);
  });
});
