/**
 * The draw list: what the extension host sends the webview to draw one
 * previewed window (ADR 0001, etch#8). Layout in `core` produces it; the
 * `renderer` package draws it with WebGL2. It is plain data, so it crosses
 * `postMessage` and JSON unchanged, and holds no images: the webview fetches
 * the textures it names itself.
 *
 * Conventions for every draw:
 * - Positions and sizes are pixels of the preview screen, origin at its top
 *   left, y down. They may be fractional; the renderer draws a quad exactly
 *   where it says, with no half-pixel shift, because the game compensates
 *   Direct3D 9's offset (verified in etch#9).
 * - Source rects in textures are texels of the image, origin at its top left.
 * - Colours are `0xAARRGGBB` numbers, straight alpha, as the text module uses.
 * - Draws are painted in array order, back to front, blended with
 *   `src_alpha`/`inv_src_alpha` as every GUI shader of the game does.
 */

import type { PlacedGlyph } from './text/layout.ts';

/** Changes whenever a draw list of the old shape would be drawn wrongly. */
export const DRAW_LIST_VERSION = 1;

export interface DrawList {
  readonly version: typeof DRAW_LIST_VERSION;
  /** The preview screen the window was laid out on, in pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * The texture files draws refer to by index. Layout fills in resolved file
   * paths; the extension maps each to the webview URI the renderer fetches
   * before it posts the list.
   */
  readonly textures: readonly string[];
  readonly draws: readonly Draw[];
}

export type Draw = SpriteDraw | MaskedDraw | ProgressDraw | TextDraw;

/** A screen rect, in pixels. */
export interface DrawRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A rect in a texture, in texels. */
export interface SourceRect {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

interface DrawBase {
  /**
   * UTF-16 offset of the start of the widget that produced the draw, in the
   * game text of its `.gui` file, for navigation from the preview to source.
   */
  readonly source: number;
}

/**
 * The shaders a sprite draws with, named as `effectFile` names them without
 * folder and extension (see {@link effectName}). `default` stands for sprites
 * without `effectFile`, whose real shader is unknown (docs/spec/after-v1.md).
 */
export const SPRITE_SHADERS = [
  'default',
  'buttonstate',
  'buttonstate_linear',
  'buttonstate_nodowneffect',
  'buttonstate_onlydisable',
  'button_overlay',
] as const;
export type SpriteShader = (typeof SPRITE_SHADERS)[number];

/** The shaders of `maskedShieldType` sprites. */
export const MASKED_SHADERS = ['maskedflag', 'maskedflag_greydown'] as const;
export type MaskedShader = (typeof MASKED_SHADERS)[number];

/**
 * The effect of a button shader, as the game picks it from the widget's
 * state. The shaders without such states ignore it.
 */
export type DrawEffect = 'up' | 'over' | 'down' | 'disable';

/** One sprite, or one frame of it: the source rect is the frame's cell. */
export interface SpriteDraw extends DrawBase, DrawRect, SourceRect {
  readonly kind: 'sprite';
  readonly texture: number;
  readonly shader: SpriteShader;
  /** Default `up`. */
  readonly effect?: DrawEffect;
  /** The shader's `Color` constant. Default opaque white. */
  readonly colour?: number;
  /**
   * Draw the source rect at its own size, repeated from the rect's top left,
   * instead of stretching it over the rect: the middle of a cornered tile.
   */
  readonly repeat?: boolean;
}

/**
 * A `maskedShieldType` sprite: the colours of `texture` (the flag) with the
 * alpha of `mask`. Its overlay is a separate sprite draw.
 */
export interface MaskedDraw extends DrawBase, DrawRect, SourceRect {
  readonly kind: 'masked';
  readonly texture: number;
  readonly mask: number;
  /** The mask's source rect, in texels of the mask. */
  readonly maskRect: SourceRect;
  readonly shader: MaskedShader;
  /** Default `up`. */
  readonly effect?: DrawEffect;
  /** The shader's `Color` constant. Default opaque white. */
  readonly colour?: number;
}

/** One side of a progress bar: a whole texture stretched over the bar, or a colour. */
export type ProgressFill = { readonly texture: number } | { readonly colour: number };

/**
 * A `progressbartype` drawn with `progress.shader`: `first` where the bar is
 * filled, `second` elsewhere.
 */
export interface ProgressDraw extends DrawBase, DrawRect {
  readonly kind: 'progress';
  readonly first: ProgressFill;
  readonly second: ProgressFill;
  /** How full the bar is, 0 to 1: the shader's `CurrentState`. */
  readonly value: number;
  /** Fill from the bottom up instead of from the left. */
  readonly vertical?: boolean;
}

/** Numbers per glyph in {@link TextDraw.glyphs}. */
export const GLYPH_STRIDE = 7;

/**
 * A glyph run in one font, drawn with `text.shader`. Each glyph is
 * {@link GLYPH_STRIDE} numbers: screen `x`, `y`, `width`, `height`, atlas
 * `atlasX`, `atlasY` (the atlas rect has the screen size) and `colour`, as
 * {@link packGlyphs} writes them from the text layout. Inline icons are
 * sprite draws.
 */
export interface TextDraw extends DrawBase {
  readonly kind: 'text';
  /** The font's atlas. */
  readonly texture: number;
  readonly glyphs: readonly number[];
  /** The font's `border_color`. Default transparent, which draws no border. */
  readonly border?: number;
}

/** Packs placed glyphs into a {@link TextDraw}'s `glyphs`. */
export function packGlyphs(glyphs: readonly PlacedGlyph[]): number[] {
  const packed = new Array<number>(glyphs.length * GLYPH_STRIDE);
  let i = 0;
  for (const g of glyphs) {
    packed[i++] = g.x;
    packed[i++] = g.y;
    packed[i++] = g.width;
    packed[i++] = g.height;
    packed[i++] = g.atlasX;
    packed[i++] = g.atlasY;
    packed[i++] = g.colour;
  }
  return packed;
}

/**
 * The shader an `effectFile` names: its base name in lower case, without the
 * `.lua` or `.shader` extension, which the game swaps (etch#3); `default`
 * when there is none. `"gfx//FX//maskedflag_greydown.lua"` names
 * `maskedflag_greydown`.
 */
export function effectName(effectFile: string | undefined): string {
  if (effectFile === undefined || effectFile.trim() === '') return 'default';
  const base =
    effectFile
      .trim()
      .split(/[/\\]+/)
      .pop() ?? '';
  return base.replace(/\.(lua|shader)$/i, '').toLowerCase();
}

export function isSpriteShader(name: string): name is SpriteShader {
  return (SPRITE_SHADERS as readonly string[]).includes(name);
}

export function isMaskedShader(name: string): name is MaskedShader {
  return (MASKED_SHADERS as readonly string[]).includes(name);
}
