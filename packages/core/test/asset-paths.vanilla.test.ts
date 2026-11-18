/// <reference types="node" />
// Local only: resolves every asset path of the installed game's `.gfx` and `.asset` files in
// place, read only. Runs when ETCH_GAME_PATH names the game folder and is skipped otherwise (CI
// has no game). Game files never enter the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assetReferences, decodeGameText, parseScript } from '../src/index.ts';
import { GameFiles } from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

function* files(dir: string, extension: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path, extension);
    else if (entry.name.toLowerCase().endsWith(extension)) yield path;
  }
}

describe.skipIf(gamePath === undefined)('asset paths on the installed game', () => {
  it('resolves every texture, mesh and animation path vanilla writes', async () => {
    const root = gamePath ?? '';
    const game = new GameFiles([{ name: 'game', root, replacePaths: [] }]);
    const counts = new Map<string, number>();
    const missing: string[] = [];
    const sources = [
      ...[...files(join(root, 'interface'), '.gfx')],
      ...[...files(join(root, 'gfx'), '.asset')],
    ];
    for (const source of sources) {
      const folder = relative(root, join(source, '..')).replace(/\\/g, '/');
      const parsed = parseScript(decodeGameText(readFileSync(source), 'interface').text);
      for (const reference of assetReferences(parsed)) {
        const key = `${reference.kind} ${reference.folder}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const candidates = reference.candidates.map((path) =>
          reference.folder === 'document' ? `${folder}/${path}` : path,
        );
        let found = false;
        for (const candidate of candidates) {
          if ((await game.find(candidate)) !== undefined) {
            found = true;
            break;
          }
        }
        if (!found) missing.push(`${relative(root, source)}: ${reference.written}`);
      }
    }
    console.log(Object.fromEntries(counts), missing);
    expect(Object.fromEntries(counts)).toEqual({
      'texture game': 7081,
      'mesh game': 497,
      'animation document': 152,
    });
    // Vanilla's own dead paths: sprites of 1.37.5 whose texture is not in the game folder
    // (`send_colonists_button.dds`, `dlc010.dds`, …); every other path resolves.
    expect(missing).toHaveLength(30);
  });
});
