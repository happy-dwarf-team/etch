// The main menu's settings profile (the coverage survey): one page at a time, the game page first.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import { evaluateView, layerProfiles, readProfile, widgetsAt } from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };
const PAGES = ['GAME', 'VIDEO', 'AUDIO', 'CONTROLS', 'ACCESSIBILITY'];

describe("the main menu's settings", () => {
  const window = readGuiFile(
    parseScript(
      `guiTypes = { windowType = { name = "menu_settings" size = { x = 240 y = 500 } ${PAGES.map(
        (p) => `windowType = { name = "menu_settings_${p}" size = { x = 240 y = 500 } }`,
      ).join(' ')} } }`,
    ),
  ).definitions[0] as Widget;
  const read = readProfile(
    readFileSync(new URL('../../../profiles/vanilla/menu_settings.jsonc', import.meta.url), 'utf8'),
    { layer: 0, source: 'vanilla', file: 'menu_settings.jsonc' },
  );
  const shown = (set: Record<string, string>) => {
    const profile = layerProfiles('menu_settings', read.file === undefined ? [] : [read.file]);
    const view = evaluateView(profile, window, LARGE, { set });
    return PAGES.filter((p) =>
      widgetsAt(window, `menu_settings/menu_settings_${p}`).some((w) => view.drawn(w)),
    );
  };

  it('shows the game page as it opens, and one other page by its button', () => {
    expect(read.diagnostics).toEqual([]);
    expect(shown({})).toEqual(['GAME']);
    expect(shown({ page: 'audio' })).toEqual(['AUDIO']);
  });
});
