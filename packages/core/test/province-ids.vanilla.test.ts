/// <reference types="node" />
// Local only: checks the province ids of an installed game's script files against its own map,
// read only. Runs when ETCH_GAME_PATH names the game folder and is skipped otherwise (CI has no
// game). Vanilla 1.37.5 uses only provinces of its map, so every warning here is a false one.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameFiles, findScriptValueProblems, loadProvinceIds } from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

describe.skipIf(gamePath === undefined)('province ids of the installed game', () => {
  it('finds no province id the vanilla map lacks', async () => {
    const files = new GameFiles([{ name: 'game', root: join(gamePath ?? ''), replacePaths: [] }]);
    const ids = await loadProvinceIds(files);
    expect(ids?.maxProvinces).toBe(4942);
    expect(ids?.defined?.size).toBe(4941);
    if (ids === undefined) return;
    const { findings, filesChecked } = await findScriptValueProblems(files, { ids });
    expect(filesChecked).toBeGreaterThan(7000);
    const warnings = findings.flatMap((finding) =>
      finding.diagnostics.map(
        (d) => `${finding.file.path}: ${d.key} = ${String('id' in d ? d.id : d.name)}`,
      ),
    );
    expect(warnings).toEqual([]);
  }, 120_000);
});
