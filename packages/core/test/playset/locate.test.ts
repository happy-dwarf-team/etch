import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findProfileFolder, pathKey, samePath } from '../../src/playset/locate.ts';
import type { DiscoveryEnvironment } from '../../src/playset/locate.ts';

describe('pathKey', () => {
  it('compares paths without regard to case, separators or a trailing separator', () => {
    const dir = resolve('Games', 'EU4');
    expect(pathKey(`${dir}${sep}${sep}`)).toBe(pathKey(dir));
    expect(pathKey(dir)).toBe(dir.replaceAll('\\', '/').toLowerCase());
    expect(samePath(`${dir}/`, dir.toUpperCase())).toBe(true);
  });

  it('runs in time linear in a long run of separators', () => {
    // resolve() collapses the run already; the trim no longer relies on it, as /\/+$/ did
    // (quadratic in a run that does not end the path, CodeQL js/polynomial-redos).
    const started = performance.now();
    expect(pathKey(`a${'/'.repeat(100_000)}b`)).toBe(
      resolve('a', 'b').replaceAll('\\', '/').toLowerCase(),
    );
    expect(performance.now() - started).toBeLessThan(250);
  });
});

describe('findProfileFolder', () => {
  let root: string;
  let game: string;
  let environment: DiscoveryEnvironment;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'etch-profile-'));
    game = join(root, 'game');
    await mkdir(game);
    environment = {
      readRegistryValue: () => Promise.resolve(undefined),
      env: {},
      homedir: join(root, 'home'),
    };
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  const documents = (folder: string): string =>
    join(root, 'home', 'Documents', 'Paradox Interactive', folder);

  it('uses the Steam name in Documents', async () => {
    expect(await findProfileFolder(game, environment)).toBe(documents('Europa Universalis IV'));
    expect(await findProfileFolder(undefined, environment)).toBe(
      documents('Europa Universalis IV'),
    );
  });

  it("uses GOG's own folder for a GOG install", async () => {
    await writeFile(join(game, 'goggame-2057001589.info'), '{}');
    expect(await findProfileFolder(game, environment)).toBe(documents('Europa Universalis IV GOG'));
  });

  it('lets userdir.txt win, also on GOG', async () => {
    await writeFile(join(game, 'goggame-2057001589.info'), '{}');
    await writeFile(join(game, 'userdir.txt'), join(root, 'mine'));
    expect(await findProfileFolder(game, environment)).toBe(join(root, 'mine'));
  });
});
