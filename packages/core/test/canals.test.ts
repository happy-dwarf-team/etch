import { describe, expect, it } from 'vitest';
import {
  bmpSize,
  checkCanals,
  parseScript,
  readCanalDefinitions,
  type BitmapSize,
} from '../src/index.ts';

/** The first 26 bytes of a BMP file of the given size; a negative height is a top-down one. */
function bmpHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  const view = new DataView(bytes.buffer);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  return bytes;
}

const MAP = `max_provinces = 10
canal_definition = { name = "fits" x = 10 y = 20 }
canal_definition = { name = "edge" x = 36 y = 36 }
canal_definition = { name = "Top" x = 0 y = 40 }
canal_definition = { name = "left" x = -1 y = -5 }
canal_definition = { name = "missing" x = 1 y = 1 }
canal_definition = { name = "unread" x = 900 y = 900 }
canal_definition = { x = 1 y = 1 }
canal_definition = { name = "words" x = here y = 1 }
`;

describe('canal definitions', () => {
  it('reads each canal_definition block with its name and corner', () => {
    const canals = readCanalDefinitions(parseScript(MAP, { script: true }));
    expect(canals.map((c) => [c.name?.text, c.x?.text, c.y?.text])).toEqual([
      ['fits', '10', '20'],
      ['edge', '36', '36'],
      ['Top', '0', '40'],
      ['left', '-1', '-5'],
      ['missing', '1', '1'],
      ['unread', '900', '900'],
      [undefined, '1', '1'],
      ['words', 'here', '1'],
    ]);
  });

  it("reads a BMP header's size, bottom-up or top-down, and nothing else", () => {
    expect(bmpSize(bmpHeader(5632, 2048))).toEqual({ width: 5632, height: 2048 });
    expect(bmpSize(bmpHeader(64, -64))).toEqual({ width: 64, height: 64 });
    expect(bmpSize(new Uint8Array(10))).toBeUndefined();
    expect(bmpSize(new Uint8Array(26))).toBeUndefined();
  });

  it('warns about a canal without its bitmap and one that does not fit the river map', () => {
    const size = (width: number, height: number): BitmapSize => ({ width, height });
    const diagnostics = checkCanals(parseScript(MAP, { script: true }), {
      rivers: size(100, 50),
      riversPath: 'map/rivers.bmp',
      canals: new Map([
        ['fits', size(64, 16)],
        ['edge', size(64, 14)],
        ['top', size(32, 16)],
        ['left', size(8, 8)],
        ['missing', null],
        ['words', size(8, 8)],
      ]),
    });
    // "edge" ends on the river map's last column and row: it fits.
    expect(diagnostics.map((d) => `${d.name} ${d.key} ${d.code}`)).toEqual([
      'Top y canal-outside-map',
      'left x canal-outside-map',
      'left y canal-outside-map',
      'missing name canal-bitmap-missing',
    ]);
    const text = (i: number) => MAP.slice(diagnostics[i]?.start, diagnostics[i]?.end);
    expect([0, 1, 2, 3].map(text)).toEqual(['40', '-1', '-5', '"missing"']);
    expect(diagnostics[0]?.message).toBe(
      "The canal's bitmap (32 × 16) at x = 0, y = 40 does not fit in map/rivers.bmp (100 × 50). " +
        'When the canal is built, the game copies its pixels there without a check, past the map, ' +
        'which can crash it.',
    );
    expect(diagnostics[3]?.message).toContain('The playset has no map/missing_river.bmp.');
    // Without the river map's size only a missing bitmap is known.
    const unknown = checkCanals(parseScript(MAP, { script: true }), {
      rivers: undefined,
      riversPath: 'map/rivers.bmp',
      canals: new Map([
        ['edge', size(64, 14)],
        ['missing', null],
      ]),
    });
    expect(unknown.map((d) => d.code)).toEqual(['canal-bitmap-missing']);
  });
});
