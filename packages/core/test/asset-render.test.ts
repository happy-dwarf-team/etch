import { describe, expect, it } from 'vitest';
import { readMesh, renderMeshThumbnail, type RgbaImage } from '../src/asset/index.ts';
import { binary, floats, ints, MESH, obj, strs } from './fixtures/pdx-asset.ts';

/** 2 × 2 texels: red, blue on the top row (v = 0), green, white below. */
const QUADRANTS: RgbaImage = {
  width: 2,
  height: 2,
  rgba: new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 255, 255]),
};

function pixel(image: RgbaImage, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4;
  return Array.from(image.rgba.subarray(i, i + 4));
}

/** The opaque pixels' bounding box. */
function box(image: RgbaImage): { x0: number; y0: number; x1: number; y1: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if ((pixel(image, x, y)[3] ?? 0) === 0) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, x1, y1 };
}

/** The colour of the leftmost and the rightmost fully opaque pixel of a row. */
function ends(image: RgbaImage, y: number): [number[], number[]] {
  const row = Array.from({ length: image.width }, (_, x) => pixel(image, x, y)).filter(
    (p) => p[3] === 255,
  );
  return [row[0] ?? [], row[row.length - 1] ?? []];
}

/** Which channel is strongest, or `white` when all three are close. */
function hue([r = 0, g = 0, b = 0]: readonly number[]): string {
  if (Math.min(r, g, b) > 0.8 * Math.max(r, g, b)) return 'white';
  if (r > g && r > b) return 'red';
  if (g > r && g > b) return 'green';
  return 'blue';
}

describe('renderMeshThumbnail', () => {
  it('draws the quad textured, the right way round and up, on a transparent background', () => {
    const image = renderMeshThumbnail(
      readMesh(binary(MESH)),
      new Map([['flag_diffuse.dds', QUADRANTS]]),
      64,
    );
    expect([image.width, image.height, image.rgba.length]).toEqual([64, 64, 64 * 64 * 4]);
    expect(pixel(image, 0, 0)).toEqual([0, 0, 0, 0]);
    const { x0, y0, x1, y1 } = box(image);
    // Framed: the quad fills a good part of the image and stays inside it.
    expect(x1 - x0).toBeGreaterThan(24);
    expect([x0 > 0, y0 > 0, x1 < 63, y1 < 63]).toEqual([true, true, true, true]);
    // u runs with x and v down the quad (u0 0 at x = 0, v 0 at y = 1): red top left, blue top
    // right, green bottom left, white bottom right. A mirrored Z or flipped V swaps them.
    const top = ends(image, Math.round(y0 + (y1 - y0) * 0.3));
    const bottom = ends(image, Math.round(y0 + (y1 - y0) * 0.7));
    expect([...top, ...bottom].map(hue)).toEqual(['red', 'blue', 'green', 'white']);
    // Lit, not flat: the facing light scales the texel down a little.
    const lit = top[0][0] ?? 0;
    expect(lit).toBeGreaterThan(100);
    expect(lit).toBeLessThan(255);
  });

  it('draws a part without its texture grey, and leaves collision shapes out', () => {
    const image = renderMeshThumbnail(readMesh(binary(MESH)), new Map(), 32);
    const { x0, y0, x1, y1 } = box(image);
    const [r = 0, g = 0, b = 0] = pixel(
      image,
      Math.round((x0 + x1) / 2),
      Math.round((y0 + y1) / 2),
    );
    expect(r).toBe(g);
    expect(g).toBe(b);
    const onlyCollision = MESH.slice(0, 3).concat(
      MESH.slice(MESH.findIndex((i) => 'object' in i && i.object === 'pickShape')),
    );
    const empty = renderMeshThumbnail(readMesh(binary(onlyCollision)), new Map(), 16);
    expect(empty.rgba.every((v) => v === 0)).toBe(true);
  });

  it('draws only the most detailed level of a mesh with levels of detail', () => {
    // Two levels in one place, as a map tree carries them: level 0 red, level 1 blue.
    const level = (name: string, lod: number, texture: string) => [
      obj(2, name),
      ints('lod', lod),
      obj(3, 'mesh'),
      floats('p', 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0),
      floats('n', 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1),
      floats('u0', 0, 1, 1, 1, 0, 0, 1, 0),
      ints('tri', 0, 2, 1, 1, 2, 3),
      obj(4, 'material'),
      strs('shader', 'PdxMeshStandard'),
      strs('diff', texture),
    ];
    const one = (r: number, g: number, b: number): RgbaImage => ({
      width: 1,
      height: 1,
      rgba: new Uint8Array([r, g, b, 255]),
    });
    const textures = new Map([
      ['red.dds', one(255, 0, 0)],
      ['blue.dds', one(0, 0, 255)],
    ]);
    const tree = (first: number, second: number) =>
      readMesh(
        binary([
          ints('pdxasset', 1, 0),
          obj(1, 'object'),
          ...level('LowShape', second, 'blue.dds'),
          ...level('HighShape', first, 'red.dds'),
        ]),
      );
    const opaque = (image: RgbaImage) =>
      Array.from({ length: image.width * image.height }, (_, i) =>
        Array.from(image.rgba.subarray(i * 4, i * 4 + 4)),
      ).filter((p) => p[3] === 255);
    const high = opaque(renderMeshThumbnail(tree(0, 1), textures, 32));
    expect(high.length).toBeGreaterThan(50);
    expect(new Set(high.map(hue))).toEqual(new Set(['red']));
    // The levels the other way round: the blue shape is now the detailed one.
    const swapped = opaque(renderMeshThumbnail(tree(1, 0), textures, 32));
    expect(new Set(swapped.map(hue))).toEqual(new Set(['blue']));
  });

  it("drops an alpha-tested shader's transparent texels", () => {
    const alpha = MESH.map((item) =>
      'name' in item && item.values[0] === 'PdxMeshStandardSkinned'
        ? strs('shader', 'PdxMeshAlphaBlend')
        : item,
    );
    const clear: RgbaImage = { width: 1, height: 1, rgba: new Uint8Array([255, 0, 0, 0]) };
    const image = renderMeshThumbnail(
      readMesh(binary(alpha)),
      new Map([['flag_diffuse.dds', clear]]),
      16,
    );
    expect(image.rgba.every((v) => v === 0)).toBe(true);
    // The same texel under a shader without alpha test is drawn.
    const opaque = renderMeshThumbnail(
      readMesh(binary(MESH)),
      new Map([['flag_diffuse.dds', clear]]),
      16,
    );
    expect(opaque.rgba.some((v) => v !== 0)).toBe(true);
  });
});
