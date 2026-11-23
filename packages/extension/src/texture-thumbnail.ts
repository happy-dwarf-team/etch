// The texture part of a hover: a line of facts (size, format, mip levels, alpha) and a picture
// as a PNG `data:` URI, which VS Code renders in hovers. Shared by the asset path hovers
// (asset-links.ts), which show the texture, and the sprite hovers (sprite-links.ts), which show
// every frame on a checkerboard (sprite-strip.ts); cached by file, time and size.

import * as path from 'node:path';
import * as vscode from 'vscode';
import { inspectTexture } from '@etch/renderer/inspect';
import { encodePng, thumbnail } from './png.ts';
import { spriteStrip, stripCaption } from './sprite-strip.ts';
import { statGamePath } from '@etch/core/playset';
import { pathUri } from './dlc-files.ts';

/** The thumbnail's longest side in a hover, in pixels. */
const THUMBNAIL_SIZE = 128;
/** Thumbnails kept. */
const CACHE_SIZE = 32;

export class TextureThumbnails {
  private readonly cache = new Map<string, Promise<string>>();

  /** The Markdown of a texture: its facts and the image. */
  markdown(absolutePath: string): Promise<string> {
    return this.cached(absolutePath, 'texture', () => render(absolutePath));
  }

  /**
   * The Markdown of a sprite's texture: its facts and its frames (a sprite's `noOfFrames` cuts
   * the texture's width into that many cells), side by side on a checkerboard.
   */
  sprite(absolutePath: string, frames: number): Promise<string> {
    return this.cached(absolutePath, `sprite ${String(frames)}`, () =>
      renderSprite(absolutePath, frames),
    );
  }

  /** A texture's first frame as a PNG `data:` URI, at most `size` pixels on its longest side. */
  uri(absolutePath: string, frames: number, size: number): Promise<string> {
    return this.cached(absolutePath, `uri ${String(frames)} ${String(size)}`, async () => {
      const { png } = await texturePng(absolutePath, frames, size);
      return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
    });
  }

  private async cached(
    absolutePath: string,
    kind: string,
    make: () => Promise<string>,
  ): Promise<string> {
    const info = await statGamePath(absolutePath);
    const key = `${absolutePath}|${String(info.mtimeMs)}|${String(info.size)}|${kind}`;
    let entry = this.cache.get(key);
    if (entry === undefined) {
      entry = make();
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

type Summary = ReturnType<typeof inspectTexture>['summary'];

function factsOf(summary: Summary): string {
  return [
    `${String(summary.width)} × ${String(summary.height)}`,
    `${summary.container} ${summary.format}${summary.dx10 ? ' (DX10 header)' : ''}`,
    summary.mipLevels === 1 ? 'no mip chain' : `${String(summary.mipLevels)} mip levels`,
    summary.hasAlpha ? 'alpha used' : 'opaque',
  ].join(' · ');
}

function image(absolutePath: string, png: Uint8Array): string {
  return `![${path.basename(absolutePath)}](data:image/png;base64,${Buffer.from(png).toString('base64')})`;
}

async function render(absolutePath: string): Promise<string> {
  const { png, summary } = await texturePng(absolutePath, 1, THUMBNAIL_SIZE);
  return `${factsOf(summary)}\n\n${image(absolutePath, png)}`;
}

async function renderSprite(absolutePath: string, frames: number): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(pathUri(absolutePath));
  const { summary, rgba } = inspectTexture(absolutePath, Uint8Array.from(bytes));
  const strip = spriteStrip(summary.width, summary.height, rgba, frames);
  const png = encodePng(strip.width, strip.height, strip.rgba);
  const caption = stripCaption(strip);
  return `${factsOf(summary)}\n\n${image(absolutePath, png)}${caption === '' ? '' : `\n\n${caption}`}`;
}
