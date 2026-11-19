/// <reference types="node" />
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CorpusManifest } from '../../src/corpus/index.ts';
import {
  crawlGame,
  LED_ELSEWHERE,
  newCrawlFile,
  readCrawlFile,
  writeCrawlFile,
  type CrawlFile,
  type CrawlRules,
} from '../../src/corpus/driver/crawl.ts';
import type { ViewContext } from '../../src/corpus/driver/view.ts';
import { CrawlGame, FakeGame, type FakeWindow } from './fake-game.ts';

const RULES: CrawlRules = {
  maxDepth: 2,
  keys: [],
  provinces: [],
  never: [],
  sessionMinutes: 30,
};

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function context(
  game: FakeGame,
  start: 'main-menu' | 'save',
  windows: readonly string[],
  log: Record<string, unknown>[] = [],
  now: () => Date = () => new Date('2026-11-18T06:00:00Z'),
): ViewContext {
  return {
    tongs: game,
    manifest: {} as CorpusManifest,
    playset: 'vanilla',
    resolution: { width: 640, height: 360 },
    start,
    pid: game.pid,
    startWindows: [...windows].sort(),
    exeSha256: 'EXE',
    tongsVersion: '0.21.0',
    mods: [],
    disabledDlcs: [],
    away: { 'main-menu': { fraction: { x: 1, y: 1 } }, save: { widget: 'topbar' } },
    readFile: () => Promise.reject(new Error('no files')),
    sleep: () => Promise.resolve(),
    now,
    log: (event) => {
      log.push({ ...event });
    },
  };
}

/** A crawl of one game, with every saved copy of the crawl file. */
async function crawlOnce(
  ctx: ViewContext,
  rules: CrawlRules,
  crawl: CrawlFile = newCrawlFile('vanilla', '640x360', ctx.start),
): Promise<{ restart: boolean; crawl: CrawlFile; saves: number }> {
  let saves = 0;
  const { restart } = await crawlGame(ctx, crawl, rules, () => {
    saves++;
    return Promise.resolve();
  });
  return { restart, crawl, saves };
}

describe('crawlGame', () => {
  it('opens each view once, by keys and buttons, and records what each candidate did', async () => {
    const windows: FakeWindow[] = [
      { name: 'menu', children: ['z', 'a', 'b', 'greyed', 'quit'] },
      { name: 'country', openedBy: { key: 'f1' }, children: ['close'] },
      { name: 'wa', children: ['x'] },
    ];
    const game = new CrawlGame(windows, ['menu'], '.');
    game.covered = 1;
    game.onClick = (selector): void => {
      if (selector === 'menu/a' && !game.open.includes('wa')) game.open.push('wa');
      if (selector === 'country/close') game.open.splice(game.open.indexOf('country'), 1);
    };
    const rules: CrawlRules = {
      ...RULES,
      keys: ['f1'],
      never: [{ pattern: 'menu/quit', reason: 'It quits the game.' }],
    };
    const { restart, crawl } = await crawlOnce(context(game, 'main-menu', ['menu']), rules);

    expect(restart).toBe(false);
    expect(crawl.done).toBe(true);
    expect(crawl.starts).toBe(1);
    expect(crawl.states.map((s) => [s.id, s.signature, s.depth, s.explored])).toEqual([
      ['s0', 'menu', 0, true],
      ['s1', 'country\nmenu', 1, true],
      ['s2', 'menu\nwa', 1, true],
    ]);
    expect(crawl.states[0]?.roots).toEqual(['menu']);
    expect(crawl.states[1]?.steps).toEqual([{ key: 'f1' }]);
    expect(crawl.states[1]?.roots).toEqual(['country']);
    expect(crawl.states[2]?.steps).toEqual([{ click: 'menu/a' }]);
    expect(crawl.tried).toEqual({
      'key f1': { kind: 'opened', state: 's1' },
      'click menu/z': { kind: 'refused', error: 'covered' },
      'click menu/a': { kind: 'opened', state: 's2' },
      'click menu/b': { kind: 'same' },
      'click country/close': { kind: 'known', state: 's0' },
      'click wa/x': { kind: 'same' },
    });
    // A greyed-out button is no candidate, and a `never` pattern counts what it kept out.
    expect(Object.keys(crawl.tried).some((c) => c.includes('greyed'))).toBe(false);
    expect(crawl.skipped).toEqual({ 'menu/quit': 3 });
    // The pointer rests at the client area's bottom-right pixel before each signature.
    expect(game.calls).toContain('move 3 1');
  });

  it('keeps a view one step deeper than allowed as a signature, not a state', async () => {
    const windows: FakeWindow[] = [
      { name: 'menu', children: ['a'] },
      { name: 'wa', children: [] },
    ];
    const game = new CrawlGame(windows, ['menu'], '.');
    game.onClick = (): void => {
      if (!game.open.includes('wa')) game.open.push('wa');
    };
    const { crawl } = await crawlOnce(context(game, 'main-menu', ['menu']), {
      ...RULES,
      maxDepth: 0,
    });
    expect(crawl.states).toHaveLength(1);
    expect(crawl.tried['click menu/a']).toEqual({ kind: 'deeper', signature: 'menu\nwa' });
    expect(crawl.done).toBe(true);
  });

  it('reads provinces of each kind from a save and opens them from the start state', async () => {
    const windows: FakeWindow[] = [
      { name: 'topbar', children: [] },
      { name: 'provinceview', children: [] },
    ];
    const game = new CrawlGame(windows, ['topbar'], '.', { width: 4, height: 2 }, true);
    game.provinces.set(1, { ok: true, land: true, owner: 'RUS' });
    game.provinces.set(2, { ok: true, land: true, owner: 'SWE' });
    game.provinces.set(3, { ok: true, land: false, owner: null });
    game.provinces.set(4, { ok: true, land: true, wasteland: true, owner: null });
    game.provinces.set(5, { ok: true, land: true, owner: null });
    game.provinceViews.set(1, 'provinceview');
    game.provinceViews.set(3, 'provinceview');
    const log: Record<string, unknown>[] = [];
    const { crawl } = await crawlOnce(context(game, 'save', ['topbar'], log), {
      ...RULES,
      provinces: ['own', 'sea'],
    });

    expect(crawl.provinces).toEqual({ own: [1], sea: [3] });
    expect(log).toContainEqual({ provinces: { own: [1], sea: [3] } });
    expect(crawl.tried['province 1']).toEqual({ kind: 'opened', state: 's1' });
    expect(crawl.tried['province 3']).toEqual({ kind: 'known', state: 's1' });
    expect(crawl.states[1]?.steps).toEqual([{ province: 1 }]);
    // Fifty ids in a row without a province end the search.
    expect(game.calls.filter((c) => /^province \d+$/.test(c))).toHaveLength(55);
    // The fingerprint holds the state's fields, the player and the top bar's texts.
    const start = log.find((e) => e['crawl'] === 'start');
    expect(start?.['fingerprint']).toMatchObject({
      in_game: 'true',
      paused: 'true',
      player: 'RUS',
    });
  });

  it('stops at a click that changes the game state and asks for a fresh start', async () => {
    const windows: FakeWindow[] = [{ name: 'topbar', children: ['play', 'other'] }];
    const game = new CrawlGame(windows, ['topbar'], '.', { width: 4, height: 2 }, true);
    game.onClick = (selector): void => {
      if (selector === 'topbar/play') game.paused = false;
    };
    const { restart, crawl } = await crawlOnce(context(game, 'save', ['topbar']), RULES);
    expect(restart).toBe(true);
    expect(crawl.done).toBe(false);
    expect(crawl.tried['click topbar/play']).toEqual({
      kind: 'state-changed',
      change: 'paused: true -> false',
    });
    expect(crawl.tried['click topbar/other']).toBeUndefined();
  });

  it('clicks a dialog button that a never pattern names, and stops when it opens no window', async () => {
    const windows: FakeWindow[] = [
      { name: 'menu', children: ['abandon', 'disband'] },
      { name: 'confirm', children: [] },
    ];
    const game = new CrawlGame(windows, ['menu'], '.');
    game.onClick = (selector): void => {
      if (selector === 'menu/disband' && !game.open.includes('confirm')) game.open.push('confirm');
    };
    const rules: CrawlRules = {
      ...RULES,
      never: [{ pattern: 'menu/*', reason: 'Gameplay.' }],
      dialogs: [{ pattern: 'menu/*', reason: 'A confirmation.' }],
    };
    const first = await crawlOnce(context(game, 'main-menu', ['menu']), rules);
    expect(first.restart).toBe(true);
    expect(first.crawl.tried['click menu/abandon']).toEqual({
      kind: 'state-changed',
      change: 'A dialogs pattern names the click, but it opened no new window.',
    });
    // The next start goes on with the candidates not tried yet.
    const second = await crawlOnce(context(game, 'main-menu', ['menu']), rules, first.crawl);
    expect(second.restart).toBe(false);
    expect(second.crawl.starts).toBe(2);
    expect(second.crawl.tried['click menu/disband']).toEqual({ kind: 'opened', state: 's1' });
    expect(second.crawl.skipped).toEqual({});
  });

  it('marks a click start-lost when Escape cannot bring back the start state after it', async () => {
    const windows: FakeWindow[] = [
      { name: 'menu', children: ['b', 'c'] },
      { name: 'side', children: [] },
    ];
    const game = new CrawlGame(windows, ['menu', 'side'], '.');
    game.onClick = (selector): void => {
      if (selector === 'menu/b') game.open.splice(game.open.indexOf('side'), 1);
    };
    const log: Record<string, unknown>[] = [];
    const { restart, crawl } = await crawlOnce(context(game, 'main-menu', ['menu', 'side'], log), {
      ...RULES,
      maxDepth: 0,
    });
    expect(restart).toBe(true);
    expect(crawl.tried['click menu/b']).toEqual({
      kind: 'start-lost',
      detail: expect.stringMatching(
        /^The start state lost windows that Escape cannot bring back/,
      ) as unknown,
    });
    expect(crawl.tried['click menu/c']).toBeUndefined();
    expect(log.some((e) => e['startLost'] !== undefined)).toBe(true);
  });

  it('marks the view a click opened as one Escape does not close', async () => {
    const windows: FakeWindow[] = [
      { name: 'menu', children: ['b', 'c'] },
      { name: 'side', children: [] },
    ];
    const game = new CrawlGame(windows, ['menu', 'side'], '.');
    game.onClick = (selector): void => {
      if (selector === 'menu/b') game.open.splice(game.open.indexOf('side'), 1);
    };
    const { restart, crawl } = await crawlOnce(context(game, 'main-menu', ['menu', 'side']), RULES);
    expect(restart).toBe(true);
    expect(crawl.tried['click menu/b']).toEqual({ kind: 'opened', state: 's1' });
    expect(crawl.states[1]?.escapeFails).toMatch(/^The start state lost windows/);
  });

  it('gives up a view whose steps no longer lead to it, and logs a different start', async () => {
    const windows: FakeWindow[] = [
      { name: 'menu', children: [] },
      { name: 'ledger', openedBy: { key: 'f1' }, children: [] },
    ];
    const game = new CrawlGame(windows, ['menu'], '.');
    const crawl = newCrawlFile('vanilla', '640x360', 'main-menu');
    crawl.states.push(
      { id: 's0', steps: [], signature: 'menu', roots: ['menu'], depth: 0, explored: true },
      {
        id: 's1',
        steps: [{ key: 'f1' }],
        signature: 'country\nmenu',
        roots: ['country'],
        depth: 1,
        explored: false,
      },
      {
        id: 's2',
        steps: [{ click: 'menu/gone' }],
        signature: 'menu\nwa',
        roots: ['wa'],
        depth: 1,
        explored: false,
      },
    );
    const log: Record<string, unknown>[] = [];
    const { restart } = await crawlOnce(context(game, 'main-menu', ['menu'], log), RULES, crawl);
    expect(restart).toBe(false);
    expect(crawl.done).toBe(true);
    expect(crawl.states[1]).toMatchObject({ explored: true, unreproducible: LED_ELSEWHERE });
    expect(crawl.states[2]?.explored).toBe(true);
    expect(crawl.states[2]?.unreproducible).toMatch(/menu\/gone/);
    expect(log).toContainEqual({ unreproducible: 's1', now: 'ledger\nmenu' });

    game.open.push('ledger');
    const other = newCrawlFile('vanilla', '640x360', 'main-menu');
    other.states.push({
      id: 's0',
      steps: [],
      signature: 'menu',
      roots: ['menu'],
      depth: 0,
      explored: true,
    });
    const changed: Record<string, unknown>[] = [];
    await crawlOnce(context(game, 'main-menu', ['ledger', 'menu'], changed), RULES, other);
    expect(changed).toContainEqual({
      crawl: 'the start state differs from the first start',
      now: 'ledger\nmenu',
    });
  });

  it('gives up a view whose click step Tongs answers without clicking', async () => {
    const windows: FakeWindow[] = [{ name: 'menu', children: [] }];
    const game = new CrawlGame(windows, ['menu'], '.');
    const call = game.call.bind(game);
    game.call = (command) =>
      command === 'ui click menu/stale timeout=10'
        ? Promise.resolve({ ok: true, clicked: false })
        : call(command);
    const crawl = newCrawlFile('vanilla', '640x360', 'main-menu');
    crawl.states.push(
      { id: 's0', steps: [], signature: 'menu', roots: ['menu'], depth: 0, explored: true },
      {
        id: 's1',
        steps: [{ click: 'menu/stale' }],
        signature: 'menu\nstale',
        roots: ['stale'],
        depth: 1,
        explored: false,
      },
    );
    const { restart } = await crawlOnce(context(game, 'main-menu', ['menu']), RULES, crawl);
    expect(restart).toBe(false);
    expect(crawl.done).toBe(true);
    expect(crawl.states[1]).toMatchObject({
      explored: true,
      unreproducible: '"ui click menu/stale timeout=10" did not click.',
    });
  });

  it('ends at the session time and leaves the rest for the next start', async () => {
    const windows: FakeWindow[] = [{ name: 'menu', children: ['a', 'b'] }];
    const game = new CrawlGame(windows, ['menu'], '.');
    let t = Date.parse('2026-11-18T06:00:00Z');
    const now = (): Date => new Date((t += 1000));
    const { restart, crawl } = await crawlOnce(context(game, 'main-menu', ['menu'], [], now), {
      ...RULES,
      sessionMinutes: 0,
    });
    expect(restart).toBe(false);
    expect(crawl.done).toBe(false);
    expect(crawl.tried).toEqual({});
    expect(crawl.states[0]?.explored).toBe(false);
  });
});

describe('the crawl file', () => {
  it('reads back what it wrote, and nothing of another format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'etch-crawl-'));
    dirs.push(dir);
    const file = join(dir, 'deep', 'crawl.json');
    expect(await readCrawlFile(file)).toBeUndefined();
    const crawl = newCrawlFile('vanilla', '1920x1080', 'save');
    crawl.tried['key f1'] = { kind: 'same' };
    await writeCrawlFile(file, crawl);
    expect(await readCrawlFile(file)).toEqual(crawl);
    const text = await readFile(file, 'utf8');
    await writeCrawlFile(file, { ...crawl, formatVersion: 2 as 1 });
    expect(await readCrawlFile(file)).toBeUndefined();
    expect(text.endsWith('\n')).toBe(true);
  });
});
