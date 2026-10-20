import { readFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { decodeDescriptor, parseModDescriptor } from './descriptor.ts';
import type { PlaysetDiagnostic } from './diagnostics.ts';
import { GameFiles, type GameFilesLayer } from './game-files.ts';
import {
  findGameInSteam,
  findProfileFolder,
  isDirectory,
  isFile,
  isGameFolder,
  pathKey,
  readGameBuild,
  samePath,
  systemEnvironment,
  unsupportedBuildMessage,
  workshopFolderFor,
  type DiscoveryEnvironment,
  type GameBuild,
} from './locate.ts';
import {
  readFolderMod,
  readModIndex,
  readProfileDescriptor,
  type Mod,
  type ModIndex,
} from './mods.ts';

export interface FindPlaysetOptions {
  /** The `etch.gamePath` setting; when empty, the game is found through Steam's libraries. */
  gamePath?: string | undefined;
  /** The workspace folder that holds the edited mod. */
  workspaceFolder: string;
  /** A file of the edited mod, such as the active editor's; picks the mod when a workspace holds several. */
  activeFile?: string | undefined;
  /**
   * The `etch.playset` setting: mod names or mod folders (or `.mod` descriptors) in load order,
   * later winning. When not empty it replaces the default playset; the workspace mod is added last
   * unless the list names it.
   */
  playsetOverride?: readonly string[] | undefined;
  /** The player's profile folder; found as the game finds it when not given. */
  profileFolder?: string | undefined;
  /** How the registry and environment are read; the real ones when not given. */
  environment?: DiscoveryEnvironment | undefined;
  /** Hashes of `eu4.exe` that count as the supported build; 1.37.5's when not given. */
  supportedExeSha256?: readonly string[] | undefined;
}

/** The game, the mods and the playset a preview uses. */
export interface Playset {
  /** The game folder, `undefined` when it was not found (with an error diagnostic). */
  gameFolder: string | undefined;
  gameBuild: GameBuild | undefined;
  /** The player's profile folder, `undefined` when it does not exist. */
  profileFolder: string | undefined;
  /** EU4's Workshop folder, `undefined` when it does not exist. */
  workshopFolder: string | undefined;
  /** The edited mod, `undefined` when the workspace is the game folder itself. */
  workspaceMod: Mod | undefined;
  /** The playset's mods in load order: a later mod's file wins. */
  mods: readonly Mod[];
  /** The game folder and the mods as one read-only file system. */
  files: GameFiles;
  diagnostics: PlaysetDiagnostic[];
}

/**
 * Finds the game, the mods and the playset (spec sections 2 and 8): the game from `etch.gamePath`
 * or Steam, the workspace mod and its descriptor's `dependencies` resolved by name among the
 * profile's `mod/` descriptors and the Workshop items, or the playset override. Dependencies are
 * followed transitively and load before the mods that name them. Only reads; problems become
 * diagnostics instead of exceptions.
 */
export async function findPlayset(options: FindPlaysetOptions): Promise<Playset> {
  const environment = options.environment ?? systemEnvironment();
  const diagnostics: PlaysetDiagnostic[] = [];

  const gameFolder = await findGameFolder(options.gamePath, environment, diagnostics);
  let gameBuild: GameBuild | undefined;
  if (gameFolder !== undefined) {
    try {
      gameBuild = await readGameBuild(gameFolder, options.supportedExeSha256);
      if (!gameBuild.supported) {
        diagnostics.push({
          severity: 'warning',
          code: 'unsupported-game-build',
          message: unsupportedBuildMessage(gameBuild),
          path: join(gameFolder, 'eu4.exe'),
        });
      }
    } catch {
      diagnostics.push({
        severity: 'warning',
        code: 'unsupported-game-build',
        message:
          'eu4.exe could not be read to check its build; Etch is only checked against EU4 1.37.5.',
        path: join(gameFolder, 'eu4.exe'),
      });
    }
  }

  let profileFolder: string | undefined =
    options.profileFolder ?? (await findProfileFolder(gameFolder, environment));
  if (!(await isDirectory(profileFolder))) {
    diagnostics.push({
      severity: 'warning',
      code: 'profile-not-found',
      message: `The EU4 profile folder was not found, so mods from its mod folder are not available.`,
      path: profileFolder,
    });
    profileFolder = undefined;
  }

  const workshopFolder = await findWorkshopFolder(gameFolder, options.gamePath, environment);
  const index = await readModIndex(profileFolder, workshopFolder, diagnostics);
  const byName = new ModsByName(index, diagnostics);

  const workspaceFolder = resolve(options.workspaceFolder);
  const activeFile = options.activeFile === undefined ? undefined : resolve(options.activeFile);
  // Editing the game's own files previews vanilla: the game folder is not a mod.
  const editsGame = gameFolder !== undefined && isInside(activeFile ?? workspaceFolder, gameFolder);
  const workspaceMod = editsGame
    ? undefined
    : await findWorkspaceMod(index, workspaceFolder, activeFile, diagnostics);

  const override = (options.playsetOverride ?? []).map((e) => e.trim()).filter((e) => e !== '');
  const ordered =
    override.length > 0
      ? await overridePlayset(
          override,
          workspaceMod,
          workspaceFolder,
          profileFolder,
          byName,
          diagnostics,
        )
      : dependencyPlayset(workspaceMod, byName, diagnostics);

  const mods: Mod[] = [];
  for (const mod of ordered) {
    if (await isDirectory(mod.root)) {
      mods.push(mod);
    } else {
      diagnostics.push({
        severity: 'warning',
        code: 'mod-folder-missing',
        message: `The folder of mod "${mod.name}" does not exist; the playset goes on without it.`,
        path: mod.descriptorPath ?? mod.root,
      });
    }
  }

  const layers: GameFilesLayer[] = [];
  if (gameFolder !== undefined) layers.push({ name: 'game', root: gameFolder, replacePaths: [] });
  for (const mod of mods)
    layers.push({ name: mod.name, root: mod.root, replacePaths: mod.replacePaths });

  return {
    gameFolder,
    gameBuild,
    profileFolder,
    workshopFolder,
    workspaceMod,
    mods,
    files: new GameFiles(layers),
    diagnostics,
  };
}

async function findGameFolder(
  gamePath: string | undefined,
  environment: DiscoveryEnvironment,
  diagnostics: PlaysetDiagnostic[],
): Promise<string | undefined> {
  const setting = gamePath?.trim() ?? '';
  if (setting !== '') {
    const folder = resolve(setting);
    if (await isGameFolder(folder)) return folder;
    diagnostics.push({
      severity: 'error',
      code: 'game-path-invalid',
      message: 'The folder in etch.gamePath has no eu4.exe. Set it to the EU4 game folder.',
      path: folder,
    });
    return undefined;
  }
  const folder = await findGameInSteam(environment);
  if (folder === undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'game-not-found',
      message:
        "EU4 was not found in Steam's libraries. Set etch.gamePath to the folder that holds eu4.exe.",
    });
  }
  return folder;
}

/** The Workshop folder next to the game in its Steam library, else the one of Steam's EU4. */
async function findWorkshopFolder(
  gameFolder: string | undefined,
  gamePath: string | undefined,
  environment: DiscoveryEnvironment,
): Promise<string | undefined> {
  if (gameFolder !== undefined) {
    const workshop = workshopFolderFor(gameFolder);
    if (await isDirectory(workshop)) return workshop;
  }
  // A game folder outside a Steam library (etch.gamePath) still uses Steam's Workshop items.
  if ((gamePath?.trim() ?? '') === '') return undefined;
  const steamGame = await findGameInSteam(environment);
  if (steamGame === undefined) return undefined;
  const workshop = workshopFolderFor(steamGame);
  return (await isDirectory(workshop)) ? workshop : undefined;
}

/**
 * The edited mod: the installed mod whose folder holds the active file or the workspace (the
 * innermost), else the nearest `descriptor.mod` above it, else the one installed mod inside the
 * workspace, else the workspace folder as a mod without dependencies.
 */
async function findWorkspaceMod(
  index: ModIndex,
  workspaceFolder: string,
  activeFile: string | undefined,
  diagnostics: PlaysetDiagnostic[],
): Promise<Mod> {
  const target = activeFile ?? workspaceFolder;
  const containing = index.mods
    .filter((mod) => isInside(target, mod.root))
    .sort((a, b) => pathKey(b.root).length - pathKey(a.root).length)[0];
  if (containing !== undefined) return { ...containing, source: 'workspace' };

  for (
    let folder = activeFile === undefined ? target : dirname(target);
    ;
    folder = dirname(folder)
  ) {
    if (await isFile(join(folder, 'descriptor.mod'))) {
      const mod = await readFolderMod(folder, 'workspace');
      if (mod !== undefined) return mod;
    }
    if (dirname(folder) === folder) break;
  }

  const inside = index.mods.filter((mod) => isInside(mod.root, workspaceFolder));
  const [first, ...others] = inside;
  if (first !== undefined) {
    if (others.length > 0) {
      diagnostics.push({
        severity: 'information',
        code: 'workspace-mod-ambiguous',
        message: `The workspace holds several mods (${inside.map((m) => `"${m.name}"`).join(', ')}); previewing with "${first.name}". Open a file of another mod to use that one.`,
        path: workspaceFolder,
      });
    }
    return { ...first, source: 'workspace' };
  }

  diagnostics.push({
    severity: 'warning',
    code: 'workspace-mod-not-found',
    message:
      'No .mod descriptor points at this workspace, so it is previewed as a mod without dependencies. Add the mod in the launcher or set etch.playset.',
    path: workspaceFolder,
  });
  return {
    name: basename(workspaceFolder),
    root: workspaceFolder,
    source: 'workspace',
    dependencies: [],
    replacePaths: [],
  };
}

/** The workspace mod after its dependencies, followed depth first in the order listed. */
function dependencyPlayset(
  workspaceMod: Mod | undefined,
  byName: ModsByName,
  diagnostics: PlaysetDiagnostic[],
): Mod[] {
  const ordered: Mod[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const reported = new Set<string>();

  const visit = (mod: Mod, direct: boolean): void => {
    const key = pathKey(mod.root);
    if (done.has(key) || visiting.has(key)) return;
    visiting.add(key);
    for (const name of mod.dependencies) {
      const dependency = byName.get(name);
      if (dependency !== undefined) {
        visit(dependency, false);
      } else if (!reported.has(name.toLowerCase())) {
        reported.add(name.toLowerCase());
        // Large mods list stale names; only the workspace mod's own dependencies are worth a warning.
        diagnostics.push({
          severity: direct ? 'warning' : 'information',
          code: 'dependency-not-found',
          message: `Mod "${mod.name}" depends on "${name}", which is neither a Workshop item nor in the profile's mod folder; the playset goes on without it.`,
          ...(mod.descriptorPath === undefined ? {} : { path: mod.descriptorPath }),
        });
      }
    }
    visiting.delete(key);
    done.add(key);
    ordered.push(mod);
  };

  if (workspaceMod !== undefined) visit(workspaceMod, true);
  return ordered;
}

/** The mods the playset override lists, in its order, and the workspace mod last unless listed. */
async function overridePlayset(
  entries: readonly string[],
  workspaceMod: Mod | undefined,
  workspaceFolder: string,
  profileFolder: string | undefined,
  byName: ModsByName,
  diagnostics: PlaysetDiagnostic[],
): Promise<Mod[]> {
  const ordered: Mod[] = [];
  const roots = new Set<string>();
  const add = (mod: Mod): void => {
    if (roots.has(pathKey(mod.root))) return;
    roots.add(pathKey(mod.root));
    ordered.push(mod);
  };

  for (const entry of entries) {
    const mod = looksLikePath(entry)
      ? await modFromPath(resolve(workspaceFolder, entry), profileFolder, diagnostics)
      : workspaceMod !== undefined && workspaceMod.name.toLowerCase() === entry.toLowerCase()
        ? workspaceMod
        : byName.get(entry);
    if (mod === undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'playset-entry-not-found',
        message: `etch.playset lists "${entry}", which is neither an installed mod's name nor a mod folder; the playset goes on without it.`,
      });
    } else if (workspaceMod !== undefined && samePath(mod.root, workspaceMod.root)) {
      add(workspaceMod);
    } else {
      add({ ...mod, source: 'setting' });
    }
  }
  if (workspaceMod !== undefined) add(workspaceMod);
  return ordered;
}

async function modFromPath(
  path: string,
  profileFolder: string | undefined,
  diagnostics: PlaysetDiagnostic[],
): Promise<Mod | undefined> {
  if (await isDirectory(path)) return readFolderMod(path, 'setting');
  if (!(await isFile(path))) return undefined;
  const descriptor = parseModDescriptor(decodeDescriptor(await readFile(path)));
  return descriptor.path === undefined && descriptor.archive === undefined
    ? readFolderMod(dirname(path), 'setting')
    : readProfileDescriptor(path, profileFolder, 'setting', diagnostics);
}

function looksLikePath(entry: string): boolean {
  return isAbsolute(entry) || /[\\/]/.test(entry) || entry.toLowerCase().endsWith('.mod');
}

/** Whether `path` is `folder` or inside it, as on Windows. */
function isInside(path: string, folder: string): boolean {
  const p = pathKey(path);
  const f = pathKey(folder);
  return p === f || p.startsWith(`${f}/`);
}

/**
 * Installed mods by descriptor name, without regard to case; the first in index order wins. A name
 * that matches no mod but is a Workshop id finds the mod with that id, as some descriptors list it.
 */
class ModsByName {
  private readonly mods = new Map<string, Mod[]>();
  private readonly ids = new Map<string, Mod>();
  private readonly reported = new Set<string>();
  private readonly diagnostics: PlaysetDiagnostic[];

  constructor(index: ModIndex, diagnostics: PlaysetDiagnostic[]) {
    this.diagnostics = diagnostics;
    for (const mod of index.mods) {
      const key = mod.name.trim().toLowerCase();
      const list = this.mods.get(key);
      if (list === undefined) this.mods.set(key, [mod]);
      else list.push(mod);
      if (mod.workshopId !== undefined && !this.ids.has(mod.workshopId)) {
        this.ids.set(mod.workshopId, mod);
      }
    }
  }

  get(name: string): Mod | undefined {
    const key = name.trim().toLowerCase();
    const list = this.mods.get(key);
    const first = list?.[0];
    if (first === undefined) return /^\d+$/.test(key) ? this.ids.get(key) : undefined;
    if (list !== undefined && list.length > 1 && !this.reported.has(key)) {
      this.reported.add(key);
      this.diagnostics.push({
        severity: 'information',
        code: 'mod-name-ambiguous',
        message: `${String(list.length)} installed mods are named "${first.name}"; the playset uses the one in ${first.root}. List the folder in etch.playset to choose another.`,
        ...(first.descriptorPath === undefined ? {} : { path: first.descriptorPath }),
      });
    }
    return first;
  }
}
