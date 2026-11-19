import { describe, expect, it } from 'vitest';
import {
  checkCountryFiles,
  countryFilePath,
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
    expect(diagnostics.map((d) => `${d.key} ${d.path} ${d.code}`)).toEqual([
      'TYT common/countries/Toyotomi.txt country-file-missing',
      'ab1 common/countries/Sub/Mine.txt country-file-missing',
    ]);
    expect(TAGS.slice(diagnostics[0]?.start, diagnostics[0]?.end)).toBe('"countries/Toyotomi.txt"');
    expect(diagnostics[0]?.message).toBe(
      "The playset has no common/countries/Toyotomi.txt, which TYT names: the game reads every tag's " +
        'file while it starts and crashes without it, after "CLexer failed to load file" in error.log.',
    );
  });
});
