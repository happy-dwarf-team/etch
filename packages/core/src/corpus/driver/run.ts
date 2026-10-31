/**
 * A capture run (etch#42): for each session of the plan, a fresh game start in the playset's
 * profile at the session's resolution, the session's views captured one after the other, and the
 * game closed and the profile's settings put back before the next start. Files go where the
 * corpus keeps them: the capture records into the repository's `corpus/` folder (or another
 * records folder), the screenshots and masks into the local corpus folder, and a report of the run
 * into the local corpus folder's `runs/`.
 *
 * Anything that breaks the lab's procedure (a game that could not be closed, settings not back to
 * their baselines, a changed save, mod or player profile) stops the whole run.
 */
import { appendFileSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Screen } from '../../model/gui.ts';
import {
  captureRecordFile,
  hashFile,
  hashModFolder,
  screenshotFile,
  unstableMaskFile,
} from '../files.ts';
import type { CaptureRecord } from '../capture.ts';
import {
  resolutionKey,
  type CaptureKey,
  type CorpusManifest,
  type CorpusView,
  type RecipeStart,
} from '../manifest.ts';
import { describeSession, type CaptureSession } from './plan.ts';
import {
  playsetProfile,
  prepareProfile,
  snapshotChanges,
  snapshotFolder,
  type ProfileSources,
} from './profile.ts';
import {
  displayModeFor,
  pdxSettingsVariant,
  settingsVariant,
  unexpectedChanges,
  variantName,
} from './settings.ts';
import { tongsAtLeast, type Tongs, type TongsAnswer } from './tongs.ts';
import {
  DEFAULT_AWAY,
  MouseReleased,
  captureView,
  pinCursor,
  settleStart,
  type AwayPoint,
  type MouseCursor,
  type ViewContext,
  type CaptureTiming,
  type ViewOutcome,
} from './view.ts';

/** A started game, as the lab's `ConvertTo-VerifiedSessionRecord` writes it. */
export interface GameRecord {
  readonly pid: number;
  readonly imagePath: string;
  /** A FILETIME as decimal text: it has more digits than a double keeps. */
  readonly creationFileTimeUtc: string;
  readonly creationUnixMs: number;
  readonly [key: string]: unknown;
}

export interface StopResult {
  readonly ok: boolean;
  readonly [key: string]: unknown;
}

/** Starting and closing the game under the lab's procedure (`game.ps1`). */
export interface GameLauncher {
  /** The preflight; resolves with the SHA-256 of the copy's `eu4.exe`. */
  check(): Promise<string>;
  start(profile: string, save: string | undefined): Promise<GameRecord>;
  stop(record: GameRecord): Promise<StopResult>;
  /** The real mouse cursor, pinned while a session runs. */
  readonly mouse: MouseCursor;
}

export interface RunOptions {
  readonly manifest: CorpusManifest;
  readonly sessions: readonly CaptureSession[];
  readonly hostDir: string;
  readonly sources: ProfileSources;
  /** The monitor's size: that resolution is captured borderless, smaller ones windowed. */
  readonly monitor: Screen;
  /** Where the capture records go: the repository's `corpus/` folder, or another for a trial. */
  readonly recordsDir: string;
  /** The local corpus folder (`ETCH_CORPUS_PATH`). */
  readonly localDir: string;
  /** The player's own profile, which must not change. */
  readonly playerProfile: string;
  readonly launcher: GameLauncher;
  /**
   * When the lab's game lock of the run expires: no session starts after it, since the lock no
   * longer keeps other sessions from starting a game.
   */
  readonly lockExpiresAt?: Date;
  readonly connect: () => Promise<Tongs>;
  /** Formats a capture record's JSON as the repository does (Prettier). */
  readonly format: (json: string, file: string) => Promise<string>;
  /** Where the pointer rests while a view is read and shot (`DEFAULT_AWAY`). */
  readonly away?: Readonly<Record<RecipeStart, AwayPoint>>;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly print?: (line: string) => void;
  readonly timing?: CaptureTiming;
  /** How long a game may take to be ready. */
  readonly readyTimeoutMs?: number;
  /** Fresh starts at most for one session when the start state is lost. */
  readonly maxStarts?: number;
  /**
   * Keeps each game open this long after its views, for working out recipes with Tongs by hand,
   * until a file named `release` appears in the session's run folder. Closing and the settings
   * are handled as always.
   */
  readonly holdMs?: number;
  /**
   * How long the run waits for a file named `resume` in its run folder after the user took the
   * mouse back; then it stops.
   */
  readonly resumeTimeoutMs?: number;
}

export interface SessionReport {
  readonly session: string;
  readonly game?: GameRecord;
  readonly readyMs?: number;
  readonly views: readonly ViewSummary[];
  readonly stop?: StopResult;
  readonly settingsChanges: readonly string[];
  readonly pdxSettingsChanges: readonly string[];
  readonly baselinesRestored: boolean;
  readonly playerProfileChanges: readonly string[];
  /** The user took the mouse back during this session. */
  readonly mouseReleased?: boolean;
  readonly error?: string;
}

export type ViewSummary =
  | {
      readonly view: string;
      readonly ok: true;
      readonly shots: number;
      readonly unstablePixels: number;
      readonly unstableInWidgets: number;
      readonly verifiedNow: boolean;
    }
  | {
      readonly view: string;
      readonly ok: false;
      readonly reason: string;
      /** Given back when the user took the mouse back; the next start takes it again. */
      readonly released?: true;
    };

export interface RunReport {
  readonly runId: string;
  readonly startedAt: string;
  readonly sessions: SessionReport[];
  /** Views given up on after the fresh starts allowed, as `playset WxH view`. */
  readonly notTried: string[];
  /** Why the run stopped early, when it did. */
  readonly stopped?: string;
}

export async function runCaptures(options: RunOptions): Promise<RunReport> {
  const now = options.now ?? ((): Date => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const print = options.print ?? ((): void => undefined);
  const startedAt = now();
  const runId = startedAt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');
  const runDir = join(options.localDir, 'runs', runId);
  await mkdir(runDir, { recursive: true });
  const report: {
    runId: string;
    startedAt: string;
    sessions: SessionReport[];
    notTried: string[];
    stopped?: string;
  } = { runId, startedAt: startedAt.toISOString(), sessions: [], notTried: [] };
  const save = async (): Promise<void> => {
    await writeFile(join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  };

  try {
    for (const planned of options.sessions) {
      let views: readonly CorpusView[] = planned.views;
      // A session the user ended by taking the mouse back is not counted.
      let starts = 0;
      while (views.length > 0) {
        const session = { ...planned, views };
        if (options.lockExpiresAt !== undefined && now() >= options.lockExpiresAt) {
          report.stopped = `The lab's game lock expired at ${options.lockExpiresAt.toISOString()}; no game was started after it.`;
          return report;
        }
        print(`session ${describeSession(session)}`);
        const result = await runSession(options, session, runDir, report.sessions.length + 1, {
          now,
          sleep,
          print,
        });
        report.sessions.push(result.report);
        await save();
        if (result.fatal !== undefined) {
          report.stopped = result.fatal;
          return report;
        }
        views = result.remaining;
        if (result.report.mouseReleased === true) {
          if (!(await waitResume(options, runDir, { now, sleep, print }))) {
            report.stopped = 'The mouse was released and the run was not resumed.';
            return report;
          }
          continue;
        }
        starts++;
        if (views.length > 0 && starts >= (options.maxStarts ?? 2)) {
          print(
            `  giving up on ${views.map((v) => v.id).join(', ')} after ${String(starts)} starts`,
          );
          for (const v of views) {
            report.notTried.push(
              `${planned.playset.id} ${resolutionKey(planned.resolution)} ${v.id}`,
            );
          }
          break;
        }
      }
    }
    return report;
  } finally {
    await save();
  }
}

interface SessionResult {
  readonly report: SessionReport;
  /** Views not yet tried because the start state was lost. */
  readonly remaining: readonly CorpusView[];
  /** The procedure was broken: the run stops. */
  readonly fatal?: string;
}

async function runSession(
  options: RunOptions,
  session: CaptureSession,
  runDir: string,
  index: number,
  env: { now: () => Date; sleep: (ms: number) => Promise<void>; print: (line: string) => void },
): Promise<SessionResult> {
  const name = `${String(index).padStart(2, '0')}-${session.playset.id}-${resolutionKey(session.resolution)}-${session.start}`;
  const dir = join(runDir, name);
  await mkdir(dir, { recursive: true });
  const events = join(dir, 'events.jsonl');
  const log = (event: Readonly<Record<string, unknown>>): void => {
    appendFileSync(events, `${JSON.stringify({ at: env.now().toISOString(), ...event })}\n`);
  };
  const describe = describeSession(session);
  const base = {
    session: describe,
    views: [] as ViewSummary[],
    settingsChanges: [] as string[],
    pdxSettingsChanges: [] as string[],
    baselinesRestored: false,
    playerProfileChanges: [] as string[],
  };

  // Before anything changes: the preflight, the profile, the settings variants.
  let exeSha256: string;
  let prepared: Awaited<ReturnType<typeof prepareProfile>>;
  try {
    exeSha256 = await options.launcher.check();
    if (exeSha256 !== options.manifest.game.exeSha256) {
      throw new Error(
        `The copy's eu4.exe is ${exeSha256}; the manifest pins ${options.manifest.game.exeSha256}.`,
      );
    }
    prepared = await prepareProfile(options.hostDir, session.playset, options.sources);
  } catch (error) {
    return { report: { ...base, error: message(error) }, remaining: [], fatal: message(error) };
  }
  const { profile, baselines } = playsetProfile(options.hostDir, session.playset.id);
  const settings = await prepareSettings(profile, baselines, session.resolution, options.monitor);
  if ('error' in settings) {
    return { report: { ...base, error: settings.error }, remaining: [], fatal: settings.error };
  }

  const playerBefore = await snapshotFolder(options.playerProfile);
  const outcomes: ViewOutcome[] = [];
  let game: GameRecord | undefined;
  let stop: StopResult | undefined;
  let readyMs: number | undefined;
  let error: string | undefined;
  let remaining: CorpusView[] = [];
  let mouseReleased = false;
  const { mouse } = options.launcher;
  try {
    game = await options.launcher.start(
      profile,
      session.start === 'save' ? session.playset.save?.file : undefined,
    );
    await writeFile(join(dir, 'game.json'), `${JSON.stringify(game, null, 2)}\n`);
    env.print(`  game pid ${String(game.pid)}`);
    const pid = game.pid;
    const context = (
      tongs: Tongs,
      tongsVersion: string,
      startWindows: readonly string[],
    ): ViewContext => ({
      tongs,
      manifest: options.manifest,
      playset: session.playset.id,
      resolution: session.resolution,
      start: session.start,
      pid,
      startWindows,
      exeSha256,
      tongsVersion,
      ...(prepared.saveSha256 !== undefined ? { saveSha256: prepared.saveSha256 } : {}),
      mods: prepared.mods,
      disabledDlcs: session.playset.disabledDlcs,
      away: options.away ?? DEFAULT_AWAY,
      mouse,
      readFile: async (path) => new Uint8Array(await readFile(path)),
      sleep: env.sleep,
      now: env.now,
      log,
      ...(options.timing !== undefined ? { timing: options.timing } : {}),
    });
    const ready = await waitReady(options, game, session, profile, env, log, (tongs) =>
      pinCursor(context(tongs, 'unknown', [])),
    );
    readyMs = ready.readyMs;
    const tongs = ready.tongs;
    try {
      const windows = await settleStart(context(tongs, ready.version, []));
      log({ startWindows: windows });
      for (const [i, view] of session.views.entries()) {
        const outcome = await captureView(context(tongs, ready.version, windows), view);
        outcomes.push(outcome);
        if (outcome.ok) {
          await writeCapture(options, outcome.capture);
          env.print(
            `  ${view.id}: captured, ${String(outcome.capture.record.screenshot.shots)} shots, ${String(outcome.capture.record.screenshot.unstable?.pixels ?? 0)} unstable pixels (${String(outcome.capture.unstableInWidgets)} inside shown widgets)`,
          );
        } else {
          env.print(`  ${view.id}: FAILED: ${outcome.reason}`);
          if (outcome.lost) {
            remaining = session.views.slice(outcome.retry === true ? i : i + 1);
            mouseReleased = outcome.released === true;
            break;
          }
        }
      }
      if (options.holdMs !== undefined && !mouseReleased) {
        await releaseMouse(mouse, log);
        const release = join(dir, 'release');
        env.print(`  holding the game open; create ${release} to close it`);
        const until = env.now().getTime() + options.holdMs;
        while (env.now().getTime() < until && !(await exists(release))) await env.sleep(1000);
      }
    } finally {
      tongs.close();
    }
  } catch (e) {
    if (e instanceof MouseReleased) {
      env.print(`  ${e.message}`);
      log({ released: e.message });
      mouseReleased = true;
      const done = new Set(outcomes.map((o) => o.view));
      remaining = session.views.filter((v) => !done.has(v.id));
    } else {
      error = message(e);
      env.print(`  session failed: ${error}`);
      log({ error });
    }
  } finally {
    // The user gets the mouse back first, whatever happens to the game.
    await releaseMouse(mouse, log);
    if (game !== undefined) {
      stop = await options.launcher.stop(game);
      log({ stop });
      const crashes = stop['anvilCrashes'];
      if (Array.isArray(crashes) && crashes.length > 0) {
        env.print(`  the game crashed: Anvil's reports ${crashes.join(', ')}`);
      }
    }
  }

  // After the game is gone: settings back to their baselines, nothing else changed.
  const restored = await restoreSettings(profile, baselines, settings, dir);
  const problems: string[] = [];
  if (game !== undefined && stop?.ok !== true) problems.push('The game could not be closed.');
  if (!restored.restored) problems.push('The settings are not back to their baselines.');
  if (restored.settingsChanges.length > 0 || restored.pdxChanges.length > 0) {
    problems.push('The game changed the settings beyond refreshRate and graceful_exit.');
  }
  try {
    const after = await prepareProfileHashes(options, session);
    if (after.saveSha256 !== prepared.saveSha256) problems.push('The save changed.');
    if (JSON.stringify(after.mods) !== JSON.stringify(prepared.mods))
      problems.push('A mod changed.');
  } catch (e) {
    problems.push(message(e));
  }
  const playerProfileChanges = snapshotChanges(
    playerBefore,
    await snapshotFolder(options.playerProfile),
  );
  if (playerProfileChanges.length > 0) problems.push("The player's profile changed.");

  const report: SessionReport = {
    ...base,
    ...(game !== undefined ? { game } : {}),
    ...(readyMs !== undefined ? { readyMs } : {}),
    views: outcomes.map(summary),
    ...(stop !== undefined ? { stop } : {}),
    settingsChanges: restored.settingsChanges,
    pdxSettingsChanges: restored.pdxChanges,
    baselinesRestored: restored.restored,
    playerProfileChanges,
    ...(mouseReleased ? { mouseReleased } : {}),
    ...(error !== undefined ? { error } : {}),
  };
  if (problems.length > 0) {
    return { report, remaining: [], fatal: problems.join(' ') };
  }
  if (error !== undefined) {
    // The game did not get ready or the pipe failed: try the views not captured in a fresh start.
    const done = new Set(outcomes.map((o) => o.view));
    remaining = session.views.filter((v) => !done.has(v.id));
  }
  return { report, remaining };
}

async function releaseMouse(
  mouse: MouseCursor,
  log: (event: Readonly<Record<string, unknown>>) => void,
): Promise<void> {
  try {
    await mouse.release();
  } catch (error) {
    log({ releaseFailed: message(error) });
  }
}

/**
 * After the user took the mouse back, with no game running: waits until they create `resume` in
 * the run folder (removed again), or for the timeout.
 */
async function waitResume(
  options: RunOptions,
  runDir: string,
  env: { now: () => Date; sleep: (ms: number) => Promise<void>; print: (line: string) => void },
): Promise<boolean> {
  const resume = join(runDir, 'resume');
  const timeoutMs = options.resumeTimeoutMs ?? 30 * 60_000;
  env.print(
    `  paused: the mouse is yours; create ${resume} to go on (the mouse is pinned again), or wait ${String(Math.round(timeoutMs / 60_000))} minutes to stop the run`,
  );
  const until = env.now().getTime() + timeoutMs;
  while (env.now().getTime() < until) {
    if (await exists(resume)) {
      await rm(resume, { force: true });
      env.print('  resumed');
      return true;
    }
    await env.sleep(1000);
  }
  return false;
}

function summary(outcome: ViewOutcome): ViewSummary {
  if (!outcome.ok) {
    return {
      view: outcome.view,
      ok: false,
      reason: outcome.reason,
      ...(outcome.released === true ? { released: true as const } : {}),
    };
  }
  const shot = outcome.capture.record.screenshot;
  return {
    view: outcome.view,
    ok: true,
    shots: shot.shots,
    unstablePixels: shot.unstable?.pixels ?? 0,
    unstableInWidgets: outcome.capture.unstableInWidgets,
    verifiedNow: outcome.capture.verifiedNow,
  };
}

async function prepareProfileHashes(
  options: RunOptions,
  session: CaptureSession,
): Promise<{ saveSha256?: string; mods: { name: string; sha256: string }[] }> {
  const { profile } = playsetProfile(options.hostDir, session.playset.id);
  const mods = [];
  for (const mod of session.playset.mods) {
    mods.push({
      name: mod.name,
      sha256: await hashModFolder(join(options.sources.workshop, mod.workshopId ?? '')),
    });
  }
  const save = session.playset.save;
  if (save === undefined) return { mods };
  return { saveSha256: await hashFile(join(profile, 'save games', save.file)), mods };
}

interface PreparedSettings {
  readonly settingsBaseline: string;
  readonly settingsVariant: string;
  /** Undefined when the profile has no `pdx_settings.txt` baseline: it is removed afterwards. */
  readonly pdxBaseline: string | undefined;
  readonly pdxVariant: string;
}

/**
 * Writes the named variants of the named baselines for the resolution and puts them into the
 * profile. The profile's files must be the baselines first: a previous session that was not
 * cleaned up stops the run instead of being overwritten.
 */
async function prepareSettings(
  profile: string,
  baselines: string,
  resolution: Screen,
  monitor: Screen,
): Promise<PreparedSettings | { error: string }> {
  try {
    const mode = displayModeFor(resolution, monitor);
    const settingsBaseline = await readFile(join(baselines, 'settings-baseline.txt'), 'utf8');
    const current = await readFile(join(profile, 'settings.txt'), 'utf8');
    if (current !== settingsBaseline) {
      return {
        error: `${join(profile, 'settings.txt')} is not its baseline; put the baseline back first.`,
      };
    }
    const pdxBaselineFile = join(baselines, 'pdx-settings-baseline.txt');
    const pdxBaseline = (await exists(pdxBaselineFile))
      ? await readFile(pdxBaselineFile, 'utf8')
      : undefined;
    const pdxFile = join(profile, 'pdx_settings.txt');
    const pdxCurrent = (await exists(pdxFile)) ? await readFile(pdxFile, 'utf8') : undefined;
    if (pdxCurrent !== pdxBaseline) {
      return { error: `${pdxFile} is not its baseline; put the baseline back first.` };
    }
    const settings = settingsVariant(settingsBaseline, resolution, mode);
    const pdx = pdxSettingsVariant(pdxBaseline, resolution, mode);
    await writeFile(join(baselines, variantName('settings', resolution, mode)), settings);
    await writeFile(join(baselines, variantName('pdx-settings', resolution, mode)), pdx);
    await writeFile(join(profile, 'settings.txt'), settings);
    await writeFile(pdxFile, pdx);
    return { settingsBaseline, settingsVariant: settings, pdxBaseline, pdxVariant: pdx };
  } catch (error) {
    return { error: message(error) };
  }
}

async function restoreSettings(
  profile: string,
  baselines: string,
  prepared: PreparedSettings,
  dir: string,
): Promise<{ settingsChanges: string[]; pdxChanges: string[]; restored: boolean }> {
  const settingsFile = join(profile, 'settings.txt');
  const pdxFile = join(profile, 'pdx_settings.txt');
  const settingsAfter = (await exists(settingsFile)) ? await readFile(settingsFile, 'utf8') : '';
  const pdxAfter = (await exists(pdxFile)) ? await readFile(pdxFile, 'utf8') : '';
  await writeFile(join(dir, 'settings-after.txt'), settingsAfter);
  await writeFile(join(dir, 'pdx-settings-after.txt'), pdxAfter);
  const settingsChanges = unexpectedChanges(prepared.settingsVariant, settingsAfter);
  const pdxChanges = unexpectedChanges(prepared.pdxVariant, pdxAfter, /^$/);

  await writeFile(settingsFile, prepared.settingsBaseline);
  if (prepared.pdxBaseline === undefined) await rm(pdxFile, { force: true });
  else await writeFile(pdxFile, prepared.pdxBaseline);
  const restored =
    (await readFile(settingsFile, 'utf8')) ===
      (await readFile(join(baselines, 'settings-baseline.txt'), 'utf8')) &&
    (prepared.pdxBaseline === undefined
      ? !(await exists(pdxFile))
      : (await readFile(pdxFile, 'utf8')) === prepared.pdxBaseline);
  return { settingsChanges, pdxChanges, restored };
}

/**
 * Waits until the game is ready: Tongs answers from the started process, `system.log` says
 * `Running application` (the lab's two signs), the save is loaded and paused when the session
 * starts from it, and a frame of the main loop has passed. From Tongs 0.19 this is Tongs' ready
 * wait (its `docs/commands.md`, "Sessions and the ready wait"): the game must be in session 1, a
 * `frames` answer must show that session paused, and the input the game ignores right after a
 * load needs no fixed wait. `loaded` runs then, before the wait for the menu's animation (and,
 * with an older Tongs, for the load's ignored input).
 */
async function waitReady(
  options: RunOptions,
  game: GameRecord,
  session: CaptureSession,
  profile: string,
  env: { now: () => Date; sleep: (ms: number) => Promise<void> },
  log: (event: Readonly<Record<string, unknown>>) => void,
  loaded: (tongs: Tongs) => Promise<void>,
): Promise<{ tongs: Tongs; version: string; readyMs: number }> {
  const deadline = env.now().getTime() + (options.readyTimeoutMs ?? 5 * 60_000);
  const systemLog = join(profile, 'logs', 'system.log');
  let tongs: Tongs | undefined;
  let version: string | undefined;
  let sessions = false;
  let runningSince: number | undefined;
  let ready: { tongs: Tongs; state: unknown } | undefined;
  /** The game has been in session 1 of the save (with Tongs 0.19 or later). */
  let inSession = false;
  /**
   * Whether `answer`, `state` or a `frames` answer with the state, is the start's ready state.
   * Throws `NotReady` when no later answer can be: Tongs 0.19's `unexpected_session` and
   * `left_game`.
   */
  const readyState = (answer: TongsAnswer): boolean => {
    if (session.start === 'main-menu') return answer['in_game'] === false;
    if (answer['in_game'] !== true) {
      if (inSession) throw new NotReady('The game left the save before it was ready.');
      return false;
    }
    if (sessions) {
      const current = answer['session'];
      if (typeof current !== 'number') {
        throw new NotReady(`Tongs ${String(version)} answers in a game with no session.`);
      }
      if (current !== 1) throw new NotReady(`The game is in session ${String(current)}, not 1.`);
      inSession = true;
    }
    return answer['paused'] === true;
  };
  while (ready === undefined) {
    if (env.now().getTime() > deadline) {
      tongs?.close();
      throw new Error('The game was not ready in time.');
    }
    try {
      if (tongs === undefined) {
        const connected = await options.connect();
        const ping = await connected.call('ping');
        if (ping['pid'] !== game.pid) {
          connected.close();
          throw new Error(`Tongs answers from pid ${String(ping['pid'])}, not the started game.`);
        }
        const startMs = ping['process_start_ms'];
        if (typeof startMs === 'number' && Math.abs(startMs - game.creationUnixMs) > 2000) {
          connected.close();
          throw new Error('Tongs answers from a process with another start time.');
        }
        tongs = connected;
        version = typeof ping['version'] === 'string' ? ping['version'] : 'unknown';
        sessions = hasSessions(version);
      }
      if (await runningApplication(systemLog, game.creationUnixMs)) {
        runningSince ??= env.now().getTime();
        const state = await tongs.call('state');
        const confirm = session.playset.save?.confirm;
        if (session.start === 'save' && state['in_game'] !== true && confirm !== undefined) {
          // A dialog that asks before the save goes on loading (Anbennar's achievements warning,
          // etch#55): its button is clicked like a recipe's, and the load starts from there.
          const found = await tongs.call(`ui find ${confirm}`);
          const matches = Array.isArray(found['matches']) ? (found['matches'] as unknown[]) : [];
          if (matches.some((m) => (m as { visible?: unknown }).visible !== false)) {
            const clicked = await tongs.call(`ui click ${confirm} timeout=10`);
            log({ confirm, ok: clicked.ok, ...(clicked.ok ? {} : { error: clicked.error }) });
            runningSince = env.now().getTime();
          }
        }
        if (
          session.start === 'save' &&
          state['in_game'] !== true &&
          env.now().getTime() - runningSince > 120_000
        ) {
          throw new Error('Tongs answers from the game, but the save did not load in 2 minutes.');
        }
        if (readyState(state)) {
          const frames = await tongs.call('frames timeout=30', 40_000);
          // From Tongs 0.19 the frame's own state shows that it belongs to the ready session.
          if (frames.ok && (!sessions || readyState(frames))) {
            ready = { tongs, state: sessions ? frames : state };
            break;
          }
        }
      }
    } catch (error) {
      if (error instanceof NotReady || message(error).startsWith('Tongs answers from')) {
        tongs?.close();
        throw error;
      }
      tongs?.close();
      tongs = undefined;
    }
    await env.sleep(500);
  }
  try {
    await loaded(ready.tongs);
  } catch (error) {
    ready.tongs.close();
    throw error;
  }
  // The menu's opening animation; before Tongs 0.19, also the input the game ignores right after
  // a load, which its ready wait leaves out.
  if (session.start === 'main-menu') await env.sleep(3000);
  else if (!sessions) await env.sleep(5000);
  const readyMs = env.now().getTime() - game.creationUnixMs;
  log({ ready: true, readyMs, version, sessions, state: ready.state });
  return { tongs: ready.tongs, version: version ?? 'unknown', readyMs };
}

/** The game cannot get ready any more: a later session, or it left the save. */
class NotReady extends Error {}

/** Whether a Tongs `version` has `session` and the ready wait: 0.19.0 and later. */
export function hasSessions(version: string): boolean {
  return tongsAtLeast(version, 19);
}

async function runningApplication(systemLog: string, sinceMs: number): Promise<boolean> {
  try {
    if ((await stat(systemLog)).mtimeMs < sinceMs) return false;
    return (await readFile(systemLog, 'latin1')).includes('Running application');
  } catch {
    return false;
  }
}

async function writeCapture(
  options: RunOptions,
  capture: { record: CaptureRecord; screenshot: Uint8Array; mask?: Uint8Array },
): Promise<void> {
  const key: CaptureKey = {
    playset: capture.record.playset,
    resolution: capture.record.resolution,
    view: capture.record.view,
  };
  const recordFile = captureRecordFile(options.recordsDir, key);
  const png = screenshotFile(options.localDir, key);
  const mask = unstableMaskFile(options.localDir, key);
  await mkdir(dirname(recordFile), { recursive: true });
  await mkdir(dirname(png), { recursive: true });
  await writeFile(png, capture.screenshot);
  if (capture.mask !== undefined) await writeFile(mask, capture.mask);
  else await rm(mask, { force: true });
  await writeFile(recordFile, await options.format(JSON.stringify(capture.record), recordFile));
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
