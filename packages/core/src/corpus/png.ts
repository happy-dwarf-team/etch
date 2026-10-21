/**
 * PNG files of the precision corpus: Tongs' screenshots, read, and the renders and difference
 * images the comparison writes (etch#43). Only what those need: 8-bit greyscale, RGB, palette and
 * RGBA images without interlacing, and straight RGBA written back.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** An image as straight RGBA bytes, top row first. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Channels per pixel of each PNG colour type. */
const CHANNELS: ReadonlyMap<number, number> = new Map([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
]);

/** Reads a PNG file into straight RGBA. */
export function decodePng(bytes: Uint8Array): RgbaImage {
  if (bytes.length < 8 || SIGNATURE.some((b, i) => bytes[i] !== b)) {
    throw new Error('Not a PNG file.');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let colourType = -1;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const data: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      const depth = body[8];
      colourType = body[9] ?? -1;
      if (depth !== 8 || !CHANNELS.has(colourType) || body[12] !== 0) {
        throw new Error(
          `Only 8-bit PNG files without interlacing are read (depth ${String(depth)}, ` +
            `colour type ${String(colourType)}, interlace ${String(body[12])}).`,
        );
      }
    } else if (type === 'PLTE') {
      palette = body;
    } else if (type === 'tRNS') {
      transparency = body;
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  if (width === 0 || height === 0) throw new Error('The PNG file has no IHDR.');
  const channels = CHANNELS.get(colourType) ?? 4;
  const raw = unfilter(inflateSync(Buffer.concat(data)), width, height, channels);
  const out = new Uint8Array(width * height * 4);
  for (let p = 0, i = 0; p < width * height; p++, i += channels) {
    const o = p * 4;
    switch (colourType) {
      case 0:
        out.fill(raw[i] ?? 0, o, o + 3);
        out[o + 3] = 255;
        break;
      case 2:
        out[o] = raw[i] ?? 0;
        out[o + 1] = raw[i + 1] ?? 0;
        out[o + 2] = raw[i + 2] ?? 0;
        out[o + 3] = 255;
        break;
      case 3: {
        const entry = raw[i] ?? 0;
        if (palette === undefined) throw new Error('The PNG file has no palette.');
        out[o] = palette[entry * 3] ?? 0;
        out[o + 1] = palette[entry * 3 + 1] ?? 0;
        out[o + 2] = palette[entry * 3 + 2] ?? 0;
        out[o + 3] = transparency?.[entry] ?? 255;
        break;
      }
      case 4:
        out.fill(raw[i] ?? 0, o, o + 3);
        out[o + 3] = raw[i + 1] ?? 0;
        break;
      default:
        out.set(raw.subarray(i, i + 4), o);
    }
  }
  return { width, height, data: out };
}

/** Writes straight RGBA as a PNG file. */
export function encodePng(image: RgbaImage): Uint8Array {
  const { width, height, data } = image;
  const row = width * 4;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) {
    // Filter 0 (none): the images are large and written once, so speed beats size.
    raw.set(data.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 3 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/**
 * Writes 8-bit greyscale, one byte per pixel, as a PNG file: the capture driver's unstable masks
 * (etch#42), which are mostly zero and small this way.
 */
export function encodeGreyPng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  if (pixels.length !== width * height) throw new Error('The pixels do not match the size.');
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 0, 0, 0, 0], 8);
  return Buffer.concat([
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** Undoes the per-row filters of 8-bit PNG data. */
function unfilter(data: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const row = width * channels;
  if (data.length < (row + 1) * height) throw new Error('The PNG file is truncated.');
  const out = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (row + 1)];
    const from = y * (row + 1) + 1;
    const to = y * row;
    for (let i = 0; i < row; i++) {
      const x = data[from + i] ?? 0;
      const a = i >= channels ? (out[to + i - channels] ?? 0) : 0;
      const b = y > 0 ? (out[to - row + i] ?? 0) : 0;
      const c = i >= channels && y > 0 ? (out[to - row + i - channels] ?? 0) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + ((a + b) >> 1);
          break;
        case 4:
          value = x + paeth(a, b, c);
          break;
        default:
          throw new Error(`Unknown PNG filter ${String(filter)} in row ${String(y)}.`);
      }
      out[to + i] = value & 0xff;
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
