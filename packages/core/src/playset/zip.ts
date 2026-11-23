// A read-only zip reader for the game's DLC archives (ADR 0009): the central directory is read once
// per archive, and an entry is inflated when it is asked for, never unpacked to disk. Only what the
// game's archives use is read: stored and deflated entries, without encryption, zip64 sizes and
// offsets included.

import type { Stats } from 'node:fs';
import { open, readFile, stat, type FileHandle } from 'node:fs/promises';
import { promisify } from 'node:util';
import { inflateRaw } from 'node:zlib';

const inflate = promisify(inflateRaw);

/** One file of an archive, as its central directory gives it. */
export interface ZipEntry {
  /** The entry's name, with `/`, as the archive stores it. */
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly size: number;
  /** Offset of the entry's local header in the archive. */
  readonly offset: number;
}

const EOCD = 0x06054b50;
const ZIP64_EOCD = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_COMMENT = 0xffff;

/** An archive on disk; the file is opened for each read, so nothing stays open between reads. */
export class ZipArchive {
  readonly path: string;
  private entries: Promise<readonly ZipEntry[]> | undefined;
  private byName: Promise<Map<string, ZipEntry>> | undefined;

  constructor(path: string) {
    this.path = path;
  }

  /** The archive's file entries (folders left out); empty when the file is not a readable zip. */
  list(): Promise<readonly ZipEntry[]> {
    this.entries ??= withFile(this.path, readCentralDirectory).catch(() => []);
    return this.entries;
  }

  /** The entry with a name, compared without regard to case and separator. */
  async entry(name: string): Promise<ZipEntry | undefined> {
    const key = name.replace(/\\/g, '/').toLowerCase();
    this.byName ??= this.list().then((list) => {
      const map = new Map<string, ZipEntry>();
      for (const e of list) if (!map.has(e.name.toLowerCase())) map.set(e.name.toLowerCase(), e);
      return map;
    });
    return (await this.byName).get(key);
  }

  /** The bytes of one entry. */
  async read(entry: ZipEntry): Promise<Buffer> {
    return withFile(this.path, async (file) => {
      const header = await readAt(file, entry.offset, 30);
      if (header.readUInt32LE(0) !== LOCAL)
        throw new Error(`${this.path}: no local header for ${entry.name}`);
      if ((header.readUInt16LE(6) & 1) !== 0)
        throw new Error(`${this.path}: ${entry.name} is encrypted`);
      const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
      const data = await readAt(file, start, entry.compressedSize);
      if (entry.method === 0) return data;
      if (entry.method === 8) return inflate(data);
      throw new Error(
        `${this.path}: ${entry.name} uses compression method ${String(entry.method)}`,
      );
    });
  }
}

async function withFile<T>(path: string, use: (file: FileHandle) => Promise<T>): Promise<T> {
  const file = await open(path, 'r');
  try {
    return await use(file);
  } finally {
    await file.close();
  }
}

async function readAt(file: FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await file.read(buffer, done, length - done, position + done);
    if (bytesRead === 0) throw new Error('Unexpected end of the archive');
    done += bytesRead;
  }
  return buffer;
}

async function readCentralDirectory(file: FileHandle): Promise<ZipEntry[]> {
  const { size } = await file.stat();
  const tailLength = Math.min(size, 22 + MAX_COMMENT);
  const tail = await readAt(file, size - tailLength, tailLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('No end of central directory');
  let count = tail.readUInt16LE(eocd + 10);
  let directorySize = tail.readUInt32LE(eocd + 12);
  let directoryOffset = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    const locator = eocd - 20;
    if (locator < 0 || tail.readUInt32LE(locator) !== ZIP64_LOCATOR)
      throw new Error('No zip64 locator');
    const record = await readAt(file, Number(tail.readBigUInt64LE(locator + 8)), 56);
    if (record.readUInt32LE(0) !== ZIP64_EOCD) throw new Error('No zip64 end of central directory');
    count = Number(record.readBigUInt64LE(32));
    directorySize = Number(record.readBigUInt64LE(40));
    directoryOffset = Number(record.readBigUInt64LE(48));
  }
  const directory = await readAt(file, directoryOffset, directorySize);
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    if (directory.readUInt32LE(at) !== CENTRAL) throw new Error('Broken central directory');
    const flags = directory.readUInt16LE(at + 8);
    const method = directory.readUInt16LE(at + 10);
    let compressedSize = directory.readUInt32LE(at + 20);
    let entrySize = directory.readUInt32LE(at + 24);
    const nameLength = directory.readUInt16LE(at + 28);
    const extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    let offset = directory.readUInt32LE(at + 42);
    const nameBytes = directory.subarray(at + 46, at + 46 + nameLength);
    // Bit 11: UTF-8 names; the game's archives have ASCII names, so latin1 reads the rest.
    const name = nameBytes.toString((flags & 0x800) !== 0 ? 'utf8' : 'latin1').replace(/\\/g, '/');
    const extra = directory.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength);
    if (entrySize === 0xffffffff || compressedSize === 0xffffffff || offset === 0xffffffff) {
      const sizes = zip64Extra(extra);
      if (sizes !== undefined) {
        let k = 0;
        if (entrySize === 0xffffffff) entrySize = Number(sizes.readBigUInt64LE(8 * k++));
        if (compressedSize === 0xffffffff) compressedSize = Number(sizes.readBigUInt64LE(8 * k++));
        if (offset === 0xffffffff) offset = Number(sizes.readBigUInt64LE(8 * k));
      }
    }
    if (!name.endsWith('/'))
      entries.push({ name, method, compressedSize, size: entrySize, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function zip64Extra(extra: Buffer): Buffer | undefined {
  let at = 0;
  while (at + 4 <= extra.length) {
    const id = extra.readUInt16LE(at);
    const length = extra.readUInt16LE(at + 2);
    if (id === 0x0001) return extra.subarray(at + 4, at + 4 + length);
    at += 4 + length;
  }
  return undefined;
}

/**
 * Where a `GameFile.absolutePath` of a DLC's file points: the archive (the first segment that ends
 * in `.zip` and is not the last) and the entry's name, with `/`. `undefined` for any other path.
 */
export function splitArchivePath(path: string): { archive: string; entry: string } | undefined {
  const parts = path.split(/[\\/]/);
  const at = parts.findIndex((part, i) => i < parts.length - 1 && /\.zip$/i.test(part));
  if (at < 0) return undefined;
  const separator = path.includes('\\') ? '\\' : '/';
  return { archive: parts.slice(0, at + 1).join(separator), entry: parts.slice(at + 1).join('/') };
}

/** `stat` of a `GameFile.absolutePath`: of the archive, for an entry of a DLC's archive. */
export function statGamePath(path: string): Promise<Stats> {
  return stat(splitArchivePath(path)?.archive ?? path);
}

const opened = new Map<string, ZipArchive>();

/**
 * The bytes of a `GameFile.absolutePath`: the file on disk, or the entry of a DLC's archive when
 * the path runs through one (ADR 0009). For code that passes paths, not `GameFile`s, around.
 */
export async function readGamePath(path: string): Promise<Buffer> {
  const place = splitArchivePath(path);
  if (place === undefined) return readFile(path);
  let zip = opened.get(place.archive.toLowerCase());
  if (zip === undefined) {
    zip = new ZipArchive(place.archive);
    opened.set(place.archive.toLowerCase(), zip);
  }
  const entry = await zip.entry(place.entry);
  if (entry === undefined) throw new Error(`${place.archive} has no ${place.entry}`);
  return zip.read(entry);
}
