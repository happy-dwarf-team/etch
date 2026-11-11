// The province view's state tab (the coverage survey): the button that opens the side panels and a
// territory's parts are hidden on it.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };

describe("the province view's state tab", () => {
  const window = readGuiFile(
    parseScript(`guiTypes = {
  windowType = {
    name = "provinceview"
    size = { x = 100 y = 100 }
    windowType = { name = "province_window" size = { x = 50 y = 50 }
      guiButtonType = { name = "buildings_button" }
    }
    windowType = { name = "state_window" size = { x = 50 y = 50 }
      iconType = { name = "is_state" }
      guiButtonType = { name = "make_state" }
      iconType = { name = "is_territory" }
      guiButtonType = { name = "supply_depots" }
    }
  }
}`),
  ).definitions[0] as Widget;
  const read = readProfile(
    readFileSync(new URL('../../../profiles/vanilla/provinceview.jsonc', import.meta.url), 'utf8'),
    { layer: 0, source: 'vanilla', file: 'provinceview.jsonc' },
  );
  const shown = (tab: string) => {
    const view = evaluateView(
      layerProfiles('provinceview', read.file === undefined ? [] : [read.file]),
      window,
      LARGE,
      { set: { tab } },
    );
    return [
      'province_window/buildings_button',
      'state_window/is_state',
      'state_window/make_state',
      'state_window/is_territory',
      'state_window/supply_depots',
    ].filter((p) => widgetsAt(window, `provinceview/${p}`).some((w) => view.drawn(w)));
  };

  it("draws a state's mark without the side panels' button", () => {
    expect(read.diagnostics).toEqual([]);
    expect(shown('state')).toEqual(['state_window/is_state']);
    expect(shown('province')).toEqual(['province_window/buildings_button']);
  });
});
