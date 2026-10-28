// The live game's watchdog (spec section 6, etch#51, kept from 1.x's game host): how a hang is told
// and how often the game may crash. A dead process, or a plugin that stops answering pings for a
// minute, restarts it. A main loop that stands still does not: a load, a new game, a save or a big
// event can freeze it for minutes while Windows marks the window not responding (the 2.0.0 trial,
// Anbennar's playset), so the watchdog only asks the player after `STILL_MS`. Restarts asked for
// while one runs coalesce into one more; after 3 crashes in 5 minutes it stops and waits for a
// manual start. Node only, no vscode.
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { Ping } from './pipe.ts';

/** How often a ready live game is pinged. */
export const PING_INTERVAL_MS = 1_000;
/** How long one ping may take. */
export const PING_TIMEOUT_MS = 10_000;
/**
 * How long pings may go unanswered before the plugin counts as gone: its pipe thread answers while
 * the game's main thread is stuck, so a minute of silence is a dead plugin or a dead process.
 */
export const SILENT_MS = 60_000;
/**
 * How long the frame counter may stand still before Etch asks the player whether the game hangs.
 * It stands still for the whole of a load, a new game from the country selection, a save or a big
 * event (each one frame of the main loop), and Windows marks the window not responding meanwhile.
 */
export const STILL_MS = 5 * 60_000;
/** Crashes within `CRASH_WINDOW_MS` that stop the live game until a manual start. */
export const CRASH_LIMIT = 3;
export const CRASH_WINDOW_MS = 5 * 60_000;

const seconds = (ms: number): string => `${(ms / 1000).toFixed(0)} s`;

/**
 * Watches a ready live game's pings. A hang is pings left unanswered for `silentMs`: only that
 * restarts the game. A frame counter that did not move for `stillMs` (a `busy` answer, the plugin
 * saving or reloading, counts as a move) is `still`: the game may only be busy, so the player is
 * asked and nothing is closed.
 */
export class HangCheck {
  private readonly silentMs: number;
  private readonly stillMs: number;
  private answered: number;
  private moved: number;
  private frame: number | undefined;
  private responding = true;

  constructor(now: number, silentMs = SILENT_MS, stillMs = STILL_MS) {
    this.silentMs = silentMs;
    this.stillMs = stillMs;
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
    if (now - this.answered < this.silentMs) return undefined;
    return `Etch's plugin gave no answer to a ping for ${seconds(now - this.answered)}`;
  }

  /** When the frame counter last moved: a new value starts a new stretch of standing still. */
  get movedAt(): number {
    return this.moved;
  }

  /** How the frame counter has stood still for `stillMs` or more at `now`, or `undefined`. */
  still(now: number): string | undefined {
    const still = now - this.moved;
    if (still < this.stillMs) return undefined;
    return (
      `the game drew no frame for ${seconds(still)} (frame ${String(this.frame)})` +
      (this.responding ? '' : ' and Windows marks its window not responding')
    );
  }
}

export interface WatchOptions {
  readonly intervalMs?: number;
  readonly silentMs?: number;
  readonly stillMs?: number;
  /** Called once each time the frame counter has stood still for `stillMs`. */
  readonly onStill?: (reason: string) => void;
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
  const silentMs = options.silentMs ?? SILENT_MS;
  const check = new HangCheck(performance.now(), silentMs, options.stillMs ?? STILL_MS);
  let told: number | undefined;
  for (;;) {
    await abortable(delay(intervalMs), options.signal);
    const answer = await abortable(
      target.ping(Math.min(silentMs, PING_TIMEOUT_MS)).then(
        (ping) => ping,
        () => undefined,
      ),
      options.signal,
    );
    const now = performance.now();
    if (answer !== undefined) check.answer(answer, now);
    const hang = check.hang(now);
    if (hang !== undefined) return hang;
    const still = check.still(now);
    if (still !== undefined && told !== check.movedAt) {
      told = check.movedAt;
      options.onStill?.(still);
    }
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
