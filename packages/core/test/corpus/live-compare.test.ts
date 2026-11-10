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
import type { LiveSnapshot } from '../../src/profile/index.ts';
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

function laidOut(): { layout: WindowLayout; window: Widget } {
  const file = readGuiFile(parseScript(GUI));
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
  });
  return { layout, window };
}

function first<T>(items: readonly T[]): T | undefined {
  return items[0];
}

const widget = (
  path: string,
  type: string,
  rect: readonly [number, number, number, number],
  visible = true,
) => ({ path, type, visible, enabled: true, checked: false, text: undefined, rect });

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
    ]);
    const layers = offlinePreviewLayers({
      window,
      screen: SCREEN,
      snapshot: live,
      localise: () => undefined,
    });
    expect(layers.view).toBeUndefined();
    expect(layers.content.state?.(window.children[0] ?? window, undefined)).toBeUndefined();
  });

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
  });
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
