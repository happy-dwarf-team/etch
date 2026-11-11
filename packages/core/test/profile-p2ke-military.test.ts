// The military tab's move under Cradle of Civilization (the coverage survey): 16 px in the base
// game, 19 px in Proper 2K UI Enhanced, whose army_professionalism is 19 px high.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const SCREEN = { width: 2560, height: 1440 };
const NAMES = [
  'army_professionalism',
  'CoCbackground',
  'close_button',
  'window_title',
  'background',
];

describe("the military tab's move in Proper 2K UI Enhanced", () => {
  const window = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "countrymilitaryview" size = { x = 100 y = 100 } ${NAMES.map(
        (n) => `windowType = { name = "${n}" size = { x = 10 y = 10 } }`,
      ).join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const files = ['vanilla', 'proper-2k-ui-enhanced'].flatMap((source, layer) => {
    const read = readProfile(
      readFileSync(
        new URL(`../../../profiles/${source}/countrymilitaryview.jsonc`, import.meta.url),
        'utf8',
      ),
      { layer, source, file: 'countrymilitaryview.jsonc' },
    );
    expect(read.diagnostics).toEqual([]);
    return read.file === undefined ? [] : [read.file];
  });

  it.each([
    [1, 16],
    [2, 19],
  ])('moves the tab by army_professionalism (%i layers: %i px)', (layers, by) => {
    const profile = layerProfiles('countrymilitaryview', files.slice(0, layers));
    const view = evaluateView(profile, window, SCREEN, { set: { cradle: 'yes' } });
    const offset = (path: string) => {
      const widget = widgetsAt(window, path)[0];
      return widget === undefined ? undefined : view.widgets.get(widget)?.offset;
    };
    expect(offset('countrymilitaryview')).toEqual({ x: 0, y: by });
    expect(offset('countrymilitaryview/close_button')).toEqual({ x: 0, y: -by });
  });
});
