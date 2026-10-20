import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type * as Renderer from '../src/index.ts';

declare global {
  var EtchRenderer: typeof Renderer;
}

const bundle = fileURLToPath(new URL('../dist/renderer.js', import.meta.url));

test('clears a WebGL2 canvas to a straight RGBA colour', async ({ page }) => {
  await page.setContent('<canvas width="4" height="4"></canvas>');
  await page.addScriptTag({ path: bundle });

  const pixel = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) throw new Error('no canvas');
    const gl = EtchRenderer.createContext(canvas);
    EtchRenderer.clear(gl, 1, 0, 0, 1);
    const out = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return Array.from(out);
  });

  expect(pixel).toEqual([255, 0, 0, 255]);
});
