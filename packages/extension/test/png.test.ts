import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, encodePng, thumbnail } from '../src/png.ts';

describe('encodePng', () => {
  it('writes the signature, IHDR, IDAT and IEND with their CRCs', () => {
    const png = encodePng(2, 1, Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 128]));
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const chunks: { type: string; data: Uint8Array }[] = [];
    for (let at = 8; at < png.length;) {
      const length = view.getUint32(at);
      const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
      const data = png.subarray(at + 8, at + 8 + length);
      expect(view.getUint32(at + 8 + length)).toBe(crc32(png.subarray(at + 4, at + 8 + length)));
      chunks.push({ type, data });
      at += 12 + length;
    }
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(Array.from(chunks[0]?.data ?? [])).toEqual([0, 0, 0, 2, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
    expect(Array.from(inflateSync(chunks[1]?.data ?? new Uint8Array()))).toEqual([
      0, 255, 0, 0, 255, 0, 0, 255, 128,
    ]);
  });

  it('computes the CRC-32 of the PNG specification', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082);
  });

  it('refuses texels that do not fill the size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(4))).toThrow('4 bytes are not 2 × 2 RGBA');
  });
});

describe('thumbnail', () => {
  it('keeps a texture that fits', () => {
    const rgba = new Uint8Array(4 * 4 * 4);
    expect(thumbnail(4, 4, rgba, 8).rgba).toBe(rgba);
  });

  it('averages boxes, weighting colour by alpha', () => {
    // 2 × 1: opaque red beside transparent green, to 1 × 1.
    const small = thumbnail(2, 1, Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 0]), 1);
    expect(small).toEqual({ width: 1, height: 1, rgba: Uint8Array.from([255, 0, 0, 128]) });
  });

  it('keeps the aspect ratio', () => {
    const wide = thumbnail(300, 75, new Uint8Array(300 * 75 * 4), 128);
    expect([wide.width, wide.height]).toEqual([128, 32]);
  });
});
