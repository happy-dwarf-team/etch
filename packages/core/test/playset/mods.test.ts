import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFolderMod, readModIndex } from '../../src/playset/mods.ts';
import { makeTree, removeTree } from './fixture.ts';

describe('readModIndex', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTree({
      'profile/mod/kept.mod': 'name="Kept"\nversion="2.1"\npath="mod/kept"\n',
      'profile/mod/kept/common/x.txt': 'x = 1\n',
      'workshop/123/descriptor.mod': 'name="Item"\n',
      // A file next to the Workshop items, not an item.
      'workshop/notes.txt': 'not a mod\n',
    });
    // A folder whose name ends in .mod is not a descriptor.
    await mkdir(join(root, 'profile', 'mod', 'folder.mod'));
  });

  afterEach(async () => {
    await removeTree(root);
  });

  it('reads descriptors and Workshop folders, and skips what is neither', async () => {
    const { mods, archives } = await readModIndex(join(root, 'profile'), join(root, 'workshop'));
    expect(mods.map((mod) => [mod.name, mod.source, mod.version, mod.workshopId])).toEqual([
      ['Kept', 'profile', '2.1', undefined],
      ['Item', 'workshop', undefined, '123'],
    ]);
    expect(archives.size).toBe(0);
    expect(await readFolderMod(join(root, 'workshop', 'notes.txt'), 'workshop')).toBeUndefined();
  });

  it('reads no mods from a profile without a mod folder', async () => {
    const { mods } = await readModIndex(join(root, 'workshop', '123'), undefined);
    expect(mods).toEqual([]);
  });
});
