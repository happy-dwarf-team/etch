/// <reference types="node" />
// Local only: models the interface files of an installed game in place, read only.
// Runs when ETCH_GAME_PATH names the game folder, for example
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
// and is skipped otherwise (CI has no game). Game files never enter the repository.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPRITE_KINDS, WIDGET_KINDS, allWidgets, decodeGameText } from '../src/index.ts';
import { GameFiles, PlaysetInterface } from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

describe.skipIf(gamePath === undefined)('the widget model on the installed game', () => {
  const load = (): Promise<PlaysetInterface> =>
    PlaysetInterface.load(
      new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]),
    );

  it('models every widget and sprite kind vanilla uses, with only known problems', async () => {
    const start = performance.now();
    const loaded = await load();
    const loadMs = performance.now() - start;
    const { index } = loaded;
    expect(index.guiFiles.length).toBe(129);
    expect(index.gfxFiles.length).toBe(132);

    const widgetKinds = new Set<string>();
    for (const { file } of index.guiFiles) {
      for (const { widget } of allWidgets(file)) widgetKinds.add(widget.kind);
    }
    expect([...widgetKinds].sort()).toEqual([...WIDGET_KINDS].sort());
    const spriteKinds = new Set(
      index.gfxFiles.flatMap(({ file }) => file.sprites.map((s) => s.kind)),
    );
    expect([...spriteKinds].sort()).toEqual([...SPRITE_KINDS].sort());

    const counts: Record<string, number> = {};
    for (const { path } of [...index.guiFiles, ...index.gfxFiles]) {
      for (const d of loaded.diagnostics(path)) counts[d.code] = (counts[d.code] ?? 0) + 1;
    }
    // Vanilla 1.37.5 as installed: 6 sprite references and one font name defined nowhere, 69
    // repeated sprite names, and textures absent from the install (a `.ddr` typo, Paradox online
    // assets, sprites without their file).
    expect(counts).toEqual({
      'missing-sprite': 6,
      'missing-font': 1,
      'duplicate-sprite': 69,
      'missing-texture': 39,
    });
    expect(loadMs).toBeLessThan(1000);
  });

  it('updates countrydiplomacyview.gui well within the warm reload budget', async () => {
    const loaded = await load();
    const path = 'interface/countrydiplomacyview.gui';
    const text = decodeGameText(readFileSync(join(gamePath ?? '', path)), 'interface').text;
    for (let i = 0; i < 10; i++) {
      await loaded.update(path, text);
      loaded.diagnostics(path);
    }
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      await loaded.update(path, text);
      loaded.diagnostics(path);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] ?? Infinity;
    console.log(`update + diagnostics of ${path}: median ${median.toFixed(2)} ms`);
    expect(median).toBeLessThan(15);
  });
});
