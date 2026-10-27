// The extension's end of the live game's session pipe (docs/plugin-protocol.md, protocol 2): JSON
// lines, every request answered once by its id. Node only, no vscode.
import { randomBytes } from 'node:crypto';
import { connect, type Socket } from 'node:net';

export const PROTOCOL_VERSION = 2;

/** A fresh session id: 128 random bits as 32 lowercase hex digits. */
export function newSessionId(): string {
  return randomBytes(16).toString('hex');
}

export function pipePath(session: string): string {
  return `\\\\.\\pipe\\etch-host-${session}`;
}

/** The answer to `hello`. */
export interface Hello {
  readonly protocol: number;
  readonly plugin: string;
  readonly session: string;
  readonly pid: number;
  readonly process_start_ms: number;
  readonly ready: boolean;
  readonly frame: number;
  /** Tongs' `tongs.ui` was found: reloads check the stale windows. */
  readonly tree: boolean;
}

/** The game session the plugin last saw: a loaded save or new game. */
export interface GameSession {
  readonly ironman: boolean;
  readonly multiplayer: boolean;
  /** 1 for the first session since the game started, then 2, ... */
  readonly number: number;
}

export interface Ping {
  readonly ready: boolean;
  readonly frame: number;
  /** The game's window takes messages: it does while a save loads, unlike a hung game. */
  readonly responding: boolean;
  /** A reload or a save of the plugin waits for or runs on the main thread. */
  readonly busy: boolean;
  /** `undefined` in the main menu. */
  readonly gameSession: GameSession | undefined;
}

/** What a `reload` asks the plugin to do, in one job on the main thread. */
export interface ReloadRequest {
  /** `reload <file>.gui`, `reloadloc` or `reloadtexture <texture>` only. */
  readonly lines: readonly string[];
  /** Game paths whose top-level windows are checked for stale ones afterwards. */
  readonly check?: readonly string[];
  /** Windows closed through the game before the lines, when visible. */
  readonly close?: readonly string[];
  /** Windows closed again when the lines showed them (a rebuild opens the province view, H2). */
  readonly keepHidden?: readonly string[];
}

export interface ConsoleLine {
  readonly line: string;
  readonly success: boolean;
  readonly text: string;
  readonly ms: number;
}

/** The answer to a `reload`. */
export interface ReloadAnswer {
  readonly lines: readonly ConsoleLine[];
  readonly closed: readonly string[];
  readonly hiddenAgain: readonly string[];
  /**
   * The stale-window check, `undefined` without `tongs.ui`: how many top-level windows were built
   * from the checked files, which of them were not rebuilt, and the top-level windows in all.
   */
  readonly check:
    | {
        readonly checked: number;
        readonly stale: readonly { readonly name: string; readonly visible: boolean }[];
        readonly roots: { readonly before: number; readonly after: number };
      }
    | undefined;
  readonly queuedMs: number;
  readonly runMs: number;
}

/** The answer to a `save`. */
export interface SaveAnswer {
  readonly success: boolean;
  readonly text: string;
  readonly ms: number;
  readonly queuedMs: number;
}

/** An `"ok": false` answer, or a pipe that broke before the answer. */
export class PipeError extends Error {
  readonly code: string;
  /** The whole `"ok": false` answer, when the plugin sent one. */
  readonly answer: Record<string, unknown> | undefined;
  constructor(code: string, message: string, answer?: Record<string, unknown>) {
    super(message);
    this.name = 'PipeError';
    this.code = code;
    this.answer = answer;
  }
}

interface Waiting {
  resolve(answer: Record<string, unknown>): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

/** One connection to the plugin, after a successful handshake. */
export class HostPipe {
  readonly hello: Hello;
  private readonly socket: Socket;
  private readonly waiting: Map<number, Waiting>;
  private nextId: number;

  private constructor(socket: Socket, waiting: Map<number, Waiting>, nextId: number, hello: Hello) {
    this.socket = socket;
    this.waiting = waiting;
    this.nextId = nextId;
    this.hello = hello;
  }

  /**
   * Connects and greets the plugin. Rejects with `PipeError` `no_pipe` while the pipe is not up
   * yet (or busy), and with the plugin's error code when it refuses the handshake.
   */
  static async connect(session: string, timeoutMs = 2_000): Promise<HostPipe> {
    const socket = await new Promise<Socket>((resolve, reject) => {
      const s = connect(pipePath(session));
      s.once('connect', () => {
        s.removeAllListeners('error');
        resolve(s);
      });
      s.once('error', (error: NodeJS.ErrnoException) => {
        s.destroy();
        reject(
          new PipeError(
            'no_pipe',
            `The live game's pipe is not up (${error.code ?? error.message}).`,
          ),
        );
      });
    });
    const waiting = new Map<number, Waiting>();
    let buffered = '';
    const failAll = (error: Error): void => {
      for (const [id, w] of waiting) {
        clearTimeout(w.timer);
        waiting.delete(id);
        w.reject(error);
      }
    };
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffered += chunk;
      for (let end = buffered.indexOf('\n'); end >= 0; end = buffered.indexOf('\n')) {
        const line = buffered.slice(0, end).replace(/\r$/, '');
        buffered = buffered.slice(end + 1);
        let answer: Record<string, unknown>;
        try {
          answer = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const id = answer['id'];
        const w = typeof id === 'number' ? waiting.get(id) : undefined;
        if (w === undefined || typeof id !== 'number') continue;
        clearTimeout(w.timer);
        waiting.delete(id);
        w.resolve(answer);
      }
    });
    socket.on('error', (error) => {
      failAll(new PipeError('pipe_broken', `The live game's pipe broke: ${error.message}`));
    });
    socket.on('close', () => {
      failAll(new PipeError('pipe_closed', "The live game's pipe closed."));
    });
    const request = HostPipe.requester(socket, waiting);
    try {
      const answer = await request(1, { type: 'hello', protocol: PROTOCOL_VERSION }, timeoutMs);
      const hello = answer as unknown as Hello;
      if (hello.protocol !== PROTOCOL_VERSION || typeof hello.pid !== 'number') {
        throw new PipeError('protocol_mismatch', 'The live game answered with another protocol.');
      }
      if (hello.session !== session) {
        throw new PipeError('wrong_session', 'The pipe answered for another session.');
      }
      return new HostPipe(socket, waiting, 2, hello);
    } catch (error) {
      socket.destroy();
      throw error;
    }
  }

  async ping(timeoutMs = 2_000): Promise<Ping> {
    const answer = await this.request({ type: 'ping' }, timeoutMs);
    const session = answer['game_session'] as Record<string, unknown> | null | undefined;
    return {
      ready: answer['ready'] === true,
      frame: Number(answer['frame']),
      responding: answer['responding'] !== false,
      busy: answer['busy'] === true,
      gameSession:
        session === null || typeof session !== 'object'
          ? undefined
          : {
              ironman: session['ironman'] === true,
              multiplayer: session['multiplayer'] === true,
              number: Number(session['number']),
            },
    };
  }

  /**
   * Runs a reload on the game's main thread (docs/plugin-protocol.md, `reload`). Rejects with
   * `PipeError` `not_available` in ironman and multiplayer, `console_fault` when the game's console
   * faulted, and `busy` while another job runs.
   */
  async reload(request: ReloadRequest, timeoutMs = 10_000): Promise<ReloadAnswer> {
    const answer = await this.request(
      {
        type: 'reload',
        lines: request.lines,
        check: request.check ?? [],
        close: request.close ?? [],
        keep_hidden: request.keepHidden ?? [],
      },
      timeoutMs,
    );
    const roots = answer['roots'] as { before: number; after: number } | undefined;
    return {
      lines: (answer['lines'] as ConsoleLine[] | undefined) ?? [],
      closed: (answer['closed'] as string[] | undefined) ?? [],
      hiddenAgain: (answer['hidden_again'] as string[] | undefined) ?? [],
      check:
        answer['tree'] === true && roots !== undefined
          ? {
              checked: Number(answer['checked']),
              stale: (answer['stale'] as { name: string; visible: boolean }[] | undefined) ?? [],
              roots,
            }
          : undefined,
      queuedMs: Number(answer['queued_ms']),
      runMs: Number(answer['run_ms']),
    };
  }

  /** Saves the loaded game as `save games/<name>.eu4` through the game's console (`savegame`). */
  async save(name: string, timeoutMs = 120_000): Promise<SaveAnswer> {
    const answer = await this.request({ type: 'save', name }, timeoutMs);
    return {
      success: answer['success'] === true,
      text: typeof answer['text'] === 'string' ? answer['text'] : '',
      ms: Number(answer['ms']),
      queuedMs: Number(answer['queued_ms']),
    };
  }

  /** Sends one request and waits for its answer; rejects with `PipeError` on `"ok": false`. */
  request(body: { type: string } & Record<string, unknown>, timeoutMs = 2_000) {
    const id = this.nextId++;
    return HostPipe.requester(this.socket, this.waiting)(id, body, timeoutMs);
  }

  close(): void {
    this.socket.destroy();
  }

  private static requester(socket: Socket, waiting: Map<number, Waiting>) {
    return (
      id: number,
      body: { type: string } & Record<string, unknown>,
      timeoutMs: number,
    ): Promise<Record<string, unknown>> =>
      new Promise((resolve, reject) => {
        if (socket.destroyed) {
          reject(new PipeError('pipe_closed', "The live game's pipe closed."));
          return;
        }
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new PipeError('timeout', `The live game did not answer ${body.type} in time.`));
        }, timeoutMs);
        waiting.set(id, {
          resolve: (answer) => {
            if (answer['ok'] === true) resolve(answer);
            else {
              const code = typeof answer['error'] === 'string' ? answer['error'] : 'error';
              const message = typeof answer['message'] === 'string' ? answer['message'] : code;
              reject(new PipeError(code, message, answer));
            }
          },
          reject,
          timer,
        });
        socket.write(`${JSON.stringify({ id, ...body })}\n`);
      });
  }
}
