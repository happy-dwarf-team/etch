import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng, encodeGreyPng, encodePng } from '../../src/corpus/png.ts';

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** A chunk without its CRC checked: the reader does not check it. */
function chunk(type: string, body: Uint8Array | number[]): Uint8Array {
  const bytes = Uint8Array.from(body);
  const out = new Uint8Array(12 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(bytes, 8);
  return out;
}

function header(width: number, height: number, colourType: number, depth = 8, interlace = 0) {
  const body = new Uint8Array(13);
  const view = new DataView(body.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  body.set([depth, colourType, 0, 0, interlace], 8);
  return chunk('IHDR', body);
}

function file(...chunks: Uint8Array[]): Uint8Array {
  return Buffer.concat([Uint8Array.from(SIGNATURE), ...chunks, chunk('IEND', [])]);
}

/** The PNG specification's filters, applied to one row (`prior` is the row above, or zeros). */
function filterRow(filter: number, row: Uint8Array, prior: Uint8Array, bpp: number): number[] {
  const out: number[] = [filter];
  for (let i = 0; i < row.length; i++) {
    const x = row[i] ?? 0;
    const a = i >= bpp ? (row[i - bpp] ?? 0) : 0;
    const b = prior[i] ?? 0;
    const c = i >= bpp ? (prior[i - bpp] ?? 0) : 0;
    const p = a + b - c;
    const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
    const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    const predicted = [0, a, b, (a + b) >> 1, paeth][filter] ?? 0;
    out.push((x - predicted) & 0xff);
  }
  return out;
}

/** Image data of `channels` bytes per pixel, each row filtered with filter `y % 5`. */
function idat(pixels: Uint8Array, width: number, height: number, channels: number): Uint8Array {
  const row = width * channels;
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    const prior = y > 0 ? pixels.subarray((y - 1) * row, y * row) : new Uint8Array(row);
    raw.push(...filterRow(y % 5, pixels.subarray(y * row, (y + 1) * row), prior, channels));
  }
  return chunk('IDAT', deflateSync(Uint8Array.from(raw)));
}

/** Bytes that vary without a pattern, the same on every run. */
function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

describe('corpus PNG files', () => {
  const width = 7;
  const height = 10; // two rows of each filter

  it('reads 8-bit RGBA through all five filters', () => {
    const pixels = noise(width * height * 4, 1);
    const image = decodePng(file(header(width, height, 6), idat(pixels, width, height, 4)));
    expect(image).toEqual({ width, height, data: pixels });
  });

  it('reads greyscale, grey with alpha and RGB as straight RGBA', () => {
    const count = width * height;
    const grey = noise(count, 2);
    const expectedGrey = new Uint8Array(count * 4);
    for (let p = 0; p < count; p++)
      expectedGrey.set([grey[p] ?? 0, grey[p] ?? 0, grey[p] ?? 0, 255], p * 4);
    expect(decodePng(file(header(width, height, 0), idat(grey, width, height, 1))).data).toEqual(
      expectedGrey,
    );

    const greyAlpha = noise(count * 2, 3);
    const expectedGreyAlpha = new Uint8Array(count * 4);
    for (let p = 0; p < count; p++) {
      const g = greyAlpha[p * 2] ?? 0;
      expectedGreyAlpha.set([g, g, g, greyAlpha[p * 2 + 1] ?? 0], p * 4);
    }
    expect(
      decodePng(file(header(width, height, 4), idat(greyAlpha, width, height, 2))).data,
    ).toEqual(expectedGreyAlpha);

    const rgb = noise(count * 3, 4);
    const expectedRgb = new Uint8Array(count * 4);
    for (let p = 0; p < count; p++) {
      expectedRgb.set([rgb[p * 3] ?? 0, rgb[p * 3 + 1] ?? 0, rgb[p * 3 + 2] ?? 0, 255], p * 4);
    }
    expect(decodePng(file(header(width, height, 2), idat(rgb, width, height, 3))).data).toEqual(
      expectedRgb,
    );
  });

  it('reads a palette image, with tRNS alpha for the entries it lists', () => {
    const palette = chunk('PLTE', [255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const transparency = chunk('tRNS', [0, 128]);
    const indices = Uint8Array.from([0, 1, 2, 1]);
    const image = decodePng(file(header(2, 2, 3), palette, transparency, idat(indices, 2, 2, 1)));
    expect([...image.data]).toEqual([255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255, 0, 255, 0, 128]);
    expect(() => decodePng(file(header(2, 2, 3), idat(indices, 2, 2, 1)))).toThrow(
      'The PNG file has no palette.',
    );
  });

  it('reads the data of several IDAT chunks and skips chunks it does not know', () => {
    const pixels = noise(width * height * 4, 5);
    const whole = idat(pixels, width, height, 4);
    const compressed = whole.subarray(8, whole.length - 4);
    const half = Math.floor(compressed.length / 2);
    const image = decodePng(
      file(
        header(width, height, 6),
        chunk('tEXt', Buffer.from('Comment', 'latin1')),
        chunk('IDAT', compressed.subarray(0, half)),
        chunk('IDAT', compressed.subarray(half)),
      ),
    );
    expect(image.data).toEqual(pixels);
  });

  it('refuses what it does not read', () => {
    const pixels = noise(16, 6);
    expect(() => decodePng(Uint8Array.from([137, 80, 78, 71]))).toThrow('Not a PNG file.');
    expect(() => decodePng(Uint8Array.from([...SIGNATURE.slice(0, 7), 0]))).toThrow(
      'Not a PNG file.',
    );
    expect(() => decodePng(file(header(2, 2, 6, 16), idat(pixels, 2, 2, 4)))).toThrow(
      'Only 8-bit PNG files without interlacing are read (depth 16, colour type 6, interlace 0).',
    );
    expect(() => decodePng(file(header(2, 2, 6, 8, 1), idat(pixels, 2, 2, 4)))).toThrow(
      /interlace 1\)/,
    );
    expect(() => decodePng(file(header(2, 2, 5), idat(pixels, 2, 2, 4)))).toThrow(/colour type 5,/);
    expect(() => decodePng(file(idat(pixels, 2, 2, 4)))).toThrow('The PNG file has no IHDR.');
    expect(() => decodePng(file(header(2, 0, 6)))).toThrow('The PNG file has no IHDR.');
    expect(() =>
      decodePng(file(header(2, 2, 6), chunk('IDAT', deflateSync(pixels.subarray(0, 9))))),
    ).toThrow('The PNG file is truncated.');
    const badFilter = Uint8Array.from([0, 1, 2, 7, 3, 4]);
    expect(() => decodePng(file(header(2, 2, 0), chunk('IDAT', deflateSync(badFilter))))).toThrow(
      'Unknown PNG filter 7 in row 1.',
    );
  });

  it('writes RGBA and greyscale files that it reads back', () => {
    const pixels = noise(width * height * 4, 7);
    expect(decodePng(encodePng({ width, height, data: pixels }))).toEqual({
      width,
      height,
      data: pixels,
    });
    const grey = noise(width * height, 8);
    const back = decodePng(encodeGreyPng(width, height, grey));
    expect(back.data.filter((_, i) => i % 4 === 0)).toEqual(grey);
    expect(back.data.filter((_, i) => i % 4 === 3).every((a) => a === 255)).toBe(true);
    expect(() => encodeGreyPng(2, 2, new Uint8Array(3))).toThrow(
      'The pixels do not match the size.',
    );
  });
});
