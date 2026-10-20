/**
 * Reader for the game's AngelCode BMFont text files (`.fnt`), etch#3 and
 * etch#8. Only the lines that layout needs are read: `common`, `char` and
 * `kerning`. `page` lines are ignored, as the game ignores them: the texture
 * is found by the base name of the font's `path` (see {@link fontFilePaths}).
 */

/** One glyph of a font, in atlas pixels. */
export interface BmGlyph {
  /** Windows-1252 byte. */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly xoffset: number;
  readonly yoffset: number;
  readonly xadvance: number;
}

export interface BmFont {
  /** Distance between the tops of two lines. */
  readonly lineHeight: number;
  /** Distance from the top of a line to the baseline. */
  readonly base: number;
  /** Atlas size the `.fnt` was made for. */
  readonly scaleW: number;
  readonly scaleH: number;
  readonly glyphs: ReadonlyMap<number, BmGlyph>;
  /**
   * Kerning amounts keyed by {@link kerningKey}. A pair listed twice keeps the
   * last amount; vanilla repeats pairs only with the same amount.
   */
  readonly kerning: ReadonlyMap<number, number>;
}

export interface FontIssue {
  readonly code: 'fnt-no-common' | 'fnt-bad-line';
  readonly message: string;
  /** 1-based line of the `.fnt` file, 0 for the whole file. */
  readonly line: number;
}

export interface BmFontResult {
  readonly font: BmFont;
  readonly issues: readonly FontIssue[];
}

/** Key of a kerning pair in {@link BmFont.kerning}. */
export function kerningKey(first: number, second: number): number {
  return first * 0x10000 + second;
}

const CHAR_FIELDS = ['id', 'x', 'y', 'width', 'height', 'xoffset', 'yoffset', 'xadvance'] as const;
const PAIR = /(\w+)=(-?\d+)/g;

/** Reads a `.fnt` text file. Broken lines are skipped with an issue; reading never fails. */
export function parseBmFont(text: string): BmFontResult {
  const issues: FontIssue[] = [];
  const glyphs = new Map<number, BmGlyph>();
  const kerning = new Map<number, number>();
  let common: Record<string, number> | undefined;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const tag = /^\s*(\w+)/.exec(line)?.[1];
    if (tag !== 'common' && tag !== 'char' && tag !== 'kerning') continue;
    const fields: Record<string, number> = {};
    for (const m of line.matchAll(PAIR)) fields[m[1] ?? ''] = Number(m[2]);

    if (tag === 'common') {
      common = fields;
    } else if (tag === 'char') {
      const missing = CHAR_FIELDS.filter((k) => fields[k] === undefined);
      if (missing.length > 0) {
        issues.push(bad(i, `char line lacks ${missing.join(', ')}`));
        continue;
      }
      const g = fields as Record<(typeof CHAR_FIELDS)[number], number>;
      glyphs.set(g.id, {
        id: g.id,
        x: g.x,
        y: g.y,
        width: g.width,
        height: g.height,
        xoffset: g.xoffset,
        yoffset: g.yoffset,
        xadvance: g.xadvance,
      });
    } else {
      const { first, second, amount } = fields;
      if (first === undefined || second === undefined || amount === undefined) {
        issues.push(bad(i, 'kerning line lacks first, second or amount'));
        continue;
      }
      kerning.set(kerningKey(first, second), amount);
    }
  }

  if (common?.['lineHeight'] === undefined) {
    issues.push({ code: 'fnt-no-common', message: 'no common line with lineHeight', line: 0 });
  }
  return {
    font: {
      lineHeight: common?.['lineHeight'] ?? 0,
      base: common?.['base'] ?? 0,
      scaleW: common?.['scaleW'] ?? 0,
      scaleH: common?.['scaleH'] ?? 0,
      glyphs,
      kerning,
    },
    issues,
  };
}

function bad(index: number, message: string): FontIssue {
  return { code: 'fnt-bad-line', message, line: index + 1 };
}

/**
 * The files of a `bitmapfont` whose `path` is, for example,
 * `gfx/fonts/vic_18`: the `.fnt` and the texture candidates in the order to
 * try them. The `page` line is not used: mod fonts name `cg_12b_0.dds` there
 * while the file is `cg_12b.dds`, and the game still finds it (etch#3).
 * Several vanilla fonts ship both `.dds` and `.tga`; which one the game uses
 * is unverified, and `.dds` comes first as in etch#9.
 */
export function fontFilePaths(path: string): { fnt: string; textures: [string, string] } {
  const base = path.replace(/\.(fnt|dds|tga)$/i, '');
  return { fnt: `${base}.fnt`, textures: [`${base}.dds`, `${base}.tga`] };
}
