// The unit panel's rebel suppression (the coverage survey): the button's glow and the mission's icon
// show only while an army suppresses rebels, in vanilla and in Anbennar's layer.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };
const NAMES = ['enable_rebel_button', 'enable_rebel_button_glow', 'mission_icon'];

describe("the unit panel's rebel suppression", () => {
  const window = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "single_unitpanel" size = { x = 100 y = 100 } ${NAMES.map(
        (n) => `iconType = { name = "${n}" }`,
      ).join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const files = ['vanilla', 'anbennar'].flatMap((source, layer) => {
    const read = readProfile(
      readFileSync(
        new URL(`../../../profiles/${source}/single_unitpanel.jsonc`, import.meta.url),
        'utf8',
      ),
      { layer, source, file: 'single_unitpanel.jsonc' },
    );
    expect(read.diagnostics).toEqual([]);
    return read.file === undefined ? [] : [read.file];
  });

  it.each([1, 2])('lights the button only while suppressing (%i layers)', (layers) => {
    const profile = layerProfiles('single_unitpanel', files.slice(0, layers));
    const shown = (rebelSuppression: string) => {
      const view = evaluateView(profile, window, LARGE, {
        set: { unit: 'army', rebelSuppression },
      });
      return NAMES.filter((n) =>
        widgetsAt(window, `single_unitpanel/${n}`).some((w) => view.drawn(w)),
      );
    };
    expect(shown('off')).toEqual(['enable_rebel_button']);
    expect(shown('on')).toEqual(NAMES);
  });
});
