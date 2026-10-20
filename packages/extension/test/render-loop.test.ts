import { describe, expect, it } from 'vitest';
import { RenderLoop } from '../src/preview/render-loop.ts';

describe('RenderLoop', () => {
  it('renders at once and coalesces requests that arrive while it runs', async () => {
    let renders = 0;
    let release: (() => void) | undefined;
    const loop = new RenderLoop(
      () =>
        new Promise<void>((resolve) => {
          renders++;
          release = resolve;
        }),
      () => undefined,
    );
    loop.request();
    expect(renders).toBe(1);
    loop.request();
    loop.request();
    loop.request();
    expect(renders).toBe(1);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(renders).toBe(2);
    release?.();
    await loop.idle();
    expect(renders).toBe(2);
  });

  it('reports a failed render and keeps going', async () => {
    const errors: unknown[] = [];
    let renders = 0;
    const loop = new RenderLoop(
      () => {
        renders++;
        return Promise.reject(new Error('boom'));
      },
      (error) => errors.push(error),
    );
    loop.request();
    await loop.idle();
    loop.request();
    await loop.idle();
    expect(renders).toBe(2);
    expect(errors).toHaveLength(2);
  });

  it('stops after dispose', async () => {
    let renders = 0;
    const loop = new RenderLoop(
      () => {
        renders++;
        return Promise.resolve();
      },
      () => undefined,
    );
    loop.dispose();
    loop.request();
    await loop.idle();
    expect(renders).toBe(0);
  });
});
