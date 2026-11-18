// A minimal PNG writer for the texture thumbnails of hovers (src/asset-links.ts): 8-bit RGBA,
// no filter, one IDAT chunk deflated by Node's zlib. Format reference: the PNG specification
// (W3C, third edition), sections 5 and 11.

import { deflateSync } from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 of the PNG specification, over chunk type and data. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encodes tightly packed RGBA rows, top row first, as a PNG file. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `${String(rgba.length)} bytes are not ${String(width)} × ${String(height)} RGBA`,
    );
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // Each row starts with filter type 0 (none).
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  const parts = [
    Uint8Array.from(SIGNATURE),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * The texels scaled down to fit `max` × `max` by averaging each output texel's box, or the same
 * texels when they fit already. Colour is averaged weighted by alpha, so that transparent texels
 * do not darken the edges.
 */
export function thumbnail(
  width: number,
  height: number,
  rgba: Uint8Array,
  max: number,
): { width: number; height: number; rgba: Uint8Array } {
  const scale = Math.min(1, max / width, max / height);
  if (scale === 1) return { width, height, rgba };
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * width) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * width + sx) * 4;
          const alpha = rgba[i + 3] ?? 0;
          r += (rgba[i] ?? 0) * alpha;
          g += (rgba[i + 1] ?? 0) * alpha;
          b += (rgba[i + 2] ?? 0) * alpha;
          a += alpha;
        }
      }
      const d = (y * w + x) * 4;
      const count = (x1 - x0) * (y1 - y0);
      out[d] = a === 0 ? 0 : Math.round(r / a);
      out[d + 1] = a === 0 ? 0 : Math.round(g / a);
      out[d + 2] = a === 0 ? 0 : Math.round(b / a);
      out[d + 3] = Math.round(a / count);
    }
  }
  return { width: w, height: h, rgba: out };
}
