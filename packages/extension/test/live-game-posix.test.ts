import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { parseStat } from '../src/live-game/posix.ts';
import {
  childProcesses,
  creationUnixMs,
  processIdentity,
  processesNamed,
  stopVerified,
} from '../src/live-game/windows.ts';

const posix = process.platform === 'linux' ? describe : describe.skip;

posix('the process helper on Linux', () => {
  const started: ChildProcess[] = [];
  afterEach(() => {
    for (const child of started.splice(0)) child.kill('SIGKILL');
  });
  const sleeper = (): ChildProcess => {
    const child = spawn('sleep', ['60'], { stdio: 'ignore' });
    started.push(child);
    return child;
  };
  const alive = (pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it('reads the identity of a process: PID, image and a creation time that is now', async () => {
    const child = sleeper();
    const before = Date.now();
    const identity = await processIdentity(child.pid ?? 0);
    expect(identity?.pid).toBe(child.pid);
    expect(identity?.imagePath).toMatch(/[\\/]sleep$/);
    // Within the 10 ms clock tick and the boot-time second of the real start.
    expect(
      Math.abs(
        creationUnixMs(identity ?? { pid: 0, imagePath: '', creationFileTime: '0' }) - before,
      ),
    ).toBeLessThan(5_000);
    expect(await processIdentity(2 ** 22 + 7)).toBeUndefined();
  });

  it('finds the processes of an image name', async () => {
    const child = sleeper();
    await processIdentity(child.pid ?? 0);
    expect((await processesNamed('SLEEP')).map((p) => p.pid)).toContain(child.pid);
    expect(await processesNamed('no-such-image.exe')).toEqual([]);
  });

  it('finds the children of a live parent that were started after it, and no others', async () => {
    const parent = spawn('sh', ['-c', 'sleep 60 & wait'], { stdio: 'ignore' });
    started.push(parent);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const identity = await processIdentity(parent.pid ?? 0);
    expect(identity).toBeDefined();
    if (identity === undefined) return;
    const children = await childProcesses(identity, 'sleep');
    expect(children).toHaveLength(1);
    expect(await childProcesses(identity, 'other-image')).toEqual([]);
    // A parent that is not the process it names (its PID reused) has no children.
    expect(await childProcesses({ ...identity, creationFileTime: '1' }, 'sleep')).toEqual([]);
    for (const child of children) process.kill(child.pid, 'SIGKILL');
  });

  it('closes a process only when it is the one named, and says what happened', async () => {
    const child = sleeper();
    const identity = await processIdentity(child.pid ?? 0);
    expect(identity).toBeDefined();
    if (identity === undefined) return;
    const other = { ...identity, creationFileTime: String(BigInt(identity.creationFileTime) + 1n) };
    expect(await stopVerified(other)).toBe('identity-mismatch-not-closed');
    expect(alive(identity.pid)).toBe(true);
    expect(await stopVerified(identity)).toBe('terminated');
    expect(alive(identity.pid) && (await processIdentity(identity.pid)) !== undefined).toBe(false);
    expect(await stopVerified(identity)).toBe('already-exited');
  });

  it('reads /proc/<pid>/stat whose command name holds spaces and parentheses', () => {
    const stat = '4242 (a (b) c) S 99 4242 4242 0 -1 4194560 0 0 0 0 0 0 0 0 20 0 1 0 123456 0 0 0';
    expect(parseStat(stat)).toEqual({
      comm: 'a (b) c',
      state: 'S',
      parent: 99,
      startTicks: 123456,
    });
    expect(parseStat('garbage')).toBeUndefined();
  });
});
