import { describe, expect, it } from 'vitest';
import { fitText, kerningKey, type BmFont, type BmGlyph, type TextFit } from '../src/index.ts';

// Letters and digits 5 wide, the space 3, the period 2; "A" then "V" kerns by −2.
const glyph = (id: number, xadvance: number): [number, BmGlyph] => [
  id,
  { id, x: 0, y: 0, width: xadvance, height: 8, xoffset: 0, yoffset: 0, xadvance },
];
const letters = 'abcdefghijklmnopqrstuvwxyzADEV0123456789'
  .split('')
  .map((c) => glyph(c.charCodeAt(0), 5));
const font: BmFont = {
  lineHeight: 10,
  base: 8,
  scaleW: 64,
  scaleH: 64,
  glyphs: new Map([glyph(0x20, 3), glyph(0x2e, 2), ...letters]),
  kerning: new Map([[kerningKey(0x41, 0x56), -2]]),
};
const fit = (text: string, box: Partial<TextFit>): string =>
  fitText(font, text, { width: 60, height: 10, truncate: true, ...box }).text;

describe('fitText', () => {
  it('cuts before the fourth glyph back from the one that overflows, and adds " ..."', () => {
    // "East Damerian" is 63 wide; it overflows 60 at the "n", so "eria" and the "n" go.
    expect(fitText(font, 'East Damerian', { width: 60, height: 10, truncate: true })).toEqual({
      text: 'East Dam ...',
      truncated: true,
    });
  });

  it('leaves text that fits as it is, even when its one line is taller than the box', () => {
    expect(fit('East Damerian', { width: 63 })).toBe('East Damerian');
    expect(fit('ab', { height: 4 })).toBe('ab');
    expect(fit('a\nb', { height: 4 })).toBe('a');
  });

  it('takes the border off both sides', () => {
    expect(fit('East Damerian', { width: 69, border: { x: 3, y: 0 } })).toBe('East Damerian');
    expect(fit('East Damerian', { width: 68, border: { x: 3, y: 0 } })).toBe('East Dam ...');
    expect(fit('East Damerian', { height: 14, border: { x: 0, y: 2 } })).toBe('East Dam ...');
  });

  it('cuts without " ..." before five glyphs', () => {
    expect(fitText(font, 'abcdef', { width: 12, height: 10, truncate: true })).toEqual({
      text: 'ab',
      truncated: false,
    });
  });

  it('counts kerning with the next character', () => {
    expect(fit('AVAVAVAVAVAVAV', { width: 56 })).toBe('AVAVAVAVAVAVAV');
    expect(fit('AVAVAVAVAVAVAV', { width: 55 })).toBe('AVAVAVAVA ...');
  });

  it('breaks lines of its own and cuts on the line that goes below the box', () => {
    // "aaaa " fills the first line, "bbbb" and its space the second; the space overflows it.
    expect(fit('aaaa bbbb cccc', { width: 25, height: 20 })).toBe('aaaa  ...');
    expect(fit('aaaa bbbb cccc', { width: 25, height: 30 })).toBe('aaaa bbbb cccc');
  });

  it('ends at a line break with " ..." when the line has room for it, else goes back', () => {
    expect(fit('ab\ncd', {})).toBe('ab');
    expect(fit('abcde\nf', { width: 50 })).toBe('abcde ...');
    expect(fit('abcdefg\nh', { width: 40 })).toBe('ab ...');
    expect(fit('abcde\\nf', { width: 50 })).toBe('abcde ...');
    expect(fit('abcde\n', { width: 50 })).toBe('abcde');
  });

  it('gives colour codes no room and keeps them', () => {
    expect(fit('§Rab§!cdefgh', { width: 30 })).toBe('§Rab§! ...');
  });

  it('measures inline icons by their texture, font icons by 16 and flags by 18', () => {
    const iconWidth = (key: string): number => (key === 'gold' ? 30 : 0);
    expect(fit('£gold£abcdef', { width: 55, iconWidth })).toBe('£gold£a ...');
    // With ignore_special_chars the font has no glyph for "£": "goldabcdef" is 50 wide.
    expect(fit('£gold£abcdef', { width: 55, iconWidth, specialChars: false })).toBe('£gold£abcdef');
    // The digit after "¤" is a glyph here, unlike in the text drawer.
    expect(fit('¤1abcdefgh', { width: 50 })).toBe('¤1a ...');
    expect(fit('@SWEabcdefgh', { width: 50 })).toBe('@SWEab ...');
  });

  it('wraps without truncate and drops the lines below the box', () => {
    const wrap = { width: 25, truncate: false };
    expect(fit('aaaa bbbb cccc', { ...wrap, height: 30 })).toBe('aaaa\nbbbb\ncccc');
    expect(fit('aaaa bbbb cccc', { ...wrap, height: 20 })).toBe('aaaa\nbbbb\n');
    expect(fit('aaaaaaaa', { ...wrap, height: 30 })).toBe('aaaaa\naaa');
    expect(fit('a\nb\nc', { ...wrap, height: 20 })).toBe('a\nb\n');
  });
});
