/**
 * The game's own ways of writing a number in a text box, for a profile's save `format`: eu4.exe
 * 1.37.5's formatters, read statically from the top bar's refresh (`0x1435530`), the country
 * diplomacy view's daily update (`0xEFD450`) and the stability view's (`0xF87E80`). The game keeps
 * a value as a fixed-point number, a thousandth a unit (`raw`), and divides in single precision;
 * `Math.fround` does the same, so the texts are the game's to the digit. Colour codes (`§W`) are
 * written as the game writes them: they colour the text and take no width.
 */

/** A save value as the game holds it: thousandths, in a 32-bit integer. */
export function fixedPoint(value: number): number {
  return Math.round(value * 1000) | 0;
}

const f = Math.fround;
/** C's integer division: towards zero. */
const div = (a: number, b: number): number => Math.trunc(a / b);
const pad3 = (n: number): string => String(n).padStart(3, '0');

/** The whole part, `-` before a negative value (the diplomacy view's score and prestige). */
export function wholeText(raw: number): string {
  return (raw < 0 ? '-' : '') + String(div(Math.abs(raw), 1000));
}

/** The whole part, `+` before a positive one (the diplomacy and stability views' stability). */
export function plusText(raw: number): string {
  return (raw < 0 ? '-' : raw > 0 ? '+' : '') + String(div(Math.abs(raw), 1000));
}

/** The top bar's prestige and power projection: `§W+100`, `§R-5`, `§Y0` (`0x1436375`). */
export function signedText(raw: number): string {
  const n = div(raw, 1000);
  return (n > 0 ? '§W+' : n < 0 ? '§R' : '§Y') + String(n);
}

/** The top bar's stability: `§W+` from zero up, so 0 is `§W+0` (`0x1435FD1`). */
export function signedStabilityText(raw: number): string {
  return (raw >= 0 ? '§W+' : '§R') + String(Math.trunc(f(f(raw) / 1000)));
}

/** The top bar's treasury: whole ducats, thousands with `k` from 10000 (`0x14341E0`). */
export function treasuryText(raw: number): string {
  const n = Math.trunc(f(f(raw) / 1000));
  return n >= 10000 || n < -9999 ? `${String(div(n, 1000))}k` : String(n);
}

/**
 * The top bar's manpower, a value in thousands of men (the regiment's shown strength,
 * `0xAE8C10`): `750`, `45,500`, `2534k` above 99999 men.
 */
export function menText(raw: number): string {
  const men = Math.trunc(f(f(1000) * f(f(raw) / 1000)));
  if (men > 99999) return `${String(div(men, 1000))}k`;
  if (men < 1000) return String(men);
  return `${String(div(men, 1000))},${pad3(men % 1000)}`;
}

/** The diplomacy view's manpower, in thousands of men: `0`, else `23k` (`0xAE9170`). */
export function menShortText(raw: number): string {
  const n = div(Math.trunc(f(f(f(raw) / 1000) * 1000)), 1000);
  return n === 0 ? '0' : `${String(n)}k`;
}

/**
 * A count of men given in thousands, as the diplomacy view writes its armies' strength
 * (the game's short number text without colour, `0x14BF2E0`, no decimals): up to 999, then `9k`, `2M`, `1G`, each
 * suffix from 1000 of the one below, truncated. The game multiplies the men by 1000 in 32 bits.
 */
export function menSiText(raw: number): string {
  const fixed = (raw * 1000) | 0;
  const q = div(fixed, 1000);
  if (Math.abs(q) < 1000) return (fixed < 0 ? '-' : '') + String(div(Math.abs(fixed), 1000));
  const a = Math.abs(q);
  let scale = 1;
  let i = 0;
  for (let t = a; t > 999; t = div(t, 1000)) {
    scale *= 1000;
    i += 1;
  }
  return `${q < 0 ? '-' : ''}${String(div(a, scale))}${['', 'k', 'M', 'G'][i] ?? ''}`;
}

/** The game's formats, by the profile's `format` name. */
export const GAME_NUMBER_FORMATS = {
  whole: wholeText,
  plus: plusText,
  signed: signedText,
  signedStability: signedStabilityText,
  treasury: treasuryText,
  men: menText,
  menShort: menShortText,
  menSi: menSiText,
} as const;

export type GameNumberFormat = keyof typeof GAME_NUMBER_FORMATS;
