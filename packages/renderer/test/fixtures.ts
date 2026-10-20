// Builders of small DDS, TGA and DXT files for the texture tests. Built in code
// so that every byte of a fixture is visible in the test that uses it.

export interface DdsOptions {
  width: number;
  height: number;
  data: Uint8Array;
  /** A fourCC for compressed data; omit for RGB texels. */
  fourCC?: string;
  /** DXGI format; sets the fourCC to DX10 and adds the DX10 header. */
  dxgiFormat?: number;
  bitCount?: number;
  masks?: readonly [number, number, number, number];
  /** DDPF_ALPHAPIXELS; defaults to whether the alpha mask is set. */
  alphaPixels?: boolean;
  /** Sets DDSD_PITCH with this row pitch. */
  pitch?: number;
  caps2?: number;
}

export function dds(options: DdsOptions): Uint8Array {
  const dx10 = options.dxgiFormat !== undefined;
  const header = new Uint8Array(128 + (dx10 ? 20 : 0));
  const view = new DataView(header.buffer);
  const put = (offset: number, value: number): void => {
    view.setUint32(offset, value, true);
  };
  const fourCC = dx10 ? 'DX10' : options.fourCC;
  const masks = options.masks ?? [0, 0, 0, 0];
  put(0, 0x20534444);
  put(4, 124);
  put(8, 0x1007 | (options.pitch === undefined ? 0 : 0x8));
  put(12, options.height);
  put(16, options.width);
  put(20, options.pitch ?? 0);
  put(76, 32);
  const alphaPixels = options.alphaPixels ?? masks[3] !== 0;
  put(80, fourCC === undefined ? 0x40 | (alphaPixels ? 0x1 : 0) : 0x4);
  if (fourCC !== undefined) {
    for (let i = 0; i < 4; i++) header[84 + i] = fourCC.charCodeAt(i);
  }
  put(88, options.bitCount ?? 0);
  masks.forEach((mask, i) => {
    put(92 + i * 4, mask);
  });
  put(108, 0x1000);
  put(112, options.caps2 ?? 0);
  if (dx10) {
    put(128, options.dxgiFormat ?? 0);
    put(132, 3);
    put(140, 1);
  }
  return concat(header, options.data);
}

export const BGRA_MASKS = [0xff0000, 0xff00, 0xff, 0xff000000] as const;

export interface TgaOptions {
  width: number;
  height: number;
  imageType: number;
  pixelBits: number;
  data: Uint8Array;
  descriptor?: number;
  id?: Uint8Array;
  map?: { first: number; bits: number; entries: Uint8Array };
}

export function tga(options: TgaOptions): Uint8Array {
  const id = options.id ?? new Uint8Array(0);
  const header = new Uint8Array(18);
  const view = new DataView(header.buffer);
  header[0] = id.length;
  header[1] = options.map === undefined ? 0 : 1;
  header[2] = options.imageType;
  if (options.map !== undefined) {
    view.setUint16(3, options.map.first, true);
    view.setUint16(5, options.map.entries.length / Math.ceil(options.map.bits / 8), true);
    header[7] = options.map.bits;
  }
  view.setUint16(12, options.width, true);
  view.setUint16(14, options.height, true);
  header[16] = options.pixelBits;
  header[17] = options.descriptor ?? 0;
  return concat(header, id, options.map?.entries ?? new Uint8Array(0), options.data);
}

/** A DXT1 block of two RGB565 colours and 16 two-bit indices, texel 0 in the lowest bits. */
export function dxt1Block(c0: number, c1: number, indices: number): Uint8Array {
  const block = new Uint8Array(8);
  const view = new DataView(block.buffer);
  view.setUint16(0, c0, true);
  view.setUint16(2, c1, true);
  view.setUint32(4, indices >>> 0, true);
  return block;
}

/** Packs 16 two-bit indices, texel 0 first. */
export function indices2(values: readonly number[]): number {
  return values.reduce((bits, v, i) => bits | (v << (2 * i)), 0) >>> 0;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export const RED_565 = 0xf800;
export const GREEN_565 = 0x07e0;
export const BLUE_565 = 0x001f;
export const WHITE_565 = 0xffff;
