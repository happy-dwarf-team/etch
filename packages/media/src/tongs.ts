// The live scene reads the live game through Tongs' pipe (happy-dwarf-team/tongs, docs/commands.md):
// whether a save is loaded, the player's capital, the province view's widgets and where they are.
// Etch's private install keeps Tongs without a pipe; the media helper (live-helper/) turns the pipe
// on in the capture's own install, with input for `province open` only.
import { connect, type Socket } from 'node:net';

export const TONGS_PIPE = '\\\\.\\pipe\\tongs';

/** A widget as `ui find` answers it; `rect` and `click_point` in client pixels. */
export interface TongsWidget {
  readonly path: string;
  readonly type: string;
  readonly visible: boolean;
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly click_point: { readonly x: number; readonly y: number };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class Tongs {
  private readonly socket: Socket;
  private buffered = '';
  private waiting: ((line: string | undefined) => void) | undefined;

  private constructor(socket: Socket) {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffered += chunk;
      const end = this.buffered.indexOf('\n');
      if (end < 0) return;
      const line = this.buffered.slice(0, end);
      this.buffered = this.buffered.slice(end + 1);
      this.waiting?.(line);
    });
    socket.on('close', () => this.waiting?.(undefined));
  }

  /** Connects to the pipe, waiting up to `timeoutMs` for it to come up. */
  static async connect(timeoutMs: number): Promise<Tongs> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      try {
        const socket = await new Promise<Socket>((resolve, reject) => {
          const socket = connect(TONGS_PIPE, () => {
            resolve(socket);
          });
          socket.once('error', reject);
        });
        return new Tongs(socket);
      } catch (error) {
        if (Date.now() > until) throw new Error(`Tongs' pipe did not come up`, { cause: error });
        await sleep(1_000);
      }
    }
  }

  /** Sends one command and resolves to its answer; an `ok: false` answer throws. */
  async send<T = Record<string, unknown>>(command: string, timeoutMs = 30_000): Promise<T> {
    const line = await new Promise<string | undefined>((resolve) => {
      const timer = setTimeout(() => {
        resolve(undefined);
      }, timeoutMs);
      this.waiting = (answer) => {
        clearTimeout(timer);
        this.waiting = undefined;
        resolve(answer);
      };
      this.socket.write(`${command}\n`);
    });
    if (line === undefined) throw new Error(`Tongs did not answer "${command}"`);
    const answer = JSON.parse(line) as { ok?: boolean; error?: string } & T;
    if (answer.ok === false) throw new Error(`Tongs: "${command}": ${answer.error ?? line}`);
    return answer;
  }

  /** The one visible widget a selector matches. */
  async widget(selector: string): Promise<TongsWidget> {
    const answer = await this.send<{ matches: TongsWidget[] }>(`ui find ${selector}`);
    const visible = answer.matches.filter((match) => match.visible);
    if (visible.length !== 1) {
      throw new Error(`"${selector}" matches ${String(visible.length)} visible widgets, not one`);
    }
    return visible[0] as TongsWidget;
  }

  close(): void {
    this.socket.end();
  }
}
