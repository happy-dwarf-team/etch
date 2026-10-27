/**
 * The file a save is in (spec section 5, etch#154): a zip of `meta`, `gamestate` and `ai` (a
 * normal save, `compress_saves=yes`), or one plain text file that holds the meta and the
 * gamestate together (an autosave, `compress_autosave=no`). Text starts `EU4txt`; a binary save
 * (ironman) starts `EU4bin` and is refused here, before its gamestate is inflated: no token table
 * can be lawfully shipped to read it.
 *
 * Inflating uses `node:zlib`, whose asynchronous calls run in libuv's thread pool, so the
 * extension host's event loop stays free while a save of 100 MB inflates.
 */
import { promisify } from 'node:util';
import { createInflateRaw, inflateRaw } from 'node:zlib';

const inflate = promisify(inflateRaw);

/** How the save is stored. */
export type SaveForm = 'zip' | 'plain';

/** Why a file cannot be read as a save. */
export type SaveProblem =
  /** A binary save, such as an ironman game's: Etch does not read them (etch#154). */
  | 'binary'
  /** Not an EU4 save at all. */
  | 'not-a-save'
  /** A zip or text that ends early or does not hold what a save holds. */
  | 'damaged';

export class SaveReadError extends Error {
  readonly problem: SaveProblem;
  constructor(problem: SaveProblem, message: string) {
    super(message);
    this.name = 'SaveReadError';
    this.problem = problem;
  }
}

/** The text of a save, without the `EU4txt` mark: Windows-1252 bytes. */
export interface SaveTexts {
  readonly form: SaveForm;
  /** The gamestate; in a plain save it also holds the meta's keys at its top level. */
  readonly gamestate: Uint8Array;
  /** The zip's `meta` entry; `undefined` for a plain save. */
  readonly meta?: Uint8Array;
}

const TEXT_MARK = 'EU4txt';
const BINARY_MARK = 'EU4bin';
const MARK_LENGTH = 6;

const BINARY_MESSAGE =
  'This is a binary save, as an ironman game writes it. Etch reads text saves only: choose a ' +
  'save of a game that is not ironman.';

/** Reads a save file's bytes into its texts; throws {@link SaveReadError} when it cannot. */
export async function readSaveTexts(bytes: Uint8Array): Promise<SaveTexts> {
  if (startsWith(bytes, 0, 'PK\u0003\u0004')) return readZip(bytes);
  const mark = markOf(bytes, 0);
  if (mark === BINARY_MARK) throw new SaveReadError('binary', BINARY_MESSAGE);
  if (mark !== TEXT_MARK) {
    throw new SaveReadError(
      'not-a-save',
      'This file is not an EU4 save: it starts with neither a zip nor EU4txt.',
    );
  }
  return { form: 'plain', gamestate: bytes.subarray(MARK_LENGTH) };
}

interface ZipEntry {
  readonly method: number;
  /** The inflated size, as the central directory gives it. */
  readonly size: number;
  readonly data: Uint8Array;
}

async function readZip(bytes: Uint8Array): Promise<SaveTexts> {
  const entries = zipEntries(bytes);
  const metaEntry = entries.get('meta');
  const gamestateEntry = entries.get('gamestate');
  if (gamestateEntry === undefined) {
    throw new SaveReadError('not-a-save', 'This zip has no gamestate: it is not an EU4 save.');
  }
  // The meta is a few KB: its mark tells a binary save before the gamestate is inflated.
  const meta = metaEntry === undefined ? undefined : await entryBytes(metaEntry, 'meta');
  if (meta !== undefined) checkMark(meta, 'meta');
  const gamestate = await entryBytes(gamestateEntry, 'gamestate');
  checkMark(gamestate, 'gamestate');
  return {
    form: 'zip',
    gamestate: gamestate.subarray(MARK_LENGTH),
    ...(meta === undefined ? {} : { meta: meta.subarray(MARK_LENGTH) }),
  };
}

function checkMark(bytes: Uint8Array, entry: string): void {
  const mark = markOf(bytes, 0);
  if (mark === BINARY_MARK) throw new SaveReadError('binary', BINARY_MESSAGE);
  if (mark !== TEXT_MARK) {
    throw new SaveReadError('not-a-save', `The save's ${entry} does not start with EU4txt.`);
  }
}

async function entryBytes(entry: ZipEntry, name: string): Promise<Uint8Array> {
  if (entry.method === 0) return entry.data;
  if (entry.method !== 8) {
    throw new SaveReadError(
      'damaged',
      `The save's ${name} is compressed by method ${String(entry.method)}, not deflate.`,
    );
  }
  try {
    const sized = await inflateInto(entry.data, entry.size);
    if (sized !== undefined) return sized;
    const inflated = await inflate(entry.data);
    return new Uint8Array(inflated.buffer, inflated.byteOffset, inflated.byteLength);
  } catch (error) {
    throw new SaveReadError(
      'damaged',
      `The save's ${name} does not inflate: ${(error as Error).message}.`,
    );
  }
}

/** The chunk of inflated bytes a stream hands over at a time. */
const INFLATE_CHUNK = 1 << 20;

/**
 * Inflates into one buffer of the size the zip's directory gives, chunk by chunk, so that a
 * 110 MB gamestate is never held twice while chunks are joined: in the extension host, whose heap
 * holds a playset, the doubled peak set off collections that stalled a save by seconds. `undefined`
 * when the inflated data is not that size, for the caller to inflate it as it comes.
 */
function inflateInto(data: Uint8Array, size: number): Promise<Uint8Array | undefined> {
  return new Promise((resolve, reject) => {
    const out = Buffer.allocUnsafe(size);
    let at = 0;
    let over = false;
    const stream = createInflateRaw({ chunkSize: INFLATE_CHUNK });
    stream.on('data', (chunk: Buffer) => {
      if (over) return;
      if (at + chunk.length > size) {
        over = true;
        return;
      }
      out.set(chunk, at);
      at += chunk.length;
    });
    stream.on('end', () => {
      resolve(over || at !== size ? undefined : new Uint8Array(out.buffer, out.byteOffset, size));
    });
    stream.on('error', reject);
    stream.end(data);
  });
}

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

/** The entries of a zip by name, from its central directory; their data still compressed. */
function zipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const damaged = (what: string): never => {
    throw new SaveReadError('damaged', `The save's zip is damaged: ${what}.`);
  };
  // The end record is 22 bytes plus a comment of up to 65535.
  let end = bytes.length - 22;
  const stop = Math.max(0, end - 0xffff);
  while (end >= stop && view.getUint32(end, true) !== END_OF_DIRECTORY) end--;
  if (end < stop) damaged('it has no end of central directory');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== DIRECTORY_ENTRY) {
      damaged('its central directory ends early');
    }
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = latin1(bytes, at + 46, at + 46 + nameLength);
    if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL_HEADER) {
      damaged(`the entry ${name} has no local header`);
    }
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compressed > bytes.length) damaged(`the entry ${name} ends early`);
    entries.set(name, { method, size, data: bytes.subarray(start, start + compressed) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function markOf(bytes: Uint8Array, at: number): string {
  return latin1(bytes, at, Math.min(bytes.length, at + MARK_LENGTH));
}

function startsWith(bytes: Uint8Array, at: number, text: string): boolean {
  return latin1(bytes, at, Math.min(bytes.length, at + text.length)) === text;
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let text = '';
  for (let i = start; i < end; i++) text += String.fromCharCode(bytes[i] ?? 0);
  return text;
}
