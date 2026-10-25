import { describe, expect, it } from 'vitest';
import {
  InterfaceIndex,
  parseScript,
  previewCrop,
  readGfxFile,
  readGuiFile,
  showAnimationMs,
  textureReloadNames,
} from '../src/index.ts';

const screen = { width: 1920, height: 1080 };

describe('previewCrop', () => {
  it('covers every widget, children outside the window included, in whole pixels', () => {
    const crop = previewCrop(
      [
        { x: 165, y: 215, width: 333, height: 454 },
        { x: 150.5, y: 220, width: 10, height: 10 },
        { x: 400, y: 600, width: 120.25, height: 80.5 },
      ],
      screen,
    );
    expect(crop).toEqual({ x: 150, y: 215, width: 371, height: 466 });
  });

  it('is clamped to the screen and skips empty widgets', () => {
    expect(
      previewCrop(
        [
          { x: -10, y: -1, width: 1940, height: 50 },
          { x: 5000, y: 5000, width: 0, height: 0 },
        ],
        screen,
      ),
    ).toEqual({ x: 0, y: 0, width: 1920, height: 49 });
  });

  it('is undefined when nothing is on the screen', () => {
    expect(previewCrop([{ x: 2000, y: 10, width: 50, height: 50 }], screen)).toBeUndefined();
    expect(previewCrop([], screen)).toBeUndefined();
  });
});

describe('textureReloadNames', () => {
  const gfx = readGfxFile(
    parseScript(
      [
        'spriteTypes = {',
        '\tspriteType = { name = "GFX_a" texturefile = "gfx//interface//topbar_UL.tga" }',
        '\tspriteType = { name = "GFX_b" texturefile = "gfx/interface/topbar_UL.dds" }',
        '\tspriteType = { name = "GFX_c" texturefile = "gfx/interface/other.dds" }',
        '}',
      ].join('\n'),
    ),
  );
  const index = InterfaceIndex.of([{ path: 'interface/a.gfx', file: gfx }], []);

  it('gives every name as written that resolves to the saved texture, .tga falling back to .dds', () => {
    expect(textureReloadNames(index, 'gfx/interface/topbar_ul.dds')).toEqual([
      'gfx//interface//topbar_UL.tga',
      'gfx/interface/topbar_UL.dds',
    ]);
    expect(textureReloadNames(index, 'gfx\\interface\\other.dds')).toEqual([
      'gfx/interface/other.dds',
    ]);
  });

  it('falls back to the path itself', () => {
    expect(textureReloadNames(index, 'gfx/interface/unused.tga')).toEqual([
      'gfx/interface/unused.tga',
    ]);
  });
});

describe('showAnimationMs', () => {
  const file = readGuiFile(
    parseScript(
      [
        'guiTypes = {',
        '\twindowType = { name = "a" position = { x=-600 y=140 } show_position = { x=0 y=140 } animation_time = 300 }',
        '\twindowType = { name = "b" position = { x=0 y=0 } animation_time = 300 }',
        '\twindowType = { name = "c" show_position = { x=0 y=0 } }',
        '}',
      ].join('\n'),
    ),
  );

  it('is the animation time of a window that moves to its show position', () => {
    const [a, b, c] = file.definitions;
    expect(a && showAnimationMs(file, a, screen)).toBe(300);
    expect(b && showAnimationMs(file, b, screen)).toBe(0);
    expect(c && showAnimationMs(file, c, screen)).toBe(0);
  });
});
