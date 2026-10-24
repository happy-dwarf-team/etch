import { decodeDxt } from './dxt.ts';
import type { DxtFormat, TextureImage } from './image.ts';

/**
 * How the shader turns a sampled texel into straight RGBA. Textures are
 * uploaded as stored and swizzled in the shader (ADR 0001), because WebGL has
 * no BGRA upload and no texture swizzle.
 */
export type SampleLayout = 'rgba' | 'bgra' | 'bgrx';

/** How a texture reached the GPU. */
export type UploadPath = 'compressed' | 'cpu-dxt' | 'pixels';

/** A texture on the GPU, with what the drawing needs to sample it. */
export interface GpuTexture {
  readonly texture: WebGLTexture;
  /** The image's size in texels. */
  readonly width: number;
  readonly height: number;
  /**
   * The allocated size. A compressed DXT texture whose size is not a multiple
   * of 4 is allocated at the next multiple of 4, because WebGL refuses partial
   * blocks (etch#9); `readDds` already gives such an image the size of its
   * whole blocks, as the game draws it (etch#44). Use {@link uvScale} and
   * clamp, as `etchImageUv` in {@link TEXTURE_GLSL} does.
   */
  readonly storedWidth: number;
  readonly storedHeight: number;
  /** Image UVs (0 to 1 across the image) times this give texture UVs. */
  readonly uvScale: readonly [number, number];
  readonly layout: SampleLayout;
  readonly path: UploadPath;
  /** Bytes the texture takes on the GPU, roughly. */
  readonly bytes: number;
}

/** The texture features of one WebGL2 context. */
export interface TextureSupport {
  /** `WEBGL_compressed_texture_s3tc`, or null when the context lacks it. */
  readonly s3tc: WEBGL_compressed_texture_s3tc | null;
}

export function textureSupport(gl: WebGL2RenderingContext): TextureSupport {
  return { s3tc: gl.getExtension('WEBGL_compressed_texture_s3tc') };
}

/** Values of {@link SampleLayout} as the `texelLayout` argument of `etchTexel`. */
export const SAMPLE_LAYOUT_CODES: Readonly<Record<SampleLayout, number>> = {
  rgba: 0,
  bgra: 1,
  bgrx: 2,
};

/**
 * GLSL ES 3.00 helpers for sampling a {@link GpuTexture}:
 * - `etchTexel(texel, texelLayout)` swizzles a sampled texel to RGBA, with
 *   `texelLayout` from {@link SAMPLE_LAYOUT_CODES}.
 * - `etchImageUv(uv, size, storedSize)` maps image UVs to texture UVs and
 *   clamps them to the centres of the image's edge texels. On a padded
 *   texture this samples exactly as `CLAMP_TO_EDGE` on an unpadded one, so
 *   linear filtering never reads the padding.
 */
export const TEXTURE_GLSL = `
vec4 etchTexel(vec4 texel, int texelLayout) {
  if (texelLayout == 1) return texel.bgra;
  if (texelLayout == 2) return vec4(texel.bgr, 1.0);
  return texel;
}
vec2 etchImageUv(vec2 uv, vec2 size, vec2 storedSize) {
  return clamp(uv * size, vec2(0.5), size - 0.5) / storedSize;
}
`;

/**
 * Uploads the first mip level of an image into a new texture with one level
 * and clamp-to-edge wrapping; samplers set the filtering. DXT stays
 * compressed when the context has S3TC and is decoded on the CPU otherwise.
 * Leaves the new texture bound to `TEXTURE_2D` of the active unit and the
 * unpack state at alignment 1, no flip, no premultiplication.
 */
export function uploadTexture(
  gl: WebGL2RenderingContext,
  image: TextureImage,
  support: TextureSupport,
): GpuTexture {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  const { width, height } = image;
  const result = (
    storedWidth: number,
    storedHeight: number,
    layout: SampleLayout,
    path: UploadPath,
    bytes: number,
  ): GpuTexture => ({
    texture,
    width,
    height,
    storedWidth,
    storedHeight,
    uvScale: [width / storedWidth, height / storedHeight],
    layout,
    path,
    bytes,
  });

  if (image.kind === 'dxt') {
    if (support.s3tc !== null) {
      const storedWidth = Math.ceil(width / 4) * 4;
      const storedHeight = Math.ceil(height / 4) * 4;
      const format = s3tcFormat(support.s3tc, image.format);
      gl.compressedTexImage2D(gl.TEXTURE_2D, 0, format, storedWidth, storedHeight, 0, image.data);
      return result(storedWidth, storedHeight, 'rgba', 'compressed', image.data.byteLength);
    }
    const rgba = decodeDxt(image.format, width, height, image.data);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    return result(width, height, 'rgba', 'cpu-dxt', rgba.byteLength);
  }

  if (image.layout === 'bgr') {
    // Sampled as (B, G, R, 1); the shader swaps it like BGRA.
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB8,
      width,
      height,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      image.data,
    );
    return result(width, height, 'bgra', 'pixels', width * height * 4);
  }
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    image.data,
  );
  return result(width, height, image.layout, 'pixels', image.data.byteLength);
}

function s3tcFormat(s3tc: WEBGL_compressed_texture_s3tc, format: DxtFormat): number {
  switch (format) {
    case 'DXT1':
      // With 1-bit alpha: Direct3D's DXT1 has transparent texels when c0 <= c1.
      return s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT;
    case 'DXT3':
      return s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT;
    case 'DXT5':
      return s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT;
  }
}
