/**
 * The capture driver's check of its screenshots (ADR 0002, etch#18, etch#42). Tongs' screenshots
 * are not synchronised with a frame, and some views are drawn over an animated background (the
 * main menu) or map, so the driver takes several shots of a view and records which pixels were not
 * the same in all of them: the unstable mask. The comparison (etch#43) compares no pixel that is
 * unstable.
 */
import type { RgbaImage } from './png.ts';

export interface ShotComparison {
  readonly width: number;
  readonly height: number;
  /** One byte per pixel: 255 where some shot differs from the first in any channel, else 0. */
  readonly unstable: Uint8Array;
  /** How many pixels are unstable. */
  readonly unstablePixels: number;
}

/** Compares shots of the same size pixel by pixel; at least two are needed. */
export function compareShots(shots: readonly RgbaImage[]): ShotComparison {
  const [first, ...others] = shots;
  if (first === undefined || others.length === 0) throw new Error('Compare at least two shots.');
  for (const shot of others) {
    if (shot.width !== first.width || shot.height !== first.height) {
      throw new Error(
        `The shots differ in size: ${String(first.width)}x${String(first.height)} and ${String(shot.width)}x${String(shot.height)}.`,
      );
    }
  }
  const pixels = first.width * first.height;
  const unstable = new Uint8Array(pixels);
  let unstablePixels = 0;
  const a = first.data;
  for (const shot of others) {
    const b = shot.data;
    for (let p = 0, i = 0; p < pixels; p++, i += 4) {
      if (unstable[p] !== 0) continue;
      if (
        a[i] !== b[i] ||
        a[i + 1] !== b[i + 1] ||
        a[i + 2] !== b[i + 2] ||
        a[i + 3] !== b[i + 3]
      ) {
        unstable[p] = 255;
        unstablePixels++;
      }
    }
  }
  return { width: first.width, height: first.height, unstable, unstablePixels };
}

/** How many unstable pixels lie inside any of the rects (client pixels, clipped to the image). */
export function unstableIn(
  comparison: ShotComparison,
  rects: readonly {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[],
): number {
  const inside = new Uint8Array(comparison.unstable.length);
  for (const rect of rects) {
    const x0 = Math.max(0, rect.x);
    const x1 = Math.min(comparison.width, rect.x + rect.w);
    for (let y = Math.max(0, rect.y); y < Math.min(comparison.height, rect.y + rect.h); y++) {
      if (x1 > x0) inside.fill(1, y * comparison.width + x0, y * comparison.width + x1);
    }
  }
  let count = 0;
  comparison.unstable.forEach((u, i) => {
    if (u !== 0 && inside[i] !== 0) count++;
  });
  return count;
}
