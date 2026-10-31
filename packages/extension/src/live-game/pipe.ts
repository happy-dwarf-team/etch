// The extension's end of the live game's session pipe (docs/plugin-protocol.md, protocol 2): JSON
// lines, every request answered once by its id, and the plugin's pushes (picks, their snapshots and
// pick mode changes), which carry an `event` instead. Node only, no vscode.
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
  /** Pick mode is on in the game. */
  readonly pick: boolean;
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
  /** The Escape of `keepHidden` opened the game's menu (no panel to close), which was closed again. */
  readonly menuUndone: boolean;
  /**
   * The stale-window check, `undefined` without `tongs.ui`: how many top-level windows were built
   * from the checked files, which of them were not rebuilt, and the top-level windows in all.
   */
  readonly check:
    | {
        readonly checked: number;
        readonly stale: readonly { readonly name: string; readonly visible: boolean }[];
        /** The visible top-level windows after the job, with the game path of their file. */
        readonly visible: readonly { readonly name: string; readonly file: string }[];
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

/** What `pick_mode` asks for; every member is optional (docs/plugin-protocol.md, `pick_mode`). */
export interface PickModeRequest {
  /** Turn pick mode on or off; absent leaves it. */
  readonly on?: boolean;
  /** The hotkey, such as `Ctrl+Shift+E`. */
  readonly key?: string;
  /** The interface files a mod supplies, by game path, with the mod's name: what the label names. */
  readonly sources?: Readonly<Record<string, string>>;
  /** VS Code's window, which the game brings forward after a pick. */
  readonly editor?: { readonly pid: number; readonly title: string };
  /** Bring the game's window to the front. */
  readonly front?: boolean;
}

export interface PickModeAnswer {
  readonly on: boolean;
  readonly key: string;
  /** Whether the game came to the front, when asked. */
  readonly front: boolean | undefined;
}

/** A widget of a pick's chain: the picked widget, then its parents up to its top-level window. */
export interface PickedWidget {
  readonly name: string;
  readonly type: string;
  /** Tongs' widget path from the top-level window. */
  readonly path: string;
  /** The game path of its definition's file; `undefined` when stale or unknown. */
  readonly file: string | undefined;
  /** The 1-based line of the `{` that opens its definition (H2); 0 when unknown. */
  readonly line: number;
  readonly rect: readonly [number, number, number, number];
  readonly visible: boolean;
  readonly stale: boolean;
}

/** A click in pick mode (the plugin's `pick` push). */
export interface PickEvent {
  readonly seq: number;
  /** The picked widget's top-level window. */
  readonly window: string;
  /** The game window's client size. */
  readonly screen: { readonly width: number; readonly height: number };
  readonly chain: readonly PickedWidget[];
  /** The picked widget's place among the widgets under the pointer. */
  readonly stack: { readonly index: number; readonly size: number };
  /** VS Code's window was brought forward by the game. */
  readonly front: boolean;
  readonly timing: {
    /** The click by the system clock, in Unix ms. */
    readonly clickUnixMs: number;
    readonly clickToFrameMs: number;
    readonly readMs: number;
  };
}

/** One widget of a live snapshot, as the plugin reads it. */
export interface SnapshotWidget {
  readonly path: string;
  readonly type: string;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly checked: boolean;
  /** `undefined` for a widget without text. */
  readonly text: string | undefined;
  /** The text with the game's colour codes (`Â§Gâ€¦Â§!`), when it has some. */
  readonly markup?: string;
  readonly rect: readonly [number, number, number, number];
}

/** A live snapshot of a top-level window as the plugin sends it (`snapshot`). */
export interface SnapshotAnswer {
  readonly window: string;
  /** The game path of the window's definition file. */
  readonly file: string | undefined;
  readonly screen: { readonly width: number; readonly height: number };
  readonly widgets: readonly SnapshotWidget[];
  /** Stale widgets inside the window, left out. */
  readonly stale: number;
  readonly readMs: number;
}

/** A line the plugin pushes on its own. */
export type PipeEvent =
  | { readonly kind: 'pick'; readonly pick: PickEvent }
  /** The snapshot that follows a pick, or why there is none (`stale`). */
  | {
      readonly kind: 'snapshot';
      readonly seq: number;
      readonly snapshot: SnapshotAnswer | undefined;
      readonly error: string | undefined;
    }
  | { readonly kind: 'pickMode'; readonly on: boolean };

/** Reads a push line; `undefined` for an event this version does not know. */
export function readEvent(line: Record<string, unknown>): PipeEvent | undefined {
  switch (line['event']) {
    case 'pick':
      return { kind: 'pick', pick: readPick(line) };
    case 'snapshot': {
      const error = typeof line['error'] === 'string' ? line['error'] : undefined;
      return {
        kind: 'snapshot',
        seq: Number(line['seq']),
        snapshot: error === undefined ? readSnapshot(line) : undefined,
        error,
      };
    }
    case 'pick_mode':
      return { kind: 'pickMode', on: line['on'] === true };
    default:
      return undefined;
  }
}

function rectOf(value: unknown): readonly [number, number, number, number] {
  const r = Array.isArray(value) ? value.map(Number) : [];
  return [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0, r[3] ?? 0];
}

function screenOf(value: unknown): { width: number; height: number } {
  const s = (value ?? {}) as Record<string, unknown>;
  return { width: Number(s['width'] ?? 0), height: Number(s['height'] ?? 0) };
}

function readPick(line: Record<string, unknown>): PickEvent {
  const chain = Array.isArray(line['chain']) ? (line['chain'] as Record<string, unknown>[]) : [];
  const stack = (line['stack'] ?? {}) as Record<string, unknown>;
  const timing = (line['timing'] ?? {}) as Record<string, unknown>;
  return {
    seq: Number(line['seq']),
    window: typeof line['window'] === 'string' ? line['window'] : '',
    screen: screenOf(line['screen']),
    chain: chain.map((w) => ({
      name: typeof w['name'] === 'string' ? w['name'] : '',
      type: typeof w['type'] === 'string' ? w['type'] : 'other',
      path: typeof w['path'] === 'string' ? w['path'] : '',
      file: typeof w['file'] === 'string' ? w['file'] : undefined,
      line: Number(w['line'] ?? 0),
      rect: rectOf(w['rect']),
      visible: w['visible'] === true,
      stale: w['stale'] === true,
    })),
    stack: { index: Number(stack['index'] ?? 0), size: Number(stack['size'] ?? 1) },
    front: line['front'] === true,
    timing: {
      clickUnixMs: Number(timing['click_unix_ms'] ?? 0),
      clickToFrameMs: Number(timing['click_to_frame_ms'] ?? 0),
      readMs: Number(timing['read_ms'] ?? 0),
    },
  };
}

/** The members of a `snapshot` answer or push. */
export function readSnapshot(line: Record<string, unknown>): SnapshotAnswer {
  const widgets = Array.isArray(line['widgets'])
    ? (line['widgets'] as Record<string, unknown>[])
    : [];
  return {
    window: typeof line['window'] === 'string' ? line['window'] : '',
    file: typeof line['file'] === 'string' ? line['file'] : undefined,
    screen: screenOf(line['screen']),
    widgets: widgets.map((w) => ({
      path: typeof w['path'] === 'string' ? w['path'] : '',
      type: typeof w['type'] === 'string' ? w['type'] : 'other',
      visible: w['visible'] === true,
      enabled: w['enabled'] !== false,
      checked: w['checked'] === true,
      text: typeof w['text'] === 'string' ? w['text'] : undefined,
      ...(typeof w['markup'] === 'string' ? { markup: w['markup'] } : {}),
      rect: rectOf(w['rect']),
    })),
    stale: Number(line['stale'] ?? 0),
    readMs: Number(line['read_ms'] ?? 0),
  };
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
  private readonly listeners: Set<(event: PipeEvent) => void>;
  private nextId: number;

  private constructor(
    socket: Socket,
    waiting: Map<number, Waiting>,
    listeners: Set<(event: PipeEvent) => void>,
    nextId: number,
    hello: Hello,
  ) {
    this.socket = socket;
    this.waiting = waiting;
    this.listeners = listeners;
    this.nextId = nextId;
    this.hello = hello;
  }

  /** Calls `listener` with every push of the plugin; returns what removes it. */
  onEvent(listener: (event: PipeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
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
    const listeners = new Set<(event: PipeEvent) => void>();
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
        if (id === undefined && typeof answer['event'] === 'string') {
          const event = readEvent(answer);
          if (event !== undefined) for (const listener of listeners) listener(event);
          continue;
        }
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
      return new HostPipe(socket, waiting, listeners, 2, hello);
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
      pick: answer['pick'] === true,
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
      menuUndone: answer['menu_undone'] === true,
      check:
        answer['tree'] === true && roots !== undefined
          ? {
              checked: Number(answer['checked']),
              stale: (answer['stale'] as { name: string; visible: boolean }[] | undefined) ?? [],
              visible: (answer['visible'] as { name: string; file: string }[] | undefined) ?? [],
              roots,
            }
          : undefined,
      queuedMs: Number(answer['queued_ms']),
      runMs: Number(answer['run_ms']),
    };
  }

  /**
   * Answers a prompt with Enter when its button is on screen (`DefaultConfirm/AgreeButton`,
   * Anbennar's achievements prompt, H7): whether it was found and the key posted.
   */
  async confirm(path: string, timeoutMs = 10_000): Promise<{ found: boolean; pressed: boolean }> {
    const answer = await this.request({ type: 'confirm', path }, timeoutMs);
    return { found: answer['found'] === true, pressed: answer['pressed'] === true };
  }

  /**
   * Saves the loaded game through the game's `autosave`, which writes `save games/autosave.eu4`
   * after the answer (the console's `savegame` writes nothing, live).
   */
  async save(timeoutMs = 120_000): Promise<SaveAnswer> {
    const answer = await this.request({ type: 'save' }, timeoutMs);
    return {
      success: answer['success'] === true,
      text: typeof answer['text'] === 'string' ? answer['text'] : '',
      ms: Number(answer['ms']),
      queuedMs: Number(answer['queued_ms']),
    };
  }

  /**
   * Turns pick mode on or off, sets its hotkey, the mods the label names and VS Code's window, or
   * brings the game to the front (docs/plugin-protocol.md, `pick_mode`). Rejects with `PipeError`
   * `no_tree` without `tongs.ui`.
   */
  async pickMode(request: PickModeRequest, timeoutMs = 5_000): Promise<PickModeAnswer> {
    const answer = await this.request({ type: 'pick_mode', ...request }, timeoutMs);
    return {
      on: answer['on'] === true,
      key: typeof answer['key'] === 'string' ? answer['key'] : '',
      front: typeof answer['front'] === 'boolean' ? answer['front'] : undefined,
    };
  }

  /**
   * A live snapshot of a visible top-level window (docs/plugin-protocol.md, `snapshot`). Rejects
   * with `PipeError` `not_open` when the game does not show it, `stale` when it is stale.
   */
  async snapshot(window: string, timeoutMs = 10_000): Promise<SnapshotAnswer> {
    return readSnapshot(await this.request({ type: 'snapshot', window }, timeoutMs));
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
