/// <reference types="node" />
// Local only: reads the installed game's fonts in place, read only.
// Runs when ETCH_GAME_PATH names the game folder, for example
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
// and is skipped otherwise (CI has no game). Game files never enter the repository.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fontFilePaths, parseBmFont } from '../src/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];
const fonts = gamePath === undefined ? undefined : join(gamePath, 'gfx/fonts');

describe.skipIf(fonts === undefined)('vanilla fonts', () => {
  const files = fonts === undefined ? [] : readdirSync(fonts).filter((f) => f.endsWith('.fnt'));

  it('finds the fonts', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s reads without issues and has a texture by base name', (file) => {
    const folder = fonts ?? '';
    const text = readFileSync(join(folder, file), 'latin1');
    const { font, issues } = parseBmFont(text);
    expect(issues).toEqual([]);
    expect(font.lineHeight).toBeGreaterThan(0);
    expect(font.glyphs.size).toBe(text.match(/^char /gm)?.length);
    // Vanilla repeats some pairs, always with the same amount.
    const pairs = new Set(text.match(/^kerning first=\d+\s+second=\d+/gm));
    expect(font.kerning.size).toBe(pairs.size);
    const { textures } = fontFilePaths(join(folder, file.replace(/\.fnt$/, '')));
    expect(textures.some((t) => existsSync(t))).toBe(true);
  });
});
