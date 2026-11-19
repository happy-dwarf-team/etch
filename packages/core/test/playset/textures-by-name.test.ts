import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameFiles, loadTexturesByName } from '../../src/playset/index.ts';
import { makeTree, removeTree } from './fixture.ts';

describe('loadTexturesByName', () => {
  let root: string;
  let byName: Map<string, { path: string; layer: { name: string } }>;

  beforeAll(async () => {
    root = await makeTree({
      'game/gfx/models/Buildings/Western/Fort_Spec.dds': 'game spec',
      'game/gfx/models/Buildings/fort.mesh': 'a mesh',
      'game/gfx/models/Buildings/shared_normal.dds': 'game, outer',
      'game/gfx/models/Buildings/Indian/shared_normal.dds': 'game, inner',
      'game/gfx/models/ships/sail.tga': 'game tga',
      'game/interface/outside.dds': 'not under gfx',
      'mod/gfx/models/Buildings/Western/fort_spec.dds': 'mod spec',
    });
    byName = await loadTexturesByName(
      new GameFiles([
        { name: 'game', root: join(root, 'game'), replacePaths: [] },
        { name: 'Mod', root: join(root, 'mod'), replacePaths: [] },
      ]),
    );
  });

  afterAll(async () => {
    await removeTree(root);
  });

  it('keys the textures under gfx/ by file name without regard to case', () => {
    expect([...byName.keys()].sort()).toEqual(['fort_spec.dds', 'sail.tga', 'shared_normal.dds']);
    expect(byName.get('sail.tga')?.path).toBe('gfx/models/ships/sail.tga');
  });

  it("takes a mod's file over the game's at the same path", () => {
    expect(byName.get('fort_spec.dds')?.layer.name).toBe('Mod');
  });

  it("keeps a folder's own file before a subfolder's of the same name", () => {
    expect(byName.get('shared_normal.dds')?.path).toBe('gfx/models/Buildings/shared_normal.dds');
  });
});
