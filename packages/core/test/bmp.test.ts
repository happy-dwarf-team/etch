import { describe, expect, it } from 'vitest';
import { BmpReadError, readBmp } from '../src/asset/index.ts';

/** A BMP file of RGB texels, top row first in `rows`, stored as `bits` bits a texel. */
function bmp(rows: number[][][], bits: 24 | 32 = 24, topDown = false): Uint8Array {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const texel = bits / 8;
  const stride = Math.ceil((width * texel) / 4) * 4;
  const bytes = new Uint8Array(54 + stride * height);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, topDown ? -height : height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, bits, true);
  for (const [y, row] of rows.entries()) {
    const stored = topDown ? y : height - 1 - y;
    for (const [x, [r = 0, g = 0, b = 0] = []] of row.entries()) {
      bytes.set(texel === 4 ? [b, g, r, 0] : [b, g, r], 54 + stored * stride + x * texel);
    }
  }
  return bytes;
}

// Three texels wide, so a 24-bit row (9 bytes) is padded to 12.
const ROWS = [
  [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ],
  [
    [10, 20, 30],
    [40, 50, 60],
    [70, 80, 90],
  ],
];
const RGBA = [
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
];

describe('readBmp', () => {
  it('reads 24-bit rows bottom-up, padded to four bytes, top row first', () => {
    const image = readBmp(bmp(ROWS));
    expect([image.width, image.height]).toEqual([3, 2]);
    expect(Array.from(image.rgba)).toEqual(RGBA);
  });

  it('reads top-down and 32-bit files, opaque whatever the fourth byte', () => {
    expect(Array.from(readBmp(bmp(ROWS, 24, true)).rgba)).toEqual(RGBA);
    expect(Array.from(readBmp(bmp(ROWS, 32)).rgba)).toEqual(RGBA);
  });

  it('refuses what it does not read, before allocating', () => {
    expect(() => readBmp(new TextEncoder().encode('DDS '))).toThrow(BmpReadError);
    const indexed = bmp(ROWS);
    new DataView(indexed.buffer).setUint16(28, 8, true);
    expect(() => readBmp(indexed)).toThrow(/8 bits/);
    const rle = bmp(ROWS);
    new DataView(rle.buffer).setUint32(30, 1, true);
    expect(() => readBmp(rle)).toThrow(/compression 1/);
    const huge = bmp(ROWS);
    new DataView(huge.buffer).setInt32(18, 1 << 30, true);
    expect(() => readBmp(huge)).toThrow(/cut short/);
    expect(() => readBmp(bmp(ROWS).subarray(0, 60))).toThrow(/cut short/);
  });
});
