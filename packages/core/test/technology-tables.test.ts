import { describe, expect, it } from 'vitest';
import {
  checkTechnologyTables,
  isTechnologyPath,
  parseScript,
  readTechnologyTables,
} from '../src/index.ts';

const TECHNOLOGY = `groups = { western = { start_level = 3 } }
tables = {
\tadm_tech = "technologies/adm.txt"
\tdip_tech = "technologies/Lost.txt"
\tmil_tech = technologies\\mil.txt
\tnote = yes
}
`;

describe('technology tables of common/technology.txt', () => {
  it('reads each table with the .txt file it names', () => {
    const tables = readTechnologyTables(parseScript(TECHNOLOGY, { script: true }));
    expect(tables.map(({ key, file }) => `${key} ${file.text}`)).toEqual([
      'adm_tech technologies/adm.txt',
      'dip_tech technologies/Lost.txt',
      'mil_tech technologies\\mil.txt',
    ]);
    expect(isTechnologyPath('common/technology.txt')).toBe(true);
    expect(isTechnologyPath('Common\\Technology.TXT')).toBe(true);
    expect(isTechnologyPath('common/technologies/adm.txt')).toBe(false);
  });

  it('warns about a table whose file no layer has', () => {
    const diagnostics = checkTechnologyTables(
      parseScript(TECHNOLOGY, { script: true }),
      new Map([
        ['common/technologies/adm.txt', true],
        ['common/technologies/lost.txt', false],
        ['common/technologies/mil.txt', true],
      ]),
    );
    expect(diagnostics.map((d) => `${d.key} ${d.path} ${d.code}`)).toEqual([
      'dip_tech common/technologies/Lost.txt technology-table-missing',
    ]);
    expect(TECHNOLOGY.slice(diagnostics[0]?.start, diagnostics[0]?.end)).toBe(
      '"technologies/Lost.txt"',
    );
    expect(diagnostics[0]?.message).toBe(
      'The playset has no common/technologies/Lost.txt, which the technology table dip_tech ' +
        'names: the game reads every table while it starts and crashes without it, after ' +
        '"CLexer failed to load file" in error.log.',
    );
  });
});
