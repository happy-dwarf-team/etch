import { describe, expect, it } from 'vitest';
import { formatGfxColour, gfxColours } from '../src/index.ts';

// The shapes of vanilla's `interface/core.gfx` (`bitmapfonts`), with the names changed.
const GFX = `bitmapfonts = {
	textcolors = {
		W = { 255 255 255 }	# white
		G = { 0 255 0 }
		X = { 300 0 0 }
	}
	bitmapfont = {
		name = "etch_font"
		path = "gfx/fonts/etch"
		color = 0xffcc8800
		border_color = 0x80000000
		textcolors = {
			G = { 24 112 26 }
		}
	}
}
objectTypes = {
	etch_object = { color = { 0.0 0.5 0.0 } }
}
`;

describe('gfxColours', () => {
  it('finds the colours the model reads, with their channels and form', () => {
    const colours = gfxColours(GFX);
    expect(colours.map((c) => [GFX.slice(c.start, c.end), c.rgba, c.form])).toEqual([
      ['{ 255 255 255 }', [255, 255, 255, 255], 'rgb'],
      ['{ 0 255 0 }', [0, 255, 0, 255], 'rgb'],
      ['0xffcc8800', [204, 136, 0, 255], 'hex'],
      ['0x80000000', [0, 0, 0, 128], 'hex'],
      ['{ 24 112 26 }', [24, 112, 26, 255], 'rgb'],
    ]);
  });

  it('writes a colour back in its form', () => {
    expect(formatGfxColour('rgb', [35, 206, 255, 255])).toBe('{ 35 206 255 }');
    expect(formatGfxColour('rgb', [35.4, 300, -1, 10])).toBe('{ 35 255 0 }');
    expect(formatGfxColour('hex', [204, 136, 0, 255])).toBe('0xffcc8800');
    expect(formatGfxColour('hex', [0, 0, 0, 128])).toBe('0x80000000');
  });
});
