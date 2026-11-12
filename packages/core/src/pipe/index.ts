// Opening the game's named pipes (Tongs' `\\.\pipe\tongs`, the Etch plugin's `\\.\pipe\etch-host-<session>`).
// Node only; the browser-side renderer never imports it.
//
// On Windows the pipe is opened directly. A Linux process cannot open a pipe that lives in Wine's wineserver, so under
// Wine the plugins also serve the same session on a socket on 127.0.0.1: Tongs when its `bridge` setting is on, Etch's
// plugin always, for the session Etch started. Each writes its port and a token to a state file (Tongs:
// `<state dir>/tongs/bridge.json`; Etch's plugin: `<bridge folder>/etch-host-<session>.json`). The first line sent is
// `RELAY <token> <pipe name>`, answered `OK` or `ERR <reason>`. Everything after the `OK` line is the pipe's own stream.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { connect, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface BridgeEnvironment {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly homedir: string;
  readonly platform: NodeJS.Platform;
  /**
   * A folder whose Unix sockets stand in for the pipes: `\\.\pipe\<name>` is `<folder>/<name>`, connected to
   * directly (no socket). For test fixtures; `ETCH_PIPE_DIRECT=<folder>` sets it for the system environment.
   */
  readonly direct?: string | undefined;
}

function systemBridgeEnvironment(): BridgeEnvironment {
  return {
    env: process.env,
    homedir: homedir(),
    platform: process.platform,
    direct: process.env['ETCH_PIPE_DIRECT'],
  };
}

/**
 * The state folder of the user (`$XDG_STATE_HOME`, else `~/.local/state`). A Flatpak sandbox (VS Code from Flathub) remaps
 * `XDG_STATE_HOME` into its own folder, but the game runs on the host, whose state folder is the real one, so there it
 * is always `~/.local/state`.
 */
function stateFolder(
  environment: BridgeEnvironment,
  flatpak: boolean = existsSync('/.flatpak-info'),
): string {
  const xdg = environment.env['XDG_STATE_HOME'];
  if (!flatpak && xdg !== undefined && xdg !== '') return xdg;
  return join(environment.homedir, '.local', 'state');
}

/**
 * The folder for the state files of the Etch plugin's sessions: `ETCH_HOST_BRIDGE_DIR` when set (the name the game
 * receives it under), else `etch` in the state folder. The extension makes it (mode 0700) before it starts the game.
 */
export function bridgeFolder(
  environment: BridgeEnvironment = systemBridgeEnvironment(),
  flatpak: boolean = existsSync('/.flatpak-info'),
): string {
  const explicit = environment.env['ETCH_HOST_BRIDGE_DIR'];
  if (explicit !== undefined && explicit !== '') return explicit;
  return join(stateFolder(environment, flatpak), 'etch');
}

/**
 * The state file of the pipe `name`: for Tongs' pipe `TONGS_BRIDGE`, else `tongs/bridge.json` in the state folder;
 * for a session of the Etch plugin `<name>.json` in the bridge folder.
 */
export function bridgeStatePath(
  name: string,
  environment: BridgeEnvironment = systemBridgeEnvironment(),
): string {
  if (name === 'tongs') {
    const explicit = environment.env['TONGS_BRIDGE'];
    if (explicit !== undefined && explicit !== '') return explicit;
    return join(stateFolder(environment), 'tongs', 'bridge.json');
  }
  return join(bridgeFolder(environment), `${name}.json`);
}

/** The pipe's name in `\\.\pipe\<name>`; `undefined` when `path` is not a local pipe path. */
export function pipeName(path: string): string | undefined {
  return /^\\\\\.\\pipe\\([^\\]+)$/.exec(path)?.[1];
}

/** Whether the answer line grants the pipe. */
function granted(line: string): boolean {
  return line.trim() === 'OK';
}

/**
 * A connected socket to the named pipe at `path` (`\\.\pipe\<name>`). Rejects with the connection's own error
 * (`ENOENT` for a game that serves no socket, `ECONNREFUSED` for a stale state file, `EACCES` for a refused pipe)
 * so that callers can treat all of them as "the pipe is not up".
 */
export function openPipe(
  path: string,
  environment: BridgeEnvironment = systemBridgeEnvironment(),
): Promise<Socket> {
  const folder = environment.direct;
  const target =
    folder !== undefined && folder !== '' ? join(folder, pipeName(path) ?? path) : path;
  if (environment.platform === 'win32' || target !== path) {
    return new Promise((resolve, reject) => {
      const socket = connect(target);
      socket.once('connect', () => {
        socket.removeAllListeners('error');
        resolve(socket);
      });
      socket.once('error', (error) => {
        socket.destroy();
        reject(error);
      });
    });
  }
  return openThroughSocket(path, environment);
}

async function openThroughSocket(path: string, environment: BridgeEnvironment): Promise<Socket> {
  const name = pipeName(path);
  if (name === undefined) throw errno('EINVAL', `${path} is not a local pipe path`);
  let state: { port?: unknown; token?: unknown };
  try {
    state = JSON.parse(await readFile(bridgeStatePath(name, environment), 'utf8')) as typeof state;
  } catch (error) {
    throw errno(
      (error as NodeJS.ErrnoException).code ?? 'ENOENT',
      `the state file of the game socket cannot be read: ${(error as Error).message}`,
    );
  }
  if (typeof state.port !== 'number' || typeof state.token !== 'string') {
    throw errno('EINVAL', `the state file of the game socket has no port and token`);
  }
  const { port, token } = state;
  return new Promise<Socket>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    let answer = Buffer.alloc(0);
    const fail = (error: Error): void => {
      socket.destroy();
      reject(error);
    };
    socket.once('error', fail);
    socket.once('connect', () => {
      socket.write(`RELAY ${token} ${name}\n`);
    });
    const onData = (chunk: Buffer): void => {
      answer = Buffer.concat([answer, chunk]);
      const end = answer.indexOf(0x0a);
      if (end < 0) {
        if (answer.length > 256) fail(errno('EPROTO', 'the game socket answered no line'));
        return;
      }
      socket.off('data', onData);
      socket.off('error', fail);
      const line = answer.subarray(0, end).toString('utf8');
      if (!granted(line)) {
        fail(errno('EACCES', `the game socket refused ${name}: ${line.trim()}`));
        return;
      }
      // Bytes that came with the answer already belong to the pipe's stream. The socket waits until the caller has
      // attached its listeners (they do so right after this promise settles).
      socket.pause();
      const rest = answer.subarray(end + 1);
      if (rest.length > 0) socket.unshift(rest);
      setImmediate(() => socket.resume());
      resolve(socket);
    };
    socket.on('data', onData);
    socket.once('close', () => {
      if (answer.indexOf(0x0a) < 0)
        fail(errno('ECONNRESET', 'the game socket closed the connection'));
    });
  });
}

function errno(code: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}
