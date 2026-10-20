import { TEXTURE_GLSL } from '../textures/gpu.ts';

/** Values of the `kind` uniform. */
export const KIND = { sprite: 0, masked: 1, progress: 2, text: 3 } as const;

/** Values of the `op` uniform, one per {@link TexelOp}. */
export const OP = { plain: 0, brighten: 1, darken: 2, grey: 3 } as const;

/**
 * Screen pixels to clip space, top left origin. No half-pixel shift: the game
 * compensates Direct3D 9's offset, so quads land where layout puts them
 * (etch#9).
 */
export const VERTEX_SHADER = `#version 300 es
in vec2 position;
in vec2 uv;
in vec2 uv2;
in vec4 colour;
uniform vec2 screen;
out vec2 vUv;
out vec2 vUv2;
out vec4 vColour;
void main() {
  gl_Position = vec4(position.x / screen.x * 2.0 - 1.0, 1.0 - position.y / screen.y * 2.0, 0.0, 1.0);
  vUv = uv;
  vUv2 = uv2;
  vColour = colour;
}
`;

/**
 * One program for every draw kind; uniforms pick the game shader's pixel
 * code. Each branch ports the HLSL of the matching `gfx/FX/*.shader`:
 *
 * - sprite (`buttonstate*`, `button_overlay`, default): the texel, the
 *   effect's change to RGB, times the colour.
 * - masked (`maskedflag*`): the flag's colour with the mask's alpha, then as a
 *   sprite. The colonial cut-off is code-filled and left out.
 * - progress: the first fill where `u <= CurrentState`, else the second;
 *   vertical bars compare `1 − v`. The game flips `v` in its vertex shader and
 *   samples with wrapping; that its quads run `v` from 1 at the top, so that
 *   textures stay upright and vertical bars fill upwards, is a hypothesis.
 * - text: `text.shader`'s `PixelShaderText` with the font's border colour;
 *   `ModColor` is taken as white.
 *
 * Samples use LOD 0, so a sampler's magnification filter applies at 1:1,
 * which is how glyphs are drawn; every shader but `text` uses the same filter
 * both ways. Output is clamped as a UNORM target clamps and premultiplied, so
 * that `ONE, ONE_MINUS_SRC_ALPHA` blending equals the game's
 * `src_alpha, inv_src_alpha` over any background.
 */
export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform int kind;
uniform int op;
uniform sampler2D image0;
uniform sampler2D image1;
// xy: image size, zw: stored size, in texels.
uniform vec4 size0;
uniform vec4 size1;
uniform ivec2 texelLayouts;
uniform bvec2 wrap;
uniform bool repeatSource;
// xy: origin, zw: size, in texels of image0.
uniform vec4 sourceRect;
uniform float progress;
uniform bool vertical;
uniform bvec2 fillIsColour;
uniform vec4 fillColour0;
uniform vec4 fillColour1;
uniform vec4 border;
in vec2 vUv;
in vec2 vUv2;
in vec4 vColour;
out vec4 fragColour;
${TEXTURE_GLSL}
const vec3 LUMA = vec3(0.212671, 0.715160, 0.072169);

vec2 textureUv(vec2 imageUv, vec4 size, bool wrapMode) {
  return wrapMode ? fract(imageUv) * size.xy / size.zw : etchImageUv(imageUv, size.xy, size.zw);
}

vec4 sample0(vec2 imageUv) {
  return etchTexel(textureLod(image0, textureUv(imageUv, size0, wrap.x), 0.0), texelLayouts.x);
}

vec4 sample1(vec2 imageUv) {
  return etchTexel(textureLod(image1, textureUv(imageUv, size1, wrap.y), 0.0), texelLayouts.y);
}

vec3 applyOp(vec3 rgb) {
  if (op == ${String(OP.brighten)}) return rgb + 0.1;
  if (op == ${String(OP.darken)}) return rgb - 0.1;
  if (op == ${String(OP.grey)}) return vec3(dot(rgb, LUMA));
  return rgb;
}

void main() {
  vec4 c;
  if (kind == ${String(KIND.progress)}) {
    vec4 first = fillIsColour.x ? fillColour0 : sample0(vUv);
    vec4 second = fillIsColour.y ? fillColour1 : sample1(vUv);
    bool filled = vertical ? 1.0 - vUv.y <= progress : vUv.x <= progress;
    c = filled ? first : second;
  } else if (kind == ${String(KIND.text)}) {
    vec4 t = sample0(vUv / size0.xy);
    c = t * vColour;
    if (t.a < border.a * 0.75) {
      c = vec4(border.rgb, vColour.a) * t;
    } else if (t.a < border.a) {
      c = vec4(mix(border.rgb, vColour.rgb, t.a), vColour.a) * t;
    }
  } else {
    vec2 texel = vUv;
    if (repeatSource) texel = sourceRect.xy + mod(texel - sourceRect.xy, sourceRect.zw);
    vec4 t = sample0(texel / size0.xy);
    if (kind == ${String(KIND.masked)}) t.a = sample1(vUv2 / size1.xy).a;
    c = vec4(applyOp(t.rgb), t.a) * vColour;
  }
  c = clamp(c, 0.0, 1.0);
  fragColour = vec4(c.rgb * c.a, c.a);
}
`;
