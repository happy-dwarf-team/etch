// The live game's watchdog (spec section 6, etch#51, kept from 1.x's game host): how a hang is told
// and how often the game may crash. A dead process and a hang (no answer to a ping, or a frame
// counter that stops while the window stops responding) restart it; restarts asked for while one runs coalesce into one more; after
// 3 crashes in 5 minutes it stops and waits for a manual start. Node only, no vscode.
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ping } from './pipe.ts';

/** How often a ready live game is pinged. */
export const PING_INTERVAL_MS = 1_000;
/** How long a ping may go unanswered, or the frame counter stand still, before it is a hang. */
export const HANG_MS = 10_000;
/**
 * How long the frame counter may stand still while the game's window still takes messages, as it
 * does while a save loads (the whole load is one frame of the main loop), before it is a hang.
 */
export const LOAD_MS = 5 * 60_000;
/** Crashes within `CRASH_WINDOW_MS` that stop the live game until a manual start. */
export const CRASH_LIMIT = 3;
export const CRASH_WINDOW_MS = 5 * 60_000;

/**
 * Watches a ready live game's pings: a hang is a ping left unanswered for `hangMs`, or a frame
 * counter that did not move for `hangMs` while the game's window stopped taking messages too. The
 * pipe thread answers pings while the game's main thread is stuck, so the frame counter tells a
 * hung game from a dead plugin. A save or a load is not a hang (spec section 6): the counter
 * stands still while the plugin saves (`busy`), and while a save loads, when the window still
 * takes messages, for up to `loadMs`.
 */
export class HangCheck {
  private readonly hangMs: number;
  private readonly loadMs: number;
  private answered: number;
  private moved: number;
  private frame: number | undefined;
  private responding = true;

  constructor(now: number, hangMs = HANG_MS, loadMs = LOAD_MS) {
    this.hangMs = hangMs;
    this.loadMs = loadMs;
    this.answered = now;
    this.moved = now;
  }

  /** A ping's answer. */
  answer(ping: Ping, now: number): void {
    this.answered = now;
    this.responding = ping.responding;
    if (ping.frame !== this.frame || ping.busy) {
      this.frame = ping.frame;
      this.moved = now;
    }
  }

  /** Why the live game hangs at `now`, or `undefined`. */
  hang(now: number): string | undefined {
    const seconds = (ms: number): string => `${(ms / 1000).toFixed(0)} s`;
    if (now - this.answered >= this.hangMs) {
      return `no answer to a ping for ${seconds(now - this.answered)}`;
    }
    const still = now - this.moved;
    if (still >= this.hangMs && !this.responding) {
      return `the frame counter stayed at ${String(this.frame)} for ${seconds(still)} and the window stopped responding`;
    }
    if (still >= this.loadMs) {
      return `the frame counter stayed at ${String(this.frame)} for ${seconds(still)}`;
    }
    return undefined;
  }
}

export interface WatchOptions {
  readonly intervalMs?: number;
  readonly hangMs?: number;
  readonly loadMs?: number;
  /** Ends the watch; the promise then never resolves. */
  readonly signal: AbortSignal;
}

/**
 * Pings a ready live game until it hangs, and resolves with why. One ping is in flight at a time,
 * so a stuck pipe does not pile them up.
 */
export async function watch(
  target: { ping(timeoutMs: number): Promise<Ping> },
  options: WatchOptions,
): Promise<string> {
  const intervalMs = options.intervalMs ?? PING_INTERVAL_MS;
  const hangMs = options.hangMs ?? HANG_MS;
  const check = new HangCheck(performance.now(), hangMs, options.loadMs ?? LOAD_MS);
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

/** Counts crashes: the `CRASH_LIMIT`th within `CRASH_WINDOW_MS` stops the live game. */
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
 * `cycle` stops the running live game, calls `take` right before it starts the new one and
 * resolves false when the live game should stay down, which drops the restarts still asked for.
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
