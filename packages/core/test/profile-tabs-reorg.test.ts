// The country view's tabs under a choice, and the reorganization window's army or fleet half (the
// coverage survey).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };

function setup(name: string, children: readonly string[]) {
  const window = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "${name}" size = { x = 100 y = 100 } ${children
        .map((n) => `windowType = { name = "${n}" size = { x = 10 y = 10 } }`)
        .join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const read = readProfile(
    readFileSync(new URL(`../../../profiles/vanilla/${name}.jsonc`, import.meta.url), 'utf8'),
    { layer: 0, source: 'vanilla', file: `${name}.jsonc` },
  );
  expect(read.diagnostics).toEqual([]);
  const profile = layerProfiles(name, read.file === undefined ? [] : [read.file]);
  const shown = (set: Record<string, string>) => {
    const view = evaluateView(profile, window, LARGE, { set });
    return children.filter((n) => widgetsAt(window, `${name}/${n}`).some((w) => view.drawn(w)));
  };
  return shown;
}

describe('the country view under a choice', () => {
  const shown = setup('countryview', ['countryview_tabs']);
  it('hides the tabs while a choice is open', () => {
    expect(shown({ choice: 'closed' })).toEqual(['countryview_tabs']);
    expect(shown({ choice: 'open' })).toEqual([]);
  });
});

describe('the reorganization window', () => {
  const shown = setup('reorg_window', ['army_window', 'naval_window']);
  it('shows the half of the units it reorganizes', () => {
    expect(shown({ unit: 'army' })).toEqual(['army_window']);
    expect(shown({ unit: 'fleet' })).toEqual(['naval_window']);
  });
});
