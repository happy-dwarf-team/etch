// Preview jobs (spec section 4, etch#50): for the previewed window the extension writes both
// preview copies into the overlay mod and sends one `job` over the session pipe; the plugin
// reloads them, captures the window over black and over white, and writes the straight RGBA as a
// TGA the webview draws. One job runs at a time; changes that come meanwhile coalesce into one
// more, the latest copy winning. Node only, no vscode.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CropRect, PreviewCopyFile } from '@etch/core';
import { PipeError } from './pipe.ts';

/** One change set for the game host. */
export interface JobChange {
  /** The copies over black and over white, as `writePreviewCopy` gives them. */
  readonly copies: readonly [PreviewCopyFile, PreviewCopyFile];
  /** The part of the game host's screen to capture, from the offline renderer's layout. */
  readonly crop: CropRect;
  /** How long after each `window open` the capture waits: the window's show animation. */
  readonly settleMs: number;
  /** `texturefile` values to `reloadtexture`, for textures saved to disk. */
  readonly textures: readonly string[];
  /** Whether to `reloadloc`, after a localisation file was saved. */
  readonly localisation: boolean;
  /** When the first change this job answers came in, in milliseconds since the Unix epoch. */
  readonly requestedAt: number;
  /** The caller's name for the change, such as its render's id; the latest one coalesced. */
  readonly tag: number;
}

/** One console line the job ran, as the plugin reports it. */
export interface JobCommand {
  readonly line: string;
  readonly success: boolean;
  readonly text: string;
  readonly ms: number;
}

/** The plugin's times, in milliseconds (docs/plugin-protocol.md, "Preview job"). */
export interface PluginTimes {
  readonly queued: number;
  readonly commands: number;
  readonly black: number;
  readonly white: number;
  readonly recover: number;
  readonly write: number;
  readonly total: number;
}

interface OutcomeBase {
  /** The job's number in this game host session. */
  readonly job: number;
  readonly tag: number;
  readonly requestedAt: number;
  readonly commands: readonly JobCommand[];
}

export type JobOutcome =
  | (OutcomeBase & {
      readonly ok: true;
      /** The TGA of straight RGBA, and where it sits on the screen. */
      readonly image: { readonly path: string; readonly crop: CropRect };
      readonly frames: { readonly black: number; readonly white: number };
      /** Milliseconds: writing the copies, the request until its answer, and the whole job. */
      readonly ms: { readonly copies: number; readonly pipe: number; readonly job: number };
      readonly plugin: PluginTimes;
    })
  | (OutcomeBase & {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
    });

/** What a job needs from the running game host. */
export interface JobTarget {
  /** The overlay mod's folder, which the copies go into. */
  readonly overlayFolder: string;
  /** The folder the plugin writes the images to; the webview reads it. */
  readonly capturesFolder: string;
  request(
    body: { type: string } & Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>>;
}

/** How long a job may take before Etch stops waiting for its answer. */
export const JOB_TIMEOUT_MS = 10_000;

/** How long a job waits while the plugin still runs one Etch stopped waiting for. */
const BUSY_WAIT_MS = 2_000;

/** The file a job's image goes to. */
export function captureFile(capturesFolder: string, job: number): string {
  return join(capturesFolder, `job-${String(job)}.tga`);
}

/** Runs one job: writes the copies, sends the request and waits for the plugin's answer. */
export async function runJob(
  target: JobTarget,
  change: JobChange,
  job: number,
): Promise<JobOutcome> {
  const started = performance.now();
  const [black, white] = change.copies;
  for (const copy of change.copies) {
    const path = join(target.overlayFolder, ...copy.path.split('/'));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, copy.bytes);
  }
  const copiesMs = performance.now() - started;
  const output = captureFile(target.capturesFolder, job);
  const body = {
    type: 'job',
    reload: [black.fileName, white.fileName],
    textures: change.textures,
    localisation: change.localisation,
    black: black.wrapper,
    white: white.wrapper,
    crop: change.crop,
    settle_ms: change.settleMs,
    output,
  };
  const base = { job, tag: change.tag, requestedAt: change.requestedAt };
  const sent = performance.now();
  let answer: Record<string, unknown>;
  try {
    answer = await requestWhileBusy(target, body);
  } catch (error) {
    if (!(error instanceof PipeError)) throw error;
    return {
      ...base,
      ok: false,
      code: error.code,
      message: error.message,
      commands: commandsOf(error.answer),
    };
  }
  const finished = performance.now();
  const crop = answer['crop'] as CropRect | undefined;
  const frames = answer['frames'] as { black: number; white: number } | undefined;
  return {
    ...base,
    ok: true,
    image: { path: output, crop: crop ?? change.crop },
    frames: frames ?? { black: 0, white: 0 },
    ms: { copies: copiesMs, pipe: finished - sent, job: finished - started },
    plugin: (answer['ms'] ?? {}) as PluginTimes,
    commands: commandsOf(answer),
  };
}

/** Sends a job; while the plugin still runs one Etch stopped waiting for, asks again. */
async function requestWhileBusy(
  target: JobTarget,
  body: { type: string } & Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const deadline = performance.now() + BUSY_WAIT_MS;
  for (;;) {
    try {
      return await target.request(body, JOB_TIMEOUT_MS);
    } catch (error) {
      if (!(error instanceof PipeError) || error.code !== 'busy' || performance.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
}

function commandsOf(answer: Record<string, unknown> | undefined): JobCommand[] {
  const commands = answer?.['commands'];
  return Array.isArray(commands) ? (commands as JobCommand[]) : [];
}

/** Deletes the images in the captures folder except those named. */
export async function pruneCaptures(
  capturesFolder: string,
  keep: readonly string[],
): Promise<void> {
  const kept = new Set(keep.map((path) => path.toLowerCase()));
  const names = await readdir(capturesFolder).catch(() => [] as string[]);
  await Promise.all(
    names
      .map((name) => join(capturesFolder, name))
      .filter((path) => /\.tga$/i.test(path) && !kept.has(path.toLowerCase()))
      .map((path) => rm(path, { force: true }).catch(() => undefined)),
  );
}

/** Two changes as one: the later copy and crop, every texture, and the earlier request time. */
export function mergeChanges(earlier: JobChange, later: JobChange): JobChange {
  return {
    copies: later.copies,
    crop: later.crop,
    settleMs: later.settleMs,
    textures: [...new Set([...earlier.textures, ...later.textures])],
    localisation: earlier.localisation || later.localisation,
    requestedAt: Math.min(earlier.requestedAt, later.requestedAt),
    tag: later.tag,
  };
}

/**
 * At most one job in flight; a change that comes while one runs waits, and further changes merge
 * into it (`mergeChanges`), so one more job answers them all.
 */
export class JobQueue {
  private readonly run: (change: JobChange, job: number) => Promise<JobOutcome>;
  private readonly done: (outcome: JobOutcome) => void;
  private pending: JobChange | undefined;
  private running: Promise<void> | undefined;
  private count = 0;
  private disposed = false;

  constructor(
    run: (change: JobChange, job: number) => Promise<JobOutcome>,
    done: (outcome: JobOutcome) => void,
  ) {
    this.run = run;
    this.done = done;
  }

  submit(change: JobChange): void {
    if (this.disposed) return;
    this.pending = this.pending === undefined ? change : mergeChanges(this.pending, change);
    this.running ??= this.loop();
  }

  /** Resolves when no job runs and none waits. */
  async idle(): Promise<void> {
    while (this.running !== undefined) await this.running;
  }

  dispose(): void {
    this.disposed = true;
    this.pending = undefined;
  }

  private async loop(): Promise<void> {
    try {
      while (this.pending !== undefined && !this.disposed) {
        const change = this.pending;
        this.pending = undefined;
        const job = ++this.count;
        let outcome: JobOutcome;
        try {
          outcome = await this.run(change, job);
        } catch (error) {
          outcome = {
            job,
            tag: change.tag,
            requestedAt: change.requestedAt,
            commands: [],
            ok: false,
            code: 'error',
            message: error instanceof Error ? error.message : String(error),
          };
        }
        if (this.live()) this.done(outcome);
      }
    } finally {
      this.running = undefined;
    }
  }

  /** Whether the queue was not disposed, also while a job ran. */
  private live(): boolean {
    return !this.disposed;
  }
}
