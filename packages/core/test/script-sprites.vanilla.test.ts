/// <reference types="node" />
// Local only: reads the sprite names of the installed game's events, missions and estate
// privileges in place, read only, and resolves them against the game folder's interface. Runs
// when ETCH_GAME_PATH names the game folder and is skipped otherwise (CI has no game). Game files
// never enter the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeGameText,
  parseScript,
  scriptSpriteReferences,
  SPRITE_SCRIPT_FOLDERS,
} from '../src/index.ts';
import { GameFiles, PlaysetInterface } from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.name.toLowerCase().endsWith('.txt')) yield path;
  }
}

describe.skipIf(gamePath === undefined)('script sprite names on the installed game', () => {
  it('finds the sprite of every mission, privilege and common icon and of most event pictures', async () => {
    const root = gamePath ?? '';
    const ui = await PlaysetInterface.load(
      new GameFiles([{ name: 'game', root, replacePaths: [] }]),
    );
    const counts: Record<string, { references: number; resolved: number }> = {};
    for (const folder of SPRITE_SCRIPT_FOLDERS) {
      const count = { references: 0, resolved: 0 };
      for (const source of files(join(root, folder))) {
        const path = relative(root, source).replace(/\\/g, '/');
        const text = decodeGameText(readFileSync(source), 'script').text;
        for (const reference of scriptSpriteReferences(path, parseScript(text, { script: true }))) {
          count.references++;
          if (ui.index.sprite(reference.name) !== undefined) count.resolved++;
        }
      }
      counts[folder] = count;
    }
    console.log(counts);
    // The event pictures that do not resolve are almost all defined by the DLC archives
    // (`dlc/*/*.zip`, `builtin_dlc`), which Etch does not read; a few name no sprite at all.
    expect(counts).toEqual({
      events: { references: 6573, resolved: 4729 },
      missions: { references: 4813, resolved: 4813 },
      'common/estate_privileges': { references: 426, resolved: 426 },
      'common/church_aspects': { references: 10, resolved: 10 },
      'common/federation_advancements': { references: 8, resolved: 8 },
      'common/government_mechanics': { references: 89, resolved: 89 },
      'common/holy_orders': { references: 28, resolved: 28 },
      'common/professionalism': { references: 6, resolved: 6 },
      'common/religions': { references: 7, resolved: 7 },
      'common/religious_conversions': { references: 9, resolved: 9 },
      'common/subject_types': { references: 73, resolved: 73 },
      'common/tradecompany_investments': { references: 15, resolved: 15 },
      'common/trading_policies': { references: 9, resolved: 9 },
    });
  });
});
