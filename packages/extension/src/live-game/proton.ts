// Starting the live game through Proton on Linux, the way Steam starts it (Steam's own command for a Proton game is
//   [<runtime>/_v2-entry-point --verb=waitforexitandrun --]  <proton> waitforexitandrun <game.exe> [args]
// with the first part only for a Steam Linux Runtime tool such as proton-cachyos-slr), with the compatibility
// environment Steam sets. Nothing here touches the player's game folder.
import { readFile, realpath } from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';
import { parseVdf, readSteamLibraries, type VdfObject } from '@etch/core/playset';
import { isFlatpak } from './host.ts';

export const EU4_APP_ID = '236850';

/** What is needed to run a program in EU4's Proton prefix. */
export interface ProtonSetup {
  /** Steam's folder (`STEAM_COMPAT_CLIENT_INSTALL_PATH`). */
  readonly steamRoot: string;
  /** The game's prefix folder (`STEAM_COMPAT_DATA_PATH`): `<library>/steamapps/compatdata/236850`. */
  readonly compatData: string;
  readonly toolName: string;
  /** The tool's `proton` script. */
  readonly protonScript: string;
  /** The Steam Linux Runtime's entry point, when the tool wants a runtime. */
  readonly entryPoint: string | undefined;
  /** Every Steam library folder (the one holding `steamapps`). */
  readonly libraries: readonly string[];
}

export class ProtonError extends Error {}

export interface ProtonEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly homedir: string;
}

/** One entry of a VDF tree, by key without regard to case. */
function child(object: VdfObject | undefined, key: string): VdfObject | string | undefined {
  if (object === undefined) return undefined;
  const found = Object.keys(object).find((name) => name.toLowerCase() === key.toLowerCase());
  return found === undefined ? undefined : object[found];
}

function section(object: VdfObject | undefined, ...keys: string[]): VdfObject | string | undefined {
  let current: VdfObject | string | undefined = object;
  for (const key of keys) {
    if (typeof current !== 'object') return undefined;
    current = child(current, key);
  }
  return current;
}

/** The name of the compatibility tool Steam uses for an app: its own mapping, else the default one (`0`). */
export function compatToolName(configVdf: string, appId: string): string | undefined {
  const mapping = section(
    parseVdf(configVdf),
    'InstallConfigStore',
    'Software',
    'Valve',
    'Steam',
    'CompatToolMapping',
  );
  if (typeof mapping !== 'object') return undefined;
  for (const id of [appId, '0']) {
    const name = section(mapping, id, 'name');
    if (typeof name === 'string' && name !== '') return name;
  }
  return undefined;
}

async function exists(path: string): Promise<boolean> {
  return realpath(path).then(
    () => true,
    () => false,
  );
}

/**
 * Where this process reads a host path. A Flatpak sandbox has its own `/usr` and `/etc`; the host's are under
 * `/run/host` (the `host` filesystem permission). The path handed to a program started on the host stays the host's.
 */
export function readablePath(path: string, flatpak = isFlatpak()): string {
  return flatpak && (path.startsWith('/usr/') || path.startsWith('/etc/'))
    ? `/run/host${path}`
    : path;
}

/** Finds Steam, EU4's compatibility tool and prefix. Throws `ProtonError` with what is missing. */
export async function findProton(
  gameFolder: string,
  environment: ProtonEnvironment,
): Promise<ProtonSetup> {
  const data = environment.env['XDG_DATA_HOME'] ?? join(environment.homedir, '.local', 'share');
  let steamRoot: string | undefined;
  for (const candidate of [
    join(environment.homedir, '.steam', 'steam'),
    join(data, 'Steam'),
    join(environment.homedir, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ]) {
    if (await exists(join(candidate, 'config', 'config.vdf'))) {
      steamRoot = await realpath(candidate);
      break;
    }
  }
  if (steamRoot === undefined) throw new ProtonError('Steam was not found (no config/config.vdf).');

  const toolName = compatToolName(
    await readFile(join(steamRoot, 'config', 'config.vdf'), 'utf8'),
    EU4_APP_ID,
  );
  if (toolName === undefined) throw new ProtonError('Steam has no compatibility tool for EU4.');

  const libraries = [steamRoot];
  for (const library of await readSteamLibraries(steamRoot)) {
    if (!libraries.includes(library.path)) libraries.push(library.path);
  }

  const override = environment.env['ETCH_PROTON'];
  let toolFolder: string | undefined;
  for (const candidate of [
    ...(override === undefined || override === '' ? [] : [override]),
    join(steamRoot, 'compatibilitytools.d', toolName),
    join('/usr/share/steam/compatibilitytools.d', toolName),
    join('/usr/local/share/steam/compatibilitytools.d', toolName),
    ...libraries.flatMap((library) => [join(library, 'steamapps', 'common', toolName)]),
  ]) {
    if (await exists(readablePath(join(candidate, 'proton')))) {
      toolFolder = candidate;
      break;
    }
  }
  if (toolFolder === undefined) {
    throw new ProtonError(
      `The compatibility tool ${toolName} was not found (set ETCH_PROTON to its folder).`,
    );
  }

  // The runtime the tool requires (Steam Linux Runtime): its app's folder holds `_v2-entry-point`.
  let entryPoint: string | undefined;
  const manifest = await readFile(readablePath(join(toolFolder, 'toolmanifest.vdf')), 'utf8').then(
    parseVdf,
    () => undefined,
  );
  const runtimeApp = section(manifest, 'manifest', 'require_tool_appid');
  if (typeof runtimeApp === 'string' && runtimeApp !== '') {
    for (const library of libraries) {
      const acf = await readFile(
        join(library, 'steamapps', `appmanifest_${runtimeApp}.acf`),
        'utf8',
      ).then(parseVdf, () => undefined);
      const installDir = section(acf, 'AppState', 'installdir');
      if (typeof installDir !== 'string') continue;
      const candidate = join(library, 'steamapps', 'common', installDir, '_v2-entry-point');
      if (await exists(candidate)) {
        entryPoint = candidate;
        break;
      }
    }
    if (entryPoint === undefined) {
      throw new ProtonError(
        `The Steam Linux Runtime (app ${runtimeApp}) the tool needs was not found.`,
      );
    }
  }

  // The prefix is in the library that holds the game; else in any library that has one.
  const holding = dirname(dirname(gameFolder));
  let compatData: string | undefined;
  for (const steamapps of [holding, ...libraries.map((library) => join(library, 'steamapps'))]) {
    const candidate = join(steamapps, 'compatdata', EU4_APP_ID);
    if (await exists(join(candidate, 'pfx'))) {
      compatData = candidate;
      break;
    }
  }
  if (compatData === undefined) {
    throw new ProtonError('EU4 has no Proton prefix yet: start the game once from Steam.');
  }
  return {
    steamRoot,
    compatData,
    toolName,
    protonScript: join(toolFolder, 'proton'),
    entryPoint,
    libraries,
  };
}

export interface ProtonCommand {
  readonly command: string;
  readonly args: readonly string[];
  /** The variables to add to the process's environment. */
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

/**
 * The command that runs `exe` (a unix path) in the game's prefix. `verb` is `waitforexitandrun` for the game and `run`
 * for a second program of the same game, which joins the game's container. `extraPaths` are folders the
 * container has to share besides Steam's libraries.
 */
export function protonCommand(
  setup: ProtonSetup,
  verb: 'waitforexitandrun' | 'run',
  exe: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly installPath: string;
    readonly extraPaths?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
  },
): ProtonCommand {
  const toolPaths = [
    dirname(setup.protonScript),
    ...(setup.entryPoint === undefined ? [] : [dirname(setup.entryPoint)]),
  ];
  const env: Record<string, string> = {
    ...options.env,
    STEAM_COMPAT_APP_ID: EU4_APP_ID,
    STEAM_COMPAT_DATA_PATH: setup.compatData,
    STEAM_COMPAT_CLIENT_INSTALL_PATH: setup.steamRoot,
    STEAM_COMPAT_INSTALL_PATH: options.installPath,
    STEAM_COMPAT_LIBRARY_PATHS: setup.libraries.join(delimiter),
    STEAM_COMPAT_TOOL_PATHS: toolPaths.join(delimiter),
    SteamAppId: EU4_APP_ID,
    SteamGameId: EU4_APP_ID,
  };
  const shared = options.extraPaths ?? [];
  if (shared.length > 0) env['PRESSURE_VESSEL_FILESYSTEMS_RW'] = shared.join(delimiter);
  const program = [setup.protonScript, verb, exe, ...args];
  return setup.entryPoint === undefined
    ? { command: setup.protonScript, args: [verb, exe, ...args], env, cwd: options.cwd }
    : {
        command: setup.entryPoint,
        args: [`--verb=${verb}`, '--', ...program],
        env,
        cwd: options.cwd,
      };
}

/** A unix path as the game sees it: `Z:\run\x\eu4.exe`. */
export function windowsPathOf(path: string): string {
  return `Z:${path.replaceAll('/', '\\')}`;
}

/** Whether the process runs inside a Flatpak sandbox, from where Proton can only be started on the host. */
export { isFlatpak };
