// The game host install (spec section 4, ADR 0003, etch#48): Etch's private copy of the game in the
// extension's global storage, with the pinned builds the VSIX carries under game/ and a profile and
// overlay mod of its own. Every folder of the game is a junction to the player's game folder and
// every top-level file a copy, so that Anvil's version.dll sits next to an eu4.exe of Etch's own.
// Node only, no vscode: the extension asks before creating it (index.ts).
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rmdir,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { backdropFiles, isPreviewCopyFile } from '@etch/core';
import { decodeDescriptor } from '@etch/core/playset';

/** The game host install's folders under the extension's global storage. */
export interface GameHostLayout {
  readonly root: string;
  /** The junction copy of the game, the game host's working directory. */
  readonly game: string;
  /** The private profile, passed as `-userdir=<profile>/`. */
  readonly profile: string;
  /** Etch's overlay mod, loaded after the playset. */
  readonly overlay: string;
  /** Marks the folder as a game host install Etch made, and names the game folder it copies. */
  readonly record: string;
}

export function gameHostLayout(storageFolder: string): GameHostLayout {
  const root = join(storageFolder, 'game-host');
  return {
    root,
    game: join(root, 'game'),
    profile: join(root, 'profile'),
    overlay: join(root, 'overlay'),
    record: join(root, 'etch-game-host.json'),
  };
}

/** game/manifest.json of the VSIX (pins/README.md): the pinned game build and every file. */
export interface GameManifest {
  readonly game: { readonly version: string; readonly exeSha256: string };
  readonly files: readonly ManifestFile[];
}

export interface ManifestFile {
  /** `/`-separated, relative to the game folder. */
  readonly path: string;
  /** Uppercase SHA-256. */
  readonly sha256: string;
  readonly build: string;
}

/**
 * The top-level names the pinned builds may install: Anvil's proxy and its folder. The install
 * takes neither from the player's game folder, and nothing pinned can land in a junction.
 */
export const PINNED_TOP_LEVEL = ['version.dll', 'anvil'] as const;

/** The plugins folder: whatever the manifest does not list is removed from it before a start. */
const PLUGINS_FOLDER = 'anvil/plugins/';

/** Top-level files of the game folder the copy leaves out. */
const LEFT_OUT = [/^launcher-installer/i, /^userdir\.txt$/i, /^console_history\.txt$/i];

const SHA256 = /^[0-9A-F]{64}$/;

export type GameHostInstallErrorCode =
  'unsupported-game' | 'damaged-builds' | 'not-an-install' | 'install-failed';

export class GameHostInstallError extends Error {
  readonly code: GameHostInstallErrorCode;
  constructor(code: GameHostInstallErrorCode, message: string) {
    super(message);
    this.name = 'GameHostInstallError';
    this.code = code;
  }
}

/** Reads and checks game/manifest.json; throws `damaged-builds` when it is not one. */
export function parseGameManifest(value: unknown): GameManifest {
  const fail = (why: string): never => {
    throw new GameHostInstallError('damaged-builds', `game/manifest.json: ${why}`);
  };
  if (!isRecord(value) || value['formatVersion'] !== 1) fail('not format version 1');
  const root = value as Record<string, unknown>;
  const game = root['game'];
  if (
    !isRecord(game) ||
    typeof game['version'] !== 'string' ||
    typeof game['exeSha256'] !== 'string' ||
    !SHA256.test(game['exeSha256'])
  ) {
    fail('no game build');
  }
  const files = root['files'];
  if (!Array.isArray(files) || files.length === 0) fail('no files');
  const seen = new Set<string>();
  const checked = (files as unknown[]).map((file): ManifestFile => {
    if (
      !isRecord(file) ||
      typeof file['path'] !== 'string' ||
      typeof file['sha256'] !== 'string' ||
      typeof file['build'] !== 'string' ||
      !SHA256.test(file['sha256'])
    ) {
      return fail('a file without path, sha256 or build');
    }
    const path = file['path'];
    const parts = path.split('/');
    const top = parts[0]?.toLowerCase();
    if (
      path.includes('\\') ||
      path.includes(':') ||
      parts.some((p) => p === '' || p === '.' || p === '..') ||
      !PINNED_TOP_LEVEL.some((name) => name === top) ||
      (top === 'version.dll') !== (parts.length === 1)
    ) {
      fail(`"${path}" is not a path the pinned builds may install`);
    }
    if (seen.has(path.toLowerCase())) fail(`"${path}" is listed twice`);
    seen.add(path.toLowerCase());
    return { path, sha256: file['sha256'], build: file['build'] };
  });
  const pinned = game as Record<string, string>;
  return {
    game: { version: pinned['version'] ?? '', exeSha256: pinned['exeSha256'] ?? '' },
    files: checked,
  };
}

export async function readGameManifest(buildsFolder: string): Promise<GameManifest> {
  let text;
  try {
    text = await readFile(join(buildsFolder, 'manifest.json'), 'utf8');
  } catch {
    throw new GameHostInstallError(
      'damaged-builds',
      `Etch's pinned game-side builds are missing (${join(buildsFolder, 'manifest.json')}).`,
    );
  }
  return parseGameManifest(JSON.parse(text) as unknown);
}

/** A mod of the playset as the game host loads it. */
export interface GameHostMod {
  readonly name: string;
  /** Absolute folder of the mod's files. */
  readonly root: string;
  /** The descriptor it was found by, copied into the private profile with `path` replaced. */
  readonly descriptorPath?: string | undefined;
}

export interface PrepareOptions {
  readonly layout: GameHostLayout;
  /** The player's game folder, only read. */
  readonly gameFolder: string;
  /** The VSIX's game/ folder: manifest.json and the pinned files. */
  readonly buildsFolder: string;
  /** The playset in load order; the overlay mod is added after it. */
  readonly mods: readonly GameHostMod[];
  readonly display: HostDisplay;
}

/** How the game host shows itself (spec section 6): borderless at this size, UI scale 1.0. */
export interface HostDisplay {
  /** The monitor's native resolution, in device pixels. */
  readonly width: number;
  readonly height: number;
  /** The localisation language, such as `english` (`etch.language`). */
  readonly language: string;
}

/** What a start of the game host needs. */
export interface PreparedInstall {
  /** `eu4.exe` of the install. */
  readonly exe: string;
  /** The install's game folder, the process's working directory. */
  readonly gameFolder: string;
  readonly profileFolder: string;
  readonly overlayFolder: string;
  /** `-userdir=<profile>/`. */
  readonly arguments: readonly string[];
  /** Pinned files that were missing or changed and were installed again from the VSIX. */
  readonly restored: readonly string[];
}

/** Whether the game host install exists (it may still need `prepareInstall` before a start). */
export async function installExists(layout: GameHostLayout): Promise<boolean> {
  return isFile(layout.record);
}

/** The bytes of the game folder's top-level files the install copies, for the confirmation. */
export async function copySize(gameFolder: string): Promise<number> {
  let size = 0;
  for (const entry of await readdir(gameFolder, { withFileTypes: true })) {
    if (entry.isFile() && takesFile(entry.name))
      size += (await stat(join(gameFolder, entry.name))).size;
  }
  return size;
}

/**
 * Creates the game host install if it is missing and brings it up to date before a start: refuses
 * an `eu4.exe` other than the pinned build; links every folder of the game and copies its top-level
 * files; checks every pinned file's hash, installs it again from the VSIX when it differs and
 * removes any other file from the plugins folder; writes the private profile's descriptors and
 * `dlc_load.json` (all owned DLC on, the overlay mod last); and clears the overlay mod's preview
 * copies. Never writes outside the install.
 */
export async function prepareInstall(options: PrepareOptions): Promise<PreparedInstall> {
  const { layout, buildsFolder } = options;
  const gameFolder = resolve(options.gameFolder);
  if (isInside(gameFolder, layout.root) || isInside(layout.root, gameFolder)) {
    throw new GameHostInstallError(
      'install-failed',
      'The game folder and the game host install must not hold each other.',
    );
  }
  const manifest = await readGameManifest(buildsFolder);
  const original = join(gameFolder, 'eu4.exe');
  const originalSha = await sha256File(original).catch(() => undefined);
  if (originalSha !== manifest.game.exeSha256) {
    throw new GameHostInstallError(
      'unsupported-game',
      originalSha === undefined
        ? `${original} cannot be read.`
        : `${original} is not EU4 ${manifest.game.version}, the only build the game host starts (SHA-256 ${originalSha}).`,
    );
  }

  await mkdir(layout.root, { recursive: true });
  const record = await readRecord(layout);
  if (record === undefined && (await readdir(layout.root)).length > 0) {
    throw new GameHostInstallError(
      'not-an-install',
      `${layout.root} holds files that are not a game host install; Etch leaves it alone.`,
    );
  }
  // The record comes first, so that a folder Etch began to fill can always be removed again.
  await writeFile(layout.record, `${JSON.stringify({ formatVersion: 1, gameFolder }, null, 2)}\n`);
  await mkdir(layout.game, { recursive: true });

  await linkGame(layout, gameFolder);
  const restored = await installPinned(layout, buildsFolder, manifest);
  const exe = join(layout.game, 'eu4.exe');
  if ((await sha256File(exe)) !== manifest.game.exeSha256) {
    throw new GameHostInstallError(
      'install-failed',
      `${exe} is not the pinned build after it was copied.`,
    );
  }
  await writeOverlay(layout);
  await writeProfile(layout, options.mods);
  await writeDisplay(layout, options.display);
  return {
    exe,
    gameFolder: layout.game,
    profileFolder: layout.profile,
    overlayFolder: layout.overlay,
    arguments: [`-userdir=${slashed(layout.profile)}/`],
    restored,
  };
}

/**
 * Removes the game host install, junctions as links only: nothing of the game folder they point
 * at is touched. False when there is none; throws `not-an-install` for a folder Etch did not make.
 */
export async function removeInstall(layout: GameHostLayout): Promise<boolean> {
  if (!(await exists(layout.root))) return false;
  if (!(await isFile(layout.record))) {
    throw new GameHostInstallError(
      'not-an-install',
      `${layout.root} is not a game host install Etch made; Etch leaves it alone.`,
    );
  }
  // Everything else first and the record last, so that an interrupted removal can be repeated.
  for (const name of await readdir(layout.root)) {
    const path = join(layout.root, name);
    if (path !== layout.record) await removeTree(path, layout.root);
  }
  await unlink(layout.record);
  await rmdir(layout.root);
  return true;
}

// ---- The junction copy -----------------------------------------------------------------------

function takesFile(name: string): boolean {
  return !LEFT_OUT.some((pattern) => pattern.test(name)) && !isPinnedName(name);
}

function isPinnedName(name: string): boolean {
  return PINNED_TOP_LEVEL.some((pinned) => pinned === name.toLowerCase());
}

async function linkGame(layout: GameHostLayout, gameFolder: string): Promise<void> {
  const folders = new Set<string>();
  for (const entry of await readdir(gameFolder, { withFileTypes: true })) {
    if (isPinnedName(entry.name)) continue;
    const source = join(gameFolder, entry.name);
    const target = join(layout.game, entry.name);
    const info = await stat(source).catch(() => undefined);
    if (info?.isDirectory() === true) {
      folders.add(entry.name.toLowerCase());
      await ensureJunction(target, source, layout.root);
    } else if (info?.isFile() === true && takesFile(entry.name)) {
      await ensureCopy(target, source, info, layout.root);
    }
  }
  // Junctions to folders the game no longer has go; files the game wrote at run time stay.
  for (const entry of await readdir(layout.game, { withFileTypes: true })) {
    if (entry.isSymbolicLink() && !folders.has(entry.name.toLowerCase())) {
      await unlink(join(layout.game, entry.name));
    }
  }
  // The profile is passed on the command line; an empty userdir.txt leaves it the only choice.
  const userdir = join(layout.game, 'userdir.txt');
  if ((await readFile(userdir, 'utf8').catch(() => undefined)) !== '') await writeFile(userdir, '');
}

async function ensureJunction(path: string, target: string, root: string): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (info?.isSymbolicLink() === true) {
    if (samePath(await readlink(path), target)) return;
    await unlink(path);
  } else if (info !== undefined) {
    await removeTree(path, root);
  }
  await symlink(target, path, 'junction');
}

async function ensureCopy(
  path: string,
  source: string,
  sourceInfo: { size: number; mtimeMs: number; atime: Date; mtime: Date },
  root: string,
): Promise<void> {
  const info = await lstat(path).catch(() => undefined);
  if (info?.isFile() === true) {
    if (
      info.size === sourceInfo.size &&
      Math.trunc(info.mtimeMs) === Math.trunc(sourceInfo.mtimeMs)
    ) {
      return;
    }
  } else if (info !== undefined) {
    await removeTree(path, root);
  }
  await copyThrough(source, path);
  // The copy keeps the original's modification time, by which the next start sees it is current.
  await utimes(path, sourceInfo.atime, sourceInfo.mtime);
}

/** Copies to a temporary name first, so that an interrupted copy is never taken for the file. */
async function copyThrough(source: string, path: string): Promise<void> {
  const partial = `${path}.etch-partial`;
  await copyFile(source, partial);
  await rename(partial, path);
}

// ---- Pinned builds ---------------------------------------------------------------------------

async function installPinned(
  layout: GameHostLayout,
  buildsFolder: string,
  manifest: GameManifest,
): Promise<string[]> {
  const restored: string[] = [];
  const listed = new Set(manifest.files.map((f) => f.path.toLowerCase()));
  for (const file of manifest.files) {
    const target = join(layout.game, ...file.path.split('/'));
    await realFolders(dirname(target), layout.game);
    const info = await lstat(target).catch(() => undefined);
    if (info?.isFile() === true && (await sha256File(target)) === file.sha256) continue;
    if (info !== undefined) await removeTree(target, layout.root);
    const source = join(buildsFolder, ...file.path.split('/'));
    const sourceSha = await sha256File(source).catch(() => undefined);
    if (sourceSha !== file.sha256) {
      throw new GameHostInstallError(
        'damaged-builds',
        `Etch's pinned ${file.build} build is damaged: ${file.path} does not match game/manifest.json. Reinstall Etch.`,
      );
    }
    await copyThrough(source, target);
    if ((await sha256File(target)) !== file.sha256) {
      throw new GameHostInstallError('install-failed', `${target} changed while it was installed.`);
    }
    restored.push(file.path);
  }
  // A plugin the manifest does not list would load into the game host: nothing else stays there.
  const plugins = join(layout.game, ...PLUGINS_FOLDER.split('/'));
  for (const path of await listTree(plugins)) {
    const relative = `${PLUGINS_FOLDER}${path}`;
    if (!listed.has(relative.toLowerCase())) await removeTree(join(plugins, path), layout.root);
  }
  await removeEmptyFolders(plugins, layout.root);
  return restored;
}

/** Creates the folders down to `folder` and refuses any that is a link out of the install. */
async function realFolders(folder: string, base: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  for (let at = folder; isInside(at, base); at = dirname(at)) {
    const info = await lstat(at);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new GameHostInstallError('install-failed', `${at} is not a folder of the install.`);
    }
  }
}

/** Every file and link under a folder, `/`-separated; nothing below a link is listed. */
async function listTree(folder: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (at: string, prefix: string): Promise<void> => {
    const entries = await readdir(at, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        await walk(join(at, entry.name), `${prefix}${entry.name}/`);
      } else {
        found.push(`${prefix}${entry.name}`);
      }
    }
  };
  await walk(folder, '');
  return found;
}

async function removeEmptyFolders(folder: string, root: string): Promise<void> {
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const path = join(folder, entry.name);
    await removeEmptyFolders(path, root);
    if ((await readdir(path)).length === 0 && isInside(path, root)) await rmdir(path);
  }
}

// ---- Overlay mod and private profile ---------------------------------------------------------

const OVERLAY_NAME = 'Etch overlay';

async function writeOverlay(layout: GameHostLayout): Promise<void> {
  await mkdir(join(layout.overlay, 'interface'), { recursive: true });
  await writeIfChanged(
    join(layout.overlay, 'descriptor.mod'),
    `name="${OVERLAY_NAME}"\nsupported_version="v1.37.*.*"\ntags={\n\t"Utilities"\n}\n`,
  );
  for (const file of backdropFiles()) {
    const target = join(layout.overlay, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeIfChanged(target, file.bytes);
  }
  // Preview copies are written while the game host runs; it starts without any.
  const interfaceFolder = join(layout.overlay, 'interface');
  for (const entry of await readdir(interfaceFolder, { withFileTypes: true })) {
    if (entry.isFile() && isPreviewCopyFile(entry.name)) {
      await unlink(join(interfaceFolder, entry.name));
    }
  }
}

async function writeProfile(layout: GameHostLayout, mods: readonly GameHostMod[]): Promise<void> {
  const modFolder = join(layout.profile, 'mod');
  await mkdir(modFolder, { recursive: true });
  for (const entry of await readdir(modFolder, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.mod')) {
      await unlink(join(modFolder, entry.name));
    }
  }
  // Named so that their order by name is the load order too, the overlay mod last.
  const enabled: string[] = [];
  for (const [index, mod] of mods.entries()) {
    const name = `mod-${String(index + 1).padStart(3, '0')}.mod`;
    const text =
      mod.descriptorPath === undefined
        ? undefined
        : await readFile(mod.descriptorPath).then(decodeDescriptor, () => undefined);
    await writeFile(join(modFolder, name), privateDescriptor(mod, text));
    enabled.push(`mod/${name}`);
  }
  await writeFile(
    join(modFolder, 'overlay.mod'),
    privateDescriptor({ name: OVERLAY_NAME, root: layout.overlay }, undefined),
  );
  enabled.push('mod/overlay.mod');
  // No DLC disabled: the game enables every DLC the player owns.
  await writeFile(
    join(layout.profile, 'dlc_load.json'),
    JSON.stringify({ enabled_mods: enabled, disabled_dlcs: [] }),
  );
}

/**
 * The private profile's settings, written whole before every start. After its first start the
 * game takes the display mode and size from `pdx_settings.txt` instead of `settings.txt` (etch#18),
 * so both say borderless at the native resolution. The rest is the lab's verified configuration,
 * silent.
 */
async function writeDisplay(layout: GameHostLayout, display: HostDisplay): Promise<void> {
  const width = Math.round(display.width);
  const height = Math.round(display.height);
  if (!(width > 0 && height > 0) || !/^[a-z_]+$/.test(display.language)) {
    throw new GameHostInstallError('install-failed', 'The game host display is not valid.');
  }
  const settings = [
    `language="l_${display.language}"`,
    'graphics={',
    '\tsize={',
    `\t\tx=${String(width)}`,
    `\t\ty=${String(height)}`,
    '\t}',
    '\tgame_ui_scale=1.000',
    '\tfullScreen=no',
    '\tborderless=yes',
    '\tshadows=no',
    '\tmulti_sampling=8',
    '\tvsync=yes',
    '}',
    'master_volume=0.000000',
    'music_volume=0.000000',
    'sound_fx_volume=0.000000',
    'ambient_volume=0.000000',
    '',
  ];
  await writeFile(join(layout.profile, 'settings.txt'), settings.join('\n'));
  const size = `${String(width)}x${String(height)}`;
  const entry = (key: string, value: string) => [
    `\t"${key}"={`,
    `\t\tvalue="${value}"`,
    '\t\tversion=0',
    '\t}',
  ];
  const pdx = [
    '"Graphics"={',
    ...entry('fullscreen_resolution', size),
    ...entry('windowed_resolution', size),
    ...entry('display_mode', 'borderless_fullscreen'),
    '}',
    '',
  ];
  await writeFile(join(layout.profile, 'pdx_settings.txt'), pdx.join('\n'));
}

/**
 * The private profile's descriptor of a mod: the mod's own descriptor, so that its name,
 * `dependencies` and `replace_path` stay, with `path` and `archive` replaced by the mod's absolute
 * folder; a mod without one gets its name and folder.
 */
export function privateDescriptor(mod: GameHostMod, descriptorText: string | undefined): string {
  const path = `path="${slashed(mod.root)}"`;
  if (descriptorText === undefined) {
    return `name="${mod.name.replaceAll('"', "'")}"\n${path}\n`;
  }
  const text = descriptorText.charCodeAt(0) === 0xfeff ? descriptorText.slice(1) : descriptorText;
  const lines = text.split(/\r?\n/).filter((line) => !/^\s*(?:path|archive)\s*=/.test(line));
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return `${[...lines, path].join('\n')}\n`;
}

// ---- Files -----------------------------------------------------------------------------------

/** Removes a file, link or folder inside `root`; a link is removed itself, never what it names. */
async function removeTree(path: string, root: string): Promise<void> {
  if (!isInside(path, root)) throw new Error(`refusing to remove ${path}: not inside ${root}`);
  const info = await lstat(path).catch(() => undefined);
  if (info === undefined) return;
  if (info.isSymbolicLink() || !info.isDirectory()) {
    await unlink(path);
    return;
  }
  for (const name of await readdir(path)) await removeTree(join(path, name), root);
  await rmdir(path);
}

async function writeIfChanged(path: string, data: string | Uint8Array): Promise<void> {
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  const current = await readFile(path).catch(() => undefined);
  if (current?.equals(bytes) !== true) await writeFile(path, bytes);
}

export function sha256File(path: string): Promise<string> {
  return new Promise((done, fail) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', fail)
      .on('end', () => {
        done(hash.digest('hex').toUpperCase());
      });
  });
}

async function readRecord(layout: GameHostLayout): Promise<{ gameFolder: string } | undefined> {
  try {
    const value = JSON.parse(await readFile(layout.record, 'utf8')) as unknown;
    return isRecord(value) && typeof value['gameFolder'] === 'string'
      ? { gameFolder: value['gameFolder'] }
      : undefined;
  } catch {
    return undefined;
  }
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function key(path: string): string {
  return resolve(path).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function samePath(a: string, b: string): boolean {
  return key(a) === key(b);
}

/** Whether `path` is `folder` or below it. */
function isInside(path: string, folder: string): boolean {
  const p = key(path);
  const f = key(folder);
  return p === f || p.startsWith(`${f}/`);
}

function slashed(path: string): string {
  return resolve(path).replace(/\\/g, '/').replace(/\/+$/, '');
}
