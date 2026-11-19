/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  colourMapAt,
  dayName,
  dayOfYear,
  MAP_SEASONS,
  readMapSeasons,
  readTreeSeasons,
  seasonAt,
  TREE_SEASONS,
} from '../src/asset/index.ts';
import { parseScript } from '../src/script/index.ts';

// Four map seasons and eight tree blocks of the fixture's own; winter and tree_winter2 run over
// the year's end.
const SEASONS = `winter = { start_date = 00.12.01 end_date = 00.02.28 hsv_north = { 0 0 1 } }
spring = { start_date = 00.04.01 end_date = 00.05.15 }
summer = { start_date = 00.06.01 end_date = 00.08.31 }
autumn = { start_date = 00.10.01 end_date = 00.10.31 }
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
const at = (month: number, day: number) => seasonAt(spans, dayOfYear(month, day));

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
    expect(seasonAt(readTreeSeasons(parseScript('')).spans, 100)).toBeUndefined();
  });
});

describe('map seasons', () => {
  const map = readMapSeasons(parseScript(SEASONS));
  const mapAt = (month: number, day: number) => seasonAt(map.spans, dayOfYear(month, day));

  it('reads the four blocks in the order of the season type', () => {
    expect(map.problems).toEqual([]);
    expect(map.spans).toHaveLength(MAP_SEASONS.length);
    expect(map.spans[0]).toEqual({ start: dayOfYear(12, 1), end: dayOfYear(2, 28) });
    expect(map.spans[3]).toEqual({ start: dayOfYear(10, 1), end: dayOfYear(10, 31) });
  });

  it('walks them as the tree blocks, autumn back to winter', () => {
    expect(mapAt(1, 15)).toEqual({ first: 0, second: 0, lerp: 0, value: 0 });
    // summer ends on 31 August, autumn starts on 1 October: 31 days.
    expect(mapAt(9, 16)).toEqual({ first: 2, second: 3, lerp: 16 / 31, value: 2 + 16 / 31 });
    // autumn ends on 31 October, winter starts on 1 December: 31 days.
    expect(mapAt(11, 1)).toEqual({ first: 3, second: 0, lerp: 1 / 31, value: 3 + 1 / 31 });
  });

  it('names the map seasons a file without them lacks', () => {
    expect(readMapSeasons(parseScript('tree_winter = { }\n')).problems).toEqual([
      'no winter',
      'no spring',
      'no summer',
      'no autumn',
    ]);
  });

  it("mixes the colour maps' colours as the tree shader does", () => {
    const colours = [
      [0, 40, 80],
      [100, 100, 100],
      [200, 0, 0],
      [0, 0, 200],
    ];
    expect(colourMapAt(colours, { first: 1, second: 1, lerp: 0, value: 1 })).toEqual([
      100, 100, 100,
    ]);
    expect(colourMapAt(colours, { first: 3, second: 0, lerp: 0.25, value: 3.25 })).toEqual([
      0, 10, 170,
    ]);
    expect(colourMapAt(colours, undefined)).toBeUndefined();
    expect(colourMapAt([undefined], { first: 0, second: 0, lerp: 0, value: 0 })).toBeUndefined();
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
      const value = seasonAt(read.spans, day)?.value;
      expect(value, dayName(day)).toBeGreaterThanOrEqual(0);
      expect(value, dayName(day)).toBeLessThan(8);
    }
  });

  it('reads the four map seasons and gives every day one', () => {
    const text = readFileSync(join(gamePath ?? '', 'map', 'seasons.txt'), 'latin1');
    const read = readMapSeasons(parseScript(text));
    expect(read.problems).toEqual([]);
    for (let day = 0; day < 365; day++) {
      const value = seasonAt(read.spans, day)?.value;
      expect(value, dayName(day)).toBeGreaterThanOrEqual(0);
      expect(value, dayName(day)).toBeLessThan(4);
    }
  });
});
