import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameFiles } from '../../src/playset/index.ts';
import { makeTree, removeTree } from './fixture.ts';

describe('GameFiles', () => {
  let root: string;
  let files: GameFiles;

  beforeEach(async () => {
    root = await makeTree({
      'game/interface/core.gfx': 'game core',
      'game/interface/topbar.gui': 'game topbar',
      'game/interface/ideas.gui': 'game ideas',
      'game/interface/sub/deep.gui': 'game deep',
      'game/common/ideas/a.txt': 'game ideas a',
      'base/Interface/TOPBAR.gui': 'base topbar',
      'base/interface/base.gfx': 'base gfx',
      'base/common/ideas/b.txt': 'base ideas b',
      'top/interface/topbar.gui': 'top topbar',
      'top/interface/ideas.gui/readme.txt': 'a folder named like a file',
    });
    files = new GameFiles([
      { name: 'game', root: join(root, 'game'), replacePaths: [] },
      { name: 'Base', root: join(root, 'base'), replacePaths: ['common/ideas'] },
      { name: 'Top', root: join(root, 'top'), replacePaths: [] },
    ]);
  });

  afterEach(async () => {
    await removeTree(root);
  });

  it('gives the last layer that has a file, without regard to case or separator', async () => {
    const topbar = await files.find('INTERFACE\\TopBar.gui');
    expect(topbar?.layer.name).toBe('Top');
    expect(topbar?.path).toBe('INTERFACE/topbar.gui');
    expect(new TextDecoder().decode(await files.read('interface/topbar.gui'))).toBe('top topbar');
    expect((await files.find('interface/core.gfx'))?.layer.name).toBe('game');
    expect((await files.find('interface/base.gfx'))?.absolutePath).toBe(
      join(root, 'base', 'interface', 'base.gfx'),
    );
  });

  it('skips a folder with the same name as a file', async () => {
    expect((await files.find('interface/ideas.gui'))?.layer.name).toBe('game');
  });

  it('lists a folder across layers with one winner per name', async () => {
    const listed = await files.list('interface');
    expect(listed.map((f) => `${f.path.toLowerCase()} ${f.layer.name}`)).toEqual([
      'interface/base.gfx Base',
      'interface/core.gfx game',
      'interface/ideas.gui game',
      'interface/topbar.gui Top',
    ]);
    expect((await files.list('interface/', '.GFX')).map((f) => f.layer.name)).toEqual([
      'Base',
      'game',
    ]);
  });

  it('hides earlier layers in a replace_path folder but not in its subfolders', async () => {
    expect((await files.list('common/ideas')).map((f) => f.path)).toEqual(['common/ideas/b.txt']);
    expect(await files.find('common/ideas/a.txt')).toBeUndefined();

    const replacing = new GameFiles([
      { name: 'game', root: join(root, 'game'), replacePaths: [] },
      { name: 'Top', root: join(root, 'top'), replacePaths: ['interface/'] },
    ]);
    expect((await replacing.list('interface')).map((f) => f.layer.name)).toEqual(['Top']);
    expect(await replacing.find('interface/core.gfx')).toBeUndefined();
    expect((await replacing.find('interface/sub/deep.gui'))?.layer.name).toBe('game');
  });

  it('finds nothing outside the layers', async () => {
    expect(await files.find('../game/interface/core.gfx')).toBeUndefined();
    expect(await files.find(join(root, 'game', 'interface', 'core.gfx'))).toBeUndefined();
    expect(await files.find('interface/missing.gui')).toBeUndefined();
    expect(await files.read('interface/missing.gui')).toBeUndefined();
    expect(await files.list('no/such/folder')).toEqual([]);
  });
});
