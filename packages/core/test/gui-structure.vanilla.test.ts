/// <reference types="node" />
// Local only: checks the structure of an installed game's `.gui` files in place, read only.
// Runs when ETCH_GAME_PATH names the game folder and is skipped otherwise (CI has no game).
import { describe, expect, it } from 'vitest';
import { guiStructureDiagnostics } from '../src/index.ts';
import { GameFiles, PlaysetInterface } from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

describe.skipIf(gamePath === undefined)('the structure check on the installed game', () => {
  it("finds only vanilla's orientations outside the anchors and list spacings with a fraction", async () => {
    const { index } = await PlaysetInterface.load(
      new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]),
    );
    const counts: Record<string, number> = {};
    const words: Record<string, number> = {};
    let ms = 0;
    for (const { file } of index.guiFiles) {
      const start = performance.now();
      const found = guiStructureDiagnostics(file);
      ms += performance.now() - start;
      for (const d of found) {
        counts[d.code] = (counts[d.code] ?? 0) + 1;
        const word = d.message.split(' ')[0] ?? '';
        if (d.code === 'unknown-orientation') words[word] = (words[word] ?? 0) + 1;
      }
    }
    console.log(`${String(index.guiFiles.length)} files checked in ${ms.toFixed(1)} ms`);
    // Vanilla 1.37.5: `LEFT`, `RIGHT` and `UPPERL_LEFT` as orientations, and `spacing = 2.5` and
    // `1.5` in lists, the same as CWTools finds with cwtools-eu4-config#448's rules. Every other
    // key vanilla writes is one the game reads there.
    expect(counts).toEqual({ 'unknown-orientation': 29, 'fraction-as-int': 17 });
    expect(words).toEqual({ LEFT: 25, RIGHT: 1, UPPERL_LEFT: 3 });
    expect(ms).toBeLessThan(200);
  });
});
