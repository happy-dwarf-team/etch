/// <reference types="node" />
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { connectTongs, tongsAtLeast } from '../../src/corpus/driver/tongs.ts';

// Off Windows the stand-in serves its pipe as a Unix socket in this folder, and connections to it
// are direct (no bridge): ETCH_PIPE_DIRECT names the folder.
const pipeDir = mkdtempSync(join(tmpdir(), 'etch-tongs-client-'));
const previousDirect = process.env['ETCH_PIPE_DIRECT'];
if (process.platform !== 'win32') process.env['ETCH_PIPE_DIRECT'] = pipeDir;

afterAll(async () => {
  if (previousDirect === undefined) delete process.env['ETCH_PIPE_DIRECT'];
  else process.env['ETCH_PIPE_DIRECT'] = previousDirect;
  await rm(pipeDir, { recursive: true, force: true });
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((resolve) =>
          s.close(() => {
            resolve();
          }),
        ),
    ),
  );
});

/** A pipe path no one serves yet, and where a server listens for it. */
function pipe(): { path: string; listen: string } {
  const name = `etch-tongs-test-${randomBytes(8).toString('hex')}`;
  const path = `\\\\.\\pipe\\${name}`;
  return { path, listen: process.platform === 'win32' ? path : join(pipeDir, name) };
}

/** A stand-in for Tongs that answers each line with `reply(line, socket)`. */
async function serve(
  reply: (line: string, socket: Socket) => void,
): Promise<{ path: string; received: string[]; ended: Promise<void> }> {
  const { path, listen } = pipe();
  const received: string[] = [];
  let ended!: () => void;
  const endedPromise = new Promise<void>((resolve) => (ended = resolve));
  const server = createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (data: string) => {
      buffer += data;
      for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        received.push(line);
        reply(line, socket);
      }
    });
    socket.on('end', () => {
      ended();
      socket.end();
    });
    socket.on('error', () => undefined);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(listen, resolve));
  return { path, received, ended: endedPromise };
}

describe('tongsAtLeast', () => {
  it('compares the minor version of a 0.x release, and takes any 1.x as later', () => {
    expect(tongsAtLeast('0.21.0', 21)).toBe(true);
    expect(tongsAtLeast('0.36.2', 21)).toBe(true);
    expect(tongsAtLeast('0.20.9', 21)).toBe(false);
    expect(tongsAtLeast('1.0.0', 99)).toBe(true);
    expect(tongsAtLeast('0.21', 21)).toBe(false);
    expect(tongsAtLeast('', 0)).toBe(false);
  });
});

describe('connectTongs', () => {
  it('sends one line per command and takes the answers in order, however they arrive', async () => {
    const answers = new Map<string, string>([
      ['ping', '{"ok":true,"version":"0.36.0"}\r\n'],
      ['state', ''],
    ]);
    const { path, received, ended } = await serve((line, socket) => {
      if (line === 'state') {
        // Two answers in one chunk, the second split across two writes.
        socket.write('{"ok":true,"in_game":false}\n{"ok":fal');
        setTimeout(() => socket.write('se,"error":"bad_command"}\n'), 20);
        return;
      }
      const answer = answers.get(line);
      if (answer !== undefined && answer !== '') socket.write(answer);
    });
    const tongs = await connectTongs(path);
    expect(await tongs.call('ping')).toEqual({ ok: true, version: '0.36.0' });
    const [state, refused] = await Promise.all([tongs.call('state'), tongs.call('nonsense')]);
    expect(state).toEqual({ ok: true, in_game: false });
    expect(refused).toEqual({ ok: false, error: 'bad_command' });
    expect(received).toEqual(['ping', 'state', 'nonsense']);
    tongs.close();
    await ended;
  });

  it('refuses a command of more than one line without sending it', async () => {
    const { path, received } = await serve(() => undefined);
    const tongs = await connectTongs(path);
    await expect(tongs.call('key f1\nkey f2')).rejects.toThrow('A Tongs command is one line.');
    await expect(tongs.call('key f1\r')).rejects.toThrow('A Tongs command is one line.');
    tongs.close();
    expect(received).toEqual([]);
  });

  it('rejects an answer that is not a JSON object with ok', async () => {
    const { path } = await serve((line, socket) => {
      socket.write(line === 'list' ? '[1,2]\n' : '{"version":"0.36.0"}\n');
    });
    const tongs = await connectTongs(path);
    await expect(tongs.call('list')).rejects.toThrow(
      'Tongs answered "list" with something other than a JSON answer.',
    );
    await expect(tongs.call('ping')).rejects.toThrow(/something other than a JSON answer/);
    tongs.close();
  });

  it('gives up the connection when an answer is late, since a later one would be out of order', async () => {
    const { path } = await serve(() => undefined);
    const tongs = await connectTongs(path);
    await expect(tongs.call('frames', 50)).rejects.toThrow(
      'Tongs did not answer "frames" in 50 ms.',
    );
    await expect(tongs.call('ping')).rejects.toThrow('Tongs did not answer "frames" in 50 ms.');
  });

  it('rejects the waiting calls and every later one when the pipe closes', async () => {
    const { path } = await serve((_line, socket) => {
      socket.destroy();
    });
    const tongs = await connectTongs(path);
    await expect(tongs.call('ping')).rejects.toThrow('The Tongs pipe closed.');
    await expect(tongs.call('state')).rejects.toThrow('The Tongs pipe closed.');
  });

  it('rejects when no game serves the pipe', async () => {
    await expect(connectTongs(pipe().path)).rejects.toThrow();
  });
});
