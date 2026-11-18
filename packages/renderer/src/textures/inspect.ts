// What the texture preview (etch.texturePreview) shows of one DDS or TGA file: its header facts
// and its first mip level as RGBA texels. Pure and free of WebGL (`@etch/renderer/inspect`), so
// that the extension host can import it too; the webview draws the texels on a 2D canvas.

import { readDds } from './dds.ts';
import { decodeDxt } from './dxt.ts';
import { TextureReadError } from './image.ts';
import type { TextureImage } from './image.ts';
import { textureKind } from './read.ts';
import { readTga } from './tga.ts';

/** The header facts of a texture file, as the preview lists them. */
export interface TextureSummary {
  readonly container: 'DDS' | 'TGA';
  /** The mip level shown: 0 for the first. */
  readonly level: number;
  /** The shown level's size: the header's for the first level, halved for each level after it. */
  readonly width: number;
  readonly height: number;
  /**
   * The size the game draws the first level at, when it differs from the header's: a DXT image
   * whose size is not a multiple of 4 is drawn with its whole blocks, padding texels included
   * (etch#44). The shown level's size for a later level.
   */
  readonly drawnWidth: number;
  readonly drawnHeight: number;
  /** `DXT1`, `DXT3`, `DXT5`, `BGRA8`, `BGRX8`, `RGBA8` or `BGR8` for DDS; `32-bit RLE` and so on for TGA. */
  readonly format: string;
  /** Whether a DDS file has the DX10 header extension. */
  readonly dx10: boolean;
  /** Mip levels the file declares: 1 for a TGA file and for a DDS file without a mip chain. */
  readonly mipLevels: number;
  /** Whether any texel of the first level is not fully opaque. */
  readonly hasAlpha: boolean;
}

/** A texture file read for the preview. */
export interface InspectedTexture {
  readonly summary: TextureSummary;
  /** The shown mip level at its size, tightly packed RGBA rows, top row first. */
  readonly rgba: Uint8Array;
}

// DDS_HEADER.dwFlags
const DDSD_MIPMAPCOUNT = 0x20000;

const LAYOUT_NAMES = { rgba: 'RGBA8', bgra: 'BGRA8', bgrx: 'BGRX8', bgr: 'BGR8' } as const;

/**
 * Reads a DDS or TGA file, chosen by the extension of `name`, for the preview: the first mip
 * level, or the `level` a DDS file declares. Throws the readers' {@link TextureReadError} for a
 * file Etch cannot read or a level it does not declare.
 */
export function inspectTexture(name: string, bytes: Uint8Array, level = 0): InspectedTexture {
  if (textureKind(name) === 'dds') {
    // The reader checks the header first, so its fields are there after it.
    const first = readDds(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const flags = view.getUint32(8, true);
    const declared = view.getUint32(28, true);
    const mipLevels = (flags & DDSD_MIPMAPCOUNT) !== 0 ? Math.max(1, declared) : 1;
    if (!Number.isInteger(level) || level < 0 || level >= mipLevels) {
      throw new TextureReadError('malformed', `DDS file has no mip level ${String(level)}`);
    }
    const image = level === 0 ? first : readDds(bytes, level);
    const width = Math.max(1, view.getUint32(16, true) >> level);
    const height = Math.max(1, view.getUint32(12, true) >> level);
    const dx10 = String.fromCharCode(...bytes.subarray(84, 88)) === 'DX10';
    const rgba = crop(rgbaOf(image), image.width, width, height);
    return {
      summary: {
        container: 'DDS',
        level,
        width,
        height,
        // The interface draws the first level only; a later level is shown at its own size.
        drawnWidth: level === 0 ? image.width : width,
        drawnHeight: level === 0 ? image.height : height,
        format: image.kind === 'dxt' ? image.format : LAYOUT_NAMES[image.layout],
        dx10,
        mipLevels,
        hasAlpha: hasAlpha(rgba),
      },
      rgba,
    };
  }
  if (level !== 0) throw new TextureReadError('malformed', 'TGA file has no mip levels');
  const image = readTga(bytes);
  const full = rgbaOf(image);
  const imageType = bytes[2] ?? 0;
  const mapped = (imageType & 3) === 1;
  const bits = mapped ? (bytes[7] ?? 0) : (bytes[16] ?? 0);
  const rle = (imageType & 8) !== 0;
  return {
    summary: {
      container: 'TGA',
      level: 0,
      width: image.width,
      height: image.height,
      drawnWidth: image.width,
      drawnHeight: image.height,
      format: `${mapped ? 'colour-mapped ' : ''}${String(bits)}-bit${rle ? ' RLE' : ''}`,
      dx10: false,
      mipLevels: 1,
      hasAlpha: hasAlpha(full),
    },
    rgba: full,
  };
}

/** The texels of a decoded image as tightly packed RGBA, top row first. */
export function rgbaOf(image: TextureImage): Uint8Array {
  if (image.kind === 'dxt') return decodeDxt(image.format, image.width, image.height, image.data);
  const { data, layout } = image;
  if (layout === 'rgba') return data;
  const count = image.width * image.height;
  const out = new Uint8Array(count * 4);
  const step = layout === 'bgr' ? 3 : 4;
  for (let i = 0, s = 0, d = 0; i < count; i++, s += step, d += 4) {
    out[d] = data[s + 2] ?? 0;
    out[d + 1] = data[s + 1] ?? 0;
    out[d + 2] = data[s] ?? 0;
    out[d + 3] = layout === 'bgra' ? (data[s + 3] ?? 0) : 255;
  }
  return out;
}

function crop(rgba: Uint8Array, stride: number, width: number, height: number): Uint8Array {
  if (stride === width && rgba.length === width * height * 4) return rgba;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    out.set(rgba.subarray(y * stride * 4, (y * stride + width) * 4), y * width * 4);
  }
  return out;
}

function hasAlpha(rgba: Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true;
  return false;
}
