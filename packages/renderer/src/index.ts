/** Thrown when the webview cannot give Etch a WebGL2 context. */
export class WebGL2UnavailableError extends Error {
  constructor() {
    super('WebGL2 is not available in this webview');
    this.name = 'WebGL2UnavailableError';
  }
}

/**
 * The WebGL2 context the preview draws into. The render is transparent and is
 * composited over the webview's background (spec section 2), so the context
 * keeps an alpha channel and does not premultiply.
 */
export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (gl === null) {
    throw new WebGL2UnavailableError();
  }
  return gl;
}

/** Clears the whole canvas to one straight RGBA colour, each channel from 0 to 1. */
export function clear(
  gl: WebGL2RenderingContext,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(r, g, b, a);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export * from './textures/index.ts';
