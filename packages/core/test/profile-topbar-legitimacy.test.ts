// The top bar's legitimacy of another kind, and Anbennar's player shield glow (the coverage survey's
// unseen Anbennar countries).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };
const NAMES = ['icon_leg', 'icon_rep', 'icon_meritocracy', 'player_shield_glow'];

describe("the top bar's legitimacy in Anbennar", () => {
  const window = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "topbar" size = { x = 100 y = 100 } ${NAMES.map(
        (n) => `iconType = { name = "${n}" }`,
      ).join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const files = ['vanilla', 'anbennar'].flatMap((source, layer) => {
    const read = readProfile(
      readFileSync(new URL(`../../../profiles/${source}/topbar.jsonc`, import.meta.url), 'utf8'),
      { layer, source, file: 'topbar.jsonc' },
    );
    expect(read.diagnostics).toEqual([]);
    return read.file === undefined ? [] : [read.file];
  });
  const shown = (set: Record<string, string>) => {
    const view = evaluateView(layerProfiles('topbar', files), window, LARGE, { set });
    return NAMES.filter((n) => widgetsAt(window, `topbar/${n}`).some((w) => view.drawn(w)));
  };

  it('shows one kind of legitimacy, and the glow by hand', () => {
    expect(shown({ legitimacy: 'legitimacy' })).toEqual(['icon_leg']);
    expect(shown({ legitimacy: 'republic' })).toEqual(['icon_rep']);
    expect(shown({ legitimacy: 'republic', playerShieldGlow: 'yes' })).toEqual([
      'icon_rep',
      'player_shield_glow',
    ]);
  });
});
