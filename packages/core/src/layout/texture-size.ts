/**
 * The size of a DDS or TGA texture from its header, which is all layout needs: icons and buttons
 * take their size from their sprite's texture (etch#3). The pixels are read by the webview
 * (`renderer`), never by the extension host (ADR 0001).
 */

/** A texture's size in texels: the image's own size, before any DXT padding. */
export interface TextureSize {
  readonly width: number;
  readonly height: number;
}

/** Bytes a texture's size needs: the DDS magic and header up to `dwWidth`, or the TGA header. */
export const TEXTURE_HEADER_BYTES = 20;

const DDS_MAGIC = 0x20534444; // 'DDS '
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
  if (bytes.byteLength < (dds ? TEXTURE_HEADER_BYTES : TGA_SIZE_BYTES)) {
    return { problem: 'the file is shorter than a texture header' };
  }
  if (dds) return checked(view.getUint32(16, true), view.getUint32(12, true), 'DDS');
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
