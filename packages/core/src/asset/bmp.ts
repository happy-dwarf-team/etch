// Uncompressed 24- and 32-bit Windows bitmaps, as the map's colour tables are kept
// (`map/terrain/Tree_tint.bmp`: 16 × 16, 24-bit, rows bottom-up). Indexed and compressed
// bitmaps are refused; the interface's textures are DDS and TGA, read by `@etch/renderer`.

export class BmpReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BmpReadError';
  }
}

export interface BmpImage {
  readonly width: number;
  readonly height: number;
  /** Tightly packed RGBA rows, top row first, opaque: a 32-bit file's fourth byte is not read. */
  readonly rgba: Uint8Array;
}

export function readBmp(bytes: Uint8Array): BmpImage {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new BmpReadError('not a BMP file (no BM header)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataOffset = view.getUint32(10, true);
  const headerSize = view.getUint32(14, true);
  if (headerSize < 40) throw new BmpReadError(`BMP info header of ${String(headerSize)} bytes`);
  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  const height = Math.abs(signedHeight);
  if (width <= 0 || height === 0) {
    throw new BmpReadError(`BMP size ${String(width)} × ${String(signedHeight)}`);
  }
  // BI_RGB, or BI_BITFIELDS with the usual 32-bit masks.
  if ((bits !== 24 && bits !== 32) || (compression !== 0 && !(compression === 3 && bits === 32))) {
    throw new BmpReadError(
      `BMP of ${String(bits)} bits, compression ${String(compression)}: only uncompressed 24- and 32-bit files are read`,
    );
  }
  const texel = bits / 8;
  const stride = Math.ceil((width * texel) / 4) * 4;
  // Checked before allocating: the image is no larger than the file holds.
  if (dataOffset + stride * (height - 1) + width * texel > bytes.length) {
    throw new BmpReadError('BMP pixel data is cut short');
  }
  const rgba = new Uint8Array(width * height * 4);
  // A positive height stores the bottom row first.
  const bottomUp = signedHeight > 0;
  for (let y = 0; y < height; y++) {
    const row = dataOffset + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const from = row + x * texel;
      const to = (y * width + x) * 4;
      rgba[to] = bytes[from + 2] ?? 0;
      rgba[to + 1] = bytes[from + 1] ?? 0;
      rgba[to + 2] = bytes[from] ?? 0;
      rgba[to + 3] = 255;
    }
  }
  return { width, height, rgba };
}
