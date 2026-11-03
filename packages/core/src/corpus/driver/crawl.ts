/**
 * The coverage survey's crawler (docs/coverage.md): from a playset's start state it opens every
 * view a player can reach by clicking a shown, enabled button or check box, pressing one of the
 * survey's keys or opening a province, breadth first up to a depth, and writes down how to get
 * back to each one as a recipe. The views it finds become the survey's manifest, and the capture
 * driver then captures each one from a fresh start, which also checks that its recipe holds.
 *
 * The crawler never makes a game call, and it keeps the game's state:
 *
 * - it clicks nothing a `never` pattern of the survey names (confirmations, exits, speed), and in
 *   a list only the first row;
 * - before it starts it takes a fingerprint of the game's state (the date, the pause, the player,
 *   the game calls, the top bar's texts: treasury, manpower, power, stability and the rest), and
 *   after every click it takes it again. A click that changed it, or that left or entered a game,
 *   is never clicked again, and the session asks for a fresh start of the game;
 * - a click after which Escape cannot bring back the start state ends the session the same way.
 *
 * The crawl's state is one JSON file per playset, resolution and start, so that a fresh start
 * goes on where the last one stopped.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { RecipeStart, RecipeStep } from '../manifest.ts';
import { matchesWidgetPattern } from '../widget-path.ts';
import type { CaptureSession } from './plan.ts';
import { runSession, waitResume, type RunOptions, type SessionReport } from './run.ts';
import type { Tongs, TongsAnswer } from './tongs.ts';
import {
  DEFAULT_TIMING,
  TRANSIENT_WINDOWS,
  ViewFailure,
  awayPoint,
  backToStart,
  frame,
  gameWindow,
  holdCursor,
  runStep,
  stepCommand,
  type ViewContext,
} from './view.ts';

export const CRAWL_FORMAT_VERSION = 1;

/**
 * Provinces tried of each kind: the game refuses those the player has not discovered (Anbennar's
 * first uncolonised ones are terra incognita), and a refusal costs no navigation.
 */
const PROVINCES_PER_KIND = 8;

/** Milliseconds the crawler waits after a step or an Escape, after the frame that follows it. */
const CRAWL_SETTLE_MS = 350;

/** What the survey's crawler may do (`coverage/survey.json`, `crawl`). */
export interface CrawlRules {
  /** Steps from a view to a view it opens, at most. */
  readonly maxDepth: number;
  /** Keys pressed in the start state, such as the country view's `f1`. */
  readonly keys: readonly string[];
  /** Kinds of province opened in the start state of a save. */
  readonly provinces: readonly ProvinceKind[];
  /** Widget patterns never clicked, with the reason. */
  readonly never: readonly { readonly pattern: string; readonly reason: string }[];
  /** Minutes of crawling at most per game start. */
  readonly sessionMinutes: number;
}

export type ProvinceKind = 'own' | 'foreign' | 'uncolonised' | 'wasteland' | 'sea';

/**
 * Why a view did not come back by its steps when they ran but showed another view: the game
 * remembers a window's last tab, page or panel (the country view, the ledger, the macro builder,
 * the province view), so the same key opens what was last on screen. A fresh game opens it as
 * the crawl first saw it, so the survey still captures it.
 */
export const LED_ELSEWHERE = 'Its steps led to another view.';

/** A state the crawler reached: one view of the survey. */
export interface CrawlState {
  readonly id: string;
  /** From the start state. */
  readonly steps: readonly RecipeStep[];
  /** {@link viewSignature}. */
  readonly signature: string;
  /** The visible top-level windows that differ from the start state (all of them for it). */
  readonly roots: readonly string[];
  readonly depth: number;
  /** All its candidates were tried. */
  explored: boolean;
  /** Its steps did not lead to it again. */
  unreproducible?: string;
  /**
   * Escape does not close it (the outliner's options open the Esc menu instead, the main menu's
   * windows close only by their own buttons): it is not explored, and the capture driver takes it
   * last, in a game of its own.
   */
  escapeFails?: string;
}

/** What a candidate did; by candidate (`click PATH`, `key NAME`, `province ID`). */
export type CrawlOutcome =
  | { readonly kind: 'opened'; readonly state: string }
  | { readonly kind: 'known'; readonly state: string }
  | { readonly kind: 'deeper'; readonly signature: string }
  | { readonly kind: 'same' }
  | { readonly kind: 'refused'; readonly error: string }
  | { readonly kind: 'state-changed'; readonly change: string }
  | { readonly kind: 'start-lost'; readonly detail: string };

export interface CrawlFile {
  readonly formatVersion: typeof CRAWL_FORMAT_VERSION;
  readonly playset: string;
  readonly resolution: string;
  readonly start: RecipeStart;
  readonly states: CrawlState[];
  readonly tried: Record<string, CrawlOutcome>;
  /** Patterns never clicked, with the reason: the survey's, and how many candidates each kept out. */
  readonly skipped: Record<string, number>;
  /** Provinces by kind, read once from the save. */
  provinces?: Partial<Record<ProvinceKind, number[]>>;
  starts: number;
  done: boolean;
}

export function newCrawlFile(playset: string, resolution: string, start: RecipeStart): CrawlFile {
  return {
    formatVersion: CRAWL_FORMAT_VERSION,
    playset,
    resolution,
    start,
    states: [],
    tried: {},
    skipped: {},
    starts: 0,
    done: false,
  };
}

export async function readCrawlFile(file: string): Promise<CrawlFile | undefined> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as { formatVersion?: unknown };
    return value.formatVersion === CRAWL_FORMAT_VERSION ? (value as CrawlFile) : undefined;
  } catch {
    return undefined;
  }
}

export async function writeCrawlFile(file: string, crawl: CrawlFile): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(crawl, null, 1)}\n`);
}

/** A widget of `ui tree` as the signature reads it. */
export interface TreeWidget {
  readonly path: string;
  readonly name?: string;
  readonly type: string;
  readonly visible: boolean;
  readonly children?: readonly TreeWidget[];
}

/**
 * The signature of a view (docs/coverage.md, "What a view is"): the visible top-level windows,
 * transient ones left out, each with the visible windows inside it down to the tree's depth.
 * The insides of list boxes and numbered copies (`[2]` and later, the rows of a list) are left
 * out: they are the game's content, not the view. Lines sorted, joined by a newline.
 */
export function viewSignature(tops: readonly TreeWidget[]): string {
  const lines: string[] = [];
  const walk = (widget: TreeWidget, top: string): void => {
    for (const child of widget.children ?? []) {
      if (!child.visible || child.type !== 'window' || /\[([2-9]|\d\d+)\]$/.test(child.path)) {
        continue;
      }
      lines.push(child.path);
      walk(child, top);
    }
  };
  for (const top of tops) {
    if (!top.visible || TRANSIENT_WINDOWS.test(top.path)) continue;
    lines.push(top.path);
    if (top.type !== 'listbox') walk(top, top.path);
  }
  return [...new Set(lines)].sort().join('\n');
}

/** The top-level windows of `signature` whose lines are not those of `base`: a view's roots. */
export function changedRoots(signature: string, base: string): string[] {
  const group = (s: string): Map<string, string[]> => {
    const out = new Map<string, string[]>();
    for (const line of s.split('\n').filter((l) => l !== '')) {
      const top = line.split('/')[0] ?? line;
      out.set(top, [...(out.get(top) ?? []), line]);
    }
    return out;
  };
  const now = group(signature);
  const before = group(base);
  return [...now.keys()].filter(
    (top) => (now.get(top) ?? []).join('\n') !== (before.get(top) ?? []).join('\n'),
  );
}

/** Whether a path is a list's second row or later, which the crawler leaves to the first. */
export function laterRow(path: string): boolean {
  return /\[([2-9]|\d\d+)\](\/|$)/.test(path);
}

/** The step of a candidate. */
export function candidateStep(candidate: string): RecipeStep {
  const [kind = '', ...rest] = candidate.split(' ');
  const value = rest.join(' ');
  if (kind === 'key') return { key: value };
  if (kind === 'province') return { province: Number(value) };
  return { click: value };
}

/**
 * Crawls one started game. Resolves with `restart: true` when the game must start again: the
 * state changed, or the start state was lost; with `restart: false` when the crawl is done or its
 * time is up (`crawl.done` says which).
 */
export async function crawlGame(
  ctx: ViewContext,
  crawl: CrawlFile,
  rules: CrawlRules,
  save: (crawl: CrawlFile) => Promise<void>,
): Promise<{ restart: boolean }> {
  // A frame has passed after each step; windows show at once, so the crawl waits less than a
  // capture, whose shots must not catch an animation. A view its steps did not open in time is
  // caught by its signature.
  const timing = { ...(ctx.timing ?? DEFAULT_TIMING), stepSettleMs: CRAWL_SETTLE_MS };
  const deadline = ctx.now().getTime() + rules.sessionMinutes * 60_000;
  crawl.starts++;
  const window = await gameWindow(ctx);
  const startSignature = await signature(ctx.tongs);
  const first = crawl.states[0];
  if (first === undefined) {
    crawl.states.push({
      id: 's0',
      steps: [],
      signature: startSignature,
      roots: changedRoots(startSignature, ''),
      depth: 0,
      explored: false,
    });
  } else if (first.signature !== startSignature) {
    ctx.log({ crawl: 'the start state differs from the first start', now: startSignature });
  }
  const base = crawl.states[0]?.signature ?? startSignature;
  const fingerprint = await fingerprintOf(ctx);
  ctx.log({ crawl: 'start', fingerprint });
  if (ctx.start === 'save' && crawl.provinces === undefined && rules.provinces.length > 0) {
    crawl.provinces = await findProvinces(ctx.tongs, rules.provinces);
    ctx.log({ provinces: crawl.provinces });
  }
  await save(crawl);

  /** Rests the pointer, lets the game draw, and reads the signature. */
  const settle = async (): Promise<string> => {
    const away = await awayPoint(ctx, window);
    await ctx.tongs.call(`move ${String(away.x)} ${String(away.y)}`);
    await ctx.sleep(timing.stepSettleMs);
    await frame(ctx);
    return signature(ctx.tongs);
  };

  /** To a state from wherever the game is; `false` when its steps lead elsewhere. */
  const goTo = async (state: CrawlState): Promise<boolean> => {
    await holdCursor(ctx, window);
    await backToStart(ctx, timing);
    if ((await settle()) !== base) {
      throw new ViewFailure(
        'Escape brought back the start windows, but not the start state.',
        true,
      );
    }
    for (const step of state.steps) {
      let answer;
      try {
        answer = await runStep(ctx, stepCommand(step, window), timing);
      } catch (error) {
        // Tongs refused a step (a button no longer shown): the view cannot be reached again.
        if (!(error instanceof ViewFailure) || error.lost) throw error;
        state.unreproducible = error.message;
        return false;
      }
      if ('click' in step && (answer['clicked'] === undefined || answer['clicked'] === false)) {
        state.unreproducible = `"${stepCommand(step, window)}" did not click.`;
        return false;
      }
      await frame(ctx);
      await ctx.sleep(timing.stepSettleMs);
    }
    const now = await settle();
    if (now !== state.signature) {
      state.unreproducible = LED_ELSEWHERE;
      ctx.log({ unreproducible: state.id, now });
      return false;
    }
    return true;
  };

  let last: string | undefined;
  try {
    for (let s = 0; s < crawl.states.length; s++) {
      const state = crawl.states[s];
      if (state === undefined || state.explored) continue;
      if (!(await goTo(state))) {
        state.explored = true;
        await save(crawl);
        continue;
      }
      let here = true;
      const candidates = await candidatesOf(ctx, crawl, rules, state);
      await save(crawl);
      for (const candidate of candidates) {
        if (crawl.tried[candidate] !== undefined) continue;
        if (ctx.now().getTime() > deadline) return { restart: false };
        if (!here && !(await goTo(state))) break;
        last = candidate;
        const step = candidateStep(candidate);
        const answer = await ctx.tongs.call(stepCommand(step, window));
        await frame(ctx);
        const now = await settle();
        const change = await changeOf(ctx, fingerprint);
        if (change !== undefined) {
          crawl.tried[candidate] = { kind: 'state-changed', change };
          ctx.log({ candidate, stateChanged: change });
          await save(crawl);
          return { restart: true };
        }
        if (!answer.ok) {
          crawl.tried[candidate] = { kind: 'refused', error: answer.error ?? 'failed' };
          here = now === state.signature;
        } else if (now === state.signature) {
          crawl.tried[candidate] = { kind: 'same' };
          here = true;
        } else {
          here = false;
          const known = crawl.states.find((x) => x.signature === now);
          if (known !== undefined) {
            crawl.tried[candidate] = { kind: 'known', state: known.id };
          } else if (state.depth >= rules.maxDepth) {
            crawl.tried[candidate] = { kind: 'deeper', signature: now };
          } else {
            const id = `s${String(crawl.states.length)}`;
            crawl.states.push({
              id,
              steps: [...state.steps, step],
              signature: now,
              roots: changedRoots(now, base),
              depth: state.depth + 1,
              explored: false,
            });
            crawl.tried[candidate] = { kind: 'opened', state: id };
            ctx.log({ candidate, opened: id });
          }
        }
        await save(crawl);
      }
      state.explored = true;
      await save(crawl);
    }
    crawl.done = true;
    await save(crawl);
    return { restart: false };
  } catch (error) {
    if (error instanceof ViewFailure && error.lost && last !== undefined) {
      // The last click left something Escape cannot close: it is not clicked again, and the view
      // it opened, with every view found from it, is not explored.
      const before = crawl.tried[last];
      const shown =
        before?.kind === 'opened' || before?.kind === 'known'
          ? crawl.states.find((x) => x.id === before.state)
          : undefined;
      if (shown !== undefined) {
        const prefix = JSON.stringify(shown.steps).slice(0, -1);
        for (const x of crawl.states) {
          if (x === shown || JSON.stringify(x.steps).startsWith(prefix)) {
            x.escapeFails = error.message;
            x.explored = true;
          }
        }
      }
      crawl.tried[last] = { kind: 'start-lost', detail: error.message };
      ctx.log({ candidate: last, startLost: error.message });
      await save(crawl);
      return { restart: true };
    }
    throw error;
  }
}

/** The visible tree three levels deep, as {@link viewSignature} reads it. */
async function signature(tongs: Tongs): Promise<string> {
  for (const depth of [3, 2, 1]) {
    const answer = await tongs.call(`ui tree depth=${String(depth)} limit=5000 timeout=30`, 40_000);
    if (!answer.ok) throw new ViewFailure(`ui tree: ${answer.error ?? 'failed'}.`);
    if (answer['truncated'] === true) continue;
    return viewSignature((answer['widgets'] ?? []) as TreeWidget[]);
  }
  throw new ViewFailure('The visible tree has more than 5000 widgets even one level deep.');
}

/**
 * What the crawler compares after each click: the game's state as Tongs reads it (whether a game
 * is loaded, its date, pause, session and game calls), the player and the top bar's texts.
 */
async function fingerprintOf(ctx: ViewContext): Promise<Record<string, string>> {
  const state = await ctx.tongs.call('state');
  const out: Record<string, string> = {
    in_game: String(state['in_game']),
    pid: String(state['pid']),
  };
  if (state['in_game'] !== true) return out;
  for (const field of ['date', 'paused', 'session', 'game_calls_total', 'speed']) {
    out[field] = String(state[field]);
  }
  const player = await ctx.tongs.call('player');
  out['player'] = String(player['tag']);
  const texts = await ctx.tongs.call('ui find topbar//[type=text] limit=500');
  for (const m of (texts['matches'] ?? []) as { path: string; text?: string }[]) {
    out[m.path] = m.text ?? '';
  }
  return out;
}

async function changeOf(
  ctx: ViewContext,
  before: Record<string, string>,
): Promise<string | undefined> {
  const now = await fingerprintOf(ctx);
  // Only what the start state showed: a window that opens inside the top bar (Anbennar's
  // achievements) adds texts, and one that covers part of it hides some; neither is the game's
  // state. The state's own fields are always there.
  const changed = Object.keys(before).filter((k) => k in now && before[k] !== now[k]);
  if (changed.length === 0) return undefined;
  return changed.map((k) => `${k}: ${String(before[k])} -> ${String(now[k])}`).join('; ');
}

/** The candidates of a state, in order: keys and provinces in the start state, then widgets. */
async function candidatesOf(
  ctx: ViewContext,
  crawl: CrawlFile,
  rules: CrawlRules,
  state: CrawlState,
): Promise<string[]> {
  const out: string[] = [];
  if (state.depth === 0) {
    out.push(...rules.keys.map((k) => `key ${k}`));
    for (const kind of rules.provinces) {
      out.push(...(crawl.provinces?.[kind] ?? []).map((id) => `province ${String(id)}`));
    }
  }
  for (const type of ['button', 'checkbox']) {
    const answer = await ctx.tongs.call(`ui find //[type=${type}] limit=5000`);
    for (const match of (answer['matches'] ?? []) as TongsAnswer[]) {
      const path = String(match['path']);
      if (match['enabled'] === false || TRANSIENT_WINDOWS.test(path) || laterRow(path)) continue;
      const never = rules.never.find((n) => matchesWidgetPattern(n.pattern, path));
      if (never !== undefined) {
        crawl.skipped[never.pattern] = (crawl.skipped[never.pattern] ?? 0) + 1;
        continue;
      }
      out.push(`click ${path}`);
    }
  }
  return [...new Set(out)];
}

/**
 * Up to eight provinces of each kind, by reading provinces by id from 1 until each kind has eight or
 * an id answers that it has no province.
 */
async function findProvinces(
  tongs: Tongs,
  kinds: readonly ProvinceKind[],
): Promise<Partial<Record<ProvinceKind, number[]>>> {
  const player = String((await tongs.call('player'))['tag']);
  const found: Partial<Record<ProvinceKind, number[]>> = {};
  const full = (): boolean => kinds.every((k) => (found[k]?.length ?? 0) >= PROVINCES_PER_KIND);
  let misses = 0;
  for (let id = 1; id < 10_000 && !full() && misses < 50; id++) {
    const p = await tongs.call(`province ${String(id)}`);
    if (!p.ok) {
      misses++;
      continue;
    }
    misses = 0;
    const kind: ProvinceKind =
      p['land'] === false
        ? 'sea'
        : p['wasteland'] === true
          ? 'wasteland'
          : p['owner'] === null
            ? 'uncolonised'
            : p['owner'] === player
              ? 'own'
              : 'foreign';
    if (!kinds.includes(kind) || (found[kind]?.length ?? 0) >= PROVINCES_PER_KIND) continue;
    found[kind] = [...(found[kind] ?? []), id];
  }
  return found;
}

/** A crawl of the survey: fresh starts of one playset, resolution and start until it is done. */
export interface CrawlRunOptions extends Omit<RunOptions, 'sessions' | 'explore'> {
  readonly session: CaptureSession;
  readonly rules: CrawlRules;
  /** The crawl's JSON file (`newCrawlFile`), read again when it exists. */
  readonly file: string;
  /** Fresh starts at most in this run. */
  readonly maxStarts: number;
}

export async function runCrawl(
  options: CrawlRunOptions,
): Promise<{ crawl: CrawlFile; sessions: SessionReport[]; stopped?: string }> {
  const now = options.now ?? ((): Date => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const print = options.print ?? ((): void => undefined);
  const { session } = options;
  const resolution = `${String(session.resolution.width)}x${String(session.resolution.height)}`;
  const crawl =
    (await readCrawlFile(options.file)) ??
    newCrawlFile(session.playset.id, resolution, session.start);
  const runDir = join(
    options.localDir,
    'runs',
    `crawl-${now()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, 'Z')}`,
  );
  await mkdir(runDir, { recursive: true });
  const sessions: SessionReport[] = [];
  for (let start = 0; start < options.maxStarts && !crawl.done; start++) {
    if (options.lockExpiresAt !== undefined && now() >= options.lockExpiresAt) {
      return { crawl, sessions, stopped: "The lab's game lock expired." };
    }
    print(`crawl ${crawl.playset} ${resolution} ${crawl.start}: start ${String(crawl.starts + 1)}`);
    const result = await runSession(
      {
        ...options,
        sessions: [],
        explore: (ctx) =>
          crawlGame(ctx, crawl, options.rules, (c) => writeCrawlFile(options.file, c)),
      },
      session,
      runDir,
      sessions.length + 1,
      { now, sleep, print },
    );
    sessions.push(result.report);
    await writeFile(join(runDir, 'report.json'), `${JSON.stringify(sessions, null, 2)}\n`);
    const states = crawl.states.length;
    const explored = crawl.states.filter((s) => s.explored).length;
    print(
      `  ${String(states)} views, ${String(explored)} explored, ${String(Object.keys(crawl.tried).length)} candidates tried`,
    );
    if (result.fatal !== undefined) return { crawl, sessions, stopped: result.fatal };
    if (result.report.mouseReleased === true) {
      // As a capture run: the mouse is the user's until they create `resume` in the run folder.
      if (!(await waitResume(options, runDir, { now, sleep, print }))) {
        return {
          crawl,
          sessions,
          stopped: 'The mouse was released and the crawl was not resumed.',
        };
      }
      start--;
    }
    // A session that asked for a fresh start, or whose time ran out: the next start goes on.
  }
  return { crawl, sessions };
}
