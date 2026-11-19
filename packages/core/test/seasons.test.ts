/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dayName,
  dayOfYear,
  readTreeSeasons,
  treeSeasonAt,
  TREE_SEASONS,
} from '../src/asset/index.ts';
import { parseScript } from '../src/script/index.ts';

// Eight blocks of the fixture's own, one a month apart; the second runs over the year's end.
const SEASONS = `winter = { start_date = 00.12.01 end_date = 00.02.28 hsv_north = { 0 0 1 } }
tree_winter = { start_date = 00.11.20 end_date = 00.11.30 }
tree_winter2 = { start_date = 00.12.20 end_date = 00.01.10 }
tree_spring = { start_date = 00.02.01 end_date = 00.02.10 }
tree_spring2 = { start_date = 00.03.01 end_date = 00.04.10 }
tree_summer = { start_date = 00.05.01 end_date = 00.05.31 }
tree_summer2 = { start_date = 00.06.10 end_date = 00.09.01 }
tree_autumn = { start_date = 00.10.01 end_date = 00.10.10 }
tree_autumn2 = { start_date = 00.10.21 end_date = 00.11.01 }
`;

const spans = readTreeSeasons(parseScript(SEASONS)).spans;
const at = (month: number, day: number) => treeSeasonAt(spans, dayOfYear(month, day));

describe('tree seasons', () => {
  it('counts the days of the game calendar', () => {
    expect(dayOfYear(1, 1)).toBe(0);
    expect(dayOfYear(3, 1)).toBe(59);
    expect(dayOfYear(12, 31)).toBe(364);
    expect(dayName(0)).toBe('1 Jan');
    expect(dayName(196)).toBe('16 Jul');
    expect(dayName(364)).toBe('31 Dec');
    expect(dayName(365)).toBe('1 Jan');
  });

  it('reads the eight tree blocks in column order', () => {
    const read = readTreeSeasons(parseScript(SEASONS));
    expect(read.problems).toEqual([]);
    expect(read.spans).toHaveLength(TREE_SEASONS.length);
    expect(read.spans[1]).toEqual({ start: dayOfYear(12, 20), end: dayOfYear(1, 10) });
  });

  it('names a block that is missing or has no dates it can read', () => {
    const read = readTreeSeasons(
      parseScript('tree_winter = { start_date = 00.13.01 end_date = 00.01.01 }\n'),
    );
    expect(read.spans.every((span) => span === undefined)).toBe(true);
    expect(read.problems[0]).toBe('tree_winter: no start_date and end_date the preview can read');
    expect(read.problems[1]).toBe('no tree_winter2');
  });

  it('gives a date inside a block its column', () => {
    expect(at(7, 16)).toEqual({ first: 5, second: 5, lerp: 0, value: 5 });
    expect(at(11, 20)?.value).toBe(0);
    expect(at(10, 10)?.value).toBe(6);
  });

  it('runs a block over the year end', () => {
    expect(at(12, 25)?.value).toBe(1);
    expect(at(1, 5)?.value).toBe(1);
  });

  it('moves through a gap towards the next column, a day at a time', () => {
    // tree_autumn ends on 10 October, tree_autumn2 starts on 21 October: 11 days.
    expect(at(10, 15)).toEqual({ first: 6, second: 7, lerp: 5 / 11, value: 6 + 5 / 11 });
    // tree_winter2 ends on 10 January, tree_spring starts on 1 February: 22 days.
    expect(at(1, 21)?.value).toBeCloseTo(1.5, 10);
  });

  it('runs from the last column towards the first', () => {
    // tree_autumn2 ends on 1 November, tree_winter starts on 20 November: 19 days.
    expect(at(11, 10)).toEqual({ first: 7, second: 0, lerp: 9 / 19, value: 7 + 9 / 19 });
  });

  it('holds no date without the blocks', () => {
    expect(treeSeasonAt(readTreeSeasons(parseScript('')).spans, 100)).toBeUndefined();
  });
});

// Local only: the installed game's `map/seasons.txt`, read in place (CI has no game).
const gamePath = process.env['ETCH_GAME_PATH'];

describe.skipIf(gamePath === undefined)('tree seasons of the installed game', () => {
  it('reads all eight blocks and gives every day a value', () => {
    const text = readFileSync(join(gamePath ?? '', 'map', 'seasons.txt'), 'latin1');
    const read = readTreeSeasons(parseScript(text));
    expect(read.problems).toEqual([]);
    for (let day = 0; day < 365; day++) {
      const value = treeSeasonAt(read.spans, day)?.value;
      expect(value, dayName(day)).toBeGreaterThanOrEqual(0);
      expect(value, dayName(day)).toBeLessThan(8);
    }
  });
});
