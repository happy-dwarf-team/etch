// The picture of a font's hover: a line of sample text in the font, its glyphs cut from the font's
// texture and tinted with its `color` as the preview's text shader does (with the `border_color`
// edge of a font that has one), on a plain background that the colour stands out from. A small
// font is drawn at 2× with sharp pixels. No `vscode` here, so the unit tests run it.

import { layoutText, type BmFont } from '@etch/core';

/** The text the hover shows; Windows-1252, as the game's fonts are. */
export const SAMPLE_TEXT = 'Aa Bb Cc 0123';
/** A font whose lines are at most this many pixels high is drawn at 2×. */
export const SMALL_LINE = 16;
/** The space around the text, in pixels of the font. */
export const PADDING = 4;
/** The backgrounds: dark behind a light colour, light behind a dark one. */
export const DARK_BACKGROUND = 0x26;
export const LIGHT_BACKGROUND = 0xd8;

export interface Atlas {
  readonly width: number;
  readonly height: number;
  /** Straight RGBA, top row first. */
  readonly rgba: Uint8Array;
}

export interface FontSample {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  /** 2 for a small font, else 1. */
  readonly scale: number;
  /** How many different characters of the text the font has no glyph for. */
  readonly missing: number;
}

const OPAQUE_WHITE = 0xffffffff;

/**
 * The sample text laid out in the font, as the layout lays out a text box's, drawn from the
 * atlas: each texel times the colour (`0xAARRGGBB`), and with a border colour whose alpha is not
 * 0, the glyph's thin edge in the border colour, as `text.shader` draws it.
 */
export function fontSample(
  font: BmFont,
  atlas: Atlas,
  colour: number = OPAQUE_WHITE,
  border?: number,
  text: string = SAMPLE_TEXT,
): FontSample {
  const laid = layoutText(
    font,
    text,
    { x: PADDING, y: PADDING, width: 0 },
    {
      colours: { base: colour },
    },
  );
  let right = PADDING;
  let bottom = PADDING + font.lineHeight;
  for (const glyph of laid.glyphs) {
    right = Math.max(right, glyph.x + glyph.width);
    bottom = Math.max(bottom, glyph.y + glyph.height);
  }
  const scale = font.lineHeight > 0 && font.lineHeight <= SMALL_LINE ? 2 : 1;
  const width = Math.ceil(right + PADDING);
  const height = Math.ceil(bottom + PADDING);
  const back = luma(colour) > 0.5 ? DARK_BACKGROUND : LIGHT_BACKGROUND;
  // Premultiplied, as the preview blends text over what is under it.
  const out = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out.set([back / 255, back / 255, back / 255, 1], i * 4);
  }
  const borderRgba = border !== undefined && border >>> 24 !== 0 ? unpack(border) : undefined;
  for (const glyph of laid.glyphs) {
    const tint = unpack(glyph.colour);
    for (let dy = 0; dy < glyph.height; dy++) {
      for (let dx = 0; dx < glyph.width; dx++) {
        const ax = glyph.atlasX + dx;
        const ay = glyph.atlasY + dy;
        const x = Math.round(glyph.x + dx);
        const y = Math.round(glyph.y + dy);
        if (ax < 0 || ay < 0 || ax >= atlas.width || ay >= atlas.height) continue;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const from = (ay * atlas.width + ax) * 4;
        const t = [0, 1, 2, 3].map((c) => (atlas.rgba[from + c] ?? 0) / 255) as Rgba;
        const c = shade(t, tint, borderRgba);
        const to = (y * width + x) * 4;
        const a = Math.min(1, Math.max(0, c[3]));
        for (let channel = 0; channel < 3; channel++) {
          const value = Math.min(1, Math.max(0, c[channel] ?? 0)) * a;
          out[to + channel] = value + (out[to + channel] ?? 0) * (1 - a);
        }
      }
    }
  }
  const missing = laid.issues.filter((issue) => issue.code === 'missing-glyph').length;
  return { ...enlarge(width, height, out, scale), scale, missing };
}

type Rgba = [number, number, number, number];

/** `text.shader`'s pixel colour, straight: the texel times the colour, or the border's edge. */
function shade(t: Rgba, colour: Rgba, border: Rgba | undefined): Rgba {
  const c: Rgba = [t[0] * colour[0], t[1] * colour[1], t[2] * colour[2], t[3] * colour[3]];
  if (border === undefined) return c;
  if (t[3] < border[3] * 0.75) {
    return [border[0] * t[0], border[1] * t[1], border[2] * t[2], colour[3] * t[3]];
  }
  if (t[3] < border[3]) {
    const mix = (b: number, v: number): number => b + (v - b) * t[3];
    return [
      mix(border[0], colour[0]) * t[0],
      mix(border[1], colour[1]) * t[1],
      mix(border[2], colour[2]) * t[2],
      colour[3] * t[3],
    ];
  }
  return c;
}

function unpack(argb: number): Rgba {
  return [
    ((argb >>> 16) & 0xff) / 255,
    ((argb >>> 8) & 0xff) / 255,
    (argb & 0xff) / 255,
    ((argb >>> 24) & 0xff) / 255,
  ];
}

function luma(argb: number): number {
  const [r, g, b] = unpack(argb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The premultiplied picture, opaque, as 8-bit RGBA at `scale`× with sharp pixels. */
function enlarge(
  width: number,
  height: number,
  pixels: Float32Array,
  scale: number,
): { width: number; height: number; rgba: Uint8Array } {
  const outWidth = width * scale;
  const outHeight = height * scale;
  const rgba = new Uint8Array(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const from = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 4;
      const to = (y * outWidth + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        rgba[to + channel] = Math.round((pixels[from + channel] ?? 0) * 255);
      }
      rgba[to + 3] = 255;
    }
  }
  return { width: outWidth, height: outHeight, rgba };
}
