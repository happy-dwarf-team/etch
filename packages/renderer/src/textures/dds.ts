// DDS reader. The header handling is modelled on three.js's DDSLoader
// (https://github.com/mrdoob/three.js, examples/jsm/loaders/DDSLoader.js,
// MIT License, Copyright © 2010-2026 three.js authors); no code is copied.
// Format reference: Microsoft's "DDS_HEADER structure" and "DDS_PIXELFORMAT".

import { dxtLevelBytes, otherImageKind, TextureReadError } from './image.ts';
import type { DxtFormat, TexelLayout, TextureImage } from './image.ts';

const MAGIC = 0x20534444; // 'DDS '
const HEADER_SIZE = 124;
const PIXEL_FORMAT_SIZE = 32;

// DDS_HEADER.dwFlags
const DDSD_PITCH = 0x8;
// DDS_PIXELFORMAT.dwFlags
const DDPF_ALPHAPIXELS = 0x1;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;
// DDS_HEADER.dwCaps2
const DDSCAPS2_CUBEMAP = 0x200;
const DDSCAPS2_VOLUME = 0x200000;

const DXT_FORMATS: readonly string[] = ['DXT1', 'DXT3', 'DXT5'] satisfies DxtFormat[];

// DDS_HEADER_DXT10
const DX10_HEADER_SIZE = 20;
const D3D10_RESOURCE_DIMENSION_TEXTURE2D = 3;
const DDS_RESOURCE_MISC_TEXTURECUBE = 0x4;

/**
 * DXGI formats that are one of Etch's DDS formats under another header. The
 * sRGB variants are read as their UNORM twins: whether the game decodes sRGB
 * is not known (hypothesis: it does not, under Direct3D 9).
 */
const DXGI_FORMATS = new Map<number, DxtFormat | TexelLayout>([
  [28, 'rgba'], // R8G8B8A8_UNORM
  [29, 'rgba'], // R8G8B8A8_UNORM_SRGB
  [71, 'DXT1'], // BC1_UNORM
  [72, 'DXT1'], // BC1_UNORM_SRGB
  [74, 'DXT3'], // BC2_UNORM
  [75, 'DXT3'], // BC2_UNORM_SRGB
  [77, 'DXT5'], // BC3_UNORM
  [78, 'DXT5'], // BC3_UNORM_SRGB
  [87, 'bgra'], // B8G8R8A8_UNORM
  [88, 'bgrx'], // B8G8R8X8_UNORM
  [91, 'bgra'], // B8G8R8A8_UNORM_SRGB
  [93, 'bgrx'], // B8G8R8X8_UNORM_SRGB
]);

/**
 * Reads the first mip level of a DDS file: DXT1/3/5 blocks as stored, or
 * 32-bit and 24-bit RGB texels (BGRA8, BGRX8, RGBA8, RGB8), under the classic
 * header or the DX10 one. Anything else throws a {@link TextureReadError}
 * naming the format.
 */
export function readDds(bytes: Uint8Array): TextureImage {
  if (bytes.byteLength < 4 + HEADER_SIZE) {
    const other = otherImageKind(bytes);
    throw other === undefined || other === 'DDS'
      ? new TextureReadError('malformed', 'DDS file is shorter than its header')
      : new TextureReadError('unsupported', `${other} data in a DDS file`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (offset: number): number => view.getUint32(offset, true);

  if (u32(0) !== MAGIC) {
    const other = otherImageKind(bytes);
    throw other === undefined
      ? new TextureReadError('malformed', 'not a DDS file (no "DDS " magic)')
      : new TextureReadError('unsupported', `${other} data in a DDS file`);
  }
  const headerSize = u32(4);
  if (headerSize !== HEADER_SIZE || u32(76) !== PIXEL_FORMAT_SIZE) {
    throw new TextureReadError('malformed', 'DDS header sizes are not 124 and 32 bytes');
  }
  const flags = u32(8);
  const height = u32(12);
  const width = u32(16);
  const pitch = u32(20);
  const pfFlags = u32(80);
  const bitCount = u32(88);
  const masks = [u32(92), u32(96), u32(100), u32(104)] as const;
  const caps2 = u32(112);

  if (width === 0 || height === 0) {
    throw new TextureReadError('malformed', 'DDS image has no pixels');
  }
  if ((caps2 & DDSCAPS2_CUBEMAP) !== 0) {
    throw new TextureReadError('unsupported', 'DDS cube map');
  }
  if ((caps2 & DDSCAPS2_VOLUME) !== 0) {
    throw new TextureReadError('unsupported', 'DDS volume texture');
  }

  let format: DxtFormat | TexelLayout | undefined;
  let dataOffset = 4 + headerSize;
  if ((pfFlags & DDPF_FOURCC) !== 0) {
    const fourCC = String.fromCharCode(...bytes.subarray(84, 88));
    if (fourCC === 'DX10') {
      // DDS_HEADER_DXT10 follows the header. Mods write it (Anbennar has
      // thousands); its formats are the same texels under DXGI names.
      dataOffset += DX10_HEADER_SIZE;
      if (bytes.byteLength < dataOffset) {
        throw new TextureReadError('malformed', 'DDS file is shorter than its DX10 header');
      }
      const dxgiFormat = u32(128);
      if (
        u32(132) !== D3D10_RESOURCE_DIMENSION_TEXTURE2D ||
        (u32(136) & DDS_RESOURCE_MISC_TEXTURECUBE) !== 0 ||
        u32(140) > 1
      ) {
        throw new TextureReadError('unsupported', 'DDS DX10 texture that is not one 2D image');
      }
      format = DXGI_FORMATS.get(dxgiFormat);
      if (format === undefined) {
        throw new TextureReadError('unsupported', `DDS DX10 format DXGI ${String(dxgiFormat)}`);
      }
    } else if (DXT_FORMATS.includes(fourCC)) {
      format = fourCC as DxtFormat;
    } else {
      throw new TextureReadError('unsupported', `DDS format ${printable(fourCC)}`);
    }
  } else if ((pfFlags & DDPF_RGB) !== 0) {
    format = rgbLayout(bitCount, masks, pfFlags);
  }
  if (format === undefined) {
    throw new TextureReadError('unsupported', `DDS format ${describe(pfFlags, bitCount, masks)}`);
  }

  if (isDxt(format)) {
    const length = dxtLevelBytes(format, width, height);
    // Verified in etch#44: the game draws a DXT image whose size is not a multiple of 4 at the
    // size of its whole blocks, padding texels included.
    return {
      kind: 'dxt',
      width: Math.ceil(width / 4) * 4,
      height: Math.ceil(height / 4) * 4,
      format,
      data: slice(bytes, dataOffset, length, `DDS ${format}`),
    };
  }
  const rowBytes = width * (format === 'bgr' ? 3 : 4);
  // Some writers pad rows; the pitch then says so. Without the flag the rows
  // are tight, as Microsoft's documentation asks.
  const stride = (flags & DDSD_PITCH) !== 0 && pitch > rowBytes ? pitch : rowBytes;
  const stored = slice(bytes, dataOffset, stride * (height - 1) + rowBytes, `DDS ${format}`);
  return {
    kind: 'pixels',
    width,
    height,
    layout: format,
    data: packRows(stored, rowBytes, stride, height),
  };
}

function isDxt(format: DxtFormat | TexelLayout): format is DxtFormat {
  return DXT_FORMATS.includes(format);
}

function rgbLayout(
  bitCount: number,
  [r, g, b, a]: readonly [number, number, number, number],
  pfFlags: number,
): TexelLayout | undefined {
  const alpha = (pfFlags & DDPF_ALPHAPIXELS) !== 0 && a !== 0;
  if (bitCount === 32 && g === 0xff00) {
    if (r === 0xff0000 && b === 0xff) {
      if (!alpha) return 'bgrx';
      return a === 0xff000000 ? 'bgra' : undefined;
    }
    // A8B8G8R8 has no layout without alpha here: X8B8G8R8 is rare enough to
    // report instead.
    if (r === 0xff && b === 0xff0000 && alpha && a === 0xff000000) return 'rgba';
  }
  if (bitCount === 24 && r === 0xff0000 && g === 0xff00 && b === 0xff && !alpha) return 'bgr';
  return undefined;
}

function describe(
  pfFlags: number,
  bitCount: number,
  masks: readonly [number, number, number, number],
): string {
  const hex = (mask: number): string => `0x${mask.toString(16).padStart(8, '0')}`;
  return `${String(bitCount)}-bit, flags 0x${pfFlags.toString(16)}, masks R ${hex(masks[0])} G ${hex(masks[1])} B ${hex(masks[2])} A ${hex(masks[3])}`;
}

function printable(fourCC: string): string {
  return /^[\x20-\x7e]{4}$/.test(fourCC) ? fourCC : 'with an unreadable fourCC';
}

function slice(bytes: Uint8Array, offset: number, length: number, what: string): Uint8Array {
  if (offset + length > bytes.byteLength) {
    throw new TextureReadError(
      'malformed',
      `${what} data is cut short: ${String(bytes.byteLength - offset)} of ${String(length)} bytes`,
    );
  }
  return bytes.subarray(offset, offset + length);
}

function packRows(
  stored: Uint8Array,
  rowBytes: number,
  stride: number,
  height: number,
): Uint8Array {
  if (stride === rowBytes) return stored;
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    out.set(stored.subarray(y * stride, y * stride + rowBytes), y * rowBytes);
  }
  return out;
}
