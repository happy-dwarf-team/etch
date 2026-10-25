import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writePreviewCopy, type PreviewCopyFile } from '@etch/core';
import {
  JobQueue,
  captureFile,
  mergeChanges,
  pruneCaptures,
  runJob,
  type JobChange,
  type JobOutcome,
  type JobTarget,
} from '../src/game-host/jobs.ts';
import { PipeError } from '../src/game-host/pipe.ts';

const copy = writePreviewCopy({
  path: 'interface/goto.gui',
  text: 'guiTypes = {\n\twindowType = {\n\t\tname = "goto_box"\n\t\tposition = { x = 165 y = 215 }\n\t}\n}\n',
  window: 'goto_box',
  screen: { width: 1920, height: 1080 },
});
const copies = copy.files as readonly [PreviewCopyFile, PreviewCopyFile];

function change(tag: number, more: Partial<JobChange> = {}): JobChange {
  return {
    copies,
    crop: { x: 165, y: 215, width: 333, height: 454 },
    textures: [],
    localisation: false,
    requestedAt: 1000 + tag,
    tag,
    ...more,
  };
}

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'etch-jobs-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('runJob', () => {
  it('writes both copies into the overlay mod and sends one job', async () => {
    const sent: Record<string, unknown>[] = [];
    const target: JobTarget = {
      overlayFolder: join(folder, 'overlay'),
      capturesFolder: join(folder, 'captures'),
      request: (body) => {
        sent.push(body);
        return Promise.resolve({
          ok: true,
          output: body['output'],
          crop: { x: 165, y: 215, width: 300, height: 454 },
          frames: { black: 10, white: 11 },
          ms: { queued: 1, commands: 20, black: 6, white: 7, recover: 1, write: 1, total: 40 },
          commands: [
            { line: 'reload etch_goto.gui', success: true, text: 'etch_goto.gui reloaded!', ms: 8 },
          ],
        });
      },
    };
    const outcome = await runJob(
      target,
      change(3, { textures: ['gfx//interface//x.tga'], localisation: true }),
      7,
    );
    expect(await readFile(join(folder, 'overlay', 'interface', 'etch_goto.gui'), 'latin1')).toBe(
      copies[0].text,
    );
    expect(await readFile(join(folder, 'overlay', 'interface', 'etchw_goto.gui'), 'latin1')).toBe(
      copies[1].text,
    );
    expect(sent).toEqual([
      {
        type: 'job',
        reload: ['etch_goto.gui', 'etchw_goto.gui'],
        textures: ['gfx//interface//x.tga'],
        localisation: true,
        black: 'etch_goto_box_backdrop',
        white: 'etchw_goto_box_backdrop',
        crop: { x: 165, y: 215, width: 333, height: 454 },
        output: captureFile(join(folder, 'captures'), 7),
      },
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.job).toBe(7);
    expect(outcome.tag).toBe(3);
    expect(outcome.image).toEqual({
      path: captureFile(join(folder, 'captures'), 7),
      crop: { x: 165, y: 215, width: 300, height: 454 },
    });
    expect(outcome.frames).toEqual({ black: 10, white: 11 });
    expect(outcome.plugin.total).toBe(40);
    expect(outcome.commands).toHaveLength(1);
  });

  it('reports a failed job with the commands the plugin ran', async () => {
    const target: JobTarget = {
      overlayFolder: folder,
      capturesFolder: folder,
      request: () =>
        Promise.reject(
          new PipeError(
            'reload_failed',
            '"reload etch_goto.gui" answered: Failed to reload the file',
            {
              ok: false,
              error: 'reload_failed',
              commands: [{ line: 'reload etch_goto.gui', success: false, text: 'Failed', ms: 3 }],
            },
          ),
        ),
    };
    const outcome = await runJob(target, change(1), 1);
    expect(outcome).toMatchObject({ ok: false, code: 'reload_failed', job: 1, tag: 1 });
    expect(outcome.commands).toHaveLength(1);
  });

  it('asks again while the plugin still runs a job Etch stopped waiting for', async () => {
    let calls = 0;
    const target: JobTarget = {
      overlayFolder: folder,
      capturesFolder: folder,
      request: (body) => {
        calls++;
        if (calls < 3) return Promise.reject(new PipeError('busy', 'a preview job is running'));
        return Promise.resolve({ ok: true, output: body['output'], ms: {}, commands: [] });
      },
    };
    const outcome = await runJob(target, change(1), 1);
    expect(outcome.ok).toBe(true);
    expect(calls).toBe(3);
  });
});

describe('JobQueue', () => {
  it('runs one job at a time and coalesces the changes that come meanwhile', async () => {
    const started: { change: JobChange; job: number; finish: () => void }[] = [];
    const done: JobOutcome[] = [];
    const queue = new JobQueue(
      (c, job) =>
        new Promise((resolve) => {
          started.push({
            change: c,
            job,
            finish: () => {
              resolve({
                ok: false,
                code: 'test',
                message: '',
                job,
                tag: c.tag,
                requestedAt: c.requestedAt,
                commands: [],
              });
            },
          });
        }),
      (outcome) => done.push(outcome),
    );
    queue.submit(change(1));
    queue.submit(change(2, { textures: ['a.dds'] }));
    queue.submit(change(3, { textures: ['b.dds', 'a.dds'], localisation: true }));
    expect(started).toHaveLength(1);
    expect(started[0]?.change.tag).toBe(1);
    started[0]?.finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toHaveLength(2);
    expect(started[1]?.job).toBe(2);
    expect(started[1]?.change).toMatchObject({
      tag: 3,
      textures: ['a.dds', 'b.dds'],
      localisation: true,
      requestedAt: 1002,
    });
    started[1]?.finish();
    await queue.idle();
    expect(done.map((o) => o.tag)).toEqual([1, 3]);
  });

  it('turns a job that throws into a failed outcome and goes on', async () => {
    const done: JobOutcome[] = [];
    const queue = new JobQueue(
      () => Promise.reject(new Error('disk full')),
      (outcome) => done.push(outcome),
    );
    queue.submit(change(5));
    await queue.idle();
    expect(done).toMatchObject([{ ok: false, code: 'error', message: 'disk full', tag: 5 }]);
  });

  it('reports nothing after it is disposed', async () => {
    const done: JobOutcome[] = [];
    let finish: () => void = () => undefined;
    const queue = new JobQueue(
      (c, job) =>
        new Promise((resolve) => {
          finish = () => {
            resolve({
              ok: false,
              code: 'test',
              message: '',
              job,
              tag: c.tag,
              requestedAt: 0,
              commands: [],
            });
          };
        }),
      (outcome) => done.push(outcome),
    );
    queue.submit(change(1));
    queue.submit(change(2));
    queue.dispose();
    finish();
    await queue.idle();
    expect(done).toEqual([]);
  });
});

describe('mergeChanges', () => {
  it('keeps the later copy and crop', () => {
    const merged = mergeChanges(
      change(1),
      change(2, { crop: { x: 0, y: 0, width: 1, height: 1 } }),
    );
    expect(merged.tag).toBe(2);
    expect(merged.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('pruneCaptures', () => {
  it('deletes images except the kept ones', async () => {
    for (const job of [1, 2, 3]) await writeFile(captureFile(folder, job), 'x');
    await writeFile(join(folder, 'notes.txt'), 'x');
    await pruneCaptures(folder, [captureFile(folder, 2), captureFile(folder, 3)]);
    expect((await readdir(folder)).sort()).toEqual(['job-2.tga', 'job-3.tga', 'notes.txt']);
  });
});
