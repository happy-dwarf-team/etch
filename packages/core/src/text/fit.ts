/**
 * How an `instantTextBoxType` with `fixedsize = yes` fits its text into the box before it is
 * drawn: cut with " ..." (`truncate = yes`, the default) or wrapped with the lines below the box
 * dropped (`truncate = no`). Verified in `eu4.exe` 1.37.5 (EU4 engine lab,
 * docs/etch-text-truncation.md): the text node's set-text `0x15F42C0` calls the font's slot
 * `+0x80`, `0x159F510`, only for a `fixedsize` box; this module follows that function.
 */

import { kerningKey, type BmFont } from './bmfont.ts';
import { toCp1252 } from './cp1252.ts';
import { FLAG_ADVANCE, FONT_ICON_ADVANCE } from './markup.ts';

/** The box a fixed-size text box fits its text into, as the text node holds it. */
export interface TextFit {
  /** `maxWidth`; the node makes 0 into 200. */
  readonly width: number;
  /** `maxHeight`; the node makes 0 into 200. */
  readonly height: number;
  readonly border?: { readonly x: number; readonly y: number };
  /** `truncate`, `yes` unless the `.gui` says `no`: cut with " ..." rather than wrap. */
  readonly truncate: boolean;
  /** `false` with `ignore_special_chars = yes`: `§`, `£`, `¤`, `@` and `{` are then characters. */
  readonly specialChars?: boolean;
  /** Width of the texture of the inline icon `£key£`, by key, or 0 when it does not exist. */
  readonly iconWidth?: (key: string) => number;
}

export interface FittedText {
  /** The text to draw: cut, with line breaks put in, or as it was. */
  readonly text: string;
  /** Whether " ..." was put at the end. */
  readonly truncated: boolean;
}

/** What the cut puts at its end: a space and three periods (`0x1D267F0`), not the glyph "…". */
export const ELLIPSIS = ' ...';

/** How many glyphs the cut keeps track of: it goes back to the oldest of them. */
const RECENT = 5;

/** The characters of an icon key after `£` (`0x159F510`: digits, letters, `_` and `|`). */
const ICON_KEY = /[0-9A-Za-z_|]/;

/**
 * Fits text into a fixed-size box the way `0x159F510` does. It measures the text with the
 * font's advances and kerning and breaks it into lines of its own:
 *
 * - A line ends at a line break, or before the glyph that makes it wider than `maxWidth − 2 ×
 *   border.x`. The next line then starts as wide as the word so far.
 * - When the lines are taller than `maxHeight − 2 × border.y`, at the glyph or line break that
 *   overflows: with `truncate` the text is cut before the fourth glyph back from it and " ..."
 *   is put after it (before the line break when the line has room for " ...", and with fewer
 *   than five glyphs so far the text is just cut there); without `truncate` the lines that fit
 *   are kept and the rest is dropped.
 * - Without `truncate` the line breaks it makes are put into the text: at the last space of the
 *   line, which is dropped, or before the glyph when the line has no space.
 */
export function fitText(font: BmFont, text: string, fit: TextFit): FittedText {
  const border = fit.border ?? { x: 0, y: 0 };
  const special = fit.specialChars ?? true;
  const code = (i: number): number | undefined => {
    const unit = text.charCodeAt(i);
    return Number.isNaN(unit) ? undefined : toCp1252(unit);
  };
  const kerning = (first: number, second: number | undefined): number =>
    second === undefined ? 0 : (font.kerning.get(kerningKey(first, second)) ?? 0);

  const roomX = (fit.width === 0 ? 320 : fit.width) - 2 * border.x;
  const roomY = fit.height - 2 * border.y;
  const lineHeight = font.lineHeight;
  let ellipsis = 0;
  for (let k = 0; k < ELLIPSIS.length; k++) {
    const c = ELLIPSIS.charCodeAt(k);
    const glyph = font.glyphs.get(c);
    if (glyph === undefined) continue;
    ellipsis += glyph.xadvance;
    if (k + 1 < ELLIPSIS.length) ellipsis += kerning(c, ELLIPSIS.charCodeAt(k + 1));
  }

  let bottom = lineHeight;
  let line = 0;
  let word = 0;
  let lastSpace = 0;
  let lineStart = 0;
  let wrapped = '';
  const recent: number[] = [];
  const cut = (at: number, ellipsisAt: number | undefined): FittedText =>
    fit.truncate
      ? ellipsisAt === undefined
        ? { text: text.slice(0, at), truncated: false }
        : { text: text.slice(0, ellipsisAt) + ELLIPSIS, truncated: true }
      : { text: wrapped, truncated: false };

  for (let i = 0; i < text.length; i++) {
    const c = code(i);
    if (special) {
      if (c === 0xa7) {
        // `§X`: a colour code takes no room.
        i++;
        continue;
      }
      if (c === 0x7b) {
        // `{` and three characters: 8 pixels.
        i += 3;
        line += 8;
        word += 8;
        continue;
      }
      if (c === 0x40) {
        i += 3;
        line += FLAG_ADVANCE;
        word += FLAG_ADVANCE;
        continue;
      }
      if (c === 0xa3) {
        let end = i + 1;
        while (end < text.length && ICON_KEY.test(text[end] ?? '')) end++;
        const width = fit.iconWidth?.(text.slice(i + 1, end)) ?? 0;
        line += width;
        word += width;
        // The character after the key, the closing `£`, is skipped too.
        i = end;
        continue;
      }
      if (c === 0xa4) {
        line += FONT_ICON_ADVANCE;
        continue;
      }
    }

    // As localisation writes it, `\n` is two characters; the game reads one line feed.
    const breakLength = c === 0x0a || c === 0x0d ? 1 : c === 0x5c && text[i + 1] === 'n' ? 2 : 0;
    const space = c === 0x20 ? i : lastSpace;
    if (c === 0x20) word = 0;
    const glyph = c === undefined || breakLength === 2 ? undefined : font.glyphs.get(c);
    if (glyph === undefined) {
      if (breakLength === 0) {
        lastSpace = space;
        continue;
      }
      word = 0;
      bottom += lineHeight;
      if (!fit.truncate) {
        wrapped += `${text.slice(lineStart, i)}\n`;
        lineStart = i + breakLength;
      }
      lastSpace = i;
      if (bottom > roomY) {
        const more = i + breakLength < text.length && recent.length >= RECENT;
        const back = roomX <= line + ellipsis ? recent[0] : i;
        return cut(i, more ? back : undefined);
      }
      line = 0;
      i += breakLength - 1;
      continue;
    }

    recent.push(i);
    if (recent.length > RECENT) recent.shift();
    const advance = glyph.xadvance + (i + 1 < text.length ? kerning(c ?? 0, code(i + 1)) : 0);
    line += advance;
    word += advance;
    if (line <= roomX) {
      lastSpace = space;
      continue;
    }

    bottom += lineHeight;
    let next = word;
    if (!fit.truncate && lineStart < space) {
      wrapped += `${text.slice(lineStart, space)}\n`;
      lineStart = space + 1;
      lastSpace = space;
    } else if (!fit.truncate) {
      wrapped += `${text.slice(lineStart, i)}\n`;
      lineStart = i;
      lastSpace = i;
      next = 0;
    } else {
      lastSpace = space;
    }
    if (bottom > roomY) return cut(i, recent.length >= RECENT ? recent[0] : undefined);
    word = 0;
    line = next;
  }
  return fit.truncate
    ? { text, truncated: false }
    : { text: wrapped + text.slice(lineStart), truncated: false };
}
