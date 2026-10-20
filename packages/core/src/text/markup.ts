/**
 * The text markup the game expands while drawing (etch#3, section 5):
 * `§X … §!` colours from `textcolors`, `£key£` inline icons and line breaks.
 * `$…$` and `[…]` substitutions are left as they are: the game's code fills
 * them, and the offline renderer shows them literally (spec section 3).
 */

/** An RGB colour of a `textcolors` table, 0–255 per channel. */
export type Rgb = readonly [number, number, number];

export interface TextColours {
  /** The font's `color`, `0xAARRGGBB`, used outside any `§` code. */
  readonly base: number;
  /** The font's own `textcolors`, which win over the global table. */
  readonly font?: Readonly<Record<string, Rgb>>;
  /** The global `textcolors` of `bitmapfonts` in `core.gfx` and the mods. */
  readonly global?: Readonly<Record<string, Rgb>>;
}

export interface TextIssue {
  readonly code: 'missing-glyph' | 'not-cp1252' | 'unknown-colour' | 'missing-icon';
  readonly message: string;
  /** UTF-16 range in the laid-out text. */
  readonly start: number;
  readonly end: number;
}

export type Atom =
  | {
      readonly kind: 'char';
      /** The character as written. */
      readonly char: string;
      /** `0xAARRGGBB`. */
      readonly colour: number;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly kind: 'icon';
      /** The key between the `£` signs. */
      readonly key: string;
      readonly start: number;
      readonly end: number;
    }
  | { readonly kind: 'break'; readonly start: number; readonly end: number };

/** The sprite an inline icon `£key£` draws (the exe holds the prefix `GFX_text_`). */
export function textIconSprite(key: string): string {
  return `GFX_text_${key}`;
}

/** Looks up a `§` colour letter: the font's table first, then the global one. */
export function colourOf(colours: TextColours, letter: string): number | undefined {
  const rgb = colours.font?.[letter] ?? colours.global?.[letter];
  if (!rgb) return undefined;
  const alpha = (colours.base >>> 24) & 0xff;
  return ((alpha << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) >>> 0;
}

/**
 * Splits text into characters with their colour, icons and line breaks.
 *
 * - `§X` pushes the colour of letter X, `§!` pops it; codes nest. An unknown
 *   letter is reported and keeps the current colour, so that `§!` still
 *   balances.
 * - `£key£` is an icon when the key is not empty and holds no white space;
 *   otherwise `£` is an ordinary character (hypothesis: `£5` in prose).
 * - A line feed and the two characters `\n` (as localisation writes it) break
 *   the line. Carriage returns are dropped.
 */
export function parseMarkup(
  text: string,
  colours: TextColours,
  initialColour?: string,
): { atoms: Atom[]; issues: TextIssue[] } {
  const atoms: Atom[] = [];
  const issues: TextIssue[] = [];
  const stack: number[] = [];
  let colour = colours.base >>> 0;
  if (initialColour !== undefined) colour = colourOf(colours, initialColour) ?? colour;

  let i = 0;
  while (i < text.length) {
    const c = text[i] ?? '';
    if (c === '§') {
      const letter = text[i + 1];
      if (letter === '!') {
        colour = stack.pop() ?? colours.base >>> 0;
      } else {
        stack.push(colour);
        const next = letter === undefined ? undefined : colourOf(colours, letter);
        if (next === undefined) {
          issues.push({
            code: 'unknown-colour',
            message:
              letter === undefined
                ? 'colour code § at the end of the text'
                : `unknown text colour §${letter}`,
            start: i,
            end: Math.min(i + 2, text.length),
          });
        } else {
          colour = next;
        }
      }
      i += 2;
      continue;
    }
    if (c === '£') {
      const close = text.indexOf('£', i + 1);
      const key = close > i + 1 ? text.slice(i + 1, close) : '';
      if (key !== '' && !/\s/.test(key)) {
        atoms.push({ kind: 'icon', key, start: i, end: close + 1 });
        i = close + 1;
        continue;
      }
    }
    if (c === '\n' || (c === '\\' && text[i + 1] === 'n')) {
      const end = c === '\n' ? i + 1 : i + 2;
      atoms.push({ kind: 'break', start: i, end });
      i = end;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    const unit = text.charCodeAt(i);
    const char =
      unit >= 0xd800 && unit < 0xdc00 ? String.fromCodePoint(text.codePointAt(i) ?? unit) : c;
    atoms.push({ kind: 'char', char, colour, start: i, end: i + char.length });
    i += char.length;
  }
  return { atoms, issues };
}
