import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** One folder of the playset's file system: the game folder or a mod's root. */
export interface GameFilesLayer {
  /** Shown in diagnostics and hovers: `game` or the mod's name. */
  name: string;
  /** Absolute folder. */
  root: string;
  /**
   * Folders, relative to the root, whose files from the layers before this one are hidden: the
   * mod's `replace_path` entries.
   */
  replacePaths: readonly string[];
}

/** A file of the playset, from the layer that wins it. */
export interface GameFile {
  /** Path relative to the game folder, with `/`, in the case of the winning layer's file name. */
  path: string;
  /** Absolute path on disk. */
  absolutePath: string;
  layer: GameFilesLayer;
}

interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * The game's files as a playset sees them: the game folder, then each mod in load order, where a
 * later layer's file wins over an earlier one with the same path, as in the game. Paths compare
 * without regard to case and separator, as on Windows. Read only: nothing here writes to disk.
 *
 * `replace_path` hides the earlier layers' files directly in that folder, not in its subfolders.
 * The game's handling of subfolders has not been checked against 1.37.5.
 */
export class GameFiles {
  readonly layers: readonly GameFilesLayer[];
  private readonly replaced: ReadonlySet<string>[];
  private readonly listings = new Map<string, Promise<Map<string, DirEntry>>>();

  constructor(layers: readonly GameFilesLayer[]) {
    this.layers = layers;
    this.replaced = layers.map((layer) => new Set(layer.replacePaths.map(normalizeDir)));
  }

  /** The winning file at a game-relative path, or `undefined` when no layer has it. */
  async find(path: string): Promise<GameFile | undefined> {
    const parts = splitPath(path);
    if (parts === undefined) return undefined;
    const fileName = parts.pop();
    if (fileName === undefined) return undefined;
    const dir = parts.join('/');
    const key = fileName.toLowerCase();
    for (let i = this.layers.length - 1; i >= this.firstVisibleLayer(dir); i--) {
      const entry = (await this.listing(i, dir)).get(key);
      if (entry?.isFile === true) return this.file(i, dir, entry.name);
    }
    return undefined;
  }

  /** The winning file's bytes, or `undefined` when no layer has it. */
  async read(path: string): Promise<Uint8Array | undefined> {
    const file = await this.find(path);
    return file === undefined ? undefined : readFile(file.absolutePath);
  }

  /**
   * The files directly in a game-relative folder across all layers, one per name with the winning
   * layer's file, sorted by path without regard to case. `extension` (such as `.gfx`) filters
   * them without regard to case.
   */
  async list(dir: string, extension?: string): Promise<GameFile[]> {
    const parts = splitPath(dir);
    if (parts === undefined) return [];
    const folder = parts.join('/');
    const suffix = extension?.toLowerCase();
    const winners = new Map<string, GameFile>();
    for (let i = this.firstVisibleLayer(folder); i < this.layers.length; i++) {
      for (const [key, entry] of await this.listing(i, folder)) {
        if (!entry.isFile || (suffix !== undefined && !key.endsWith(suffix))) continue;
        winners.set(key, this.file(i, folder, entry.name));
      }
    }
    return [...winners.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, f]) => f);
  }

  /**
   * The subfolders directly in a game-relative folder across all layers, as game-relative paths
   * sorted without regard to case. `replace_path` hides files, not subfolders, so every layer
   * counts.
   */
  async folders(dir: string): Promise<string[]> {
    const parts = splitPath(dir);
    if (parts === undefined) return [];
    const folder = parts.join('/');
    const found = new Map<string, string>();
    for (let i = 0; i < this.layers.length; i++) {
      for (const [key, entry] of await this.listing(i, folder)) {
        if (entry.isDirectory && !found.has(key)) {
          found.set(key, folder === '' ? entry.name : `${folder}/${entry.name}`);
        }
      }
    }
    return [...found.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, path]) => path);
  }

  private firstVisibleLayer(dir: string): number {
    const key = dir.toLowerCase();
    for (let i = this.layers.length - 1; i > 0; i--) {
      if (this.replaced[i]?.has(key) === true) return i;
    }
    return 0;
  }

  private file(layerIndex: number, dir: string, name: string): GameFile {
    const layer = this.layers[layerIndex];
    if (layer === undefined) throw new RangeError(`No layer ${String(layerIndex)}`);
    const path = dir === '' ? name : `${dir}/${name}`;
    return { path, absolutePath: join(layer.root, ...path.split('/')), layer };
  }

  private listing(layerIndex: number, dir: string): Promise<Map<string, DirEntry>> {
    const cacheKey = `${String(layerIndex)}\0${dir.toLowerCase()}`;
    let listing = this.listings.get(cacheKey);
    if (listing === undefined) {
      const root = this.layers[layerIndex]?.root;
      listing = root === undefined ? Promise.resolve(new Map()) : readListing(join(root, dir));
      this.listings.set(cacheKey, listing);
    }
    return listing;
  }
}

async function readListing(folder: string): Promise<Map<string, DirEntry>> {
  const entries = new Map<string, DirEntry>();
  let dirents;
  try {
    dirents = await readdir(folder, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const dirent of dirents) {
    let isFile = dirent.isFile();
    let isDirectory = dirent.isDirectory();
    if (dirent.isSymbolicLink()) {
      const target = await stat(join(folder, dirent.name)).catch(() => undefined);
      isFile = target?.isFile() === true;
      isDirectory = target?.isDirectory() === true;
    }
    entries.set(dirent.name.toLowerCase(), { name: dirent.name, isFile, isDirectory });
  }
  return entries;
}

/** Splits a game-relative path into segments; `undefined` when it leaves the root or is absolute. */
function splitPath(path: string): string[] | undefined {
  if (/^[a-z]:/i.test(path) || path.startsWith('\\\\')) return undefined;
  const parts = path.split(/[\\/]+/).filter((part) => part !== '' && part !== '.');
  return parts.includes('..') ? undefined : parts;
}

function normalizeDir(path: string): string {
  return (splitPath(path) ?? []).join('/').toLowerCase();
}
