import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { decodeDescriptor, parseModDescriptor, type ModDescriptor } from './descriptor.ts';
import { isDirectory, isFile, pathKey } from './locate.ts';
import type { PlaysetDiagnostic } from './diagnostics.ts';

/** Where a mod was found. */
export type ModSource = 'profile' | 'workshop' | 'workspace' | 'setting';

/** A mod the playset can load. */
export interface Mod {
  /** The descriptor's `name`, else the folder's name. */
  name: string;
  /** Absolute folder whose files the mod adds, the descriptor's `path` or the Workshop item. */
  root: string;
  /** The descriptor this mod was read from, if any. */
  descriptorPath?: string;
  source: ModSource;
  dependencies: readonly string[];
  replacePaths: readonly string[];
  supportedVersion?: string;
  /** The Steam Workshop item id: `remote_file_id`, or the Workshop folder's name. */
  workshopId?: string;
}

/** The mods installed for the player: descriptors in the profile's `mod/` and Workshop items. */
export interface ModIndex {
  /** Profile descriptors first (by file name), then Workshop items (by folder name). */
  mods: readonly Mod[];
}

/**
 * Reads the profile's `mod/*.mod` descriptors and the Workshop items' `descriptor.mod`. A profile
 * descriptor and a Workshop item with the same folder are one mod, kept as the profile's. Mods in
 * archives are skipped with a diagnostic.
 */
export async function readModIndex(
  profileFolder: string | undefined,
  workshopFolder: string | undefined,
  diagnostics: PlaysetDiagnostic[],
): Promise<ModIndex> {
  const mods: Mod[] = [];
  const roots = new Set<string>();
  const add = (mod: Mod | undefined): void => {
    if (mod === undefined || roots.has(pathKey(mod.root))) return;
    roots.add(pathKey(mod.root));
    mods.push(mod);
  };

  if (profileFolder !== undefined) {
    const modFolder = join(profileFolder, 'mod');
    for (const name of await listNames(modFolder)) {
      if (!name.toLowerCase().endsWith('.mod')) continue;
      add(
        await readProfileDescriptor(join(modFolder, name), profileFolder, 'profile', diagnostics),
      );
    }
  }
  if (workshopFolder !== undefined) {
    for (const name of await listNames(workshopFolder)) {
      add(await readFolderMod(join(workshopFolder, name), 'workshop'));
    }
  }
  return { mods };
}

/**
 * Reads a descriptor that points at its mod with `path` (absolute, or relative to the profile
 * folder), as in the profile's `mod/` folder. `undefined`, with a diagnostic, when it cannot be
 * used.
 */
export async function readProfileDescriptor(
  descriptorPath: string,
  profileFolder: string | undefined,
  source: ModSource,
  diagnostics: PlaysetDiagnostic[],
): Promise<Mod | undefined> {
  const descriptor = await readDescriptor(descriptorPath);
  if (descriptor === undefined) return undefined;
  const label = descriptor.name ?? basename(descriptorPath);
  if (descriptor.path === undefined) {
    if (descriptor.archive !== undefined) {
      diagnostics.push({
        severity: 'warning',
        code: 'mod-archive-unsupported',
        message: `Mod "${label}" is an archive (archive=); Etch reads only mods in folders and skips it.`,
        path: descriptorPath,
      });
    }
    return undefined;
  }
  const base = profileFolder ?? dirname(descriptorPath);
  const root = isAbsolute(descriptor.path)
    ? resolve(descriptor.path)
    : resolve(base, descriptor.path);
  return modFrom(descriptor, root, descriptorPath, source);
}

/**
 * Reads a mod folder, such as a Workshop item: its `descriptor.mod` if present (any `path` in it is
 * ignored, the folder is the mod), else the bare folder named after itself.
 */
export async function readFolderMod(folder: string, source: ModSource): Promise<Mod | undefined> {
  if (!(await isDirectory(folder))) return undefined;
  const descriptorPath = join(folder, 'descriptor.mod');
  const descriptor = await readDescriptor(descriptorPath);
  if (descriptor === undefined) {
    return source === 'workshop'
      ? undefined
      : { name: basename(folder), root: folder, source, dependencies: [], replacePaths: [] };
  }
  return modFrom(descriptor, folder, descriptorPath, source);
}

async function readDescriptor(path: string): Promise<ModDescriptor | undefined> {
  if (!(await isFile(path))) return undefined;
  try {
    return parseModDescriptor(decodeDescriptor(await readFile(path)));
  } catch {
    return undefined;
  }
}

function modFrom(
  descriptor: ModDescriptor,
  root: string,
  descriptorPath: string,
  source: ModSource,
): Mod {
  const mod: Mod = {
    name: descriptor.name ?? basename(root),
    root,
    descriptorPath,
    source,
    dependencies: descriptor.dependencies,
    replacePaths: descriptor.replacePaths,
  };
  if (descriptor.supportedVersion !== undefined) mod.supportedVersion = descriptor.supportedVersion;
  const workshopId =
    descriptor.remoteFileId ?? (source === 'workshop' ? basename(root) : undefined);
  if (workshopId !== undefined) mod.workshopId = workshopId;
  return mod;
}

async function listNames(folder: string): Promise<string[]> {
  try {
    return (await readdir(folder)).sort(compareIgnoringCase);
  } catch {
    return [];
  }
}

function compareIgnoringCase(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}
