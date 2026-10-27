/// <reference types="node" />
// Etch's own window profiles (profiles/<source>/, spec v2 section 4): every file reads without a
// problem, names the window it is named for, and a mod's source names its mod. Checking them
// against the windows needs the game: profiles.playsets.test.ts.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readProfile } from '../src/profile/index.ts';

const root = new URL('../../../profiles/', import.meta.url);
const sources = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("Etch's window profiles", () => {
  it('ship vanilla and Anbennar', () => {
    expect(sources.sort()).toEqual(['anbennar', 'vanilla']);
  });

  for (const source of sources) {
    for (const name of readdirSync(new URL(`${source}/`, root))) {
      it(`${source}/${name} reads without a problem`, () => {
        const text = readFileSync(new URL(`${source}/${name}`, root), 'utf8');
        const { file, diagnostics } = readProfile(text, { layer: 0, source, file: name });
        expect(diagnostics).toEqual([]);
        expect(`${file?.window ?? ''}.jsonc`).toBe(name);
        if (source === 'vanilla') {
          expect(file?.mod).toBeUndefined();
          expect(file?.checkedWith).toBe('1.37.5');
        } else {
          expect(file?.mod?.remoteFileId).toBe('1385440355');
        }
      });
    }
  }

  it('give provinceview its views and the province view the five selectors of etch#155', () => {
    const text = readFileSync(new URL('vanilla/provinceview.jsonc', root), 'utf8');
    const file = readProfile(text, { layer: 0, source: 'vanilla', file: 'provinceview' }).file;
    expect(file?.selectors.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'screen',
        'owner',
        'tab',
        'side',
        'subPanel',
        'greatProjects',
        'natives',
      ]),
    );
    expect(file?.defaultView?.id).toBe('own');
  });
});
