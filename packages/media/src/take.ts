// A take (docs/media.md, "Takes"): one recorded run of a clip's steps. Its masters (VS Code's window,
// and the game's in the live takes) are recorded by `gfxcapture` against one clock, whose zero is
// the take's epoch, and every step logs an event at its time on that clock with the rects the
// edit needs: a line in the editor, a widget in the preview or the game. The edit (edit.ts) is
// built from the log alone, after the run.
import type { Point, Rect } from './edit.ts';
import { GfxCapture } from './ffmpeg.ts';

/** Unix time in ms with the precision of `performance.now()`: the clock of the masters. */
export const now = (): number => performance.timeOrigin + performance.now();

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface TakeEvent {
  /** Seconds since the take's epoch: the masters' time. */
  readonly t: number;
  readonly kind: string;
  /** The master the rect or point belongs to. */
  readonly source?: string;
  readonly rect?: Rect;
  readonly point?: Point;
  readonly label?: string;
}

export interface TakeSource {
  /** The master's file name, in the masters folder. */
  readonly master: string;
  readonly width: number;
  readonly height: number;
}

export interface TakeLog {
  readonly id: string;
  readonly capturedAt: string;
  readonly sources: Readonly<Record<string, TakeSource>>;
  readonly events: readonly TakeEvent[];
  /** The drawn pointer's path in VS Code's master (Playwright's mouse is not the system pointer). */
  readonly pointer: readonly (Point & { readonly t: number })[];
  readonly clicks: readonly number[];
}

export class Take {
  readonly id: string;
  private readonly ffmpeg: string;
  private readonly epochMs = now();
  private readonly events: TakeEvent[] = [];
  private readonly pointer: (Point & { t: number })[] = [];
  private readonly clicks: number[] = [];
  private readonly recordings: {
    name: string;
    file: string;
    capture: GfxCapture;
    nudge: (() => Promise<void>) | undefined;
  }[] = [];

  constructor(id: string, ffmpeg: string) {
    this.id = id;
    this.ffmpeg = ffmpeg;
  }

  /** The take's clock now, in seconds. */
  t(): number {
    return (now() - this.epochMs) / 1000;
  }

  /** Waits until the take's clock reads `t`. */
  async until(t: number): Promise<void> {
    await sleep(Math.max(0, (t - this.t()) * 1000));
  }

  /** Logs an event now and returns its time. */
  mark(kind: string, details: Omit<TakeEvent, 't' | 'kind'> = {}): number {
    const t = this.t();
    this.events.push({ t, kind, ...details });
    return t;
  }

  /**
   * Moves the rects and points of one source's events by `offset`: from the coordinates they were
   * read in (the game's client area) to its master's, once the master is measured.
   */
  shift(source: string, offset: Point): void {
    for (const [i, event] of this.events.entries()) {
      if (event.source !== source) continue;
      this.events[i] = {
        ...event,
        ...(event.rect === undefined
          ? {}
          : { rect: { ...event.rect, x: event.rect.x + offset.x, y: event.rect.y + offset.y } }),
        ...(event.point === undefined
          ? {}
          : { point: { x: event.point.x + offset.x, y: event.point.y + offset.y } }),
      };
    }
  }

  /** The last event logged, for an error message. */
  lastEvent(): string {
    const last = this.events[this.events.length - 1];
    return last === undefined ? 'none' : `${last.kind} at ${last.t.toFixed(2)} s`;
  }

  /** Logs where the drawn pointer is now, in VS Code's master. */
  pointerAt(point: Point): void {
    this.pointer.push({ t: this.t(), ...point });
  }

  click(): void {
    this.clicks.push(this.t());
  }

  /**
   * Starts recording a window as the master `name`, against the take's clock. `nudge` makes the
   * window draw once, so its recording can stop while it stands still (`GfxCapture.stop`).
   */
  async record(
    name: string,
    hwnd: string,
    file: string,
    options: { cursor?: boolean; nudge?: () => Promise<void> } = {},
  ): Promise<void> {
    const capture = await GfxCapture.start(this.ffmpeg, hwnd, file, {
      epochUs: Math.round(this.epochMs * 1000),
      cursor: options.cursor === true,
    });
    this.recordings.push({ name, file, capture, nudge: options.nudge });
  }

  async stop(): Promise<void> {
    await Promise.all(this.recordings.map(({ capture, nudge }) => capture.stop(nudge)));
  }

  /** The log, once the masters are stopped and measured. */
  log(sizes: Readonly<Record<string, { width: number; height: number }>>): TakeLog {
    const sources: Record<string, TakeSource> = {};
    for (const { name, file } of this.recordings) {
      const size = sizes[name];
      if (size === undefined) throw new Error(`the master ${name} was not measured`);
      sources[name] = { master: file.split(/[\\/]/).pop() ?? file, ...size };
    }
    return {
      id: this.id,
      capturedAt: new Date().toISOString(),
      sources,
      events: this.events,
      pointer: this.pointer,
      clicks: this.clicks,
    };
  }

  /** The masters recorded so far, by name. */
  masters(): { name: string; file: string }[] {
    return this.recordings.map(({ name, file }) => ({ name, file }));
  }
}

/** The events of a kind, in order; throws when there are fewer than `least`. */
export function eventsOf(log: TakeLog, kind: string, least = 1): TakeEvent[] {
  const found = log.events.filter((event) => event.kind === kind);
  if (found.length < least) {
    throw new Error(
      `${log.id}: ${String(found.length)} "${kind}" events, at least ${String(least)} needed`,
    );
  }
  return found;
}

/** The one event of a kind (the first, if several). */
export function eventOf(log: TakeLog, kind: string): TakeEvent {
  return eventsOf(log, kind)[0] as TakeEvent;
}

/** An event's rect; throws when it has none. */
export function rectOf(event: TakeEvent): Rect {
  if (event.rect === undefined) throw new Error(`the "${event.kind}" event has no rect`);
  return event.rect;
}
