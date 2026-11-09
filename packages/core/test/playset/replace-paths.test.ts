import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replacePathWarnings } from '../../src/playset/replace-paths.ts';
import type { Mod } from '../../src/playset/index.ts';
import { makeTree, removeTree } from './fixture.ts';

describe('replacePathWarnings', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTree({
      'a/interface/assets/sprites.gfx': 'spriteTypes = { }',
      'a/gfx/loadingscreens/load_1.dds': 'not an asset',
      'a/gfx/entities/unit.asset': 'entity = { }',
      'a/localisation/replace/r_l_english.yml': 'l_english:',
      'a/events/flavour/x.txt': 'namespace = x',
      'b/localisation/english/b_l_english.yml': 'l_english:',
      'b/interface/nested/deeper/deep.gui': 'guiTypes = { }',
    });
  });

  afterEach(async () => {
    await removeTree(root);
  });

  const mod = (name: string, replacePaths: string[]): Mod => ({
    name,
    root: join(root, name),
    descriptorPath: join(root, `${name}.mod`),
    source: 'profile',
    dependencies: [],
    replacePaths,
  });

  it('warns when a subfolder of a recursive root holds files the game then skips', async () => {
    const warnings = await replacePathWarnings([
      mod('a', ['interface/assets', 'gfx/entities', 'common/ideas', 'interface']),
      mod('b', []),
    ]);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['replace-path-hides-files', join(root, 'a.mod')],
      ['replace-path-hides-files', join(root, 'a.mod')],
    ]);
    expect(warnings[0]?.message).toContain('replace_path = "interface/assets"');
    expect(warnings[0]?.message).toContain('a: interface/assets/sprites.gfx');
    expect(warnings[1]?.message).toContain('.asset');
  });

  it('counts files a later mod puts in the folder, not an earlier one', async () => {
    expect(
      await replacePathWarnings([mod('a', []), mod('b', ['localisation/english'])]),
    ).toHaveLength(1);
    expect(await replacePathWarnings([mod('b', []), mod('a', ['interface/nested'])])).toHaveLength(
      0,
    );
    expect(
      (await replacePathWarnings([mod('a', ['localisation/english']), mod('b', [])]))[0]?.message,
    ).toContain('b: localisation/english/b_l_english.yml');
  });

  it('stays quiet for folders without a loaded file, roots, deeper files and localisation/replace', async () => {
    const warnings = await replacePathWarnings([
      mod('a', [
        'gfx/loadingscreens',
        'gfx/flags',
        'localisation',
        'localisation/replace',
        'events',
        'events/flavour/none',
      ]),
      mod('b', ['interface/nested']),
    ]);
    expect(warnings).toEqual([]);
  });
});
