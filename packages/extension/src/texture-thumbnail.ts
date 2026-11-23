// The texture part of a hover: a line of facts (size, format, mip levels, alpha) and a thumbnail
// as a PNG `data:` URI, which VS Code renders in hovers. Shared by the asset path hovers
// (asset-links.ts) and the sprite hovers (sprite-links.ts); cached by file, time and size.

import * as path from 'node:path';
import * as vscode from 'vscode';
import { inspectTexture } from '@etch/renderer/inspect';
import { encodePng, thumbnail } from './png.ts';
import { statGamePath } from '@etch/core/playset';
import { pathUri } from './dlc-files.ts';

/** The thumbnail's longest side in a hover, in pixels. */
const THUMBNAIL_SIZE = 128;
/** Thumbnails kept. */
const CACHE_SIZE = 32;

export class TextureThumbnails {
  private readonly cache = new Map<string, Promise<string>>();

  /**
   * The Markdown of a texture: its facts and the image. With `frames` above 1 (a sprite's
   * `noOfFrames`), the image is the first frame: the texture's width cut into that many cells.
   */
  async markdown(absolutePath: string, frames = 1): Promise<string> {
    const info = await statGamePath(absolutePath);
    const key = `${absolutePath}|${String(info.mtimeMs)}|${String(info.size)}|${String(frames)}`;
    let entry = this.cache.get(key);
    if (entry === undefined) {
      entry = render(absolutePath, frames);
      this.cache.set(key, entry);
      entry.catch(() => this.cache.delete(key));
      if (this.cache.size > CACHE_SIZE) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
    }
    return entry;
  }
}

/**
 * A texture as a PNG of at most `size` pixels on its longest side: with `frames` above 1, its
 * first frame. Shared with the gutter thumbnails (sprite-gutter.ts).
 */
export async function texturePng(
  absolutePath: string,
  frames: number,
  size: number,
): Promise<{ png: Uint8Array; summary: ReturnType<typeof inspectTexture>['summary'] }> {
  const bytes = await vscode.workspace.fs.readFile(pathUri(absolutePath));
  const { summary, rgba } = inspectTexture(absolutePath, Uint8Array.from(bytes));
  let width = summary.width;
  let pixels = rgba;
  if (frames > 1) {
    width = Math.max(1, Math.floor(summary.width / frames));
    pixels = new Uint8Array(width * summary.height * 4);
    for (let y = 0; y < summary.height; y++) {
      const from = y * summary.width * 4;
      pixels.set(rgba.subarray(from, from + width * 4), y * width * 4);
    }
  }
  const small = thumbnail(width, summary.height, pixels, size);
  return { png: encodePng(small.width, small.height, small.rgba), summary };
}

async function render(absolutePath: string, frames: number): Promise<string> {
  const { png: bytes, summary } = await texturePng(absolutePath, frames, THUMBNAIL_SIZE);
  const png = Buffer.from(bytes).toString('base64');
  const facts = [
    `${String(summary.width)} × ${String(summary.height)}`,
    `${summary.container} ${summary.format}${summary.dx10 ? ' (DX10 header)' : ''}`,
    summary.mipLevels === 1 ? 'no mip chain' : `${String(summary.mipLevels)} mip levels`,
    summary.hasAlpha ? 'alpha used' : 'opaque',
  ];
  const caption = frames > 1 ? `\n\nFrame 1 of ${String(frames)}:` : '';
  return `${facts.join(' · ')}${caption}\n\n![${path.basename(absolutePath)}](data:image/png;base64,${png})`;
}
