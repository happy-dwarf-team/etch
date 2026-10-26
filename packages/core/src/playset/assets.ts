import { open, readFile } from 'node:fs/promises';
import {
  TEXTURE_HEADER_BYTES,
  layoutWindow,
  readTextureSize,
  type AssetProblem,
  type LayoutAssets,
  type LayoutInput,
  type TextureSize,
  type WindowLayout,
} from '../layout/index.ts';
import type { GuiFile, Screen, Widget } from '../model/index.ts';
import { normaliseGamePath } from '../model/index.ts';
import { parseBmFont, type BmFont } from '../text/bmfont.ts';
import type { PlaysetInterface } from './interface.ts';

/**
 * The texture sizes and fonts layout needs, read from the playset's files once and kept: a
 * texture's header only (its pixels are the webview's), a `.fnt` file whole. A file changed on
 * disk is read again after {@link forget}.
 */
export class PlaysetAssets implements LayoutAssets {
  private readonly playset: PlaysetInterface;
  private readonly textures = new Map<string, TextureSize | AssetProblem>();
  private readonly fonts = new Map<string, BmFont | AssetProblem>();

  constructor(playset: PlaysetInterface) {
    this.playset = playset;
  }

  textureSize(path: string): TextureSize | AssetProblem | undefined {
    return this.textures.get(keyOf(path));
  }

  font(path: string): BmFont | AssetProblem | undefined {
    return this.fonts.get(keyOf(path));
  }

  /** Reads the files that are not loaded yet; returns how many were read (or failed). */
  async load(paths: Iterable<string>): Promise<number> {
    const wanted = new Set<string>();
    for (const path of paths) {
      const key = keyOf(path);
      if (!this.textures.has(key) && !this.fonts.has(key)) wanted.add(path);
    }
    await Promise.all(
      [...wanted].map(async (path) => {
        const key = keyOf(path);
        const file = this.playset.gameFile(path);
        if (/\.fnt$/i.test(path)) {
          this.fonts.set(key, file === undefined ? notFound() : await readFont(file.absolutePath));
        } else {
          this.textures.set(
            key,
            file === undefined ? notFound() : await readHeader(file.absolutePath),
          );
        }
      }),
    );
    return wanted.size;
  }

  /** Drops a file read earlier, so that the next {@link load} reads it again. */
  forget(path: string): void {
    this.textures.delete(keyOf(path));
    this.fonts.delete(keyOf(path));
  }
}

/**
 * Lays out a window of the playset, loading the texture sizes and fonts it needs first. With
 * everything loaded (a warm reload) this is one synchronous layout.
 */
export async function layOutPreview(
  playset: PlaysetInterface,
  assets: PlaysetAssets,
  file: GuiFile,
  window: Widget,
  options: {
    readonly screen: Screen;
    readonly localise?: (text: string) => string;
    readonly sample?: (source: number) => string | undefined;
  },
): Promise<WindowLayout> {
  const input: LayoutInput = {
    file,
    index: playset.index,
    exists: playset.exists,
    assets,
    ...options,
  };
  let layout = layoutWindow(window, input);
  // A loaded texture can give a widget the size its children anchor in, but it never names new
  // files, so this ends after one load in practice; the bound only guards against a loop.
  for (let pass = 0; pass < 4 && layout.unloaded.length > 0; pass++) {
    if ((await assets.load(layout.unloaded)) === 0) break;
    layout = layoutWindow(window, input);
  }
  return layout;
}

function keyOf(path: string): string {
  return normaliseGamePath(path).toLowerCase();
}

function notFound(): AssetProblem {
  return { problem: 'the playset has no such file' };
}

async function readHeader(absolutePath: string): Promise<TextureSize | AssetProblem> {
  try {
    const handle = await open(absolutePath, 'r');
    try {
      const bytes = new Uint8Array(TEXTURE_HEADER_BYTES);
      const { bytesRead } = await handle.read(bytes, 0, bytes.byteLength, 0);
      return readTextureSize(bytes.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
  } catch (error) {
    return { problem: `cannot read it (${errorText(error)})` };
  }
}

async function readFont(absolutePath: string): Promise<BmFont | AssetProblem> {
  try {
    // BMFont text files are Windows-1252; their syntax is ASCII, so Latin-1 reads them.
    return parseBmFont(await readFile(absolutePath, 'latin1')).font;
  } catch (error) {
    return { problem: `cannot read it (${errorText(error)})` };
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
