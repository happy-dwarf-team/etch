/// <reference types="node" />
// The capture driver's commands (`command.ts`) without a game: `plan` and `survey-manifest` on the
// repository's manifest and survey, and `run` and `crawl` with nothing to capture, under a game
// lock of fake-lab.psm1 in a temp lab (the machine's own lab lock is never touched).
import { realpathSync } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCommand } from '../../src/corpus/driver/command.ts';
import { GAME_LOCK_VARIABLE } from '../../src/corpus/driver/game-script.ts';
import { makeTree, removeTree } from '../playset/fixture.ts';

const trees: string[] = [];
let lines: string[] = [];
let outer: string | undefined;
beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  outer = process.env[GAME_LOCK_VARIABLE];
  Reflect.deleteProperty(process.env, GAME_LOCK_VARIABLE);
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (outer === undefined) Reflect.deleteProperty(process.env, GAME_LOCK_VARIABLE);
  else process.env[GAME_LOCK_VARIABLE] = outer;
  await Promise.all(trees.splice(0).map(removeTree));
});

/** A temp folder outside the repository, with the given files. */
async function tree(files: Record<string, string>): Promise<string> {
  const root = await makeTree(files);
  trees.push(root);
  return realpathSync.native(root);
}

/** A temp lab whose LabProcess.psm1 is fake-lab.psm1, and the names of the calls it got. */
async function fakeLab(root: string): Promise<{ lab: string; calls: () => Promise<string[]> }> {
  const lab = join(root, 'lab');
  await mkdir(join(lab, 'scripts', 'lib'), { recursive: true });
  await mkdir(join(lab, 'work'), { recursive: true });
  await copyFile(
    join(import.meta.dirname, 'fake-lab.psm1'),
    join(lab, 'scripts', 'lib', 'LabProcess.psm1'),
  );
  return {
    lab,
    calls: async () =>
      (await readFile(join(lab, 'work', 'calls.jsonl'), 'utf8').catch(() => ''))
        .split(/\r?\n/)
        .filter((line) => line !== '')
        .map((line) => (JSON.parse(line) as { call: string }).call),
  };
}

describe('the capture driver commands', () => {
  it('plans the sessions of a playset, and shows the usage for an unknown command', async () => {
    expect(
      await runCommand(['plan', '--playset', 'vanilla', '--resolution', '1920x1080'], {}),
    ).toBe(0);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.includes('vanilla'))).toBe(true);
    lines = [];
    expect(await runCommand(['help'], {})).toBe(0);
    expect(lines).toEqual([
      'Usage: cli.ts plan|run [options]; see the top of cli.ts and corpus/README.md.',
    ]);
  });

  it('refuses a manifest with problems, and a run without its folders', async () => {
    const root = await tree({ 'bad.json': '{"playsets": 3}' });
    await expect(runCommand(['plan', '--manifest', join(root, 'bad.json')], {})).rejects.toThrow(
      /^The manifest has problems: /,
    );
    await expect(runCommand(['run'], {})).rejects.toThrow(
      'Set ETCH_CORPUS_PATH to the local corpus folder.',
    );
    await expect(runCommand(['run'], { ETCH_CORPUS_PATH: root })).rejects.toThrow(/--lab/);
    await expect(runCommand(['crawl'], {})).rejects.toThrow(
      "Set ETCH_CORPUS_PATH to the survey's local folder.",
    );
    await expect(runCommand(['crawl'], { ETCH_CORPUS_PATH: root })).rejects.toThrow(/--lab/);
  });

  it('writes an empty survey manifest before the first crawl', async () => {
    const root = await tree({
      'game/interface/a.gui': 'guiTypes = { windowType = { name = "my_window" } }\n',
      'game/interface/readme.txt': 'not a .gui\n',
      'local/.keep': '',
    });
    const local = join(root, 'local');
    const code = await runCommand(['survey-manifest', '--workshop', join(root, 'workshop')], {
      ETCH_CORPUS_PATH: local,
      ETCH_GAME_PATH: join(root, 'game'),
    });
    // No crawl yet: no view, and each crawled playset's start is named.
    expect(lines).toContain('no crawl of vanilla from save');
    expect(lines).toContain('no crawl of vanilla from main-menu');
    const written = JSON.parse(await readFile(join(local, 'manifest.json'), 'utf8')) as {
      windows: unknown[];
    };
    expect(written.windows).toEqual([]);
    expect(lines.at(-1)).toBe(`0 views in ${join(local, 'manifest.json')}`);
    // A manifest without views is one with problems, which the command reports and fails on.
    expect(lines).toContain('manifest problem at windows: Expected at least one item.');
    expect(code).toBe(1);
  });
});

describe.runIf(process.platform === 'win32')('the driver commands under a fake lab', () => {
  it('runs nothing to capture under its own lock, and takes its Ctrl+C handlers off', async () => {
    const root = await tree({ 'host/.keep': '', 'local/.keep': '', 'settings.txt': '' });
    const { lab, calls } = await fakeLab(root);
    const signals = process.listenerCount('SIGINT');
    const code = await runCommand(
      [
        'run',
        '--lab',
        lab,
        '--host',
        join(root, 'host'),
        '--monitor',
        '1920x1080',
        '--settings-baseline',
        join(root, 'settings.txt'),
        // A size the corpus has not confirmed: the plan skips it, and no game starts.
        '--playset',
        'vanilla',
        '--resolution',
        '3840x2160',
        '--lock-minutes',
        '30',
      ],
      { ETCH_CORPUS_PATH: join(root, 'local') },
    );
    expect(code).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(signals);
    expect(await calls()).toEqual(['Enter-LabGameLock', 'Exit-LabGameLock']);
    expect(lines[0]).toMatch(/^game lock: held until /);
    const summary = lines.find((line) => line.startsWith('run '));
    expect(summary).toMatch(/: 0 captured, 0 failed, 0 not tried$/);
    const runId = /^run (\S+):/.exec(summary ?? '')?.[1] ?? '';
    const report = JSON.parse(
      await readFile(join(root, 'local', 'runs', runId, 'report.json'), 'utf8'),
    ) as { sessions: unknown[] };
    expect(report.sessions).toEqual([]);
  }, 60_000);

  it('crawls no playset the filter leaves out, under its own lock', async () => {
    const root = await tree({ 'host/.keep': '', 'local/.keep': '' });
    const { lab, calls } = await fakeLab(root);
    const signals = process.listenerCount('SIGINT');
    const code = await runCommand(
      ['crawl', '--lab', lab, '--host', join(root, 'host'), '--playset', 'no_such_playset'],
      { ETCH_CORPUS_PATH: join(root, 'local') },
    );
    expect(code).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(signals);
    expect(await calls()).toEqual(['Enter-LabGameLock', 'Exit-LabGameLock']);
    expect(lines[0]).toMatch(/^game lock until /);
  }, 60_000);
});
