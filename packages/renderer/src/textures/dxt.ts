// CPU decoder for DXT1/3/5 (BC1/2/3), used when the webview has no S3TC.
// Format reference: the "S3 Texture Compression" section of the Khronos Data
// Format Specification. Interpolated colours are rounded to the nearest
// integer; GPUs may round differently by a few units.

import { dxtBlockBytes } from './image.ts';
import type { DxtFormat } from './image.ts';

/** Decodes the first mip level of a DXT image into tightly packed RGBA texels, top row first. */
export function decodeDxt(
  format: DxtFormat,
  width: number,
  height: number,
  data: Uint8Array,
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const blockBytes = dxtBlockBytes(format);
  const blocksWide = Math.ceil(width / 4);
  const blocksHigh = Math.ceil(height / 4);
  const colours = new Uint8Array(16); // four RGBA entries
  const alphas = new Uint8Array(16); // one alpha per texel of the block
  const alphaPalette = new Uint8Array(8);

  for (let by = 0; by < blocksHigh; by++) {
    for (let bx = 0; bx < blocksWide; bx++) {
      const block = (by * blocksWide + bx) * blockBytes;
      const colourBlock = format === 'DXT1' ? block : block + 8;
      colourPalette(data, colourBlock, format === 'DXT1', colours);
      if (format === 'DXT3') explicitAlpha(data, block, alphas);
      else if (format === 'DXT5') interpolatedAlpha(data, block, alphaPalette, alphas);

      const indices = u32(data, colourBlock + 4);
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3);
        const y = by * 4 + (i >> 2);
        if (x >= width || y >= height) continue;
        const c = ((indices >>> (2 * i)) & 3) * 4;
        const d = (y * width + x) * 4;
        out[d] = colours[c] ?? 0;
        out[d + 1] = colours[c + 1] ?? 0;
        out[d + 2] = colours[c + 2] ?? 0;
        out[d + 3] = format === 'DXT1' ? (colours[c + 3] ?? 0) : (alphas[i] ?? 0);
      }
    }
  }
  return out;
}

function colourPalette(data: Uint8Array, o: number, dxt1: boolean, out: Uint8Array): void {
  const c0 = u16(data, o);
  const c1 = u16(data, o + 2);
  rgb565(c0, out, 0);
  rgb565(c1, out, 4);
  // DXT1 with c0 <= c1 has three colours and transparent black; DXT3/5
  // always use four colours.
  const four = !dxt1 || c0 > c1;
  for (let k = 0; k < 3; k++) {
    const a = out[k] ?? 0;
    const b = out[4 + k] ?? 0;
    if (four) {
      out[8 + k] = Math.round((2 * a + b) / 3);
      out[12 + k] = Math.round((a + 2 * b) / 3);
    } else {
      out[8 + k] = Math.round((a + b) / 2);
      out[12 + k] = 0;
    }
  }
  out[3] = 255;
  out[7] = 255;
  out[11] = 255;
  out[15] = four ? 255 : 0;
}

function rgb565(v: number, out: Uint8Array, at: number): void {
  const r = (v >> 11) & 31;
  const g = (v >> 5) & 63;
  const b = v & 31;
  out[at] = (r << 3) | (r >> 2);
  out[at + 1] = (g << 2) | (g >> 4);
  out[at + 2] = (b << 3) | (b >> 2);
}

function explicitAlpha(data: Uint8Array, o: number, out: Uint8Array): void {
  for (let i = 0; i < 16; i++) {
    const nibble = ((data[o + (i >> 1)] ?? 0) >> ((i & 1) * 4)) & 15;
    out[i] = nibble * 17;
  }
}

function interpolatedAlpha(
  data: Uint8Array,
  o: number,
  palette: Uint8Array,
  out: Uint8Array,
): void {
  const a0 = data[o] ?? 0;
  const a1 = data[o + 1] ?? 0;
  palette[0] = a0;
  palette[1] = a1;
  if (a0 > a1) {
    for (let i = 1; i < 7; i++) palette[i + 1] = Math.round(((7 - i) * a0 + i * a1) / 7);
  } else {
    for (let i = 1; i < 5; i++) palette[i + 1] = Math.round(((5 - i) * a0 + i * a1) / 5);
    palette[6] = 0;
    palette[7] = 255;
  }
  // 16 three-bit indices in 48 bits, read as two 24-bit halves.
  for (let half = 0; half < 2; half++) {
    const q = o + 2 + half * 3;
    const bits = (data[q] ?? 0) | ((data[q + 1] ?? 0) << 8) | ((data[q + 2] ?? 0) << 16);
    for (let k = 0; k < 8; k++) out[half * 8 + k] = palette[(bits >> (3 * k)) & 7] ?? 0;
  }
}

function u16(data: Uint8Array, o: number): number {
  return (data[o] ?? 0) | ((data[o + 1] ?? 0) << 8);
}

function u32(data: Uint8Array, o: number): number {
  return (u16(data, o) | (u16(data, o + 2) << 16)) >>> 0;
}
