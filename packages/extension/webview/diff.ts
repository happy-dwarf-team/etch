// The diff view's picture (spec section 5, etch#54): the per-pixel difference between the offline
// renderer's straight RGBA of the previewed window and the game host's, which covers only its crop
// of the same screen. Pure functions, so that Vitest checks them outside the webview.

import type { DrawRect } from '@etch/core/draw-list';
import type { DiffSummary } from '../src/preview/protocol.ts';

/** The largest difference per channel that still counts as the same, as the precision corpus's. */
export const DIFF_TOLERANCE = 2;

/** What the diff view shows at a pixel. */
export const DIFF_CLASS = {
  /** Outside the game host's crop: nothing to compare with. */
  outside: 0,
  /** Within the tolerance, drawn or not by both. */
  same: 1,
  /** Both backends draw it, differently. */
  different: 2,
  /** Only the offline renderer draws it. */
  offlineOnly: 3,
  /** Only the game host draws it, such as content the game's code fills in. */
  hostOnly: 4,
} as const;

/** The colours of the classes that differ, also the legend's swatches. */
export const DIFF_COLOURS = {
  different: [255, 24, 24],
  offlineOnly: [40, 150, 255],
  hostOnly: [255, 200, 0],
} as const satisfies Record<string, readonly [number, number, number]>;

/** An image as straight RGBA bytes, top row first. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** The diff view of one pair of images. */
export interface DiffPicture {
  /** What to show: opaque RGBA at the screen's size. */
  readonly image: Uint8ClampedArray<ArrayBuffer>;
  /** Each pixel's class (`DIFF_CLASS`), for the counts under the pointer. */
  readonly classes: Uint8Array;
  readonly width: number;
  readonly crop: DrawRect;
  readonly summary: DiffSummary;
}

/**
 * Reads the game host's image: the plugin's TGA of straight RGBA (uncompressed, 32 bits, rows top
 * first; docs/plugin-protocol.md), as RGBA. Unlike the renderer's TGA reader it keeps an alpha
 * that is 0 everywhere: a window that draws nothing is transparent, not opaque.
 */
export function readHostImage(bytes: Uint8Array): RgbaImage {
  const u16 = (offset: number): number => (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
  const width = u16(12);
  const height = u16(14);
  const start = 18 + (bytes[0] ?? 0);
  if (
    bytes[2] !== 2 ||
    bytes[16] !== 32 ||
    ((bytes[17] ?? 0) & 0x30) !== 0x20 ||
    bytes.length < start + width * height * 4
  ) {
    throw new Error("the game host's image is not an uncompressed 32-bit TGA with rows top first");
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bytes[start + i + 2] ?? 0;
    data[i + 1] = bytes[start + i + 1] ?? 0;
    data[i + 2] = bytes[start + i] ?? 0;
    data[i + 3] = bytes[start + i + 3] ?? 0;
  }
  return { width, height, data };
}

/**
 * Compares the offline renderer's screen with the game host's image at `crop` of it. Colours are
 * compared premultiplied, with the alpha: what each backend adds over any background, so that the
 * colour of an almost transparent pixel does not count. A pixel differs when a channel differs by
 * more than `DIFF_TOLERANCE`; it is only one backend's when the other's alpha is within it.
 *
 * The picture shows pixels that are the same as the game host's image in dim grey, those that
 * differ in the class colours (red brighter the larger the difference), and the screen outside
 * the crop darker still.
 */
export function diffImages(offline: RgbaImage, host: RgbaImage, crop: DrawRect): DiffPicture {
  const { width, height } = offline;
  if (host.width !== crop.width || host.height !== crop.height) {
    throw new Error(
      `the game host's image is ${String(host.width)}×${String(host.height)}, its crop ` +
        `${String(crop.width)}×${String(crop.height)}`,
    );
  }
  const image = new Uint8ClampedArray(width * height * 4);
  const classes = new Uint8Array(width * height);
  const o = offline.data;
  const h = host.data;
  let compared = 0;
  let different = 0;
  let offlineOnly = 0;
  let hostOnly = 0;
  let largest = 0;
  for (let y = 0; y < height; y++) {
    const hy = y - crop.y;
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      const hx = x - crop.x;
      const oa = o[i + 3] ?? 0;
      image[i + 3] = 255;
      if (hx < 0 || hy < 0 || hx >= crop.width || hy >= crop.height) {
        grey(image, i, over(o, i, oa) >> 2);
        continue;
      }
      compared++;
      const j = (hy * crop.width + hx) * 4;
      const ha = h[j + 3] ?? 0;
      const d = Math.max(
        Math.abs(oa - ha),
        Math.abs(premultiply(o[i] ?? 0, oa) - premultiply(h[j] ?? 0, ha)),
        Math.abs(premultiply(o[i + 1] ?? 0, oa) - premultiply(h[j + 1] ?? 0, ha)),
        Math.abs(premultiply(o[i + 2] ?? 0, oa) - premultiply(h[j + 2] ?? 0, ha)),
      );
      if (d > largest) largest = d;
      if (d <= DIFF_TOLERANCE) {
        classes[p] = DIFF_CLASS.same;
        grey(image, i, 32 + (over(h, j, ha) >> 1));
      } else if (oa <= DIFF_TOLERANCE) {
        classes[p] = DIFF_CLASS.hostOnly;
        hostOnly++;
        image.set(DIFF_COLOURS.hostOnly, i);
      } else if (ha <= DIFF_TOLERANCE) {
        classes[p] = DIFF_CLASS.offlineOnly;
        offlineOnly++;
        image.set(DIFF_COLOURS.offlineOnly, i);
      } else {
        classes[p] = DIFF_CLASS.different;
        different++;
        // Brighter the larger the difference.
        image[i] = Math.min(255, 127 + d);
        image[i + 1] = DIFF_COLOURS.different[1];
        image[i + 2] = DIFF_COLOURS.different[2];
      }
    }
  }
  return {
    image,
    classes,
    width,
    crop,
    summary: { compared, different, offlineOnly, hostOnly, largest },
  };
}

/** The pixels of a rect within the crop, and how many of them differ. */
export function diffCounts(
  picture: Pick<DiffPicture, 'classes' | 'width' | 'crop'>,
  rect: DrawRect,
): { compared: number; differing: number } {
  const { classes, width, crop } = picture;
  const x0 = Math.max(Math.floor(rect.x), crop.x);
  const y0 = Math.max(Math.floor(rect.y), crop.y);
  const x1 = Math.min(Math.ceil(rect.x + rect.width), crop.x + crop.width);
  const y1 = Math.min(Math.ceil(rect.y + rect.height), crop.y + crop.height);
  let compared = 0;
  let differing = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      compared++;
      if ((classes[y * width + x] ?? 0) > DIFF_CLASS.same) differing++;
    }
  }
  return { compared, differing };
}

/** A straight colour channel times its alpha, rounded, as WebGL's premultiplied blending stores it. */
function premultiply(channel: number, alpha: number): number {
  return ((channel * alpha + 127) / 255) | 0;
}

function grey(image: Uint8ClampedArray, i: number, value: number): void {
  image[i] = value;
  image[i + 1] = value;
  image[i + 2] = value;
}

/** The grey of a straight RGBA pixel over the preview's mid-grey backdrop (html.ts). */
function over(data: Uint8Array, i: number, alpha: number): number {
  const luma = ((data[i] ?? 0) * 77 + (data[i + 1] ?? 0) * 150 + (data[i + 2] ?? 0) * 29) >> 8;
  return Math.round((luma * alpha + 128 * (255 - alpha)) / 255);
}
