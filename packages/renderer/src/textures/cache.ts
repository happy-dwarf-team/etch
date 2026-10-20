import { readDds } from './dds.ts';
import { uploadTexture, textureSupport } from './gpu.ts';
import type { GpuTexture, TextureSupport } from './gpu.ts';
import { TextureReadError } from './image.ts';
import type { TextureErrorCode, TextureImage } from './image.ts';
import { readTga } from './tga.ts';

/**
 * Why a texture could not be loaded, for the extension to turn into a
 * diagnostic (spec section 10). `fetch` covers a missing or unreadable file.
 */
export interface TextureProblem {
  readonly url: string;
  readonly code: TextureErrorCode | 'fetch';
  readonly message: string;
}

export type TextureResult =
  | { readonly ok: true; readonly texture: GpuTexture }
  | { readonly ok: false; readonly problem: TextureProblem };

/** Reads a DDS or TGA file, chosen by the extension of `name` (case-insensitive). */
export function readTexture(name: string, bytes: Uint8Array): TextureImage {
  const path = name.replace(/[?#].*$/, '').toLowerCase();
  if (path.endsWith('.dds')) return readDds(bytes);
  if (path.endsWith('.tga')) return readTga(bytes);
  throw new TextureReadError('unsupported', `texture file type of ${name}`);
}

/**
 * Textures of one WebGL2 context, fetched once per URL (webview URIs, ADR
 * 0001) and kept on the GPU until invalidated. Loading is lazy: only the
 * textures the drawn window asks for are fetched.
 */
export class TextureCache {
  readonly support: TextureSupport;
  private readonly gl: WebGL2RenderingContext;
  private readonly entries = new Map<string, Promise<TextureResult>>();

  constructor(gl: WebGL2RenderingContext, support: TextureSupport = textureSupport(gl)) {
    this.gl = gl;
    this.support = support;
  }

  /**
   * The texture at `url`, loaded on first use. A file that cannot be fetched
   * or read resolves to a problem; only a bug rejects.
   */
  get(url: string): Promise<TextureResult> {
    let entry = this.entries.get(url);
    if (entry === undefined) {
      entry = this.load(url);
      this.entries.set(url, entry);
    }
    return entry;
  }

  /** Frees the texture at `url`, if loaded, so the next `get` fetches the file again. */
  invalidate(url: string): void {
    const entry = this.entries.get(url);
    if (entry === undefined) return;
    this.entries.delete(url);
    entry.then(
      (result) => {
        if (result.ok) this.gl.deleteTexture(result.texture.texture);
      },
      () => undefined,
    );
  }

  /** Frees every texture. */
  clear(): void {
    for (const url of [...this.entries.keys()]) this.invalidate(url);
  }

  private async load(url: string): Promise<TextureResult> {
    let bytes: Uint8Array;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return failure(
          url,
          'fetch',
          `HTTP ${String(response.status)} ${response.statusText}`.trim(),
        );
      }
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      return failure(url, 'fetch', error instanceof Error ? error.message : String(error));
    }
    try {
      const image = readTexture(url, bytes);
      return { ok: true, texture: uploadTexture(this.gl, image, this.support) };
    } catch (error) {
      if (error instanceof TextureReadError) return failure(url, error.code, error.message);
      throw error;
    }
  }
}

function failure(url: string, code: TextureProblem['code'], message: string): TextureResult {
  return { ok: false, problem: { url, code, message } };
}
