/// <reference types="node" />
// Local only: checks the corpus manifest against an installed game's interface files, read only.
// Runs when ETCH_GAME_PATH names the game folder and is skipped otherwise (CI has no game).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allWidgets, decodeGameText, parseScript, readGuiFile } from '../../src/index.ts';
import { readCorpusManifest } from '../../src/corpus/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];
const CORPUS = join(import.meta.dirname, '..', '..', '..', '..', 'corpus');

describe.skipIf(gamePath === undefined)('the corpus manifest on the installed game', () => {
  it('names files the game has, and roots and click targets they define', async () => {
    const { manifest } = await readCorpusManifest(join(CORPUS, 'manifest.json'));
    if (manifest === undefined) throw new Error('invalid manifest');
    const missing: string[] = [];
    for (const window of manifest.windows) {
      const files = window.files.map((path) =>
        readGuiFile(
          parseScript(
            decodeGameText(readFileSync(join(gamePath ?? '', ...path.split('/'))), 'interface')
              .text,
          ),
        ),
      );
      const topLevel = new Set(
        files.flatMap((f) => f.definitions.map((w) => (w.name ?? '').toLowerCase())),
      );
      const anywhere = new Set(
        files.flatMap((f) =>
          [...allWidgets(f)].map(({ widget }) => (widget.name ?? '').toLowerCase()),
        ),
      );
      for (const view of window.views) {
        for (const root of view.roots) {
          if (!topLevel.has(root.toLowerCase())) missing.push(`${view.id}: root ${root}`);
        }
        for (const step of view.recipe.steps) {
          if (!('click' in step)) continue;
          // The Esc menu's buttons open other windows: look in menubar.gui too.
          const last = step.click.split('/').pop()?.toLowerCase() ?? '';
          if (!anywhere.has(last) && !inMenubar(gamePath ?? '', last)) {
            missing.push(`${view.id}: click ${step.click}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

function inMenubar(game: string, name: string): boolean {
  const file = readGuiFile(
    parseScript(
      decodeGameText(readFileSync(join(game, 'interface', 'menubar.gui')), 'interface').text,
    ),
  );
  return [...allWidgets(file)].some(({ widget }) => (widget.name ?? '').toLowerCase() === name);
}
