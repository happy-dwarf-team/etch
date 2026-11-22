/// <reference types="node" />
// Local only: takes the colours of every flag in the installed game's `gfx/flags` by Etch's flag
// rule and compares them with the game's own cache of them, `gfx/flags/flagfiles.txt` (a hash,
// then the flag file names) and `flagfilescolor.txt` (nine numbers from 0 to 1 a flag) in the
// game's user folder. Runs when ETCH_GAME_PATH names the game folder and ETCH_FLAG_CACHE the
// user folder's `gfx/flags`, and is skipped otherwise (CI has no game). Game files never enter
// the repository.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flagColours } from '@etch/core/playset';
import { inspectTexture } from '@etch/renderer/inspect';

const gamePath = process.env['ETCH_GAME_PATH'];
const cachePath = process.env['ETCH_FLAG_CACHE'];

describe.skipIf(gamePath === undefined || cachePath === undefined)('flag colours', () => {
  it("match the game's cache for every flag of the game", () => {
    const names = readFileSync(join(cachePath ?? '', 'flagfiles.txt'), 'latin1')
      .split(/\s+/)
      .filter((s) => s !== '')
      .slice(1);
    const values = readFileSync(join(cachePath ?? '', 'flagfilescolor.txt'), 'latin1')
      .split(/\s+/)
      .filter((s) => s !== '')
      .map(Number);
    expect(values.length).toBe(names.length * 9);
    let compared = 0;
    const differ: string[] = [];
    names.forEach((name, k) => {
      const file = join(gamePath ?? '', 'gfx', 'flags', name);
      // Flags a mod of the cached playset adds, or that the game makes during play.
      if (!existsSync(file)) return;
      const { rgba } = inspectTexture(name, readFileSync(file));
      const cached = [0, 1, 2].map((j) =>
        [0, 1, 2].map((c) => Math.round((values[k * 9 + j * 3 + c] ?? 0) * 255)),
      );
      compared++;
      const mine = flagColours(rgba).map((rgb) => [...rgb]);
      if (JSON.stringify(mine) !== JSON.stringify(cached)) {
        differ.push(`${name}: ${JSON.stringify(mine)} vs ${JSON.stringify(cached)}`);
      }
    });
    expect(compared).toBeGreaterThan(900);
    expect(differ).toEqual([]);
  });
});
