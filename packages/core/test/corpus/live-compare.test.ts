/// <reference types="node" />
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  InterfaceIndex,
  layoutWindow,
  parseScript,
  readGfxFile,
  readGuiFile,
  type TextureSize,
  type Widget,
  type WindowLayout,
} from '../../src/index.ts';
import {
  compareLive,
  offlinePreviewLayers,
  planSnapshot,
  snapshotOf,
  snapshotTree,
  type CapturedWidget,
  type CaptureRecord,
} from '../../src/corpus/index.ts';
import type { LayoutView } from '../../src/layout/window.ts';
import {
  evaluateView,
  layerProfiles,
  layoutViewOf,
  readProfile,
  type LiveSnapshot,
  type WindowProfile,
} from '../../src/profile/index.ts';
import { LIVE_SNAPSHOT_FORMAT, liveWidgetsOf } from '../../src/profile/live.ts';

const REPOSITORY = join(import.meta.dirname, '..', '..', '..', '..');
const SCREEN = { width: 200, height: 100 };

const GFX = `
spriteTypes = {
  spriteType = { name = "GFX_icon" texturefile = "gfx/interface/icon.dds" }
}`;
const TEXTURES: Record<string, TextureSize> = {
  'gfx/interface/icon.dds': { width: 10, height: 10 },
};
const GUI = `
guiTypes = {
  windowType = {
    name = "panel" position = { x = 10 y = 20 } size = { x = 100 y = 50 }
    iconType = { name = "a" spriteType = "GFX_icon" position = { x = 5 y = 5 } }
    iconType = { name = "b" spriteType = "GFX_icon" position = { x = 20 y = 5 } }
    iconType = { name = "c" spriteType = "GFX_icon" position = { x = 40 y = 5 } }
    iconType = { name = "d" spriteType = "GFX_icon" position = { x = 60 y = 5 } }
  }
}`;

function laidOut(
  view?: (window: Widget) => LayoutView,
  gui = GUI,
): { layout: WindowLayout; window: Widget } {
  const file = readGuiFile(parseScript(gui));
  const index = InterfaceIndex.of(
    [{ path: 'interface/test.gfx', file: readGfxFile(parseScript(GFX)) }],
    [{ path: 'interface/test.gui', file }],
  );
  const window = first(file.definitions);
  if (window === undefined) throw new Error('no window');
  const layout = layoutWindow(window, {
    file,
    index,
    exists: (path) => path.toLowerCase() in TEXTURES,
    assets: { textureSize: (path) => TEXTURES[path], font: () => undefined },
    screen: SCREEN,
    ...(view === undefined ? {} : { view: view(window) }),
  });
  return { layout, window };
}

/**
 * The panel's profile: a `tab` selector shows `a` or `b`, and an `owner` fact hides `c` for the
 * owner and `d` for anyone else, so a snapshot that shows both fits no value of `owner`.
 */
function panelProfile(): WindowProfile {
  const { file, diagnostics } = readProfile(
    `{ "formatVersion": 1, "window": "panel",
      "selectors": {
        "tab": { "kind": "ui", "values": { "a": "A", "b": "B" } },
        "owner": { "kind": "data", "fact": "province.ownedByPlayer" }
      },
      "groups": { "tab": { "selector": "tab", "members": { "a": "panel/a", "b": "panel/b" } } },
      "rules": {
        "own": { "when": { "owner": "yes" }, "hide": ["panel/c"] },
        "foreign": { "when": { "owner": "no" }, "hide": ["panel/d"] }
      } }`,
    { layer: 0, source: 'vanilla', file: 'panel.jsonc' },
  );
  expect(diagnostics).toEqual([]);
  return layerProfiles('panel', file === undefined ? [] : [file]);
}

function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

const widget = (
  path: string,
  type: string,
  rect: readonly [number, number, number, number],
  visible = true,
) => ({
  path,
  type,
  visible,
  enabled: true,
  checked: false,
  text: undefined as string | undefined,
  rect,
});

function snapshot(widgets: ReturnType<typeof widget>[]): LiveSnapshot {
  return {
    formatVersion: LIVE_SNAPSHOT_FORMAT,
    window: 'panel',
    takenAt: '2026-11-10T00:00:00.000Z',
    screen: SCREEN,
    widgets: liveWidgetsOf(widgets),
    stale: 0,
  };
}

describe('Compare with Live Game', () => {
  it('lists a moved widget, one the game hides and one only the game has', () => {
    const { layout, window } = laidOut();
    const live = snapshot([
      widget('panel', 'window', [10, 20, 100, 50]),
      widget('panel/a', 'icon', [15, 25, 10, 10]),
      // The game puts b 3 px lower than its .gui.
      widget('panel/b', 'icon', [30, 28, 10, 10]),
      widget('panel/c', 'icon', [50, 25, 10, 10], false),
      widget('panel/d', 'icon', [70, 25, 10, 10]),
      widget('panel/extra', 'icon', [80, 25, 10, 10]),
    ]);
    const result = compareLive(planSnapshot(live, { layout }), true);
    expect(result.geometry.compared).toBe(4);
    expect(result.geometry.exact).toBe(3);
    const kinds = result.differences.map((d) => `${d.kind} ${d.path}`).sort();
    expect(kinds).toEqual(['gameOnly panel/extra', 'hidden panel/c', 'place panel/b']);
    const moved = result.differences.find((d) => d.kind === 'place');
    expect(moved?.kind === 'place' ? moved.widget : undefined).toBe(window.children[1]);
    expect(moved?.kind === 'place' ? moved.game : undefined).toEqual({
      x: 30,
      y: 28,
      w: 10,
      h: 10,
    });
  });

  it('says once for a window without a profile how many widgets the game hides', () => {
    const { layout } = laidOut();
    const live = snapshot([
      widget('panel', 'window', [10, 20, 100, 50]),
      widget('panel/a', 'icon', [15, 25, 10, 10], false),
      widget('panel/b', 'icon', [30, 25, 10, 10], false),
      widget('panel/c', 'icon', [50, 25, 10, 10]),
      widget('panel/d', 'icon', [70, 25, 10, 10]),
    ]);
    const result = compareLive(planSnapshot(live, { layout }), false);
    expect(result.differences).toEqual([
      { kind: 'hiddenInWindow', path: 'panel', paths: ['panel/a', 'panel/b'] },
    ]);
  });

  it('takes the texts of a snapshot, never its visibility, for a window without a profile', () => {
    const { window } = laidOut();
    const live = snapshot([
      widget('panel', 'window', [10, 20, 100, 50]),
      widget('panel/a', 'icon', [15, 25, 10, 10], false),
      { ...widget('panel/b', 'text', [30, 25, 10, 10]), text: 'Moskva' },
    ]);
    const layers = offlinePreviewLayers({
      window,
      screen: SCREEN,
      snapshot: live,
      localise: () => undefined,
    });
    expect(layers.view).toBeUndefined();
    expect(layers.content.state?.(window.children[0] ?? window, undefined)).toBeUndefined();
    expect(layers.content.text(window.children[1] ?? window, undefined)).toBe('Moskva');
    expect(layers.unknownSelectors).toEqual([]);
  });

  it('sets the selectors a snapshot fits and names those it fits with no value', () => {
    const { window } = laidOut();
    const live = snapshot([
      widget('panel', 'window', [10, 20, 100, 50]),
      widget('panel/a', 'icon', [15, 25, 10, 10], false),
      widget('panel/b', 'icon', [30, 25, 10, 10]),
      widget('panel/c', 'icon', [50, 25, 10, 10]),
      widget('panel/d', 'icon', [70, 25, 10, 10]),
    ]);
    const layers = offlinePreviewLayers({
      window,
      screen: SCREEN,
      snapshot: live,
      profile: panelProfile(),
      localise: () => undefined,
      template: () => undefined,
    });
    const [a, b] = window.children;
    if (a === undefined || b === undefined) throw new Error('no icons');
    // `tab` = b: the game shows b and hides a. No value of `owner` shows both c and d.
    expect(layers.view?.shows(a)).toBe(false);
    expect(layers.view?.shows(b)).toBe(true);
    expect(layers.unknownSelectors).toEqual(['owner']);
  });

  it('lists a widget the preview draws and the game lacks, and one only the game shows', () => {
    const profile = panelProfile();
    // The preview's view: tab = b and owner = yes, so a and c are hidden.
    const { layout, window } = laidOut((w) =>
      layoutViewOf(evaluateView(profile, w, SCREEN, { set: { tab: 'b', owner: 'yes' } })),
    );
    const live = snapshot([
      widget('panel', 'window', [10, 20, 100, 50]),
      // The game shows a, which the view hides, at the .gui's place.
      widget('panel/a', 'icon', [15, 25, 10, 10]),
      widget('panel/b', 'icon', [30, 25, 10, 10]),
      // The game did not create d.
    ]);
    const result = compareLive(planSnapshot(live, { layout }), true, window);
    const kinds = result.differences.map((d) => `${d.kind} ${d.path}`).sort();
    expect(kinds).toEqual(['previewOnly panel/d', 'shown panel/a']);
    const shown = result.differences.find((d) => d.kind === 'shown');
    expect(shown?.kind === 'shown' ? shown.widget : undefined).toBe(window.children[0]);
    expect(shown?.kind === 'shown' ? shown.game : undefined).toEqual({
      x: 15,
      y: 25,
      w: 10,
      h: 10,
    });
    const only = result.differences.find((d) => d.kind === 'previewOnly');
    expect(only?.kind === 'previewOnly' ? only.preview : undefined).toEqual({
      x: 70,
      y: 25,
      w: 10,
      h: 10,
    });
  });

  it('names the steps Tongs writes by position after the definition’s children', () => {
    const { window } = laidOut(
      undefined,
      `guiTypes = {
        windowType = {
          name = "panel" position = { x = 10 y = 20 } size = { x = 100 y = 50 }
          iconType = { name = "a" spriteType = "GFX_icon" }
          iconType = { name = "first icon" spriteType = "GFX_icon" }
          iconType = { name = "second icon" spriteType = "GFX_icon" }
        }
      }`,
    );
    const live = snapshot([
      widget('panel', 'window', [10, 20, 100, 50]),
      widget('panel/a', 'icon', [10, 20, 10, 10]),
      // The game's own positions, not the .gui's.
      widget('panel/[46]', 'icon', [10, 20, 10, 10]),
      widget('panel/[47]', 'icon', [10, 20, 10, 10]),
      widget('panel/[48]', 'icon', [10, 20, 10, 10]),
      widget('panel/unknown', 'icon', [10, 20, 10, 10]),
    ]);
    const [root] = snapshotTree(live, window);
    expect(root?.name).toBe('panel');
    expect(root?.children?.map((c) => c.name)).toEqual([
      'a',
      'first icon',
      'second icon',
      // More steps by position than the definition has children: no name.
      '',
      'unknown',
    ]);
  });

  it('keeps a snapshot’s tree without names when its root is not the window', () => {
    const { window } = laidOut();
    const live = snapshot([
      widget('other', 'window', [0, 0, 10, 10]),
      widget('other/[3]', 'mystery', [0, 0, 1, 1]),
    ]);
    expect(snapshotTree(live, window)).toEqual([
      {
        path: 'other',
        name: 'other',
        type: 'window',
        visible: true,
        rect: { x: 0, y: 0, w: 10, h: 10 },
        enabled: true,
        checked: false,
        children: [
          {
            path: 'other/[3]',
            name: '',
            type: 'other',
            visible: true,
            rect: { x: 0, y: 0, w: 1, h: 1 },
            enabled: true,
            checked: false,
          },
        ],
      },
    ]);
  });

  // Reads and compares every committed capture: 1.1 s alone with the files cached, and over the
  // default 5 s timeout under a full parallel unit run (2026-11-21).
  it('gives back the game tree of every committed capture from its live snapshot', async () => {
    const folder = join(REPOSITORY, 'corpus', 'captures');
    let roots = 0;
    for (const playset of await readdir(folder)) {
      for (const resolution of await readdir(join(folder, playset))) {
        for (const name of await readdir(join(folder, playset, resolution))) {
          if (!name.endsWith('.json')) continue;
          const record = JSON.parse(
            await readFile(join(folder, playset, resolution, name), 'utf8'),
          ) as CaptureRecord;
          for (const root of record.widgets) {
            // A copy the game's code made is a snapshot of its definition, by another path.
            if (/\[\d+\]$/.test(root.path)) continue;
            const tree = snapshotTree(snapshotOf(root, record.resolution, record.takenAt));
            expect(tree).toEqual([normal(root)]);
            roots++;
          }
        }
      }
    }
    expect(roots).toBeGreaterThan(0);
  }, 60_000);
});

/** A captured widget with the fields a snapshot has, as `snapshotTree` gives it back. */
function normal(w: CapturedWidget): CapturedWidget {
  return {
    path: w.path,
    name: w.path.slice(w.path.lastIndexOf('/') + 1).replace(/\[\d+\]$/, ''),
    type: w.type,
    visible: w.visible,
    rect: w.rect,
    ...(w.text === undefined ? {} : { text: w.text }),
    enabled: w.enabled ?? true,
    checked: w.checked ?? false,
    ...(w.children === undefined || w.children.length === 0
      ? {}
      : { children: w.children.map(normal) }),
  };
}
