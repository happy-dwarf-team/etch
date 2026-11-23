import { describe, expect, it } from 'vitest';
import { CHECKER, GAP, STRIP_WIDTH, spriteStrip, stripCaption } from '../src/sprite-strip.ts';

/** A texture of `frames` cells across, each cell one solid colour: red, green, blue, … */
function cells(frameWidth: number, height: number, frames: number, alpha = 255): Uint8Array {
  const width = frameWidth * frames;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const frame = Math.floor(x / frameWidth);
      const i = (y * width + x) * 4;
      rgba[i + (frame % 3)] = 255;
      rgba[i + 3] = alpha;
    }
  }
  return rgba;
}

function pixel(strip: { width: number; rgba: Uint8Array }, x: number, y: number): number[] {
  const i = (y * strip.width + x) * 4;
  return Array.from(strip.rgba.subarray(i, i + 4));
}

describe('spriteStrip', () => {
  it('puts the frames of a small strip side by side at 2×, with gaps between them', () => {
    const strip = spriteStrip(114, 38, cells(38, 38, 3), 3);
    expect([strip.width, strip.height, strip.scale, strip.shown]).toEqual([
      3 * 76 + 2 * GAP,
      76,
      2,
      3,
    ]);
    expect(pixel(strip, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(strip, 75, 75)).toEqual([255, 0, 0, 255]);
    expect(pixel(strip, 76, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(strip, 76 + GAP, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(strip, 2 * (76 + GAP), 40)).toEqual([0, 0, 255, 255]);
  });

  it('draws transparent texels over the checkerboard', () => {
    const strip = spriteStrip(16, 16, new Uint8Array(16 * 16 * 4), 1);
    expect(pixel(strip, 0, 0)).toEqual([0x9a, 0x9a, 0x9a, 255]);
    expect(pixel(strip, CHECKER, 0)).toEqual([0x66, 0x66, 0x66, 255]);
    expect(pixel(strip, CHECKER, CHECKER)).toEqual([0x9a, 0x9a, 0x9a, 255]);
    const half = spriteStrip(16, 16, cells(16, 16, 1, 128), 1);
    expect(pixel(half, 0, 0)).toEqual([
      Math.round(255 * (128 / 255) + 0x9a * (127 / 255)),
      77,
      77,
      255,
    ]);
  });

  it('keeps a mid-sized frame at 1× and scales a large one down', () => {
    expect(spriteStrip(100, 100, cells(100, 100, 1), 1).scale).toBe(1);
    const large = spriteStrip(512, 256, cells(512, 256, 1), 1);
    expect([large.width, large.height, large.scale]).toEqual([128, 64, 0.25]);
  });

  it('wraps a long strip into rows and leaves out the frames past the last row', () => {
    const strip = spriteStrip(32 * 40, 32, cells(32, 32, 40), 40);
    const columns = Math.floor((STRIP_WIDTH + GAP) / (64 + GAP));
    expect(strip.width).toBe(columns * 64 + (columns - 1) * GAP);
    expect(strip.height).toBe(4 * 64 + 3 * GAP);
    expect(strip.shown).toBe(columns * 4);
    // The second row starts with frame `columns`, whose colour is red, green or blue in turn.
    const second = [0, 0, 0, 255];
    second[columns % 3] = 255;
    expect(pixel(strip, 0, 64 + GAP)).toEqual(second);
  });
});

describe('stripCaption', () => {
  const base = { width: 1, height: 1, rgba: new Uint8Array(4) };
  it('says the order of the frames and the scale', () => {
    expect(stripCaption({ ...base, scale: 2, frames: 3, shown: 3 })).toBe(
      'Frames 1 to 3, left to right, at 2×.',
    );
    expect(stripCaption({ ...base, scale: 1, frames: 40, shown: 24 })).toBe(
      'Frames 1 to 24 of 40, left to right.',
    );
    expect(stripCaption({ ...base, scale: 2, frames: 1, shown: 1 })).toBe('At 2×.');
    expect(stripCaption({ ...base, scale: 0.5, frames: 1, shown: 1 })).toBe('Scaled down.');
    expect(stripCaption({ ...base, scale: 1, frames: 1, shown: 1 })).toBe('');
  });
});
