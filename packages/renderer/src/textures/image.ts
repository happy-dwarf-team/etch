/** The block-compressed formats Etch reads from DDS files. */
export type DxtFormat = 'DXT1' | 'DXT3' | 'DXT5';

/**
 * The byte order of uncompressed texels as they are stored:
 * - `rgba`: R, G, B, A.
 * - `bgra`: B, G, R, A (DDS A8R8G8B8).
 * - `bgrx`: B, G, R and an unused byte; the alpha is 1 (DDS X8R8G8B8).
 * - `bgr`: B, G, R, three bytes a texel; the alpha is 1 (DDS R8G8B8).
 */
export type TexelLayout = 'rgba' | 'bgra' | 'bgrx' | 'bgr';

/**
 * A decoded texture file: its first mip level only, since the preview draws
 * interface sprites at their own size. Row 0 is the image's top row.
 */
export type TextureImage =
  | {
      readonly kind: 'pixels';
      readonly width: number;
      readonly height: number;
      readonly layout: TexelLayout;
      /** Tightly packed rows, top row first. */
      readonly data: Uint8Array;
    }
  | {
      readonly kind: 'dxt';
      readonly width: number;
      readonly height: number;
      readonly format: DxtFormat;
      /**
       * The 4×4 blocks of the first mip level, block rows top first. A size that
       * is not a multiple of 4 still has whole blocks: the file pads them.
       */
      readonly data: Uint8Array;
    };

/**
 * Why a texture file cannot be read:
 * - `unsupported`: a valid file in a format Etch does not draw (spec section 3).
 * - `malformed`: not a DDS or TGA file, or cut short.
 */
export type TextureErrorCode = 'unsupported' | 'malformed';

/** Thrown by the texture readers. The message names the format or the defect. */
export class TextureReadError extends Error {
  readonly code: TextureErrorCode;

  constructor(code: TextureErrorCode, message: string) {
    super(message);
    this.name = 'TextureReadError';
    this.code = code;
  }
}

/** Bytes of one 4×4 block. */
export function dxtBlockBytes(format: DxtFormat): number {
  return format === 'DXT1' ? 8 : 16;
}

/** Bytes of the first mip level of a DXT image of this size. */
export function dxtLevelBytes(format: DxtFormat, width: number, height: number): number {
  return Math.ceil(width / 4) * Math.ceil(height / 4) * dxtBlockBytes(format);
}

/** The kind of another common image file, from its first bytes, if it is one. */
export function otherImageKind(bytes: Uint8Array): string | undefined {
  const starts = (...magic: number[]): boolean => magic.every((byte, i) => bytes[i] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'PNG';
  if (starts(0xff, 0xd8, 0xff)) return 'JPEG';
  if (starts(0x42, 0x4d)) return 'BMP';
  if (starts(0x44, 0x44, 0x53, 0x20)) return 'DDS';
  return undefined;
}
