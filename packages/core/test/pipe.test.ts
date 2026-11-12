import { createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bridgeFolder, bridgeStatePath, openPipe, pipeName } from '../src/pipe/index.ts';

// A stand-in for the sockets Tongs and the Etch plugin serve under Wine: `RELAY <token> <pipe>` answered OK, then JSON lines.
describe('the pipe sockets', () => {
  let server: Server;
  let port: number;
  let dir: string;
  const lines: string[] = [];
  const linux = (extra: Record<string, string> = {}) => ({
    env: { TONGS_BRIDGE: join(dir, 'bridge.json'), ETCH_HOST_BRIDGE_DIR: dir, ...extra },
    homedir: '/nowhere',
    platform: 'linux' as const,
  });

  beforeEach(async () => {
    lines.length = 0;
    dir = await mkdtemp(join(tmpdir(), 'etch-pipe-sockets-'));
    server = createServer((client: Socket) => {
      let buffered = '';
      let granted = false;
      client.on('data', (chunk) => {
        buffered += chunk.toString('utf8');
        for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
          const line = buffered.slice(0, end);
          buffered = buffered.slice(end + 1);
          lines.push(line);
          if (!granted) {
            const [verb, token, pipe] = line.split(' ');
            if (verb !== 'RELAY' || token !== 'secret') client.end('ERR bad token\n');
            else if (pipe !== 'tongs' && !/^etch-host-[0-9a-f]{32}$/.test(pipe ?? ''))
              client.end('ERR pipe not served\n');
            else {
              granted = true;
              // The first pipe bytes come in the same chunk as the answer.
              client.write('OK\n{"hello":true}\n');
            }
          } else {
            client.write(`${JSON.stringify({ ok: true, echo: line })}\n`);
          }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
    await writeFile(join(dir, 'bridge.json'), JSON.stringify({ port, token: 'secret', pid: 1 }));
  });

  afterEach(async () => {
    server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const readLine = (socket: Socket): Promise<string> =>
    new Promise((resolve) => {
      let text = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        text += chunk;
        const end = text.indexOf('\n');
        if (end >= 0) resolve(text.slice(0, end));
      });
    });

  it('opens the Tongs pipe through its socket and keeps the bytes that came with the answer', async () => {
    const socket = await openPipe('\\\\.\\pipe\\tongs', linux());
    expect(await readLine(socket)).toBe('{"hello":true}');
    socket.write('ping\n');
    expect(JSON.parse(await readLine(socket))).toEqual({ ok: true, echo: 'ping' });
    expect(lines[0]).toBe('RELAY secret tongs');
    socket.destroy();
  });

  it("opens the Etch plugin's session pipe through the state file of that session", async () => {
    const session = 'a'.repeat(32);
    await writeFile(
      join(dir, `etch-host-${session}.json`),
      JSON.stringify({ port, token: 'secret', pid: 1 }),
    );
    const socket = await openPipe(`\\\\.\\pipe\\etch-host-${session}`, linux());
    expect(lines[0]).toBe(`RELAY secret etch-host-${session}`);
    socket.destroy();
  });

  it('rejects a pipe the game does not serve, and a wrong token, with EACCES', async () => {
    await writeFile(join(dir, 'evil.json'), JSON.stringify({ port, token: 'secret' }));
    await expect(openPipe('\\\\.\\pipe\\evil', linux())).rejects.toMatchObject({
      code: 'EACCES',
    });
    await writeFile(join(dir, 'bridge.json'), JSON.stringify({ port, token: 'wrong' }));
    await expect(openPipe('\\\\.\\pipe\\tongs', linux())).rejects.toMatchObject({
      code: 'EACCES',
    });
  });

  it('rejects with ENOENT while the game serves no socket, and ECONNREFUSED for a stale state file', async () => {
    await expect(
      openPipe('\\\\.\\pipe\\tongs', linux({ TONGS_BRIDGE: join(dir, 'none.json') })),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      openPipe(`\\\\.\\pipe\\etch-host-${'b'.repeat(32)}`, linux()),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(join(dir, 'bridge.json'), JSON.stringify({ port: 1, token: 'secret' }));
    await expect(openPipe('\\\\.\\pipe\\tongs', linux())).rejects.toMatchObject({
      code: 'ECONNREFUSED',
    });
  });

  it('knows the pipe name of a path and where the state files live', () => {
    const linuxEnv = (env: Record<string, string>) => ({
      env,
      homedir: '/h',
      platform: 'linux' as const,
    });
    expect(pipeName('\\\\.\\pipe\\tongs')).toBe('tongs');
    expect(pipeName('/tmp/x')).toBeUndefined();
    // Tongs: tongs/bridge.json in the state folder, or where TONGS_BRIDGE says.
    expect(bridgeStatePath('tongs', linuxEnv({ XDG_STATE_HOME: '/s' }))).toBe(
      join('/s', 'tongs', 'bridge.json'),
    );
    expect(bridgeStatePath('tongs', linuxEnv({}))).toBe(
      join('/h', '.local', 'state', 'tongs', 'bridge.json'),
    );
    expect(bridgeStatePath('tongs', linuxEnv({ TONGS_BRIDGE: '/x/b.json' }))).toBe('/x/b.json');
    // The Etch plugin: <session pipe>.json in the bridge folder.
    expect(bridgeStatePath('etch-host-1', linuxEnv({}))).toBe(
      join('/h', '.local', 'state', 'etch', 'etch-host-1.json'),
    );
    expect(bridgeStatePath('etch-host-1', linuxEnv({ ETCH_HOST_BRIDGE_DIR: '/b' }))).toBe(
      join('/b', 'etch-host-1.json'),
    );
    expect(bridgeFolder(linuxEnv({ XDG_STATE_HOME: '/s' }), false)).toBe(join('/s', 'etch'));
    // A Flatpak sandbox remaps XDG_STATE_HOME, but the game runs on the host: the real one is used.
    expect(bridgeFolder(linuxEnv({ XDG_STATE_HOME: '/remapped' }), true)).toBe(
      join('/h', '.local', 'state', 'etch'),
    );
  });
});
