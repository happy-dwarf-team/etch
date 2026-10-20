import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameFiles, PlaysetInterface } from '../../src/playset/index.ts';
import { makeTree, removeTree, snapshotTree } from './fixture.ts';

describe('PlaysetInterface', () => {
  let game: string;
  let mod: string;
  let before: Map<string, string>;

  beforeAll(async () => {
    game = await makeTree({
      'interface/core.gfx':
        'spriteTypes = { spriteType = { name = "GFX_a" textureFile = "gfx/interface/a.tga" } }\n' +
        'bitmapfonts = { bitmapfont = { name = "vic_18" path = "gfx/fonts/vic_18" } }',
      'interface/core.gui': 'guiTypes = { scrollbarType = { name = "standard_slider" } }',
      'interface/window.gui':
        'guiTypes = { windowType = { name = "w" iconType = { name = "i" spriteType = "GFX_mod" } } }',
      'interface/sub/extra.gfx':
        'spriteTypes = { spriteType = { name = "GFX_a" textureFile = "gfx/interface/late.dds" } }',
      'gfx/interface/a.dds': 'dds',
      'gfx/fonts/vic_18.fnt': 'fnt',
      'gfx/fonts/vic_18.dds': 'dds',
    });
    mod = await makeTree({
      'interface/mod.gfx':
        'spriteTypes = { spriteType = { name = "GFX_mod" textureFile = "gfx/interface/mod.dds" } }',
      'interface/window.gui':
        'guiTypes = { windowType = { name = "w" iconType = { name = "i" spriteType = "GFX_mod" } ' +
        'instantTextBoxType = { name = "t" font = "vic_18" scrollbartype = "standard_slider" } } }',
      'interface/government_mechanics/mechanic.gui':
        'guiTypes = { windowType = { name = "mechanic" } }',
    });
    before = new Map([...(await snapshotTree(game)), ...(await snapshotTree(mod))]);
  });

  afterAll(async () => {
    await removeTree(game);
    await removeTree(mod);
  });

  function files(): GameFiles {
    return new GameFiles([
      { name: 'game', root: game, replacePaths: [] },
      { name: 'mod', root: mod, replacePaths: [] },
    ]);
  }

  it('lists the subfolders of every layer', async () => {
    expect(await files().folders('interface')).toEqual([
      'interface/government_mechanics',
      'interface/sub',
    ]);
  });

  it('loads the winning files of interface/ and its subfolders in load order', async () => {
    const loaded = await PlaysetInterface.load(files());
    expect(loaded.index.gfxFiles.map((f) => f.path)).toEqual([
      'interface/core.gfx',
      'interface/mod.gfx',
      'interface/sub/extra.gfx',
    ]);
    expect(
      loaded.index.guiFiles.map((f) => `${f.path} ${String(f.file.definitions.length)}`),
    ).toEqual([
      'interface/core.gui 1',
      'interface/window.gui 1',
      'interface/government_mechanics/mechanic.gui 1',
    ]);
    expect(loaded.index.sprite('GFX_a')?.path).toBe('interface/core.gfx');
    // a.tga resolves to a.dds; the mod's texture is missing.
    expect(loaded.gameFile('gfx//interface//a.dds')?.layer.name).toBe('game');
    expect(loaded.diagnostics('interface/window.gui').map((d) => d.code)).toEqual([
      'missing-texture',
    ]);
    expect(loaded.diagnostics('interface/sub/extra.gfx').map((d) => d.code)).toEqual([
      'duplicate-sprite',
      'missing-texture',
    ]);
    expect(loaded.diagnostics('interface/unknown.gui')).toEqual([]);
  });

  it('updates one file from its game text and looks up the new paths', async () => {
    const loaded = await PlaysetInterface.load(files());
    await loaded.update(
      'interface/window.gui',
      'guiTypes = { windowType = { name = "w" instantTextBoxType = { name = "t" font = "nope" textureFile = "gfx/fonts/vic_18.dds" } } }',
    );
    expect(loaded.diagnostics('interface/window.gui').map((d) => d.code)).toEqual(['missing-font']);
    await loaded.update('interface/mod.gfx', undefined);
    expect(loaded.index.sprite('GFX_mod')).toBeUndefined();
    await loaded.update(
      'interface/new.gfx',
      'spriteTypes = { spriteType = { name = "GFX_new" textureFile = "gfx/interface/a.dds" } }',
    );
    expect(loaded.index.sprite('gfx_new')?.path).toBe('interface/new.gfx');
    expect(loaded.diagnostics('interface/new.gfx')).toEqual([]);
  });

  it('keeps the latest of two overlapping updates of one file', async () => {
    const loaded = await PlaysetInterface.load(files());
    const slow = loaded.update(
      'interface/window.gui',
      'guiTypes = { windowType = { name = "slow" instantTextBoxType = { name = "t" textureFile = "gfx/new/x.dds" } } }',
    );
    const fast = loaded.update(
      'interface/window.gui',
      'guiTypes = { windowType = { name = "fast" } }',
    );
    await Promise.all([slow, fast]);
    const window = loaded.index.guiFiles.find((f) => f.path === 'interface/window.gui');
    expect(window?.file.definitions.map((w) => w.name)).toEqual(['fast']);
  });

  it('never writes to the game or the mods', async () => {
    await PlaysetInterface.load(files());
    expect(new Map([...(await snapshotTree(game)), ...(await snapshotTree(mod))])).toEqual(before);
  });
});
