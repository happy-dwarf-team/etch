import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findPlayset, type FindPlaysetOptions, type Playset } from '../../src/playset/index.ts';
import {
  addFiles,
  descriptor,
  fakeEnvironment,
  makeTree,
  removeTree,
  snapshotTree,
} from './fixture.ts';

const FAKE_EXE = 'not really eu4.exe';
const FAKE_EXE_SHA256 = createHash('sha256').update(FAKE_EXE).digest('hex');

/**
 * A machine with Steam in `steam/`, EU4 in a second library `lib/`, two Workshop items, the
 * player's profile under `home/Documents` and a mod being edited in `ws/src`.
 */
async function makeMachine(): Promise<string> {
  const root = await makeTree({});
  const vdfPath = (path: string): string => path.replace(/\\/g, '\\\\');
  const game = join(root, 'lib', 'steamapps', 'common', 'Europa Universalis IV');
  const workshop = join(root, 'lib', 'steamapps', 'workshop', 'content', '236850');
  await addFiles(root, {
    'steam/steamapps/libraryfolders.vdf': `"libraryfolders"
{
\t"0" { "path" "${vdfPath(join(root, 'steam'))}" "apps" { "228980" "1" } }
\t"1" { "path" "${vdfPath(join(root, 'lib'))}" "apps" { "236850" "6963493285" } }
}`,
    'lib/steamapps/common/Europa Universalis IV/eu4.exe': FAKE_EXE,
    'lib/steamapps/common/Europa Universalis IV/userdir.txt': '',
    'lib/steamapps/common/Europa Universalis IV/launcher-settings.json':
      '{ "rawVersion": "v1.37.4.0" }',
    'lib/steamapps/common/Europa Universalis IV/interface/topbar.gui': 'game',
    'lib/steamapps/common/Europa Universalis IV/interface/core.gfx': 'game',
    'lib/steamapps/workshop/content/236850/111/descriptor.mod': descriptor({
      name: 'Base',
      dependencies: ['Core'],
      remoteFileId: '111',
    }),
    'lib/steamapps/workshop/content/236850/111/interface/topbar.gui': 'base',
    'lib/steamapps/workshop/content/236850/222/descriptor.mod': descriptor({ name: 'Numbered' }),
    'lib/steamapps/workshop/content/236850/333/readme.txt': 'no descriptor, not a mod',
    'home/Documents/Paradox Interactive/Europa Universalis IV/mod/core.mod': descriptor({
      name: 'Core',
      path: 'mod/core',
    }),
    'home/Documents/Paradox Interactive/Europa Universalis IV/mod/core/interface/core.gfx': 'core',
    'home/Documents/Paradox Interactive/Europa Universalis IV/mod/ugc_111.mod': descriptor({
      name: 'Base',
      path: join(workshop, '111'),
      dependencies: ['Core'],
      remoteFileId: '111',
    }),
    'home/Documents/Paradox Interactive/Europa Universalis IV/mod/my.mod': descriptor({
      name: 'My Mod',
      path: join(root, 'ws', 'src'),
      dependencies: ['Base', 'Missing', '222'],
    }),
    'ws/src/interface/topbar.gui': 'mine',
    'ws/README.md': 'the repository of My Mod',
  });
  expect(game).toBe(join(root, 'lib', 'steamapps', 'common', 'Europa Universalis IV'));
  return root;
}

function options(root: string, more: Partial<FindPlaysetOptions> = {}): FindPlaysetOptions {
  return {
    workspaceFolder: join(root, 'ws'),
    environment: fakeEnvironment(
      {
        'HKCU\\Software\\Valve\\Steam\\SteamPath': join(root, 'steam').replace(/\\/g, '/'),
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\\Personal':
          '%USERPROFILE%\\Documents',
      },
      { USERPROFILE: join(root, 'home') },
    ),
    ...more,
  };
}

const names = (playset: Playset): string[] => playset.mods.map((m) => m.name);
const codes = (playset: Playset): string[] => playset.diagnostics.map((d) => d.code);

describe('findPlayset', () => {
  let root: string;
  let game: string;
  let profile: string;

  beforeEach(async () => {
    root = await makeMachine();
    game = join(root, 'lib', 'steamapps', 'common', 'Europa Universalis IV');
    profile = join(root, 'home', 'Documents', 'Paradox Interactive', 'Europa Universalis IV');
  });

  afterEach(async () => {
    await removeTree(root);
  });

  it('finds the game through Steam and the playset through dependencies', async () => {
    const playset = await findPlayset(options(root));

    expect(playset.gameFolder).toBe(game);
    expect(playset.profileFolder).toBe(profile);
    expect(playset.workshopFolder).toBe(
      join(root, 'lib', 'steamapps', 'workshop', 'content', '236850'),
    );
    // Dependencies load first, depth first in the order listed; a Workshop id also finds a mod.
    expect(names(playset)).toEqual(['Core', 'Base', 'Numbered', 'My Mod']);
    expect(playset.workspaceMod?.root).toBe(join(root, 'ws', 'src'));
    expect(playset.mods.map((m) => m.source)).toEqual([
      'profile',
      'profile',
      'workshop',
      'workspace',
    ]);

    expect(codes(playset)).toEqual(['unsupported-game-build', 'dependency-not-found']);
    const [build, missing] = playset.diagnostics;
    expect(build?.severity).toBe('warning');
    expect(build?.message).toContain('v1.37.4.0');
    expect(build?.message).toContain('only checked against 1.37.5');
    expect(missing).toMatchObject({ severity: 'warning', path: join(profile, 'mod', 'my.mod') });
    expect(missing?.message).toContain('"Missing"');

    expect((await playset.files.find('interface/topbar.gui'))?.layer.name).toBe('My Mod');
    expect((await playset.files.find('interface/core.gfx'))?.layer.name).toBe('Core');
    expect(playset.files.layers.map((l) => l.name)).toEqual(['game', ...names(playset)]);
  });

  it('accepts the supported eu4.exe without a warning', async () => {
    const playset = await findPlayset(options(root, { supportedExeSha256: [FAKE_EXE_SHA256] }));
    expect(playset.gameBuild).toMatchObject({ supported: true, version: 'v1.37.4.0' });
    expect(codes(playset)).not.toContain('unsupported-game-build');
  });

  it('never writes to the game, the mods or the profile', async () => {
    const before = await snapshotTree(root);
    const playset = await findPlayset(options(root));
    await playset.files.list('interface');
    await playset.files.read('interface/topbar.gui');
    expect(await snapshotTree(root)).toEqual(before);
  });

  it('uses etch.gamePath before Steam and keeps Steam’s Workshop items', async () => {
    await addFiles(root, { 'custom/eu4.exe': FAKE_EXE });
    const playset = await findPlayset(options(root, { gamePath: join(root, 'custom') }));
    expect(playset.gameFolder).toBe(join(root, 'custom'));
    expect(names(playset)).toEqual(['Core', 'Base', 'Numbered', 'My Mod']);
  });

  it('reports an etch.gamePath without eu4.exe and does not fall back to Steam', async () => {
    const playset = await findPlayset(options(root, { gamePath: join(root, 'ws') }));
    expect(playset.gameFolder).toBeUndefined();
    expect(playset.diagnostics[0]).toMatchObject({ severity: 'error', code: 'game-path-invalid' });
    expect(playset.files.layers[0]?.name).toBe('Core');
  });

  it('reports a game Steam does not have', async () => {
    const playset = await findPlayset({
      ...options(root),
      environment: fakeEnvironment({}, {}, join(root, 'home')),
    });
    expect(playset.gameFolder).toBeUndefined();
    expect(playset.diagnostics[0]).toMatchObject({ severity: 'error', code: 'game-not-found' });
    // The profile is still found under the home folder; Workshop items only through its descriptors.
    expect(names(playset)).toEqual(['Core', 'Base', 'My Mod']);
  });

  it('finds the game in the Steam folder itself when the library list has no app ids', async () => {
    await addFiles(root, {
      'steam/steamapps/libraryfolders.vdf': '"libraryfolders" { "contentstatsid" "1" }',
      'steam/steamapps/common/Europa Universalis IV/eu4.exe': FAKE_EXE,
    });
    const playset = await findPlayset(options(root));
    expect(playset.gameFolder).toBe(
      join(root, 'steam', 'steamapps', 'common', 'Europa Universalis IV'),
    );
  });

  describe('playset override', () => {
    it('replaces the dependencies and adds the workspace mod last', async () => {
      const playset = await findPlayset(
        options(root, {
          playsetOverride: [
            'core',
            join(root, 'lib/steamapps/workshop/content/236850/222'),
            ' ',
            'Nope',
          ],
        }),
      );
      expect(names(playset)).toEqual(['Core', 'Numbered', 'My Mod']);
      expect(playset.mods.map((m) => m.source)).toEqual(['setting', 'setting', 'workspace']);
      expect(codes(playset)).toEqual(['unsupported-game-build', 'playset-entry-not-found']);
    });

    it('keeps the workspace mod where the list puts it', async () => {
      const playset = await findPlayset(
        options(root, { playsetOverride: ['My Mod', join(profile, 'mod', 'ugc_111.mod')] }),
      );
      expect(names(playset)).toEqual(['My Mod', 'Base']);
    });
  });

  describe('workspace mod', () => {
    it('is the installed mod that holds the active file', async () => {
      await addFiles(root, {
        'home/Documents/Paradox Interactive/Europa Universalis IV/mod/other.mod': descriptor({
          name: 'Other',
          path: join(root, 'ws', 'other'),
        }),
        'ws/other/interface/x.gui': '',
      });
      const fromFile = await findPlayset(
        options(root, { activeFile: join(root, 'ws', 'other', 'interface', 'x.gui') }),
      );
      expect(names(fromFile)).toEqual(['Other']);

      const fromFolder = await findPlayset(options(root));
      expect(fromFolder.workspaceMod?.name).toBe('My Mod');
      expect(codes(fromFolder)).toContain('workspace-mod-ambiguous');
    });

    it('is read from descriptor.mod when no profile descriptor points at it', async () => {
      await addFiles(root, {
        'unlisted/descriptor.mod': descriptor({ name: 'Unlisted', dependencies: ['Core'] }),
        'unlisted/interface/y.gui': '',
      });
      const playset = await findPlayset(
        options(root, {
          workspaceFolder: join(root, 'unlisted'),
          activeFile: join(root, 'unlisted', 'interface', 'y.gui'),
        }),
      );
      expect(names(playset)).toEqual(['Core', 'Unlisted']);
    });

    it('is the bare workspace folder when no descriptor is found', async () => {
      await addFiles(root, { 'loose/interface/z.gui': '' });
      const playset = await findPlayset(options(root, { workspaceFolder: join(root, 'loose') }));
      expect(names(playset)).toEqual(['loose']);
      expect(playset.diagnostics.find((d) => d.code === 'workspace-mod-not-found')).toMatchObject({
        severity: 'warning',
      });
    });

    it('is absent when the game folder itself is edited', async () => {
      const playset = await findPlayset(options(root, { workspaceFolder: game }));
      expect(playset.workspaceMod).toBeUndefined();
      expect(playset.mods).toEqual([]);
      expect(codes(playset)).toEqual(['unsupported-game-build']);
    });
  });

  describe('profile and mods', () => {
    it('follows a non-empty userdir.txt', async () => {
      await addFiles(root, {
        'lib/steamapps/common/Europa Universalis IV/userdir.txt': `${join(root, 'private')}/`,
        'private/mod/my.mod': descriptor({ name: 'Private', path: join(root, 'ws', 'src') }),
      });
      const playset = await findPlayset(options(root));
      expect(playset.profileFolder).toBe(join(root, 'private'));
      expect(names(playset)).toEqual(['Private']);
    });

    it('reports a missing profile', async () => {
      const playset = await findPlayset(options(root, { profileFolder: join(root, 'nope') }));
      expect(playset.profileFolder).toBeUndefined();
      expect(codes(playset)).toContain('profile-not-found');
      expect(codes(playset)).toContain('workspace-mod-not-found');
    });

    it('reports archives, missing folders and transitive dependencies that are not installed', async () => {
      await addFiles(root, {
        'home/Documents/Paradox Interactive/Europa Universalis IV/mod/old.mod': descriptor({
          name: 'Old',
          archive: 'mod/old.zip',
        }),
        'home/Documents/Paradox Interactive/Europa Universalis IV/mod/core.mod': descriptor({
          name: 'Core',
          path: 'mod/core',
          dependencies: ['Gone', 'Stale Name'],
        }),
        'home/Documents/Paradox Interactive/Europa Universalis IV/mod/gone.mod': descriptor({
          name: 'Gone',
          path: join(root, 'deleted'),
        }),
      });
      const playset = await findPlayset(options(root));
      expect(names(playset)).toEqual(['Core', 'Base', 'Numbered', 'My Mod']);
      const byCode = Object.fromEntries(playset.diagnostics.map((d) => [d.code + d.message, d]));
      const find = (code: string, text: string) =>
        Object.entries(byCode).find(([key]) => key.startsWith(code) && key.includes(text))?.[1];
      expect(find('mod-archive-unsupported', '"Old"')?.severity).toBe('warning');
      expect(find('mod-folder-missing', '"Gone"')?.severity).toBe('warning');
      expect(find('dependency-not-found', '"Stale Name"')?.severity).toBe('information');
      expect(find('dependency-not-found', '"Missing"')?.severity).toBe('warning');
    });

    it('uses the first of several mods with one name and says so', async () => {
      await addFiles(root, {
        'home/Documents/Paradox Interactive/Europa Universalis IV/mod/a-core-copy.mod': descriptor({
          name: 'CORE',
          path: 'mod/core-copy',
        }),
        'home/Documents/Paradox Interactive/Europa Universalis IV/mod/core-copy/x.txt': '',
      });
      const playset = await findPlayset(options(root));
      expect(playset.mods[0]?.root).toBe(join(profile, 'mod', 'core-copy'));
      expect(playset.diagnostics.find((d) => d.code === 'mod-name-ambiguous')).toMatchObject({
        severity: 'information',
      });
    });
  });
});
