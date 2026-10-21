/// <reference types="node" />
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decodePng,
  parseCaptureRecord,
  parseCorpusManifest,
  type CorpusManifest,
  type CorpusView,
} from '../../src/corpus/index.ts';
import { planCaptures } from '../../src/corpus/driver/plan.ts';
import { playsetProfile } from '../../src/corpus/driver/profile.ts';
import { runCaptures } from '../../src/corpus/driver/run.ts';
import {
  captureView,
  startWindows,
  stepCommand,
  type ViewContext,
} from '../../src/corpus/driver/view.ts';
import { makeTree, removeTree } from '../playset/fixture.ts';
import { FakeGame, type FakeWindow } from './fake-game.ts';

const SIZE = { width: 640, height: 360 };
const EXE = '9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A';
const SAVE_TEXT = 'EU4txt save';

const view = (
  id: string,
  from: 'main-menu' | 'save',
  steps: CorpusView['recipe']['steps'],
  roots: string[],
  verified = false,
): Record<string, unknown> => ({
  id,
  title: id,
  recipe: { from, steps, verified, evidence: 'test' },
  roots,
  codeFilled: [],
});

function testManifest(saveSha: string): CorpusManifest {
  const { manifest, problems } = parseCorpusManifest({
    formatVersion: 1,
    game: { version: '1.37.5', exeSha256: EXE },
    tongs: { version: '0.14.1' },
    uiScale: 1,
    resolutions: [{ width: 640, height: 360, confirmed: true, evidence: 'a small monitor' }],
    codeFilledKinds: [],
    notCovered: [],
    playsets: [
      {
        id: 'vanilla',
        title: 'Vanilla',
        gate: 'release',
        save: { file: 'a.eu4', sha256: saveSha, description: 'a save' },
        mods: [],
        disabledDlcs: [],
        windows: ['frontend', 'ledger'],
      },
    ],
    windows: [
      {
        id: 'frontend',
        title: 'Frontend',
        files: ['interface/frontend.gui'],
        why: 'test',
        views: [
          view('main-menu', 'main-menu', [], ['country_selection_panel'], true),
          view(
            'lobby',
            'main-menu',
            [{ click: 'country_selection_panel//single_player_button' }],
            ['lobby'],
          ),
        ],
      },
      {
        id: 'ledger',
        title: 'Ledger',
        files: ['interface/ledger.gui'],
        why: 'test',
        views: [view('ledger', 'save', [{ key: 'l' }], ['ledger'])],
      },
    ],
    knownDeviations: [],
  });
  expect(problems).toEqual([]);
  return manifest as CorpusManifest;
}

const WINDOWS: FakeWindow[] = [
  { name: 'country_selection_panel', children: ['single_player_button'] },
  { name: 'lobby', openedBy: { click: 'country_selection_panel//single_player_button' } },
  { name: 'topbar' },
  { name: 'ledger', openedBy: { key: 'l' }, children: ['close'] },
];

const trees: string[] = [];
afterEach(async () => {
  await Promise.all(trees.splice(0).map(removeTree));
});

async function sha(text: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text).digest('hex').toUpperCase();
}

function context(
  game: FakeGame,
  manifest: CorpusManifest,
  start: 'main-menu' | 'save',
  windows: string[],
): ViewContext {
  const save = manifest.playsets[0]?.save;
  return {
    ...(start === 'save' && save !== undefined ? { saveSha256: save.sha256 } : {}),
    tongs: game,
    manifest,
    playset: 'vanilla',
    resolution: SIZE,
    start,
    pid: game.pid,
    startWindows: windows,
    exeSha256: EXE,
    tongsVersion: '0.14.1',
    mods: [],
    disabledDlcs: [],
    away: { 'main-menu': { fraction: { x: 1, y: 1 } }, save: { widget: 'topbar' } },
    readFile: async (path) => new Uint8Array(await readFile(path)),
    sleep: () => Promise.resolve(),
    now: () => new Date('2026-10-21T10:00:00Z'),
    log: () => undefined,
  };
}

function viewOf(manifest: CorpusManifest, id: string): CorpusView {
  const found = manifest.windows.flatMap((w) => w.views).find((v) => v.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

describe('stepCommand', () => {
  it('turns a point into client pixels', () => {
    expect(stepCommand({ point: { x: 0.5, y: 1 } }, { width: 1921, height: 1080 })).toBe(
      'click 960 1079',
    );
    expect(stepCommand({ key: 'f1' }, SIZE)).toBe('key f1');
    expect(stepCommand({ click: 'menu//a' }, SIZE)).toBe('ui click menu//a timeout=10');
  });
});

describe('captureView', () => {
  it('runs the recipe, reads the roots and takes two identical shots', async () => {
    const folder = await makeTree({});
    trees.push(folder);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const game = new FakeGame(WINDOWS, ['country_selection_panel'], folder, SIZE);
    const ctx = context(game, manifest, 'main-menu', await startWindows(game));
    const outcome = await captureView(ctx, viewOf(manifest, 'lobby'));
    if (!outcome.ok) throw new Error(outcome.reason);
    const { record } = outcome.capture;
    expect(parseCaptureRecord(JSON.parse(JSON.stringify(record))).problems).toEqual([]);
    expect(record.recipe).toEqual({
      from: 'main-menu',
      steps: [{ click: 'country_selection_panel//single_player_button' }],
      verified: true,
      evidence:
        'Run by the capture driver (etch#42) at 640x360: the steps opened the view and its roots were read.',
    });
    expect(record.screenshot).toMatchObject({ width: 640, height: 360, shots: 2 });
    expect(record.screenshot.unstable).toBeUndefined();
    expect(record.save).toBeUndefined();
    expect(record.widgets).toEqual([
      {
        name: 'lobby',
        path: 'lobby',
        type: 'window',
        visible: true,
        rect: { x: 0, y: 0, w: 2, h: 2 },
      },
    ]);
    expect(outcome.capture.verifiedNow).toBe(true);
    // The pointer rests away from the view before anything is read; no game call is sent.
    const move = game.calls.indexOf('move 639 359');
    expect(move).toBeGreaterThan(
      game.calls.indexOf('ui click country_selection_panel//single_player_button timeout=10'),
    );
    expect(move).toBeLessThan(game.calls.indexOf('ui tree lobby all limit=5000 timeout=30'));
    expect(game.calls.some((c) => c.startsWith('console') || c.includes('reload'))).toBe(false);
  });

  it('takes more shots when two differ and records the unstable pixels', async () => {
    const folder = await makeTree({});
    trees.push(folder);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const game = new FakeGame(WINDOWS, ['country_selection_panel'], folder, SIZE);
    game.pixel = (shot) => (shot === 3 ? 9 : 0);
    const ctx = context(game, manifest, 'main-menu', await startWindows(game));
    const outcome = await captureView(ctx, viewOf(manifest, 'main-menu'));
    if (!outcome.ok) throw new Error(outcome.reason);
    // Shots 1 and 2 agree, so only two are taken; nothing is unstable.
    expect(outcome.capture.record.screenshot.shots).toBe(2);

    game.pixel = (shot) => (shot === 4 ? 9 : 0); // the next view's second shot differs
    const second = await captureView(ctx, viewOf(manifest, 'main-menu'));
    if (!second.ok) throw new Error(second.reason);
    expect(second.capture.record.screenshot.shots).toBe(4);
    expect(second.capture.record.screenshot.unstable?.pixels).toBe(1);
    expect(second.capture.unstableInWidgets).toBe(1);
    const mask = decodePng(second.capture.mask ?? new Uint8Array(0));
    expect([...mask.data.subarray(0, 8)]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });

  it('closes the previous view with Escape and fails a recipe that opens nothing', async () => {
    const folder = await makeTree({});
    trees.push(folder);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const game = new FakeGame(WINDOWS, ['topbar'], folder, SIZE, true);
    const ctx = context(game, manifest, 'save', await startWindows(game));
    game.open.push('ledger'); // left open by an earlier view
    const ledger = viewOf(manifest, 'ledger');
    const outcome = await captureView(ctx, ledger);
    expect(outcome).toMatchObject({ ok: true });
    expect(game.calls.filter((c) => c === 'key escape')).toHaveLength(1);
    // From the save the pointer rests on a widget, away from the map's scrolling edges.
    expect(game.calls).toContain('ui find topbar');
    expect(game.calls).toContain('move 1 1');

    game.open.splice(1);
    const broken = { ...ledger, recipe: { ...ledger.recipe, steps: [{ key: 'k' as const }] } };
    expect(await captureView(ctx, broken)).toEqual({
      view: 'ledger',
      ok: false,
      reason: 'The root ledger is not shown: the recipe did not open the view.',
      lost: false,
    });
  });

  it('leaves map icons and tooltips out of the start state, and fails a view under a tooltip', async () => {
    const folder = await makeTree({});
    trees.push(folder);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const game = new FakeGame(
      WINDOWS,
      ['topbar', 'navy_mapicon[1]', 'ToolTip'],
      folder,
      SIZE,
      true,
    );
    expect(await startWindows(game)).toEqual(['topbar']);
    const ctx = context(game, manifest, 'save', ['topbar']);
    expect(await captureView(ctx, viewOf(manifest, 'ledger'))).toMatchObject({
      ok: false,
      lost: false,
      reason: 'A tooltip is shown (ToolTip); the pointer rests on something that has one.',
    });
  });

  it('presses no Escape when a window of the start state is gone', async () => {
    const folder = await makeTree({});
    trees.push(folder);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const game = new FakeGame(WINDOWS, ['topbar'], folder, SIZE, true);
    const ctx = context(game, manifest, 'save', ['outliner', 'topbar']);
    expect(await captureView(ctx, viewOf(manifest, 'ledger'))).toMatchObject({
      ok: false,
      lost: true,
      retry: true,
      reason: 'The start state lost windows that Escape cannot bring back: missing: outliner.',
    });
    expect(game.calls).not.toContain('key escape');
  });

  it('clicks again a widget that is covered for a moment', async () => {
    const folder = await makeTree({});
    trees.push(folder);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const game = new FakeGame(WINDOWS, ['country_selection_panel'], folder, SIZE);
    game.covered = 2;
    const ctx = context(game, manifest, 'main-menu', await startWindows(game));
    expect(await captureView(ctx, viewOf(manifest, 'lobby'))).toMatchObject({ ok: true });
    expect(game.calls.filter((c) => c.startsWith('ui click'))).toHaveLength(3);
  });

  it('stops the run when the mouse cursor is outside the game window or moves', async () => {
    const folder = await makeTree({});
    trees.push(folder);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const game = new FakeGame(WINDOWS, ['topbar'], folder, SIZE, true);
    const positions = [{ x: 2000, y: 100 }];
    const ctx = {
      ...context(game, manifest, 'save', await startWindows(game)),
      cursor: () => Promise.resolve(positions.shift() ?? { x: 330, y: 180 }),
    };
    expect(await captureView(ctx, viewOf(manifest, 'ledger'))).toMatchObject({
      ok: false,
      stop: true,
      reason: expect.stringContaining('outside the game') as unknown,
    });
    positions.push({ x: 320, y: 180 });
    game.open.splice(1);
    expect(await captureView(ctx, viewOf(manifest, 'ledger'))).toMatchObject({
      ok: false,
      stop: true,
      reason:
        'The mouse cursor moved while the view was captured; leave the mouse alone during a run.',
    });
  });

  it('loses the start state when Escape opens a window, and refuses game calls and an unpaused game', async () => {
    const folder = await makeTree({});
    trees.push(folder);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const game = new FakeGame(WINDOWS, ['topbar'], folder, SIZE, true);
    const ctx = context(game, manifest, 'save', await startWindows(game));
    game.open.push('ledger');
    game.escapeOpens = 'lobby';
    expect(await captureView(ctx, viewOf(manifest, 'ledger'))).toMatchObject({
      ok: false,
      lost: true,
      reason: 'Escape opened lobby instead of closing a window.',
    });

    game.escapeOpens = undefined;
    game.open.splice(1);
    game.gameCalls = 1;
    expect(await captureView(ctx, viewOf(manifest, 'ledger'))).toMatchObject({
      ok: false,
      lost: true,
      reason: '1 game calls were made in this game.',
    });
    game.gameCalls = 0;
    game.paused = false;
    expect(await captureView(ctx, viewOf(manifest, 'ledger'))).toMatchObject({
      ok: false,
      reason: 'The save is not loaded and paused.',
    });
  });
});

describe('runCaptures', () => {
  it('starts the game per session, writes the captures and puts the settings back', async () => {
    const settings =
      'graphics={\n\tsize={\n\t\tx=640\n\t\ty=360\n\t}\n\trefreshRate=60\n\tfullScreen=no\n\tborderless=yes\n}\n';
    const root = await makeTree({
      'sources/settings.txt': settings,
      'sources/workshop/.keep': '',
      'sources/saves/a.eu4': SAVE_TEXT,
      'player/settings.txt': 'player',
      'shots/.keep': '',
    });
    trees.push(root);
    const manifest = testManifest(await sha(SAVE_TEXT));
    const hostDir = join(root, 'host');
    const started: string[] = [];
    const stopped: number[] = [];
    let game: FakeGame | undefined;
    const report = await runCaptures({
      manifest,
      sessions: planCaptures(manifest).sessions,
      hostDir,
      sources: {
        settingsBaseline: join(root, 'sources', 'settings.txt'),
        workshop: join(root, 'sources', 'workshop'),
        saves: join(root, 'sources', 'saves'),
      },
      monitor: SIZE,
      recordsDir: join(root, 'records'),
      localDir: join(root, 'local'),
      playerProfile: join(root, 'player'),
      launcher: {
        check: () => Promise.resolve(EXE),
        async start(profile, save) {
          started.push(save ?? 'menu');
          // The game writes its log and rewrites refreshRate and graceful_exit.
          await writeFile(
            join(profile, 'settings.txt'),
            `${settings.replace('refreshRate=60', 'refreshRate=144')}graceful_exit=no\n`,
          );
          const { mkdir } = await import('node:fs/promises');
          await mkdir(join(profile, 'logs'), { recursive: true });
          await writeFile(join(profile, 'logs', 'system.log'), 'Running application\n');
          game =
            save === undefined
              ? new FakeGame(WINDOWS, ['country_selection_panel'], join(root, 'shots'), SIZE)
              : new FakeGame(WINDOWS, ['topbar'], join(root, 'shots'), SIZE, true);
          return {
            pid: 4242,
            imagePath: 'eu4.exe',
            creationFileTimeUtc: '134370303694736579',
            creationUnixMs: 1000,
          };
        },
        cursor: () => Promise.resolve({ x: 320, y: 180 }),
        stop(record) {
          stopped.push(record.pid);
          return Promise.resolve({ ok: true, outcome: 'terminated' });
        },
      },
      connect: () => Promise.resolve(game as FakeGame),
      format: (json) => Promise.resolve(`${JSON.stringify(JSON.parse(json), null, 2)}\n`),
      sleep: () => Promise.resolve(),
      away: { 'main-menu': { fraction: { x: 1, y: 1 } }, save: { widget: 'topbar' } },
    });

    expect(report.sessions.map((s) => [s.settingsChanges, s.pdxSettingsChanges])).toEqual([
      [[], []],
      [[], []],
    ]);
    expect(report.stopped).toBeUndefined();
    expect(started).toEqual(['menu', 'a.eu4']);
    expect(stopped).toEqual([4242, 4242]);
    expect(report.sessions.map((s) => s.views.map((v) => `${v.view} ${String(v.ok)}`))).toEqual([
      ['main-menu true', 'lobby true'],
      ['ledger true'],
    ]);
    expect(
      report.sessions.every((s) => s.baselinesRestored && s.settingsChanges.length === 0),
    ).toBe(true);
    const { profile } = playsetProfile(hostDir, 'vanilla');
    expect(await readFile(join(profile, 'settings.txt'), 'utf8')).toBe(settings);
    await expect(readFile(join(profile, 'pdx_settings.txt'))).rejects.toThrow();
    const record = JSON.parse(
      await readFile(
        join(root, 'records', 'captures', 'vanilla', '640x360', 'ledger.json'),
        'utf8',
      ),
    ) as { save: unknown };
    expect(record.save).toEqual({ sha256: await sha(SAVE_TEXT) });
    expect(
      (await readFile(join(root, 'local', 'captures', 'vanilla', '640x360', 'ledger.png'))).length,
    ).toBeGreaterThan(0);
  });
});
