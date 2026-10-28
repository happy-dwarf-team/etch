/// <reference types="node" />
// The cases the maintainer's 2.0.0 trial of `provinceview` found (docs/release-2.0.0.md): Etch's
// own profiles, layered as in the Anbennar playset, evaluated over a window that has the widgets
// they name. Each case is what the game does (the comments give eu4.exe's functions and the mod's
// files); profiles.playsets.test.ts checks the same profiles against the corpus captures.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import {
  evaluateView,
  layerProfiles,
  readProfile,
  widgetsAt,
  type ProfileFile,
  type WindowProfile,
} from '../src/profile/index.ts';

const GUI = readGuiFile(
  parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    windowType = {
      name = "top_section_window"
      guiButtonType = { name = "move_capital" }
      iconType = { name = "have_capital" }
      guiButtonType = { name = "move_trade_port" }
      iconType = { name = "have_trade_port" }
      guiButtonType = { name = "add_parliament" }
      guiButtonType = { name = "remove_parliament" }
      iconType = { name = "have_parliament" }
    }
    windowType = {
      name = "province_window"
      windowType = { name = "build_army_view" }
      windowType = { name = "build_navy_view" }
      windowType = { name = "change_culture_view" }
      windowType = { name = "tradegoods_province_window" }
      iconType = { name = "loot_icon" }
      iconType = { name = "loot_progress" }
      iconType = { name = "loot_progress_frame" }
      iconType = { name = "devastation_icon" }
      instantTextBoxType = { name = "devastation_value" }
      iconType = { name = "building_fort" }
      iconType = { name = "no_building_fort" }
      instantTextBoxType = { name = "fort_number" }
      iconType = { name = "maintenance_icon" }
      guiButtonType = { name = "add_parliament_forbidden" }
      guiButtonType = { name = "IW_move_capital_button" }
      guiButtonType = { name = "IW_move_capital_blocker" }
      iconType = { name = "diggy_diggy_estimate" }
      guiButtonType = { name = "diggy_diggy_go" }
      guiButtonType = { name = "diggy_diggy_repair" }
      iconType = { name = "diggy_diggy_bar_fill_1" }
      guiButtonType = { name = "province_button_button" }
      windowType = {
        name = "province_button_window_closed"
        guiButtonType = { name = "GFX_province_button_dummy_2" }
        guiButtonType = { name = "dig_deeper_capital" }
        guiButtonType = { name = "ebonsteel_expand_infra_button" }
        guiButtonType = { name = "mangrove_bio_infra_button" }
      }
    }
    windowType = { name = "state_window" }
    windowType = { name = "buildings_window" }
  }
}`),
);
const WINDOW = GUI.definitions.find((w) => w.name === 'provinceview') as Widget;
const SCREEN = { width: 2560, height: 1440 };

function shipped(source: string): ProfileFile {
  const name = `${source}/provinceview.jsonc`;
  const text = readFileSync(new URL(`../../../profiles/${name}`, import.meta.url), 'utf8');
  const file = readProfile(text, { layer: 0, source, file: name }).file;
  if (file === undefined) throw new Error(`${name} not read`);
  return file;
}

const VANILLA = layerProfiles('provinceview', [shipped('vanilla')]);
const ANBENNAR = layerProfiles('provinceview', [
  shipped('vanilla'),
  shipped('anbennar'),
  shipped('p2ke-patch-anbennar'),
]);

/** The widgets of the view drawn by the selectors set, from the own province's view. */
function drawn(
  profile: WindowProfile,
  set: Record<string, string> = {},
): (name: string) => boolean {
  const view = evaluateView(profile, WINDOW, SCREEN, {
    set: { owner: 'yes', tab: 'province', side: 'buildings', subPanel: 'none', ...set },
  });
  return (name) => {
    const widgets = widgetsAt(WINDOW, `provinceview/**/${name}`);
    expect(widgets).toHaveLength(1);
    return view.drawn(widgets[0] as Widget);
  };
}

const LOOT = [
  'loot_icon',
  'loot_progress',
  'loot_progress_frame',
  'devastation_icon',
  'devastation_value',
];

describe('the province view as the 2.0.0 trial found it', () => {
  it('hides loot and devastation while a build or culture panel is open (0x1373FD0)', () => {
    for (const name of LOOT) expect(drawn(VANILLA)(name)).toBe(true);
    for (const subPanel of ['build_army_view', 'build_navy_view', 'change_culture_view']) {
      for (const name of LOOT) expect(drawn(VANILLA, { subPanel })(name)).toBe(false);
    }
    for (const name of LOOT) {
      expect(drawn(VANILLA, { subPanel: 'tradegoods_province_window' })(name)).toBe(true);
    }
  });

  it('shows one mark per slot of the top section, by the province', () => {
    const slots = (set: Record<string, string>): string[] => {
      const shown = drawn(VANILLA, set);
      return [
        'move_capital',
        'have_capital',
        'move_trade_port',
        'have_trade_port',
        'add_parliament',
        'remove_parliament',
        'have_parliament',
      ].filter(shown);
    };
    expect(slots({})).toEqual(['move_capital', 'move_trade_port']);
    expect(slots({ capital: 'yes', tradePort: 'yes', parliament: 'seat' })).toEqual([
      'have_capital',
      'have_trade_port',
      'remove_parliament',
    ]);
    expect(slots({ parliament: 'noSeat' })).toEqual([
      'move_capital',
      'move_trade_port',
      'add_parliament',
    ]);
    expect(slots({ owner: 'no', parliament: 'seat', tradePort: 'yes' })).toEqual([]);
    expect(slots({ owner: 'no', capital: 'yes' })).toEqual(['have_capital']);
  });

  it("covers move_capital with Anbennar's buttons only where their potentials hold", () => {
    const own = drawn(ANBENNAR, { parliament: 'noSeat' });
    expect(own('IW_move_capital_button')).toBe(false);
    expect(own('add_parliament_forbidden')).toBe(false);
    const centaur = drawn(ANBENNAR, {
      parliament: 'noSeat',
      centaurCapital: 'yes',
      parliamentForbidden: 'forbidden',
    });
    expect(centaur('IW_move_capital_button')).toBe(true);
    expect(centaur('IW_move_capital_blocker')).toBe(true);
    expect(centaur('add_parliament_forbidden')).toBe(true);
  });

  it('opens digging operations only from the button bar (diggy_diggy_estimate_flag)', () => {
    const closed = drawn(ANBENNAR);
    for (const name of ['diggy_diggy_estimate', 'diggy_diggy_go', 'diggy_diggy_repair']) {
      expect(closed(name)).toBe(false);
    }
    const dig = drawn(ANBENNAR, { digging: 'dig' });
    expect(['diggy_diggy_estimate', 'diggy_diggy_go'].every(dig)).toBe(true);
    expect(dig('diggy_diggy_repair')).toBe(false);
    expect(dig('diggy_diggy_bar_fill_1')).toBe(false);
    expect(drawn(ANBENNAR, { digging: 'digging' })('diggy_diggy_bar_fill_1')).toBe(true);
    expect(drawn(ANBENNAR, { digging: 'dig', owner: 'no' })('diggy_diggy_estimate')).toBe(false);
  });

  it('draws one button per slot of the button bar, over its dummy', () => {
    const bar = drawn(ANBENNAR, { buttonBar: 'open' });
    expect(bar('province_button_button')).toBe(false);
    expect(bar('GFX_province_button_dummy_2')).toBe(true);
    expect(
      ['dig_deeper_capital', 'ebonsteel_expand_infra_button', 'mangrove_bio_infra_button'].some(
        bar,
      ),
    ).toBe(false);
    const dig = drawn(ANBENNAR, { buttonBar: 'open', slot2: 'dig_deeper_capital' });
    expect(dig('dig_deeper_capital')).toBe(true);
    expect(dig('ebonsteel_expand_infra_button')).toBe(false);
  });

  it('swaps the fort for the no-fort icon and hides its level (0x13728C0)', () => {
    const fort = drawn(VANILLA, { fort: 'yes' });
    expect(['building_fort', 'fort_number', 'maintenance_icon'].every(fort)).toBe(true);
    expect(fort('no_building_fort')).toBe(false);
    const none = drawn(VANILLA, { fort: 'no' });
    expect(['building_fort', 'fort_number', 'maintenance_icon'].some(none)).toBe(false);
    expect(none('no_building_fort')).toBe(true);
  });
});
