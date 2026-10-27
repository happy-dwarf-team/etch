// Live snapshots kept for the preview (spec section 7, etch#170): the latest per top-level window
// and playset, in the extension's workspace storage, never in the mod's project, never shared or
// exported. A snapshot of another playset is dropped when one of this playset is kept; one whose
// window the playset no longer defines is dropped by the preview. Node only, no vscode.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { liveWidgetsOf, readLiveSnapshot, type LiveSnapshot } from '@etch/core/profile';
import type { SnapshotAnswer } from '../live-game/pipe.ts';

/** What a snapshot records besides the widgets. */
export interface SnapshotMeta {
  readonly takenAt: Date;
  readonly save: string | undefined;
  readonly fileHash: string | undefined;
  readonly game: { readonly pid: number; readonly startMs: number } | undefined;
}

/** The plugin's answer as a stored snapshot, with list rows by position. */
export function snapshotOf(answer: SnapshotAnswer, meta: SnapshotMeta): LiveSnapshot {
  return {
    formatVersion: 1,
    window: answer.window,
    takenAt: meta.takenAt.toISOString(),
    ...(meta.save === undefined ? {} : { save: meta.save }),
    ...(meta.fileHash === undefined ? {} : { fileHash: meta.fileHash }),
    ...(meta.game === undefined ? {} : { game: meta.game }),
    screen: answer.screen,
    widgets: liveWidgetsOf(answer.widgets),
    stale: answer.stale,
  };
}

/** A key of a playset: its game folder and mods in load order. */
export function playsetKey(gameFolder: string | undefined, mods: readonly string[]): string {
  return createHash('sha256')
    .update([gameFolder ?? '', ...mods].join('\n').toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

export class LiveSnapshots {
  private readonly folder: string | undefined;
  private readonly cache = new Map<string, LiveSnapshot | null>();

  /** `folder` is the workspace storage; without one (no workspace) snapshots live in memory. */
  constructor(folder: string | undefined) {
    this.folder = folder === undefined ? undefined : join(folder, 'live-snapshots');
  }

  /** The latest snapshot of a window in a playset. */
  async get(playset: string, window: string): Promise<LiveSnapshot | undefined> {
    const key = cacheKey(playset, window);
    const known = this.cache.get(key);
    if (known !== undefined) return known ?? undefined;
    const file = this.file(playset, window);
    const read =
      file === undefined
        ? undefined
        : await readFile(file, 'utf8').then(
            (text) => readLiveSnapshot(JSON.parse(text) as unknown),
            () => undefined,
          );
    this.cache.set(key, read ?? null);
    return read;
  }

  /** Keeps a snapshot as its window's latest; snapshots of other playsets are dropped. */
  async put(playset: string, snapshot: LiveSnapshot): Promise<void> {
    this.cache.set(cacheKey(playset, snapshot.window), snapshot);
    if (this.folder === undefined) return;
    const others = await readdir(this.folder).catch(() => [] as string[]);
    for (const other of others) {
      if (other !== playset) await rm(join(this.folder, other), { recursive: true, force: true });
    }
    for (const key of [...this.cache.keys()]) {
      if (!key.startsWith(`${playset}|`)) this.cache.delete(key);
    }
    const file = this.file(playset, snapshot.window);
    if (file === undefined) return;
    await mkdir(join(this.folder, playset), { recursive: true });
    await writeFile(file, JSON.stringify(snapshot));
  }

  /** Drops a window's snapshot, such as one whose window no longer exists. */
  async drop(playset: string, window: string): Promise<void> {
    this.cache.set(cacheKey(playset, window), null);
    const file = this.file(playset, window);
    if (file !== undefined) await rm(file, { force: true });
  }

  private file(playset: string, window: string): string | undefined {
    if (this.folder === undefined) return undefined;
    const name = window.toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
    return join(this.folder, playset, `${name}.json`);
  }
}

function cacheKey(playset: string, window: string): string {
  return `${playset}|${window.toLowerCase()}`;
}
