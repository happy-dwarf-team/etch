// The speed controls' achievements button (the coverage survey): shown in the base game, hidden in
// Anbennar's layer.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };

describe("the speed controls' achievements button", () => {
  const window = readGuiFile(
    parseScript(
      'guiTypes = { windowType = { name = "speed_controls" size = { x = 100 y = 100 } guiButtonType = { name = "button_achievements" } } }',
    ),
  ).definitions[0] as Widget;
  const read = readProfile(
    readFileSync(
      new URL('../../../profiles/anbennar/speed_controls.jsonc', import.meta.url),
      'utf8',
    ),
    { layer: 1, source: 'anbennar', file: 'speed_controls.jsonc' },
  );

  it('is hidden in Anbennar and shown without a profile', () => {
    expect(read.diagnostics).toEqual([]);
    const drawn = (files: Parameters<typeof layerProfiles>[1]) => {
      const view = evaluateView(layerProfiles('speed_controls', files), window, LARGE, {});
      return widgetsAt(window, 'speed_controls/button_achievements').some((w) => view.drawn(w));
    };
    expect(drawn([])).toBe(true);
    expect(drawn(read.file === undefined ? [] : [read.file])).toBe(false);
  });
});
