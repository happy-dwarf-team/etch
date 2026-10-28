import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ping } from '../src/live-game/pipe.ts';
import {
  CrashLimit,
  HangCheck,
  RestartQueue,
  errorLogPath,
  logTail,
  watch,
} from '../src/live-game/watchdog.ts';

const ping = (frame: number, more: Partial<Ping> = {}): Ping => ({
  ready: true,
  frame,
  responding: false,
  busy: false,
  pick: false,
  gameSession: undefined,
  ...more,
});

describe('HangCheck', () => {
  it('is fine while pings are answered and frames move', () => {
    const check = new HangCheck(0, 60_000, 300_000);
    for (let t = 1_000; t <= 400_000; t += 1_000) {
      check.answer(ping(t), t);
      expect(check.hang(t)).toBeUndefined();
      expect(check.still(t)).toBeUndefined();
    }
  });

  it('never calls a frame counter that stands still a hang, and tells it after the still limit', () => {
    // A load, a new game or a big event in Anbennar's playset: no frame, the window not responding.
    const check = new HangCheck(0, 60_000, 300_000);
    check.answer(ping(7), 1_000);
    for (let t = 2_000; t < 301_000; t += 1_000) {
      check.answer(ping(7), t);
      expect(check.hang(t)).toBeUndefined();
      expect(check.still(t)).toBeUndefined();
    }
    check.answer(ping(7), 301_000);
    expect(check.hang(301_000)).toBeUndefined();
    expect(check.still(301_000)).toBe(
      'the game drew no frame for 300 s (frame 7) and Windows marks its window not responding',
    );
    check.answer(ping(7, { responding: true }), 302_000);
    expect(check.still(302_000)).toBe('the game drew no frame for 301 s (frame 7)');
    // It moved on: a new stretch begins.
    check.answer(ping(8), 303_000);
    expect(check.still(303_000)).toBeUndefined();
    expect(check.movedAt).toBe(303_000);
  });

  it('counts a busy plugin as moving', () => {
    const check = new HangCheck(0, 60_000, 60_000);
    for (let t = 1_000; t <= 90_000; t += 1_000) {
      check.answer(ping(7, { busy: true }), t);
      expect(check.still(t)).toBeUndefined();
    }
    // The save ended: the stall counts from its last busy answer.
    check.answer(ping(7), 149_999);
    expect(check.still(149_999)).toBeUndefined();
    expect(check.still(150_000)).toMatch(/^the game drew no frame for 60 s/);
  });

  it('finds pings left unanswered', () => {
    const check = new HangCheck(0, 60_000);
    check.answer(ping(1), 1_000);
    expect(check.hang(60_999)).toBeUndefined();
    expect(check.hang(61_000)).toBe("Etch's plugin gave no answer to a ping for 60 s");
  });
});

describe('watch', () => {
  it('resolves with the hang, and never after it was aborted', async () => {
    let frame = 0;
    const moving = {
      ping: (): Promise<Ping> => Promise.resolve(ping(frame++)),
    };
    const abort = new AbortController();
    let ended = false;
    void watch(moving, { intervalMs: 5, silentMs: 100, signal: abort.signal }).then(() => {
      ended = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(ended).toBe(false);
    abort.abort();

    const failing = { ping: (): Promise<Ping> => Promise.reject(new Error('pipe closed')) };
    const reason = await watch(failing, {
      intervalMs: 5,
      silentMs: 100,
      signal: new AbortController().signal,
    });
    expect(reason).toMatch(/^Etch's plugin gave no answer to a ping/);
    expect(ended).toBe(false);
  });

  it('tells each stretch of a still frame counter once, and keeps watching', async () => {
    let frame = 0;
    let still = true;
    const target = {
      ping: (): Promise<Ping> => Promise.resolve(ping(still ? frame : ++frame)),
    };
    const abort = new AbortController();
    const told: string[] = [];
    let ended = false;
    void watch(target, {
      intervalMs: 5,
      silentMs: 1_000,
      stillMs: 100,
      onStill: (reason) => told.push(reason),
      signal: abort.signal,
    }).then(() => {
      ended = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(told).toHaveLength(1);
    still = false;
    await new Promise((resolve) => setTimeout(resolve, 50));
    still = true;
    await new Promise((resolve) => setTimeout(resolve, 300));
    abort.abort();
    expect(told).toHaveLength(2);
    expect(ended).toBe(false);
  });
});

describe('CrashLimit', () => {
  it('stops at the third crash within five minutes', () => {
    const limit = new CrashLimit();
    expect(limit.crash(0)).toBe(false);
    expect(limit.crash(60_000)).toBe(false);
    // The first crash is more than five minutes ago.
    expect(limit.crash(300_001)).toBe(false);
    expect(limit.crash(310_000)).toBe(true);
    limit.reset();
    expect(limit.crash(320_000)).toBe(false);
  });
});

describe('RestartQueue', () => {
  function gate(): { promise: Promise<void>; open(): void } {
    let open = (): void => undefined;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  }

  it('joins restarts asked for before the start, and makes one more for later ones', async () => {
    const cycles: (readonly string[])[] = [];
    const stopped = gate();
    const started = gate();
    let first = true;
    const queue = new RestartQueue(async (take) => {
      if (first) await stopped.promise;
      cycles.push(take());
      if (first) await started.promise;
      first = false;
      return true;
    });
    queue.request('a.gfx changed');
    expect(queue.busy).toBe(true);
    // While the old process stops: the same restart.
    queue.request('b.gfx changed');
    queue.request('a.gfx changed');
    stopped.open();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // While the new one starts: one more after it.
    queue.request('c.fnt changed');
    queue.request('the playset changed');
    started.open();
    await queue.idle();
    expect(cycles).toEqual([
      ['a.gfx changed', 'b.gfx changed'],
      ['c.fnt changed', 'the playset changed'],
    ]);
    expect(queue.busy).toBe(false);
  });

  it('drops the restarts asked for when the live game stays down', async () => {
    const cycles: (readonly string[])[] = [];
    const started = gate();
    const queue = new RestartQueue(async (take) => {
      cycles.push(take());
      await started.promise;
      return false;
    });
    queue.request('a.gfx changed');
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.request('b.gfx changed');
    started.open();
    await queue.idle();
    expect(cycles).toEqual([['a.gfx changed']]);
  });

  it('asks again from inside a cycle, as a crash while the game starts does', async () => {
    let cycles = 0;
    const queue = new RestartQueue((take) => {
      take();
      cycles++;
      if (cycles < 3) queue.request('the game exited while it started');
      return Promise.resolve(true);
    });
    queue.request('start');
    await queue.idle();
    expect(cycles).toBe(3);
  });

  it('drops the restarts of a cycle that throws or never starts', async () => {
    let calls = 0;
    const queue = new RestartQueue(() => {
      calls++;
      return calls === 1 ? Promise.reject(new Error('broken')) : Promise.resolve(true);
    });
    queue.request('a');
    await queue.idle();
    queue.request('b');
    await queue.idle();
    expect(calls).toBe(2);
  });
});

describe('logTail', () => {
  let folder: string;
  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'etch-watchdog-'));
  });
  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("reads the last lines of the profile's error.log", async () => {
    const path = errorLogPath(folder);
    expect(path).toBe(join(folder, 'logs', 'error.log'));
    expect(await logTail(path)).toEqual([]);
    await mkdir(join(folder, 'logs'));
    const lines = Array.from({ length: 30 }, (_, i) => `[gui.cpp:${String(i)}]: line ${String(i)}`);
    await writeFile(path, `${lines.join('\r\n')}\r\n\r\n`);
    expect(await logTail(path, 3)).toEqual(lines.slice(-3));
    // Read from the end: a cut first line is left out.
    expect(await logTail(path, 100, 40)).toEqual([lines[29]]);
  });
});
