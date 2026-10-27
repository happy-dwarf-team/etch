// The extension's end of the live game's session pipe (docs/plugin-protocol.md, protocol 1): JSON
// lines, every request answered once by its id. Node only, no vscode.
import { randomBytes } from 'node:crypto';
import { connect, type Socket } from 'node:net';

export const PROTOCOL_VERSION = 1;

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
}

export interface Ping {
  readonly ready: boolean;
  readonly frame: number;
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
    return { ready: answer['ready'] === true, frame: Number(answer['frame']) };
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
