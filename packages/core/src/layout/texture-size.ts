/**
 * The size of a DDS or TGA texture from its header, which is all layout needs: icons and buttons
 * take their size from their sprite's texture (etch#3). The pixels are read by the webview
 * (`renderer`), never by the extension host (ADR 0001).
 */

/**
 * A texture's size in texels as the game draws it: the image's own size, and for a DXT image whose
 * size is not a multiple of 4 the size of its whole blocks (verified in etch#44: the game reports
 * and draws `new_estate_header.dds`, a 535×122 DXT5 image, at 536×124).
 */
export interface TextureSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Bytes a texture's size needs: the DDS magic, header and DX10 header up to its `dxgiFormat`, or
 * the TGA header.
 */
export const TEXTURE_HEADER_BYTES = 132;

const DDS_MAGIC = 0x20534444; // 'DDS '
/** A DDS header holds the size in bytes 12–19; its format comes later. */
const DDS_SIZE_BYTES = 20;
/** A TGA header holds the size in bytes 12–15. */
const TGA_SIZE_BYTES = 16;

/**
 * Reads the size from the first {@link TEXTURE_HEADER_BYTES} or more bytes of a texture file. A
 * file that starts with the DDS magic is read as DDS (the DX10 header keeps the classic size
 * fields), anything else as TGA, whose header has no magic. Returns a reason when the header
 * holds no usable size.
 */
export function readTextureSize(bytes: Uint8Array): TextureSize | { readonly problem: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dds = bytes.byteLength >= 4 && view.getUint32(0, true) === DDS_MAGIC;
  if (bytes.byteLength < (dds ? DDS_SIZE_BYTES : TGA_SIZE_BYTES)) {
    return { problem: 'the file is shorter than a texture header' };
  }
  if (dds) {
    const size = checked(view.getUint32(16, true), view.getUint32(12, true), 'DDS');
    if ('problem' in size || !isDxt(bytes, view)) return size;
    return { width: Math.ceil(size.width / 4) * 4, height: Math.ceil(size.height / 4) * 4 };
  }
  const imageType = view.getUint8(2) & ~8; // without the RLE bit
  if (imageType < 1 || imageType > 3) {
    return { problem: 'neither a DDS file nor a TGA image' };
  }
  return checked(view.getUint16(12, true), view.getUint16(14, true), 'TGA');
}

function checked(
  width: number,
  height: number,
  kind: string,
): TextureSize | { readonly problem: string } {
  return width === 0 || height === 0
    ? { problem: `the ${kind} header gives a size of ${String(width)}×${String(height)}` }
    : { width, height };
}

const DDPF_FOURCC = 0x4;
/** DXGI formats of BC1–BC3, typeless, UNORM and sRGB, which the DX10 header can name. */
const DXGI_BC1_TO_BC3 = new Set([70, 71, 72, 73, 74, 75, 76, 77, 78]);

/** Whether a DDS header names a block-compressed (DXT) format; unknown when it is cut short. */
function isDxt(bytes: Uint8Array, view: DataView): boolean {
  if (bytes.byteLength < 88 || (view.getUint32(80, true) & DDPF_FOURCC) === 0) return false;
  const fourCC = String.fromCharCode(...bytes.subarray(84, 88));
  if (fourCC === 'DX10')
    return bytes.byteLength >= 132 && DXGI_BC1_TO_BC3.has(view.getUint32(128, true));
  return /^DXT[1-5]$/.test(fourCC);
}
