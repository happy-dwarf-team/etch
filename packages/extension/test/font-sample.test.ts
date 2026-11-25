import { describe, expect, it } from 'vitest';
import { parseBmFont } from '@etch/core';
import { DARK_BACKGROUND, LIGHT_BACKGROUND, PADDING, fontSample } from '../src/font-sample.ts';

/** A 4 × 4 atlas: `A` is a white 2 × 2 square at (0, 0), `B` a half-transparent one at (2, 2). */
const ATLAS = (() => {
  const rgba = new Uint8Array(4 * 4 * 4);
  const fill = (x0: number, y0: number, alpha: number): void => {
    for (let y = y0; y < y0 + 2; y++) {
      for (let x = x0; x < x0 + 2; x++) rgba.set([255, 255, 255, alpha], (y * 4 + x) * 4);
    }
  };
  fill(0, 0, 255);
  fill(2, 2, 128);
  return { width: 4, height: 4, rgba };
})();

function font(lineHeight: number) {
  return parseBmFont(
    [
      `common lineHeight=${String(lineHeight)} base=2 scaleW=4 scaleH=4`,
      'char id=65 x=0 y=0 width=2 height=2 xoffset=0 yoffset=0 xadvance=3',
      'char id=66 x=2 y=2 width=2 height=2 xoffset=0 yoffset=0 xadvance=3',
    ].join('\n'),
  ).font;
}

function pixel(sample: { width: number; rgba: Uint8Array }, x: number, y: number): number[] {
  const i = (y * sample.width + x) * 4;
  return Array.from(sample.rgba.subarray(i, i + 4));
}

/** A colour at alpha 128 over the background, as 8 bits. */
function over(value: number, back: number): number {
  const a = 128 / 255;
  return Math.round(value * a + back * (1 - a));
}

describe('fontSample', () => {
  it('draws each glyph tinted with the colour, on a background it stands out from', () => {
    const sample = fontSample(font(20), ATLAS, 0xffffff00, undefined, 'AB');
    expect(sample.scale).toBe(1);
    expect([sample.width, sample.height]).toEqual([
      PADDING + 3 + 2 + PADDING,
      PADDING + 20 + PADDING,
    ]);
    expect(pixel(sample, PADDING, PADDING)).toEqual([255, 255, 0, 255]);
    // B's texels are half transparent: half yellow over the background.
    expect(pixel(sample, PADDING + 3, PADDING)).toEqual([
      over(255, DARK_BACKGROUND),
      over(255, DARK_BACKGROUND),
      over(0, DARK_BACKGROUND),
      255,
    ]);
    expect(pixel(sample, 0, 0)).toEqual([DARK_BACKGROUND, DARK_BACKGROUND, DARK_BACKGROUND, 255]);
    expect(sample.missing).toBe(0);
  });

  it('puts a dark colour on a light background', () => {
    const sample = fontSample(font(20), ATLAS, 0xff000000, undefined, 'A');
    expect(pixel(sample, 0, 0)).toEqual([
      LIGHT_BACKGROUND,
      LIGHT_BACKGROUND,
      LIGHT_BACKGROUND,
      255,
    ]);
    expect(pixel(sample, PADDING, PADDING)).toEqual([0, 0, 0, 255]);
  });

  it('draws the thin edge of a glyph in the border colour', () => {
    // B's texels have alpha 128, under 0.75 of the border's: the border colour times the texel.
    const sample = fontSample(font(20), ATLAS, 0xffffffff, 0xff0000ff, 'B');
    expect(pixel(sample, PADDING, PADDING)).toEqual([
      over(0, DARK_BACKGROUND),
      over(0, DARK_BACKGROUND),
      over(255, DARK_BACKGROUND),
      255,
    ]);
  });

  it('draws a small font at 2× and counts the characters it lacks', () => {
    const sample = fontSample(font(10), ATLAS, 0xffffffff, undefined, 'AxA');
    expect(sample.scale).toBe(2);
    expect(sample.width % 2).toBe(0);
    expect(pixel(sample, 2 * PADDING + 1, 2 * PADDING + 1)).toEqual([255, 255, 255, 255]);
    expect(sample.missing).toBe(1);
  });
});
