/// <reference types="node" />
// Prepare through the real game.ps1 and PowerShell 7, against fake-lab.psm1 and a fake Steam game
// folder in a temp lab: a player's Anvil in the Steam folder stays out of the host install, and the
// Steam folder is only read.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTree, removeTree } from '../playset/fixture.ts';

const SCRIPT = join(import.meta.dirname, '../../src/corpus/driver/game.ps1');

const STEAM_FILES: Record<string, string> = {
  'eu4.exe': 'not a game',
  'map/default.map': 'not a map',
  // The player's own Anvil, which the host must neither use nor change.
  'version.dll': "the player's anvil",
  'AnvilManager.exe': "the player's manager",
  'anvil/anvil.toml': "the player's settings\n",
  'anvil/plugins/anvil-game/plugin.toml': "the player's plugin\n",
};

const ARCHIVE_FILES: Record<string, string> = {
  'anvil/version.dll': 'the pinned anvil',
  'anvil/AnvilManager.exe': 'the pinned manager',
  'anvil/anvil/anvil.toml': 'disabled_plugins = []\n',
  'tongs/tongs/tongs.dll': 'the pinned tongs',
  'tongs/tongs/plugin.toml': 'id = "tongs"\n',
};

const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const trees: string[] = [];
afterEach(async () => {
  await Promise.all(trees.splice(0).map(removeTree));
});

function pwsh(args: string[], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync('pwsh', ['-NoProfile', '-NonInteractive', ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

describe.runIf(process.platform === 'win32')(
  'corpus Prepare with an Anvil in the Steam folder',
  () => {
    it('builds the host from the archives and leaves the Steam folder as it was', async () => {
      const tree = await makeTree({
        ...Object.fromEntries(Object.entries(STEAM_FILES).map(([p, t]) => [`steam/${p}`, t])),
        ...Object.fromEntries(Object.entries(ARCHIVE_FILES).map(([p, t]) => [`src/${p}`, t])),
        'lab/work/.keep': '',
      });
      trees.push(tree);
      const root = realpathSync.native(tree);
      const lib = join(root, 'lab', 'scripts', 'lib');
      await mkdir(lib, { recursive: true });
      await copyFile(join(import.meta.dirname, 'fake-lab.psm1'), join(lib, 'LabProcess.psm1'));
      await writeFile(
        join(lib, 'LabPaths.psm1'),
        'function Get-LabGameDir { $env:EU4LAB_GAME_DIR }\n',
      );
      const zips = join(root, 'zips');
      await mkdir(zips);
      for (const name of ['anvil', 'tongs']) {
        pwsh([
          '-Command',
          `Compress-Archive -Path '${join(root, 'src', name, '*')}' -DestinationPath '${join(zips, `${name}.zip`)}'`,
        ]);
      }
      const sums = ['anvil', 'tongs']
        .map((n) => `${sha(readFileSync(join(zips, `${n}.zip`)))}  ${n}.zip`)
        .join('\n');
      await writeFile(join(zips, 'SHA256SUMS.txt'), `${sums}\n`);

      const steam = join(root, 'steam');
      const before = Object.keys(STEAM_FILES).map((p) => readFileSync(join(steam, p), 'utf8'));
      const hostDir = join(root, 'host');
      const out = pwsh(
        [
          '-File',
          SCRIPT,
          '-Action',
          'Prepare',
          '-Lab',
          join(root, 'lab'),
          '-HostDir',
          hostDir,
          '-AnvilZip',
          join(zips, 'anvil.zip'),
          '-TongsZip',
          join(zips, 'tongs.zip'),
        ],
        { EU4LAB_GAME_DIR: steam },
      );
      expect(JSON.parse(out)).toMatchObject({ ok: true, host: hostDir });

      const copy = join(hostDir, 'game');
      // The copy's Anvil is the archive's, in a folder of its own, not a link to the player's.
      expect(readFileSync(join(copy, 'version.dll'), 'utf8')).toBe('the pinned anvil');
      expect(readFileSync(join(copy, 'AnvilManager.exe'), 'utf8')).toBe('the pinned manager');
      expect(lstatSync(join(copy, 'anvil')).isSymbolicLink()).toBe(false);
      expect(readFileSync(join(copy, 'anvil', 'anvil.toml'), 'utf8')).toContain(
        'disabled_plugins = ["anvil-overlay"]',
      );
      expect(readFileSync(join(copy, 'anvil', 'plugins', 'tongs', 'tongs.dll'), 'utf8')).toBe(
        'the pinned tongs',
      );
      expect(() => lstatSync(join(copy, 'anvil', 'plugins', 'anvil-game'))).toThrow();
      // The game's own folders are junctions to the Steam folder.
      expect(realpathSync.native(join(copy, 'map'))).toBe(join(steam, 'map'));
      // The player's files are as they were.
      expect(Object.keys(STEAM_FILES).map((p) => readFileSync(join(steam, p), 'utf8'))).toEqual(
        before,
      );
      const host = JSON.parse(readFileSync(join(hostDir, 'host.json'), 'utf8')) as {
        hashes: { versionDll: string };
      };
      expect(host.hashes.versionDll).toBe(sha(Buffer.from('the pinned anvil')).toUpperCase());
    });
  },
);
