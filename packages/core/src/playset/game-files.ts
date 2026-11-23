import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ZipArchive, type ZipEntry } from './zip.ts';

/**
 * One folder of the playset's file system: the game folder, a DLC's archive (ADR 0009) or a mod's
 * root.
 */
export interface GameFilesLayer {
  /** Shown in diagnostics and hovers: `game`, the DLC's name or the mod's name. */
  name: string;
  /** Absolute folder, or for a DLC the archive's absolute path. */
  root: string;
  /** `root` is a zip archive, read in place: a DLC of the game (ADR 0009). */
  archive?: boolean;
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
  /**
   * Absolute path on disk. For a file in a DLC's archive it is the archive's path joined with the
   * entry's name, which is not a file on disk: read it with `GameFiles.readFile`.
   */
  absolutePath: string;
  layer: GameFilesLayer;
  /** The entry's name in the archive, for a file of a DLC's archive (`layer.archive`). */
  archiveEntry?: string;
}

interface DirEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
}

/**
 * A folder's entries by lower-case name, and the folder's path on disk relative to the layer's
 * root, in the case the disk has: a request for `INTERFACE` finds `interface` on a case-sensitive
 * file system too (Linux, macOS), as it does on Windows.
 */
interface Listing {
  actualDir: string;
  entries: Map<string, DirEntry>;
}

/**
 * The game's files as a playset sees them: the game folder, then the archives of the DLCs that
 * are on (ADR 0009), then each mod in load order, where a later layer's file wins over an earlier
 * one with the same path, as in the game. Paths compare
 * without regard to case and separator, as on Windows. Read only: nothing here writes to disk.
 *
 * `replace_path` hides the earlier layers' files directly in that folder, not in its subfolders,
 * as in EU4 1.37.5: with `replace_path = "events"` the game still loads the base game's
 * `events/<sub>/*.txt` (checked in the game on 15.11.2026).
 */
export class GameFiles {
  readonly layers: readonly GameFilesLayer[];
  private readonly replaced: ReadonlySet<string>[];
  private readonly listings = new Map<string, Promise<Listing>>();
  private readonly archives = new Map<number, Promise<ArchiveIndex>>();
  /** Each archive layer's index once {@link loadArchives} has read them all, by layer. */
  private readonly loaded: (ArchiveIndex | undefined)[] = [];
  private archivesLoaded: Promise<void> | undefined;
  /** For each file path of the archives, in lower case, the last archive layer that has it. */
  private readonly archiveFiles = new Map<string, number>();

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
    await this.loadArchives();
    const first = this.firstVisibleLayer(dir);
    for (let i = this.layers.length - 1; i >= first; i--) {
      if (this.layers[i]?.archive === true) {
        // The archives lie next to each other: the last one with the file wins over the others.
        const top = this.archiveFiles.get(dir === '' ? key : `${dir.toLowerCase()}/${key}`);
        let bottom = i;
        while (bottom > first && this.layers[bottom - 1]?.archive === true) bottom--;
        if (top !== undefined && top >= bottom && top <= i) i = top;
        else {
          i = bottom;
          continue;
        }
      }
      const listing = await this.layerListing(i, dir);
      const entry = listing?.entries.get(key);
      if (listing !== undefined && entry?.isFile === true) {
        return this.file(i, dir, listing.actualDir, entry.name);
      }
    }
    return undefined;
  }

  /** The winning file's bytes, or `undefined` when no layer has it. */
  async read(path: string): Promise<Uint8Array | undefined> {
    const file = await this.find(path);
    return file === undefined ? undefined : this.readFile(file);
  }

  /** The bytes of a file this playset found, from disk or from a DLC's archive. */
  async readFile(file: GameFile): Promise<Uint8Array> {
    if (file.archiveEntry === undefined) return readFile(file.absolutePath);
    const index = this.layers.indexOf(file.layer);
    const archive = index < 0 ? undefined : await this.archiveIndex(index);
    const entry = archive?.entries.get(file.archiveEntry.toLowerCase());
    if (archive === undefined || entry === undefined) {
      throw new Error(`${file.layer.root} has no ${file.archiveEntry}`);
    }
    return archive.zip.read(entry);
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
    await this.loadArchives();
    for (let i = this.firstVisibleLayer(folder); i < this.layers.length; i++) {
      const listing = await this.layerListing(i, folder);
      if (listing === undefined) continue;
      for (const [key, entry] of listing.entries) {
        if (!entry.isFile || (suffix !== undefined && !key.endsWith(suffix))) continue;
        winners.set(key, this.file(i, folder, listing.actualDir, entry.name));
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
    await this.loadArchives();
    for (let i = 0; i < this.layers.length; i++) {
      for (const [key, entry] of (await this.layerListing(i, folder))?.entries ?? []) {
        if (entry.isDirectory && !found.has(key)) {
          found.set(key, folder === '' ? entry.name : `${folder}/${entry.name}`);
        }
      }
    }
    return [...found.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, path]) => path);
  }

  /** Whether a mod's `replace_path` hides the game's (the first layer's) files directly in `dir`. */
  replacesGameFolder(dir: string): boolean {
    return this.firstVisibleLayer(normalizeDir(dir)) > 0;
  }

  private firstVisibleLayer(dir: string): number {
    const key = dir.toLowerCase();
    for (let i = this.layers.length - 1; i > 0; i--) {
      if (this.replaced[i]?.has(key) === true) return i;
    }
    return 0;
  }

  private file(layerIndex: number, dir: string, actualDir: string, name: string): GameFile {
    const layer = this.layers[layerIndex];
    if (layer === undefined) throw new RangeError(`No layer ${String(layerIndex)}`);
    const path = dir === '' ? name : `${dir}/${name}`;
    const onDisk = actualDir === '' ? name : `${actualDir}/${name}`;
    const absolutePath = join(layer.root, ...onDisk.split('/'));
    return layer.archive === true
      ? { path, absolutePath, layer, archiveEntry: onDisk }
      : { path, absolutePath, layer };
  }

  /** The entries of a game-relative folder in one layer; each segment is found through its parent's listing. */
  private listing(layerIndex: number, dir: string): Promise<Listing> {
    const cacheKey = `${String(layerIndex)}\0${dir.toLowerCase()}`;
    let listing = this.listings.get(cacheKey);
    if (listing === undefined) {
      listing = this.readFolder(layerIndex, dir);
      this.listings.set(cacheKey, listing);
    }
    return listing;
  }

  private async readFolder(layerIndex: number, dir: string): Promise<Listing> {
    const layer = this.layers[layerIndex];
    const root = layer?.root;
    if (root === undefined) return { actualDir: '', entries: new Map() };
    if (layer?.archive === true) {
      const folder = (await this.archiveIndex(layerIndex)).folders.get(dir.toLowerCase());
      return folder ?? { actualDir: '', entries: new Map() };
    }
    if (dir === '') return { actualDir: '', entries: await readListing(root) };
    const slash = dir.lastIndexOf('/');
    const parent = await this.listing(layerIndex, slash < 0 ? '' : dir.slice(0, slash));
    const entry = parent.entries.get(dir.slice(slash + 1).toLowerCase());
    if (entry?.isDirectory !== true) return { actualDir: '', entries: new Map() };
    const actualDir = parent.actualDir === '' ? entry.name : `${parent.actualDir}/${entry.name}`;
    return { actualDir, entries: await readListing(join(root, ...actualDir.split('/'))) };
  }

  /**
   * A folder's listing in one layer, `undefined` when an archive has no such folder. An archive's
   * listing comes from its index without waiting: a playset has over a hundred archives, and most
   * have none of the folders a lookup walks through.
   */
  private layerListing(layerIndex: number, dir: string): Listing | undefined | Promise<Listing> {
    if (this.layers[layerIndex]?.archive !== true) return this.listing(layerIndex, dir);
    return this.loaded[layerIndex]?.folders.get(dir.toLowerCase());
  }

  /** Reads every archive layer's index, once. */
  private loadArchives(): Promise<void> {
    this.archivesLoaded ??= Promise.all(
      this.layers.map(async (layer, i) => {
        if (layer.archive === true) this.loaded[i] = await this.archiveIndex(i);
      }),
    ).then(() => {
      this.loaded.forEach((index, i) => {
        for (const path of index?.entries.keys() ?? []) this.archiveFiles.set(path, i);
      });
    });
    return this.archivesLoaded;
  }

  /** A DLC archive's entries by lower-case name and its folders' listings, read once. */
  private archiveIndex(layerIndex: number): Promise<ArchiveIndex> {
    let index = this.archives.get(layerIndex);
    if (index === undefined) {
      const zip = new ZipArchive(this.layers[layerIndex]?.root ?? '');
      index = zip.list().then((entries) => indexArchive(zip, entries));
      this.archives.set(layerIndex, index);
    }
    return index;
  }
}

interface ArchiveIndex {
  zip: ZipArchive;
  /** Entries by lower-case name. */
  entries: Map<string, ZipEntry>;
  /** Folder listings by lower-case path, `''` for the archive's root. */
  folders: Map<string, Listing>;
}

/** An archive's folders as listings, each in the case of the first entry that names it. */
function indexArchive(zip: ZipArchive, list: readonly ZipEntry[]): ArchiveIndex {
  const root: Listing = { actualDir: '', entries: new Map() };
  const entries = new Map<string, ZipEntry>();
  const folders = new Map<string, Listing>([['', root]]);
  for (const entry of list) {
    const parts = entry.name.split('/').filter((p) => p !== '' && p !== '.');
    const name = parts.pop();
    if (name === undefined || parts.includes('..')) continue;
    let folder = root;
    let key = '';
    for (const part of parts) {
      const lower = part.toLowerCase();
      key = key === '' ? lower : `${key}/${lower}`;
      let child = folders.get(key);
      if (child === undefined) {
        const actualDir = folder.actualDir === '' ? part : `${folder.actualDir}/${part}`;
        child = { actualDir, entries: new Map() };
        folders.set(key, child);
      }
      if (!folder.entries.has(lower)) {
        folder.entries.set(lower, { name: part, isFile: false, isDirectory: true });
      }
      folder = child;
    }
    const lower = name.toLowerCase();
    if (folder.entries.has(lower)) continue;
    folder.entries.set(lower, { name, isFile: true, isDirectory: false });
    const actual = folder.actualDir === '' ? name : `${folder.actualDir}/${name}`;
    entries.set(actual.toLowerCase(), entry);
  }
  return { zip, entries, folders };
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
