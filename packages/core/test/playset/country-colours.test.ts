import { describe, expect, it } from 'vitest';
import {
  flagColours,
  GameFiles,
  hexOf,
  loadCountryColours,
  type Rgb,
} from '../../src/playset/index.ts';
import { makeTree, removeTree } from './fixture.ts';

/** An RGBA image of `n` pixels of each colour, in order. */
function pixels(...runs: [Rgb, number][]): Uint8Array {
  const out: number[] = [];
  for (const [[r, g, b], n] of runs) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return Uint8Array.from(out);
}

describe('flagColours', () => {
  it('takes the fullest bins, as the middle of each bin', () => {
    // A blue flag with a yellow cross: blue, yellow, then blue again for a rare third colour.
    expect(flagColours(pixels([[0, 82, 147], 70], [[254, 204, 0], 30]))).toEqual([
      [16, 80, 144],
      [240, 208, 16],
      [16, 80, 144],
    ]);
  });

  it('skips bins close to an earlier pick in red, green and blue alike', () => {
    // Dark red is within four bins of black in every channel, so white comes second.
    const colours = flagColours(pixels([[0, 0, 0], 50], [[120, 0, 0], 30], [[255, 255, 255], 20]));
    expect(colours.map(hexOf)).toEqual(['#101010', '#f0f0f0', '#101010']);
  });

  it('takes a third colour with more than a tenth of the first one’s pixels', () => {
    const red: Rgb = [200, 20, 20];
    const white: Rgb = [250, 250, 250];
    const black: Rgb = [10, 10, 10];
    expect(flagColours(pixels([red, 100], [white, 50], [black, 11]))[2]).toEqual([16, 16, 16]);
    expect(flagColours(pixels([red, 100], [white, 50], [black, 10]))[2]).toEqual([208, 16, 16]);
  });

  it('gives white for a second colour a one-colour flag does not have', () => {
    expect(flagColours(pixels([[40, 120, 40], 64]))).toEqual([
      [48, 112, 48],
      [255, 255, 255],
      [48, 112, 48],
    ]);
  });

  it('takes the first bin in red, green, blue order of bins with equal counts', () => {
    const [first, second] = flagColours(pixels([[250, 0, 0], 10], [[0, 0, 250], 10]));
    expect([first, second]).toEqual([
      [16, 16, 240],
      [240, 16, 16],
    ]);
  });
});

describe('loadCountryColours', () => {
  it('reads the files in name order, each block setting only the colours it has', async () => {
    const root = await makeTree({
      'common/country_colors/00_country_colors.txt': [
        'SWE = {',
        '  color1= { 0 40 104  }',
        '  color2= { 250 184 7 }',
        '  color3= { 0 40 104  }',
        '}',
        'DAN = { color2 = { 1 2 3 } color1 = { 4 5 6 } }',
        'NOR = { color1 = { 1 2 } }',
      ].join('\n'),
      'common/country_colors/01_more.txt': 'swe = { color2 = { 255 255 255 } }',
    });
    try {
      const table = await loadCountryColours(
        new GameFiles([{ name: 'game', root, replacePaths: [] }]),
      );
      expect(table.tags.get('SWE')).toEqual({
        colours: [
          [0, 40, 104],
          [255, 255, 255],
          [0, 40, 104],
        ],
        files: [
          'common/country_colors/00_country_colors.txt',
          'common/country_colors/01_more.txt',
          'common/country_colors/00_country_colors.txt',
        ],
      });
      // color1 after color2 is not read, as the game reads the keys only in order.
      expect(table.tags.get('DAN')?.colours).toEqual([undefined, [1, 2, 3], undefined]);
      expect(table.tags.get('NOR')?.colours).toEqual([undefined, undefined, undefined]);
      expect(table.problems).toEqual([
        "common/country_colors/00_country_colors.txt: DAN's color1 comes after color2: the game reads color1, color2 and color3 only in that order",
        "common/country_colors/00_country_colors.txt: NOR's color1 is not three numbers from 0 to 255",
      ]);
    } finally {
      await removeTree(root);
    }
  });
});
