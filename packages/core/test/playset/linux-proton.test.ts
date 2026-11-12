import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findPlayset,
  hostPathFromWindows,
  isWindowsDrivePath,
  winePrefixOf,
} from '../../src/playset/index.ts';
import { addFiles, descriptor, fakeEnvironment, makeTree, removeTree } from './fixture.ts';

// A Linux machine whose EU4 runs under Proton, as Steam lays it out: Steam in ~/.local/share/Steam, the
// game in a second library, the Proton prefix of app 236850 next to the library's `common` folder, and
// the mod descriptors the game wrote with Windows drive paths.
describe('Linux and Proton', () => {
  let root: string;
  let prefix: string;

  beforeEach(async () => {
    root = await makeTree({});
    prefix = join(root, 'lib', 'steamapps', 'compatdata', '236850', 'pfx');
    const documents = 'drive_c/users/steamuser/Documents/Paradox Interactive/Europa Universalis IV';
    await addFiles(root, {
      'home/.local/share/Steam/steamapps/libraryfolders.vdf': `"libraryfolders"
{
\t"0" { "path" "${join(root, 'home/.local/share/Steam')}" "apps" { "228980" "1" } }
\t"1" { "path" "${join(root, 'lib')}" "apps" { "236850" "1" } }
}`,
      'lib/steamapps/common/Europa Universalis IV/eu4.exe': 'exe',
      'lib/steamapps/common/Europa Universalis IV/interface/topbar.gui': 'game',
      [`lib/steamapps/compatdata/236850/pfx/${documents}/mod/mymod.mod`]: descriptor({
        name: 'My Mod',
        dependencies: ['Z Mod'],
        path: 'C:/users/steamuser/My Documents/Paradox Interactive/Europa Universalis IV/mod/mymod',
      }),
      [`lib/steamapps/compatdata/236850/pfx/${documents}/mod/mymod/interface/topbar.gui`]: 'mod',
      [`lib/steamapps/compatdata/236850/pfx/${documents}/mod/zmod.mod`]: descriptor({
        name: 'Z Mod',
        path: `Z:${join(root, 'elsewhere', 'zmod').replaceAll('\\', '/')}`,
      }),
      'elsewhere/zmod/interface/other.gui': 'zmod',
      [`lib/steamapps/compatdata/236850/pfx/${documents}/dlc_load.json`]: JSON.stringify({
        enabled_mods: ['mod/mymod.mod', 'mod/zmod.mod'],
        disabled_dlcs: [],
      }),
    });
    // Wine's link from "My Documents" to "Documents".
    await symlink('Documents', join(prefix, 'drive_c', 'users', 'steamuser', 'My Documents')).catch(
      () => undefined,
    );
    await mkdir(join(prefix, 'dosdevices'), { recursive: true });
    await symlink('../drive_c', join(prefix, 'dosdevices', 'c:')).catch(() => undefined);
  });

  afterEach(async () => {
    await removeTree(root);
  });

  it('finds Steam, the game, the Proton profile and the mods the game wrote with Windows paths', async () => {
    const environment = {
      ...fakeEnvironment({}, {}, join(root, 'home')),
      platform: 'linux' as const,
    };
    // The mod being edited is open as the workspace; its descriptor names it with a Windows path.
    const workspaceFolder = join(
      prefix,
      'drive_c',
      'users',
      'steamuser',
      'Documents',
      'Paradox Interactive',
      'Europa Universalis IV',
      'mod',
      'mymod',
    );
    const playset = await findPlayset({ workspaceFolder, environment });
    const game = join(root, 'lib', 'steamapps', 'common', 'Europa Universalis IV');
    expect(playset.gameFolder).toBe(game);
    expect(playset.profileFolder).toBe(
      join(
        prefix,
        'drive_c',
        'users',
        'steamuser',
        'Documents',
        'Paradox Interactive',
        'Europa Universalis IV',
      ),
    );
    expect(playset.workspaceMod?.name).toBe('My Mod');
    expect(playset.workspaceMod?.root).toBe(workspaceFolder);
    expect(playset.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(playset.mods.find((mod) => mod.name === 'Z Mod')?.root).toBe(
      join(root, 'elsewhere', 'zmod'),
    );
    expect((await playset.files.find('interface/topbar.gui'))?.layer.name).toBe('My Mod');
  });

  it('translates Windows drive paths into the prefix', () => {
    expect(isWindowsDrivePath('C:/x')).toBe(true);
    expect(isWindowsDrivePath('/x')).toBe(false);
    expect(isWindowsDrivePath('mod/x')).toBe(false);
    expect(winePrefixOf(join(prefix, 'drive_c', 'users', 'steamuser'))).toBe(prefix);
    expect(winePrefixOf('/tmp/elsewhere')).toBeUndefined();
    expect(hostPathFromWindows('C:\\users\\steamuser\\Documents', prefix)).toBe(
      join(prefix, 'drive_c', 'users', 'steamuser', 'Documents'),
    );
    // Case and the "My Documents" link come from the disk: the answer is the real folder.
    expect(hostPathFromWindows('c:/USERS/steamuser/my documents/Paradox Interactive', prefix)).toBe(
      join(prefix, 'drive_c', 'users', 'steamuser', 'Documents', 'Paradox Interactive'),
    );
    expect(hostPathFromWindows('Z:/tmp/a b', undefined)).toBe('/tmp/a b');
    expect(hostPathFromWindows('C:/x', undefined)).toBe('C:/x');
    expect(hostPathFromWindows('/already/posix', prefix)).toBe('/already/posix');
  });
});
