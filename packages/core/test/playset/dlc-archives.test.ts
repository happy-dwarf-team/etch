import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GameFiles,
  ZipArchive,
  archivePlaceOnDisk,
  findDlcArchives,
  findPlayset,
  readDisabledDlcs,
  readGamePath,
  splitArchivePath,
  statGamePath,
} from '../../src/playset/index.ts';
import { fakeEnvironment, makeTree, removeTree } from './fixture.ts';
import { makeZip } from './zip-fixture.ts';

const text = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

describe('ZipArchive', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTree({});
  });

  afterEach(async () => {
    await removeTree(root);
  });

  it('lists the files of an archive and reads stored and deflated entries', async () => {
    const path = join(root, 'a.zip');
    await writeFile(
      path,
      makZipWithFolder({
        'interface/': '',
        'interface/a.gfx': 'spriteTypes = {}'.repeat(50),
        'gfx/b.dds': 'DDS stored',
      }),
    );
    const zip = new ZipArchive(path);
    expect((await zip.list()).map((e) => e.name)).toEqual(['interface/a.gfx', 'gfx/b.dds']);
    const gfx = await zip.entry('INTERFACE\\A.GFX');
    expect(gfx?.method).toBe(8);
    expect(text(await zip.read(defined(gfx)))).toBe('spriteTypes = {}'.repeat(50));
    const dds = await zip.entry('gfx/b.dds');
    expect(dds?.method).toBe(0);
    expect(text(await zip.read(defined(dds)))).toBe('DDS stored');
  });

  it('finds the directory behind an archive comment, and lists nothing for a broken file', async () => {
    const good = join(root, 'c.zip');
    await writeFile(good, makeZip({ 'x.txt': 'x' }, { comment: 'PK\u0005\u0006 not a record' }));
    expect((await new ZipArchive(good).list()).map((e) => e.name)).toEqual(['x.txt']);
    const broken = join(root, 'broken.zip');
    await writeFile(broken, 'not a zip');
    expect(await new ZipArchive(broken).list()).toEqual([]);
    expect(await new ZipArchive(join(root, 'missing.zip')).list()).toEqual([]);
  });

  it('reads a path through an archive as the entry, and any other path from disk', async () => {
    const zip = join(root, 'dlc', 'd.zip');
    await makeTreeAt(root, { 'plain.txt': 'on disk' });
    await writeFile(join(root, 'z.zip'), makeZip({ 'interface/a.gfx': 'in the archive' }));
    expect(splitArchivePath(join(root, 'z.zip', 'interface', 'a.gfx'))).toEqual({
      archive: join(root, 'z.zip'),
      entry: 'interface/a.gfx',
    });
    expect(splitArchivePath(zip)).toBeUndefined();
    expect(text(await readGamePath(join(root, 'z.zip', 'interface', 'a.gfx')))).toBe(
      'in the archive',
    );
    expect(text(await readGamePath(join(root, 'plain.txt')))).toBe('on disk');
    expect((await statGamePath(join(root, 'z.zip', 'interface', 'a.gfx'))).isFile()).toBe(true);
    await expect(readGamePath(join(root, 'z.zip', 'none.txt'))).rejects.toThrow('has no');
  });

  it('reads a folder whose name ends in .zip from disk, not as an archive', async () => {
    const tree = await makeTree({ 'mod/My.zip/interface/x.gui': 'a folder' });
    try {
      const path = join(tree, 'mod', 'My.zip', 'interface', 'x.gui');
      expect(text(await readGamePath(path))).toBe('a folder');
      expect((await statGamePath(path)).isFile()).toBe(true);
      expect(archivePlaceOnDisk(path)).toBeUndefined();
      await writeFile(join(tree, 'z.zip'), makeZip({ 'a.txt': 'a' }));
      expect(archivePlaceOnDisk(join(tree, 'z.zip', 'a.txt'))).toEqual({
        archive: join(tree, 'z.zip'),
        entry: 'a.txt',
      });
    } finally {
      await removeTree(tree);
    }
  });

  it('reads an archive again after it was missing or rewritten', async () => {
    const archive = join(root, 'later.zip');
    const path = join(archive, 'a.txt');
    const missing = new ZipArchive(archive);
    expect(await missing.list()).toEqual([]);
    await expect(readGamePath(path)).rejects.toThrow();
    await writeFile(archive, makeZip({ 'a.txt': 'first' }));
    expect((await missing.list()).map((e) => e.name)).toEqual(['a.txt']);
    expect(text(await readGamePath(path))).toBe('first');
    await writeFile(archive, makeZip({ 'other.txt': 'padding', 'a.txt': 'second, longer' }));
    expect(text(await readGamePath(path))).toBe('second, longer');
  });
});

describe('the DLC archives', () => {
  let root: string;
  let game: string;

  beforeEach(async () => {
    root = await makeTree({
      'game/eu4.exe': '',
      'game/interface/core.gfx': 'game core',
      'game/interface/shared.gfx': 'game shared',
      'game/dlc/dlc010_cop/dlc010.dlc':
        'name = "Conquest of Paradise"\narchive = "dlc/dlc010_cop/dlc010.zip"\n',
      'game/dlc/dlc020_art/dlc020.dlc':
        'name = "Art of War"\narchive = "dlc/dlc020_art/dlc020.zip"\n',
      'game/dlc/dlc030_none/dlc030.dlc':
        'name = "No archive"\narchive = "dlc/dlc030_none/dlc030.zip"\n',
      'game/dlc/dlc040_up/dlc040.dlc': 'name = "Outside"\narchive = "../outside.zip"\n',
      'game/builtin_dlc/dlc001_units/dlc001.dlc':
        'name = "Unit Pack"\narchive = "builtin_dlc/dlc001_units/dlc001.zip"\n',
      'mod/interface/shared.gfx': 'mod shared',
      'profile/dlc_load.json': JSON.stringify({
        enabled_mods: [],
        disabled_dlcs: ['DLC\\dlc020_art\\dlc020.dlc'],
      }),
    });
    game = join(root, 'game');
    await writeFile(
      join(game, 'dlc/dlc010_cop/dlc010.zip'),
      makeZip({
        'interface/cop.gfx': 'cop gfx',
        'interface/shared.gfx': 'cop shared',
        'gfx/event_pictures/COP/picture.dds': 'cop picture',
      }),
    );
    await writeFile(
      join(game, 'dlc/dlc020_art/dlc020.zip'),
      makeZip({ 'interface/art.gfx': 'art gfx' }),
    );
    await writeFile(
      join(game, 'builtin_dlc/dlc001_units/dlc001.zip'),
      makeZip({ 'interface/cop.gfx': 'units cop', 'gfx/units/u.dds': 'unit' }),
    );
  });

  afterEach(async () => {
    await removeTree(root);
  });

  it("reads every DLC with an archive that dlc_load.json's disabled_dlcs does not name", async () => {
    const disabled = await readDisabledDlcs(join(root, 'profile'));
    expect(disabled).toEqual(['DLC\\dlc020_art\\dlc020.dlc']);
    const dlcs = await findDlcArchives(game, disabled);
    expect(dlcs.map((d) => [d.name, d.descriptor])).toEqual([
      ['Unit Pack', 'builtin_dlc/dlc001_units/dlc001.dlc'],
      ['Conquest of Paradise', 'dlc/dlc010_cop/dlc010.dlc'],
    ]);
    expect((await findDlcArchives(game, [])).map((d) => d.name)).toEqual([
      'Unit Pack',
      'Conquest of Paradise',
      'Art of War',
    ]);
    expect(await readDisabledDlcs(join(root, 'nowhere'))).toEqual([]);
    expect(await readDisabledDlcs(undefined)).toEqual([]);
  });

  it('puts the archives between the game folder and the mods', async () => {
    const dlcs = await findDlcArchives(game, []);
    const files = new GameFiles([
      { name: 'game', root: game, replacePaths: [] },
      ...dlcs.map((d) => ({ name: d.name, root: d.archive, replacePaths: [], archive: true })),
      { name: 'Mod', root: join(root, 'mod'), replacePaths: [] },
    ]);
    const shared = await files.find('interface/shared.gfx');
    expect(shared?.layer.name).toBe('Mod');
    const cop = await files.find('Interface\\COP.gfx');
    expect(cop?.layer.name).toBe('Conquest of Paradise');
    expect(cop?.archiveEntry).toBe('interface/cop.gfx');
    expect(cop?.absolutePath).toBe(join(game, 'dlc/dlc010_cop/dlc010.zip', 'interface', 'cop.gfx'));
    expect(text(await files.readFile(defined(cop)))).toBe('cop gfx');
    expect(text(defined(await files.read('interface/core.gfx')))).toBe('game core');
    expect(text(defined(await files.read('gfx/event_pictures/cop/PICTURE.dds')))).toBe(
      'cop picture',
    );
    expect((await files.list('interface', '.gfx')).map((f) => `${f.path} ${f.layer.name}`)).toEqual(
      [
        'interface/art.gfx Art of War',
        'interface/cop.gfx Conquest of Paradise',
        'interface/core.gfx game',
        'interface/shared.gfx Mod',
      ],
    );
    expect(await files.folders('gfx')).toEqual(['gfx/event_pictures', 'gfx/units']);
    expect(text(await readGamePath(defined(cop).absolutePath))).toBe('cop gfx');
  });

  it("hides an archive's files where a mod's replace_path hides the game's", async () => {
    const dlcs = await findDlcArchives(game, []);
    const files = new GameFiles([
      { name: 'game', root: game, replacePaths: [] },
      ...dlcs.map((d) => ({ name: d.name, root: d.archive, replacePaths: [], archive: true })),
      { name: 'Mod', root: join(root, 'mod'), replacePaths: ['interface'] },
    ]);
    expect((await files.list('interface')).map((f) => f.layer.name)).toEqual(['Mod']);
    expect(files.replacesGameFolder('interface')).toBe(true);
  });

  it('gives the playset the DLCs of the game folder and the profile', async () => {
    const playset = await findPlayset({
      gamePath: game,
      workspaceFolder: join(root, 'mod'),
      profileFolder: join(root, 'profile'),
      environment: fakeEnvironment({}),
      supportedExeSha256: [],
    });
    expect(playset.dlcs.map((d) => d.name)).toEqual(['Unit Pack', 'Conquest of Paradise']);
    expect(playset.files.layers.map((l) => l.name).slice(0, 3)).toEqual([
      'game',
      'Unit Pack',
      'Conquest of Paradise',
    ]);
    expect((await playset.files.find('interface/art.gfx'))?.layer.name).toBeUndefined();

    const corpus = await findPlayset({
      gamePath: game,
      workspaceFolder: join(root, 'mod'),
      profileFolder: join(root, 'profile'),
      disabledDlcs: ['dlc/dlc010_cop/dlc010.dlc'],
      environment: fakeEnvironment({}),
      supportedExeSha256: [],
    });
    expect(corpus.dlcs.map((d) => d.name)).toEqual(['Unit Pack', 'Art of War']);
    expect((await corpus.files.find('interface/cop.gfx'))?.layer.name).toBe('Unit Pack');
  });
});

function makZipWithFolder(entries: Record<string, string>): Buffer {
  return makeZip(entries, { stored: ['gfx/b.dds'] });
}

async function makeTreeAt(root: string, files: Record<string, string>): Promise<void> {
  for (const [name, content] of Object.entries(files)) await writeFile(join(root, name), content);
}
