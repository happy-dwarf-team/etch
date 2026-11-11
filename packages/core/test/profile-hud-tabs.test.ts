// Small rules from the Anbennar coverage refresh: the HUD's unused map mode backgrounds and closed
// map mode list, and the technology and stability tabs' windows that open by a click.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };

function drawn(window: string, names: readonly string[], set: Record<string, string>): string[] {
  const root = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "${window}" size = { x = 100 y = 100 } ${names
        .map((n) => `windowType = { name = "${n}" size = { x = 10 y = 10 } }`)
        .join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const read = readProfile(
    readFileSync(new URL(`../../../profiles/vanilla/${window}.jsonc`, import.meta.url), 'utf8'),
    { layer: 0, source: 'vanilla', file: `${window}.jsonc` },
  );
  expect(read.diagnostics).toEqual([]);
  const profile = layerProfiles(window, read.file === undefined ? [] : [read.file]);
  const view = evaluateView(profile, root, LARGE, { set });
  return names.filter((n) => widgetsAt(root, `${window}/${n}`).some((w) => view.drawn(w)));
}

describe('small rules of the HUD and the country tabs', () => {
  it('never draws the menubar map mode backgrounds', () => {
    expect(drawn('menubar', ['mapmode_bg', 'mapmode_bg_2'], {})).toEqual([]);
  });

  it('opens the map mode list, the institutions and the rebels by a click', () => {
    const cases: [string, string, string[]][] = [
      ['minimap_panel', 'mapModeList', ['mapmode_list_window', 'closebutton']],
      ['countrytechnologyview', 'institutions', ['institutions_window']],
      ['countrystabilityview', 'handleRebels', ['cv_governmentrebels_handlerebels']],
    ];
    for (const [window, selector, names] of cases) {
      expect(drawn(window, names, { [selector]: 'closed' })).toEqual([]);
      expect(drawn(window, names, { [selector]: 'open' })).toEqual(names);
    }
  });
});
