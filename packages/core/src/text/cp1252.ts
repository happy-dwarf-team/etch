/**
 * Windows-1252 code points for glyph lookup (ADR 0001). BMFont `char id`s in
 * the game's fonts are Windows-1252 bytes, while game text is a JavaScript
 * string: interface files decoded as Windows-1252, localisation as UTF-8.
 */

/** Characters of 0x80–0x9F that Windows-1252 maps away from Latin-1. */
const HIGH: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

/**
 * Bytes 0x81, 0x8D, 0x8F, 0x90 and 0x9D have no character in Windows-1252.
 * `TextDecoder('windows-1252')` passes them through as U+0081 and so on, so
 * they map back to themselves.
 */
const UNASSIGNED = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

/** The Windows-1252 byte of a Unicode code point, or `undefined` when it has none. */
export function toCp1252(codePoint: number): number | undefined {
  if (codePoint < 0x80 || (codePoint >= 0xa0 && codePoint <= 0xff)) return codePoint;
  if (UNASSIGNED.has(codePoint)) return codePoint;
  return HIGH.get(codePoint);
}
