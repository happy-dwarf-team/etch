import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type * as Renderer from '../src/index.ts';
import {
  BGRA_MASKS,
  concat,
  dds,
  dxt1Block,
  GREEN_565,
  indices2,
  RED_565,
  tga,
  BLUE_565,
} from './fixtures.ts';

declare global {
  var EtchRenderer: typeof Renderer;
  var etchTest: Harness;
}

interface Harness {
  gl: WebGL2RenderingContext;
  /** Uploads a file as the readers see it; `s3tc: false` forces the CPU path. */
  upload(name: string, bytes: number[], s3tc: boolean): Renderer.GpuTexture;
  /**
   * Draws the whole image scaled to `width`×`height` with the shared GLSL
   * helpers and reads it back as RGBA, top row first. `clampUv: false` maps
   * UVs with `uvScale` alone.
   */
  draw(
    texture: Renderer.GpuTexture,
    width: number,
    height: number,
    filter: 'point' | 'linear',
    clampUv?: boolean,
  ): number[];
}

const ORIGIN = 'https://etch.test';
const bundle = fileURLToPath(new URL('../dist/renderer.js', import.meta.url));

/** Runs in the page: a WebGL2 context and a one-quad program that samples like the preview will. */
function installHarness(): void {
  const canvas = document.createElement('canvas');
  const gl = EtchRenderer.createContext(canvas);
  const support = EtchRenderer.textureSupport(gl);
  const compile = (type: number, source: string): WebGLShader => {
    const shader = gl.createShader(type);
    if (shader === null) throw new Error('no shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
      throw new Error(gl.getShaderInfoLog(shader) ?? 'compile failed');
    }
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(
    program,
    compile(
      gl.VERTEX_SHADER,
      `#version 300 es
      in vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }`,
    ),
  );
  gl.attachShader(
    program,
    compile(
      gl.FRAGMENT_SHADER,
      `#version 300 es
      precision highp float;
      uniform sampler2D image;
      uniform vec2 outSize;
      uniform vec2 size;
      uniform vec2 storedSize;
      uniform vec2 uvScale;
      uniform int texelLayout;
      uniform bool clampUv;
      out vec4 colour;
      ${EtchRenderer.TEXTURE_GLSL}
      void main() {
        // Framebuffer row 0 is the bottom; image row 0 is the top.
        vec2 uv = vec2(gl_FragCoord.x, outSize.y - gl_FragCoord.y) / outSize;
        vec2 textureUv = clampUv ? etchImageUv(uv, size, storedSize) : uv * uvScale;
        colour = etchTexel(texture(image, textureUv), texelLayout);
      }`,
    ),
  );
  gl.linkProgram(program);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.bindAttribLocation(program, 0, 'position');
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const at = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(program, name);

  globalThis.etchTest = {
    gl,
    upload(name, bytes, s3tc) {
      const image = EtchRenderer.readTexture(name, new Uint8Array(bytes));
      const texture = EtchRenderer.uploadTexture(gl, image, s3tc ? support : { s3tc: null });
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`GL error ${String(error)} after upload`);
      return texture;
    },
    draw(texture, width, height, filter, clampUv = true) {
      const target = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, target);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
      gl.viewport(0, 0, width, height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      const mode = filter === 'point' ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mode);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mode);
      gl.uniform1i(at('image'), 0);
      gl.uniform2f(at('outSize'), width, height);
      gl.uniform2f(at('size'), texture.width, texture.height);
      gl.uniform2f(at('storedSize'), texture.storedWidth, texture.storedHeight);
      gl.uniform2f(at('uvScale'), texture.uvScale[0], texture.uvScale[1]);
      gl.uniform1i(at('texelLayout'), EtchRenderer.SAMPLE_LAYOUT_CODES[texture.layout]);
      gl.uniform1i(at('clampUv'), clampUv ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      const out = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(target);
      const rows: number[] = [];
      for (let y = height - 1; y >= 0; y--)
        rows.push(...out.subarray(y * width * 4, (y + 1) * width * 4));
      return rows;
    },
  };
}

async function open(page: Page, files: Record<string, Uint8Array> = {}): Promise<string[]> {
  const requests: string[] = [];
  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') {
      await route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>textures</title>',
      });
      return;
    }
    requests.push(path);
    const file = files[path];
    await route.fulfill(file === undefined ? { status: 404 } : { body: Buffer.from(file) });
  });
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ path: bundle });
  await page.evaluate(installHarness);
  return requests;
}

/** Largest difference of any channel. */
function maxDifference(a: readonly number[], b: readonly number[]): number {
  expect(a.length).toBe(b.length);
  return a.reduce((max, v, i) => Math.max(max, Math.abs(v - (b[i] ?? 0))), 0);
}

/**
 * A 6×5 DXT1 image: 2×2 blocks, so the file pads it to 8×8. Its texels are
 * red, blue and their mixes; the padding columns and rows are green, so a
 * sample that reaches the padding shows.
 */
function paddedDxt1(): Uint8Array {
  const image = (x: number, y: number): boolean => x < 6 && y < 5;
  const blocks: Uint8Array[] = [];
  for (let by = 0; by < 2; by++) {
    for (let bx = 0; bx < 2; bx++) {
      const indices: number[] = [];
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3);
        const y = by * 4 + (i >> 2);
        // c0 red, c1 blue, then the 2/3 and 1/3 mixes.
        indices.push(image(x, y) ? (x + 2 * y) % 4 : 0);
      }
      const padded = !image(bx * 4 + 3, by * 4 + 3);
      blocks.push(padded ? paddedBlock(bx, by) : dxt1Block(RED_565, BLUE_565, indices2(indices)));
    }
  }
  return dds({ width: 6, height: 5, fourCC: 'DXT1', data: concat(...blocks) });
}

/** A block that crosses the image edge: image texels red (c0), padding texels green (c1). */
function paddedBlock(bx: number, by: number): Uint8Array {
  const indices: number[] = [];
  for (let i = 0; i < 16; i++) {
    const x = bx * 4 + (i & 3);
    const y = by * 4 + (i >> 2);
    indices.push(x < 6 && y < 5 ? 0 : 1);
  }
  return dxt1Block(RED_565, GREEN_565, indices2(indices));
}

test('the test browser has S3TC, so the compressed path runs in CI', async ({ page }) => {
  await open(page);
  const s3tc = await page.evaluate(
    () => etchTest.gl.getExtension('WEBGL_compressed_texture_s3tc') !== null,
  );
  expect(s3tc).toBe(true);
});

test('draws uncompressed DDS and TGA texels as straight RGBA', async ({ page }) => {
  await open(page);
  const files: [string, Uint8Array][] = [
    [
      'a.dds',
      dds({
        width: 2,
        height: 1,
        bitCount: 32,
        masks: BGRA_MASKS,
        data: new Uint8Array([0, 0, 255, 255, 255, 0, 0, 128]),
      }),
    ],
    [
      'b.dds',
      dds({
        width: 2,
        height: 1,
        bitCount: 32,
        masks: [0xff0000, 0xff00, 0xff, 0],
        data: new Uint8Array([0, 0, 255, 0, 255, 0, 0, 7]),
      }),
    ],
    [
      'c.dds',
      dds({
        width: 2,
        height: 1,
        bitCount: 24,
        masks: [0xff0000, 0xff00, 0xff, 0],
        data: new Uint8Array([0, 0, 255, 255, 0, 0]),
      }),
    ],
    [
      'd.tga',
      tga({
        width: 2,
        height: 1,
        imageType: 2,
        pixelBits: 32,
        descriptor: 0x28,
        data: new Uint8Array([0, 0, 255, 255, 255, 0, 0, 128]),
      }),
    ],
  ];
  const expected: Record<string, number[]> = {
    'a.dds': [255, 0, 0, 255, 0, 0, 255, 128],
    'b.dds': [255, 0, 0, 255, 0, 0, 255, 255],
    'c.dds': [255, 0, 0, 255, 0, 0, 255, 255],
    'd.tga': [255, 0, 0, 255, 0, 0, 255, 128],
  };
  for (const [name, file] of files) {
    const drawn = await page.evaluate(
      ([n, bytes]) => {
        const texture = etchTest.upload(n, bytes, true);
        return { path: texture.path, pixels: etchTest.draw(texture, 2, 1, 'point') };
      },
      [name, Array.from(file)] as const,
    );
    expect(drawn.path, name).toBe('pixels');
    expect(drawn.pixels, name).toEqual(expected[name]);
  }
});

test('uploads DXT that is not a multiple of 4 compressed at the padded size', async ({ page }) => {
  await open(page);
  const result = await page.evaluate((bytes) => {
    const compressed = etchTest.upload('pad.dds', bytes, true);
    const cpu = etchTest.upload('pad.dds', bytes, false);
    const info = (t: Renderer.GpuTexture): unknown => ({
      path: t.path,
      size: [t.width, t.height, t.storedWidth, t.storedHeight],
      uvScale: t.uvScale,
    });
    return {
      compressed: info(compressed),
      cpu: info(cpu),
      // 1:1 point sampling at texel centres.
      point: [etchTest.draw(compressed, 6, 5, 'point'), etchTest.draw(cpu, 6, 5, 'point')],
      // Magnified with linear filtering, the edges sample between texels. The
      // reference is the unpadded texture under plain CLAMP_TO_EDGE.
      linear: [
        etchTest.draw(compressed, 15, 13, 'linear'),
        etchTest.draw(cpu, 15, 13, 'linear', false),
      ],
      unclamped: etchTest.draw(compressed, 15, 13, 'linear', false),
    };
  }, Array.from(paddedDxt1()));

  expect(result.compressed).toEqual({
    path: 'compressed',
    size: [6, 5, 8, 8],
    uvScale: [0.75, 0.625],
  });
  expect(result.cpu).toEqual({ path: 'cpu-dxt', size: [6, 5, 6, 5], uvScale: [1, 1] });
  const [gpuPoint, cpuPoint] = result.point;
  const [gpuLinear, cpuLinear] = result.linear;
  // GPUs round the 2/3 mixes their own way; the prototype saw up to 6.
  expect(maxDifference(gpuPoint ?? [], cpuPoint ?? [])).toBeLessThanOrEqual(8);
  expect(maxDifference(gpuLinear ?? [], cpuLinear ?? [])).toBeLessThanOrEqual(8);
  // Without the clamp, the right column blends in the green padding.
  const greenAt = (pixels: number[], x: number, y: number): number =>
    pixels[(y * 15 + x) * 4 + 1] ?? 0;
  expect(greenAt(result.unclamped, 14, 0)).toBeGreaterThan(40);
  expect(greenAt(gpuLinear ?? [], 14, 0)).toBe(0);
});

test('caches textures per URL and reports files it cannot load', async ({ page }) => {
  const requests = await open(page, {
    '/gfx/a.dds': dds({
      width: 1,
      height: 1,
      bitCount: 32,
      masks: BGRA_MASKS,
      data: new Uint8Array([1, 2, 3, 4]),
    }),
    '/gfx/ati2.dds': dds({ width: 4, height: 4, fourCC: 'ATI2', data: new Uint8Array(16) }),
  });
  const results = await page.evaluate(async (origin) => {
    const cache = new EtchRenderer.TextureCache(etchTest.gl);
    const a = `${origin}/gfx/a.dds`;
    const [first, second] = await Promise.all([cache.get(a), cache.get(a)]);
    const same = first.ok && second.ok && first.texture === second.texture;
    cache.invalidate(a);
    const again = await cache.get(a);
    const problems = await Promise.all([
      cache.get(`${origin}/gfx/ati2.dds`),
      cache.get(`${origin}/gfx/missing.tga`),
    ]);
    return {
      same,
      again: again.ok && again.texture.layout,
      problems: problems.map((r) => (r.ok ? null : r.problem)),
    };
  }, ORIGIN);

  expect(results.same).toBe(true);
  expect(results.again).toBe('bgra');
  expect(results.problems).toEqual([
    { url: `${ORIGIN}/gfx/ati2.dds`, code: 'unsupported', message: 'DDS format ATI2' },
    {
      url: `${ORIGIN}/gfx/missing.tga`,
      code: 'fetch',
      message: expect.stringMatching(/^HTTP 404/) as unknown,
    },
  ]);
  expect(requests).toEqual(['/gfx/a.dds', '/gfx/a.dds', '/gfx/ati2.dds', '/gfx/missing.tga']);
});

// Every vanilla DXT interface texture, read in place from the local install
// that ETCH_EU4_DIR names; CI has no game and skips this.
const gameDir = process.env['ETCH_EU4_DIR'];

function vanillaDxt(dir: string, root = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...vanillaDxt(path, root));
    else if (/\.dds$/i.test(entry.name)) {
      const fourCC = readFileSync(path).subarray(84, 88).toString('latin1');
      if (/^DXT[135]$/.test(fourCC)) out.push(relative(root, path).split(sep).join('/'));
    }
  }
  return out;
}

test('uploads every vanilla DXT texture compressed and draws it as the CPU decodes it', async ({
  page,
}) => {
  test.skip(gameDir === undefined, 'ETCH_EU4_DIR is not set');
  test.setTimeout(300_000);
  const root = join(gameDir ?? '', 'gfx/interface');
  const files = vanillaDxt(root);
  await open(page);
  await page.route(`${ORIGIN}/game/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice('/game/'.length));
    await route.fulfill({ body: readFileSync(join(root, path)) });
  });

  const result = await page.evaluate(
    async ([origin, names]) => {
      const gl = etchTest.gl;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer =
        info === null ? 'unknown' : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      const worst = (a: number[], b: number[]): number =>
        a.reduce((max, v, i) => Math.max(max, Math.abs(v - (b[i] ?? 0))), 0);
      const rows: { name: string; padded: boolean; point: number; linear: number }[] = [];
      for (const name of names) {
        const bytes = new Uint8Array(
          await (await fetch(`${origin}/game/${encodeURIComponent(name)}`)).arrayBuffer(),
        );
        const image = EtchRenderer.readTexture(name, bytes);
        const gpu = EtchRenderer.uploadTexture(gl, image, EtchRenderer.textureSupport(gl));
        const error = gl.getError();
        if (error !== gl.NO_ERROR) throw new Error(`${name}: GL error ${String(error)}`);
        const cpu = EtchRenderer.uploadTexture(gl, image, { s3tc: null });
        const w = image.width;
        const h = image.height;
        const lw = Math.round(w * 1.5);
        const lh = Math.round(h * 1.5);
        rows.push({
          name,
          padded: gpu.storedWidth !== w || gpu.storedHeight !== h,
          point: worst(etchTest.draw(gpu, w, h, 'point'), etchTest.draw(cpu, w, h, 'point')),
          linear: worst(
            etchTest.draw(gpu, lw, lh, 'linear'),
            etchTest.draw(cpu, lw, lh, 'linear', false),
          ),
        });
        gl.deleteTexture(gpu.texture);
        gl.deleteTexture(cpu.texture);
      }
      return { renderer, rows };
    },
    [ORIGIN, files] as const,
  );

  const padded = result.rows.filter((row) => row.padded);
  const worstPoint = Math.max(...result.rows.map((row) => row.point));
  const worstLinear = Math.max(...result.rows.map((row) => row.linear));
  console.log(
    `${result.renderer}: ${String(result.rows.length)} DXT textures, ${String(padded.length)} padded; ` +
      `largest channel difference ${String(worstPoint)} point, ${String(worstLinear)} linear at 1.5x`,
  );
  expect(result.rows.length).toBeGreaterThan(200);
  expect(padded.length).toBeGreaterThan(0);
  expect(result.rows.filter((row) => row.point > 8 || row.linear > 8)).toEqual([]);
});
