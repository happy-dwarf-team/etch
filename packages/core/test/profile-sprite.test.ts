// A rule's `sprite`: the sprite the game's code sets, read from a profile and handed to the layout.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type Widget } from '../src/index.ts';
import {
  evaluateView,
  layerProfiles,
  layoutViewOf,
  readProfile,
  widgetsAt,
} from '../src/profile/index.ts';

const LARGE = { width: 1920, height: 1080 };

describe("a rule's sprite", () => {
  const window = readGuiFile(
    parseScript(`guiTypes = { windowType = { name = "countryreligionview" size = { x = 100 y = 100 }
      iconType = { name = "religionpanel_bg_top" spriteType = "GFX_country_religion_view_bg" }
    } }`),
  ).definitions[0] as Widget;

  it("gives the religion view's background its standard sprite", () => {
    const read = readProfile(
      readFileSync(
        new URL('../../../profiles/vanilla/countryreligionview.jsonc', import.meta.url),
        'utf8',
      ),
      { layer: 0, source: 'vanilla', file: 'countryreligionview.jsonc' },
    );
    expect(read.diagnostics).toEqual([]);
    const profile = layerProfiles(
      'countryreligionview',
      read.file === undefined ? [] : [read.file],
    );
    const view = layoutViewOf(evaluateView(profile, window, LARGE, {}));
    const [bg] = widgetsAt(window, 'countryreligionview/religionpanel_bg_top');
    expect(bg === undefined ? undefined : view.sprite?.(bg)).toBe('GFX_country_religion_view_bg');
  });

  it('is an object of sprite names keyed by path', () => {
    const read = readProfile(
      '{ "formatVersion": 1, "window": "w", "rules": { "r": { "sprite": { "w/a": 3 } } } }',
      { layer: 0, source: 'project', file: 'w.jsonc' },
    );
    expect(read.diagnostics.map((d) => d.message).join(' ')).toMatch(/sprite/);
  });
});

describe("the ages view's picture", () => {
  it("takes the current age's sprite", () => {
    const window = readGuiFile(
      parseScript(`guiTypes = { windowType = { name = "ages_view" size = { x = 100 y = 100 }
        iconType = { name = "picture" spriteType = "GFX_age_picture_placeholder" }
      } }`),
    ).definitions[0] as Widget;
    const read = readProfile(
      readFileSync(new URL('../../../profiles/vanilla/ages_view.jsonc', import.meta.url), 'utf8'),
      { layer: 0, source: 'vanilla', file: 'ages_view.jsonc' },
    );
    expect(read.diagnostics).toEqual([]);
    const profile = layerProfiles('ages_view', read.file === undefined ? [] : [read.file]);
    const [picture] = widgetsAt(window, 'ages_view/picture');
    const sprite = (age: string) =>
      picture === undefined
        ? undefined
        : layoutViewOf(evaluateView(profile, window, LARGE, { set: { age } })).sprite?.(picture);
    expect(sprite('discovery')).toBe('GFX_age_of_discovery');
    expect(sprite('revolutions')).toBe('GFX_age_of_revolutions');
  });
});
