import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { SUPPORTED_GAME_VERSION } from '../index.ts';
import { parseVdf } from './vdf.ts';

/** Steam's app id of Europa Universalis IV, also the Workshop folder's name. */
export const EU4_STEAM_APP_ID = '236850';

/** The game folder's name inside a Steam library. */
export const EU4_STEAM_FOLDER = 'Europa Universalis IV';

/** What GOG Galaxy and GOG's installers leave in the game folder. */
const GOG_MARKER = 'goggame-2057001589.info';

/** SHA-256 of `eu4.exe` 1.37.5 on Steam, win64, uppercase hex. */
export const SUPPORTED_GAME_EXE_SHA256 =
  '9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A';

/** What Etch asks of the machine to find Steam and the player's Documents folder. */
export interface DiscoveryEnvironment {
  /** Reads a registry value, such as `HKCU\Software\Valve\Steam` `SteamPath`. */
  readRegistryValue(key: string, value: string): Promise<string | undefined>;
  /** Environment variables, for `%USERPROFILE%` and `ProgramFiles(x86)`. */
  env: Readonly<Record<string, string | undefined>>;
  homedir: string;
  /** The system Etch runs on; `process.platform` when absent. Windows uses the registry, others Steam's folders. */
  platform?: NodeJS.Platform;
}

/** Reads the real registry with `reg.exe` and the process's environment. */
export function systemEnvironment(): DiscoveryEnvironment {
  return {
    readRegistryValue: readRegistryWithRegExe,
    env: process.env,
    homedir: homedir(),
  };
}

function readRegistryWithRegExe(key: string, value: string): Promise<string | undefined> {
  if (process.platform !== 'win32') return Promise.resolve(undefined);
  return new Promise((done) => {
    execFile('reg', ['query', key, '/v', value], { windowsHide: true }, (error, stdout) => {
      if (error !== null) {
        done(undefined);
        return;
      }
      for (const line of stdout.split(/\r?\n/)) {
        const match = /^\s+(\S+)\s+REG_(?:EXPAND_)?SZ\s+(.*)$/.exec(line);
        if (match?.[1]?.toLowerCase() === value.toLowerCase()) {
          done(match[2]?.trim());
          return;
        }
      }
      done(undefined);
    });
  });
}

/** Candidate Steam folders, most likely first, without duplicates. */
export async function findSteamFolders(environment: DiscoveryEnvironment): Promise<string[]> {
  const candidates = [
    await environment.readRegistryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath'),
    await environment.readRegistryValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'),
    environment.env['ProgramFiles(x86)'] === undefined
      ? undefined
      : join(environment.env['ProgramFiles(x86)'], 'Steam'),
  ];
  if ((environment.platform ?? process.platform) !== 'win32') {
    // Steam's own folders on Linux (the first is usually a link to the second), and Flatpak's.
    const home = environment.homedir;
    const data = environment.env['XDG_DATA_HOME'] ?? join(home, '.local', 'share');
    for (const folder of [
      join(home, '.steam', 'steam'),
      join(data, 'Steam'),
      join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    ]) {
      if (await isDirectory(join(folder, 'steamapps'))) candidates.push(folder);
    }
  }
  return unique(candidates.filter((c): c is string => c !== undefined && c !== ''));
}

/** The libraries listed in a Steam folder's `steamapps/libraryfolders.vdf`, and whether each has EU4. */
export async function readSteamLibraries(
  steamFolder: string,
): Promise<{ path: string; hasEu4: boolean }[]> {
  let text;
  try {
    text = await readFile(join(steamFolder, 'steamapps', 'libraryfolders.vdf'), 'utf8');
  } catch {
    return [];
  }
  const root = parseVdf(text)['libraryfolders'];
  if (typeof root !== 'object') return [];
  const libraries: { path: string; hasEu4: boolean }[] = [];
  for (const entry of Object.values(root)) {
    // Old files map an index straight to a path; current ones hold an object with "path" and "apps".
    if (typeof entry === 'string') {
      libraries.push({ path: entry, hasEu4: false });
    } else if (typeof entry['path'] === 'string') {
      const apps = entry['apps'];
      libraries.push({
        path: entry['path'],
        hasEu4: typeof apps === 'object' && apps[EU4_STEAM_APP_ID] !== undefined,
      });
    }
  }
  return libraries;
}

/**
 * The game folder from Steam: the library whose `apps` lists EU4, else any library that holds the
 * game's folder. `undefined` when Steam or the game is not found.
 */
export async function findGameInSteam(
  environment: DiscoveryEnvironment,
): Promise<string | undefined> {
  for (const steam of await findSteamFolders(environment)) {
    const libraries = await readSteamLibraries(steam);
    if (!libraries.some((l) => samePath(l.path, steam)))
      libraries.push({ path: steam, hasEu4: false });
    libraries.sort((a, b) => Number(b.hasEu4) - Number(a.hasEu4));
    for (const library of libraries) {
      const game = join(library.path, 'steamapps', 'common', EU4_STEAM_FOLDER);
      if (await isGameFolder(game)) return game;
    }
  }
  return undefined;
}

/** Whether a folder holds `eu4.exe`. */
export async function isGameFolder(folder: string): Promise<boolean> {
  return isFile(join(folder, 'eu4.exe'));
}

/**
 * The Workshop folder of EU4 for a game folder in a Steam library: Steam keeps an app's Workshop
 * items in the library that holds the app.
 */
export function workshopFolderFor(gameFolder: string): string {
  return join(dirname(dirname(gameFolder)), 'workshop', 'content', EU4_STEAM_APP_ID);
}

/**
 * The player's profile folder, as the game finds it: the path in the game's `userdir.txt` when that
 * file is not empty (Steam ships it empty), else `Paradox Interactive/Europa Universalis IV` in the
 * Documents folder, or `Europa Universalis IV GOG` for a GOG install, whose `eu4.exe` adds " GOG".
 */
export async function findProfileFolder(
  gameFolder: string | undefined,
  environment: DiscoveryEnvironment,
): Promise<string> {
  if (gameFolder !== undefined) {
    const userdir = await readFile(join(gameFolder, 'userdir.txt'), 'utf8').then(
      (text) => text.replace(/^\uFEFF/, '').trim(),
      () => '',
    );
    if (userdir !== '')
      return isAbsolute(userdir) ? resolve(userdir) : resolve(gameFolder, userdir);
  }
  const proton = await findProtonProfile(gameFolder, environment);
  if (proton !== undefined) return proton;
  const documents =
    expandEnv(
      (await environment.readRegistryValue(
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
        'Personal',
      )) ?? '',
      environment.env,
    ) || join(environment.homedir, 'Documents');
  const gog =
    gameFolder !== undefined &&
    (await stat(join(gameFolder, GOG_MARKER)).then(
      (found) => found.isFile(),
      () => false,
    ));
  return join(
    documents,
    'Paradox Interactive',
    gog ? 'Europa Universalis IV GOG' : 'Europa Universalis IV',
  );
}

/**
 * The profile folder of a game run by Proton, or of the native Linux game, when there is one: Steam keeps
 * the Proton prefix of an app next to its library's `common` folder, with the player's Documents in it.
 * `undefined` on Windows and when no such folder exists, so the usual Documents folder is used.
 */
async function findProtonProfile(
  gameFolder: string | undefined,
  environment: DiscoveryEnvironment,
): Promise<string | undefined> {
  if ((environment.platform ?? process.platform) === 'win32') return undefined;
  const gog =
    gameFolder !== undefined &&
    (await stat(join(gameFolder, GOG_MARKER)).then(
      (found) => found.isFile(),
      () => false,
    ));
  const leaf = join(
    'Paradox Interactive',
    gog ? 'Europa Universalis IV GOG' : 'Europa Universalis IV',
  );
  const candidates: string[] = [];
  if (gameFolder !== undefined) {
    const steamapps = dirname(dirname(gameFolder));
    candidates.push(
      join(
        steamapps,
        'compatdata',
        EU4_STEAM_APP_ID,
        'pfx',
        'drive_c',
        'users',
        'steamuser',
        'Documents',
        leaf,
      ),
    );
  }
  candidates.push(
    join(environment.env['XDG_DATA_HOME'] ?? join(environment.homedir, '.local', 'share'), leaf),
  );
  for (const candidate of candidates) if (await isDirectory(candidate)) return candidate;
  return undefined;
}

/** The game build in a game folder. */
export interface GameBuild {
  /** SHA-256 of `eu4.exe`, uppercase hex. */
  exeSha256: string;
  /** Whether `eu4.exe` is the supported 1.37.5 build. */
  supported: boolean;
  /** The version from `launcher-settings.json`, such as `v1.37.5.0`, when it can be read. */
  version?: string;
}

/** Hashes `eu4.exe` and compares it with the supported build's hash. */
export async function readGameBuild(
  gameFolder: string,
  supportedSha256: readonly string[] = [SUPPORTED_GAME_EXE_SHA256],
): Promise<GameBuild> {
  const exeSha256 = await sha256Cached(join(gameFolder, 'eu4.exe'));
  const build: GameBuild = {
    exeSha256,
    supported: supportedSha256.some((h) => h.toUpperCase() === exeSha256),
  };
  const version = await readFile(join(gameFolder, 'launcher-settings.json'), 'utf8').then(
    (text) => (JSON.parse(text.replace(/^\uFEFF/, '')) as { rawVersion?: unknown }).rawVersion,
    () => undefined,
  );
  if (typeof version === 'string') build.version = version;
  return build;
}

/** The warning text for a build other than the supported one. */
export function unsupportedBuildMessage(build: GameBuild): string {
  const which = build.version === undefined ? 'This eu4.exe' : `This eu4.exe (${build.version})`;
  return `${which} is not EU4 ${SUPPORTED_GAME_VERSION}; Etch's results are only checked against ${SUPPORTED_GAME_VERSION}.`;
}

const exeHashes = new Map<string, { size: number; mtimeMs: number; sha256: string }>();

/** Hashes a file once per size and modification time: `eu4.exe` is about 38 MB. */
async function sha256Cached(path: string): Promise<string> {
  const { size, mtimeMs } = await stat(path);
  const key = pathKey(path);
  const cached = exeHashes.get(key);
  if (cached?.size === size && cached.mtimeMs === mtimeMs) return cached.sha256;
  const sha256 = await sha256File(path);
  exeHashes.set(key, { size, mtimeMs, sha256 });
  return sha256;
}

function sha256File(path: string): Promise<string> {
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

export async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
}

export async function isDirectory(path: string): Promise<boolean> {
  return stat(path).then(
    (s) => s.isDirectory(),
    () => false,
  );
}

/** Whether two absolute paths name the same place, as on Windows. */
export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

/** A comparable form of an absolute path: resolved, `/` separators, lowercase, no trailing `/`. */
export function pathKey(path: string): string {
  const key = resolve(path).replace(/\\/g, '/').toLowerCase();
  // A loop, not /\/+$/, which is quadratic in a long run of '/' that does not end the path.
  let end = key.length;
  while (end > 0 && key[end - 1] === '/') end--;
  return key.slice(0, end);
}

function expandEnv(text: string, env: Readonly<Record<string, string | undefined>>): string {
  return text.replace(/%([^%]+)%/g, (whole, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? whole : (env[key] ?? whole);
  });
}

function unique(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.filter((p) => {
    const key = pathKey(p);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
