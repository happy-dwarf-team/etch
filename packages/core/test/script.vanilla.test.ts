/// <reference types="node" />
// Local only: parses the interface files of an installed game in place, read only.
// Runs when ETCH_GAME_PATH names the game folder, for example
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
// and is skipped otherwise (CI has no game). Game files never enter the repository.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/index.ts';
import { rangeProblems } from './script-invariants.ts';

const gamePath = process.env['ETCH_GAME_PATH'];
const decoder = new TextDecoder('windows-1252');

function interfaceFiles(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(gui|gfx)$/i.test(name))
    .map((name) => join(folder, name));
}

describe.skipIf(gamePath === undefined)('parseScript on the installed game', () => {
  const folder = join(gamePath ?? '', 'interface');

  it('parses every vanilla .gui and .gfx file without syntax errors', () => {
    const files = interfaceFiles(folder);
    expect(files.length).toBeGreaterThan(200);
    for (const file of files) {
      const text = decoder.decode(readFileSync(file));
      const parsed = parseScript(text);
      expect({ file, diagnostics: parsed.diagnostics }).toEqual({ file, diagnostics: [] });
      expect({ file, problems: rangeProblems(text, parsed) }).toEqual({ file, problems: [] });
    }
  });

  it('parses countrydiplomacyview.gui well within the warm reload budget', () => {
    const text = decoder.decode(readFileSync(join(folder, 'countrydiplomacyview.gui')));
    for (let i = 0; i < 20; i++) parseScript(text); // warm up the JIT
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      parseScript(text);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const median = times[50] ?? Infinity;
    const p95 = times[95] ?? Infinity;
    console.log(
      `countrydiplomacyview.gui (${String(text.length)} chars): median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms`,
    );
    // etch#9 measured about 6 ms for the whole warm reload work on this file.
    expect(median).toBeLessThan(6);
  });
});
