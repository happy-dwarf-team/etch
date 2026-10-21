/**
 * The corpus on disk (etch#41). The repository's `corpus/` folder holds the text: `manifest.json`
 * and the capture records under `captures/`. The screenshots stay in the local corpus folder
 * outside Git, named by `ETCH_CORPUS_PATH`, at the same relative paths with `.png`.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseCaptureRecord, type CaptureResult } from './capture.ts';
import {
  capturePath,
  parseCorpusManifest,
  type CaptureKey,
  type ManifestResult,
} from './manifest.ts';

/** The environment variable that names the local corpus folder. */
export const CORPUS_PATH_VARIABLE = 'ETCH_CORPUS_PATH';

/**
 * The local corpus folder from `ETCH_CORPUS_PATH`, or `undefined` when it is not set. It must be
 * an absolute path outside the repository, so that no screenshot can be committed.
 */
export function localCorpusFolder(
  env: Readonly<Record<string, string | undefined>>,
  repositoryRoot: string,
): string | undefined {
  const value = env[CORPUS_PATH_VARIABLE]?.trim();
  if (value === undefined || value === '') return undefined;
  if (!isAbsolute(value)) {
    throw new Error(`${CORPUS_PATH_VARIABLE} must be an absolute path: ${value}`);
  }
  const inside = relative(resolve(repositoryRoot), resolve(value));
  if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
    throw new Error(`${CORPUS_PATH_VARIABLE} must be outside the repository: ${value}`);
  }
  return resolve(value);
}

/** The capture record of a capture in the repository's `corpus/` folder. */
export function captureRecordFile(corpusFolder: string, key: CaptureKey): string {
  return join(corpusFolder, ...`${capturePath(key)}.json`.split('/'));
}

/** The screenshot of a capture in the local corpus folder. */
export function screenshotFile(localFolder: string, key: CaptureKey): string {
  return join(localFolder, ...`${capturePath(key)}.png`.split('/'));
}

/** The unstable mask of a capture's screenshot in the local corpus folder (`CapturedScreenshot`). */
export function unstableMaskFile(localFolder: string, key: CaptureKey): string {
  return join(localFolder, ...`${capturePath(key)}.unstable.png`.split('/'));
}

export async function readCorpusManifest(file: string): Promise<ManifestResult> {
  return parseCorpusManifest(JSON.parse(await readFile(file, 'utf8')) as unknown);
}

export async function readCaptureRecord(file: string): Promise<CaptureResult> {
  return parseCaptureRecord(JSON.parse(await readFile(file, 'utf8')) as unknown);
}

/** The capture records under a `corpus/` folder, as `/`-separated paths relative to it. */
export async function listCaptureRecords(corpusFolder: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (folder: string, prefix: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(folder, entry.name), path);
      else if (entry.name.endsWith('.json')) found.push(path);
    }
  };
  await walk(join(corpusFolder, 'captures'), 'captures');
  return found.sort();
}

/** SHA-256 of a file, uppercase hex. */
export async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex').toUpperCase();
}

/**
 * The content hash that pins a mod: SHA-256, uppercase hex, of one line per file under the mod
 * folder, `<file SHA-256> <path>\n`, with `/`-separated paths relative to the folder, sorted by
 * their UTF-16 code units. It changes when any file is added, removed, renamed or changed, and
 * does not depend on timestamps or on the folder's own location.
 */
export async function hashModFolder(folder: string): Promise<string> {
  const files: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(dir, entry.name), path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await walk(folder, '');
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const listing = createHash('sha256');
  for (const path of files) {
    listing.update(`${await hashFile(join(folder, ...path.split('/')))} ${path}\n`);
  }
  return listing.digest('hex').toUpperCase();
}
