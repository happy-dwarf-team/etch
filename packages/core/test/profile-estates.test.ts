// The estates view's crown land and agenda in the Anbennar playset (the coverage survey's unseen
// countries): the base game's selectors decide them, as in vanilla.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };
const NAMES = ['crown_land_modifier_icon_1', 'crown_land_modifier_desc_2', 'agenda_icon'];

describe("the estates view's crown land and agenda in Anbennar", () => {
  const window = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "countryestatesview" size = { x = 100 y = 100 } ${NAMES.map(
        (n) => `iconType = { name = "${n}" }`,
      ).join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const files = ['vanilla', 'anbennar'].flatMap((source, layer) => {
    const url = new URL(`../../../profiles/${source}/countryestatesview.jsonc`, import.meta.url);
    if (!existsSync(url)) return [];
    const read = readProfile(readFileSync(url, 'utf8'), {
      layer,
      source,
      file: 'countryestatesview.jsonc',
    });
    expect(read.diagnostics).toEqual([]);
    return read.file === undefined ? [] : [read.file];
  });
  const shown = (set: Record<string, string>) => {
    const view = evaluateView(layerProfiles('countryestatesview', files), window, LARGE, { set });
    return NAMES.filter((n) =>
      widgetsAt(window, `countryestatesview/${n}`).some((w) => view.drawn(w)),
    );
  };

  it('shows them when the country has them, as Kobildzan and Bluescale do', () => {
    expect(shown({ crownLand: 'none', agenda: 'none' })).toEqual([]);
    expect(shown({ crownLand: 'shown', agenda: 'shown' })).toEqual(NAMES);
  });
});
