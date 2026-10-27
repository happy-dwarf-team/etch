import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ErrorLogTail } from '../src/live-game/error-log.ts';

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'etch-error-log-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('ErrorLogTail', () => {
  it('reads nothing while there is no log', async () => {
    const tail = new ErrorLogTail(join(folder, 'error.log'));
    expect(await tail.read()).toEqual([]);
  });

  it('skips what the log holds, then reads each whole line added once', async () => {
    const path = join(folder, 'error.log');
    await writeFile(path, '[news_banner.cpp:96]: start\r\n');
    const tail = new ErrorLogTail(path);
    expect(await tail.skip()).toBe(1);
    await appendFile(path, '[gui.cpp:367]: one\r\n[gui.cpp:367]: tw');
    expect(await tail.read()).toEqual(['[gui.cpp:367]: one']);
    await appendFile(path, 'o\r\n');
    expect(await tail.read()).toEqual(['[gui.cpp:367]: two']);
    expect(await tail.read()).toEqual([]);
  });

  it('reads Windows-1252 and starts again when the log gets shorter', async () => {
    const path = join(folder, 'error.log');
    await writeFile(path, 'a long first line of an earlier start\n');
    const tail = new ErrorLogTail(path);
    await tail.skip();
    await writeFile(path, Uint8Array.from([0x4e, 0xe9, 0x0a]));
    expect(await tail.read()).toEqual(['Né']);
  });
});
