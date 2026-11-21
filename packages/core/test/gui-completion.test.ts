import { describe, expect, it } from 'vitest';
import {
  GuiVocabulary,
  guiCompletionAt,
  parseScript,
  readGuiFile,
  type GuiCompletionContext,
} from '../src/index.ts';

/** The context at the `|` of a text, which is taken out first. */
function at(marked: string): GuiCompletionContext | undefined {
  const offset = marked.indexOf('|');
  return guiCompletionAt(marked.slice(0, offset) + marked.slice(offset + 1), offset);
}

describe('guiCompletionAt', () => {
  it('reads a sprite, a font and other values of a widget', () => {
    expect(at('guiTypes = {\n\ticonType = {\n\t\tspriteType = "GFX_et|\n\t}\n}')).toEqual({
      kind: 'sprite',
      widget: 'iconType',
      key: 'spritetype',
      start: 43,
      end: 49,
      quoted: true,
      closed: false,
    });
    const quad = at('guiTypes = { guiButtonType = { quadTextureSprite = "GFX_|x" } }');
    expect(quad).toMatchObject({ kind: 'sprite', end: 57, quoted: true, closed: true });
    expect(at('guiTypes = { listboxType = { background = | } }')).toMatchObject({
      kind: 'sprite',
      widget: 'listboxType',
      quoted: false,
    });
    expect(at('guiTypes = { instantTextBoxType = { font = "vic|" } }')).toMatchObject({
      kind: 'font',
      key: 'font',
    });
    expect(at('guiTypes = { iconType = { Orientation = up| } }')).toMatchObject({
      kind: 'value',
      key: 'orientation',
      start: 40,
      end: 42,
    });
    // An `if_resolution` block is the widget's too.
    const resolution =
      'guiTypes = { iconType = { if_resolution = { min_height = 1 spriteType = | } } }';
    expect(at(resolution)).toMatchObject({ kind: 'sprite', widget: 'iconType' });
  });

  it('reads a key inside a widget and a widget type inside guiTypes', () => {
    expect(at('guiTypes = {\n\twindowType = {\n\t\tname = "w"\n\t\tico|\n\t}\n}')).toEqual({
      kind: 'key',
      widget: 'windowType',
      start: 44,
      end: 47,
    });
    expect(at('guiTypes = {\n\t|\n}')).toEqual({
      kind: 'key',
      widget: undefined,
      start: 14,
      end: 14,
    });
    expect(at('guiTypes = { windowType = { na|me = "w" } }')).toMatchObject({ start: 28, end: 32 });
  });

  it('offers nothing outside a widget, in a nested block, in a comment or after a bare =', () => {
    expect(at('|')).toBeUndefined();
    expect(at('guiTypes = { iconType = { position = { x| = 0 } } }')).toBeUndefined();
    expect(at('guiTypes = { iconType = { position = { x = | } } }')).toBeUndefined();
    expect(at('guiTypes = { iconType = { # spriteType = "| } }')).toBeUndefined();
    expect(at('guiTypes = { iconType = { spriteType =\n\t\t| } }')).toBeUndefined();
    expect(at('bitmapfonts = { |  }')).toBeUndefined();
  });
});

describe('GuiVocabulary', () => {
  const file = (text: string) => readGuiFile(parseScript(text));
  const vocabulary = GuiVocabulary.of([
    file(`guiTypes = {
	windowType = {
		name = "a"
		position = { x = 0 y = 0 }
		iconType = { name = "i1" spriteType = "GFX_a" alwaysTransparent = yes orientation = "UPPER_LEFT" }
		iconType = { name = "i2" spriteType = "GFX_b" alwaysTransparent = no scale = 0.5 }
		guiButtonType = { name = "b" clicksound = click format = centre }
	}
}`),
    file(`guiTypes = {
	windowType = { name = "b" iconType = { name = "i3" alwaysTransparent = yes scale = 2 } }
	iconType = { name = "top" spriteType = "GFX_c" }
}`),
  ]);

  it('counts the widget types at the top and inside each type', () => {
    expect(vocabulary.topKinds()).toEqual([
      { written: 'windowType', count: 2 },
      { written: 'iconType', count: 1 },
    ]);
    expect(vocabulary.childKinds('windowType')).toEqual([
      { written: 'iconType', count: 3 },
      { written: 'guiButtonType', count: 1 },
    ]);
    expect(vocabulary.childKinds('iconType')).toEqual([]);
  });

  it('counts the keys of a widget type, with whether they take a block', () => {
    expect(vocabulary.keys('windowType')).toEqual([
      { written: 'name', count: 2, block: false },
      { written: 'position', count: 1, block: true },
    ]);
    expect(vocabulary.keys('iconType').map((k) => [k.written, k.count])).toEqual([
      ['name', 4],
      ['alwaysTransparent', 3],
      ['spriteType', 3],
      ['scale', 2],
      ['orientation', 1],
    ]);
  });

  it('offers a closed set of words, the anchors for orientation, and no numbers', () => {
    expect(vocabulary.values('iconType', 'alwaystransparent')).toEqual([
      { written: 'yes', count: 2, quoted: false },
      { written: 'no', count: 1, quoted: false },
    ]);
    expect(vocabulary.values('iconType', 'scale')).toEqual([]);
    const anchors = vocabulary.values('iconType', 'orientation');
    expect(anchors[0]).toEqual({ written: 'UPPER_LEFT', count: 1, quoted: true });
    expect(anchors.map((a) => a.written)).toContain('CENTER_DOWN');
    expect(anchors).toHaveLength(9);
    expect(vocabulary.values('guiButtonType', 'format')).toEqual([
      { written: 'centre', count: 1, quoted: false },
    ]);
  });
});
