/**
 * The offline renderer in headless Chromium (ADR 0002): the same `@etch/renderer` bundle the
 * preview's webview runs, drawing a draw list into a WebGL2 canvas and reading it back as
 * straight RGBA. Textures are served from the playset's files on disk, read only.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { DrawList } from '@etch/core';
import type { RgbaImage } from '@etch/core/corpus';
import * as esbuild from 'esbuild';
import type * as Renderer from '@etch/renderer';

declare global {
  var EtchRenderer: typeof Renderer;
  var etchPaint: (
    list: DrawList,
  ) => Promise<{ problems: { url: string; message: string }[]; pixels: string }>;
}

const ORIGIN = 'https://etch.test';

export interface HeadlessOptions {
  /**
   * Draw on the machine's GPU (ANGLE on Direct3D 11) instead of SwiftShader, Chromium's software
   * WebGL, which needs no GPU and is what CI has.
   */
  readonly gpu?: boolean;
}

export interface HeadlessPaint {
  readonly image: RgbaImage;
  /** Textures that could not be loaded; their draws are left out. */
  readonly problems: readonly string[];
}

export class HeadlessRenderer {
  /** WebGL's unmasked renderer string, such as `ANGLE (Google, Vulkan 1.3.0 (SwiftShader …))`. */
  readonly gpu: string;
  private readonly browser: Browser;
  private readonly page: Page;
  /** Files the page may fetch: URL path → absolute path. */
  private readonly files: Map<string, string>;

  private constructor(browser: Browser, page: Page, gpu: string, files: Map<string, string>) {
    this.browser = browser;
    this.page = page;
    this.gpu = gpu;
    this.files = files;
  }

  static async launch(options: HeadlessOptions = {}): Promise<HeadlessRenderer> {
    const args =
      options.gpu === true
        ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
        : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
    const browser = await chromium.launch({ args });
    try {
      const page = await browser.newPage();
      const files = new Map<string, string>();
      await page.route(`${ORIGIN}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/') {
          await route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><canvas></canvas>',
          });
          return;
        }
        const file = files.get(path);
        if (file === undefined) {
          await route.fulfill({ status: 404 });
          return;
        }
        try {
          await route.fulfill({ body: await readFile(file) });
        } catch {
          await route.fulfill({ status: 404 });
        }
      });
      await page.goto(`${ORIGIN}/`);
      await page.addScriptTag({ content: await rendererBundle() });
      const gpu = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (canvas === null) throw new Error('no canvas');
        const gl = EtchRenderer.createContext(canvas);
        const painter = new EtchRenderer.Painter(gl);
        globalThis.etchPaint = async (list) => {
          const result = await painter.paint(list);
          const error = gl.getError();
          if (error !== gl.NO_ERROR) throw new Error(`GL error ${String(error)}`);
          const pixels = EtchRenderer.readPixels(gl);
          // Base64 crosses to Node far faster than an array of numbers.
          let binary = '';
          for (let i = 0; i < pixels.length; i += 0x8000) {
            binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
          }
          return {
            problems: result.problems.map((p) => ({ url: p.url, message: p.message })),
            pixels: btoa(binary),
          };
        };
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return info === null
          ? String(gl.getParameter(gl.RENDERER))
          : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      });
      return new HeadlessRenderer(browser, page, gpu, files);
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  /**
   * Paints a draw list whose textures are game-relative paths; `fileOf` gives each one's file on
   * disk, or `undefined` when the playset has none (its draws are left out, as in the preview).
   */
  async paint(
    list: DrawList,
    fileOf: (path: string) => string | undefined,
  ): Promise<HeadlessPaint> {
    const textures = list.textures.map((path) => {
      const file = fileOf(path);
      // Keyed by the file on disk: two playsets may have different files at one path.
      const url = `/files/${encodeURIComponent(file ?? `missing/${path}`)}`;
      if (file !== undefined) this.files.set(url, file);
      return `${ORIGIN}${url}`;
    });
    const painted = await this.page.evaluate((l) => etchPaint(l), { ...list, textures });
    const data = new Uint8Array(Buffer.from(painted.pixels, 'base64'));
    const problems = painted.problems.map((p) => {
      const path = new URL(p.url).pathname.replace(/^\/files\//, '');
      return `${decodeURIComponent(path)}: ${p.message}`;
    });
    return { image: { width: list.width, height: list.height, data }, problems };
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

/** The renderer as the one IIFE script the webview loads, built from its sources. */
async function rendererBundle(): Promise<string> {
  const entry = fileURLToPath(import.meta.resolve('@etch/renderer'));
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    globalName: 'EtchRenderer',
    platform: 'browser',
    target: 'chrome120',
    write: false,
    logLevel: 'warning',
  });
  const script = result.outputFiles[0]?.text;
  if (script === undefined) throw new Error('esbuild wrote no renderer bundle');
  return script;
}
