import { spawn, type ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PreparedInstall } from '../src/game-host/install.ts';
import { HostPipe, PipeError, newSessionId, pipePath } from '../src/game-host/pipe.ts';
import {
  GameHostProcess,
  HostBusyError,
  acquireLock,
  closeOrphan,
  lockHeldElsewhere,
  readLock,
  releaseLock,
  type LockOptions,
} from '../src/game-host/process.ts';
import {
  closeWindowsHelper,
  creationUnixMs,
  processIdentity,
  type ProcessIdentity,
} from '../src/game-host/windows.ts';

// The Win32 helper runs in Windows PowerShell, about a second per call.
const windows = process.platform === 'win32' ? describe : describe.skip;
const TIMEOUT = 60_000;
const FAKE_GAME = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-game.mts');

let temp: string;
let children: ChildProcess[];

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'etch-host-process-'));
  children = [];
});

afterEach(async () => {
  for (const child of children) if (child.exitCode === null) child.kill();
  await rm(temp, { recursive: true, force: true });
});

/** A long-running process standing in for another extension host or a game, and its identity. */
async function sleeper(): Promise<{ child: ChildProcess; identity: ProcessIdentity }> {
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], {
    stdio: 'ignore',
  });
  children.push(child);
  await new Promise((resolve) => child.once('spawn', resolve));
  const identity = await processIdentity(child.pid ?? 0);
  if (identity === undefined) throw new Error('the stand-in did not start');
  return { child, identity };
}

const exited = (child: ChildProcess) =>
  child.exitCode !== null
    ? Promise.resolve()
    : new Promise<void>((resolve) =>
        child.once('exit', () => {
          resolve();
        }),
      );

async function self(): Promise<ProcessIdentity> {
  const identity = await processIdentity(process.pid);
  if (identity === undefined) throw new Error('no identity of the test process');
  return identity;
}

windows('process identity', () => {
  it(
    'gives the creation time the plugin reports as process_start_ms',
    async () => {
      const identity = await self();
      expect(identity.pid).toBe(process.pid);
      expect(identity.imagePath.toLowerCase()).toBe(
        realpathSync.native(process.execPath).toLowerCase(),
      );
      const created = creationUnixMs(identity);
      expect(created).toBeLessThanOrEqual(Date.now());
      expect(created).toBeGreaterThan(Date.now() - process.uptime() * 1000 - 5_000);
      expect(await processIdentity(0x7ffffff0)).toBeUndefined();
    },
    TIMEOUT,
  );

  it(
    'starts the helper without searching the modules on PSModulePath',
    async () => {
      // Autoloading would search the path's modules and take this Add-Type over $PSHOME's: the
      // helper ends before it is ready, as it does only when it searches.
      const modules = join(temp, 'Modules');
      await mkdir(join(modules, 'EtchShadow'), { recursive: true });
      await writeFile(
        join(modules, 'EtchShadow', 'EtchShadow.psm1'),
        'function Add-Type { exit 3 }\n',
      );
      const path = process.env['PSModulePath'] ?? '';
      closeWindowsHelper();
      process.env['PSModulePath'] = `${modules};${path}`;
      try {
        expect((await self()).pid).toBe(process.pid);
      } finally {
        closeWindowsHelper();
        process.env['PSModulePath'] = path;
      }
    },
    TIMEOUT,
  );
});

windows('the lock', () => {
  let options: LockOptions;
  beforeEach(async () => {
    options = { path: join(temp, 'game-host.lock'), owner: await self() };
  });

  it(
    'is taken and released by its owner',
    async () => {
      await acquireLock(options, 'a'.repeat(32));
      expect((await readLock(options.path))?.session).toBe('a'.repeat(32));
      expect(await lockHeldElsewhere(options)).toBe(false);
      await releaseLock(options);
      expect(await readLock(options.path)).toBeUndefined();
    },
    TIMEOUT,
  );

  it(
    "refuses while another live window's extension host holds it",
    async () => {
      const other = await sleeper();
      await writeFile(
        options.path,
        JSON.stringify({ formatVersion: 1, owner: other.identity, session: 'b'.repeat(32) }),
      );
      await expect(acquireLock(options, 'a'.repeat(32))).rejects.toBeInstanceOf(HostBusyError);
      expect(await lockHeldElsewhere(options)).toBe(true);
      // Releasing someone else's lock does nothing.
      await releaseLock(options);
      expect((await readLock(options.path))?.session).toBe('b'.repeat(32));
    },
    TIMEOUT,
  );

  it(
    'closes the orphan of a window that is gone, after checking its identity',
    async () => {
      const gone = await sleeper();
      gone.child.kill();
      await exited(gone.child);
      const orphan = await sleeper();
      await writeFile(
        options.path,
        JSON.stringify({
          formatVersion: 1,
          owner: gone.identity,
          session: 'c'.repeat(32),
          game: orphan.identity,
        }),
      );
      expect(await closeOrphan(options)).toBe(true);
      await exited(orphan.child);
      expect(orphan.child.exitCode ?? orphan.child.signalCode).not.toBeNull();
      expect(await readLock(options.path)).toBeUndefined();
    },
    TIMEOUT,
  );

  it(
    'never closes a process whose creation time differs from the lock',
    async () => {
      const gone = await sleeper();
      gone.child.kill();
      await exited(gone.child);
      const bystander = await sleeper();
      const wrong = {
        ...bystander.identity,
        creationFileTime: String(BigInt(bystander.identity.creationFileTime) - 10n),
      };
      await writeFile(
        options.path,
        JSON.stringify({
          formatVersion: 1,
          owner: gone.identity,
          session: 'd'.repeat(32),
          game: wrong,
        }),
      );
      await expect(acquireLock(options, 'a'.repeat(32))).rejects.toThrow(/identity-mismatch/);
      expect(await processIdentity(bystander.identity.pid)).toEqual(bystander.identity);
    },
    TIMEOUT,
  );
});

describe('the session pipe', () => {
  let server: Server | undefined;
  afterEach(() => {
    server?.close();
    server = undefined;
  });

  /** A plugin that answers each request with `answer(request)`. */
  async function plugin(
    session: string,
    answer: (request: { id: number; type: string }) => object,
  ): Promise<void> {
    server = createServer((socket) => {
      socket.setEncoding('utf8');
      let buffered = '';
      socket.on('data', (chunk: string) => {
        buffered += chunk;
        for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
          const request = JSON.parse(buffered.slice(0, end)) as { id: number; type: string };
          buffered = buffered.slice(end + 1);
          socket.write(`${JSON.stringify({ id: request.id, ...answer(request) })}\n`);
        }
      });
    });
    const listening = server;
    await new Promise<void>((resolve) => listening.listen(pipePath(session), resolve));
  }

  const hello = (session: string) => ({
    ok: true,
    protocol: 1,
    plugin: '0.3.0',
    session,
    pid: 42,
    process_start_ms: 1,
    ready: false,
    frame: 0,
  });

  it('greets the plugin and pings it', async () => {
    const session = newSessionId();
    expect(session).toMatch(/^[0-9a-f]{32}$/);
    await plugin(session, (r) =>
      r.type === 'hello' ? hello(session) : { ok: true, ready: true, frame: 7 },
    );
    const pipe = await HostPipe.connect(session);
    expect(pipe.hello.pid).toBe(42);
    expect(await pipe.ping()).toEqual({ ready: true, frame: 7 });
    pipe.close();
  });

  it('says the pipe is not up yet', async () => {
    await expect(HostPipe.connect(newSessionId())).rejects.toMatchObject({ code: 'no_pipe' });
  });

  it('refuses a plugin that answers for another session', async () => {
    const session = newSessionId();
    await plugin(session, () => hello('f'.repeat(32)));
    await expect(HostPipe.connect(session)).rejects.toMatchObject({ code: 'wrong_session' });
  });

  it("passes on the plugin's error", async () => {
    const session = newSessionId();
    await plugin(session, (r) =>
      r.type === 'hello'
        ? hello(session)
        : { ok: false, error: 'unknown_type', message: 'Unknown request type.' },
    );
    const pipe = await HostPipe.connect(session);
    const failure = pipe.request({ type: 'jobs' });
    await expect(failure).rejects.toBeInstanceOf(PipeError);
    await expect(failure).rejects.toMatchObject({ code: 'unknown_type' });
    pipe.close();
  });
});

windows('GameHostProcess', () => {
  function install(args: string[]): PreparedInstall {
    return {
      exe: process.execPath,
      gameFolder: temp,
      profileFolder: temp,
      overlayFolder: temp,
      arguments: [FAKE_GAME, ...args],
      restored: [],
    };
  }

  it(
    'starts, waits until ready, checks the handshake and stops the verified process',
    async () => {
      const lock: LockOptions = { path: join(temp, 'game-host.lock'), owner: await self() };
      const host = await GameHostProcess.start({
        install: install([lock.path, '500']),
        originalGameFolder: temp,
        lock,
      });
      expect(host.hello.pid).toBe(host.identity.pid);
      expect(host.hello.session).toBe(host.session);
      expect(host.times.ready).toBeGreaterThanOrEqual(host.times.pipe);
      expect((await readLock(lock.path))?.game).toEqual(host.identity);
      expect((await host.ping()).ready).toBe(true);
      expect(await host.stop()).toBe('terminated');
      expect(await host.onExit).not.toBe(0);
      expect(await processIdentity(host.identity.pid)).toBeUndefined();
      expect(await readLock(lock.path)).toBeUndefined();
    },
    TIMEOUT,
  );

  it(
    'releases the lock when the game ends before it is ready',
    async () => {
      const lock: LockOptions = { path: join(temp, 'game-host.lock'), owner: await self() };
      await expect(
        GameHostProcess.start({
          install: install([lock.path, '60000', 'exit']),
          originalGameFolder: temp,
          lock,
        }),
      ).rejects.toThrow(/exited/);
      expect(await readFile(lock.path).catch(() => undefined)).toBeUndefined();
    },
    TIMEOUT,
  );
});
