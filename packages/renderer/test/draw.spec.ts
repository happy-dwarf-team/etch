import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DRAW_LIST_VERSION, type Draw, type DrawList } from '@etch/core/draw-list';
import type * as Renderer from '../src/index.ts';
import { BGRA_MASKS, dds } from './fixtures.ts';

declare global {
  var EtchRenderer: typeof Renderer;
  var etchPaint: (list: DrawList) => Promise<Painted>;
}

interface Painted {
  result: Renderer.PaintResult;
  width: number;
  /** Straight RGBA, top row first. */
  pixels: number[];
}

const ORIGIN = 'https://etch.test';
const bundle = fileURLToPath(new URL('../dist/renderer.js', import.meta.url));

type Rgba = readonly [number, number, number, number];

/** An uncompressed BGRA8 DDS file of `width` × rows, from RGBA texels. */
function image(width: number, texels: readonly Rgba[]): Uint8Array {
  const data = new Uint8Array(texels.length * 4);
  texels.forEach(([r, g, b, a], i) => {
    data.set([b, g, r, a], i * 4);
  });
  return dds({ width, height: texels.length / width, bitCount: 32, masks: BGRA_MASKS, data });
}

const RED: Rgba = [255, 0, 0, 255];
const GREEN: Rgba = [0, 255, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];
const CLEAR: Rgba = [0, 0, 0, 0];
const WHITE_ARGB = 0xffffffff;

/** Opens a page that serves `files` and draws with one painter on one canvas. */
async function open(page: Page, files: Record<string, Uint8Array>): Promise<void> {
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') {
      await route.fulfill({ contentType: 'text/html', body: '<!doctype html><canvas></canvas>' });
      return;
    }
    const file = files[path.slice(1)];
    await route.fulfill(file === undefined ? { status: 404 } : { body: Buffer.from(file) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ path: bundle });
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) throw new Error('no canvas');
    const gl = EtchRenderer.createContext(canvas);
    const painter = new EtchRenderer.Painter(gl);
    globalThis.etchPaint = async (list) => {
      const result = await painter.paint(list);
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`GL error ${String(error)}`);
      return { result, width: list.width, pixels: Array.from(EtchRenderer.readPixels(gl)) };
    };
  });
}

function list(width: number, height: number, textures: string[], draws: Draw[]): DrawList {
  return {
    version: DRAW_LIST_VERSION,
    width,
    height,
    textures: textures.map((name) => `${ORIGIN}/${name}`),
    draws,
  };
}

async function paint(page: Page, drawList: DrawList): Promise<Painted> {
  return page.evaluate((l) => etchPaint(l), drawList);
}

function pixel(painted: Painted, x: number, y: number): number[] {
  const i = (y * painted.width + x) * 4;
  return painted.pixels.slice(i, i + 4);
}

function row(painted: Painted, y: number): number[][] {
  return Array.from({ length: painted.width }, (_, x) => pixel(painted, x, y));
}

/** Each channel within `tolerance` of the expected value. */
function expectNear(actual: number[], expected: readonly number[], tolerance = 1): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, i) => {
    const message = `${actual.join()} vs ${expected.join()}`;
    expect(Math.abs(value - (expected[i] ?? 0)), message).toBeLessThanOrEqual(tolerance);
  });
}

const sprite = (
  texture: number,
  x: number,
  y: number,
  width: number,
  height: number,
  source: [number, number, number, number],
  more: Partial<Extract<Draw, { kind: 'sprite' }>> = {},
): Draw => ({
  kind: 'sprite',
  texture,
  shader: 'default',
  x,
  y,
  width,
  height,
  sx: source[0],
  sy: source[1],
  sw: source[2],
  sh: source[3],
  source: 0,
  ...more,
});

test('draws sprites 1:1 at integer positions, with no half-pixel shift', async ({ page }) => {
  await open(page, { 'a.dds': image(2, [RED, GREEN, BLUE, WHITE]) });
  for (const shader of ['default', 'buttonstate', 'buttonstate_linear'] as const) {
    const painted = await paint(
      page,
      list(5, 4, ['a.dds'], [sprite(0, 2, 1, 2, 2, [0, 0, 2, 2], { shader })]),
    );
    expect(painted.result).toEqual({ painted: true, problems: [], skipped: [] });
    expect(row(painted, 0), shader).toEqual([CLEAR, CLEAR, CLEAR, CLEAR, CLEAR]);
    expect(row(painted, 1), shader).toEqual([CLEAR, CLEAR, RED, GREEN, CLEAR]);
    expect(row(painted, 2), shader).toEqual([CLEAR, CLEAR, BLUE, WHITE, CLEAR]);
    expect(row(painted, 3), shader).toEqual([CLEAR, CLEAR, CLEAR, CLEAR, CLEAR]);
  }
});

test('draws a frame as its horizontal cell', async ({ page }) => {
  await open(page, { 'frames.dds': image(4, [RED, GREEN, BLUE, WHITE]) });
  const painted = await paint(
    page,
    list(2, 1, ['frames.dds'], [sprite(0, 0, 0, 2, 1, [2, 0, 2, 1], { shader: 'buttonstate' })]),
  );
  expect(row(painted, 0)).toEqual([BLUE, WHITE]);
});

test('samples point or linear as each shader says', async ({ page }) => {
  await open(page, { 'ramp.dds': image(2, [BLACK, WHITE]) });
  const scaled = (shader: 'default' | 'buttonstate' | 'buttonstate_linear'): Draw =>
    sprite(0, 0, 0, 4, 1, [0, 0, 2, 1], { shader });
  const point = await paint(page, list(4, 1, ['ramp.dds'], [scaled('buttonstate')]));
  expect(row(point, 0).map((p) => p[0])).toEqual([0, 0, 255, 255]);
  // Magnified twice and clamped to the edge texels: 0, 1/4, 3/4, 1.
  for (const shader of ['buttonstate_linear', 'default'] as const) {
    const linear = await paint(page, list(4, 1, ['ramp.dds'], [scaled(shader)]));
    expectNear(
      row(linear, 0).map((p) => p[0] ?? 0),
      [0, 64, 191, 255],
    );
  }
});

test('applies button effects as the game shaders do', async ({ page }) => {
  await open(page, { 'b.dds': image(1, [[100, 150, 200, 255]]) });
  const cases: [Partial<Extract<Draw, { kind: 'sprite' }>>, Rgba][] = [
    [{ shader: 'buttonstate' }, [100, 150, 200, 255]],
    [{ shader: 'buttonstate', effect: 'over' }, [126, 176, 226, 255]],
    [{ shader: 'buttonstate', effect: 'down' }, [74, 124, 174, 255]],
    // Luminance 0.212671, 0.715160, 0.072169.
    [{ shader: 'buttonstate', effect: 'disable' }, [143, 143, 143, 255]],
    [{ shader: 'buttonstate_linear', effect: 'disable' }, [143, 143, 143, 255]],
    [{ shader: 'buttonstate_nodowneffect', effect: 'down' }, [100, 150, 200, 255]],
    [{ shader: 'buttonstate_nodowneffect', effect: 'over' }, [126, 176, 226, 255]],
    [{ shader: 'buttonstate_onlydisable', effect: 'over' }, [100, 150, 200, 255]],
    [{ shader: 'buttonstate_onlydisable', effect: 'disable' }, [143, 143, 143, 255]],
    [{ shader: 'button_overlay' }, CLEAR],
    [{ shader: 'button_overlay', effect: 'over' }, [100, 150, 200, 38]],
    [{ shader: 'button_overlay', effect: 'down' }, [0, 0, 0, 51]],
    [{ shader: 'buttonstate', colour: 0xff808080 }, [50, 75, 100, 255]],
    [{ shader: 'default', effect: 'disable', colour: 0x80ffffff }, [100, 150, 200, 128]],
  ];
  const painted = await paint(
    page,
    list(
      cases.length,
      1,
      ['b.dds'],
      cases.map(([more], x) => sprite(0, x, 0, 1, 1, [0, 0, 1, 1], more)),
    ),
  );
  cases.forEach(([, expected], x) => {
    // Straight colour comes back from premultiplied pixels, so low alphas round coarser.
    expectNear(pixel(painted, x, 0), expected, expected[3] < 64 ? 4 : 1);
  });
});

test('masks a flag with the alpha of its mask', async ({ page }) => {
  await open(page, {
    'flag.dds': image(2, [
      [200, 100, 50, 255],
      [10, 20, 30, 0],
    ]),
    'mask.dds': image(2, [
      [0, 0, 0, 128],
      [255, 255, 255, 255],
    ]),
  });
  const masked = (
    shader: 'maskedflag' | 'maskedflag_greydown',
    x: number,
    effect?: 'down',
  ): Draw => ({
    kind: 'masked',
    texture: 0,
    mask: 1,
    shader,
    ...(effect === undefined ? {} : { effect }),
    x,
    y: 0,
    width: 2,
    height: 1,
    sx: 0,
    sy: 0,
    sw: 2,
    sh: 1,
    maskRect: { sx: 0, sy: 0, sw: 2, sh: 1 },
    source: 0,
  });
  const painted = await paint(
    page,
    list(
      6,
      1,
      ['flag.dds', 'mask.dds'],
      [
        masked('maskedflag', 0),
        masked('maskedflag', 2, 'down'),
        masked('maskedflag_greydown', 4, 'down'),
      ],
    ),
  );
  expectNear(pixel(painted, 0, 0), [200, 100, 50, 128], 2);
  expectNear(pixel(painted, 1, 0), [10, 20, 30, 255]);
  expectNear(pixel(painted, 2, 0), [174, 74, 24, 128], 2);
  // 0.212671 × 200 + 0.715160 × 100 + 0.072169 × 50 = 117.6
  expectNear(pixel(painted, 4, 0), [118, 118, 118, 128], 2);
});

test('fills progress bars from the left, and vertical ones from the bottom', async ({ page }) => {
  await open(page, { 'fill.dds': image(2, [RED, BLUE]) });
  const bar = (
    x: number,
    y: number,
    width: number,
    height: number,
    more: Partial<Extract<Draw, { kind: 'progress' }>>,
  ): Draw => ({
    kind: 'progress',
    first: { colour: 0xff00ff00 },
    second: { colour: 0x80ff0000 },
    value: 0.5,
    x,
    y,
    width,
    height,
    source: 0,
    ...more,
  });
  const painted = await paint(
    page,
    list(
      5,
      4,
      ['fill.dds'],
      [
        bar(0, 0, 4, 1, {}),
        bar(4, 0, 1, 4, { vertical: true, value: 0.25 }),
        bar(0, 1, 4, 1, { first: { texture: 0 }, value: 1 }),
        bar(0, 2, 4, 1, { second: { texture: 0 }, value: 0 }),
      ],
    ),
  );
  const HALF_RED = [255, 0, 0, 128];
  expect(row(painted, 0).slice(0, 4)).toEqual([GREEN, GREEN, HALF_RED, HALF_RED]);
  expect([0, 1, 2, 3].map((y) => pixel(painted, 4, y))).toEqual([
    HALF_RED,
    HALF_RED,
    HALF_RED,
    GREEN,
  ]);
  // A texture fill is stretched over the whole bar.
  expect(row(painted, 1).slice(0, 4)).toEqual([RED, RED, BLUE, BLUE]);
  // At value 0 the bar is all second fill.
  expect(row(painted, 2).slice(0, 4)).toEqual([RED, RED, BLUE, BLUE]);
});

test('draws glyph runs tinted, with a border and linear magnification', async ({ page }) => {
  await open(page, {
    'font.dds': image(4, [
      [255, 255, 255, 0],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 128],
    ]),
  });
  const run = (glyphs: number[], border?: number): Draw => ({
    kind: 'text',
    texture: 0,
    glyphs,
    ...(border === undefined ? {} : { border }),
    source: 0,
  });
  const painted = await paint(
    page,
    list(
      6,
      3,
      ['font.dds'],
      [
        // Two glyphs at integer positions, red and green.
        run([0, 0, 2, 1, 1, 0, 0xffff0000, 3, 0, 1, 1, 3, 0, 0xff00ff00]),
        // The half-transparent texel under a border colour: below 3/4 of the border's alpha.
        run([0, 1, 1, 1, 3, 0, 0xffff0000], 0xff0000ff),
        // Half a pixel to the right, magnified linearly.
        run([1.5, 2, 2, 1, 1, 0, 0xffffffff]),
      ],
    ),
  );
  expect(row(painted, 0)).toEqual([RED, RED, CLEAR, [0, 255, 0, 128], CLEAR, CLEAR]);
  expect(pixel(painted, 0, 1)).toEqual([0, 0, 255, 128]);
  expectNear(
    row(painted, 2).map((p) => p[3] ?? 0),
    [0, 128, 255, 0, 0, 0],
  );
});

test('bakes a text into its sprite as the game does, letting glyph edges show through', async ({
  page,
}) => {
  await open(page, {
    'blue.dds': image(1, [BLUE]),
    'button.dds': image(2, [BLACK, BLACK, BLACK, BLACK]),
    'font.dds': image(4, [
      [255, 255, 255, 0],
      [255, 255, 255, 255],
      [255, 255, 255, 255],
      [255, 255, 255, 128],
    ]),
  });
  const painted = await paint(
    page,
    list(
      3,
      2,
      ['blue.dds', 'button.dds', 'font.dds'],
      [
        sprite(0, 0, 0, 3, 2, [0, 0, 1, 1]),
        sprite(1, 0, 0, 2, 2, [0, 0, 2, 2], {
          shader: 'buttonstate',
          // A half-covered texel, a full one, and one past the sprite, which the target clips.
          text: {
            texture: 2,
            glyphs: [0, 0, 1, 1, 3, 0, WHITE_ARGB, 1, 0, 1, 1, 1, 0, WHITE_ARGB],
          },
        }),
        sprite(1, 2, 1, 1, 1, [0, 0, 1, 1], {
          shader: 'buttonstate',
          text: { texture: 2, glyphs: [3, 1, 1, 1, 1, 0, WHITE_ARGB] },
        }),
      ],
    ),
  );
  // a = 128/255: the target holds a white-over-black 128 with alpha a·a + 1 − a = 191/255, which
  // lets the blue behind through: 128 · 191/255 = 96, plus 255 · 64/255 in blue.
  expectNear(pixel(painted, 0, 0), [96, 96, 160, 255]);
  expect(pixel(painted, 1, 0)).toEqual(WHITE);
  expect(pixel(painted, 0, 1)).toEqual(BLACK);
  expect(pixel(painted, 2, 1)).toEqual(BLACK);
});

test('blends later draws over earlier ones with src_alpha', async ({ page }) => {
  await open(page, { 'blue.dds': image(1, [BLUE]), 'red.dds': image(1, [[255, 0, 0, 128]]) });
  const painted = await paint(
    page,
    list(
      2,
      1,
      ['blue.dds', 'red.dds'],
      [sprite(0, 0, 0, 1, 1, [0, 0, 1, 1]), sprite(1, 0, 0, 2, 1, [0, 0, 1, 1])],
    ),
  );
  // Over blue: 128/255 red and the rest blue, as the game blends; alone: straight half red.
  expectNear(pixel(painted, 0, 0), [128, 0, 127, 255]);
  expect(pixel(painted, 1, 0)).toEqual([255, 0, 0, 128]);
});

test('repeats the source rect of a tiled middle at its own size', async ({ page }) => {
  await open(page, { 'tile.dds': image(3, [RED, GREEN, BLUE]) });
  const painted = await paint(
    page,
    list(
      5,
      1,
      ['tile.dds'],
      [sprite(0, 0, 0, 5, 1, [1, 0, 2, 1], { shader: 'buttonstate', repeat: true })],
    ),
  );
  expect(row(painted, 0)).toEqual([GREEN, BLUE, GREEN, BLUE, GREEN]);
});

test('leaves out draws whose texture is missing and reports it', async ({ page }) => {
  await open(page, { 'a.dds': image(1, [RED]) });
  const painted = await paint(
    page,
    list(
      2,
      1,
      ['missing.dds', 'a.dds'],
      [sprite(0, 0, 0, 1, 1, [0, 0, 1, 1]), sprite(1, 1, 0, 1, 1, [0, 0, 1, 1])],
    ),
  );
  expect(painted.result.skipped).toEqual([0]);
  expect(painted.result.problems).toEqual([
    {
      url: `${ORIGIN}/missing.dds`,
      code: 'fetch',
      message: expect.stringMatching(/^HTTP 404/) as unknown,
    },
  ]);
  expect(row(painted, 0)).toEqual([CLEAR, RED]);
});

test('draws only the latest of overlapping paints', async ({ page }) => {
  await open(page, { 'a.dds': image(1, [RED]), 'b.dds': image(1, [BLUE]) });
  const results = await page.evaluate(
    async ([first, second]) => {
      const painted = await Promise.all([etchPaint(first), etchPaint(second)]);
      return painted.map((p) => ({ painted: p.result.painted, pixel: p.pixels.slice(0, 4) }));
    },
    [
      list(1, 1, ['a.dds'], [sprite(0, 0, 0, 1, 1, [0, 0, 1, 1])]),
      list(1, 1, ['b.dds'], [sprite(0, 0, 0, 1, 1, [0, 0, 1, 1])]),
    ] as const,
  );
  expect(results.map((r) => r.painted)).toEqual([false, true]);
  expect(results[1]?.pixel).toEqual([...BLUE]);
});

test('draws a shader or effect it does not know as the default', async ({ page }) => {
  await open(page, { 'ramp.dds': image(2, [BLACK, WHITE]) });
  // As a list from another bundle could carry them; layout reports such shaders.
  const foreign = { shader: 'gui_rendertarget', effect: 'pressed' } as unknown as Partial<
    Extract<Draw, { kind: 'sprite' }>
  >;
  const painted = await paint(
    page,
    list(4, 1, ['ramp.dds'], [sprite(0, 0, 0, 4, 1, [0, 0, 2, 1], foreign)]),
  );
  expectNear(
    row(painted, 0).map((p) => p[0] ?? 0),
    [0, 64, 191, 255],
  );
});
