// PROTOTYPE (etch#9): DDS and TGA readers for the webview. Throwaway.
// DDS: uncompressed 32/24-bit with masks, DXT1/3/5 (kept compressed for S3TC, CPU decode as fallback). Mip level 0 only.

export type Img =
  | { kind: 'raw'; w: number; h: number; data: Uint8Array; layout: 'rgba' | 'bgra' | 'bgr' | 'bgrx' }
  | { kind: 'dxt'; w: number; h: number; data: Uint8Array; fourcc: 'DXT1' | 'DXT3' | 'DXT5' };

export function readDds(buf: ArrayBuffer): Img {
  const dv = new DataView(buf); const u8 = new Uint8Array(buf);
  if (dv.getUint32(0, true) !== 0x20534444) throw new Error('not DDS');
  const h = dv.getUint32(12, true), w = dv.getUint32(16, true);
  const pf = dv.getUint32(80, true);
  if (pf & 4) {
    const fourcc = String.fromCharCode(u8[84], u8[85], u8[86], u8[87]) as 'DXT1' | 'DXT3' | 'DXT5';
    if (fourcc !== 'DXT1' && fourcc !== 'DXT3' && fourcc !== 'DXT5') throw new Error(`DDS ${fourcc} unsupported`);
    const bs = fourcc === 'DXT1' ? 8 : 16;
    const len = Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(h / 4)) * bs;
    return { kind: 'dxt', w, h, fourcc, data: u8.subarray(128, 128 + len) };
  }
  const bits = dv.getUint32(88, true);
  const rm = dv.getUint32(92, true), am = dv.getUint32(104, true);
  const hasA = (pf & 1) !== 0 && am !== 0;
  if (bits === 32 && rm === 0xff0000) return { kind: 'raw', w, h, data: u8.subarray(128, 128 + w * h * 4), layout: hasA ? 'bgra' : 'bgrx' };
  if (bits === 32 && rm === 0xff) return { kind: 'raw', w, h, data: u8.subarray(128, 128 + w * h * 4), layout: 'rgba' };
  if (bits === 24 && rm === 0xff0000) return { kind: 'raw', w, h, data: u8.subarray(128, 128 + w * h * 3), layout: 'bgr' };
  throw new Error(`DDS ${bits}-bit mask ${rm.toString(16)} unsupported`);
}

export function readTga(buf: ArrayBuffer): Img {
  const u8 = new Uint8Array(buf);
  const idLen = u8[0], cmType = u8[1], type = u8[2];
  const cmFirst = u8[3] | (u8[4] << 8), cmLen = u8[5] | (u8[6] << 8), cmBits = u8[7];
  const w = u8[12] | (u8[13] << 8), h = u8[14] | (u8[15] << 8), bpp = u8[16], desc = u8[17];
  let p = 18 + idLen;
  const cmBytes = cmType ? cmLen * Math.ceil(cmBits / 8) : 0;
  const cm = u8.subarray(p, p + cmBytes); p += cmBytes;
  const out = new Uint8Array(w * h * 4);
  const px = (bytes: Uint8Array, o: number, bits: number, dst: number) => {
    if (bits === 32) { out[dst] = bytes[o + 2]; out[dst + 1] = bytes[o + 1]; out[dst + 2] = bytes[o]; out[dst + 3] = bytes[o + 3]; }
    else if (bits === 24) { out[dst] = bytes[o + 2]; out[dst + 1] = bytes[o + 1]; out[dst + 2] = bytes[o]; out[dst + 3] = 255; }
    else if (bits === 16 || bits === 15) { const v = bytes[o] | (bytes[o + 1] << 8); out[dst] = ((v >> 10) & 31) * 255 / 31; out[dst + 1] = ((v >> 5) & 31) * 255 / 31; out[dst + 2] = (v & 31) * 255 / 31; out[dst + 3] = bits === 16 && (desc & 15) ? ((v >> 15) ? 255 : 0) : 255; }
  };
  const mapped = type === 1 || type === 9; const rle = type >= 9;
  const sb = mapped ? Math.ceil(bpp / 8) : Math.ceil(bpp / 8);
  const put = (i: number, o: number) => {
    if (mapped) { let idx = u8[o]; if (sb === 2) idx |= u8[o + 1] << 8; px(cm, (idx - cmFirst) * Math.ceil(cmBits / 8), cmBits, i * 4); }
    else px(u8, o, bpp, i * 4);
  };
  const n = w * h;
  if (!rle) for (let i = 0; i < n; i++) put(i, p + i * sb);
  else {
    let i = 0;
    while (i < n) {
      const hdr = u8[p++]; const cnt = (hdr & 127) + 1;
      if (hdr & 128) { for (let k = 0; k < cnt; k++) put(i++, p); p += sb; }
      else for (let k = 0; k < cnt; k++) { put(i++, p); p += sb; }
    }
  }
  if (!(desc & 0x20)) { // bottom-left origin: flip
    const row = w * 4; const tmp = new Uint8Array(row);
    for (let y = 0; y < (h >> 1); y++) { const a = y * row, b = (h - 1 - y) * row; tmp.set(out.subarray(a, a + row)); out.copyWithin(a, b, b + row); out.set(tmp, b); }
  }
  return { kind: 'raw', w, h, data: out, layout: 'rgba' };
}

/** CPU decode of DXT1/3/5 to RGBA8 (fallback when S3TC is missing; also the S3TC self-check). */
export function decodeDxt(img: { w: number; h: number; data: Uint8Array; fourcc: string }): Uint8Array {
  const { w, h, data, fourcc } = img; const out = new Uint8Array(w * h * 4);
  const bw = Math.max(1, Math.ceil(w / 4)), bh = Math.max(1, Math.ceil(h / 4));
  const bs = fourcc === 'DXT1' ? 8 : 16;
  const c = new Uint8Array(16); const a = new Uint8Array(16);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = (by * bw + bx) * bs; const co = fourcc === 'DXT1' ? o : o + 8;
    const c0 = data[co] | (data[co + 1] << 8), c1 = data[co + 2] | (data[co + 3] << 8);
    const rgb = (v: number, k: number) => { c[k] = ((v >> 11) & 31) * 255 / 31; c[k + 1] = ((v >> 5) & 63) * 255 / 63; c[k + 2] = (v & 31) * 255 / 31; c[k + 3] = 255; };
    rgb(c0, 0); rgb(c1, 4);
    if (c0 > c1 || fourcc !== 'DXT1') { for (let k = 0; k < 3; k++) { c[8 + k] = (2 * c[k] + c[4 + k]) / 3; c[12 + k] = (c[k] + 2 * c[4 + k]) / 3; } c[11] = c[15] = 255; }
    else { for (let k = 0; k < 3; k++) { c[8 + k] = (c[k] + c[4 + k]) / 2; c[12 + k] = 0; } c[11] = 255; c[15] = 0; }
    if (fourcc === 'DXT3') for (let i = 0; i < 16; i++) a[i] = ((data[o + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
    else if (fourcc === 'DXT5') {
      const a0 = data[o], a1 = data[o + 1]; const pal = [a0, a1];
      if (a0 > a1) for (let i = 1; i < 7; i++) pal.push(((7 - i) * a0 + i * a1) / 7 | 0);
      else { for (let i = 1; i < 5; i++) pal.push(((5 - i) * a0 + i * a1) / 5 | 0); pal.push(0, 255); }
      let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(data[o + 2 + i]) << BigInt(8 * i);
      for (let i = 0; i < 16; i++) a[i] = pal[Number((bits >> BigInt(3 * i)) & 7n)];
    }
    const idx = data[co + 4] | (data[co + 5] << 8) | (data[co + 6] << 16) | (data[co + 7] << 24);
    for (let i = 0; i < 16; i++) {
      const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2); if (x >= w || y >= h) continue;
      const s = ((idx >>> (2 * i)) & 3) * 4, d = (y * w + x) * 4;
      out[d] = c[s]; out[d + 1] = c[s + 1]; out[d + 2] = c[s + 2]; out[d + 3] = fourcc === 'DXT1' ? c[s + 3] : a[i];
    }
  }
  return out;
}
