/**
 * A country's three unit colours (`color1`, `color2`, `color3`), which `PdxMeshColor` parts show
 * through their specular map's red, green and blue, as EU4 1.37.5 picks them (the EU4 engine lab,
 * `docs/eu4-country-unit-colours.md`):
 *
 * - The game reads every file of `common/country_colors`, in name order. A block `TAG = { … }`
 *   sets the colours it has, in the order `color1`, `color2`, `color3`; a later block of the same
 *   tag sets again only the colours it has.
 * - Each colour no block sets comes from the tag's flag, `gfx/flags/<TAG>.tga`: the game counts
 *   the flag's pixels in 512 bins (the top three bits of red, green and blue), takes the fullest
 *   bin for `color1`, then the fullest bin that is not close to it for `color2`, then the fullest
 *   bin close to neither for `color3`, where close means less than five bins apart in red, green
 *   and blue alike. A colour is the middle of its bin (16, 48, …, 240 on 0–255). `color3` is
 *   `color1` again when its bin holds no more than a tenth of `color1`'s pixels, and `color2` is
 *   white when no other bin has a pixel. The game's own cache of these colours
 *   (`gfx/flags/flagfilescolor.txt` in the user folder) matches this rule on all 1020 flags of the
 *   game.
 */
import { readFile } from 'node:fs/promises';
import { decodeGameText } from '../game-text.ts';
import { parseScript } from '../script/parse.ts';
import type { ParsedScript, ValueNode } from '../script/tree.ts';
import type { GameFiles } from './game-files.ts';

/** A colour as red, green and blue from 0 to 255. */
export type Rgb = readonly [number, number, number];

/** The keys of a `common/country_colors` block, in the only order the game reads them. */
export const COUNTRY_COLOUR_KEYS = ['color1', 'color2', 'color3'] as const;

/** The colours `common/country_colors` gives a tag, by key, with the file that set each. */
export interface CountryColourEntry {
  readonly colours: readonly (Rgb | undefined)[];
  /** The game path of the file whose block set each colour. */
  readonly files: readonly (string | undefined)[];
}

/** What the playset's `common/country_colors` files give each tag, and what Etch could not read. */
export interface CountryColourTable {
  readonly tags: ReadonlyMap<string, CountryColourEntry>;
  readonly problems: readonly string[];
}

/** The `{ r g b }` of a colour key: three numbers from 0 to 255, or `undefined`. */
function rgbOf(value: ValueNode | undefined): Rgb | undefined {
  if (value?.kind !== 'block') return undefined;
  const numbers = value.entries.map((entry) =>
    entry.kind === 'scalar' && /^-?\d+(?:\.\d+)?$/.test(entry.text) ? Number(entry.text) : NaN,
  );
  if (numbers.length !== 3 || numbers.some((n) => Number.isNaN(n))) return undefined;
  const [r = 0, g = 0, b = 0] = numbers.map((n) => Math.max(0, Math.min(255, Math.round(n))));
  return [r, g, b];
}

/**
 * Reads one `common/country_colors` file into `tags`: each block's colours in the game's order;
 * a key out of that order, or a colour that is not three numbers, is not read and is named in
 * `problems`.
 */
export function readCountryColours(
  parsed: ParsedScript,
  path: string,
  tags: Map<string, CountryColourEntry>,
  problems: string[],
): void {
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'block') continue;
    const tag = entry.key.text.toUpperCase();
    const before = tags.get(tag);
    const colours = [...(before?.colours ?? [undefined, undefined, undefined])];
    const files = [...(before?.files ?? [undefined, undefined, undefined])];
    let next = 0;
    for (const item of entry.value.entries) {
      if (item.kind !== 'property') continue;
      const key = item.key.text.toLowerCase();
      const index = COUNTRY_COLOUR_KEYS.indexOf(key as (typeof COUNTRY_COLOUR_KEYS)[number]);
      if (index < 0) continue;
      if (index < next) {
        problems.push(
          `${path}: ${tag}'s ${key} comes after ${COUNTRY_COLOUR_KEYS[next - 1] ?? ''}: the game reads color1, color2 and color3 only in that order`,
        );
        continue;
      }
      const rgb = rgbOf(item.value);
      if (rgb === undefined) {
        problems.push(`${path}: ${tag}'s ${key} is not three numbers from 0 to 255`);
        continue;
      }
      colours[index] = rgb;
      files[index] = path;
      next = index + 1;
    }
    tags.set(tag, { colours, files });
  }
}

/** Reads the playset's `common/country_colors` files in the order the game reads them. */
export async function loadCountryColours(files: GameFiles): Promise<CountryColourTable> {
  const tags = new Map<string, CountryColourEntry>();
  const problems: string[] = [];
  for (const file of await files.list('common/country_colors', '.txt')) {
    const bytes = await readFile(file.absolutePath).catch(() => undefined);
    if (bytes === undefined) {
      problems.push(`${file.path}: cannot be read`);
      continue;
    }
    const text = decodeGameText(bytes, 'script').text;
    readCountryColours(parseScript(text, { script: true }), file.path, tags, problems);
  }
  return { tags, problems };
}

/** Bins closer than this in red, green and blue alike are one colour to the flag rule. */
const CLOSE = 5;

/**
 * The three colours the game takes from a flag's pixels (`rgba`, four bytes a pixel; alpha is not
 * counted), as the module comment says.
 */
export function flagColours(rgba: Uint8Array): [Rgb, Rgb, Rgb] {
  const counts = new Uint16Array(512);
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    const bin =
      ((rgba[i] ?? 0) >> 5) * 64 + ((rgba[i + 1] ?? 0) >> 5) * 8 + ((rgba[i + 2] ?? 0) >> 5);
    // The game's counters stop at 65535.
    if ((counts[bin] ?? 0) < 0xffff) counts[bin] = (counts[bin] ?? 0) + 1;
  }
  const picks: { count: number; r: number; g: number; b: number }[] = [];
  for (let slot = 0; slot < 3; slot++) {
    let best = { count: -1, r: -1, g: -1, b: -1 };
    for (let r = 0; r < 8; r++) {
      for (let g = 0; g < 8; g++) {
        for (let b = 0; b < 8; b++) {
          const close = picks.some(
            (p) =>
              Math.abs(r - p.r) < CLOSE && Math.abs(g - p.g) < CLOSE && Math.abs(b - p.b) < CLOSE,
          );
          const count = counts[r * 64 + g * 8 + b] ?? 0;
          // Strictly more: of bins with equal counts the first in this order wins.
          if (!close && count > best.count) best = { count, r, g, b };
        }
      }
    }
    picks.push(best);
  }
  const middle = (p: { r: number; g: number; b: number }): Rgb => [
    p.r * 32 + 16,
    p.g * 32 + 16,
    p.b * 32 + 16,
  ];
  const [first, second, third] = picks as [(typeof picks)[0], (typeof picks)[0], (typeof picks)[0]];
  const color1: Rgb = first.count > 0 ? middle(first) : [255, 255, 255];
  const color2: Rgb = second.count > 0 ? middle(second) : [255, 255, 255];
  const color3: Rgb = third.count < 1 || third.count <= first.count * 0.1 ? color1 : middle(third);
  return [color1, color2, color3];
}

/** `#rrggbb` of a colour. */
export function hexOf([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
