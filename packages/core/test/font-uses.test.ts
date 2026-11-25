import { describe, expect, it } from 'vitest';
import { gfxFontReferences, guiFontReferences, parseScript, readGuiFile } from '../src/index.ts';

const GUI = `@title_font = "vic_22"
guiTypes = {
	windowType = {
		name = "etch_window"
		instantTextBoxType = { name = "title" font = @title_font }
		guiButtonType = { name = "ok" buttonFont = "vic_18" }
		instantTextBoxType = {
			name = "small"
			font = vic_18
			if_resolution = { min_width = 1920 font = "vic_22" }
		}
		instantTextBoxType = { name = "empty" font = "" }
		iconType = { name = "icon" spriteType = "vic_18" }
	}
}
`;

const GFX = `bitmapfonts = {
	bitmapfont = { name = "Main_14_bold" path = "gfx/fonts/Main_14_bold" }
}
objectTypes = {
	animatedmaptext = {
		name = "MessageMapText"
		textblock = {
			text = "test!"
			font = "Main_14_bold"
		}
	}
	animatedmaptext = {
		name = "Other"
		font = "not_in_a_textblock"
		textblock = { font = vic_18 }
	}
}
`;

function texts(text: string, refs: { node: { start: number; end: number } }[]): string[] {
  return refs.map(({ node }) => text.slice(node.start, node.end));
}

describe('guiFontReferences', () => {
  it("lists every widget's font and buttonFont, through constants and if_resolution", () => {
    const refs = guiFontReferences(readGuiFile(parseScript(GUI)));
    expect(refs.map((r) => r.name)).toEqual(['vic_22', 'vic_18', 'vic_18', 'vic_22']);
    expect(texts(GUI, refs)).toEqual(['@title_font', '"vic_18"', 'vic_18', '"vic_22"']);
  });
});

describe('gfxFontReferences', () => {
  it("lists the font of each objectTypes entry's textblock, nothing else", () => {
    const refs = gfxFontReferences(parseScript(GFX));
    expect(refs.map((r) => r.name)).toEqual(['Main_14_bold', 'vic_18']);
    expect(texts(GFX, refs)).toEqual(['"Main_14_bold"', 'vic_18']);
  });
});
