import { describe, expect, it } from 'vitest';
import {
  DIFF_CLASS,
  DIFF_COLOURS,
  diffCounts,
  diffImages,
  readHostImage,
  type RgbaImage,
} from '../webview/diff.ts';

/** An image of one straight RGBA colour, with some pixels set apart. */
function image(
  width: number,
  height: number,
  rgba: readonly number[],
  pixels: Record<string, readonly number[]> = {},
): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  for (const [at, value] of Object.entries(pixels)) {
    const [x = 0, y = 0] = at.split(',').map(Number);
    data.set(value, (y * width + x) * 4);
  }
  return { width, height, data };
}

function pixel(picture: { image: Uint8ClampedArray }, width: number, x: number, y: number) {
  const i = (y * width + x) * 4;
  return Array.from(picture.image.subarray(i, i + 4));
}

describe('readHostImage', () => {
  it("reads the plugin's TGA as RGBA and keeps an alpha of 0 everywhere", () => {
    const bytes = new Uint8Array(18 + 2 * 1 * 4);
    bytes[2] = 2;
    bytes[12] = 2;
    bytes[14] = 1;
    bytes[16] = 32;
    bytes[17] = 0x28;
    bytes.set([10, 20, 30, 0, 1, 2, 3, 0], 18);
    expect(readHostImage(bytes)).toEqual({
      width: 2,
      height: 1,
      data: new Uint8Array([30, 20, 10, 0, 3, 2, 1, 0]),
    });
  });

  it('refuses another kind of TGA', () => {
    const bytes = new Uint8Array(18 + 4);
    bytes[2] = 10;
    bytes[12] = 1;
    bytes[14] = 1;
    bytes[16] = 32;
    bytes[17] = 0x28;
    expect(() => readHostImage(bytes)).toThrow(/uncompressed 32-bit/);
  });
});

describe('diffImages', () => {
  const crop = { x: 1, y: 1, width: 3, height: 2 };

  it('tells the same pixels from those only one backend draws and those both draw differently', () => {
    const offline = image(5, 4, [0, 0, 0, 0], {
      '1,1': [200, 100, 50, 255],
      '2,1': [200, 100, 50, 255],
      '3,1': [200, 100, 50, 255],
      '1,2': [255, 255, 255, 255],
      // Outside the crop: not compared.
      '0,0': [255, 255, 255, 255],
    });
    const host = image(3, 2, [0, 0, 0, 0], {
      // Within ±2.
      '0,0': [202, 98, 50, 255],
      // 60 brighter in red.
      '1,0': [255, 100, 50, 255],
      // Nothing where the offline renderer draws.
      '2,0': [0, 0, 0, 0],
      // White where the offline renderer draws nothing.
      '2,1': [255, 255, 255, 255],
    });
    // (0, 1) of the crop: the offline renderer's white over the game host's nothing.
    const shown = diffImages(offline, host, crop);
    const at = (x: number, y: number): number => shown.classes[y * 5 + x] ?? -1;
    expect(at(1, 1)).toBe(DIFF_CLASS.same);
    expect(at(2, 1)).toBe(DIFF_CLASS.different);
    expect(at(3, 1)).toBe(DIFF_CLASS.offlineOnly);
    expect(at(1, 2)).toBe(DIFF_CLASS.offlineOnly);
    expect(at(2, 2)).toBe(DIFF_CLASS.same);
    expect(at(3, 2)).toBe(DIFF_CLASS.hostOnly);
    expect(at(0, 0)).toBe(DIFF_CLASS.outside);
    expect(shown.summary).toEqual({
      compared: 6,
      different: 1,
      offlineOnly: 2,
      hostOnly: 1,
      largest: 255,
    });

    // Red brighter the larger the difference, the class colours, and the same in dim grey.
    expect(pixel(shown, 5, 2, 1)).toEqual([127 + 55, ...DIFF_COLOURS.different.slice(1), 255]);
    expect(pixel(shown, 5, 3, 1)).toEqual([...DIFF_COLOURS.offlineOnly, 255]);
    expect(pixel(shown, 5, 3, 2)).toEqual([...DIFF_COLOURS.hostOnly, 255]);
    const [grey = 0, ...rest] = pixel(shown, 5, 2, 2);
    expect(rest).toEqual([grey, grey, 255]);
    expect(grey).toBe(32 + (128 >> 1));
    // Outside the crop, the offline renderer's white darkened.
    expect(pixel(shown, 5, 0, 0)).toEqual([63, 63, 63, 255]);
  });

  it('compares colours premultiplied, so an almost transparent colour does not count', () => {
    const offline = image(1, 1, [255, 0, 0, 1]);
    const host = image(1, 1, [0, 0, 255, 1]);
    const shown = diffImages(offline, host, { x: 0, y: 0, width: 1, height: 1 });
    expect(shown.classes[0]).toBe(DIFF_CLASS.same);
    expect(shown.summary.largest).toBe(1);
  });

  it("refuses an image that is not the crop's size", () => {
    expect(() => diffImages(image(4, 4, [0, 0, 0, 0]), image(2, 2, [0, 0, 0, 0]), crop)).toThrow(
      /2×2, its crop 3×2/,
    );
  });
});

describe('diffCounts', () => {
  it("counts a rect's pixels within the crop and those that differ", () => {
    const offline = image(4, 4, [0, 0, 0, 0], { '1,1': [255, 255, 255, 255] });
    const host = image(2, 2, [0, 0, 0, 0]);
    const shown = diffImages(offline, host, { x: 1, y: 1, width: 2, height: 2 });
    expect(diffCounts(shown, { x: 0, y: 0, width: 4, height: 4 })).toEqual({
      compared: 4,
      differing: 1,
    });
    expect(diffCounts(shown, { x: 1.5, y: 1.5, width: 1, height: 1 })).toEqual({
      compared: 4,
      differing: 1,
    });
    expect(diffCounts(shown, { x: 3, y: 3, width: 1, height: 1 })).toEqual({
      compared: 0,
      differing: 0,
    });
  });
});
