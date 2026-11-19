/// <reference types="node" />
// Local only: checks the province ids and names of an installed game's script files against its
// own map and databases, read only. Runs when ETCH_GAME_PATH names the game folder and is skipped
// otherwise (CI has no game). Vanilla 1.37.5 uses only provinces of its map and names it defines,
// so every warning here is a false one.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GameFiles,
  findScriptValueProblems,
  loadProvinceIds,
  loadScriptNames,
} from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

describe.skipIf(gamePath === undefined)('province ids and names of the installed game', () => {
  it('finds no province id the vanilla map lacks and no name vanilla does not define', async () => {
    const files = new GameFiles([{ name: 'game', root: join(gamePath ?? ''), replacePaths: [] }]);
    const ids = await loadProvinceIds(files);
    expect(ids?.maxProvinces).toBe(4942);
    expect(ids?.defined?.size).toBe(4941);
    expect(ids?.tradeWindsFile?.path).toBe('map/trade_winds.txt');
    expect(ids?.positionsFile?.path).toBe('map/positions.txt');
    expect(ids?.provinceGroupFile?.path).toBe('map/provincegroup.txt');
    expect(ids?.adjacenciesFile?.path).toBe('map/adjacencies.csv');
    const names = await loadScriptNames(files);
    const sizes = Object.fromEntries(
      [...(names?.byKind ?? new Map<string, ReadonlySet<string>>())].map(([kind, set]) => [
        kind,
        set.size,
      ]),
    );
    expect(sizes).toEqual({
      'idea-group': 555,
      idea: 3788,
      religion: 28,
      icon: 5,
      policy: 203,
      'rebel-type': 50,
      disaster: 55,
      institution: 8,
      'estate-agenda': 322,
      'advisor-type': 21,
      'graphical-culture': 12,
    });
    // Every tag's country file, each one there.
    const countryFiles = [...(names?.countryFiles ?? new Map<string, boolean>())];
    expect(countryFiles.length).toBeGreaterThan(900);
    expect(countryFiles.filter(([, present]) => !present)).toEqual([]);
    // Every tag once, in vanilla's one country_tags file.
    const countryTags = names?.countryTags ?? new Map<string, string>();
    expect(countryTags.size).toBeGreaterThan(900);
    expect(names?.countryTagsMissing).toBeUndefined();
    expect(new Set(countryTags.values())).toEqual(
      new Set(['common/country_tags/00_countries.txt']),
    );
    // The three technology tables, each there.
    expect([...(names?.technologyTables ?? new Map<string, boolean>())]).toEqual([
      ['common/technologies/adm.txt', true],
      ['common/technologies/dip.txt', true],
      ['common/technologies/mil.txt', true],
    ]);
    if (ids === undefined) return;
    const { findings, filesChecked } = await findScriptValueProblems(files, { ids, names });
    expect(filesChecked).toBeGreaterThan(7000);
    const warnings = findings.flatMap((finding) =>
      finding.diagnostics.map(
        (d) => `${finding.file.path}: ${d.key} = ${finding.text.slice(d.start, d.end)}`,
      ),
    );
    expect(warnings).toEqual([]);
  }, 120_000);
});
