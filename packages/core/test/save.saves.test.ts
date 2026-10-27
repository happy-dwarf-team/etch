/// <reference types="node" />
// Local only: the save reader on real saves, copies in a folder (ETCH_SAVES_PATH; never the
// player's own `save games` folder, and no save enters Git). Every text save is read and indexed,
// every province and the player's country parse without a syntax error, and a binary (ironman)
// save is refused as such (spec section 5, etch#154). Skipped in CI, which has no saves.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SaveReadError, readSave, type Save } from '../src/save/index.ts';

const folder = process.env['ETCH_SAVES_PATH'];
const files =
  folder === undefined ? [] : readdirSync(folder).filter((name) => name.endsWith('.eu4'));

describe.skipIf(folder === undefined)('the save reader on real saves', () => {
  it.each(files)('%s', { timeout: 60_000 }, async (name) => {
    const bytes = readFileSync(join(folder ?? '', name));
    const read: Save | SaveReadError = await readSave(bytes).catch((error: unknown) => {
      if (error instanceof SaveReadError) return error;
      throw error;
    });
    if (read instanceof SaveReadError) {
      expect(read.problem).toBe('binary');
      return;
    }
    expect(read.meta.version).toMatch(/^1\.37\./);
    expect(read.index.top.has('players_countries')).toBe(false);
    expect(read.index.top.has('used_client_names')).toBe(false);
    expect(read.countries.length).toBeGreaterThan(100);
    expect(read.provinces.length).toBeGreaterThan(1000);
    const player = read.index.countries.get(read.meta.player ?? '');
    expect(player).toBeDefined();
    const ranges = [...read.index.provinces.values(), ...(player === undefined ? [] : [player])];
    for (const range of ranges) {
      expect(read.parse(range).diagnostics, `bytes ${String(range.start)}`).toEqual([]);
    }
  });
});
