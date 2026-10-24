/**
 * Capturing one view with Tongs (ADR 0002, corpus/README.md): bring the game back to the recipe's
 * start state, run the recipe's steps, move the pointer away, read the widget trees of the view's
 * roots, take at least two screenshots and record which pixels were not the same in all of them,
 * then read the trees again to see that nothing moved while the shots were taken. The driver
 * never sends a game call (`console`) or a `reload`, so no tree is read after a reload.
 */
import { createHash } from 'node:crypto';
import type { Screen } from '../../model/gui.ts';
import {
  captureProblems,
  parseCaptureRecord,
  type CaptureRecord,
  type CapturedWidget,
} from '../capture.ts';
import {
  CORPUS_FORMAT_VERSION,
  resolutionKey,
  type CorpusManifest,
  type CorpusView,
  type Recipe,
  type RecipeStart,
  type RecipeStep,
} from '../manifest.ts';
import { decodePng, encodeGreyPng, type RgbaImage } from '../png.ts';
import { compareShots, unstableIn, type ShotComparison } from '../shots.ts';
import type { Tongs, TongsAnswer } from './tongs.ts';

/** Waits and repetitions; the defaults are those of the live runs (etch#18, etch#42). */
export interface CaptureTiming {
  /** After each step, for the game to react and open the window. */
  readonly stepSettleMs: number;
  /** After the pointer has moved away, before the trees are read (window animations). */
  readonly settleMs: number;
  /** Between two screenshots. */
  readonly shotGapMs: number;
  /** Shots taken when the first two are identical. */
  readonly shots: number;
  /** Shots taken in all when the first two differ, to find more of the unstable pixels. */
  readonly shotsWhenUnstable: number;
  /** Escape presses at most to bring the game back to the start state. */
  readonly maxEscapes: number;
}

export const DEFAULT_TIMING: CaptureTiming = {
  stepSettleMs: 700,
  settleMs: 1500,
  shotGapMs: 300,
  shots: 2,
  shotsWhenUnstable: 4,
  maxEscapes: 4,
};

/** What a session knows when it captures a view. */
export interface ViewContext {
  readonly tongs: Tongs;
  readonly manifest: CorpusManifest;
  readonly playset: string;
  readonly resolution: Screen;
  readonly start: RecipeStart;
  /** The game's process id, which every answer with the state repeats (tongs README). */
  readonly pid: number;
  /** The visible top-level windows of the start state, sorted (`startWindows`). */
  readonly startWindows: readonly string[];
  readonly exeSha256: string;
  readonly tongsVersion: string;
  readonly saveSha256?: string;
  readonly mods: readonly { readonly name: string; readonly sha256: string }[];
  readonly disabledDlcs: readonly string[];
  /** The real mouse cursor, which the session pins inside the client area (`pinCursor`). */
  readonly mouse?: MouseCursor;
  /** Where the pointer rests while the view is read and shot, by start state. */
  readonly away: Readonly<Record<RecipeStart, AwayPoint>>;
  readonly readFile: (path: string) => Promise<Uint8Array>;
  readonly sleep: (ms: number) => Promise<void>;
  readonly now: () => Date;
  readonly log: (event: Readonly<Record<string, unknown>>) => void;
  readonly timing?: CaptureTiming;
}

/**
 * Where the pointer rests: a point of the client area as fractions of its size, or the centre of
 * the one shown widget a pattern matches. Over the map the pointer must keep off the edges, which
 * scroll the map, and off provinces, which show a tooltip; an inert widget such as the pause
 * banner does both.
 */
export type AwayPoint =
  { readonly fraction: { readonly x: number; readonly y: number } } | { readonly widget: string };

/** The defaults: the main menu's bottom-right pixel, and the save's pause banner. */
export const DEFAULT_AWAY: Readonly<Record<RecipeStart, AwayPoint>> = {
  'main-menu': { fraction: { x: 1, y: 1 } },
  save: { widget: 'topbar//pause_banner' },
};

/** A rectangle in screen pixels, right and bottom excluded, as Windows' `RECT`. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type CursorState =
  | {
      readonly x: number;
      readonly y: number;
      /** The rectangle Windows confines the cursor to: the whole virtual screen when it is free. */
      readonly clip: ScreenRect;
    }
  /** Windows refused the call that failed, as it does while the screen is locked. */
  | { readonly unavailable: string };

/**
 * The real mouse cursor. The game scrolls the map towards a cursor outside its window even without
 * focus, and sees the real cursor again whenever it moves, so a session pins it to one pixel of the
 * client area (`ClipCursor`). Windows clears that clip on Ctrl+Alt+Del, Win+L, the Windows key or
 * another window coming to the front, and refuses the calls while the screen is locked: that is
 * the user's way to take the mouse back.
 */
export interface MouseCursor {
  read(): Promise<CursorState>;
  /** Moves the cursor to a screen point and confines it there. */
  pin(x: number, y: number): Promise<CursorState>;
  release(): Promise<void>;
}

/** The user took the mouse back: the session ends cleanly and the run waits for them. */
export class MouseReleased extends Error {}

export interface ViewCapture {
  readonly record: CaptureRecord;
  /** The first shot's PNG file as Tongs wrote it; its hash is in the record. */
  readonly screenshot: Uint8Array;
  /** The unstable mask as an 8-bit greyscale PNG, when some pixels were unstable. */
  readonly mask?: Uint8Array;
  /** Unstable pixels inside the rects of visible widgets of the view's trees. */
  readonly unstableInWidgets: number;
  /** The recipe was not verified in the manifest and worked now. */
  readonly verifiedNow: boolean;
}

export type ViewOutcome =
  | { readonly view: string; readonly ok: true; readonly capture: ViewCapture }
  | {
      readonly view: string;
      readonly ok: false;
      readonly reason: string;
      /** The game could not be brought back to the start state: the session ends here. */
      readonly lost: boolean;
      /** Nothing of it was written, so a fresh start can take it again. */
      readonly retry?: boolean;
      /** The user took the mouse back (`MouseReleased`): the run waits for them. */
      readonly released?: boolean;
    };

class ViewFailure extends Error {
  readonly lost: boolean;
  retry = false;

  constructor(message: string, lost = false) {
    super(message);
    this.lost = lost;
  }
}

/**
 * Top-level windows that come and go with the map and the pointer, not with the recipe: the icons
 * of `mapicons.gui` (`navy_mapicon`, `unit_mapicon`, …) and tooltips. The start state leaves them
 * out; a tooltip shown while a view is read fails the view instead.
 */
export const TRANSIENT_WINDOWS = /mapicon|^tooltip/i;
const TOOLTIP = /^tooltip/i;

async function topLevelWindows(tongs: Tongs): Promise<string[]> {
  const answer = await ask(tongs, 'ui tree depth=0 limit=5000');
  if (answer['truncated'] === true) throw new ViewFailure('More than 5000 top-level windows.');
  return widgetList(answer['widgets']).map((w) => w.path);
}

/**
 * The visible top-level windows, as Tongs' `ui tree depth=0` lists them, sorted, without the
 * transient ones (`TRANSIENT_WINDOWS`).
 */
export async function startWindows(tongs: Tongs): Promise<string[]> {
  return (await topLevelWindows(tongs)).filter((path) => !TRANSIENT_WINDOWS.test(path)).sort();
}

/**
 * The start state of a session: the pointer first rests where the views will rest it, so that
 * nothing the real cursor hovers (a province's tooltip) is taken for part of the state.
 */
export async function settleStart(ctx: ViewContext): Promise<string[]> {
  const window = await gameWindow(ctx);
  await holdCursor(ctx, window);
  const away = await awayPoint(ctx, window);
  await ask(ctx.tongs, `move ${String(away.x)} ${String(away.y)}`);
  await ctx.sleep((ctx.timing ?? DEFAULT_TIMING).settleMs);
  await frame(ctx);
  return startWindows(ctx.tongs);
}

/** Captures one view; failures come back as an outcome, never as an exception from the game. */
export async function captureView(ctx: ViewContext, view: CorpusView): Promise<ViewOutcome> {
  try {
    return { view: view.id, ok: true, capture: await capture(ctx, view) };
  } catch (error) {
    if (error instanceof MouseReleased) {
      ctx.log({ view: view.id, failed: error.message, released: true });
      return {
        view: view.id,
        ok: false,
        reason: error.message,
        lost: true,
        retry: true,
        released: true,
      };
    }
    if (!(error instanceof ViewFailure)) throw error;
    ctx.log({ view: view.id, failed: error.message, lost: error.lost, retry: error.retry });
    return {
      view: view.id,
      ok: false,
      reason: error.message,
      lost: error.lost,
      ...(error.retry ? { retry: true } : {}),
    };
  }
}

async function capture(ctx: ViewContext, view: CorpusView): Promise<ViewCapture> {
  const timing = ctx.timing ?? DEFAULT_TIMING;
  try {
    await backToStart(ctx, timing);
  } catch (error) {
    if (error instanceof ViewFailure) error.retry = true;
    throw error;
  }

  const window = await gameWindow(ctx);
  const pinned = await holdCursor(ctx, window);
  const cursor = await checkCursor(ctx, undefined);
  for (const step of view.recipe.steps) {
    const answer = await runStep(ctx, stepCommand(step, window), timing);
    ctx.log({ view: view.id, step, answer: brief(answer) });
    // Tongs answers `clicked` with the path of the widget it clicked.
    if ('click' in step && (answer['clicked'] === undefined || answer['clicked'] === false)) {
      throw new ViewFailure(`"${stepCommand(step, window)}" did not click.`);
    }
    await frame(ctx);
    await ctx.sleep(timing.stepSettleMs);
  }

  const away = await awayPoint(ctx, window);
  await ask(ctx.tongs, `move ${String(away.x)} ${String(away.y)}`);
  await ctx.sleep(timing.settleMs);
  await frame(ctx);
  await checkState(ctx);

  const widgets = await readTrees(ctx, view);
  await noTooltip(ctx);
  const files: Uint8Array[] = [];
  const images: RgbaImage[] = [];
  let comparison: ShotComparison | undefined;
  for (let i = 0; ; i++) {
    if (i > 0) {
      await ctx.sleep(timing.shotGapMs);
      await frame(ctx);
    }
    const answer = await ask(ctx.tongs, `screenshot etch-${view.id}-${String(i + 1)}`);
    const path = answer['path'];
    if (typeof path !== 'string')
      throw new ViewFailure('Tongs answered screenshot without a path.');
    const bytes = await ctx.readFile(path);
    files.push(bytes);
    images.push(decodePng(bytes));
    if (images.length >= 2) comparison = compareShots(images);
    const wanted =
      comparison !== undefined && comparison.unstablePixels > 0
        ? timing.shotsWhenUnstable
        : timing.shots;
    if (images.length >= Math.max(2, wanted)) break;
  }
  if (comparison === undefined) throw new ViewFailure('Fewer than two shots.');

  const after = await readTrees(ctx, view);
  if (JSON.stringify(after) !== JSON.stringify(widgets)) {
    throw new ViewFailure('The widget trees changed while the screenshots were taken.');
  }
  await noTooltip(ctx);
  await stillPinned(ctx, pinned);
  await checkCursor(ctx, cursor);
  const windowAfter = await gameWindow(ctx);
  if (JSON.stringify(windowAfter) !== JSON.stringify(window)) {
    throw new ViewFailure('The game window changed while the screenshots were taken.');
  }
  await checkState(ctx);

  const [first, firstImage] = [files[0], images[0]];
  if (first === undefined || firstImage === undefined) throw new ViewFailure('No screenshot.');
  const mask =
    comparison.unstablePixels > 0
      ? encodeGreyPng(comparison.width, comparison.height, comparison.unstable)
      : undefined;
  const unstableInWidgets = unstableIn(
    comparison,
    [...visibleWidgets(widgets)].map((w) => w.rect),
  );

  const verifiedNow = !view.recipe.verified;
  const recipe: Recipe = {
    from: view.recipe.from,
    steps: view.recipe.steps,
    verified: true,
    evidence: view.recipe.verified
      ? view.recipe.evidence
      : `Run by the capture driver (etch#42) at ${resolutionKey(ctx.resolution)}: the steps opened the view and its roots were read.`,
  };
  const record: CaptureRecord = {
    formatVersion: CORPUS_FORMAT_VERSION,
    playset: ctx.playset,
    resolution: { width: ctx.resolution.width, height: ctx.resolution.height },
    view: view.id,
    takenAt: ctx.now().toISOString(),
    game: { exeSha256: ctx.exeSha256 },
    tongs: { version: ctx.tongsVersion },
    ...(ctx.start === 'save' && ctx.saveSha256 !== undefined
      ? { save: { sha256: ctx.saveSha256 } }
      : {}),
    mods: ctx.mods,
    disabledDlcs: ctx.disabledDlcs,
    recipe,
    window,
    screenshot: {
      sha256: sha256(first),
      width: firstImage.width,
      height: firstImage.height,
      shots: images.length,
      ...(mask !== undefined
        ? { unstable: { pixels: comparison.unstablePixels, sha256: sha256(mask) } }
        : {}),
    },
    widgets,
  };

  const parsed = parseCaptureRecord(JSON.parse(JSON.stringify(record)) as unknown);
  const problems = [
    ...parsed.problems,
    ...(parsed.capture !== undefined ? captureProblems(ctx.manifest, parsed.capture) : []),
  ];
  if (problems.length > 0) {
    throw new ViewFailure(
      `The capture does not fit the corpus: ${problems.map((p) => `${p.at}: ${p.message}`).join('; ')}`,
    );
  }
  ctx.log({
    view: view.id,
    captured: true,
    shots: images.length,
    unstablePixels: comparison.unstablePixels,
    unstableInWidgets,
  });
  return {
    record,
    screenshot: first,
    ...(mask !== undefined ? { mask } : {}),
    unstableInWidgets,
    verifiedNow,
  };
}

/**
 * Closes what the previous view opened: Escape, one press at a time, until the visible top-level
 * windows are those of the start state. A press that opens a window the start state does not
 * have, or too many presses, lose the start state; the session then ends and a fresh start takes
 * the remaining views.
 */
async function backToStart(ctx: ViewContext, timing: CaptureTiming): Promise<void> {
  const same = (a: readonly string[]): boolean => a.join('\n') === ctx.startWindows.join('\n');
  let current = await startWindows(ctx.tongs);
  for (let presses = 0; !same(current); presses++) {
    // Escape only closes: a window of the start state that is gone cannot come back by it.
    if (current.every((w) => ctx.startWindows.includes(w))) {
      throw new ViewFailure(
        `The start state lost windows that Escape cannot bring back: ${describeDifference(ctx.startWindows, current)}.`,
        true,
      );
    }
    if (presses >= timing.maxEscapes) {
      throw new ViewFailure(
        `Not back at the start state after ${String(presses)} Escape presses: ${describeDifference(ctx.startWindows, current)}.`,
        true,
      );
    }
    ctx.log({ escape: describeDifference(ctx.startWindows, current) });
    await ask(ctx.tongs, 'key escape');
    await frame(ctx);
    await ctx.sleep(timing.stepSettleMs);
    const next = await startWindows(ctx.tongs);
    const opened = next.filter((w) => !current.includes(w) && !ctx.startWindows.includes(w));
    if (opened.length > 0) {
      throw new ViewFailure(
        `Escape opened ${opened.join(', ')} instead of closing a window.`,
        true,
      );
    }
    current = next;
  }
  await checkState(ctx);
}

async function noTooltip(ctx: ViewContext): Promise<void> {
  const tooltips = (await topLevelWindows(ctx.tongs)).filter((path) => TOOLTIP.test(path));
  if (tooltips.length > 0) {
    throw new ViewFailure(
      `A tooltip is shown (${tooltips.join(', ')}); the pointer rests on something that has one.`,
    );
  }
}

/** Margin in pixels the cursor keeps from the client area's edges. */
const CURSOR_MARGIN = 100;

/**
 * Pins the real cursor where Tongs' pointer rests (`AwayPoint`), moved inside the client area's
 * margin, and checks that Windows took the clip. The session does this as soon as the game is
 * ready, before the map could scroll towards a cursor left elsewhere. A pin Windows refuses (the
 * screen is locked) is the user's too: `MouseReleased`.
 */
export async function pinCursor(ctx: ViewContext): Promise<void> {
  if (ctx.mouse === undefined) return;
  const target = await pinTarget(ctx, await gameWindow(ctx));
  const pinned = await ctx.mouse.pin(target.x, target.y);
  if ('unavailable' in pinned) throw released(pinned);
  if (!clipsTo(pinned, target)) {
    throw new MouseReleased(
      `Windows did not confine the mouse cursor to ${String(target.x)},${String(target.y)}.`,
    );
  }
  ctx.log({ pinned: target });
}

const RELEASED =
  'The mouse was released (Ctrl+Alt+Del, Win+L, the Windows key or another window in front).';
const UNAVAILABLE = 'The mouse cursor cannot be read or pinned: the screen is locked';

function released(state: CursorState): MouseReleased {
  return new MouseReleased(
    'unavailable' in state ? `${UNAVAILABLE} (${state.unavailable}).` : RELEASED,
  );
}

/**
 * Before a view: the cursor still pinned where it belongs. A clip that Windows cleared means the
 * user took the mouse back (`MouseReleased`); a pixel left behind by a moved window is pinned
 * again. Resolves with the pinned point.
 */
async function holdCursor(
  ctx: ViewContext,
  window: Screen,
): Promise<{ x: number; y: number } | undefined> {
  if (ctx.mouse === undefined) return undefined;
  const target = await pinTarget(ctx, window);
  const now = await ctx.mouse.read();
  if (clipsTo(now, target)) return target;
  if ('unavailable' in now) throw released(now);
  const { left, top, right, bottom } = now.clip;
  if (right - left !== 1 || bottom - top !== 1) throw released(now);
  ctx.log({ repin: target, clip: now.clip });
  const pinned = await ctx.mouse.pin(target.x, target.y);
  if (!clipsTo(pinned, target)) throw released(pinned);
  return target;
}

/** After the shots: the clip of `holdCursor` was not cleared while the view was captured. */
async function stillPinned(
  ctx: ViewContext,
  target: { x: number; y: number } | undefined,
): Promise<void> {
  if (ctx.mouse === undefined || target === undefined) return;
  const now = await ctx.mouse.read();
  if (!clipsTo(now, target)) throw released(now);
}

async function pinTarget(ctx: ViewContext, window: Screen): Promise<{ x: number; y: number }> {
  const { left, top } = await screenOrigin(ctx);
  const away = await awayPoint(ctx, window);
  const clamp = (v: number, size: number): number =>
    Math.min(Math.max(v, CURSOR_MARGIN), size - 1 - CURSOR_MARGIN);
  return { x: left + clamp(away.x, window.width), y: top + clamp(away.y, window.height) };
}

function clipsTo(state: CursorState, point: { x: number; y: number }): boolean {
  if ('unavailable' in state) return false;
  const { clip } = state;
  return (
    clip.left === point.x &&
    clip.top === point.y &&
    clip.right === point.x + 1 &&
    clip.bottom === point.y + 1
  );
}

async function screenOrigin(ctx: ViewContext): Promise<{ left: number; top: number }> {
  const window = await ask(ctx.tongs, 'window');
  return { left: Number(window['screen_x']), top: Number(window['screen_y']) };
}

/**
 * From a save: the real cursor inside the client area, away from its edges, and where it was at
 * the start of the view. The pin keeps it there, so this is a safety net; breaking it fails the
 * view before anything is written, and a fresh start takes it again.
 */
async function checkCursor(
  ctx: ViewContext,
  before: { x: number; y: number } | undefined,
): Promise<{ x: number; y: number } | undefined> {
  if (ctx.start !== 'save' || ctx.mouse === undefined) return undefined;
  const cursor = await ctx.mouse.read();
  if ('unavailable' in cursor) throw released(cursor);
  const { left, top } = await screenOrigin(ctx);
  const inside =
    cursor.x >= left + CURSOR_MARGIN &&
    cursor.x < left + ctx.resolution.width - CURSOR_MARGIN &&
    cursor.y >= top + CURSOR_MARGIN &&
    cursor.y < top + ctx.resolution.height - CURSOR_MARGIN;
  const fail = (message: string): never => {
    const error = new ViewFailure(message, true);
    error.retry = true;
    throw error;
  };
  if (!inside) {
    fail(
      `The mouse cursor is at ${String(cursor.x)},${String(cursor.y)}, outside the game's client area; the game scrolls the map towards it.`,
    );
  }
  if (before !== undefined && (before.x !== cursor.x || before.y !== cursor.y)) {
    fail('The mouse cursor moved while the view was captured.');
  }
  return { x: cursor.x, y: cursor.y };
}

/**
 * One step. A widget click that Tongs refuses as `covered` is tried again a few times: a window
 * that is still opening (the Esc menu grows in) covers its own buttons for a moment.
 */
async function runStep(
  ctx: ViewContext,
  command: string,
  timing: CaptureTiming,
): Promise<TongsAnswer> {
  for (let attempt = 1; ; attempt++) {
    const answer = await ctx.tongs.call(command);
    if (answer.ok) return answer;
    if (answer.error !== 'covered' || attempt >= 4) throw refused(command, answer);
    ctx.log({ step: command, covered: answer['covered_by'], attempt });
    await ctx.sleep(timing.stepSettleMs);
  }
}

async function awayPoint(ctx: ViewContext, window: Screen): Promise<{ x: number; y: number }> {
  const away = ctx.away[ctx.start];
  if ('fraction' in away) {
    return {
      x: Math.round(away.fraction.x * (window.width - 1)),
      y: Math.round(away.fraction.y * (window.height - 1)),
    };
  }
  const found = await ask(ctx.tongs, `ui find ${away.widget}`);
  const matches = Array.isArray(found['matches']) ? (found['matches'] as TongsWidget[]) : [];
  const point = matches.length === 1 ? matches[0]?.['click_point'] : undefined;
  if (typeof point !== 'object' || point === null) {
    throw new ViewFailure(`The pointer's resting widget ${away.widget} is not shown exactly once.`);
  }
  const { x, y } = point as { x: number; y: number };
  return { x, y };
}

function describeDifference(start: readonly string[], now: readonly string[]): string {
  const extra = now.filter((w) => !start.includes(w));
  const missing = start.filter((w) => !now.includes(w));
  return [
    extra.length > 0 ? `open: ${extra.join(', ')}` : '',
    missing.length > 0 ? `missing: ${missing.join(', ')}` : '',
  ]
    .filter((s) => s !== '')
    .join('; ');
}

/** The same game, no game call since the start, and the start's own state. */
async function checkState(ctx: ViewContext): Promise<void> {
  const state = await ask(ctx.tongs, 'state');
  if (state['pid'] !== ctx.pid) {
    throw new ViewFailure(`The game's process changed (pid ${String(state['pid'])}).`, true);
  }
  const calls = state['game_calls_total'];
  if (typeof calls === 'number' && calls !== 0) {
    throw new ViewFailure(`${String(calls)} game calls were made in this game.`, true);
  }
  if (ctx.start === 'main-menu' && state['in_game'] !== false) {
    throw new ViewFailure('A game is loaded; the view opens from the main menu.', true);
  }
  if (ctx.start === 'save' && (state['in_game'] !== true || state['paused'] !== true)) {
    throw new ViewFailure('The save is not loaded and paused.', true);
  }
}

async function gameWindow(
  ctx: ViewContext,
): Promise<{ width: number; height: number; dpi: number }> {
  const answer = await ask(ctx.tongs, 'window');
  const { width, height, dpi } = answer;
  if (typeof width !== 'number' || typeof height !== 'number' || typeof dpi !== 'number') {
    throw new ViewFailure('Tongs answered window without width, height and dpi.');
  }
  if (answer['minimized'] === true) throw new ViewFailure('The game window is minimised.', true);
  return { width, height, dpi };
}

async function frame(ctx: ViewContext): Promise<void> {
  await ask(ctx.tongs, 'frames timeout=30', 40_000);
}

/** `ui tree ROOT all` for each root, without `click_point`; every root needs a visible match. */
async function readTrees(ctx: ViewContext, view: CorpusView): Promise<CapturedWidget[]> {
  const widgets: CapturedWidget[] = [];
  for (const root of view.roots) {
    const answer = await ctx.tongs.call(`ui tree ${root} all limit=5000 timeout=30`, 40_000);
    if (!answer.ok) throw new ViewFailure(`ui tree ${root}: ${answer.error ?? 'failed'}.`);
    if (answer['truncated'] === true)
      throw new ViewFailure(`The tree of ${root} has more than 5000 widgets.`);
    const trees = widgetList(answer['widgets']).map(captured);
    if (!trees.some((w) => w.visible)) {
      throw new ViewFailure(`The root ${root} is not shown: the recipe did not open the view.`);
    }
    widgets.push(...trees);
  }
  return widgets;
}

interface TongsWidget {
  readonly path: string;
  readonly [key: string]: unknown;
}

function widgetList(value: unknown): TongsWidget[] {
  if (!Array.isArray(value)) throw new ViewFailure('Tongs answered without a widget list.');
  return value as TongsWidget[];
}

/** A Tongs widget as a capture record holds it: without `click_point`. */
function captured(widget: TongsWidget): CapturedWidget {
  if (widget['stale'] === true) {
    throw new ViewFailure(`${widget.path} is stale: the tree was read after a reload.`);
  }
  if ('children_count' in widget) throw new ViewFailure(`The tree of ${widget.path} was cut.`);
  const { children, ...rest } = widget;
  const kept: Record<string, unknown> = { ...rest };
  delete kept['click_point'];
  return {
    ...(kept as unknown as CapturedWidget),
    ...(Array.isArray(children) ? { children: (children as TongsWidget[]).map(captured) } : {}),
  };
}

function* visibleWidgets(widgets: readonly CapturedWidget[]): Generator<CapturedWidget> {
  for (const widget of widgets) {
    if (!widget.visible) continue;
    yield widget;
    if (widget.children !== undefined) yield* visibleWidgets(widget.children);
  }
}

/** The Tongs command of a recipe step in a client area of the given size. */
export function stepCommand(step: RecipeStep, window: Screen): string {
  if ('key' in step) return `key ${step.key}`;
  if ('click' in step) return `ui click ${step.click} timeout=10`;
  const x = Math.round(step.point.x * (window.width - 1));
  const y = Math.round(step.point.y * (window.height - 1));
  return `click ${String(x)} ${String(y)}`;
}

async function ask(tongs: Tongs, command: string, timeoutMs?: number): Promise<TongsAnswer> {
  const answer = await tongs.call(command, timeoutMs);
  if (!answer.ok) throw refused(command, answer);
  return answer;
}

function refused(command: string, answer: TongsAnswer): ViewFailure {
  const by = answer['covered_by'];
  const detail = by !== undefined ? ` by ${JSON.stringify(by)}` : '';
  return new ViewFailure(`${command}: ${answer.error ?? 'failed'}${detail}`);
}

function brief(answer: TongsAnswer): Record<string, unknown> {
  const { ok, command, clicked, point, presses, waited_ms } = answer;
  return { ok, command, clicked, point, presses, waited_ms };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}
