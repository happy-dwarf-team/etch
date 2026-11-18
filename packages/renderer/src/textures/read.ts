// Choosing a texture reader by file name. Free of WebGL, so that the extension host can read
// textures too (`@etch/renderer/inspect`).

import { readDds } from './dds.ts';
import { TextureReadError } from './image.ts';
import type { TextureImage } from './image.ts';
import { readTga } from './tga.ts';

/** Reads a DDS or TGA file, chosen by the extension of `name` (case-insensitive). */
export function readTexture(name: string, bytes: Uint8Array): TextureImage {
  return textureKind(name) === 'dds' ? readDds(bytes) : readTga(bytes);
}

/** `dds` or `tga` from the extension of `name`, ignoring case and a query; throws otherwise. */
export function textureKind(name: string): 'dds' | 'tga' {
  const cut = name.search(/[?#]/);
  const path = (cut < 0 ? name : name.slice(0, cut)).toLowerCase();
  if (path.endsWith('.dds')) return 'dds';
  if (path.endsWith('.tga')) return 'tga';
  throw new TextureReadError('unsupported', `texture file type of ${name}`);
}
