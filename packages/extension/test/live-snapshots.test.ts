import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LiveSnapshots, playsetKey, snapshotOf } from '../src/preview/live-snapshots.ts';
import type { SnapshotAnswer } from '../src/live-game/pipe.ts';

let temp: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'etch-snapshots-'));
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const answer: SnapshotAnswer = {
  window: 'provinceview',
  file: 'interface/provinceview.gui',
  screen: { width: 3440, height: 1440 },
  widgets: [
    {
      path: 'provinceview',
      type: 'window',
      visible: true,
      enabled: true,
      checked: false,
      text: undefined,
      rect: [0, 0, 9, 9],
    },
    {
      path: 'provinceview/rows',
      type: 'listbox',
      visible: true,
      enabled: true,
      checked: false,
      text: undefined,
      rect: [0, 0, 9, 9],
    },
    {
      path: 'provinceview/rows/item[1]',
      type: 'window',
      visible: true,
      enabled: true,
      checked: false,
      text: undefined,
      rect: [0, 0, 9, 9],
    },
    {
      path: 'provinceview/rows/item[1]/name',
      type: 'text',
      visible: true,
      enabled: true,
      checked: false,
      text: 'Swedish',
      rect: [0, 0, 9, 9],
    },
  ],
  stale: 2,
  readMs: 7,
};

describe('LiveSnapshots', () => {
  it('keeps the latest snapshot per window and playset in the workspace storage', async () => {
    const snapshot = snapshotOf(answer, {
      takenAt: new Date('2026-10-27T06:00:00Z'),
      save: 'Russia1719.eu4',
      fileHash: 'ab',
      game: { pid: 1, startMs: 2 },
    });
    expect(snapshot.widgets.map((w) => w.path)).toContain('provinceview/rows/row[1]/name');
    expect(snapshot).toMatchObject({ formatVersion: 1, save: 'Russia1719.eu4', stale: 2 });
    const vanilla = playsetKey('C:/Game', []);
    const anbennar = playsetKey('C:/Game', ['Anbennar']);
    expect(vanilla).not.toBe(anbennar);

    const store = new LiveSnapshots(temp);
    await store.put(vanilla, snapshot);
    expect((await new LiveSnapshots(temp).get(vanilla, 'ProvinceView'))?.takenAt).toBe(
      '2026-10-27T06:00:00.000Z',
    );
    // A snapshot of another playset drops this playset's.
    await store.put(anbennar, snapshot);
    expect(await readdir(join(temp, 'live-snapshots'))).toEqual([anbennar]);
    expect(await new LiveSnapshots(temp).get(vanilla, 'provinceview')).toBeUndefined();
    await store.drop(anbennar, 'provinceview');
    expect(await store.get(anbennar, 'provinceview')).toBeUndefined();
  });

  it('keeps snapshots in memory without a workspace', async () => {
    const store = new LiveSnapshots(undefined);
    const snapshot = snapshotOf(answer, {
      takenAt: new Date(),
      save: undefined,
      fileHash: undefined,
      game: undefined,
    });
    await store.put('x', snapshot);
    expect(await store.get('x', 'provinceview')).toBe(snapshot);
  });
});
