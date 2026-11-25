import { describe, expect, it } from 'vitest';
import {
  GUI_ROOT_PLACE,
  GuiVocabulary,
  guiCompletionAt,
  parseScript,
  readGuiFile,
  type GuiCompletionContext,
  type GuiPlace,
} from '../src/index.ts';

/** The context at the `|` of a text, which is taken out first. */
function at(marked: string): GuiCompletionContext | undefined {
  const offset = marked.indexOf('|');
  return guiCompletionAt(marked.slice(0, offset) + marked.slice(offset + 1), offset);
}

const widget = (schema: string, written: string, resolution = false): GuiPlace =>
  ({ kind: 'widget', schema, written, resolution }) as GuiPlace;

describe('guiCompletionAt', () => {
  it('reads a sprite, a font and other values of a widget', () => {
    expect(at('guiTypes = {\n\ticonType = {\n\t\tspriteType = "GFX_et|\n\t}\n}')).toEqual({
      kind: 'sprite',
      schema: 'icon',
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
      schema: 'listBox',
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
    expect(at(resolution)).toMatchObject({ kind: 'sprite', schema: 'icon' });
    // A widget Etch does not draw still has the keys the game reads.
    expect(at('guiTypes = { windowType = { browserType = { spriteType = | } } }')).toMatchObject({
      kind: 'sprite',
      schema: 'browser',
    });
  });

  it('reads a key inside a widget, a value block, and a widget type inside guiTypes', () => {
    expect(at('guiTypes = {\n\twindowType = {\n\t\tname = "w"\n\t\tico|\n\t}\n}')).toEqual({
      kind: 'key',
      place: widget('window', 'windowType'),
      start: 44,
      end: 47,
    });
    expect(at('guiTypes = {\n\t|\n}')).toEqual({
      kind: 'key',
      place: GUI_ROOT_PLACE,
      start: 14,
      end: 14,
    });
    expect(at('guiTypes = { windowType = { na|me = "w" } }')).toMatchObject({ start: 28, end: 32 });
    expect(at('guiTypes = { iconType = { position = { x| = 0 } } }')).toMatchObject({
      kind: 'key',
      place: { kind: 'block', block: 'point', written: 'position' },
    });
    expect(at('guiTypes = { containerWindowType = { if_resolution = { | } } }')).toMatchObject({
      place: widget('containerWindow', 'containerWindowType', true),
    });
  });

  it('offers nothing outside what the game reads, in a comment or after a bare =', () => {
    expect(at('|')).toBeUndefined();
    expect(at('guiTypes = { iconType = { position = { x = | } } }')).toBeUndefined();
    expect(at('guiTypes = { iconType = { # spriteType = "| } }')).toBeUndefined();
    expect(at('guiTypes = { iconType = { spriteType =\n\t\t| } }')).toBeUndefined();
    expect(at('bitmapfonts = { |  }')).toBeUndefined();
    // The game creates no `guiButtonType` in a `containerWindowType`, and no `fooType` anywhere.
    expect(at('guiTypes = { containerWindowType = { guiButtonType = { | } } }')).toBeUndefined();
    expect(at('guiTypes = { fooType = { | } }')).toBeUndefined();
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
		listboxType = { name = "l" }
	}
}`),
    file(`guiTypes = {
	windowType = { name = "b" iconType = { name = "i3" alwaysTransparent = yes scale = 2 } }
	iconType = { name = "top" spriteType = "GFX_c" }
}`),
  ]);

  it('offers every widget guiTypes holds, the ones the playset writes first', () => {
    const keys = vocabulary.keys(GUI_ROOT_PLACE);
    expect(keys.slice(0, 2).map((k) => [k.written, k.count])).toEqual([
      ['windowType', 2],
      ['iconType', 1],
    ]);
    expect(keys).toHaveLength(20);
    expect(keys.every((k) => k.widget !== undefined && k.block)).toBe(true);
  });

  it("offers exactly a window's keys and children, in the playset's spelling", () => {
    const keys = vocabulary.keys(widget('window', 'windowType'));
    const written = keys.map((k) => k.written);
    expect(written.slice(0, 5)).toEqual([
      'iconType',
      'name',
      'guiButtonType',
      'listboxType',
      'position',
    ]);
    for (const key of [
      'browserType',
      'dropDownBoxType',
      'multiSpriteButtonType',
      'tooltip',
      'tint',
      'parent',
      'scripted',
      'horizontalScrollbar',
      'verticalScrollbar',
      'if_resolution',
    ]) {
      expect(written).toContain(key);
    }
    // The table spells it `listBoxType`; the playset's spelling wins.
    expect(written).not.toContain('listBoxType');
    expect(written).not.toContain('buttontype');
    expect(keys.find((k) => k.written === 'position')).toMatchObject({ block: true, count: 1 });
    expect(keys.find((k) => k.written === 'scripted')).toMatchObject({
      block: false,
      value: 'bool',
    });
  });

  it('leaves out the keys an icon only logs, and offers the bounds inside if_resolution', () => {
    const icon = vocabulary.keys(widget('icon', 'iconType')).map((k) => k.written);
    expect(icon).not.toContain('text');
    expect(icon).not.toContain('font');
    const resolution = vocabulary.keys(widget('icon', 'iconType', true)).map((k) => k.written);
    expect(resolution).toContain('min_width');
    expect(resolution).not.toContain('if_resolution');
    expect(resolution).not.toContain('name');
    const container = vocabulary.keys(widget('containerWindow', 'containerWindowType'));
    expect(container.map((k) => k.written)).toContain('buttontype');
    expect(container.map((k) => k.written)).not.toContain('guiButtonType');
  });

  it("offers an enum's words, yes and no, a closed set of words, and no numbers", () => {
    expect(vocabulary.values('icon', 'alwaystransparent')).toEqual([
      { written: 'yes', count: 2, quoted: false },
      { written: 'no', count: 1, quoted: false },
    ]);
    expect(vocabulary.values('icon', 'scale')).toEqual([]);
    const anchors = vocabulary.values('icon', 'orientation');
    expect(anchors[0]).toEqual({ written: 'UPPER_LEFT', count: 1, quoted: true });
    expect(anchors.map((a) => a.written)).toContain('CENTER_DOWN');
    expect(anchors).toHaveLength(9);
    expect(vocabulary.values('containerWindow', 'orientation')).toHaveLength(7);
    expect(vocabulary.values('button', 'format').map((w) => w.written)).toEqual([
      'centre',
      'center',
      'left',
      'right',
    ]);
    expect(vocabulary.values('button', 'clicksound')).toEqual([
      { written: 'click', count: 1, quoted: false },
    ]);
  });
});
