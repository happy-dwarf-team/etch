// What the live game takes from the player (spec section 6, etch#157): their `settings.txt` and
// `pdx_settings.txt`, copied into the private profile at every start, and their saves, of which a
// chosen one is copied into the private `save games/`. The player's files are only read.
// Node only, no vscode.
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

/** The settings files the live game takes from the player. */
export const SETTINGS_FILES = ['settings.txt', 'pdx_settings.txt'] as const;

/** A profile's saves folder. */
export function savesFolder(profileFolder: string): string {
  return join(profileFolder, 'save games');
}

/** The `autosave` value of a `settings.txt`, such as `YEARLY`, or `undefined` without one. */
export function autosaveOf(settings: string): string | undefined {
  return /^\s*autosave\s*=\s*"?([A-Za-z_]+)"?\s*$/m.exec(settings)?.[1];
}

/**
 * The player's `settings.txt` as the live game takes it: unchanged, except that an autosave the
 * player turned off (`NEVER`) is monthly, so that a crash loses at most a month of play.
 */
export function liveSettings(settings: string): {
  readonly text: string;
  readonly autosaveOn: boolean;
} {
  if (autosaveOf(settings)?.toUpperCase() !== 'NEVER') return { text: settings, autosaveOn: false };
  return {
    text: settings.replace(/^(\s*autosave\s*=\s*)"?NEVER"?/im, '$1"MONTHLY"'),
    autosaveOn: true,
  };
}

/** What `copySettings` did. */
export interface CopiedSettings {
  /** The settings files the player has, copied. */
  readonly copied: readonly string[];
  /** The player's autosave is off, and the copy autosaves monthly. */
  readonly autosaveOn: boolean;
}

/**
 * Copies the player's settings files into the private profile, replacing the copies of the last
 * start, so that changes made in the live game do not persist. A file the player does not have
 * (a game never started) is left as the private profile has it.
 */
export async function copySettings(
  playerProfile: string,
  privateProfile: string,
): Promise<CopiedSettings> {
  await mkdir(privateProfile, { recursive: true });
  const copied: string[] = [];
  let autosaveOn = false;
  for (const name of SETTINGS_FILES) {
    const bytes = await readFile(join(playerProfile, name)).catch(() => undefined);
    if (bytes === undefined) continue;
    let out: Buffer = bytes;
    if (name === 'settings.txt') {
      // The game writes its settings in Windows-1252; latin1 keeps every byte as it is.
      const settings = liveSettings(bytes.toString('latin1'));
      out = Buffer.from(settings.text, 'latin1');
      autosaveOn = settings.autosaveOn;
    }
    await writeThrough(join(privateProfile, name), out);
    copied.push(name);
  }
  return { copied, autosaveOn };
}

/** A save file, as the quick pick shows it. */
export interface SaveFile {
  /** The file name, with `.eu4`. */
  readonly name: string;
  readonly path: string;
  readonly modifiedMs: number;
  /** An ironman save, which the live game cannot reload in (spec section 6). */
  readonly ironman: boolean;
}

/** The `.eu4` files of a saves folder, newest first; none when it does not exist. */
export async function listSaves(folder: string): Promise<SaveFile[]> {
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
  const saves: SaveFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.eu4')) continue;
    const path = join(folder, entry.name);
    const info = await stat(path).catch(() => undefined);
    if (info === undefined) continue;
    saves.push({
      name: entry.name,
      path,
      modifiedMs: info.mtimeMs,
      ironman: await isIronman(path),
    });
  }
  return saves.sort((a, b) => b.modifiedMs - a.modifiedMs);
}

/** How much of a plain save, or of a zipped save's `meta`, is read for its header and flags. */
const HEAD_BYTES = 64 * 1024;

/**
 * Whether a save is ironman: a binary save (`EU4bin`, which only ironman writes and Etch cannot
 * read, etch#154), or a text save that says `ironman=yes`. A zipped save is read from its `meta`
 * entry. A file that is neither is taken as not ironman.
 */
export async function isIronman(path: string): Promise<boolean> {
  const head = await readHead(path, HEAD_BYTES);
  if (head === undefined) return false;
  const meta =
    head.subarray(0, 2).toString('latin1') === 'PK' ? await zipEntry(path, 'meta') : head;
  if (meta === undefined) return false;
  const text = meta.subarray(0, HEAD_BYTES).toString('latin1');
  return text.startsWith('EU4bin') || /^\s*ironman\s*=\s*yes\b/m.test(text);
}

/**
 * Copies a player's save into the private saves folder and returns the copy's name. The copy keeps
 * the save's name unless the private folder has another file of that name (a game played on in the
 * live game), which is never overwritten: then a number is added (`Verne1444_11_11-2.eu4`).
 */
export async function copySave(save: SaveFile, privateSaves: string): Promise<string> {
  await mkdir(privateSaves, { recursive: true });
  const stem = save.name.slice(0, -'.eu4'.length);
  for (let n = 1; ; n++) {
    const name = n === 1 ? save.name : `${stem}-${String(n)}.eu4`;
    const target = join(privateSaves, name);
    const existing = await stat(target).catch(() => undefined);
    if (existing === undefined) {
      const partial = `${target}.etch-partial`;
      await copyFile(save.path, partial);
      await rename(partial, target);
      return name;
    }
    // The same save copied before and not played on since: start from it again.
    if (existing.size === (await stat(save.path)).size && (await sameBytes(target, save.path))) {
      return name;
    }
  }
}

/** The newest save of a saves folder, `undefined` when it has none. */
export async function newestSave(folder: string): Promise<SaveFile | undefined> {
  return (await listSaves(folder))[0];
}

// ---- Files -----------------------------------------------------------------------------------

async function writeThrough(path: string, bytes: Buffer): Promise<void> {
  const partial = `${path}.etch-partial`;
  await writeFile(partial, bytes);
  await rename(partial, path);
}

async function readHead(path: string, length: number): Promise<Buffer | undefined> {
  let file;
  try {
    file = await open(path, 'r');
  } catch {
    return undefined;
  }
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await file.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await file.close();
  }
}

async function sameBytes(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([readFile(a), readFile(b)]);
  return x.equals(y);
}

/**
 * One entry of a zip file, inflated, read through the central directory; `undefined` when the file
 * is not a zip or has no such entry. Saves are small zips of three entries, stored or deflated.
 */
export async function zipEntry(path: string, name: string): Promise<Buffer | undefined> {
  let file;
  try {
    file = await open(path, 'r');
  } catch {
    return undefined;
  }
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, 0xffff + 22);
    const tail = Buffer.alloc(tailLength);
    await file.read(tail, 0, tailLength, size - tailLength);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0) return undefined;
    const entries = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    const directory = Buffer.alloc(directorySize);
    await file.read(directory, 0, directorySize, directoryOffset);
    let at = 0;
    for (let i = 0; i < entries && at + 46 <= directory.length; i++) {
      if (directory.readUInt32LE(at) !== 0x02014b50) return undefined;
      const method = directory.readUInt16LE(at + 10);
      const compressed = directory.readUInt32LE(at + 20);
      const nameLength = directory.readUInt16LE(at + 28);
      const extraLength = directory.readUInt16LE(at + 30);
      const commentLength = directory.readUInt16LE(at + 32);
      const local = directory.readUInt32LE(at + 42);
      const entryName = directory.subarray(at + 46, at + 46 + nameLength).toString('latin1');
      at += 46 + nameLength + extraLength + commentLength;
      if (entryName !== name) continue;
      const header = Buffer.alloc(30);
      await file.read(header, 0, 30, local);
      if (header.readUInt32LE(0) !== 0x04034b50) return undefined;
      const dataAt = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const data = Buffer.alloc(compressed);
      await file.read(data, 0, compressed, dataAt);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      return undefined;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    await file.close();
  }
}
