import { describe, expect, it } from 'vitest';
import { inspectTexture, rgbaOf, TextureReadError } from '../src/index.ts';
import {
  BGRA_MASKS,
  concat,
  dds,
  dxt1Block,
  GREEN_565,
  indices2,
  RED_565,
  tga,
} from './fixtures.ts';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

describe('inspectTexture', () => {
  it('lists a BGRA8 DDS file and swaps its texels to RGBA', () => {
    const file = dds({
      width: 2,
      height: 1,
      bitCount: 32,
      masks: BGRA_MASKS,
      data: bytes(1, 2, 3, 255, 4, 5, 6, 128),
    });
    const { summary, rgba } = inspectTexture('gfx/interface/a.dds', file);
    expect(summary).toEqual({
      container: 'DDS',
      level: 0,
      width: 2,
      height: 1,
      drawnWidth: 2,
      drawnHeight: 1,
      format: 'BGRA8',
      dx10: false,
      mipLevels: 1,
      hasAlpha: true,
    });
    expect(Array.from(rgba)).toEqual([3, 2, 1, 255, 6, 5, 4, 128]);
  });

  it('reads the mip count the header declares', () => {
    const level0 = concat(
      dxt1Block(RED_565, GREEN_565, 0),
      dxt1Block(RED_565, GREEN_565, 0),
      dxt1Block(RED_565, GREEN_565, 0),
      dxt1Block(RED_565, GREEN_565, 0),
    );
    const chain = concat(
      level0,
      dxt1Block(RED_565, GREEN_565, 0),
      dxt1Block(RED_565, GREEN_565, 0),
    );
    const file = dds({ width: 8, height: 8, fourCC: 'DXT1', mipLevels: 4, data: chain });
    const { summary } = inspectTexture('a.DDS', file);
    expect(summary).toMatchObject({ format: 'DXT1', mipLevels: 4, hasAlpha: false });
  });

  it('shows a later mip level at its own size', () => {
    // 4 × 2 BGRA8, then 2 × 1 and 1 × 1.
    const level0 = new Uint8Array(4 * 2 * 4).fill(10);
    const level1 = bytes(1, 2, 3, 255, 4, 5, 6, 255);
    const level2 = bytes(7, 8, 9, 0);
    const file = dds({
      width: 4,
      height: 2,
      bitCount: 32,
      masks: BGRA_MASKS,
      mipLevels: 3,
      data: concat(level0, level1, level2),
    });
    const second = inspectTexture('a.dds', file, 1);
    expect(second.summary).toMatchObject({ level: 1, width: 2, height: 1, mipLevels: 3 });
    expect(Array.from(second.rgba)).toEqual([3, 2, 1, 255, 6, 5, 4, 255]);
    const third = inspectTexture('a.dds', file, 2);
    expect(third.summary).toMatchObject({ level: 2, width: 1, height: 1, hasAlpha: true });
    expect(Array.from(third.rgba)).toEqual([9, 8, 7, 0]);
    expect(() => inspectTexture('a.dds', file, 3)).toThrow('DDS file has no mip level 3');
  });

  it('skips the DXT levels before the one shown', () => {
    // 8 × 8: four blocks of green, then one red block for 4 × 4.
    const green = dxt1Block(GREEN_565, GREEN_565, 0);
    const red = dxt1Block(RED_565, RED_565, 0);
    const file = dds({
      width: 8,
      height: 8,
      fourCC: 'DXT1',
      mipLevels: 2,
      data: concat(green, green, green, green, red),
    });
    const { summary, rgba } = inspectTexture('a.dds', file, 1);
    expect(summary).toMatchObject({ width: 4, height: 4, drawnWidth: 4 });
    expect(Array.from(rgba.subarray(0, 4))).toEqual([255, 0, 0, 255]);

    // 6 × 6, then 3 × 3 in one block: a later level names no padded size.
    const odd = dds({
      width: 6,
      height: 6,
      fourCC: 'DXT1',
      mipLevels: 2,
      data: concat(green, green, green, green, red),
    });
    expect(inspectTexture('a.dds', odd, 0).summary).toMatchObject({ width: 6, drawnWidth: 8 });
    expect(inspectTexture('a.dds', odd, 1).summary).toMatchObject({
      width: 3,
      height: 3,
      drawnWidth: 3,
      drawnHeight: 3,
    });
  });

  it('shows a DXT image at its header size and names the size the game draws', () => {
    // One block, texel 0 red and the rest green; the header says 3 × 2.
    const block = dxt1Block(
      RED_565,
      GREEN_565,
      indices2([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    );
    const { summary, rgba } = inspectTexture(
      'a.dds',
      dds({ width: 3, height: 2, fourCC: 'DXT1', data: block }),
    );
    expect(summary).toMatchObject({ width: 3, height: 2, drawnWidth: 4, drawnHeight: 4 });
    expect(rgba.length).toBe(3 * 2 * 4);
    expect(Array.from(rgba.subarray(0, 8))).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('marks the DX10 header', () => {
    const file = dds({ width: 1, height: 1, dxgiFormat: 87, data: bytes(10, 20, 30, 255) });
    const { summary, rgba } = inspectTexture('a.dds', file);
    expect(summary).toMatchObject({ format: 'BGRA8', dx10: true, hasAlpha: false });
    expect(Array.from(rgba)).toEqual([30, 20, 10, 255]);
  });

  it('names the TGA encoding', () => {
    const raw = tga({ width: 1, height: 1, imageType: 2, pixelBits: 24, data: bytes(1, 2, 3) });
    expect(inspectTexture('a.tga', raw).summary).toMatchObject({
      container: 'TGA',
      format: '24-bit',
      mipLevels: 1,
      hasAlpha: false,
    });
    // One run-length packet of two texels.
    const rle = tga({
      width: 2,
      height: 1,
      imageType: 10,
      pixelBits: 32,
      data: bytes(0x81, 1, 2, 3, 4),
    });
    const read = inspectTexture('a.tga', rle);
    expect(read.summary).toMatchObject({ format: '32-bit RLE', hasAlpha: true });
    expect(Array.from(read.rgba)).toEqual([3, 2, 1, 4, 3, 2, 1, 4]);
    const mapped = tga({
      width: 1,
      height: 1,
      imageType: 1,
      pixelBits: 8,
      map: { first: 0, bits: 24, entries: bytes(9, 8, 7) },
      data: bytes(0),
    });
    expect(inspectTexture('a.tga', mapped).summary.format).toBe('colour-mapped 24-bit');
  });

  it('throws the readers’ errors', () => {
    expect(() => inspectTexture('a.dds', bytes(1, 2, 3))).toThrow(TextureReadError);
    expect(() => inspectTexture('a.png', bytes(1, 2, 3))).toThrow(TextureReadError);
    const raw = tga({ width: 1, height: 1, imageType: 2, pixelBits: 24, data: bytes(1, 2, 3) });
    expect(() => inspectTexture('a.tga', raw, 1)).toThrow('TGA file has no mip levels');
  });
});

describe('rgbaOf', () => {
  it('fills an opaque alpha for layouts without one', () => {
    expect(
      Array.from(
        rgbaOf({ kind: 'pixels', width: 1, height: 1, layout: 'bgr', data: bytes(1, 2, 3) }),
      ),
    ).toEqual([3, 2, 1, 255]);
    expect(
      Array.from(
        rgbaOf({ kind: 'pixels', width: 1, height: 1, layout: 'bgrx', data: bytes(1, 2, 3, 0) }),
      ),
    ).toEqual([3, 2, 1, 255]);
  });
});
