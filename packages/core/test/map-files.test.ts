import { describe, expect, it } from 'vitest';
import { checkMapFiles, mapFilePath, parseScript, readMapFileNames } from '../src/index.ts';

const MAP = `max_provinces = 10
climate = "old_climate.txt"
climate = "my_climate.txt"
region = "Regions.txt"
adjacencies = "lost.csv"
definitions = "Definition.csv"
area = ""
`;

describe('map files', () => {
  it('reads the file names default.map sets for the checked keys, the last one winning', () => {
    const names = readMapFileNames(parseScript(MAP, { script: true }));
    expect([...names].map(([key, name]) => `${key} ${name.text}`)).toEqual([
      'climate my_climate.txt',
      'region Regions.txt',
      'adjacencies lost.csv',
      'definitions Definition.csv',
    ]);
    expect(mapFilePath('my_climate.txt')).toBe('map/my_climate.txt');
  });

  it('warns about a named file the playset does not have, by what the game does without it', () => {
    const diagnostics = checkMapFiles(
      parseScript(MAP, { script: true }),
      new Map([
        ['map/my_climate.txt', false],
        // Found ignoring case, as the game's file system does.
        ['map/regions.txt', true],
        ['map/lost.csv', false],
        ['map/definition.csv', true],
      ]),
    );
    expect(diagnostics.map((d) => `${d.key} ${d.path} ${d.code}`)).toEqual([
      'climate map/my_climate.txt map-file-missing',
      'adjacencies map/lost.csv map-file-missing',
    ]);
    expect(MAP.slice(diagnostics[0]?.start, diagnostics[0]?.end)).toBe('"my_climate.txt"');
    expect(diagnostics[0]?.message).toBe(
      'The playset has no map/my_climate.txt, which climate names: the game reads it while it ' +
        'loads the map and crashes without it, after "CLexer failed to load file" in error.log.',
    );
    expect(diagnostics[1]?.message).toContain('stops loading without it');
    // A path that was not looked up is not checked.
    expect(checkMapFiles(parseScript(MAP, { script: true }), new Map())).toEqual([]);
  });
});
