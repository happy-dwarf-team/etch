/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { compareShots, decodePng, encodeGreyPng, unstableIn } from '../../src/corpus/index.ts';

const image = (pixels: number[]): { width: number; height: number; data: Uint8Array } => ({
  width: 2,
  height: 2,
  data: Uint8Array.from(pixels.flatMap((p) => [p, p, p, 255])),
});

describe('compareShots', () => {
  it('marks the pixels that differ from the first shot in any later shot', () => {
    const result = compareShots([image([1, 2, 3, 4]), image([1, 9, 3, 4]), image([1, 2, 3, 8])]);
    expect([...result.unstable]).toEqual([0, 255, 0, 255]);
    expect(result.unstablePixels).toBe(2);
    expect(unstableIn(result, [{ x: 1, y: 0, w: 1, h: 2 }])).toBe(2);
    // Overlapping rects count a pixel once; rects are clipped to the image; empty ones count none.
    expect(
      unstableIn(result, [
        { x: 0, y: 0, w: 2, h: 1 },
        { x: -5, y: -5, w: 7, h: 6 },
        { x: 0, y: 0, w: 2, h: -100 },
      ]),
    ).toBe(1);
  });

  it('finds identical shots stable and refuses one shot or different sizes', () => {
    expect(compareShots([image([1, 2, 3, 4]), image([1, 2, 3, 4])]).unstablePixels).toBe(0);
    expect(() => compareShots([image([1, 2, 3, 4])])).toThrow('at least two');
    expect(() =>
      compareShots([image([1, 2, 3, 4]), { width: 1, height: 1, data: new Uint8Array(4) }]),
    ).toThrow('differ in size');
  });
});

describe('encodeGreyPng', () => {
  it('writes a greyscale mask that reads back', () => {
    const mask = decodePng(encodeGreyPng(2, 1, Uint8Array.of(0, 255)));
    expect([...mask.data]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(() => encodeGreyPng(2, 2, new Uint8Array(3))).toThrow('do not match');
  });
});
