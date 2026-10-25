import { describe, expect, it } from 'vitest';
import {
  InterfaceIndex,
  Properties,
  allWidgets,
  compareInterfacePaths,
  findDefinition,
  gfxDiagnostics,
  guiDiagnostics,
  parseScript,
  readGfxFile,
  readGuiFile,
  textureCandidates,
  widgetPathAt,
  widgetProperties,
  type GfxFile,
  type GuiFile,
  type ModelDiagnostic,
} from '../src/index.ts';
import { parseNumber } from '../src/model/properties.ts';

const gui = (text: string): GuiFile => readGuiFile(parseScript(text));
const gfx = (text: string): GfxFile => readGfxFile(parseScript(text));
function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}
const codes = (diagnostics: readonly ModelDiagnostic[]): string[] => diagnostics.map((d) => d.code);

function properties(text: string): Properties {
  const parsed = parseScript(text);
  return new Properties(parsed.entries.filter((e) => e.kind === 'property'));
}

describe('Properties', () => {
  it('reads points, sizes, flags and numbers; the last repeated key wins', () => {
    const p = properties(
      'position = { x = 10 y = -4 } size = { width = 100% height = 20 } Fullscreen = YES scale = 0.5 scale = 0.75 color = { 1.0 0 .5 }',
    );
    expect(p.point('position')).toEqual({ x: 10, y: -4 });
    expect(p.size('SIZE')).toEqual({
      width: { value: 100, percent: true },
      height: { value: 20, percent: false },
    });
    expect(p.flag('fullscreen')).toBe(true);
    expect(p.number('scale')).toBe(0.75);
    expect(p.numbers('color')).toEqual([1, 0, 0.5]);
    expect(p.number('missing')).toBeUndefined();
  });

  it('reads bare pairs and rejects malformed values', () => {
    const p = properties('offset = { -5 -4 } bad = { x = left y = 2 } n = 12px');
    expect(p.point('offset')).toEqual({ x: -5, y: -4 });
    expect(p.point('bad')).toBeUndefined();
    expect(p.number('n')).toBeUndefined();
    expect(properties('a = constructor').flag('a')).toBeUndefined();
  });

  it('reads numbers in time linear in their length', () => {
    expect([parseNumber('12'), parseNumber('-3.'), parseNumber('+.25'), parseNumber('.')]).toEqual([
      12,
      -3,
      0.25,
      undefined,
    ]);
    // A long run of digits that is not a number took seconds when the digits could split
    // between two loops (CodeQL js/polynomial-redos).
    const started = performance.now();
    expect(parseNumber(`${'9'.repeat(100_000)}x`)).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('readGuiFile', () => {
  const text = `@x = 13
guiTypes = {
  windowType = {
    name = "main_window"
    backGround = "bg"
    position = { x = @x y = 0 }
    iconType = { name = "bg" spriteType = "GFX_bg" }
    WindowType = {
      name = "inner"
      guiButtonType = { name = "ok" quadTextureSprite = "GFX_ok" buttonFont = "vic_18" }
    }
    dropDownBoxType = { name = "dropdown" }
  }
  containerWindowType = {
    name = "player"
    background = { name = "back" spriteType = "GFX_player_bg" }
    extendedScrollbarType = {
      name = "volume"
      slider = { name = "Slider" quadTextureSprite = "GFX_slider" }
      track = { name = "Track" quadTextureSprite = "GFX_track" }
      increaseButton = { name = "plus" quadTextureSprite = "GFX_plus" }
      decreaseButton = { name = "minus" quadTextureSprite = "GFX_minus" }
    }
  }
  positionType = { name = "MAIN_WINDOW" position = { x = @missing y = 1 } }
}`;
  const file = gui(text);

  it('nests the widgets of every kind as written', () => {
    expect(file.definitions.map((w) => `${w.kind}:${w.name ?? ''}`)).toEqual([
      'windowType:main_window',
      'containerWindowType:player',
      'positionType:MAIN_WINDOW',
    ]);
    const kinds = [...allWidgets(file)].map(({ widget }) => widget.kind);
    expect(kinds).toEqual([
      'windowType',
      'iconType',
      'windowType',
      'guiButtonType',
      'containerWindowType',
      'background',
      'extendedScrollbarType',
      'slider',
      'track',
      'increaseButton',
      'decreaseButton',
      'positionType',
    ]);
    const main = defined(file.definitions[0]);
    expect(main.properties.map((p) => p.key.text)).toEqual(['name', 'backGround', 'position']);
    expect(widgetProperties(main, file.constants).point('position')).toEqual({ x: 13, y: 0 });
  });

  it('reports a duplicate top-level name, an unknown kind and an unknown constant', () => {
    expect(codes(file.diagnostics)).toEqual([
      'unknown-widget-kind',
      'duplicate-top-level-name',
      'unknown-constant',
    ]);
    const duplicate = file.diagnostics.find((d) => d.code === 'duplicate-top-level-name');
    expect(text.slice(duplicate?.start, duplicate?.end)).toBe('"MAIN_WINDOW"');
    const unknown = file.diagnostics.find((d) => d.code === 'unknown-widget-kind');
    expect(text.slice(unknown?.start, unknown?.end)).toBe('dropDownBoxType');
    expect(findDefinition(file, 'Main_Window')).toBe(file.definitions[0]);
  });

  it('treats part keys outside their parent kind as properties', () => {
    const f = gui(
      'guiTypes = { windowType = { name = "w" background = { name = "b" } slider = { name = "s" } } }',
    );
    expect(f.definitions[0]?.children).toEqual([]);
    expect(f.definitions[0]?.properties.map((p) => p.key.text)).toEqual([
      'name',
      'background',
      'slider',
    ]);
  });

  it('finds the widgets at an offset', () => {
    const offset = text.indexOf('"GFX_ok"');
    expect(widgetPathAt(file, offset).map((w) => w.name)).toEqual(['main_window', 'inner', 'ok']);
    expect(widgetPathAt(file, 0)).toEqual([]);
  });
});

describe('widgetProperties', () => {
  const file = gui(`guiTypes = { guiButtonType = {
    name = "close"
    if_resolution = { max_height = 867 position = { x = 560 y = -48 } buttonText = "" }
    if_resolution = { min_height = 868 position = { x = 214 y = 664 } buttonText = "CLOSE" }
    buttonFont = "vic_18"
    if_resolution = { min_width = 3000 buttonFont = "vic_22" }
  } }`);
  const button = defined(file.definitions[0]);

  it('keeps the if_resolution blocks with their bounds', () => {
    expect(
      button.resolutionBlocks.map((b) => [b.minWidth, b.maxWidth, b.minHeight, b.maxHeight]),
    ).toEqual([
      [undefined, undefined, undefined, 867],
      [undefined, undefined, 868, undefined],
      [3000, undefined, undefined, undefined],
    ]);
  });

  it('applies the blocks whose inclusive bounds hold, in file order', () => {
    const small = widgetProperties(button, file.constants, { width: 1280, height: 867 });
    expect(small.point('position')).toEqual({ x: 560, y: -48 });
    expect(small.text('buttontext')).toBe('');
    const large = widgetProperties(button, file.constants, { width: 3440, height: 868 });
    expect(large.point('position')).toEqual({ x: 214, y: 664 });
    expect(large.text('buttonText')).toBe('CLOSE');
    expect(large.text('buttonFont')).toBe('vic_22');
    const none = widgetProperties(button, file.constants);
    expect(none.has('position')).toBe(false);
    expect(none.text('buttonFont')).toBe('vic_18');
  });
});

describe('readGfxFile', () => {
  const text = `spriteTypes = {
  spriteType = { name = "GFX_a" texturefile = "gfx//interface//a.tga" noOfFrames = 3 effectFile = "gfx/FX/buttonstate.lua" }
  textSpriteType = { name = "GFX_b" textureFile = "gfx/interface/b.dds" }
  progressbartype = { name = "GFX_c" textureFile1 = "gfx/interface/c1.dds" textureFile2 = "" color = { 1.0 0.0 0.0 } }
  corneredTileSpriteType = { name = "GFX_d" textureFile = "gfx/interface/d.dds" borderSize = { x = 4 y = 4 } }
  maskedShieldType = { name = "GFX_e" textureFile1 = "gfx/interface/e1.dds" textureFile2 = "gfx/interface/e2.dds" }
  frameAnimatedSpriteType = { name = "GFX_f" textureFile = "gfx/interface/f.dds" noOfFrames = 0 }
  PieChartType = { name = "GFX_g" size = 25 }
  LineChartType = { name = "GFX_h" size = { x = 100 y = 50 } linewidth = 2 }
  cursor_offset = { -5 -4 }
  scrollingSprite = { name = "GFX_i" }
}
bitmapfonts = {
  bitmapfont = { name = "vic_18" path = "gfx/fonts/vic_18" color = 0xffd8d8d8 textcolors = { G = { 0 255 0 } } }
  textcolors = { W = { 255 255 255 } g = { 0 128 0 } }
}`;
  const file = gfx(text);

  it('reads the eight sprite kinds with textures, frames and effect', () => {
    expect(file.sprites.map((s) => s.kind)).toEqual([
      'spriteType',
      'textSpriteType',
      'progressbartype',
      'corneredTileSpriteType',
      'maskedShieldType',
      'frameAnimatedSpriteType',
      'PieChartType',
      'LineChartType',
    ]);
    const [a, , c, d, e, f] = file.sprites;
    expect(a?.textures.map((t) => t.path)).toEqual(['gfx//interface//a.tga']);
    expect(a?.frames).toBe(3);
    expect(a?.effectFile).toBe('gfx/FX/buttonstate.lua');
    expect(c?.textures.map((t) => t.key)).toEqual(['texturefile1']);
    expect(c?.properties.numbers('color')).toEqual([1, 0, 0]);
    expect(d?.properties.point('borderSize')).toEqual({ x: 4, y: 4 });
    expect(e?.textures.map((t) => t.key)).toEqual(['texturefile1', 'texturefile2']);
    expect(f?.frames).toBe(1);
  });

  it('reads fonts and text colours and reports an unknown sprite kind', () => {
    expect(file.fonts).toHaveLength(1);
    expect(file.fonts[0]).toMatchObject({
      name: 'vic_18',
      path: 'gfx/fonts/vic_18',
      colour: 0xffd8d8d8,
    });
    expect(file.fonts[0]?.textColours).toEqual({ G: [0, 255, 0] });
    expect(file.textColours).toEqual({ W: [255, 255, 255], g: [0, 128, 0] });
    expect(codes(file.diagnostics)).toEqual(['unknown-sprite-kind']);
  });
});

describe('InterfaceIndex', () => {
  it('orders files as the game loads them: files of a folder, then its subfolders', () => {
    const paths = ['interface/b/a.gui', 'interface/Z.gui', 'interface/a.gui', 'interface/a/z.gui'];
    expect(paths.sort(compareInterfacePaths)).toEqual([
      'interface/a.gui',
      'interface/Z.gui',
      'interface/a/z.gui',
      'interface/b/a.gui',
    ]);
  });

  it('resolves names without regard to case; the first definition in load order wins', () => {
    const index = InterfaceIndex.of(
      [
        {
          path: 'interface/sub/late.gfx',
          file: gfx('spriteTypes = { spriteType = { name = "GFX_x" textureFile = "late.dds" } }'),
        },
        {
          path: 'interface/early.gfx',
          file: gfx('spriteTypes = { spriteType = { name = "gfx_X" textureFile = "early.dds" } }'),
        },
      ],
      [
        {
          path: 'interface/core.gui',
          file: gui('guiTypes = { scrollbarType = { name = "slider" } }'),
        },
      ],
    );
    expect(index.sprite('GFX_X')?.path).toBe('interface/early.gfx');
    expect(index.spriteDefinitions('gfx_x').map((d) => d.path)).toEqual([
      'interface/early.gfx',
      'interface/sub/late.gfx',
    ]);
    expect(index.guiType('SLIDER')?.item.kind).toBe('scrollbarType');

    const edited = index.withGfx('interface/EARLY.gfx', undefined);
    expect(edited.sprite('gfx_x')?.path).toBe('interface/sub/late.gfx');
    expect(index.sprite('gfx_x')?.path).toBe('interface/early.gfx');
    expect(
      edited.withGui('interface/core.gui', gui('guiTypes = {}')).guiType('slider'),
    ).toBeUndefined();
  });

  it('merges the global text colours, the first letter definition winning', () => {
    const index = InterfaceIndex.of(
      [
        {
          path: 'interface/b.gfx',
          file: gfx('bitmapfonts = { textcolors = { Y = { 1 2 3 } R = { 9 9 9 } } }'),
        },
        {
          path: 'interface/a.gfx',
          file: gfx('bitmapfonts = { textcolors = { Y = { 255 255 0 } } }'),
        },
      ],
      [],
    );
    expect(index.textColours).toEqual({ Y: [255, 255, 0], R: [9, 9, 9] });
  });
});

describe('texture paths', () => {
  it('normalises separators and falls back from .tga to .dds', () => {
    expect(textureCandidates('gfx//interface\\\\a.tga')).toEqual([
      'gfx/interface/a.tga',
      'gfx/interface/a.dds',
    ]);
    expect(textureCandidates('gfx/interface/a.dds')).toEqual(['gfx/interface/a.dds']);
  });
});

describe('reference checks', () => {
  const gfxText = `spriteTypes = {
  spriteType = { name = "GFX_ok" textureFile = "gfx//interface//ok.tga" }
  spriteType = { name = "GFX_broken" textureFile = "gfx/interface/none.dds" }
  spriteType = { name = "GFX_ok" textureFile = "gfx/interface/second.dds" }
}
bitmapfonts = {
  bitmapfont = { name = "vic_18" path = "gfx/fonts/vic_18" }
  bitmapfont = { name = "no_file" path = "gfx/fonts/none" }
}`;
  const existing = new Set([
    'gfx/interface/ok.dds',
    'gfx/interface/second.dds',
    'gfx/fonts/vic_18.fnt',
    'gfx/fonts/vic_18.tga',
    'gfx/interface/text.dds',
  ]);
  const exists = (path: string): boolean => existing.has(path);
  const guiText = `guiTypes = {
  windowType = {
    name = "w"
    background = "missing_child"
    iconType = { name = "a" spriteType = "GFX_ok" }
    iconType = { name = "b" spriteType = "GFX_none" if_resolution = { min_height = 2000 spriteType = "GFX_also_none" } }
    iconType = { name = "c" spriteType = "gfx_OK" }
    guiButtonType = { name = "d" quadTextureSprite = "GFX_broken" buttonFont = "no_file" }
    instantTextBoxType = { name = "e" font = "missing_font" textureFile = "gfx\\\\interface\\\\text.dds" }
    instantTextBoxType = { name = "f" font = "vic_18" textureFile = "gfx/interface/none.tga" scrollbartype = "standard_slider" }
    listboxType = { name = "g" background = "GFX_ok" scrollbartype = "nowhere" }
    scrollbarType = {
      name = "local"
      slider = "SliderButton" track = "nope"
      guiButtonType = { name = "SliderButton" quadTextureSprite = "GFX_ok" }
      guiButtonType = { name = "other" parent = "SliderButton" }
      guiButtonType = { name = "third" parent = "missing" }
    }
  }
}`;
  const core = gui('guiTypes = { scrollbarType = { name = "standard_slider" } }');
  const file = gui(guiText);
  const gfxFile = gfx(gfxText);
  const index = InterfaceIndex.of(
    [{ path: 'interface/core.gfx', file: gfxFile }],
    [
      { path: 'interface/core.gui', file: core },
      { path: 'interface/edited.gui', file },
    ],
  );

  it('checks every reference of a .gui file, if_resolution branches included', () => {
    const found = guiDiagnostics(file, index, exists).map(
      (d) => `${d.code} ${guiText.slice(d.start, d.end)}`,
    );
    expect(found).toEqual([
      'missing-widget "missing_child"',
      'missing-sprite "GFX_none"',
      'missing-sprite "GFX_also_none"',
      'reference-case "gfx_OK"',
      'missing-texture "GFX_broken"',
      'missing-font-file "no_file"',
      'missing-font "missing_font"',
      'missing-texture "gfx/interface/none.tga"',
      'missing-gui-type "nowhere"',
      'missing-widget "nope"',
      'missing-widget "missing"',
    ]);
  });

  it('checks a .gfx file: texture and font files, shadowed definitions', () => {
    const found = gfxDiagnostics('interface/core.gfx', gfxFile, index, exists).map(
      (d) => `${d.severity} ${d.code} ${gfxText.slice(d.start, d.end)}`,
    );
    expect(found).toEqual([
      'warning missing-texture "gfx/interface/none.dds"',
      'information duplicate-sprite "GFX_ok"',
      'warning missing-font-file "gfx/fonts/none"',
    ]);
  });

  it('gives each diagnostic a range inside the file', () => {
    for (const d of guiDiagnostics(file, index, exists)) {
      expect(d.start).toBeGreaterThanOrEqual(0);
      expect(d.end).toBeLessThanOrEqual(guiText.length);
      expect(d.end).toBeGreaterThan(d.start);
    }
  });
});
