import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PrivateInstallError,
  gameHostLayout,
  installExists,
  parseGameManifest,
  prepareInstall,
  privateDescriptor,
  privateInstallLayout,
  removeInstall,
  type InstallLayout,
  type LiveGameMod,
} from '../src/live-game/install.ts';
import type { SaveFile } from '../src/live-game/saves.ts';

const sha = (data: string | Buffer): string =>
  createHash('sha256').update(data).digest('hex').toUpperCase();

const EXE = 'MZ eu4 1.37.5';
const PINNED: Record<string, string> = {
  'version.dll': 'anvil proxy',
  'anvil/anvil.toml': 'anvil config',
  'anvil/plugins/anvil-game/anvil_game.dll': 'anvil-game',
  'anvil/plugins/anvil-game/plugin.toml': 'id = "anvil-game"',
  'anvil/plugins/bellows/bellows.dll': 'bellows',
  'anvil/plugins/etch/etch.dll': 'etch plugin',
  'anvil/plugins/etch/plugin.toml': 'id = "etch"',
};

async function addFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

/** Every entry under `root` with its kind, size, modification time and content hash. */
async function snapshot(root: string): Promise<Map<string, string>> {
  const rows = new Map<string, string>();
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      const info = await lstat(path);
      if (info.isDirectory()) {
        rows.set(path, `dir ${String(info.mtimeMs)}`);
        await walk(path);
      } else {
        rows.set(path, `${String(info.size)} ${String(info.mtimeMs)} ${sha(await readFile(path))}`);
      }
    }
  };
  await walk(root);
  return rows;
}

function manifest(exe = EXE, files = PINNED): object {
  return {
    formatVersion: 1,
    game: { version: '1.37.5', exeSha256: sha(exe) },
    files: Object.entries(files).map(([path, data]) => ({
      path,
      sha256: sha(data),
      build: path.includes('/etch/') ? 'etch' : path.includes('bellows') ? 'bellows' : 'anvil',
    })),
  };
}

let temp: string;
let game: string;
let builds: string;
let layout: InstallLayout;
let mods: LiveGameMod[];
let player: string | undefined;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'etch-host-'));
  game = join(temp, 'steam', 'Europa Universalis IV');
  builds = join(temp, 'vsix', 'game');
  layout = privateInstallLayout(join(temp, 'storage'));
  await addFiles(game, {
    'eu4.exe': EXE,
    'steam_api64.dll': 'steam',
    'launcher-settings.json': '{"rawVersion":"v1.37.5.0"}',
    'launcher-installer-windows_2024.14.msi': 'installer',
    'userdir.txt': 'C:/somewhere/else/',
    'console_history.txt': 'player history',
    'common/countries.txt': 'countries',
    'interface/core.gui': 'core',
    'gfx/interface/x.dds': 'dds',
  });
  await addFiles(builds, PINNED);
  await writeFile(join(builds, 'manifest.json'), JSON.stringify(manifest()));
  const workshop = join(temp, 'workshop', '3290499798');
  await addFiles(workshop, {
    'descriptor.mod':
      '\uFEFFname="Proper 2K UI Enhanced"\r\npath="mod/old"\r\nreplace_path="interface/x"\r\ndependencies={\r\n\t"Base"\r\n}\r\n',
  });
  player = undefined;
  mods = [
    { name: 'Base', root: join(temp, 'base') },
    {
      name: 'Proper 2K UI Enhanced',
      root: workshop,
      descriptorPath: join(workshop, 'descriptor.mod'),
    },
  ];
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const prepare = (folder = game, into = layout, continueSave?: string | SaveFile) =>
  prepareInstall({
    layout: into,
    gameFolder: folder,
    buildsFolder: builds,
    mods,
    display: { width: 3440, height: 1440, language: 'english' },
    playerProfile: player,
    continueSave,
  });

describe('prepareInstall', () => {
  it('links the folders, copies the top-level files and installs the pinned builds', async () => {
    const before = await snapshot(game);
    const prepared = await prepare();
    expect(await installExists(layout)).toBe(true);
    for (const folder of ['common', 'interface', 'gfx']) {
      const path = join(layout.game, folder);
      expect((await lstat(path)).isSymbolicLink()).toBe(true);
      expect(await readlink(path)).toBe(join(game, folder));
    }
    expect(await readFile(join(layout.game, 'eu4.exe'), 'utf8')).toBe(EXE);
    expect((await lstat(join(layout.game, 'eu4.exe'))).isSymbolicLink()).toBe(false);
    expect(await readFile(join(layout.game, 'steam_api64.dll'), 'utf8')).toBe('steam');
    expect(await readFile(join(layout.game, 'userdir.txt'), 'utf8')).toBe('');
    const names = await readdir(layout.game);
    expect(names).not.toContain('launcher-installer-windows_2024.14.msi');
    expect(names).not.toContain('console_history.txt');
    for (const [path, data] of Object.entries(PINNED)) {
      expect(await readFile(join(layout.game, ...path.split('/')), 'utf8')).toBe(data);
    }
    expect(prepared.restored).toHaveLength(Object.keys(PINNED).length);
    expect(prepared.exe).toBe(join(layout.game, 'eu4.exe'));
    expect(prepared.gameFolder).toBe(layout.game);
    expect(prepared.arguments).toEqual([`-userdir=${layout.profile.replaceAll('\\', '/')}/`]);
    // The player's game folder is only read.
    expect(await snapshot(game)).toEqual(before);
  });

  it('writes the private profile with the playset', async () => {
    await prepare();
    const dlcLoad = JSON.parse(await readFile(join(layout.profile, 'dlc_load.json'), 'utf8')) as {
      enabled_mods: string[];
      disabled_dlcs: string[];
    };
    expect(dlcLoad).toEqual({
      enabled_mods: ['mod/mod-001.mod', 'mod/mod-002.mod'],
      disabled_dlcs: [],
    });
    const slash = (p: string) => p.replaceAll('\\', '/');
    expect(await readFile(join(layout.profile, 'mod', 'mod-001.mod'), 'utf8')).toBe(
      `name="Base"\npath="${slash(join(temp, 'base'))}"\n`,
    );
    expect(await readFile(join(layout.profile, 'mod', 'mod-002.mod'), 'utf8')).toBe(
      'name="Proper 2K UI Enhanced"\nreplace_path="interface/x"\ndependencies={\n\t"Base"\n}\n' +
        `path="${slash(join(temp, 'workshop', '3290499798'))}"\n`,
    );
    const settings = await readFile(join(layout.profile, 'settings.txt'), 'utf8');
    expect(settings).toContain(
      'language="l_english"\ngraphics={\n\tsize={\n\t\tx=3440\n\t\ty=1440\n',
    );
    expect(settings).toContain('\tfullScreen=no\n\tborderless=yes\n');
    expect(settings).not.toContain('volume');
    const pdx = await readFile(join(layout.profile, 'pdx_settings.txt'), 'utf8');
    expect(pdx).toContain('"windowed_resolution"={\n\t\tvalue="3440x1440"');
    expect(pdx).toContain('"display_mode"={\n\t\tvalue="borderless_fullscreen"');
    // A later start with a smaller playset leaves no descriptor of the earlier one behind.
    mods = [];
    await prepare();
    expect(await readdir(join(layout.profile, 'mod'))).toEqual([]);
    expect(await readdir(layout.root)).not.toContain('overlay');
  });

  it("takes the player's settings, with a monthly autosave when theirs is off", async () => {
    player = join(temp, 'Documents', 'Paradox Interactive', 'Europa Universalis IV');
    const settings =
      'language="l_german"\r\nautosave="NEVER"\r\ngraphics={\r\n\tgame_ui_scale=1.250\r\n}\r\n';
    await addFiles(player, { 'settings.txt': settings, 'pdx_settings.txt': '"Graphics"={}\n' });
    const before = await snapshot(player);
    const prepared = await prepare(game, layout, 'Verne1444_11_11.eu4');
    expect(prepared.settings).toEqual({
      copied: ['settings.txt', 'pdx_settings.txt'],
      autosaveOn: true,
    });
    expect(await readFile(join(layout.profile, 'settings.txt'), 'utf8')).toBe(
      settings.replace('autosave="NEVER"', 'autosave="MONTHLY"'),
    );
    expect(await readFile(join(layout.profile, 'pdx_settings.txt'), 'utf8')).toBe(
      '"Graphics"={}\n',
    );
    expect(prepared.arguments).toEqual([
      '-continue=Verne1444_11_11.eu4',
      `-userdir=${layout.profile.replaceAll('\\', '/')}/`,
    ]);
    expect(prepared.savesFolder).toBe(join(layout.profile, 'save games'));
    // The player's profile is only read.
    expect(await snapshot(player)).toEqual(before);
    await expect(prepare(game, layout, '../x.eu4')).rejects.toBeInstanceOf(PrivateInstallError);
  });

  it("copies a player's save once the install exists, on the first start too", async () => {
    player = join(temp, 'player');
    await addFiles(player, { 'save games/Verne1444_11_11.eu4': 'EU4txt\n' });
    const save = {
      name: 'Verne1444_11_11.eu4',
      path: join(player, 'save games', 'Verne1444_11_11.eu4'),
      modifiedMs: 0,
      ironman: false,
    };
    expect(await installExists(layout)).toBe(false);
    const prepared = await prepare(game, layout, save);
    expect(prepared.continueSave).toBe('Verne1444_11_11.eu4');
    expect(prepared.arguments[0]).toBe('-continue=Verne1444_11_11.eu4');
    expect(await readFile(join(layout.profile, 'save games', 'Verne1444_11_11.eu4'), 'utf8')).toBe(
      'EU4txt\n',
    );
  });

  it('refuses an eu4.exe other than the pinned build, before it creates anything', async () => {
    await writeFile(join(game, 'eu4.exe'), 'MZ eu4 1.36');
    await expect(prepare()).rejects.toMatchObject({ code: 'unsupported-game' });
    expect(await installExists(layout)).toBe(false);
    expect(await lstat(layout.root).catch(() => undefined)).toBeUndefined();
  });

  it('refuses to start once the game folder changes to another build', async () => {
    await prepare();
    await writeFile(join(game, 'eu4.exe'), 'MZ eu4 1.38');
    await expect(prepare()).rejects.toBeInstanceOf(PrivateInstallError);
  });

  it('installs a changed or missing pinned file again and removes any other plugin', async () => {
    await prepare();
    await writeFile(join(layout.game, 'anvil', 'plugins', 'etch', 'etch.dll'), 'tampered');
    await rm(join(layout.game, 'version.dll'));
    await addFiles(layout.game, {
      'anvil/plugins/tongs/tongs.dll': 'another plugin',
      'anvil/plugins/etch/extra.dll': 'extra',
      'anvil/anvil.log': 'written by Anvil',
      'anvil/data/bellows/profile.txt': 'written by Bellows',
      'anvil/data/tongs/settings.toml': 'enabled = true',
    });
    const prepared = await prepare();
    expect([...prepared.restored].sort()).toEqual(['anvil/plugins/etch/etch.dll', 'version.dll']);
    expect(await readFile(join(layout.game, 'anvil', 'plugins', 'etch', 'etch.dll'), 'utf8')).toBe(
      'etch plugin',
    );
    expect((await readdir(join(layout.game, 'anvil', 'plugins'))).sort()).toEqual([
      'anvil-game',
      'bellows',
      'etch',
    ]);
    expect(await readdir(join(layout.game, 'anvil', 'plugins', 'etch'))).not.toContain('extra.dll');
    // What Anvil and its plugins write at run time stays.
    expect(await readFile(join(layout.game, 'anvil', 'anvil.log'), 'utf8')).toBe(
      'written by Anvil',
    );
    expect(
      await readFile(join(layout.game, 'anvil', 'data', 'bellows', 'profile.txt'), 'utf8'),
    ).toBe('written by Bellows');
    // Tongs runs with its defaults: no pipe.
    expect(await readdir(join(layout.game, 'anvil', 'data', 'tongs'))).toEqual([]);
    // Etch's plugin gets the pick mode key (spec section 7).
    expect(
      await readFile(join(layout.game, 'anvil', 'data', 'etch', 'settings.toml'), 'utf8'),
    ).toBe('pick_mode_key = "Ctrl+Shift+E"\n');
  });

  it('refuses a pinned file of the VSIX that does not match the manifest', async () => {
    await writeFile(join(builds, 'anvil', 'plugins', 'bellows', 'bellows.dll'), 'damaged');
    await expect(prepare()).rejects.toMatchObject({ code: 'damaged-builds' });
  });

  it('copies a top-level file again when the game updates it, and keeps run-time files', async () => {
    await prepare();
    await writeFile(join(layout.game, 'console_history.txt'), 'live game history');
    await writeFile(join(game, 'steam_api64.dll'), 'steam, updated');
    await prepare();
    expect(await readFile(join(layout.game, 'steam_api64.dll'), 'utf8')).toBe('steam, updated');
    expect(await readFile(join(layout.game, 'console_history.txt'), 'utf8')).toBe(
      'live game history',
    );
  });

  it('points the junctions at another game folder and drops those it no longer has', async () => {
    await prepare();
    const other = join(temp, 'library', 'Europa Universalis IV');
    await addFiles(other, { 'eu4.exe': EXE, 'common/countries.txt': 'countries' });
    await prepare(other);
    expect(await readlink(join(layout.game, 'common'))).toBe(join(other, 'common'));
    expect(await lstat(join(layout.game, 'interface')).catch(() => undefined)).toBeUndefined();
  });

  it('takes no Anvil from the game folder', async () => {
    await addFiles(game, {
      'version.dll': "the player's proxy",
      'anvil/plugins/tongs/tongs.dll': 't',
    });
    const before = await snapshot(game);
    await prepare();
    expect(await readFile(join(layout.game, 'version.dll'), 'utf8')).toBe('anvil proxy');
    expect((await lstat(join(layout.game, 'anvil'))).isSymbolicLink()).toBe(false);
    expect(await readdir(join(layout.game, 'anvil', 'plugins'))).not.toContain('tongs');
    expect(await snapshot(game)).toEqual(before);
  });

  it('leaves a storage folder alone that holds something else', async () => {
    await addFiles(layout.root, { 'notes.txt': 'not Etch' });
    await expect(prepare()).rejects.toMatchObject({ code: 'not-an-install' });
    expect(await readdir(layout.root)).toEqual(['notes.txt']);
  });
});

describe('removeInstall', () => {
  it('removes the install and the junctions, never what they point at', async () => {
    await prepare();
    const before = await snapshot(game);
    expect(await removeInstall(layout)).toBe(true);
    expect(await lstat(layout.root).catch(() => undefined)).toBeUndefined();
    expect(await snapshot(game)).toEqual(before);
    expect((await stat(join(game, 'common', 'countries.txt'))).isFile()).toBe(true);
    expect(await removeInstall(layout)).toBe(false);
  });

  it("removes 1.x's game host install with its overlay mod, beside the private install", async () => {
    const storage = join(temp, 'storage');
    const old = gameHostLayout(storage);
    expect(old.root).not.toBe(layout.root);
    await prepare(game, old);
    await addFiles(old.root, { 'overlay/interface/etch_topbar.gui': 'black copy' });
    await prepare();
    const before = await snapshot(game);
    expect(await removeInstall(old)).toBe(true);
    expect(await readdir(storage)).toEqual(['private-install']);
    expect(await installExists(layout)).toBe(true);
    expect(await snapshot(game)).toEqual(before);
  });

  it('refuses a folder without the install record', async () => {
    await addFiles(layout.root, { 'game/eu4.exe': EXE });
    await expect(removeInstall(layout)).rejects.toMatchObject({ code: 'not-an-install' });
    expect(await readFile(join(layout.root, 'game', 'eu4.exe'), 'utf8')).toBe(EXE);
  });
});

describe('parseGameManifest', () => {
  it('reads the manifest packaging writes', () => {
    const parsed = parseGameManifest(manifest());
    expect(parsed.game.exeSha256).toBe(sha(EXE));
    expect(parsed.files.map((f) => f.path)).toEqual(Object.keys(PINNED));
  });

  it.each([
    ['a game folder', 'gfx/interface/x.dds'],
    ['a parent folder', 'anvil/../eu4.exe'],
    ['a backslash', 'anvil\\anvil.toml'],
    ['an absolute path', 'C:/anvil/anvil.toml'],
    ['a folder named version.dll', 'version.dll/x'],
  ])('refuses a file path into %s', (_, path) => {
    expect(() => parseGameManifest(manifest(EXE, { [path]: 'x' }))).toThrow(PrivateInstallError);
  });

  it('refuses a manifest without the pinned game', () => {
    expect(() => parseGameManifest({ formatVersion: 1, files: [] })).toThrow(/game/);
  });
});

describe('privateDescriptor', () => {
  it("replaces the descriptor's path and archive with the mod's folder", () => {
    const text =
      'name="X"\narchive="mod/x.zip"\n  path = "mod/x"\nsupported_version="v1.37.*.*"\n\n';
    expect(privateDescriptor({ name: 'X', root: 'D:\\mods\\x' }, text)).toBe(
      'name="X"\nsupported_version="v1.37.*.*"\npath="D:/mods/x"\n',
    );
  });

  it('names a mod without a descriptor after itself', () => {
    expect(privateDescriptor({ name: 'Say "hi"', root: 'D:\\mods\\hi\\' }, undefined)).toBe(
      `name="Say 'hi'"\npath="D:/mods/hi"\n`,
    );
  });
});
