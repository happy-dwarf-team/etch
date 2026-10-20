// TGA reader. Format reference: Truevision TGA File Format Specification 2.0.

import { otherImageKind, TextureReadError } from './image.ts';
import type { TextureImage } from './image.ts';

const HEADER_SIZE = 18;
// 16384², the largest texture WebGL2 contexts commonly allow; also bounds the
// buffer a run-length image would need.
const MAX_TEXELS = 16384 * 16384;

// Image types
const COLOUR_MAPPED = 1;
const TRUE_COLOUR = 2;
const RLE_FLAG = 8;

// Image descriptor
const RIGHT_TO_LEFT = 0x10;
const TOP_TO_BOTTOM = 0x20;

/**
 * Reads a TGA file into RGBA texels, top row first: true colour at 16, 24 or
 * 32 bits and colour-mapped images with 8- or 16-bit indices, each raw or
 * run-length encoded. Anything else throws a {@link TextureReadError}.
 *
 * When every texel's alpha is 0 the image is drawn opaque. Vanilla's 171
 * 16-bit TGA files (building pictures) declare one alpha bit and clear it in
 * every texel; taking that alpha would make them invisible (hypothesis about
 * the game's rule; it shows those pictures).
 */
export function readTga(bytes: Uint8Array): TextureImage {
  if (bytes.byteLength < HEADER_SIZE) {
    throw new TextureReadError('malformed', 'TGA file is shorter than its header');
  }
  const u16 = (offset: number): number => (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
  const idLength = bytes[0] ?? 0;
  const mapType = bytes[1] ?? 0;
  const imageType = bytes[2] ?? 0;
  const mapFirst = u16(3);
  const mapLength = u16(5);
  const mapBits = bytes[7] ?? 0;
  const width = u16(12);
  const height = u16(14);
  const pixelBits = bytes[16] ?? 0;
  const descriptor = bytes[17] ?? 0;

  const baseType = imageType & ~RLE_FLAG;
  const mapped = baseType === COLOUR_MAPPED;
  if (mapType > 1 || (imageType & ~(RLE_FLAG | 3)) !== 0) {
    const other = otherImageKind(bytes);
    if (other !== undefined)
      throw new TextureReadError('unsupported', `${other} data in a TGA file`);
    throw new TextureReadError('malformed', 'not a TGA file');
  }
  if (baseType !== TRUE_COLOUR && !mapped) {
    const what =
      baseType === 3 ? 'greyscale' : baseType === 0 ? 'without image data' : 'of an unknown type';
    throw new TextureReadError('unsupported', `TGA image ${what} (type ${String(imageType)})`);
  }
  const texelBits = mapped ? mapBits : pixelBits;
  if (![15, 16, 24, 32].includes(texelBits)) {
    throw new TextureReadError('unsupported', `TGA ${String(texelBits)}-bit colour`);
  }
  if (mapped && (mapType !== 1 || (pixelBits !== 8 && pixelBits !== 16))) {
    throw new TextureReadError(
      'unsupported',
      `TGA colour map with ${String(pixelBits)}-bit indices`,
    );
  }
  if (!mapped && pixelBits !== texelBits) {
    throw new TextureReadError('unsupported', `TGA ${String(pixelBits)}-bit colour`);
  }
  if (width === 0 || height === 0) {
    throw new TextureReadError('malformed', 'TGA image has no pixels');
  }
  if (width * height > MAX_TEXELS) {
    throw new TextureReadError(
      'unsupported',
      `TGA image of ${String(width)}×${String(height)} texels`,
    );
  }

  const texelBytes = Math.ceil(texelBits / 8);
  const mapStart = HEADER_SIZE + idLength;
  const mapBytes = mapType === 1 ? mapLength * Math.ceil(mapBits / 8) : 0;
  let p = mapStart + mapBytes;
  if (p > bytes.byteLength) throw cutShort();
  const map = bytes.subarray(mapStart, p);

  const out = new Uint8Array(width * height * 4);
  // Texels in file order; the orientation is fixed below.
  const putTexel = (source: Uint8Array, o: number, dst: number): void => {
    readTexel(source, o, texelBits, out, dst);
  };
  const put = mapped
    ? (o: number, dst: number): void => {
        const index = (pixelBits === 16 ? u16(o) : (bytes[o] ?? 0)) - mapFirst;
        if (index < 0 || index >= mapLength) {
          throw new TextureReadError(
            'malformed',
            `TGA colour index ${String(index + mapFirst)} is outside the map`,
          );
        }
        putTexel(map, index * texelBytes, dst);
      }
    : (o: number, dst: number): void => {
        putTexel(bytes, o, dst);
      };

  const pixelBytes = Math.ceil(pixelBits / 8);
  const count = width * height;
  if ((imageType & RLE_FLAG) === 0) {
    if (p + count * pixelBytes > bytes.byteLength) throw cutShort();
    for (let i = 0; i < count; i++) put(p + i * pixelBytes, i * 4);
  } else {
    // Packets may run across rows, as the specification allows.
    let i = 0;
    while (i < count) {
      const header = bytes[p++];
      if (header === undefined) throw cutShort();
      const run = Math.min((header & 0x7f) + 1, count - i);
      const repeated = (header & 0x80) !== 0;
      if (p + (repeated ? 1 : run) * pixelBytes > bytes.byteLength) throw cutShort();
      for (let k = 0; k < run; k++, i++) {
        put(p, i * 4);
        if (!repeated) p += pixelBytes;
      }
      if (repeated) p += pixelBytes;
    }
  }

  if (texelBits !== 24) opaqueIfAlphaIsEmpty(out);
  if ((descriptor & TOP_TO_BOTTOM) === 0) flipRows(out, width, height);
  if ((descriptor & RIGHT_TO_LEFT) !== 0) mirrorRows(out, width, height);
  return { kind: 'pixels', width, height, layout: 'rgba', data: out };
}

function readTexel(src: Uint8Array, o: number, bits: number, out: Uint8Array, dst: number): void {
  if (bits >= 24) {
    out[dst] = src[o + 2] ?? 0;
    out[dst + 1] = src[o + 1] ?? 0;
    out[dst + 2] = src[o] ?? 0;
    out[dst + 3] = bits === 32 ? (src[o + 3] ?? 0) : 255;
    return;
  }
  // A1R5G5B5, little endian. 15-bit texels have no alpha bit.
  const v = (src[o] ?? 0) | ((src[o + 1] ?? 0) << 8);
  out[dst] = expand5((v >> 10) & 31);
  out[dst + 1] = expand5((v >> 5) & 31);
  out[dst + 2] = expand5(v & 31);
  out[dst + 3] = bits === 15 || (v & 0x8000) !== 0 ? 255 : 0;
}

function expand5(v: number): number {
  return (v << 3) | (v >> 2);
}

function opaqueIfAlphaIsEmpty(rgba: Uint8Array): void {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 0) return;
  }
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
}

function flipRows(rgba: Uint8Array, width: number, height: number): void {
  const row = width * 4;
  const tmp = new Uint8Array(row);
  for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
    tmp.set(rgba.subarray(top * row, top * row + row));
    rgba.copyWithin(top * row, bottom * row, bottom * row + row);
    rgba.set(tmp, bottom * row);
  }
}

function mirrorRows(rgba: Uint8Array, width: number, height: number): void {
  const pixels = new Uint32Array(rgba.buffer, rgba.byteOffset, width * height);
  for (let y = 0; y < height; y++) pixels.subarray(y * width, y * width + width).reverse();
}

function cutShort(): TextureReadError {
  return new TextureReadError('malformed', 'TGA data is cut short');
}
