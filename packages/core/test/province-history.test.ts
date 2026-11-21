import { describe, expect, it } from 'vitest';
import { checkProvinceHistory, provinceHistoryId } from '../src/script/province-history.ts';

describe('history/provinces files of one province', () => {
  it("takes a file's province from the number at the start of its name, as atoi does", () => {
    expect(provinceHistoryId('history/provinces/1-Uppland.txt')).toBe(1);
    expect(provinceHistoryId('history/provinces/1 - Uppland.txt')).toBe(1);
    expect(provinceHistoryId('history\\provinces\\ 101 - Genoa.TXT')).toBe(101);
    expect(provinceHistoryId('history/provinces/+12.txt')).toBe(12);
    expect(provinceHistoryId('history/provinces/Uppland.txt')).toBeUndefined();
    expect(provinceHistoryId('history/provinces/0 - Nowhere.txt')).toBeUndefined();
    expect(provinceHistoryId('history/provinces/-3.txt')).toBeUndefined();
    expect(provinceHistoryId('history/provinces/sub/1 - Uppland.txt')).toBeUndefined();
    expect(provinceHistoryId('history/countries/SWE - Sweden.txt')).toBeUndefined();
  });

  it("warns about a mod's file beside the game's under another name, and not about the game's", () => {
    const histories = new Map([
      [
        1,
        [
          { path: 'history/provinces/1 - Uppland.txt', game: false },
          { path: 'history/provinces/1-Uppland.txt', game: true },
        ],
      ],
      // A file of the game's name replaces the game's: one file.
      [2, [{ path: 'history/provinces/2-Ostergotland.txt', game: true }]],
      // A mod's own two files of a province the game has no file of.
      [
        5000,
        [
          { path: 'history/provinces/5000 - New.txt', game: false },
          { path: 'history/provinces/5000-New.txt', game: false },
        ],
      ],
    ]);
    const shared = checkProvinceHistory('history/provinces/1 - uppland.txt', histories);
    expect(shared).toMatchObject({
      code: 'province-history-shared',
      key: 'history/provinces',
      id: 1,
      name: 'history/provinces/1-Uppland.txt',
      start: 0,
      end: 0,
    });
    expect(shared?.message).toBe(
      "This file does not replace the game's history/provinces/1-Uppland.txt: the game reads " +
        'every history/provinces file whose name starts with a province id into that province, so ' +
        'province 1 gets both histories. Only a file of the same name, or replace_path, replaces ' +
        "the game's.",
    );
    expect(checkProvinceHistory('history/provinces/1-Uppland.txt', histories)).toBeUndefined();
    expect(checkProvinceHistory('history/provinces/2-Ostergotland.txt', histories)).toBeUndefined();
    expect(checkProvinceHistory('history/provinces/5000 - New.txt', histories)).toBeUndefined();
    expect(checkProvinceHistory('history/provinces/3 - Kalmar.txt', histories)).toBeUndefined();
    expect(checkProvinceHistory('events/1.txt', histories)).toBeUndefined();
  });
});
