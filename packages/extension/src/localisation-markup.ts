// The text of a localisation key's hover as the game colours it: `§Y … §!` in the colours of the
// playset's `textcolors`, the icons `£key£` and `¤` as small pictures where Etch finds their
// sprites, and line breaks. It reads the text with the core's `parseMarkup`, as the preview does.
// The result is HTML for a Markdown hover (VS Code colours a `<span style="color:#…;">`); no
// `vscode` here, so the unit tests run it.

import { parseMarkup, textIconSprite, type Atom, type Rgb } from '@etch/core';

/**
 * `parseMarkup` gives each character the colour of its `§` code. To tell the text outside any
 * code from a code whose colour is black, the codes are numbered here in place of their colours:
 * letter `i` of the table gets colour `i + 1`, and 0 is the text outside any code.
 */
function numbered(colours: Readonly<Record<string, Rgb>>): {
  letters: string[];
  table: Record<string, Rgb>;
} {
  const letters = Object.keys(colours);
  const table: Record<string, Rgb> = {};
  letters.forEach((letter, index) => {
    table[letter] = [0, ((index + 1) >> 8) & 0xff, (index + 1) & 0xff];
  });
  return { letters, table };
}

function atomsOf(text: string, colours: Readonly<Record<string, Rgb>>): Atom[] {
  return parseMarkup(text, { base: 0, global: numbered(colours).table }).atoms;
}

/** The sprite an icon atom draws, or undefined for another atom. */
function spriteOf(atom: Atom): string | undefined {
  if (atom.kind === 'icon') return textIconSprite(atom.key);
  if (atom.kind === 'fontIcon') return atom.sprite;
  return undefined;
}

/** The sprites the text's icons draw, in text order, each once. */
export function iconSprites(text: string): string[] {
  const sprites = atomsOf(text, {}).flatMap((atom) => spriteOf(atom) ?? []);
  return [...new Set(sprites)];
}

/**
 * Text as HTML that shows it as written: every character outside letters, digits and spaces as a
 * numeric reference, so that neither HTML nor Markdown reads it as markup.
 */
export function escapeHtml(text: string): string {
  return text.replace(/[^\p{L}\p{N} ]/gu, (char) => `&#${String(char.codePointAt(0))};`);
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The text as hover HTML: each run of one `§` colour in a coloured `<span>`, the text outside any
 * code in the hover's own colour; an icon as its picture from `icons` (a `data:` URI by sprite
 * name), else as written; flags `@TAG`, `$…$` and `[…]` as written, since the game fills them in
 * at play time.
 */
export function colouredText(
  text: string,
  colours: Readonly<Record<string, Rgb>>,
  icons: ReadonlyMap<string, string>,
): string {
  const { letters } = numbered(colours);
  let html = '';
  let run = '';
  let runColour = 0;
  const flush = (): void => {
    if (run === '') return;
    const letter = runColour === 0 ? undefined : letters[runColour - 1];
    const rgb = letter === undefined ? undefined : colours[letter];
    html += rgb === undefined ? run : `<span style="color:${hex(rgb)};">${run}</span>`;
    run = '';
  };
  for (const atom of atomsOf(text, colours)) {
    if (atom.kind === 'char') {
      if (atom.colour !== runColour) flush();
      runColour = atom.colour;
      run += escapeHtml(atom.char);
      continue;
    }
    flush();
    if (atom.kind === 'break') {
      html += '<br>';
      continue;
    }
    const written = text.slice(atom.start, atom.end);
    const sprite = spriteOf(atom);
    const uri = sprite === undefined ? undefined : icons.get(sprite);
    html +=
      uri === undefined
        ? escapeHtml(written)
        : `<img src="${uri}" alt="${escapeHtml(written)}" title="${escapeHtml(written)}">`;
  }
  flush();
  return html;
}
