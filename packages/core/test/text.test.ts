import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  colourOf,
  fontFilePaths,
  kerningKey,
  layoutText,
  parseBmFont,
  parseMarkup,
  textAlign,
  toCp1252,
  type TextColours,
  type TextOptions,
} from '../src/index.ts';

const TINY = readFileSync(new URL('./fixtures/tiny.fnt', import.meta.url), 'utf8');
const font = parseBmFont(TINY).font;

const colours: TextColours = {
  base: 0xff000000,
  font: { Y: [219, 203, 71] },
  global: { Y: [255, 189, 0], G: [0, 255, 0] },
};
const options: TextOptions = { colours };
const box = (width: number, more: object = {}) => ({ x: 0, y: 0, width, ...more });

describe('parseBmFont', () => {
  it('reads common, char and kerning lines and ignores the page line', () => {
    const { font: f, issues } = parseBmFont(TINY);
    expect(issues).toEqual([]);
    expect(f).toMatchObject({ lineHeight: 10, base: 8, scaleW: 64, scaleH: 64 });
    expect(f.glyphs.size).toBe(7);
    expect(f.glyphs.get(128)).toEqual({
      id: 128,
      x: 24,
      y: 0,
      width: 6,
      height: 8,
      xoffset: -1,
      yoffset: 1,
      xadvance: 6,
    });
    expect(f.kerning.get(kerningKey(65, 86))).toBe(-2);
    expect(f.kerning.get(kerningKey(86, 65))).toBe(-1);
  });

  it('reads CRLF files', () => {
    const { font: f, issues } = parseBmFont(TINY.replace(/\n/g, '\r\n'));
    expect(issues).toEqual([]);
    expect(f.glyphs.size).toBe(7);
  });

  it('skips broken lines with an issue and keeps the rest', () => {
    const { font: f, issues } = parseBmFont(
      'common lineHeight=12 base=9\nchar id=65 x=1\nchar id=66 x=0 y=0 width=1 height=1 xoffset=0 yoffset=0 xadvance=2\nkerning first=65\n',
    );
    expect(f.lineHeight).toBe(12);
    expect([...f.glyphs.keys()]).toEqual([66]);
    expect(issues.map((i) => [i.code, i.line])).toEqual([
      ['fnt-bad-line', 2],
      ['fnt-bad-line', 4],
    ]);
  });

  it('reports a file without a common line', () => {
    const { font: f, issues } = parseBmFont('info face="x"\n');
    expect(f.lineHeight).toBe(0);
    expect(issues.map((i) => i.code)).toEqual(['fnt-no-common']);
  });
});

describe('fontFilePaths', () => {
  it('finds the texture by the base name of the path', () => {
    expect(fontFilePaths('gfx/fonts/vic_18')).toEqual({
      fnt: 'gfx/fonts/vic_18.fnt',
      textures: ['gfx/fonts/vic_18.dds', 'gfx/fonts/vic_18.tga'],
    });
  });
});

describe('toCp1252', () => {
  it('maps Unicode to Windows-1252 bytes', () => {
    expect(toCp1252(0x41)).toBe(0x41);
    expect(toCp1252(0xe9)).toBe(0xe9);
    expect(toCp1252(0x20ac)).toBe(0x80);
    expect(toCp1252(0x2014)).toBe(0x97);
    expect(toCp1252(0x81)).toBe(0x81);
  });

  it('has no byte for characters outside Windows-1252', () => {
    expect(toCp1252(0x80)).toBeUndefined();
    expect(toCp1252(0x100)).toBeUndefined();
    expect(toCp1252(0x1f600)).toBeUndefined();
  });
});

describe('parseMarkup', () => {
  it('nests § colours, the font table winning over the global one', () => {
    const { atoms, issues } = parseMarkup('a§Yb§Ga§!b§!a', colours);
    expect(issues).toEqual([]);
    expect(atoms.map((a) => (a.kind === 'char' ? [a.char, a.colour] : a.kind))).toEqual([
      ['a', 0xff000000],
      ['b', 0xffdbcb47],
      ['a', 0xff00ff00],
      ['b', 0xffdbcb47],
      ['a', 0xff000000],
    ]);
  });

  it('reports an unknown colour and keeps §! balanced', () => {
    const { atoms, issues } = parseMarkup('§Ya§Qb§!c§!d§!e', colours);
    expect(issues).toEqual([
      { code: 'unknown-colour', message: 'unknown text colour §Q', start: 3, end: 5 },
    ]);
    const yellow = colourOf(colours, 'Y');
    expect(atoms.map((a) => (a.kind === 'char' ? a.colour : 0))).toEqual([
      yellow,
      yellow,
      yellow,
      0xff000000,
      0xff000000,
    ]);
  });

  it('starts with the text_color_code colour', () => {
    const { atoms } = parseMarkup('a', colours, 'G');
    expect(atoms[0]).toMatchObject({ kind: 'char', colour: 0xff00ff00 });
  });

  it('reads £key£ icons and leaves a lone £ as a character', () => {
    const { atoms } = parseMarkup('£yes£ for £5 and', colours);
    expect(atoms[0]).toEqual({ kind: 'icon', key: 'yes', start: 0, end: 5 });
    expect(atoms.filter((a) => a.kind === 'icon')).toHaveLength(1);
    expect(atoms.some((a) => a.kind === 'char' && a.char === '£')).toBe(true);
  });

  it('breaks lines at a line feed and at the two characters \\n', () => {
    const { atoms } = parseMarkup('a\nb\\nc\r', colours);
    expect(atoms.map((a) => (a.kind === 'char' ? a.char : a.kind))).toEqual([
      'a',
      'break',
      'b',
      'break',
      'c',
    ]);
  });

  it('leaves $ and [] substitutions literal', () => {
    const { atoms } = parseMarkup('$KEY$[Root.GetName]', colours);
    expect(atoms.map((a) => (a.kind === 'char' ? a.char : '')).join('')).toBe(
      '$KEY$[Root.GetName]',
    );
  });
});

describe('textAlign', () => {
  it('maps .gui formats', () => {
    expect(textAlign('centre')).toBe('centre');
    expect(textAlign('CENTER')).toBe('centre');
    expect(textAlign('right')).toBe('right');
    expect(textAlign('upper_left')).toBe('left');
    expect(textAlign(undefined)).toBe('left');
  });
});

describe('layoutText', () => {
  it('applies kerning to positions and width', () => {
    const t = layoutText(font, 'AVA', box(0), options);
    expect(t.glyphs.map((g) => g.x)).toEqual([0, 4, 9]);
    expect(t.width).toBe(15);
    expect(t.glyphs[0]).toMatchObject({ y: 1, width: 6, height: 8, atlasX: 0, atlasY: 0 });
  });

  it('places glyph offsets and skips empty quads such as the space', () => {
    const t = layoutText(font, 'a b', box(0), options);
    expect(t.glyphs.map((g) => [g.x, g.y, g.source])).toEqual([
      [0, 3, 0],
      [9, 1, 2],
    ]);
    expect(t.width).toBe(13);
  });

  it('centres rounding half up (etch#9)', () => {
    expect(layoutText(font, 'ab', box(15), { ...options, align: 'centre' }).lines[0]?.x).toBe(3);
    expect(layoutText(font, 'ab', box(9), { ...options, align: 'centre' }).lines[0]?.x).toBe(0);
    const loose = layoutText(font, 'ab', box(15), { ...options, align: 'centre', snap: false });
    expect(loose.lines[0]?.x).toBe(2.5);
  });

  it('wraps at spaces and measures a wrapped line with its trailing space (etch#9)', () => {
    const t = layoutText(font, 'ab ab ab', box(30), { ...options, align: 'centre' });
    expect(t.lines).toEqual([
      { x: 2, y: 0, width: 26, start: 0, end: 6 },
      { x: 10, y: 10, width: 10, start: 6, end: 8 },
    ]);
    expect(t.height).toBe(20);
    expect(t.width).toBe(26);
  });

  it('keeps a line that is exactly as wide as the box', () => {
    expect(layoutText(font, 'ab ab', box(23), options).lines).toHaveLength(1);
    expect(layoutText(font, 'ab ab', box(22), options).lines).toHaveLength(2);
  });

  it('wraps inside the border and lets a long word overflow', () => {
    const t = layoutText(font, 'ab ab', box(26, { border: { x: 2, y: 3 } }), options);
    expect(t.lines.map((l) => [l.x, l.y])).toEqual([
      [2, 3],
      [2, 13],
    ]);
    expect(layoutText(font, 'AVAVAV', box(5), options).lines).toHaveLength(1);
  });

  it('does not wrap without a width', () => {
    expect(layoutText(font, 'ab ab ab ab', box(0), options).lines).toHaveLength(1);
  });

  it('aligns right inside the border', () => {
    const t = layoutText(font, 'ab', box(30, { border: { x: 2, y: 0 } }), {
      ...options,
      align: 'right',
    });
    expect(t.lines[0]?.x).toBe(18);
  });

  it('aligns vertically in the box height', () => {
    const b = box(30, { height: 25, border: { x: 0, y: 2 } });
    const at = (verticalAlign: 'centre' | 'bottom', snap = true) =>
      layoutText(font, 'a', b, { ...options, verticalAlign, snap }).lines[0]?.y;
    expect(at('centre')).toBe(8);
    expect(at('centre', false)).toBe(7.5);
    expect(at('bottom')).toBe(13);
  });

  it('breaks lines at \\n', () => {
    const t = layoutText(font, 'a\\nb\nab', box(0), options);
    expect(t.lines.map((l) => [l.y, l.start, l.end])).toEqual([
      [0, 0, 1],
      [10, 3, 4],
      [20, 5, 7],
    ]);
    expect(t.height).toBe(30);
  });

  it('lays out nothing for empty text', () => {
    expect(layoutText(font, '', box(10), options)).toMatchObject({
      lines: [],
      glyphs: [],
      width: 0,
      height: 0,
    });
  });

  it('colours glyphs by § codes', () => {
    const t = layoutText(font, 'a§Yb§!a', box(0), options);
    expect(t.glyphs.map((g) => g.colour)).toEqual([0xff000000, 0xffdbcb47, 0xff000000]);
  });

  it('looks up Windows-1252 glyphs for Unicode text', () => {
    const t = layoutText(font, '€é', box(0), options);
    expect(t.issues).toEqual([]);
    expect(t.glyphs.map((g) => g.atlasX)).toEqual([24, 31]);
  });

  it('reports a missing glyph once and breaks kerning across it', () => {
    const t = layoutText(font, 'AzVz', box(0), options);
    expect(t.issues).toEqual([
      {
        code: 'missing-glyph',
        message: 'the font has no glyph for U+007A (z)',
        start: 1,
        end: 2,
      },
    ]);
    expect(t.width).toBe(12);
  });

  it('reports characters outside Windows-1252', () => {
    const t = layoutText(font, 'aĀ😀', box(0), options);
    expect(t.issues.map((i) => [i.code, i.start, i.end])).toEqual([
      ['not-cp1252', 1, 2],
      ['not-cp1252', 2, 4],
    ]);
    expect(t.glyphs).toHaveLength(1);
  });

  it('draws £ icons inline and reports missing ones', () => {
    const icon = (sprite: string) =>
      sprite === 'GFX_text_yes' ? { width: 12, height: 9 } : undefined;
    const t = layoutText(font, 'a£yes£b£no£a', box(0), { ...options, icon });
    expect(t.icons).toEqual([
      { sprite: 'GFX_text_yes', x: 5, y: 0, width: 12, height: 9, source: 1 },
    ]);
    expect(t.glyphs.map((g) => g.x)).toEqual([0, 18, 22]);
    expect(t.width).toBe(27);
    expect(t.issues).toEqual([
      {
        code: 'missing-icon',
        message: 'no sprite GFX_text_no for the text icon £no£',
        start: 7,
        end: 11,
      },
    ]);
  });
});
