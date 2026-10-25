// The game host's watchdog (spec section 4, etch#51): what restarts it and how often it may crash.
// A start-up-only file, a new resolution, playset or language, a dead process, a hang (no answer
// to a ping, or a frame counter that stops) and a console fault restart it; restarts asked for
// while one runs coalesce into one more; after 3 crashes in 5 minutes it stops and waits for a
// manual start. Node only, no vscode.
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { GameHostMod, HostDisplay } from './install.ts';
import type { Ping } from './pipe.ts';

/** How often a ready game host is pinged. */
export const PING_INTERVAL_MS = 1_000;
/** How long a ping may go unanswered, or the frame counter stand still, before it is a hang. */
export const HANG_MS = 10_000;
/** Crashes within `CRASH_WINDOW_MS` that stop the game host until a manual start. */
export const CRASH_LIMIT = 3;
export const CRASH_WINDOW_MS = 5 * 60_000;

/**
 * Whether a file the playset reads needs a restart when it changes on disk: the game reads
 * sprite types (`.gfx`) and fonts (`.fnt`) only when it starts, and has no command to read them
 * again.
 */
export function needsRestart(path: string): boolean {
  return /\.(?:gfx|fnt)$/i.test(path);
}

/** What a start of the game host is made from; a change of it restarts the game host. */
export interface HostStartRequest {
  readonly gameFolder: string;
  readonly mods: readonly GameHostMod[];
  readonly display: HostDisplay;
}

/** Why the game host running for `running` must restart for `next`, or `undefined`. */
export function requestChange(
  running: HostStartRequest,
  next: HostStartRequest,
): string | undefined {
  if (running.display.width !== next.display.width) return resolutionChange(next.display);
  if (running.display.height !== next.display.height) return resolutionChange(next.display);
  if (running.display.language !== next.display.language) {
    return `the language changed to ${next.display.language}`;
  }
  if (folderKey(running.gameFolder) !== folderKey(next.gameFolder)) {
    return 'the game folder changed';
  }
  const mods = (request: HostStartRequest): string =>
    JSON.stringify(request.mods.map((mod) => [folderKey(mod.root), mod.descriptorPath ?? '']));
  return mods(running) === mods(next) ? undefined : 'the playset changed';
}

function resolutionChange(display: HostDisplay): string {
  return `the resolution changed to ${String(display.width)}×${String(display.height)}`;
}

function folderKey(folder: string): string {
  return folder
    .replace(/[\\/]+$/, '')
    .replaceAll('/', '\\')
    .toLowerCase();
}

/**
 * Watches a ready game host's pings: a hang is a ping left unanswered, or a frame counter that
 * did not move, for `hangMs`. The pipe thread answers pings while the game's main thread is stuck,
 * so the frame counter tells a hung game from a dead plugin.
 */
export class HangCheck {
  private readonly hangMs: number;
  private answered: number;
  private moved: number;
  private frame: number | undefined;

  constructor(now: number, hangMs = HANG_MS) {
    this.hangMs = hangMs;
    this.answered = now;
    this.moved = now;
  }

  /** A ping's answer. */
  answer(ping: Ping, now: number): void {
    this.answered = now;
    if (ping.frame !== this.frame) {
      this.frame = ping.frame;
      this.moved = now;
    }
  }

  /** Why the game host hangs at `now`, or `undefined`. */
  hang(now: number): string | undefined {
    const seconds = (ms: number): string => `${(ms / 1000).toFixed(0)} s`;
    if (now - this.answered >= this.hangMs) {
      return `no answer to a ping for ${seconds(now - this.answered)}`;
    }
    if (now - this.moved >= this.hangMs) {
      return `the frame counter stayed at ${String(this.frame)} for ${seconds(now - this.moved)}`;
    }
    return undefined;
  }
}

export interface WatchOptions {
  readonly intervalMs?: number;
  readonly hangMs?: number;
  /** Ends the watch; the promise then never resolves. */
  readonly signal: AbortSignal;
}

/**
 * Pings a ready game host until it hangs, and resolves with why. One ping is in flight at a time,
 * so a stuck pipe does not pile them up.
 */
export async function watch(
  target: { ping(timeoutMs: number): Promise<Ping> },
  options: WatchOptions,
): Promise<string> {
  const intervalMs = options.intervalMs ?? PING_INTERVAL_MS;
  const hangMs = options.hangMs ?? HANG_MS;
  const check = new HangCheck(performance.now(), hangMs);
  for (;;) {
    await abortable(delay(intervalMs), options.signal);
    const answer = await abortable(
      target.ping(hangMs).then(
        (ping) => ping,
        () => undefined,
      ),
      options.signal,
    );
    if (answer !== undefined) check.answer(answer, performance.now());
    const hang = check.hang(performance.now());
    if (hang !== undefined) return hang;
  }
}

/** Waits for `work`, or forever once `signal` aborts. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return new Promise(() => undefined);
  return new Promise((resolve) => {
    void work.then((value) => {
      if (!signal.aborted) resolve(value);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Counts crashes: the `CRASH_LIMIT`th within `CRASH_WINDOW_MS` stops the game host. */
export class CrashLimit {
  private readonly limit: number;
  private readonly windowMs: number;
  private times: number[] = [];

  constructor(limit = CRASH_LIMIT, windowMs = CRASH_WINDOW_MS) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Records a crash at `now`; true when it reaches the limit. */
  crash(now: number): boolean {
    this.times = [...this.times.filter((time) => now - time < this.windowMs), now];
    return this.times.length >= this.limit;
  }

  /** Forgets the crashes, after a manual start. */
  reset(): void {
    this.times = [];
  }
}

/**
 * At most one restart at a time. A restart asked for while one runs, before the new process is
 * started (`take`), joins it; one asked for later makes one more, which every later one joins.
 * `cycle` stops the running game host, calls `take` right before it starts the new one and
 * resolves false when the game host should stay down, which drops the restarts still asked for.
 */
export class RestartQueue {
  private readonly cycle: (take: () => readonly string[]) => Promise<boolean>;
  private reasons: string[] = [];
  private running: Promise<void> | undefined;

  constructor(cycle: (take: () => readonly string[]) => Promise<boolean>) {
    this.cycle = cycle;
  }

  /** Asks for a restart for `reason`. */
  request(reason: string): void {
    if (!this.reasons.includes(reason)) this.reasons.push(reason);
    // The loop starts after `running` is set, so that a cycle can ask again.
    this.running ??= Promise.resolve().then(() => this.loop());
  }

  /** Whether a restart runs or waits. */
  get busy(): boolean {
    return this.running !== undefined;
  }

  /** Drops the restarts asked for and not started yet. */
  clear(): void {
    this.reasons = [];
  }

  /** Resolves when no restart runs or waits. */
  async idle(): Promise<void> {
    while (this.running !== undefined) await this.running;
  }

  private async loop(): Promise<void> {
    try {
      while (this.reasons.length > 0) {
        const cycle: { taken: boolean } = { taken: false };
        const take = (): readonly string[] => {
          cycle.taken = true;
          const reasons = this.reasons;
          this.reasons = [];
          return reasons;
        };
        const up = await this.cycle(take).catch(() => false);
        // A cycle that ends before it takes them would otherwise run again for ever.
        if (!up || !cycle.taken) this.reasons = [];
      }
    } finally {
      this.running = undefined;
    }
  }
}

/** The private profile's `error.log`, where the game writes its errors. */
export function errorLogPath(profileFolder: string): string {
  return join(profileFolder, 'logs', 'error.log');
}

/** The last `count` non-empty lines of a log, read from its end; none when it cannot be read. */
export async function logTail(path: string, count = 10, maxBytes = 64 * 1024): Promise<string[]> {
  let file;
  try {
    file = await open(path, 'r');
  } catch {
    return [];
  }
  try {
    const { size } = await file.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    // The game writes its logs in Windows-1252; latin1 keeps every byte as one character.
    const lines = buffer.toString('latin1').split(/\r?\n/);
    if (length < size) lines.shift();
    return lines.filter((line) => line.trim() !== '').slice(-count);
  } catch {
    return [];
  } finally {
    await file.close();
  }
}
