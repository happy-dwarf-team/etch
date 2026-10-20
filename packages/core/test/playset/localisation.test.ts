import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameFiles, loadPlaysetLocalisation } from '../../src/playset/index.ts';
import { makeTree, removeTree, snapshotTree } from './fixture.ts';

const BOM = '﻿';

describe('loadPlaysetLocalisation', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTree({
      'game/localisation/text_l_english.yml': `${BOM}l_english:\n A:0 "game"\n B:0 "game"\n C:0 "game"\n`,
      'game/localisation/text_l_german.yml': `${BOM}l_german:\n A:0 "Spiel"\n`,
      'game/localisation/other_l_english.yml': `${BOM}l_english:\n D:0 "game"\n`,
      'mod/Localisation/TEXT_l_english.yml': `${BOM}l_english:\n A:0 "mod é"\n`,
      'mod/localisation/replace/r_l_english.yml': `${BOM}l_english:\n C:0 "replace"\n`,
      'mod/localisation/notes.txt': 'not localisation',
      'top/localisation/top_l_english.yml': `${BOM}l_english:\n A:0 "top"\n`,
    });
  });

  afterEach(async () => {
    await removeTree(root);
  });

  const layers = (topReplaces: string[] = []): GameFiles =>
    new GameFiles([
      { name: 'game', root: join(root, 'game'), replacePaths: [] },
      { name: 'Mod', root: join(root, 'mod'), replacePaths: [] },
      { name: 'Top', root: join(root, 'top'), replacePaths: topReplaces },
    ]);

  it('reads the winning files of the language, decoded as UTF-8', async () => {
    const before = await snapshotTree(root);
    const loc = await loadPlaysetLocalisation(layers(), 'english');
    expect(loc.get('A')).toBe('top');
    // The mod's file hides the game's file at the same path.
    expect(loc.get('B')).toBeUndefined();
    expect(loc.get('C')).toBe('replace');
    expect(loc.get('D')).toBe('game');
    expect(loc.source('C')).toEqual({ path: 'localisation/replace/r_l_english.yml', layer: 1 });
    expect(loc.problems()).toEqual([]);
    loc.remove('localisation/top_l_english.yml', 2);
    expect(loc.get('A')).toBe('mod é');
    expect(await snapshotTree(root)).toEqual(before);
  });

  it('hides earlier layers through replace_path', async () => {
    const loc = await loadPlaysetLocalisation(layers(['localisation']), 'english');
    expect(loc.get('D')).toBeUndefined();
    expect(loc.get('C')).toBe('replace');
    expect(loc.get('A')).toBe('top');
  });

  it('reads another language', async () => {
    const loc = await loadPlaysetLocalisation(layers(), 'german');
    expect(loc.get('A')).toBe('Spiel');
    expect(loc.size).toBe(1);
  });
});
