import { describe, expect, it } from 'vitest';
import {
  checkCountryFiles,
  checkCountryHistory,
  countryFilePath,
  countryTagsMissing,
  countryHistoryTag,
  firstCountryTags,
  isCountryTagsPath,
  parseScript,
  readCountryFiles,
} from '../src/index.ts';

const TAGS = `SWE = "countries/Sweden.txt"
TYT = "countries/Toyotomi.txt"
ab1 = "countries\\Sub\\Mine.txt"
AD7 = "countries/Jötunnheim.txt"
dynamic_tags = yes
LONG = "countries/Long.txt"
XYZ = "countries/NoExtension"
`;

describe('the tags the game needs', () => {
  it('names each missing tag and the first that the game logs', () => {
    expect(countryTagsMissing(['PIR', 'REB'])).toMatchObject({
      code: 'country-tags-required',
      name: 'PIR, REB',
      message:
        'No common/country_tags file of the playset defines PIR, REB: the game needs them and ' +
        'stops while it starts, after "Missing PIR country tag" in error.log.',
    });
  });
});

describe('history/countries files of one tag', () => {
  it("takes a file's tag from the first three characters of its name", () => {
    expect(countryHistoryTag('history/countries/SWE - Sweden.txt')).toBe('SWE');
    expect(countryHistoryTag('history\\countries\\ker- Keres.TXT')).toBe('KER');
    expect(countryHistoryTag('history/countries/AB.txt')).toBeUndefined();
    expect(countryHistoryTag('history/countries/sub/SWE - Sweden.txt')).toBeUndefined();
    expect(countryHistoryTag('history/provinces/1 - Uppland.txt')).toBeUndefined();
  });

  it("warns about a mod's file whose tag has another, and not about the game's", () => {
    const histories = new Map([
      [
        'SWE',
        [
          { path: 'history/countries/SWE - Sweden.txt', game: true },
          { path: 'history/countries/SWE - Mine.txt', game: false },
        ],
      ],
      [
        'SOF',
        [
          { path: 'history/countries/SOF - Segu.txt', game: true },
          { path: 'history/countries/SOF - Sofala.txt', game: true },
        ],
      ],
      ['DAN', [{ path: 'history/countries/DAN - Denmark.txt', game: false }]],
      // A mod's own files of one tag, which no file of the game's has.
      [
        'X97',
        [
          { path: 'history/countries/X97 - Old Ones 3.txt', game: false },
          { path: 'history/countries/X97 - Old Ones 4.txt', game: false },
        ],
      ],
    ]);
    const shared = checkCountryHistory('history/countries/swe - mine.txt', histories);
    expect(shared).toMatchObject({
      code: 'country-history-shared',
      key: 'SWE',
      name: 'history/countries/SWE - Sweden.txt',
      start: 0,
      end: 0,
    });
    expect(shared?.message).toBe(
      "This file does not replace the game's history/countries/SWE - Sweden.txt: the game reads " +
        "every history/countries file whose name starts with a tag into that country's history, " +
        "so SWE gets both. Only a file of the same name, or replace_path, replaces the game's.",
    );
    expect(checkCountryHistory('history/countries/SWE - Sweden.txt', histories)).toBeUndefined();
    expect(checkCountryHistory('history/countries/SOF - Segu.txt', histories)).toBeUndefined();
    expect(checkCountryHistory('history/countries/DAN - Denmark.txt', histories)).toBeUndefined();
    expect(checkCountryHistory('history/countries/NOR - Norway.txt', histories)).toBeUndefined();
    expect(
      checkCountryHistory('history/countries/X97 - Old Ones 4.txt', histories),
    ).toBeUndefined();
    expect(checkCountryHistory('events/SWE.txt', histories)).toBeUndefined();
  });
});

describe('country files of common/country_tags', () => {
  it('reads each tag with the .txt file it names', () => {
    const files = readCountryFiles(parseScript(TAGS, { script: true }));
    expect(files.map(({ tag, file }) => `${tag} ${file.text}`)).toEqual([
      'SWE countries/Sweden.txt',
      'TYT countries/Toyotomi.txt',
      'ab1 countries\\Sub\\Mine.txt',
      'AD7 countries/Jötunnheim.txt',
    ]);
    expect(countryFilePath('countries\\Sub\\Mine.txt')).toBe('common/countries/Sub/Mine.txt');
    // The game reads the path's bytes as UTF-8, Etch the file as Windows-1252: left unchecked.
    expect(countryFilePath('countries/Jötunnheim.txt')).toBeUndefined();
    expect(isCountryTagsPath('common/country_tags/00_countries.txt')).toBe(true);
    expect(isCountryTagsPath('Common\\Country_Tags\\mine.TXT')).toBe(true);
    expect(isCountryTagsPath('common/countries/Sweden.txt')).toBe(false);
  });

  it('warns about a tag whose file no layer has', () => {
    const diagnostics = checkCountryFiles(
      parseScript(TAGS, { script: true }),
      new Map([
        ['common/countries/sweden.txt', true],
        ['common/countries/toyotomi.txt', false],
        ['common/countries/sub/mine.txt', false],
      ]),
    );
    expect(diagnostics.map((d) => `${d.key} ${String(d.path)} ${d.code}`)).toEqual([
      'TYT common/countries/Toyotomi.txt country-file-missing',
      'ab1 common/countries/Sub/Mine.txt country-file-missing',
      'LONG undefined country-tag-length',
    ]);
    expect(TAGS.slice(diagnostics[0]?.start, diagnostics[0]?.end)).toBe('"countries/Toyotomi.txt"');
    // Not a tag, so neither its file nor dynamic_tags, which names none, is checked.
    expect(TAGS.slice(diagnostics[2]?.start, diagnostics[2]?.end)).toBe('LONG');
    expect(diagnostics[2]?.message).toBe(
      'LONG is not a tag: the game takes only three-character tags from common/country_tags and ' +
        'leaves this line out without a word in error.log, so there is no such country.',
    );
    expect(diagnostics[0]?.message).toBe(
      "The playset has no common/countries/Toyotomi.txt, which TYT names: the game reads every tag's " +
        'file while it starts and crashes without it, after "CLexer failed to load file" in error.log.',
    );
  });

  it('reports a tag an earlier line or file defines, and does not check its file', () => {
    const first = parseScript('SWE = "countries/Sweden.txt"\nDAN = "countries/Denmark.txt"\n', {
      script: true,
    });
    const text =
      'NOR = "countries/Norway.txt"\nSWE = "countries/Lost.txt"\nNOR = "countries/Lost.txt"\nswe = "countries/Sweden.txt"\n';
    const later = parseScript(text, { script: true });
    const firsts = firstCountryTags([
      { path: 'common/country_tags/00_countries.txt', parsed: first },
      { path: 'common\\country_tags\\ZZ_Mod.txt', parsed: later },
    ]);
    // The game compares tags in their case: swe is a tag of its own.
    expect([...firsts]).toEqual([
      ['SWE', 'common/country_tags/00_countries.txt'],
      ['DAN', 'common/country_tags/00_countries.txt'],
      ['NOR', 'common/country_tags/zz_mod.txt'],
      ['swe', 'common/country_tags/zz_mod.txt'],
    ]);
    const present = new Map([
      ['common/countries/sweden.txt', true],
      ['common/countries/norway.txt', true],
      ['common/countries/lost.txt', false],
    ]);
    const diagnostics = checkCountryFiles(later, present, {
      path: 'common/country_tags/zz_mod.txt',
      firsts,
    });
    expect(diagnostics.map((d) => `${d.key} ${String(d.path)} ${d.code}`)).toEqual([
      'SWE common/country_tags/00_countries.txt country-tag-duplicate',
      'NOR common/country_tags/zz_mod.txt country-tag-duplicate',
    ]);
    expect(text.slice(diagnostics[1]?.start, diagnostics[1]?.end)).toBe('NOR');
    expect(diagnostics.map((d) => d.message)).toEqual([
      'SWE is a tag of common/country_tags/00_countries.txt already: the game keeps the first and ' +
        'leaves this one out, with "Duplicate Country Tag - SWE" in error.log, and does not read its file.',
      'NOR is a tag of an earlier line of this file already: the game keeps the first and leaves ' +
        'this one out, with "Duplicate Country Tag - NOR" in error.log, and does not read its file.',
    ]);
    // The file that defines a tag first is checked as before.
    expect(
      checkCountryFiles(first, new Map([['common/countries/denmark.txt', false]]), {
        path: 'common/country_tags/00_countries.txt',
        firsts,
      }).map((d) => `${d.key} ${d.code}`),
    ).toEqual(['DAN country-file-missing']);
  });
});
