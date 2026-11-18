import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findGameInSteam,
  findProfileFolder,
  findSteamFolders,
  pathKey,
  samePath,
} from '../../src/playset/locate.ts';
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

// The Linux paths of discovery with the platform given, so that they run on Windows (CI) too.
describe('discovery on Linux', () => {
  let root: string;
  let home: string;
  let linux: DiscoveryEnvironment;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'etch-linux-'));
    home = join(root, 'home');
    linux = {
      readRegistryValue: () => Promise.resolve(undefined),
      env: {},
      homedir: home,
      platform: 'linux',
    };
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  const leaf = (gog = false): string =>
    join('Paradox Interactive', gog ? 'Europa Universalis IV GOG' : 'Europa Universalis IV');

  it("finds Steam's own folders and Flatpak's that have steamapps", async () => {
    const steam = join(home, '.steam', 'steam');
    const flatpak = join(
      home,
      '.var',
      'app',
      'com.valvesoftware.Steam',
      '.local',
      'share',
      'Steam',
    );
    await mkdir(join(steam, 'steamapps'), { recursive: true });
    await mkdir(join(flatpak, 'steamapps'), { recursive: true });
    // No steamapps: not a Steam folder.
    await mkdir(join(home, '.local', 'share', 'Steam'), { recursive: true });
    expect(await findSteamFolders(linux)).toEqual([steam, flatpak]);
    // XDG_DATA_HOME moves the second one.
    const data = join(root, 'data');
    await mkdir(join(data, 'Steam', 'steamapps'), { recursive: true });
    expect(await findSteamFolders({ ...linux, env: { XDG_DATA_HOME: data } })).toEqual([
      steam,
      join(data, 'Steam'),
      flatpak,
    ]);
  });

  it('finds the game in a library that lists EU4 before the Steam folder itself', async () => {
    const steam = join(home, '.steam', 'steam');
    const library = join(root, 'library');
    const game = join(library, 'steamapps', 'common', 'Europa Universalis IV');
    await mkdir(join(steam, 'steamapps'), { recursive: true });
    await mkdir(game, { recursive: true });
    await writeFile(join(game, 'eu4.exe'), 'exe');
    const vdf = (path: string, apps: string): string =>
      `"path" "${path.replaceAll('\\', '\\\\')}" "apps" { ${apps} }`;
    await writeFile(
      join(steam, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders" { "0" { ${vdf(steam, '"228980" "1"')} } "1" { ${vdf(library, '"236850" "1"')} } }`,
    );
    expect(await findGameInSteam(linux)).toBe(game);
  });

  it("uses the Proton prefix's Documents next to the game's library", async () => {
    const game = join(root, 'lib', 'steamapps', 'common', 'Europa Universalis IV');
    const pfx = join(root, 'lib', 'steamapps', 'compatdata', '236850', 'pfx');
    const profile = join(pfx, 'drive_c', 'users', 'steamuser', 'Documents', leaf());
    await mkdir(game, { recursive: true });
    await mkdir(profile, { recursive: true });
    expect(await findProfileFolder(game, linux)).toBe(profile);
  });

  it("uses the native game's folder in XDG_DATA_HOME, with GOG's name for GOG", async () => {
    const game = join(root, 'gog');
    await mkdir(game, { recursive: true });
    await writeFile(join(game, 'goggame-2057001589.info'), '{}');
    const native = join(home, '.local', 'share', leaf(true));
    await mkdir(native, { recursive: true });
    expect(await findProfileFolder(game, linux)).toBe(native);
  });

  it('falls back to Documents when neither exists', async () => {
    expect(await findProfileFolder(undefined, linux)).toBe(join(home, 'Documents', leaf()));
  });
});
