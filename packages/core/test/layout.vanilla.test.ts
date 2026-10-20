/// <reference types="node" />
// Local only: lays out the windows of an installed game in place, read only.
// Runs when ETCH_GAME_PATH names the game folder, for example
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
// and is skipped otherwise (CI has no game). Game files never enter the repository.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeGameText,
  findDefinition,
  layoutWindow,
  parseScript,
  readGuiFile,
  type LayoutInput,
} from '../src/index.ts';
import {
  GameFiles,
  PlaysetAssets,
  PlaysetInterface,
  layOutPreview,
  loadPlaysetLocalisation,
} from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];
const SCREEN = { width: 1920, height: 1080 };

describe.skipIf(gamePath === undefined)('layout on the installed game', () => {
  const files = new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]);

  it('lays out every top-level definition with only known problems', async () => {
    const playset = await PlaysetInterface.load(files);
    const loc = await loadPlaysetLocalisation(files, 'english');
    const assets = new PlaysetAssets(playset);
    const counts: Record<string, number> = {};
    let windows = 0;
    let draws = 0;
    for (const { file } of playset.index.guiFiles) {
      for (const window of file.definitions) {
        const layout = await layOutPreview(playset, assets, file, window, {
          screen: SCREEN,
          localise: (text) => loc.text(text),
        });
        expect(layout.unloaded).toEqual([]);
        windows++;
        draws += layout.drawList.draws.length;
        for (const d of layout.diagnostics) counts[d.code] = (counts[d.code] ?? 0) + 1;
      }
    }
    console.log(`${String(windows)} definitions, ${String(draws)} draws`, counts);
    // Vanilla 1.37.5 in English: rotated icons and one `origo`, the orientations `left`, `right`
    // and `UPPERL_LEFT`, and `gui_rendertarget` sprites; every texture header and font reads.
    expect(counts).toEqual({ 'not-applied': 16, 'unknown-orientation': 29, 'unhandled-shader': 5 });
    expect(windows).toBe(858);
  });

  it('lays out countrydiplomacyview.gui well within the warm reload budget', async () => {
    const playset = await PlaysetInterface.load(files);
    const loc = await loadPlaysetLocalisation(files, 'english');
    const assets = new PlaysetAssets(playset);
    const path = 'interface/countrydiplomacyview.gui';
    const text = decodeGameText(readFileSync(join(gamePath ?? '', path)), 'interface').text;
    const file = readGuiFile(parseScript(text));
    const window = findDefinition(file, 'countrydiplomacyview');
    if (window === undefined) throw new Error('no countrydiplomacyview');
    const localise = (key: string): string => loc.text(key);
    for (const definition of file.definitions) {
      await layOutPreview(playset, assets, file, definition, { screen: SCREEN, localise });
    }
    const input: LayoutInput = {
      file,
      index: playset.index,
      exists: playset.exists,
      assets,
      screen: SCREEN,
      localise,
    };

    const median = (run: () => void): number => {
      const times: number[] = [];
      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        run();
        times.push(performance.now() - start);
      }
      times.sort((a, b) => a - b);
      return times[Math.floor(times.length / 2)] ?? Infinity;
    };
    const one = median(() => layoutWindow(window, input));
    const all = median(() => {
      for (const definition of file.definitions) layoutWindow(definition, input);
    });
    const layout = layoutWindow(window, input);
    const json = JSON.stringify(layout.drawList).length;
    console.log(
      `layout of countrydiplomacyview: median ${one.toFixed(2)} ms, ` +
        `${String(layout.drawList.draws.length)} draws, ${String(layout.widgets.length)} widgets, ` +
        `${(json / 1024).toFixed(1)} KB JSON; all ${String(file.definitions.length)} ` +
        `definitions of the file: median ${all.toFixed(2)} ms`,
    );
    expect(layout.unloaded).toEqual([]);
    expect(layout.drawList.draws.length).toBeGreaterThan(100);
    expect(one).toBeLessThan(10);
    expect(all).toBeLessThan(25);
  });
});
