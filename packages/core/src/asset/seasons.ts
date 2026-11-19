// The tree seasons of `map/seasons.txt` and the season value the game gives `gfx/FX/tree.shader`
// for a date. The file's eight `tree_*` blocks, each with a `start_date` and an `end_date`
// (`00.MM.DD`, the year left out), are the eight columns of `map/terrain/Tree_season.bmp`, in
// this order. Each day the game finds the block the date falls in, or the gap after a block,
// and the tree shader's `vSeasonLerp.y` becomes the block's index plus how far through the gap
// the date is (0 inside a block). After the last block it runs from 7 towards 8, which the
// season map, repeated along u, takes back to the first column.

import type { BlockNode, ParsedScript, ScalarNode } from '../script/tree.ts';
import { keyOf } from '../model/properties.ts';

/** The tree blocks of `map/seasons.txt`, in the order of the season map's columns. */
export const TREE_SEASONS = [
  'tree_winter',
  'tree_winter2',
  'tree_spring',
  'tree_spring2',
  'tree_summer',
  'tree_summer2',
  'tree_autumn',
  'tree_autumn2',
] as const;

/** The game's calendar: twelve months, 365 days, no leap years. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const YEAR_DAYS = 365;
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** A tree block's days of the year, 0 being 1 January; `end` before `start` runs over the year's end. */
export interface TreeSeasonSpan {
  readonly start: number;
  readonly end: number;
}

/** The season value of a date: its block (`first`), the block after it and how far between. */
export interface TreeSeasonValue {
  readonly first: number;
  readonly second: number;
  /** 0 inside a block; in the gap after it, how far through the gap, 0 to 1. */
  readonly lerp: number;
  /** What the tree shader takes as `vSeasonLerp.y`: `first + lerp`. */
  readonly value: number;
}

/** The day of the year, 0 to 364, of a month (1 to 12) and a day of it. */
export function dayOfYear(month: number, day: number): number {
  let days = 0;
  for (let m = 0; m < month - 1; m++) days += MONTH_DAYS[m] ?? 0;
  return days + day - 1;
}

/** A day of the year as `16 Jul`. */
export function dayName(dayOfTheYear: number): string {
  let rest = ((Math.round(dayOfTheYear) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  for (let m = 0; m < 12; m++) {
    const length = MONTH_DAYS[m] ?? 0;
    if (rest < length) return `${String(rest + 1)} ${MONTH_NAMES[m] ?? ''}`;
    rest -= length;
  }
  return '';
}

function scalarOf(block: BlockNode, key: string): ScalarNode | undefined {
  let found: ScalarNode | undefined;
  for (const entry of block.entries) {
    if (entry.kind === 'property' && keyOf(entry) === key && entry.value?.kind === 'scalar') {
      found = entry.value;
    }
  }
  return found;
}

/** A `YY.MM.DD` date's day of the year; `undefined` when the month or day is not one. */
function dateDay(text: string): number | undefined {
  const parts = text.split('.');
  if (parts.length !== 3) return undefined;
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12) {
    return undefined;
  }
  if (day < 1 || day > (MONTH_DAYS[month - 1] ?? 0)) return undefined;
  return dayOfYear(month, day);
}

/**
 * The tree blocks of a parsed `map/seasons.txt`, by column (`undefined` for a block that is
 * missing or has no readable dates), and what could not be read.
 */
export function readTreeSeasons(parsed: ParsedScript): {
  spans: (TreeSeasonSpan | undefined)[];
  problems: string[];
} {
  const problems: string[] = [];
  const spans = TREE_SEASONS.map((name) => {
    let block: BlockNode | undefined;
    for (const entry of parsed.entries) {
      if (entry.kind === 'property' && keyOf(entry) === name && entry.value?.kind === 'block') {
        block = entry.value;
      }
    }
    if (block === undefined) {
      problems.push(`no ${name}`);
      return undefined;
    }
    const start = scalarOf(block, 'start_date');
    const end = scalarOf(block, 'end_date');
    const startDay = start === undefined ? undefined : dateDay(start.text);
    const endDay = end === undefined ? undefined : dateDay(end.text);
    if (startDay === undefined || endDay === undefined) {
      problems.push(`${name}: no start_date and end_date the preview can read`);
      return undefined;
    }
    return { start: startDay, end: endDay };
  });
  return { spans, problems };
}

/**
 * The season value the game gives the tree shader on a day of the year: the first block, in
 * column order, that the day falls in or in the gap after which it falls (the gap runs to the
 * next column's block, the first after the last). `undefined` when none holds it, as when the
 * blocks are missing.
 */
export function treeSeasonAt(
  spans: readonly (TreeSeasonSpan | undefined)[],
  day: number,
): TreeSeasonValue | undefined {
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (span === undefined) continue;
    const end = span.end < span.start ? span.end + YEAR_DAYS : span.end;
    const inside = day < span.start ? day + YEAR_DAYS : day;
    if (inside <= end) return { first: i, second: i, lerp: 0, value: i };
    const next = (i + 1) % spans.length;
    const following = spans[next];
    if (following === undefined) continue;
    let nextStart = following.start;
    while (nextStart < end) nextStart += YEAR_DAYS;
    let after = day;
    while (after < end) after += YEAR_DAYS;
    if (after <= nextStart) {
      const lerp = nextStart === end ? 0 : (after - end) / (nextStart - end);
      return { first: i, second: next, lerp, value: i + lerp };
    }
  }
  return undefined;
}
