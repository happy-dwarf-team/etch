import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GLYPH_STRIDE,
  InterfaceIndex,
  layoutWindow,
  parseBmFont,
  parseScript,
  readGfxFile,
  readGuiFile,
  readTextureSize,
  type AssetProblem,
  type Draw,
  type GuiFile,
  type LayoutInput,
  type TextureSize,
  type WindowLayout,
} from '../src/index.ts';

const TINY = parseBmFont(
  readFileSync(new URL('./fixtures/tiny.fnt', import.meta.url), 'utf8'),
).font;

const GFX = `
spriteTypes = {
  spriteType = { name = "GFX_plain" texturefile = "gfx/interface/plain.dds" }
  spriteType = { name = "GFX_strip" texturefile = "gfx//interface//strip.tga" noOfFrames = 4 effectFile = "gfx/FX/buttonstate.lua" }
  spriteType = { name = "GFX_target" texturefile = "gfx/interface/plain.dds" effectFile = "gfx/FX/gui_rendertarget.shader" }
  textSpriteType = { name = "GFX_button" texturefile = "gfx/interface/button.dds" }
  corneredTileSpriteType = { name = "GFX_tile" texturefile = "gfx/interface/tile.dds" borderSize = { x = 4 y = 2 } size = { x = 50 y = 30 } }
  progressbartype = {
    name = "GFX_bar" color = { 0 0.5 0 } colortwo = { 1 0 0 } size = { x = 10 y = 40 }
    textureFile1 = "gfx/interface/bar_green.dds" horizontal = no effectFile = "gfx/FX/progress.lua"
  }
  maskedShieldType = {
    name = "GFX_shield" textureFile1 = "gfx/interface/shield_frame.dds" textureFile2 = "gfx/interface/shield_mask.dds"
    effectFile = "gfx/FX/maskedflag.lua"
  }
  PieChartType = { name = "GFX_pie" size = { x = 20 y = 20 } }
  spriteType = { name = "GFX_text_gold" texturefile = "gfx/interface/gold.dds" }
}
bitmapfonts = {
  bitmapfont = { name = "tiny" path = "gfx/fonts/tiny" color = 0xff102030 border_color = 0xff000000 }
  textcolors = { G = { 0 255 0 } }
}`;

const TEXTURES: Record<string, TextureSize> = {
  'gfx/interface/plain.dds': { width: 20, height: 10 },
  'gfx/interface/strip.dds': { width: 64, height: 8 },
  'gfx/interface/button.dds': { width: 30, height: 12 },
  'gfx/interface/tile.dds': { width: 16, height: 8 },
  'gfx/interface/bar_green.dds': { width: 4, height: 4 },
  'gfx/interface/shield_frame.dds': { width: 24, height: 26 },
  'gfx/interface/shield_mask.dds': { width: 24, height: 26 },
  'gfx/interface/gold.dds': { width: 8, height: 8 },
  'gfx/fonts/tiny.dds': { width: 64, height: 64 },
};
const FONTS = new Set(['gfx/fonts/tiny.fnt']);

function setUp(
  guiText: string,
  options: {
    screen?: { width: number; height: number };
    missing?: Set<string>;
    problems?: Record<string, string>;
    localise?: (text: string) => string;
  } = {},
): { file: GuiFile; layout: (name?: string) => WindowLayout; input: LayoutInput } {
  const file = readGuiFile(parseScript(guiText));
  const index = InterfaceIndex.of(
    [{ path: 'interface/test.gfx', file: readGfxFile(parseScript(GFX)) }],
    [{ path: 'interface/test.gui', file }],
  );
  const known = new Set([...Object.keys(TEXTURES), ...FONTS]);
  const problem = (path: string): AssetProblem | undefined => {
    const text = options.problems?.[path];
    return text === undefined ? undefined : { problem: text };
  };
  const input: LayoutInput = {
    file,
    index,
    exists: (path) => known.has(path.toLowerCase()),
    assets: {
      textureSize: (path) =>
        options.missing?.has(path) === true ? undefined : (problem(path) ?? TEXTURES[path]),
      font: (path) => (options.missing?.has(path) === true ? undefined : (problem(path) ?? TINY)),
    },
    screen: options.screen ?? { width: 800, height: 600 },
    ...(options.localise === undefined ? {} : { localise: options.localise }),
  };
  const layout = (name?: string): WindowLayout => {
    const window =
      name === undefined ? file.definitions[0] : file.definitions.find((w) => w.name === name);
    if (window === undefined) throw new Error(`no window ${String(name)}`);
    return layoutWindow(window, input);
  };
  return { file, layout, input };
}

function rectOf(layout: WindowLayout, name: string): [number, number, number, number] {
  const w = layout.widgets.find((x) => x.widget.name === name);
  if (w === undefined) throw new Error(`no widget ${name}`);
  return [w.x, w.y, w.width, w.height];
}

function drawsOf(layout: WindowLayout, name: string): Draw[] {
  const w = layout.widgets.find((x) => x.widget.name === name);
  if (w === undefined) throw new Error(`no widget ${name}`);
  return layout.drawList.draws.slice(w.drawStart, w.drawEnd);
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  return items[0] as T;
}

describe('layoutWindow: placement', () => {
  it('anchors at the orientation point of the parent box and offsets the top-left corner', () => {
    const { layout } = setUp(`guiTypes = { windowType = {
      name = "w" position = { x = -200 y = 10 } size = { x = 200 y = 100 } orientation = UPPER_RIGHT
      iconType = { name = "ul" spriteType = "GFX_plain" position = { x = 1 y = 2 } }
      iconType = { name = "centre" spriteType = "GFX_plain" orientation = "CENTER" position = { x = -10 y = -5 } }
      iconType = { name = "lr" spriteType = "GFX_plain" Orientation = lower_right position = { x = -20 y = -10 } }
      iconType = { name = "cd" spriteType = "GFX_plain" orientation = center_down position = { x = 0 y = -10 } }
      windowType = { name = "inner" position = { x = 0 y = 50 } size = { width = 50% height = 100% }
        iconType = { name = "inner_icon" spriteType = "GFX_plain" orientation = upper_right position = { x = -20 y = 0 } }
      }
    } }`);
    const l = layout();
    expect(rectOf(l, 'w')).toEqual([600, 10, 200, 100]);
    // No orientation: upper left of the parent, not the parent's own upper right (etch#9).
    expect(rectOf(l, 'ul')).toEqual([601, 12, 20, 10]);
    expect(rectOf(l, 'centre')).toEqual([690, 55, 20, 10]);
    expect(rectOf(l, 'lr')).toEqual([780, 100, 20, 10]);
    expect(rectOf(l, 'cd')).toEqual([700, 100, 20, 10]);
    expect(rectOf(l, 'inner')).toEqual([600, 60, 100, 100]);
    expect(rectOf(l, 'inner_icon')).toEqual([680, 60, 20, 10]);
    expect(l.drawList).toMatchObject({ version: 1, width: 800, height: 600 });
    expect(l.diagnostics).toEqual([]);
  });

  it('gives a full-screen window the screen size and uses show_position', () => {
    const { layout } = setUp(`guiTypes = { windowType = {
      name = "full" fullScreen = yes size = { x = 10 y = 10 }
      windowType = { name = "panel" position = { x = 0 y = -1 } show_position = { x = 5 y = 6 } hide_position = { x = 0 y = -200 } }
    } }`);
    const l = layout();
    expect(rectOf(l, 'full')).toEqual([0, 0, 800, 600]);
    expect(rectOf(l, 'panel')).toEqual([5, 6, 0, 0]);
  });

  it('applies if_resolution blocks for the preview screen, in file order', () => {
    const text = `guiTypes = { windowType = {
      name = "w"
      iconType = { name = "i" spriteType = "GFX_plain" position = { x = 1 y = 1 }
        if_resolution = { min_height = 1000 position = { x = 100 y = 100 } }
        if_resolution = { max_width = 1500 spriteType = "GFX_button" }
      }
    } }`;
    const small = setUp(text, { screen: { width: 1280, height: 720 } }).layout();
    expect(rectOf(small, 'i')).toEqual([1, 1, 30, 12]);
    const large = setUp(text, { screen: { width: 1920, height: 1080 } }).layout();
    expect(rectOf(large, 'i')).toEqual([100, 100, 20, 10]);
  });

  it('reports orientations the game does not list and properties it does not apply', () => {
    const { layout } = setUp(`guiTypes = { windowType = { name = "w" size = { x = 100 y = 100 }
      iconType = { name = "odd" spriteType = "GFX_plain" orientation = "UPPERL_LEFT" position = { x = 3 y = 4 } }
      iconType = { name = "turned" spriteType = "GFX_plain" rotation = 1.5708 }
      iconType = { name = "flat" spriteType = "GFX_plain" rotation = 0 }
    } }`);
    const l = layout();
    expect(rectOf(l, 'odd')).toEqual([3, 4, 20, 10]);
    expect(l.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['unknown-orientation', 'information'],
      ['not-applied', 'information'],
    ]);
  });

  it('records every widget in paint order with its parent and draws', () => {
    const { layout } = setUp(`guiTypes = { windowType = { name = "w" backGround = "Background"
      iconType = { name = "front" spriteType = "GFX_plain" }
      guiButtonType = { name = "Background" quadTextureSprite = "GFX_button" }
      windowType = { name = "sub" iconType = { name = "deep" spriteType = "GFX_plain" } }
    } }`);
    const l = layout();
    // The named background is painted first, behind the widgets before it in the file (hypothesis).
    expect(l.widgets.map((w) => [w.widget.name, w.parent])).toEqual([
      ['w', -1],
      ['Background', 0],
      ['front', 0],
      ['sub', 0],
      ['deep', 3],
    ]);
    const textures = l.drawList.draws.map((d) =>
      d.kind === 'sprite' ? l.drawList.textures[d.texture] : d.kind,
    );
    expect(textures).toEqual([
      'gfx/interface/button.dds',
      'gfx/interface/plain.dds',
      'gfx/interface/plain.dds',
    ]);
    expect(l.drawList.textures).toEqual(['gfx/interface/button.dds', 'gfx/interface/plain.dds']);
    const front = only(drawsOf(l, 'front'));
    expect(front.source).toBe(l.widgets[2]?.widget.node.start);
  });
});

describe('layoutWindow: sprites', () => {
  it('draws one horizontal cell of a framed sprite, scaled, with its shader', () => {
    const { layout } = setUp(`guiTypes = { windowType = { name = "w"
      iconType = { name = "second" spriteType = "GFX_strip" frame = 2 scale = 0.5 position = { x = 4 y = 4 } }
      iconType = { name = "first" quadTextureSprite = "GFX_strip" }
      iconType = { name = "beyond" spriteType = "GFX_strip" frame = 9 }
    } }`);
    const l = layout();
    expect(only(drawsOf(l, 'second'))).toMatchObject({
      kind: 'sprite',
      x: 4,
      y: 4,
      width: 8,
      height: 4,
      sx: 16,
      sy: 0,
      sw: 16,
      sh: 8,
      shader: 'buttonstate',
    });
    // A `.tga` path that exists only as `.dds` draws the `.dds` (etch#33).
    expect(l.drawList.textures).toEqual(['gfx/interface/strip.dds']);
    expect(only(drawsOf(l, 'first'))).toMatchObject({ sx: 0, width: 16, height: 8 });
    expect(only(drawsOf(l, 'beyond'))).toMatchObject({ sx: 48 });
  });

  it('draws shaders the renderer does not port with the default shader and reports them', () => {
    const { layout } = setUp(
      'guiTypes = { windowType = { name = "w" iconType = { name = "rt" spriteType = "GFX_target" } } }',
    );
    const l = layout();
    expect(only(drawsOf(l, 'rt'))).toMatchObject({ shader: 'default' });
    expect(only(l.diagnostics)).toMatchObject({ code: 'unhandled-shader' });
  });

  it('cuts a cornered tile into corners at their size and repeating edges and middle', () => {
    const { layout } = setUp(`guiTypes = { windowType = { name = "w"
      guiButtonType = { name = "sized" quadTextureSprite = "GFX_tile" size = { x = 40 y = 20 } position = { x = 10 y = 10 } }
      iconType = { name = "own" spriteType = "GFX_tile" }
    } }`);
    const l = layout();
    expect(rectOf(l, 'sized')).toEqual([10, 10, 40, 20]);
    const pieces = drawsOf(l, 'sized').map((d) =>
      d.kind === 'sprite'
        ? [d.x, d.y, d.width, d.height, d.sx, d.sy, d.sw, d.sh, d.repeat === true]
        : [],
    );
    expect(pieces).toEqual([
      [10, 10, 4, 2, 0, 0, 4, 2, false],
      [14, 10, 32, 2, 4, 0, 8, 2, true],
      [46, 10, 4, 2, 12, 0, 4, 2, false],
      [10, 12, 4, 16, 0, 2, 4, 4, true],
      [14, 12, 32, 16, 4, 2, 8, 4, true],
      [46, 12, 4, 16, 12, 2, 4, 4, true],
      [10, 28, 4, 2, 0, 6, 4, 2, false],
      [14, 28, 32, 2, 4, 6, 8, 2, true],
      [46, 28, 4, 2, 12, 6, 4, 2, false],
    ]);
    // Without a widget size, the sprite's own `size`.
    expect(rectOf(l, 'own')).toEqual([0, 0, 50, 30]);
  });

  it('stretches a cornered-tile background over its container', () => {
    const { layout } = setUp(`guiTypes = {
      containerWindowType = { name = "c" size = { width = 60 height = 40 }
        background = { name = "bg" quadTextureSprite = "GFX_tile" }
      }
      windowType = { name = "w" size = { x = 70 y = 20 } background = "bg"
        iconType = { name = "bg" spriteType = "GFX_tile" }
      }
    }`);
    expect(rectOf(layout('c'), 'bg')).toEqual([0, 0, 60, 40]);
    expect(rectOf(layout('w'), 'bg')).toEqual([0, 0, 70, 20]);
  });

  it('draws an empty progress bar of the sprite size, with texture or colour fills', () => {
    const { layout } = setUp(
      'guiTypes = { windowType = { name = "w" iconType = { name = "bar" spriteType = "GFX_bar" position = { x = 2 y = 3 } } } }',
    );
    const l = layout();
    expect(only(drawsOf(l, 'bar'))).toEqual({
      kind: 'progress',
      source: l.widgets[1]?.widget.node.start,
      x: 2,
      y: 3,
      width: 10,
      height: 40,
      first: { texture: 0 },
      second: { colour: 0xffff0000 },
      value: 0,
      vertical: true,
    });
  });

  it('draws a shield as its overlay alone and a chart as nothing', () => {
    const { layout } = setUp(`guiTypes = { windowType = { name = "w"
      shieldtype = { name = "shield" spriteType = "GFX_shield" position = { x = 5 y = 5 } }
      guiButtonType = { name = "flag" quadTextureSprite = "GFX_shield" scale = 0.5 }
      iconType = { name = "pie" spriteType = "GFX_pie" }
    } }`);
    const l = layout();
    expect(only(drawsOf(l, 'shield'))).toMatchObject({
      kind: 'sprite',
      x: 5,
      y: 5,
      width: 24,
      height: 26,
      shader: 'default',
    });
    expect(rectOf(l, 'flag')).toEqual([0, 0, 12, 13]);
    expect(drawsOf(l, 'pie')).toEqual([]);
    expect(rectOf(l, 'pie')).toEqual([0, 0, 20, 20]);
    expect(l.drawList.textures).toEqual(['gfx/interface/shield_frame.dds']);
  });

  it('leaves code-filled boxes empty and places no scroll bar parts', () => {
    const { layout } = setUp(`guiTypes = { windowType = { name = "w" size = { x = 100 y = 100 }
      listboxType = { name = "list" position = { x = 10 y = 10 } size = { x = 50 y = 60 } background = "GFX_tile" }
      gridBoxType = { name = "grid" size = { width = 30 height = 30 } slotsize = { width = 10 height = 10 } }
      OverlappingElementsBoxType = { name = "row" size = { x = 40 y = 10 } }
      positionType = { name = "point" position = { x = 7 y = 8 } }
      scrollbarType = { name = "bar" size = { x = 10 y = 50 } guiButtonType = { name = "slider" quadTextureSprite = "GFX_plain" } }
    } }`);
    const l = layout();
    expect(rectOf(l, 'list')).toEqual([10, 10, 50, 60]);
    // Hypothesis: a list's `background` sprite is drawn behind its empty rows, over its box.
    expect(drawsOf(l, 'list')).toHaveLength(9);
    expect(rectOf(l, 'grid')).toEqual([0, 0, 30, 30]);
    expect(rectOf(l, 'row')).toEqual([0, 0, 40, 10]);
    expect(rectOf(l, 'point')).toEqual([7, 8, 0, 0]);
    expect(l.widgets.map((w) => w.widget.name)).not.toContain('slider');
  });
});

describe('layoutWindow: text', () => {
  it('lays out a text box in its border, localised and aligned, in the font colour', () => {
    const { layout } = setUp(
      `guiTypes = { windowType = { name = "w" position = { x = 10 y = 20 }
        instantTextBoxType = { name = "t" font = "tiny" text = "KEY" format = centre
          maxWidth = 40 maxHeight = 20 borderSize = { x = 2 y = 3 } }
      } }`,
      { localise: (text) => (text === 'KEY' ? 'A§GV§!' : text) },
    );
    const l = layout();
    expect(rectOf(l, 't')).toEqual([10, 20, 40, 20]);
    const text = only(drawsOf(l, 't'));
    if (text.kind !== 'text') throw new Error('expected text');
    expect(l.drawList.textures[text.texture]).toBe('gfx/fonts/tiny.dds');
    expect(text.border).toBe(0xff000000);
    expect(text.glyphs).toHaveLength(2 * GLYPH_STRIDE);
    // "AV" is 10 px wide with kerning: centred at 10 + round(30 / 2), 3 px below the top.
    expect(text.glyphs.slice(0, GLYPH_STRIDE)).toEqual([25, 24, 6, 8, 0, 0, 0xff102030]);
    expect(text.glyphs.slice(GLYPH_STRIDE)).toEqual([29, 24, 6, 8, 7, 0, 0xff00ff00]);
  });

  it('centres button text in the button without rounding', () => {
    const { layout } = setUp(`guiTypes = { windowType = { name = "w"
      guiButtonType = { name = "b" quadTextureSprite = "GFX_button" buttonText = "a" buttonFont = "tiny" position = { x = 1 y = 1 } }
      checkboxType = { name = "c" quadTextureSprite = "GFX_button" buttonText = "a" buttonFont = "tiny" format = left }
    } }`);
    const l = layout();
    const [sprite, text] = drawsOf(l, 'b');
    expect(sprite).toMatchObject({ kind: 'sprite', width: 30, height: 12 });
    if (text?.kind !== 'text') throw new Error('expected text');
    // "a" advances 5: x = 1 + (30 − 5) / 2; one 10 px line in 12 px: top = 1 + 1, glyph yoffset 3.
    expect(text.glyphs.slice(0, 2)).toEqual([13.5, 5]);
    const left = drawsOf(l, 'c')[1];
    if (left?.kind !== 'text') throw new Error('expected text');
    expect(left.glyphs[0]).toBe(0);
  });

  it('draws text icons as sprites and reports text problems at the text property', () => {
    const { file, layout } = setUp(`guiTypes = { windowType = { name = "w"
      instantTextBoxType = { name = "t" font = "tiny" text = "A£gold£Z£none£" maxWidth = 100 }
    } }`);
    const l = layout();
    const [text, icon] = drawsOf(l, 't');
    expect(text?.kind).toBe('text');
    expect(icon).toMatchObject({
      kind: 'sprite',
      x: 6,
      y: 0,
      width: 8,
      height: 8,
      shader: 'default',
    });
    const textNode = file.definitions[0]?.children[0]?.properties.find(
      (p) => p.key.text === 'text',
    )?.value;
    expect(l.diagnostics.map((d) => [d.code, d.start, d.end])).toEqual([
      ['missing-glyph', textNode?.start, textNode?.end],
      ['missing-icon', textNode?.start, textNode?.end],
    ]);
  });

  it('draws nothing for empty text and grows a text box without maxHeight to its lines', () => {
    const { layout } = setUp(`guiTypes = { windowType = { name = "w"
      instantTextBoxType = { name = "empty" font = "tiny" text = "" maxWidth = 50 maxHeight = 10 }
      instantTextBoxType = { name = "open" font = "tiny" text = "a\\nb" maxWidth = 50 }
    } }`);
    const l = layout();
    expect(drawsOf(l, 'empty')).toEqual([]);
    expect(rectOf(l, 'open')).toEqual([0, 0, 50, 20]);
  });
});

describe('layoutWindow: assets', () => {
  const text = `guiTypes = { windowType = { name = "w"
    iconType = { name = "i" spriteType = "GFX_plain" }
    instantTextBoxType = { name = "t" font = "tiny" text = "A" maxWidth = 50 }
  } }`;

  it('lists files the assets have not loaded and lays out the rest', () => {
    const l = setUp(text, {
      missing: new Set(['gfx/interface/plain.dds', 'gfx/fonts/tiny.fnt']),
    }).layout();
    expect([...l.unloaded].sort()).toEqual(['gfx/fonts/tiny.fnt', 'gfx/interface/plain.dds']);
    expect(l.drawList.draws).toEqual([]);
    expect(rectOf(l, 'i')).toEqual([0, 0, 0, 0]);
  });

  it('reports files that cannot be read', () => {
    const l = setUp(text, {
      problems: { 'gfx/interface/plain.dds': 'broken', 'gfx/fonts/tiny.fnt': 'gone' },
    }).layout();
    expect(l.unloaded).toEqual([]);
    expect(l.diagnostics.map((d) => [d.code, d.severity, d.message])).toEqual([
      ['unreadable-file', 'warning', 'Texture gfx/interface/plain.dds: broken.'],
      ['unreadable-file', 'warning', 'Font file gfx/fonts/tiny.fnt: gone.'],
    ]);
  });
});

describe('readTextureSize', () => {
  it('reads the size of a DDS and a TGA header', () => {
    const dds = new Uint8Array(128);
    const view = new DataView(dds.buffer);
    view.setUint32(0, 0x20534444, true);
    view.setUint32(12, 30, true);
    view.setUint32(16, 70, true);
    expect(readTextureSize(dds.subarray(0, 20))).toEqual({ width: 70, height: 30 });

    const tga = new Uint8Array(18);
    tga[2] = 10; // RLE true colour
    tga[12] = 0x2c;
    tga[13] = 0x01;
    tga[14] = 9;
    expect(readTextureSize(tga)).toEqual({ width: 300, height: 9 });
  });

  it('gives a reason for anything else', () => {
    expect(readTextureSize(new Uint8Array(4))).toHaveProperty('problem');
    const png = new Uint8Array(20);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    expect(readTextureSize(png)).toHaveProperty('problem');
    const empty = new Uint8Array(20);
    empty[2] = 2;
    expect(readTextureSize(empty)).toHaveProperty('problem');
  });
});
