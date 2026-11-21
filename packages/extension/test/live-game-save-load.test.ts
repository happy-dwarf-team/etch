import { describe, expect, it } from 'vitest';
import type { ConfirmAnswer } from '../src/live-game/pipe.ts';
import {
  HELD_GRACE_MS,
  LOAD_POLL_MS,
  LOAD_TIMEOUT_MS,
  NOTICE_OK,
  awaitSaveLoad,
  type LoadingGame,
} from '../src/live-game/save-load.ts';

const SESSION = { ironman: false, multiplayer: false, number: 1 };
const NOTICE = 'Achievements can no longer be earned';

/**
 * A game on a fake clock: `screen(t)` is what the confirm sees at time t, `loadsAt` when the game
 * session appears (after the notice's Enter, when `afterEnterMs` is set).
 */
function fakeGame(options: {
  readonly screen?: (t: number) => ConfirmAnswer | 'busy';
  readonly loadsAt?: number;
  readonly afterEnterMs?: number;
  readonly exitsAt?: number;
}) {
  let t = 0;
  let loadsAt = options.loadsAt ?? Number.POSITIVE_INFINITY;
  const paths: string[] = [];
  const game: LoadingGame = {
    get alive() {
      return options.exitsAt === undefined || t < options.exitsAt;
    },
    ping: () => Promise.resolve({ gameSession: t >= loadsAt ? SESSION : undefined }),
    confirm: (path) => {
      paths.push(path);
      const seen = options.screen?.(t) ?? { found: false, pressed: false };
      if (seen === 'busy') return Promise.reject(new Error('busy'));
      if (seen.pressed && options.afterEnterMs !== undefined) {
        loadsAt = Math.min(loadsAt, t + options.afterEnterMs);
      }
      return Promise.resolve(seen);
    },
  };
  return {
    game,
    paths,
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

describe('awaitSaveLoad', () => {
  it('answers the achievements notice in any playset and is done once the save is loaded', async () => {
    const titles: string[] = [];
    const fake = fakeGame({
      // The notice shows from 1 s on, in a playset with a gameplay mod.
      screen: (t) =>
        t >= 1_000
          ? { found: true, pressed: true, title: NOTICE }
          : { found: false, pressed: false },
      afterEnterMs: 4_000,
    });
    const load = await awaitSaveLoad(fake.game, {
      now: fake.now,
      sleep: fake.sleep,
      onAnswered: (title) => titles.push(title),
    });
    expect(load.kind).toBe('loaded');
    expect(load.ms).toBe(5_000);
    expect(titles).toEqual([NOTICE]);
    expect(new Set(fake.paths)).toEqual(new Set([NOTICE_OK]));
  });

  it('is done at once when the save loads without a notice', async () => {
    const fake = fakeGame({ loadsAt: 0 });
    const load = await awaitSaveLoad(fake.game, { now: fake.now, sleep: fake.sleep });
    expect(load).toEqual({ kind: 'loaded', ms: 0, answered: 0 });
    expect(fake.paths).toEqual([]);
  });

  it('waits through a main thread too busy to answer', async () => {
    const fake = fakeGame({ screen: () => 'busy', loadsAt: 90_000 });
    const load = await awaitSaveLoad(fake.game, { now: fake.now, sleep: fake.sleep });
    expect(load).toEqual({ kind: 'loaded', ms: 90_000, answered: 0 });
  });

  it('leaves another confirm window to the player and says which one holds the load', async () => {
    const fake = fakeGame({
      screen: () => ({ found: false, pressed: false, title: 'Old Savegame' }),
    });
    const load = await awaitSaveLoad(fake.game, { now: fake.now, sleep: fake.sleep });
    expect(load).toEqual({ kind: 'held', ms: HELD_GRACE_MS, title: 'Old Savegame' });
  });

  it('does not count a window that closes within the grace', async () => {
    const fake = fakeGame({
      screen: (t) =>
        t < 1_000
          ? { found: false, pressed: false, title: 'Something else' }
          : { found: false, pressed: false },
      loadsAt: 3_000,
    });
    const load = await awaitSaveLoad(fake.game, { now: fake.now, sleep: fake.sleep });
    expect(load.kind).toBe('loaded');
  });

  it('gives up after the timeout', async () => {
    const fake = fakeGame({});
    const load = await awaitSaveLoad(fake.game, { now: fake.now, sleep: fake.sleep });
    expect(load.kind).toBe('timeout');
    expect(load.ms).toBeGreaterThanOrEqual(LOAD_TIMEOUT_MS);
    expect(load.ms).toBeLessThan(LOAD_TIMEOUT_MS + LOAD_POLL_MS);
  });

  it('stops when the game ends or the start is cancelled', async () => {
    const ended = fakeGame({ exitsAt: 2_000 });
    expect(await awaitSaveLoad(ended.game, { now: ended.now, sleep: ended.sleep })).toEqual({
      kind: 'exited',
      ms: 2_000,
    });
    const abort = new AbortController();
    abort.abort();
    const cancelled = fakeGame({});
    const load = await awaitSaveLoad(cancelled.game, {
      signal: abort.signal,
      now: cancelled.now,
      sleep: cancelled.sleep,
    });
    expect(load.kind).toBe('cancelled');
  });
});
