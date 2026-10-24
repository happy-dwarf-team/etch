import { describe, expect, it } from 'vitest';
import { decodeDxt, readDds, readTexture, readTga, TextureReadError } from '../src/index.ts';
import type { TextureImage } from '../src/index.ts';
import {
  BGRA_MASKS,
  BLUE_565,
  concat,
  dds,
  dxt1Block,
  GREEN_565,
  indices2,
  RED_565,
  tga,
  WHITE_565,
} from './fixtures.ts';

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

function pixels(image: TextureImage): { layout: string; data: number[] } {
  if (image.kind !== 'pixels') throw new Error(`expected pixels, got ${image.kind}`);
  return { layout: image.layout, data: Array.from(image.data) };
}

function readError(read: () => unknown): TextureReadError {
  try {
    read();
  } catch (error) {
    if (error instanceof TextureReadError) return error;
    throw error;
  }
  throw new Error('expected a TextureReadError');
}

describe('readDds', () => {
  it('keeps BGRA8 texels as stored', () => {
    const data = bytes(1, 2, 3, 4, 5, 6, 7, 8);
    const image = readDds(dds({ width: 2, height: 1, bitCount: 32, masks: BGRA_MASKS, data }));
    expect(image).toMatchObject({ width: 2, height: 1 });
    expect(pixels(image)).toEqual({ layout: 'bgra', data: [1, 2, 3, 4, 5, 6, 7, 8] });
  });

  it('reads X8R8G8B8, A8B8G8R8 and R8G8B8', () => {
    const x8 = dds({
      width: 1,
      height: 1,
      bitCount: 32,
      masks: [0xff0000, 0xff00, 0xff, 0],
      data: bytes(1, 2, 3, 0),
    });
    expect(pixels(readDds(x8)).layout).toBe('bgrx');

    const abgr = dds({
      width: 1,
      height: 1,
      bitCount: 32,
      masks: [0xff, 0xff00, 0xff0000, 0xff000000],
      data: bytes(1, 2, 3, 4),
    });
    expect(pixels(readDds(abgr)).layout).toBe('rgba');

    const rgb = dds({
      width: 2,
      height: 1,
      bitCount: 24,
      masks: [0xff0000, 0xff00, 0xff, 0],
      data: bytes(1, 2, 3, 4, 5, 6),
    });
    expect(pixels(readDds(rgb))).toEqual({ layout: 'bgr', data: [1, 2, 3, 4, 5, 6] });
  });

  it('drops the row padding a pitch declares', () => {
    const data = bytes(1, 2, 3, 4, 5, 6, 0, 0, 7, 8, 9, 10, 11, 12);
    const file = dds({
      width: 2,
      height: 2,
      bitCount: 24,
      masks: [0xff0000, 0xff00, 0xff, 0],
      pitch: 8,
      data,
    });
    expect(pixels(readDds(file)).data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('keeps the first mip level of DXT data, sized to its whole blocks as the game draws it', () => {
    const level0 = concat(dxt1Block(RED_565, 0, 0), dxt1Block(BLUE_565, 0, 0));
    const mip1 = dxt1Block(GREEN_565, 0, 0);
    const image = readDds(dds({ width: 5, height: 3, fourCC: 'DXT1', data: concat(level0, mip1) }));
    // etch#44: the game reports and draws a 535×122 DXT5 image at 536×124.
    expect(image).toEqual({ kind: 'dxt', width: 8, height: 4, format: 'DXT1', data: level0 });
  });

  it('reads the DX10 header for the same formats', () => {
    const bgra = readDds(dds({ width: 1, height: 1, dxgiFormat: 87, data: bytes(1, 2, 3, 4) }));
    expect(pixels(bgra)).toEqual({ layout: 'bgra', data: [1, 2, 3, 4] });
    const srgb = readDds(dds({ width: 1, height: 1, dxgiFormat: 91, data: bytes(1, 2, 3, 4) }));
    expect(pixels(srgb).layout).toBe('bgra');
    const dxt5 = readDds(dds({ width: 4, height: 4, dxgiFormat: 77, data: new Uint8Array(16) }));
    expect(dxt5).toMatchObject({ kind: 'dxt', format: 'DXT5' });
  });

  it('names unsupported formats', () => {
    const cases: [Uint8Array, string][] = [
      [dds({ width: 4, height: 4, fourCC: 'ATI2', data: new Uint8Array(16) }), 'DDS format ATI2'],
      [dds({ width: 1, height: 1, dxgiFormat: 61, data: bytes(1) }), 'DDS DX10 format DXGI 61'],
      [
        dds({
          width: 1,
          height: 1,
          bitCount: 16,
          masks: [0xf800, 0x7e0, 0x1f, 0],
          data: bytes(0, 0),
        }),
        'DDS format 16-bit, flags 0x40, masks R 0x0000f800 G 0x000007e0 B 0x0000001f A 0x00000000',
      ],
      [
        dds({
          width: 1,
          height: 1,
          bitCount: 32,
          masks: BGRA_MASKS,
          caps2: 0xfe00,
          data: new Uint8Array(24),
        }),
        'DDS cube map',
      ],
      [concat(bytes(0x89, 0x50, 0x4e, 0x47), new Uint8Array(200)), 'PNG data in a DDS file'],
    ];
    for (const [file, message] of cases) {
      const error = readError(() => readDds(file));
      expect(error.code).toBe('unsupported');
      expect(error.message).toBe(message);
    }
  });

  it('reports malformed files', () => {
    expect(readError(() => readDds(new Uint8Array(200))).message).toBe(
      'not a DDS file (no "DDS " magic)',
    );
    const empty = dds({ width: 1, height: 1, bitCount: 32, masks: BGRA_MASKS, data: bytes() });
    expect(readError(() => readDds(empty)).code).toBe('malformed');
    const short = dds({ width: 8, height: 8, fourCC: 'DXT5', data: new Uint8Array(40) });
    const error = readError(() => readDds(short));
    expect(error).toMatchObject({
      code: 'malformed',
      message: 'DDS DXT5 data is cut short: 40 of 64 bytes',
    });
  });

  it('reads a file at an offset inside a larger buffer', () => {
    const file = dds({
      width: 1,
      height: 1,
      bitCount: 32,
      masks: BGRA_MASKS,
      data: bytes(9, 8, 7, 6),
    });
    const outer = concat(bytes(0, 0, 0), file);
    expect(pixels(readDds(outer.subarray(3))).data).toEqual([9, 8, 7, 6]);
  });
});

describe('readTga', () => {
  it('reads 24-bit texels bottom row first into RGBA, top row first', () => {
    // BGR texels: bottom row blue, green; top row red, white.
    const data = bytes(255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255);
    const image = readTga(tga({ width: 2, height: 2, imageType: 2, pixelBits: 24, data }));
    expect(pixels(image)).toEqual({
      layout: 'rgba',
      data: [255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 255, 255, 0, 255, 0, 255],
    });
  });

  it('reads 32-bit texels top row first, after the image ID', () => {
    const data = bytes(1, 2, 3, 4, 5, 6, 7, 8);
    const image = readTga(
      tga({
        width: 2,
        height: 1,
        imageType: 2,
        pixelBits: 32,
        descriptor: 0x28,
        id: bytes(65, 66),
        data,
      }),
    );
    expect(pixels(image).data).toEqual([3, 2, 1, 4, 7, 6, 5, 8]);
  });

  it('mirrors right-to-left rows', () => {
    const data = bytes(1, 2, 3, 4, 5, 6, 7, 8);
    const image = readTga(
      tga({ width: 2, height: 1, imageType: 2, pixelBits: 32, descriptor: 0x38, data }),
    );
    expect(pixels(image).data).toEqual([7, 6, 5, 8, 3, 2, 1, 4]);
  });

  it('reads 16-bit texels and their alpha bit', () => {
    // A1R5G5B5: opaque pure red, transparent pure blue.
    const data = bytes(0x00, 0xfc, 0x1f, 0x00);
    const image = readTga(
      tga({ width: 2, height: 1, imageType: 2, pixelBits: 16, descriptor: 0x21, data }),
    );
    expect(pixels(image).data).toEqual([255, 0, 0, 255, 0, 0, 255, 0]);
  });

  it('reads 15-bit texels as opaque', () => {
    const data = bytes(0x00, 0x7c, 0x1f, 0x00);
    const image = readTga(
      tga({ width: 2, height: 1, imageType: 2, pixelBits: 15, descriptor: 0x20, data }),
    );
    expect(pixels(image).data).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it('draws an image whose alpha is 0 everywhere opaque, as vanilla building pictures need', () => {
    const data = bytes(0x00, 0x7c, 0x1f, 0x00);
    const image = readTga(
      tga({ width: 2, height: 1, imageType: 2, pixelBits: 16, descriptor: 0x21, data }),
    );
    expect(pixels(image).data).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  });

  it('decodes run-length packets that run across rows', () => {
    // 3×2, top row first: a run of 4 red, then 2 raw texels (green, blue).
    const data = bytes(0x83, 0, 0, 255, 255, 0x01, 0, 255, 0, 255, 255, 0, 0, 255);
    const image = readTga(
      tga({ width: 3, height: 2, imageType: 10, pixelBits: 32, descriptor: 0x28, data }),
    );
    const red = [255, 0, 0, 255];
    expect(pixels(image).data).toEqual([
      ...red,
      ...red,
      ...red,
      ...red,
      0,
      255,
      0,
      255,
      0,
      0,
      255,
      255,
    ]);
  });

  it('looks colour-mapped texels up in the map, raw and run-length encoded', () => {
    // A grey 24-bit map as vanilla's alpha masks use, starting at index 0.
    const map = { first: 0, bits: 24, entries: bytes(0, 0, 0, 128, 128, 128, 255, 255, 255) };
    const raw = readTga(
      tga({
        width: 3,
        height: 1,
        imageType: 1,
        pixelBits: 8,
        descriptor: 0x28,
        map,
        data: bytes(2, 1, 0),
      }),
    );
    expect(pixels(raw).data).toEqual([255, 255, 255, 255, 128, 128, 128, 255, 0, 0, 0, 255]);

    const rle = readTga(
      tga({
        width: 3,
        height: 1,
        imageType: 9,
        pixelBits: 8,
        descriptor: 0x28,
        map,
        data: bytes(0x82, 1),
      }),
    );
    expect(pixels(rle).data).toEqual([128, 128, 128, 255, 128, 128, 128, 255, 128, 128, 128, 255]);
  });

  it('subtracts the first map index from 16-bit indices', () => {
    const map = { first: 300, bits: 32, entries: bytes(10, 20, 30, 40, 50, 60, 70, 80) };
    const data = bytes(0x2d, 0x01, 0x2c, 0x01); // 301, 300
    const image = readTga(
      tga({ width: 2, height: 1, imageType: 1, pixelBits: 16, descriptor: 0x20, map, data }),
    );
    expect(pixels(image).data).toEqual([70, 60, 50, 80, 30, 20, 10, 40]);
  });

  it('names unsupported formats and reports malformed files', () => {
    const grey = readError(() =>
      readTga(tga({ width: 1, height: 1, imageType: 3, pixelBits: 8, data: bytes(1) })),
    );
    expect(grey).toMatchObject({ code: 'unsupported', message: 'TGA image greyscale (type 3)' });

    const short = readError(() =>
      readTga(tga({ width: 2, height: 2, imageType: 2, pixelBits: 24, data: bytes(1) })),
    );
    expect(short).toMatchObject({ code: 'malformed', message: 'TGA data is cut short' });

    const huge = readError(() =>
      readTga(tga({ width: 65535, height: 65535, imageType: 10, pixelBits: 32, data: bytes() })),
    );
    expect(huge).toMatchObject({ code: 'unsupported', message: 'TGA image of 65535×65535 texels' });

    const map = { first: 0, bits: 24, entries: bytes(0, 0, 0) };
    const outside = readError(() =>
      readTga(tga({ width: 1, height: 1, imageType: 1, pixelBits: 8, map, data: bytes(5) })),
    );
    expect(outside).toMatchObject({
      code: 'malformed',
      message: 'TGA colour index 5 is outside the map',
    });

    const runPastEnd = readError(() =>
      readTga(
        tga({ width: 2, height: 1, imageType: 10, pixelBits: 24, data: bytes(0x01, 1, 2, 3) }),
      ),
    );
    expect(runPastEnd.code).toBe('malformed');
  });
});

describe('decodeDxt', () => {
  it('decodes four-colour DXT1 blocks', () => {
    const block = dxt1Block(
      RED_565,
      BLUE_565,
      indices2([0, 1, 2, 3, ...new Array<number>(12).fill(0)]),
    );
    const out = decodeDxt('DXT1', 4, 4, block);
    expect(Array.from(out.subarray(0, 16))).toEqual([
      255, 0, 0, 255, 0, 0, 255, 255, 170, 0, 85, 255, 85, 0, 170, 255,
    ]);
  });

  it('decodes three-colour DXT1 blocks with transparent black', () => {
    const block = dxt1Block(
      BLUE_565,
      RED_565,
      indices2([0, 1, 2, 3, ...new Array<number>(12).fill(0)]),
    );
    const out = decodeDxt('DXT1', 4, 4, block);
    expect(Array.from(out.subarray(0, 16))).toEqual([
      0, 0, 255, 255, 255, 0, 0, 255, 128, 0, 128, 255, 0, 0, 0, 0,
    ]);
  });

  it('decodes DXT3 explicit alpha', () => {
    const alpha = bytes(0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0);
    const block = concat(alpha, dxt1Block(WHITE_565, WHITE_565, 0));
    const out = decodeDxt('DXT3', 4, 4, block);
    const alphas = Array.from({ length: 16 }, (_, i) => out[i * 4 + 3]);
    expect(alphas).toEqual([0, 17, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255]);
  });

  it('decodes DXT5 alpha in both interpolation modes', () => {
    // Indices 0..7 in texels 0..7, packed three bits each.
    let bits = 0;
    for (let i = 0; i < 8; i++) bits |= i << (3 * i);
    const indices = bytes(bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, 0, 0, 0);
    const alphaOf = (a0: number, a1: number): number[] => {
      const block = concat(bytes(a0, a1), indices, dxt1Block(WHITE_565, WHITE_565, 0));
      const out = decodeDxt('DXT5', 4, 4, block);
      return Array.from({ length: 8 }, (_, i) => out[i * 4 + 3] ?? -1);
    };
    expect(alphaOf(255, 0)).toEqual([255, 0, 219, 182, 146, 109, 73, 36]);
    expect(alphaOf(0, 255)).toEqual([0, 255, 51, 102, 153, 204, 0, 255]);
  });

  it('crops blocks to a size that is not a multiple of 4', () => {
    const data = concat(dxt1Block(RED_565, RED_565, 0), dxt1Block(GREEN_565, GREEN_565, 0));
    const out = decodeDxt('DXT1', 5, 3, data);
    expect(out.length).toBe(5 * 3 * 4);
    const row = Array.from(out.subarray(0, 20));
    expect(row).toEqual([
      ...[255, 0, 0, 255],
      ...[255, 0, 0, 255],
      ...[255, 0, 0, 255],
      ...[255, 0, 0, 255],
      ...[0, 255, 0, 255],
    ]);
  });
});

describe('readTexture', () => {
  it('chooses the reader by file extension, ignoring case and the query', () => {
    const file = tga({ width: 1, height: 1, imageType: 2, pixelBits: 24, data: bytes(1, 2, 3) });
    expect(readTexture('https://file+.vscode-resource/gfx/A.TGA?v=1', file).kind).toBe('pixels');
    expect(readError(() => readTexture('gfx/a.png', file))).toMatchObject({
      code: 'unsupported',
      message: 'texture file type of gfx/a.png',
    });
  });
});
