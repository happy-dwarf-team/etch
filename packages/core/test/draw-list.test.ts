import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DRAW_LIST_VERSION,
  GLYPH_STRIDE,
  effectName,
  isMaskedShader,
  isSpriteShader,
  layoutText,
  moveDraw,
  packGlyphs,
  parseBmFont,
  type DrawList,
} from '../src/index.ts';

describe('effectName', () => {
  it('reads the shader from the effectFile spellings vanilla uses', () => {
    expect(effectName('gfx/FX/buttonstate.lua')).toBe('buttonstate');
    expect(effectName('gfx//FX//maskedflag_greydown.lua')).toBe('maskedflag_greydown');
    expect(effectName('gfx\\FX\\gui_rendertarget.shader')).toBe('gui_rendertarget');
    expect(effectName(' gfx/FX/ButtonState_Linear.LUA ')).toBe('buttonstate_linear');
    expect(effectName('progress')).toBe('progress');
  });

  it('names the default shader when there is no effectFile', () => {
    expect(effectName(undefined)).toBe('default');
    expect(effectName('  ')).toBe('default');
  });
});

describe('moveDraw', () => {
  const by = { x: 3, y: -2 };
  const glyphs = [10, 20, 6, 8, 1, 2, 0xffffffff, 16, 20, 6, 8, 7, 2, 0xffffffff];
  const movedGlyphs = [13, 18, 6, 8, 1, 2, 0xffffffff, 19, 18, 6, 8, 7, 2, 0xffffffff];
  const rect = { x: 5, y: 5, width: 40, height: 20, sx: 0, sy: 0, sw: 40, sh: 20, source: 7 };

  it("moves a text draw's glyphs and leaves their size and atlas rect", () => {
    const text = { kind: 'text', texture: 1, glyphs, source: 7 } as const;
    expect(moveDraw(text, by)).toEqual({ ...text, glyphs: movedGlyphs });
    expect(text.glyphs[0]).toBe(10);
  });

  it("moves a sprite's rect and the glyphs of its baked text", () => {
    const sprite = {
      ...rect,
      kind: 'sprite',
      texture: 0,
      shader: 'default',
      text: { texture: 1, glyphs },
    } as const;
    expect(moveDraw(sprite, by)).toEqual({
      ...sprite,
      x: 8,
      y: 3,
      text: { texture: 1, glyphs: movedGlyphs },
    });
  });

  it('moves the rect of a sprite without text, a masked draw and a progress bar', () => {
    const sprite = { ...rect, kind: 'sprite', texture: 0, shader: 'default' } as const;
    expect(moveDraw(sprite, by)).toEqual({ ...sprite, x: 8, y: 3 });
    const masked = {
      ...rect,
      kind: 'masked',
      texture: 0,
      mask: 1,
      maskRect: { sx: 0, sy: 0, sw: 8, sh: 8 },
      shader: 'maskedflag',
    } as const;
    expect(moveDraw(masked, by)).toEqual({ ...masked, x: 8, y: 3 });
    const progress = {
      kind: 'progress',
      first: { colour: 0xff00ff00 },
      second: { texture: 0 },
      value: 0.5,
      x: 5,
      y: 5,
      width: 100,
      height: 10,
      source: 7,
    } as const;
    expect(moveDraw(progress, by)).toEqual({ ...progress, x: 8, y: 3 });
  });

  it('leaves a trailing partial glyph alone', () => {
    const text = { kind: 'text', texture: 1, glyphs: [10], source: 7 } as const;
    expect(moveDraw(text, by)).toEqual(text);
  });
});

describe('shader names', () => {
  it('sorts the shaders vanilla uses into sprite, masked and unhandled', () => {
    for (const name of [
      'default',
      'buttonstate',
      'buttonstate_linear',
      'buttonstate_nodowneffect',
      'buttonstate_onlydisable',
      'button_overlay',
    ]) {
      expect(isSpriteShader(name), name).toBe(true);
    }
    expect(isMaskedShader('maskedflag')).toBe(true);
    expect(isMaskedShader('maskedflag_greydown')).toBe(true);
    expect(isSpriteShader('maskedflag')).toBe(false);
    expect(isSpriteShader('gui_rendertarget')).toBe(false);
    expect(isSpriteShader('progress')).toBe(false);
  });
});

describe('packGlyphs', () => {
  it('writes each laid-out glyph as one stride of numbers', () => {
    const tiny = readFileSync(new URL('./fixtures/tiny.fnt', import.meta.url), 'utf8');
    const font = parseBmFont(tiny).font;
    const layout = layoutText(
      font,
      'AV',
      { x: 10, y: 20, width: 0 },
      {
        colours: { base: 0xff102030 },
      },
    );
    const packed = packGlyphs(layout.glyphs);
    expect(packed).toHaveLength(2 * GLYPH_STRIDE);
    // V is kerned 2 px towards A.
    expect(packed).toEqual([10, 21, 6, 8, 0, 0, 0xff102030, 14, 21, 6, 8, 7, 0, 0xff102030]);
  });
});

describe('DrawList', () => {
  it('survives JSON and structured clone unchanged', () => {
    const list: DrawList = {
      version: DRAW_LIST_VERSION,
      width: 1920,
      height: 1080,
      textures: ['gfx/interface/a.dds', 'gfx/fonts/vic_18.dds'],
      draws: [
        {
          kind: 'sprite',
          texture: 0,
          shader: 'buttonstate',
          effect: 'disable',
          x: 1,
          y: 2,
          width: 30,
          height: 40,
          sx: 30,
          sy: 0,
          sw: 30,
          sh: 40,
          source: 120,
        },
        {
          kind: 'masked',
          texture: 0,
          mask: 0,
          shader: 'maskedflag',
          x: 0,
          y: 0,
          width: 8,
          height: 8,
          sx: 0,
          sy: 0,
          sw: 8,
          sh: 8,
          maskRect: { sx: 0, sy: 0, sw: 8, sh: 8 },
          source: 200,
        },
        {
          kind: 'progress',
          first: { colour: 0xff00ff00 },
          second: { texture: 0 },
          value: 0.25,
          vertical: true,
          x: 5,
          y: 5,
          width: 100,
          height: 10,
          source: 300,
        },
        {
          kind: 'text',
          texture: 1,
          glyphs: [0.5, 1, 6, 8, 0, 0, 0xffffffff],
          border: 0x80000000,
          source: 400,
        },
      ],
    };
    expect(JSON.parse(JSON.stringify(list))).toEqual(list);
    expect(structuredClone(list)).toEqual(list);
  });
});
