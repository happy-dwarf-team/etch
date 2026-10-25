import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ping } from '../src/game-host/pipe.ts';
import {
  CrashLimit,
  HangCheck,
  RestartQueue,
  errorLogPath,
  logTail,
  needsRestart,
  requestChange,
  watch,
  type HostStartRequest,
} from '../src/game-host/watchdog.ts';

describe('needsRestart', () => {
  it('names the files the game reads only when it starts', () => {
    expect(needsRestart('C:/mod/interface/core.gfx')).toBe(true);
    expect(needsRestart('C:/mod/gfx/fonts/vic_18.FNT')).toBe(true);
    expect(needsRestart('C:/mod/interface/topbar.gui')).toBe(false);
    expect(needsRestart('C:/mod/gfx/interface/bg.dds')).toBe(false);
    expect(needsRestart('C:/mod/localisation/x_l_english.yml')).toBe(false);
  });
});

describe('requestChange', () => {
  const request: HostStartRequest = {
    gameFolder: 'C:\\Games\\EU4',
    mods: [{ name: 'A', root: 'C:\\mods\\a', descriptorPath: 'C:\\mods\\a.mod' }],
    display: { width: 3440, height: 1440, language: 'english' },
  };

  it('sees no change in the same request, written another way', () => {
    expect(
      requestChange(request, {
        ...request,
        gameFolder: 'c:/games/eu4/',
        mods: [{ name: 'A (renamed)', root: 'C:/Mods/A', descriptorPath: 'C:\\mods\\a.mod' }],
      }),
    ).toBeUndefined();
  });

  it('names a new resolution, language, game folder or playset', () => {
    expect(
      requestChange(request, { ...request, display: { ...request.display, height: 1080 } }),
    ).toBe('the resolution changed to 3440×1080');
    expect(
      requestChange(request, { ...request, display: { ...request.display, language: 'german' } }),
    ).toBe('the language changed to german');
    expect(requestChange(request, { ...request, gameFolder: 'D:\\EU4' })).toBe(
      'the game folder changed',
    );
    expect(requestChange(request, { ...request, mods: [] })).toBe('the playset changed');
    expect(
      requestChange(request, {
        ...request,
        mods: [...request.mods, { name: 'B', root: 'C:\\mods\\b' }],
      }),
    ).toBe('the playset changed');
  });
});

describe('HangCheck', () => {
  it('is fine while pings are answered and frames move', () => {
    const check = new HangCheck(0, 10_000);
    for (let t = 1_000; t <= 30_000; t += 1_000) {
      check.answer({ ready: true, frame: t }, t);
      expect(check.hang(t)).toBeUndefined();
    }
  });

  it('finds a frame counter that stands still', () => {
    const check = new HangCheck(0, 10_000);
    check.answer({ ready: true, frame: 7 }, 1_000);
    for (let t = 2_000; t < 11_000; t += 1_000) {
      check.answer({ ready: true, frame: 7 }, t);
      expect(check.hang(t)).toBeUndefined();
    }
    check.answer({ ready: true, frame: 7 }, 11_000);
    expect(check.hang(11_000)).toBe('the frame counter stayed at 7 for 10 s');
  });

  it('finds pings left unanswered', () => {
    const check = new HangCheck(0, 10_000);
    check.answer({ ready: true, frame: 1 }, 1_000);
    expect(check.hang(10_999)).toBeUndefined();
    expect(check.hang(11_000)).toBe('no answer to a ping for 10 s');
  });
});

describe('watch', () => {
  it('resolves with the hang, and never after it was aborted', async () => {
    let frame = 0;
    const moving = {
      ping: (): Promise<Ping> => Promise.resolve({ ready: true, frame: frame++ }),
    };
    const abort = new AbortController();
    let ended = false;
    void watch(moving, { intervalMs: 5, hangMs: 100, signal: abort.signal }).then(() => {
      ended = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(ended).toBe(false);
    abort.abort();

    const failing = { ping: (): Promise<Ping> => Promise.reject(new Error('pipe closed')) };
    const reason = await watch(failing, {
      intervalMs: 5,
      hangMs: 100,
      signal: new AbortController().signal,
    });
    expect(reason).toMatch(/^no answer to a ping/);
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

  it('drops the restarts asked for when the game host stays down', async () => {
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
