// The DLC archives the game reads (ADR 0009): each `dlc/<folder>/<name>.dlc` and
// `builtin_dlc/<folder>/<name>.dlc` of the game folder names its `archive`, and the player's
// `dlc_load.json` lists the DLCs turned off in `disabled_dlcs`. Ownership is not read. Only read.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeDescriptor } from './descriptor.ts';
import { parseScript } from '../script/index.ts';

/** One DLC whose archive the playset reads. */
export interface DlcArchive {
  /** The descriptor's `name`, such as `Conquest of Paradise`. */
  readonly name: string;
  /** The descriptor's path relative to the game folder, with `/`: `dlc/dlc010_…/dlc010.dlc`. */
  readonly descriptor: string;
  /** The archive's absolute path. */
  readonly archive: string;
}

const KINDS = ['builtin_dlc', 'dlc'] as const;

/**
 * The DLC archives of a game folder that `disabled` does not name, in the order the playset reads
 * them: `builtin_dlc` first, then `dlc`, each by folder name. A descriptor whose archive is missing
 * is left out.
 */
export async function findDlcArchives(
  gameFolder: string,
  disabled: readonly string[],
): Promise<DlcArchive[]> {
  const off = new Set(disabled.map(dlcKey));
  const found: DlcArchive[] = [];
  for (const kind of KINDS) {
    const folders = await readdir(join(gameFolder, kind), { withFileTypes: true }).catch(() => []);
    const names = folders
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort((a, b) => compare(a.toLowerCase(), b.toLowerCase()));
    for (const folder of names) {
      const files = await readdir(join(gameFolder, kind, folder)).catch(() => [] as string[]);
      for (const file of files.filter((f) => f.toLowerCase().endsWith('.dlc')).sort(compare)) {
        const descriptor = `${kind}/${folder}/${file}`;
        if (off.has(dlcKey(descriptor)) || off.has(dlcKey(`${kind}/${folder}`))) continue;
        const dlc = await readDescriptor(gameFolder, descriptor);
        if (dlc !== undefined) found.push(dlc);
      }
    }
  }
  return found;
}

/** `disabled_dlcs` of the player's `dlc_load.json`; empty when there is no readable file. */
export async function readDisabledDlcs(profileFolder: string | undefined): Promise<string[]> {
  if (profileFolder === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(
      await readFile(join(profileFolder, 'dlc_load.json'), 'utf8'),
    );
    const list = (parsed as { disabled_dlcs?: unknown }).disabled_dlcs;
    return Array.isArray(list) ? list.filter((e): e is string => typeof e === 'string') : [];
  } catch {
    return [];
  }
}

async function readDescriptor(
  gameFolder: string,
  descriptor: string,
): Promise<DlcArchive | undefined> {
  const bytes = await readFile(join(gameFolder, ...descriptor.split('/'))).catch(() => undefined);
  if (bytes === undefined) return undefined;
  let name: string | undefined;
  let archive: string | undefined;
  for (const entry of parseScript(decodeDescriptor(bytes)).entries) {
    if (entry.kind !== 'property' || entry.value === undefined || entry.value.kind === 'block') {
      continue;
    }
    const key = entry.key.text.toLowerCase();
    if (key === 'name') name = entry.value.text;
    if (key === 'archive') archive = entry.value.text;
  }
  if (archive === undefined) return undefined;
  const parts = archive.split(/[\\/]+/).filter((p) => p !== '' && p !== '.');
  if (parts.includes('..')) return undefined;
  const path = join(gameFolder, ...parts);
  const present = await stat(path).then(
    (s) => s.isFile(),
    () => false,
  );
  return present ? { name: name ?? descriptor, descriptor, archive: path } : undefined;
}

/** A `disabled_dlcs` entry or a descriptor path, compared without regard to case and separator. */
function dlcKey(path: string): string {
  return path
    .split(/[\\/]+/)
    .filter((p) => p !== '')
    .join('/')
    .toLowerCase();
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
