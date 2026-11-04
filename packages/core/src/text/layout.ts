/**
 * Text layout with the game's bitmap fonts. The layout is Etch's own (etch#8);
 * the rules marked verified matched the game pixel for pixel on the main menu
 * in etch#9, the rest are hypotheses for the precision corpus.
 */

import { kerningKey, type BmFont, type BmGlyph } from './bmfont.ts';
import { toCp1252 } from './cp1252.ts';
import {
  FLAG_ADVANCE,
  FONT_ICON_ADVANCE,
  parseMarkup,
  textIconSprite,
  type TextColours,
  type TextIssue,
} from './markup.ts';

export type TextAlign = 'left' | 'centre' | 'right';
export type TextVerticalAlign = 'top' | 'centre' | 'bottom';

/** The box text is laid out in: for a text box, `maxWidth` × `maxHeight` and `borderSize`. */
export interface TextBox {
  readonly x: number;
  readonly y: number;
  /** Lines wrap at `width − 2 × border.x`; 0 or less turns wrapping off. */
  readonly width: number;
  /** Used only by vertical alignment other than `top`. */
  readonly height?: number;
  readonly border?: { readonly x: number; readonly y: number };
}

export interface TextOptions {
  readonly colours: TextColours;
  readonly align?: TextAlign;
  readonly verticalAlign?: TextVerticalAlign;
  /** `text_color_code`: the colour letter the text starts with. */
  readonly colourCode?: string;
  /** Size of an icon sprite such as `GFX_text_yes`, or `undefined` when it does not exist. */
  readonly icon?: (sprite: string) => { width: number; height: number } | undefined;
}

/** A glyph quad: screen rect and atlas rect, in pixels. */
export interface PlacedGlyph {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly atlasX: number;
  readonly atlasY: number;
  /** `0xAARRGGBB`. */
  readonly colour: number;
  /** UTF-16 offset of the character in the text. */
  readonly source: number;
}

export interface PlacedIcon {
  readonly sprite: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly source: number;
}

export interface TextLine {
  readonly x: number;
  readonly y: number;
  /** Measured width, including a trailing space kept by wrapping. */
  readonly width: number;
  /** UTF-16 range of the line in the text. */
  readonly start: number;
  readonly end: number;
}

export interface TextLayout {
  readonly lines: readonly TextLine[];
  readonly glyphs: readonly PlacedGlyph[];
  readonly icons: readonly PlacedIcon[];
  /** Widest line. */
  readonly width: number;
  /** Lines × the font's `lineHeight`. */
  readonly height: number;
  /** The box's size as the game's font measures this text ({@link requiredSize}). */
  readonly required: { readonly width: number; readonly height: number };
  readonly issues: readonly TextIssue[];
}

/**
 * Maps a `.gui` `format` to an alignment. The exe knows `left`, `right` and
 * `centre`; `center` (283 uses in vanilla) is read as `centre` and anything
 * else as `left` (hypothesis, etch#3).
 */
export function textAlign(format: string | undefined): TextAlign {
  switch (format?.toLowerCase()) {
    case 'centre':
    case 'center':
      return 'centre';
    case 'right':
      return 'right';
    default:
      return 'left';
  }
}

type Item =
  | { kind: 'glyph'; code: number; glyph: BmGlyph; colour: number; start: number; end: number }
  | {
      kind: 'icon';
      sprite: string;
      width: number;
      height: number;
      /** How far it moves the pen when that is not its width (a font icon). */
      advance?: number;
      start: number;
      end: number;
    }
  /** Room that draws nothing: a country flag, or a font icon without its sprite. */
  | { kind: 'gap'; width: number; start: number; end: number }
  /** A character without a glyph: no advance, and it breaks kerning. */
  | { kind: 'none'; start: number; end: number };

interface Row {
  items: Item[];
  width: number;
}

interface Pen {
  width: number;
  /** Previous glyph's code for kerning, or −1. */
  prev: number;
}

const SPACE = 0x20;

function step(font: BmFont, pen: Pen, item: Item): void {
  if (item.kind === 'glyph') {
    if (pen.prev >= 0) pen.width += font.kerning.get(kerningKey(pen.prev, item.code)) ?? 0;
    pen.width += item.glyph.xadvance;
    pen.prev = item.code;
  } else {
    if (item.kind === 'icon') pen.width += item.advance ?? item.width;
    else if (item.kind === 'gap') pen.width += item.width;
    pen.prev = -1;
  }
}

function measure(font: BmFont, items: readonly Item[]): number {
  const pen = { width: 0, prev: -1 };
  for (const item of items) step(font, pen, item);
  return pen.width;
}

const isSpace = (item: Item): boolean => item.kind === 'glyph' && item.code === SPACE;

/**
 * Greedy wrap at spaces, as in etch#9 (verified on the main menu): a word goes
 * to the next line when the line plus a space plus the word is wider than
 * `maxWidth`, and the wrapped line keeps that space when it is measured. A
 * word wider than the line stays whole and overflows (`0x15988E0`; the game
 * draws "Aggressiveness:" on one line past its 64 px box, whose rect still has
 * three lines by {@link requiredSize}).
 */
function wrap(font: BmFont, items: Item[], maxWidth: number): Row[] {
  // A paragraph that fits whole would not be broken by the greedy rule either.
  const whole = measure(font, items);
  if (maxWidth <= 0 || whole <= maxWidth) return [{ items, width: whole }];
  const words: Item[][] = [[]];
  const spaces: Item[] = [];
  for (const item of items) {
    if (isSpace(item)) {
      spaces.push(item);
      words.push([]);
    } else {
      words[words.length - 1]?.push(item);
    }
  }

  const rows: Row[] = [];
  let line = words[0] ?? [];
  const pen: Pen = { width: 0, prev: -1 };
  for (const item of line) step(font, pen, item);
  for (let k = 1; k < words.length; k++) {
    const space = spaces[k - 1];
    const word = words[k] ?? [];
    if (!space) break;
    const spaced = { ...pen };
    step(font, spaced, space);
    const cand = { ...spaced };
    for (const item of word) step(font, cand, item);
    if (line.length > 0 && cand.width > maxWidth) {
      line.push(space);
      rows.push({ items: line, width: spaced.width });
      line = word;
      pen.width = 0;
      pen.prev = -1;
      for (const item of line) step(font, pen, item);
    } else {
      line.push(space, ...word);
      pen.width = cand.width;
      pen.prev = cand.prev;
    }
  }
  rows.push({ items: line, width: pen.width });
  return rows;
}

/** A word this much wide or less does not start a new line by itself. */
const UNBROKEN_WORD = 50;

/**
 * The size the game's font gives a text box for a text (`eu4.exe` 1.37.5 `0x159E510`, slot `+0x78`
 * of the font, which the text object's `GetSize` calls): not the lines it draws, but a count of its
 * own, which is why a box's rect can differ from them.
 *
 * It keeps a line's width and the current word's. At a space (a glyph without height) the line
 * ends when it is wider than `maxWidth`, and the word starts the next one. At any other glyph the
 * line ends once it reaches the inner width, and only when the word is wider than 50 px; the word
 * then starts the next line, and is counted as a new word from there, so a long word takes several
 * lines. A line can so end wider than the inner width, and the box with it (`rebelsize_desc`, 249
 * wide for a `maxWidth` of 246). When the widest line is wider than `maxWidth` it is cut to it, and
 * one line is added (a short word in a narrow box, "1.75M" in 30 px, is two lines).
 */
function requiredSize(
  font: BmFont,
  paragraphs: readonly { readonly items: readonly Item[] }[],
  box: TextBox,
): { width: number; height: number } {
  const border = box.border ?? { x: 0, y: 0 };
  const maxWidth = box.width > 0 ? box.width : 320;
  const inner = maxWidth - 2 * border.x;
  let lines = 0;
  let widest = 0;
  let line = 0;
  let word = 0;
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) {
      widest = Math.max(widest, line);
      lines++;
      line = 0;
      word = 0;
    }
    paragraph.items.forEach((item, at) => {
      if (item.kind === 'icon' || item.kind === 'gap') {
        const width = item.kind === 'icon' ? (item.advance ?? item.width) : item.width;
        line += width;
        word += width;
        return;
      }
      if (item.kind !== 'glyph') return;
      const next = paragraph.items[at + 1];
      const kerning =
        next?.kind === 'glyph' && next.start === item.end
          ? (font.kerning.get(kerningKey(item.code, next.code)) ?? 0)
          : 0;
      line += item.glyph.xadvance + kerning;
      word += item.glyph.xadvance + kerning;
      if (item.glyph.height === 0) {
        if (maxWidth < line) {
          lines++;
          line = word;
        }
        word = 0;
        widest = Math.max(widest, line);
      } else if (inner <= line && UNBROKEN_WORD < word) {
        lines++;
        widest = inner;
        line = word;
        word = 0;
      }
    });
  });
  widest = Math.max(widest, line);
  if (maxWidth < widest) {
    widest = maxWidth;
    lines++;
  }
  lines++;
  return {
    width: 2 * border.x + widest,
    height: lines * font.lineHeight + 2 * border.y,
  };
}

/** Lays out game text in a box with one font. Missing glyphs and icons are reported, never thrown. */
export function layoutText(
  font: BmFont,
  text: string,
  box: TextBox,
  options: TextOptions,
): TextLayout {
  const { atoms, issues } = parseMarkup(text, options.colours, options.colourCode);
  const reported = new Set<string>();
  const report = (issue: TextIssue, key: string): void => {
    if (reported.has(key)) return;
    reported.add(key);
    issues.push(issue);
  };

  // Paragraphs of items, split at line breaks.
  const paragraphs: { items: Item[]; at: number }[] = [];
  let current: Item[] = [];
  let at = 0;
  for (const atom of atoms) {
    if (atom.kind === 'break') {
      paragraphs.push({ items: current, at });
      current = [];
      at = atom.end;
    } else if (atom.kind === 'fontIcon') {
      const size = options.icon?.(atom.sprite);
      if (size) {
        current.push({
          kind: 'icon',
          sprite: atom.sprite,
          ...size,
          advance: FONT_ICON_ADVANCE,
          ...range(atom),
        });
      } else {
        report(
          {
            code: 'missing-icon',
            message: `no sprite ${atom.sprite} for the font icon ¤`,
            ...range(atom),
          },
          `icon:${atom.sprite}`,
        );
        current.push({ kind: 'gap', width: FONT_ICON_ADVANCE, ...range(atom) });
      }
    } else if (atom.kind === 'flag') {
      // The game draws the country's flag here; the preview has no country flags (spec section 3).
      current.push({ kind: 'gap', width: FLAG_ADVANCE, ...range(atom) });
    } else if (atom.kind === 'icon') {
      const sprite = textIconSprite(atom.key);
      const size = options.icon?.(sprite);
      if (size) {
        current.push({ kind: 'icon', sprite, ...size, start: atom.start, end: atom.end });
      } else {
        report(
          {
            code: 'missing-icon',
            message: `no sprite ${sprite} for the text icon £${atom.key}£`,
            start: atom.start,
            end: atom.end,
          },
          `icon:${sprite}`,
        );
        current.push({ kind: 'none', start: atom.start, end: atom.end });
      }
    } else {
      const code = toCp1252(atom.char.codePointAt(0) ?? 0);
      const glyph = code === undefined ? undefined : font.glyphs.get(code);
      if (code !== undefined && glyph) {
        current.push({
          kind: 'glyph',
          code,
          glyph,
          colour: atom.colour,
          start: atom.start,
          end: atom.end,
        });
        continue;
      }
      const hex = (atom.char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
      report(
        code === undefined
          ? {
              code: 'not-cp1252',
              message: `character U+${hex} (${atom.char}) is not in Windows-1252`,
              ...range(atom),
            }
          : {
              code: 'missing-glyph',
              message: `the font has no glyph for U+${hex} (${atom.char})`,
              ...range(atom),
            },
        `char:${atom.char}`,
      );
      current.push({ kind: 'none', ...range(atom) });
    }
  }
  if (atoms.length > 0) paragraphs.push({ items: current, at });

  const border = box.border ?? { x: 0, y: 0 };
  const align = options.align ?? 'left';

  const rows: (Row & { at: number })[] = [];
  for (const p of paragraphs) {
    for (const row of wrap(font, p.items, box.width - 2 * border.x)) {
      rows.push({ ...row, at: row.items[0]?.start ?? p.at });
    }
  }

  const lineHeight = font.lineHeight;
  const height = rows.length * lineHeight;
  const boxHeight = box.height ?? 0;
  let top = box.y + border.y;
  if (options.verticalAlign === 'centre') top = box.y + Math.round((boxHeight - height) / 2);
  else if (options.verticalAlign === 'bottom') top = box.y + boxHeight - border.y - height;

  const lines: TextLine[] = [];
  const glyphs: PlacedGlyph[] = [];
  const icons: PlacedIcon[] = [];
  let width = 0;
  rows.forEach((row, index) => {
    let x = box.x + border.x;
    if (align === 'centre') {
      // Verified in the corpus (etch#44): the game centres in the whole width and then moves the
      // line right by the border, halving both widths separately, rounded down.
      x += Math.floor(box.width / 2) - Math.floor(row.width / 2);
    } else if (align === 'right') x = box.x + box.width - border.x - row.width;
    const y = top + index * lineHeight;
    const last = row.items[row.items.length - 1];
    lines.push({ x, y, width: row.width, start: row.at, end: last?.end ?? row.at });
    width = Math.max(width, row.width);

    let pen = x;
    let prev = -1;
    for (const item of row.items) {
      if (item.kind === 'glyph') {
        if (prev >= 0) pen += font.kerning.get(kerningKey(prev, item.code)) ?? 0;
        const g = item.glyph;
        if (g.width > 0 && g.height > 0) {
          glyphs.push({
            x: pen + g.xoffset,
            y: y + g.yoffset,
            width: g.width,
            height: g.height,
            atlasX: g.x,
            atlasY: g.y,
            colour: item.colour,
            source: item.start,
          });
        }
        pen += g.xadvance;
        prev = item.code;
      } else {
        // Hypothesis: an icon sits at the top of its line.
        if (item.kind === 'icon') {
          icons.push({ sprite: item.sprite, x: pen, y, ...size(item), source: item.start });
          pen += item.advance ?? item.width;
        } else if (item.kind === 'gap') pen += item.width;
        prev = -1;
      }
    }
  });

  const required = requiredSize(font, paragraphs, box);
  return { lines, glyphs, icons, width, height, required, issues };
}

function range(atom: { start: number; end: number }): { start: number; end: number } {
  return { start: atom.start, end: atom.end };
}

function size(item: { width: number; height: number }): { width: number; height: number } {
  return { width: item.width, height: item.height };
}
