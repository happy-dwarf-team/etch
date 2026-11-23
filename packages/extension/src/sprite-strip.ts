// The picture of a sprite's hover: every frame of a strip side by side, on a checkerboard so that
// alpha shows, small frames at 2× with sharp pixels. VS Code draws a hover's picture from a PNG
// as it is, so the frames, the gaps and the checkerboard are put together into one image here.
// No `vscode` here, so the unit tests run it.

import { thumbnail } from './png.ts';

/** A frame at most this many pixels on its longest side is drawn at 2×. */
export const SMALL_FRAME = 64;
/** A larger frame is scaled down to at most this many pixels on its longest side. */
export const LARGE_FRAME = 128;
/** The widest the picture gets before the frames wrap onto another row. */
export const STRIP_WIDTH = 480;
/** The most rows of frames; frames past them are left out. */
export const STRIP_ROWS = 4;
/** The space between two frames, which stays transparent. */
export const GAP = 6;
/** The side of a checkerboard square, in pixels of the picture. */
export const CHECKER = 8;
/** The checkerboard's two greys, those of the texture view. */
const LIGHT = 0x9a;
const DARK = 0x66;

export interface Strip {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  /** How much each frame is enlarged: 2, 1, or less than 1 when scaled down. */
  readonly scale: number;
  /** The frames of the sprite, and how many of them the picture holds. */
  readonly frames: number;
  readonly shown: number;
}

/**
 * The picture of a texture cut into `frames` cells across its width, as a sprite's
 * `noOfFrames` cuts it: the cells in reading order, wrapped into rows of at most
 * {@link STRIP_WIDTH} pixels, each over a checkerboard.
 */
export function spriteStrip(
  width: number,
  height: number,
  rgba: Uint8Array,
  frames: number,
): Strip {
  const count = Math.max(1, Math.floor(frames));
  const frameWidth = Math.max(1, Math.floor(width / count));
  const longest = Math.max(frameWidth, height);
  const scale = longest <= SMALL_FRAME ? 2 : Math.min(1, LARGE_FRAME / longest);
  const cells: { width: number; height: number; rgba: Uint8Array }[] = [];
  const columns = Math.max(
    1,
    Math.min(count, Math.floor((STRIP_WIDTH + GAP) / (cellSide(frameWidth, scale) + GAP))),
  );
  const rows = Math.min(STRIP_ROWS, Math.ceil(count / columns));
  const shown = Math.min(count, columns * rows);
  for (let frame = 0; frame < shown; frame++) {
    const cut = cutFrame(width, height, rgba, frame * frameWidth, frameWidth);
    cells.push(
      scale === 2
        ? doubled(frameWidth, height, cut)
        : thumbnail(frameWidth, height, cut, LARGE_FRAME),
    );
  }
  const cellWidth = cells[0]?.width ?? 1;
  const cellHeight = cells[0]?.height ?? 1;
  const outWidth = columns * cellWidth + (columns - 1) * GAP;
  const outHeight = rows * cellHeight + (rows - 1) * GAP;
  const out = new Uint8Array(outWidth * outHeight * 4);
  cells.forEach((cell, index) => {
    const left = (index % columns) * (cellWidth + GAP);
    const top = Math.floor(index / columns) * (cellHeight + GAP);
    for (let y = 0; y < cell.height; y++) {
      for (let x = 0; x < cell.width; x++) {
        const from = (y * cell.width + x) * 4;
        const to = ((top + y) * outWidth + left + x) * 4;
        const back = (Math.floor(x / CHECKER) + Math.floor(y / CHECKER)) % 2 === 0 ? LIGHT : DARK;
        const alpha = (cell.rgba[from + 3] ?? 0) / 255;
        for (let channel = 0; channel < 3; channel++) {
          out[to + channel] = Math.round(
            (cell.rgba[from + channel] ?? 0) * alpha + back * (1 - alpha),
          );
        }
        out[to + 3] = 255;
      }
    }
  });
  return { width: outWidth, height: outHeight, rgba: out, scale, frames: count, shown };
}

/** A frame's width in the picture, as `thumbnail` and `doubled` make it. */
function cellSide(frameWidth: number, scale: number): number {
  return Math.max(1, Math.round(frameWidth * scale));
}

/** Columns `left` to `left + frameWidth` of the texture. */
function cutFrame(
  width: number,
  height: number,
  rgba: Uint8Array,
  left: number,
  frameWidth: number,
): Uint8Array {
  const pixels = new Uint8Array(frameWidth * height * 4);
  for (let y = 0; y < height; y++) {
    const from = (y * width + left) * 4;
    pixels.set(rgba.subarray(from, from + frameWidth * 4), y * frameWidth * 4);
  }
  return pixels;
}

/** The pixels at twice the size, each one a 2 × 2 block. */
function doubled(
  width: number,
  height: number,
  rgba: Uint8Array,
): { width: number; height: number; rgba: Uint8Array } {
  const out = new Uint8Array(width * height * 16);
  for (let y = 0; y < height * 2; y++) {
    for (let x = 0; x < width * 2; x++) {
      const from = ((y >> 1) * width + (x >> 1)) * 4;
      out.set(rgba.subarray(from, from + 4), (y * width * 2 + x) * 4);
    }
  }
  return { width: width * 2, height: height * 2, rgba: out };
}

/** The caption under the picture: the frames' order, those left out and the scale. */
export function stripCaption(strip: Strip): string {
  const parts: string[] = [];
  if (strip.frames > 1) {
    parts.push(
      strip.shown < strip.frames
        ? `Frames 1 to ${String(strip.shown)} of ${String(strip.frames)}, left to right`
        : `Frames 1 to ${String(strip.frames)}, left to right`,
    );
  }
  if (strip.scale === 2) parts.push('at 2×');
  else if (strip.scale < 1) parts.push('scaled down');
  const caption = parts.join(', ');
  return caption === '' ? '' : `${caption.charAt(0).toUpperCase()}${caption.slice(1)}.`;
}
