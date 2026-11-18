// Wine and Proton paths on any host: the Linux layout test (linux-proton.test.ts) is skipped on
// Windows, where CI runs, so the path rules are checked here with folders that work on both.
import { realpathSync } from 'node:fs';
import { mkdir, symlink } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hostPathFromWindows, isWindowsDrivePath, winePrefixOf } from '../../src/playset/index.ts';
import { makeTree, removeTree } from './fixture.ts';

describe('isWindowsDrivePath', () => {
  it('takes a drive letter followed by a separator or nothing', () => {
    expect(isWindowsDrivePath('C:/users/steamuser')).toBe(true);
    expect(isWindowsDrivePath('z:\\home\\me')).toBe(true);
    expect(isWindowsDrivePath('D:')).toBe(true);
    expect(isWindowsDrivePath('C:users')).toBe(false);
    expect(isWindowsDrivePath('/home/me/C:/x')).toBe(false);
    expect(isWindowsDrivePath('mod/x')).toBe(false);
    expect(isWindowsDrivePath('CD:/x')).toBe(false);
  });
});

describe('winePrefixOf', () => {
  it('is the folder above drive_c, in any case', () => {
    const prefix = join(sep, 'lib', 'steamapps', 'compatdata', '236850', 'pfx');
    const inside = join(prefix, 'Drive_C', 'users', 'steamuser', 'Documents');
    expect(winePrefixOf(inside)).toMatch(
      /[\\/]lib[\\/]steamapps[\\/]compatdata[\\/]236850[\\/]pfx$/,
    );
  });

  it('is undefined outside a prefix', () => {
    expect(winePrefixOf(join(sep, 'home', 'me', 'mod'))).toBeUndefined();
  });
});

describe('hostPathFromWindows', () => {
  let root: string;
  let prefix: string;

  beforeEach(async () => {
    root = await makeTree({
      'pfx/drive_c/users/steamuser/Documents/Paradox Interactive/mod/x.mod': 'name="x"',
      'pfx/drive_c/users/steamuser/Documents/Paradox Interactive/mod/x/descriptor.mod': 'x',
      'data/Mods/y/descriptor.mod': 'y',
    });
    prefix = join(root, 'pfx');
    await mkdir(join(prefix, 'dosdevices'), { recursive: true });
    // Wine's `d:` link to another folder. Windows allows no `:` in a name, so the link exists only
    // on the hosts Wine runs on.
    if (process.platform !== 'win32') {
      await symlink(join(root, 'data'), join(prefix, 'dosdevices', 'd:'));
    }
  });

  afterEach(async () => {
    await removeTree(root);
  });

  const real = (...parts: string[]): string => realpathSync(join(...parts));

  it("reads C: as the prefix's drive_c, taking each name's case from the disk", () => {
    // A case-insensitive disk (Windows) finds the names as written and keeps their case.
    const sameCase = (path: string): string =>
      process.platform === 'win32' ? path.toLowerCase() : path;
    expect(
      sameCase(
        hostPathFromWindows('C:\\Users\\SteamUser\\Documents\\paradox interactive\\MOD\\x', prefix),
      ),
    ).toBe(sameCase(real(prefix, 'drive_c/users/steamuser/Documents/Paradox Interactive/mod/x')));
  });

  it('takes Documents for My Documents when the prefix has no such folder', () => {
    expect(
      hostPathFromWindows('C:/users/steamuser/My Documents/Paradox Interactive/mod/x.mod', prefix),
    ).toBe(real(prefix, 'drive_c/users/steamuser/Documents/Paradox Interactive/mod/x.mod'));
  });

  it.skipIf(process.platform === 'win32')("follows another drive's dosdevices link", () => {
    expect(hostPathFromWindows('D:/mods/Y/descriptor.mod', prefix)).toBe(
      real(root, 'data/Mods/y/descriptor.mod'),
    );
  });

  it('keeps the rest of a path the disk does not have as written', () => {
    expect(hostPathFromWindows('C:/users/steamuser/Saves/a.eu4', prefix)).toBe(
      join(real(prefix, 'drive_c/users/steamuser'), 'Saves', 'a.eu4'),
    );
  });

  it('returns a path it cannot place as it is', () => {
    expect(hostPathFromWindows('E:/mods/x', prefix)).toBe('E:/mods/x');
    expect(hostPathFromWindows('C:/users/x', undefined)).toBe('C:/users/x');
    expect(hostPathFromWindows('mod/x', prefix)).toBe('mod/x');
  });
});
