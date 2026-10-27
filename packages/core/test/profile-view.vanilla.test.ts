/// <reference types="node" />
// Local only: lays out vanilla's province view in a profile's view and compares the widgets the
// game's code moves with the corpus captures. Runs when ETCH_GAME_PATH names the game folder and
// is skipped otherwise (CI has no game). Game files never enter the repository.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Screen } from '../src/index.ts';
import { GameFiles, PlaysetAssets, PlaysetInterface, layOutPreview } from '../src/playset/index.ts';
import { evaluateView, layerProfiles, layoutViewOf, widgetsAt } from '../src/profile/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

interface Captured {
  readonly path: string;
  readonly visible: boolean;
  readonly rect: { x: number; y: number; w: number; h: number };
  readonly children?: readonly Captured[];
}

function captured(resolution: string): Map<string, Captured> {
  const record = JSON.parse(
    readFileSync(
      new URL(`../../../corpus/captures/vanilla/${resolution}/province.json`, import.meta.url),
      'utf8',
    ),
  ) as { widgets: Captured[] };
  const all = new Map<string, Captured>();
  const walk = (w: Captured): void => {
    all.set(w.path, w);
    for (const child of w.children ?? []) walk(child);
  };
  for (const w of record.widgets) walk(w);
  return all;
}

describe.skipIf(gamePath === undefined)('the province view of the installed game', () => {
  const files = new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]);
  // No selectors: only what Etch derives from the screen height.
  const profile = layerProfiles('provinceview', []);

  for (const [width, height] of [
    [1280, 720],
    [1366, 768],
    [1920, 1080],
    [3440, 1440],
  ] as const) {
    it(`places the moved widgets as the game does at ${String(width)}×${String(height)}`, async () => {
      const playset = await PlaysetInterface.load(files);
      const gui = playset.index.guiFiles.find((f) => f.path === 'interface/provinceview.gui');
      const window = gui?.file.definitions.find((w) => w.name === 'provinceview');
      if (gui === undefined || window === undefined) throw new Error('no provinceview');
      const screen: Screen = { width, height };
      const view = evaluateView(profile, window, screen);
      const layout = await layOutPreview(playset, new PlaysetAssets(playset), gui.file, window, {
        screen,
        view: layoutViewOf(view),
      });
      const capture = captured(`${String(width)}x${String(height)}`);
      for (const path of [
        'provinceview/top_section_window',
        'provinceview/top_section_window/history',
        'provinceview/top_section_window/river_indicator_2',
      ]) {
        const widget = widgetsAt(window, path)[0];
        const laid = layout.widgets.find((w) => w.widget === widget);
        const game = capture.get(path);
        expect({ path, x: laid?.x, y: laid?.y }).toEqual({
          path,
          x: game?.rect.x,
          y: game?.rect.y,
        });
      }
      // The game creates one of each _large pair.
      const names = new Set(layout.widgets.map((w) => w.widget.name));
      expect(names.has('select_building_large')).toBe(height >= 814);
      expect(names.has('select_building')).toBe(height < 814);
    });
  }
});
