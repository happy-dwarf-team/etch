// The diplomacy view's heir line, rivals and shield glow (the coverage survey's Anbennar countries).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };
const NAMES = [
  'monarch_heir_name',
  'monarch_heir_info',
  'election_info',
  'label_rivals',
  'label_rivals_not_possible',
  'countryshield_glow',
];

describe("the diplomacy view's heir line, rivals and shield glow", () => {
  const window = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "countrydiplomacyview" size = { x = 100 y = 100 } ${NAMES.map(
        (n) => `iconType = { name = "${n}" }`,
      ).join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const files = ['vanilla', 'anbennar'].flatMap((source, layer) => {
    const read = readProfile(
      readFileSync(
        new URL(`../../../profiles/${source}/countrydiplomacyview.jsonc`, import.meta.url),
        'utf8',
      ),
      { layer, source, file: 'countrydiplomacyview.jsonc' },
    );
    expect(read.diagnostics).toEqual([]);
    return read.file === undefined ? [] : [read.file];
  });
  const shown = (set: Record<string, string>) => {
    const view = evaluateView(layerProfiles('countrydiplomacyview', files), window, LARGE, {
      set,
    });
    return NAMES.filter((n) =>
      widgetsAt(window, `countrydiplomacyview/${n}`).some((w) => view.drawn(w)),
    );
  };

  it('shows an election instead of the heir, or no heir line at all', () => {
    const own = { country: 'own', rivals: 'possible' };
    expect(shown({ ...own, heir: 'yes' })).toEqual([
      'monarch_heir_name',
      'monarch_heir_info',
      'label_rivals',
    ]);
    expect(shown({ ...own, heir: 'elective' })).toEqual(['election_info', 'label_rivals']);
    expect(shown({ ...own, heir: 'hidden' })).toEqual(['label_rivals']);
  });

  it("says whether the player's country can have rivals, and lights the shield by hand", () => {
    expect(shown({ country: 'own', heir: 'hidden', rivals: 'notPossible' })).toEqual([
      'label_rivals_not_possible',
    ]);
    expect(
      shown({ country: 'own', heir: 'hidden', rivals: 'notPossible', shieldGlow: 'yes' }),
    ).toEqual(['label_rivals_not_possible', 'countryshield_glow']);
  });
});
