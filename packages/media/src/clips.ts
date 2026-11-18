// The clips (etch-website docs/spec.md section 8.5): each a feature of Etch shown as a short silent
// loop. A clip's take performs its steps in a fresh VS Code with the demo mod and the base game's
// `interface/provinceview.gui` open beside Etch's preview, which shows a save's province
// (`SAMPLE_PROVINCE`), logging events; its edit turns the log into the panels, captions and
// highlights the composition renders (edit.ts). A loop is built for the site, which shows it about
// 650 px wide: each panel shows a part of a master large enough to read there (`CODE_SCALE`,
// `UI_SCALE`, `DETAIL_SCALE`), the control on the left and its effect on the right, both still
// while a step runs, and the captions stay in the band under the panels. Every clip starts and ends
// on the same shot of the same state, so it loops without a seam.
import { copyFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import type { Locator } from '@playwright/test';
import {
  cameraKeys,
  editLength,
  grow,
  GUTTER,
  rows,
  STAGE,
  union,
  viewAt,
  type Caption,
  type EditSpec,
  type Highlight,
  type PointerPath,
  type Rect,
  type Segment,
  type Source,
  type Hold,
} from './edit.ts';
import type { PaintResult } from './paint.ts';
import {
  eventOf,
  eventsOf,
  rectOf,
  sleep,
  type Take,
  type TakeEvent,
  type TakeLog,
} from './take.ts';
import type { Workbench } from './workbench.ts';

/**
 * The base-game files the workspace overrides, copied from the local game at every run (spec
 * section 8.2): the province view, the window modders change most. No game file is kept.
 */
export const OVERRIDES = ['interface/provinceview.gui'] as const;
/** The file every take opens first, and the window it previews. */
export const START_FILE = 'interface/provinceview.gui';
export const WINDOW_NAME = 'provinceview';
/**
 * The province whose sample data every take shows, from the save the capture is given (`--save`):
 * Kaluga, in the Russia save of 17 March 1719 the lab measures with. It has no great project, whose
 * picture is DLC art the preview's playset does not have.
 */
export const SAMPLE_PROVINCE = 'Kaluga';

export interface ClipContext {
  readonly wb: Workbench;
  readonly take: Take;
  /** Starts recording VS Code's window; the steps before it are not in the masters. */
  readonly record: () => Promise<void>;
  /** The script profile `profile` shows: a CSV of Anvil's script profiler (`--profile`). */
  readonly profile?: string;
}

export interface Clip {
  readonly id: string;
  run(context: ClipContext): Promise<void>;
  edit(log: TakeLog, sources: Readonly<Record<string, Source>>): EditSpec;
}

/** Still frames before the first step and after the last, for the cut to start and end in. */
export const PRE_ROLL_MS = 2500;
export const POST_ROLL_MS = 2000;
/** The home shot before the first step, and after the last result: the loop's seam. */
export const LEAD = 0.6;
export const TAIL = 1.0;

/**
 * Output pixels per master pixel. The site shows a loop about 650 px wide, a third of its 1920 px:
 * the editor's code (18 px) at 1.5× is 9 px there, VS Code's own text (13 px) at 2.2× is 9.7 px,
 * and the game's (14 px) at 2× is 9.5 px.
 */
export const CODE_SCALE = 1.5;
export const UI_SCALE = 2.2;
export const DETAIL_SCALE = 2;
/** The demo mod's event in `names`: its lines are short, so its code is larger (14.6 px there). */
const NAMES_CODE_SCALE = 2.4;

/**
 * Output height of the Problems panel `panel` (master pixels) shown at `UI_SCALE` down to the row
 * `last`: no empty panel under its rows.
 */
function problemsHeight(panel: Rect, last: Rect): number {
  return Math.round((last.y + last.h + 12 - panel.y) * UI_SCALE);
}

/**
 * Parts of the game screen in game pixels, where the large layout (1440 × 900) draws the province
 * view, as the live game does at the preview's resolution.
 *
 * The window's lower part, where the trade node button is, about as tall as the stage at 2×: from
 * the gap above the tax rows, so no widget is cut at its top, to the window's bottom edge.
 */
export const TRADE_AREA: Rect = { x: -6, y: 467, w: 472, h: 433 };
/**
 * The window's header and demographics, where a province's names are: its tabs, names, area and
 * region, development, culture and religion, from the window's left border to its right, down to
 * the autonomy row; where a foreign province's view differs too (`views`). The open `Data ▾` covers
 * its top right (screen x 390 and right, down to y 339): `data` holds the window's panel on its
 * last frame before the menu opened until the menu closes.
 */
const HEADER_AREA: Rect = { x: -10, y: 194, w: 498, h: 401 };
/** The buildings panel, whose background `problems` misspells. */
const BUILDINGS_AREA: Rect = { x: 480, y: 440, w: 330, h: 460 };
/**
 * `snapshot`: the window's military and trade rows from its left edge to the general's box, left
 * of the province's picture and the trade node's circle, shield and button. Every value there comes
 * from a snapshot, and its icons are drawn the same in the preview and the game: elsewhere icons the
 * game sets in its code (the unrest and religion icons, the trade node's colour, the owner's shield,
 * the great projects) stay Etch's placeholders after a snapshot, and would read as a snapshot that
 * did not take. The two boxes of values, which the loop rings.
 */
export const VALUES_AREA: Rect = { x: 0, y: 680, w: 230, h: 215 };
export const SNAPSHOT_VALUES: readonly Rect[] = [
  { x: 25, y: 717, w: 148, h: 61 },
  { x: 25, y: 815, w: 148, h: 62 },
];
/**
 * `zoom`'s part of the screen, and the point it zooms around: above the second tab, where no
 * widget is (a tip there would cover the zoom), the tabs, names and painting around it. The part
 * is the window's upper half, from just above its tabs, with little of the empty screen around.
 */
const ZOOM_AREA: Rect = { x: -10, y: 160, w: 499, h: 360 };
const ZOOM_POINT = { x: 300, y: 185 };
/** Ctrl+wheel steps in `zoom`. */
const ZOOM_TICKS = 2;

/** `preview` and `reload`: the trade node button's position, whose x, 251, the loops retype. */
export const TRADE_NODE_POSITION = 'x = 251 y = 551';
/** What `preview` types over the selected 251, a key a second, and the x after each key. */
const TYPED = ['3', '0', '0'];
const TYPED_X = ['3', '30', '300'];
const KEY_S = 1.1;

/**
 * `data`: the save's second province, with other names, area, region, culture, religion and
 * development: Bali, Hindu and Balinese (`nusa_tenggara`), which the save's Russia holds.
 */
const SECOND_PROVINCE = 'Bali';

/**
 * `outline`: game-screen points of the widgets it hovers, a text, a button and an icon in one band
 * of the demographics, the icon the one it then clicks: its name fits the outline's row beside the
 * row's buttons, where `build_landunit_button` is cut. The tip's first line names each.
 */
const OUTLINE_HOVERS = [
  { point: { x: 175, y: 531 }, widget: 'culture' },
  { point: { x: 330, y: 571 }, widget: 'build_landunit_button' },
  { point: { x: 270, y: 570 }, widget: 'religion_icon' },
] as const;

/** `problems`: a sprite of the province view, and the typo swapping its `ui`. */
const SPRITE = '"GFX_provinceview_building_bg"';
const TYPO = 'biulding';

/**
 * `names`: the demo mod's event (its own text), where one keystroke makes a province id the map
 * does not have and another an idea group the playset does not define.
 */
const EVENTS_FILE = 'etch_demo_events.txt';
const OWNS = 'owns = 151';
const IDEA_GROUP = 'economic_ideas';
/** Typed before the idea group's `_ideas`: `economics_ideas`, which the playset does not define. */
const IDEA_KEY = 's';

/** `profile`: the row of the profile page whose name link it follows, a base-game decision. */
const PROFILED = 'expel_foreign_traders';

/**
 * Puts the cursor on the blank line above the previewed window's `windowType =`, inside no widget:
 * the preview keeps the window it showed last and outlines nothing. On the window's name the
 * preview would outline the window's declared rect (430 × 580) through every loop, a frame that
 * fits none of its art and belongs to no loop's point.
 */
export async function parkCursor(wb: Workbench): Promise<void> {
  const name = await wb.find(`"${WINDOW_NAME}"`);
  await wb.walkCursorTo({ line: name.line - 3, column: 1 }, 0);
  await wb.highlightCleared();
  await wb.expectPreviewed(WINDOW_NAME);
}

/** A rect of the game screen, drawn unscaled at `screen`, in master pixels. */
export function onScreen(screen: Rect, rect: Rect): Rect {
  return { x: screen.x + rect.x, y: screen.y + rect.y, w: rect.w, h: rect.h };
}

/** Two frames of these sizes side by side, centred on the stage, each centred in its height. */
export function pair(
  left: { w: number; h: number },
  right: { w: number; h: number },
): { left: Rect; right: Rect } {
  const total = left.w + GUTTER + right.w;
  if (total > STAGE.w + 0.5 || left.h > STAGE.h + 0.5 || right.h > STAGE.h + 0.5) {
    throw new Error(`panels of ${JSON.stringify({ left, right })} do not fit the stage`);
  }
  const x = STAGE.x + (STAGE.w - total) / 2;
  const middle = STAGE.y + STAGE.h / 2;
  return {
    left: { x, y: middle - left.h / 2, w: left.w, h: left.h },
    right: { x: x + left.w + GUTTER, y: middle - right.h / 2, w: right.w, h: right.h },
  };
}

/** How long a menu's panel takes to unfold or fold. */
const UNFOLD = 0.12;

/**
 * A toolbar menu's views: open, its button and the menu under it; folded, the button's row alone.
 * Both start a little left of the button, so nothing left of it is cut by the panel's edge.
 */
function menuViews(button: Rect, menu: Rect, below = 12): { open: Rect; folded: Rect } {
  const x = Math.min(button.x, menu.x) - 6;
  const y = button.y - 12;
  const open = {
    x,
    y,
    w: Math.max(button.x + button.w, menu.x + menu.w) + 12 - x,
    h: Math.max(button.y + button.h, menu.y + menu.h) + below - y,
  };
  return { open, folded: { ...open, h: button.h + 24 } };
}

/**
 * The frames of a menu's panel: unfolded, the open menu's frame `open` (from `pair`) with its top
 * where the folded row sits in the stage's middle; folded, that row alone.
 */
function menuFrames(
  views: { open: Rect; folded: Rect },
  open: Rect,
): { unfolded: Rect; folded: Rect } {
  const scale = open.w / views.open.w;
  const foldedH = views.folded.h * scale;
  const top = Math.min(STAGE.y + STAGE.h / 2 - foldedH / 2, STAGE.y + STAGE.h - open.h);
  const unfolded = { ...open, y: top };
  return { unfolded, folded: { ...unfolded, h: foldedH } };
}

/**
 * A menu's panel in VS Code's master, folded to the button's row while the menu is closed and
 * unfolding with it while it is open (`spans`, edit times), so the panel never stands empty. It
 * takes the open menu's frame `open` (from `pair`), its top where the folded row sits in the
 * stage's middle.
 */
function menuTrack(
  views: { open: Rect; folded: Rect },
  open: Rect,
  spans: readonly { opens: number; closes: number }[],
): Track {
  const { unfolded, folded } = menuFrames(views, open);
  return {
    source: 'vscode',
    shots: [
      { at: 0, frame: folded, view: views.folded },
      ...spans.flatMap(({ opens, closes }) => [
        { at: opens, frame: unfolded, view: views.open, move: UNFOLD },
        { at: closes, frame: folded, view: views.folded, move: UNFOLD },
      ]),
    ],
  };
}

/** A rect's size at `scale`. */
function sized(rect: Rect, scale: number): { w: number; h: number } {
  return { w: rect.w * scale, h: rect.h * scale };
}

/**
 * A code panel's view at `scale`: from the editor's left edge, its line numbers, with `line` at
 * `at` of the view's height. `line` spans the editor (`editorLine`).
 */
export function codeView(
  line: Rect,
  frame: Rect,
  source: Source,
  scale = CODE_SCALE,
  at = 0.4,
): Rect {
  return viewAt(line, scale, frame, source, { x: 0, y: at });
}

/** The editor's cursor line across the editor, from its left edge, in master pixels. */
export async function editorLine(wb: Workbench): Promise<Rect> {
  const editor = await wb.box(wb.page.locator('.part.editor .monaco-editor').first());
  const line = await wb.lineRect();
  return { x: editor.x, y: line.y, w: editor.w, h: line.h };
}

/** A camera step of a panel: from `at`, it moves to its frame and view over `move` seconds. */
interface Shot {
  readonly at: number;
  readonly frame: Rect;
  readonly view: Rect;
  readonly opacity?: number;
  readonly move?: number;
}

/** A panel of the edit: a master and its camera. */
interface Track {
  readonly source: string;
  readonly shots: readonly Shot[];
  /** Output px over which the panel fades out at its right edge (`Panel.fadeRight`). */
  readonly fade?: number;
}

/** The fade at the right edge of a panel whose text lines run past it. */
export const TEXT_FADE = 120;

/**
 * A part of a cut edit: a span of the take (take times), and its panels, captions and highlights
 * in the part's own time, from 0 at `span.s0`.
 */
interface Part {
  readonly span: { readonly s0: number; readonly end: number };
  readonly tracks: readonly Track[];
  readonly captions?: Caption[];
  readonly highlights?: Highlight[];
  readonly holds?: Hold[];
}

/** An edit of parts of the take one after another, with a cut between each and the next. */
function cuts(
  id: string,
  log: TakeLog,
  sources: Readonly<Record<string, Source>>,
  parts: readonly Part[],
  extras: { core?: { from: number; to: number }; loopFade?: number } = {},
): EditSpec {
  return {
    id,
    sources,
    ...(extras.core === undefined ? {} : { core: extras.core }),
    ...(extras.loopFade === undefined ? {} : { loopFade: extras.loopFade }),
    segments: parts.map((part) => ({
      duration: part.span.end - part.span.s0,
      panels: part.tracks.map((track) => ({
        source: track.source,
        start: part.span.s0,
        keys: cameraKeys(track.shots),
        // The drawn pointer belongs to VS Code's master; the game's records its own.
        ...(track.source === 'vscode' ? { pointer: pointerOf(log) } : {}),
        ...(track.fade === undefined ? {} : { fadeRight: track.fade }),
      })),
      captions: part.captions ?? [],
      highlights: part.highlights ?? [],
      ...(part.holds === undefined ? {} : { holds: part.holds }),
    })),
  };
}

/** How long before a menu's `open` mark its panel's hold starts: the click comes a frame before. */
const HOLD_BEFORE = 0.15;
/** How long after a menu's `closed` mark its hold ends: the window's first frame without it. */
const HOLD_AFTER = 0.1;
/** The frame a hold shows, before the menu's `open` mark: the pointer is still on its way. */
const HOLD_FRAME = 0.3;

/**
 * The holds of a panel whose view `view` the open menu's rect `covered` reaches into, one for each
 * time it is open, `opens` and `closes` (take times), those that reach into the part from `s0` to
 * `end`: the window shows as it was before the menu opened, and the menu whole in its own panel.
 * A hold that runs over a cut goes on in the next part on the same frame.
 */
function menuHolds(
  panel: number,
  view: Rect,
  covered: Rect,
  spans: readonly { opens: number; closes: number }[],
  part: { s0: number; end: number },
): Hold[] {
  const w = Math.min(view.x + view.w, covered.x + covered.w) - Math.max(view.x, covered.x);
  const h = Math.min(view.y + view.h, covered.y + covered.h) - Math.max(view.y, covered.y);
  if (w <= 0 || h <= 0) return [];
  return spans
    .map(({ opens, closes }) => ({
      from: opens - HOLD_BEFORE - part.s0,
      to: closes + HOLD_AFTER - part.s0,
      panel,
      at: opens - HOLD_FRAME,
    }))
    .filter(({ from, to }) => to > 0 && from < part.end - part.s0);
}

/** A one-segment edit from `s0` to `end` (take times): its panels, captions and highlights. */
function single(
  id: string,
  log: TakeLog,
  sources: Readonly<Record<string, Source>>,
  span: { s0: number; end: number },
  tracks: readonly Track[],
  extras: {
    captions?: Caption[];
    highlights?: Highlight[];
    holds?: Hold[];
    core?: { from: number; to: number };
    loopFade?: number;
  } = {},
): EditSpec {
  return cuts(
    id,
    log,
    sources,
    [
      {
        span,
        tracks,
        ...(extras.captions === undefined ? {} : { captions: extras.captions }),
        ...(extras.highlights === undefined ? {} : { highlights: extras.highlights }),
        ...(extras.holds === undefined ? {} : { holds: extras.holds }),
      },
    ],
    extras,
  );
}

/** A panel that stays where it is through the clip. */
function still(source: string, frame: Rect, view: Rect, fade?: number): Track {
  return { source, shots: [{ at: 0, frame, view }], ...(fade === undefined ? {} : { fade }) };
}

/**
 * Captions one after another: each from its `from` until the next one's, the last until `end`. A
 * caption fades out as the next fades in, so two never show at once.
 */
function sequence(
  items: readonly { from: number; keys?: readonly string[]; text?: string }[],
  end: number,
): Caption[] {
  return items.map((item, i) => ({
    ...item,
    to: (items[i + 1]?.from ?? end + 0.2) - 0.2,
  }));
}

/** The page point (CSS px) at the centre of a locator's first match. */
async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.first().boundingBox();
  if (box === null) throw new Error(`${locator.toString()} is not shown`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Where the drawn pointer waits: over the editor area's bottom left, outside every panel's view,
 * where it shows nothing (hovers are off).
 */
async function restPoint(wb: Workbench): Promise<{ x: number; y: number }> {
  const box = await wb.page.locator('.part.editor').first().boundingBox();
  if (box === null) throw new Error('the editor area is not shown');
  return { x: box.x + 60, y: box.y + box.height - 60 };
}

/** Moves the drawn pointer, and Playwright's mouse with it, to a page point. */
async function pointTo(
  { wb, take }: ClipContext,
  at: { x: number; y: number },
  ms = 700,
): Promise<void> {
  await wb.glide(at, ms, (point) => {
    take.pointerAt(point);
  });
}

/**
 * As `pointTo`, but Playwright's mouse reaches `at` at the end only: the drawn pointer glides
 * there, and the preview outlines no widget on the way, its window and panels included.
 */
async function glideOver(
  { wb, take }: ClipContext,
  at: { x: number; y: number },
  ms: number,
): Promise<void> {
  await wb.glide(
    at,
    ms,
    (point) => {
      take.pointerAt(point);
    },
    { hover: false },
  );
}

/** Points at a locator and clicks it, as a hand would; `paint` waits for the preview's paint. */
async function clickOn(
  context: ClipContext,
  locator: Locator,
  options: { ms?: number; paint?: boolean } = {},
): Promise<void> {
  await pointTo(context, await centre(locator), options.ms ?? 700);
  await sleep(160);
  context.take.click();
  const click = () => locator.first().click();
  if (options.paint === true) await context.wb.paint(click);
  else await click();
}

/** A view's item in the open `View ▾`. */
function viewItem(wb: Workbench, label: string): Locator {
  return wb.frame.locator('#view-popup .item', { hasText: new RegExp(`^. ${label}$`) });
}

/** The drawn pointer of a take, for its VS Code panels. */
function pointerOf(log: TakeLog): PointerPath {
  return { points: log.pointer, clicks: log.clicks };
}

/**
 * Waits for the preview's tip of the hovered widget and checks that its first line, the widget's
 * path, ends with `widget`; resolves to the hovered widget's and its tip's rect together.
 */
async function expectTip(wb: Workbench, widget: string): Promise<Rect> {
  const tip = wb.frame.locator('#tip:not([hidden])');
  await tip.waitFor();
  let first = '';
  for (let i = 0; i < 20; i++) {
    first = ((await tip.innerText()).split('\n')[0] ?? '').trim();
    if (first.endsWith(`› ${widget}`)) {
      return union(await wb.box(wb.frame.locator('#hover')), await wb.box(tip));
    }
    await sleep(50);
  }
  throw new Error(`the tip names ${first}, not ${widget}`);
}

/** Fails when the Problems panel lists anything: a loop starts with none. */
async function expectNoProblems(wb: Workbench): Promise<void> {
  // Etch checks the open files after they open.
  await sleep(2000);
  const listed = await wb.page.locator('.markers-panel .monaco-list-row').allInnerTexts();
  if (listed.length > 0) {
    throw new Error(
      `Problems is not empty: ${listed.slice(0, 4).join(' | ').replace(/\n/g, ' · ')}`,
    );
  }
}

/**
 * Logs the drawn pointer at its rest, records, and waits out the pre-roll; returns the rest. The
 * keyboard goes to the editor first, unless the active editor is a page (`focus: false`).
 */
async function startTake(
  context: ClipContext,
  options: { focus?: boolean } = {},
): Promise<{ x: number; y: number }> {
  if (options.focus !== false) await context.wb.focusEditor();
  const rest = await restPoint(context.wb);
  await pointTo(context, rest, 16);
  await context.record();
  await context.take.until(context.take.t() + PRE_ROLL_MS / 1000);
  return rest;
}

/**
 * From the preview's toolbar left along it into the editor, the first leg of the way home; the
 * take's end (`endTake`) then goes down through the editor to the rest. The straight way crosses
 * the preview's screen and hovers its widgets, whose tips would show for a moment.
 */
async function viaToolbar(context: ClipContext): Promise<void> {
  const editor = await context.wb.page.locator('.part.editor .monaco-editor').first().boundingBox();
  if (editor === null) throw new Error('the editor is not shown');
  const bar = await centre(context.wb.frame.locator('#view-menu'));
  await pointTo(context, { x: editor.x + editor.width - 40, y: bar.y }, 500);
}

/**
 * From the rest up through the editor to the preview's toolbar, at `target`'s height: the way's
 * last leg, along the toolbar, is the click's (`clickOn`). The straight way would cross the
 * preview's screen and hover its widgets.
 */
async function toToolbar(context: ClipContext, target: { x: number; y: number }): Promise<void> {
  const editor = await context.wb.page.locator('.part.editor .monaco-editor').first().boundingBox();
  if (editor === null) throw new Error('the editor is not shown');
  await pointTo(context, { x: editor.x + editor.width - 40, y: target.y }, 500);
}

/**
 * Back to the rest, then the post-roll. As at the start, so that the loop's last frame matches its
 * first: the keyboard in the editor (a preview button keeps no focus ring; `focus: false` for a
 * page) and Playwright's mouse off the preview, so no widget stays hovered.
 */
async function endTake(
  context: ClipContext,
  rest: { x: number; y: number },
  options: { focus?: boolean } = {},
): Promise<void> {
  await pointTo(context, rest, 700);
  if (options.focus !== false) {
    await context.wb.restMouse();
    await context.wb.focusEditor();
    await context.wb.parkMouse();
  }
  context.take.mark('end');
  await context.take.until(context.take.t() + POST_ROLL_MS / 1000);
}

export const CLIPS: readonly Clip[] = [
  {
    // The trade node button's x retyped: the button moves at each key, its outline with it.
    id: 'preview',
    async run({ wb, take, record }) {
      const position = await wb.find(TRADE_NODE_POSITION);
      await wb.walkCursorTo({ line: position.line, column: position.start + 'x = '.length }, 0);
      await wb.press('Shift+ArrowRight', 3);
      await wb.selectionIs(3);
      await wb.highlightSettled();
      await wb.parkMouse();
      take.mark('line', { source: 'vscode', rect: await editorLine(wb) });
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      await record();
      await take.until(take.t() + PRE_ROLL_MS / 1000);

      const first = take.mark('start');
      for (const [i, key] of TYPED.entries()) {
        await take.until(first + i * KEY_S);
        take.mark('key', { label: key });
        await wb.paint(() => wb.type(key));
        await wb.highlightSettled();
        take.mark('moved', { source: 'vscode', rect: await wb.selectedRect() });
      }
      await take.until(take.t() + 1.6);
      take.mark('undo');
      for (let i = 0; i < 3 && (await wb.dirty()); i++) {
        await wb.paint(() => wb.press('Control+Z'));
      }
      await wb.highlightSettled();
      take.mark('undone');
      await take.until(take.t() + POST_ROLL_MS / 1000);
      if (await wb.dirty()) throw new Error('the loop does not close: the file is still unsaved');
      await wb.selectionIs(3);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const keys = eventsOf(log, 'key', TYPED.length);
      const moved = eventsOf(log, 'moved', TYPED.length);
      const undo = at(eventOf(log, 'undo').t);
      const end = at(eventOf(log, 'undone').t) + TAIL;
      const area = onScreen(rectOf(eventOf(log, 'screen')), TRADE_AREA);
      const frames = pair(
        { w: STAGE.w - GUTTER - area.w * DETAIL_SCALE, h: STAGE.h },
        sized(area, DETAIL_SCALE),
      );
      const code = codeView(rectOf(eventOf(log, 'line')), frames.left, source);
      return single(
        'preview',
        log,
        sources,
        { s0, end: s0 + end },
        [still('vscode', frames.left, code, TEXT_FADE), still('vscode', frames.right, area)],
        {
          captions: sequence(
            [
              ...keys.map((key, i) => ({
                from: at(key.t) - 0.05,
                keys: [key.label ?? ''],
                text: `x = ${TYPED_X[i] ?? ''}`,
              })),
              { from: undo - 0.05, keys: ['Ctrl', 'Z'], text: 'x = 251' },
            ],
            end - 0.3,
          ),
          core: {
            from: at((keys[0] as TakeEvent).t) - 0.5,
            to: at((moved[moved.length - 1] as TakeEvent).t) + 1.2,
          },
        },
      );
    },
  },
  {
    // View ▾: a foreign province's view and back, the menu close up beside the window.
    id: 'views',
    async run(context) {
      const { wb, take } = context;
      const menu = wb.frame.locator('#view-menu');
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      // The menu's button and its list of views, measured open before the take.
      take.mark('button', { source: 'vscode', rect: await wb.box(menu) });
      await wb.openMenu('view');
      const items = wb.frame.locator('#view-popup .item', { hasText: /^[○●]/ });
      take.mark('menu', {
        source: 'vscode',
        rect: union(await wb.box(menu), await wb.box(items.first()), await wb.box(items.last())),
      });
      take.mark('covers', {
        source: 'vscode',
        rect: await wb.box(wb.frame.locator('#view-popup')),
      });
      await wb.closeMenus();
      const rest = await startTake(context);
      take.mark('start');
      // The menu's selectors, under its views, cover the window's top right while it is open: it
      // is open for little more than a second each time, and the edit holds the window's panel.
      for (const label of ['Foreign province', 'Own province']) {
        await clickOn(context, menu);
        await wb.frame.locator('#view-popup:not([hidden])').waitFor();
        take.mark('open');
        await sleep(300);
        await clickOn(context, viewItem(wb, label), { ms: 350, paint: true });
        await wb.frame.locator('#view-menu', { hasText: `View: ${label}` }).waitFor();
        take.mark('view', { label });
        // The menu closes at once, so it covers the redrawn window for a moment only; the pointer
        // then waits on the menu's button, over no widget of the preview.
        await wb.closeMenus();
        take.mark('closed', { label });
        await pointTo(context, await centre(menu), 350);
        if (label !== 'Own province') await sleep(1200);
      }
      await viaToolbar(context);
      await endTake(context, rest);
    },
    edit(log, sources) {
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      // The menu to just under its last view: 12 px took in the rule over the selectors under
      // them, which read as a menu cut off.
      const menu = menuViews(rectOf(eventOf(log, 'button')), rectOf(eventOf(log, 'menu')), 6);
      // The window's upper half, where a foreign province's view differs (the banner, the owner's
      // shield, Diplomacy), twice as large as the whole window with its buildings panel would be.
      const area = onScreen(rectOf(eventOf(log, 'screen')), HEADER_AREA);
      const frames = pair(sized(menu.open, UI_SCALE), sized(area, STAGE.h / area.h));
      const views = eventsOf(log, 'view', 2);
      const opens = eventsOf(log, 'open', 2);
      const closes = eventsOf(log, 'closed', 2);
      const end = at(eventOf(log, 'end').t) + 0.4;
      // While the menu is open, the window's panel holds its frame from before: the menu's panel
      // shows the menu, and the window its new view once the menu has closed.
      const holds = menuHolds(
        1,
        area,
        rectOf(eventOf(log, 'covers')),
        opens.map((open, i) => ({ opens: open.t, closes: (closes[i] as TakeEvent).t })),
        { s0, end: s0 + end },
      );
      return single(
        'views',
        log,
        sources,
        { s0, end: s0 + end },
        [
          menuTrack(
            menu,
            frames.left,
            opens.map((open, i) => ({
              opens: at(open.t) + 0.02,
              closes: at((closes[i] as TakeEvent).t) - 0.05,
            })),
          ),
          still('vscode', frames.right, area),
        ],
        {
          holds,
          captions: sequence(
            views.map((view) => ({ from: at(view.t) - 0.05, text: `View: ${view.label ?? ''}` })),
            end - 0.4,
          ),
        },
      );
    },
  },
  {
    // Data ▾ → Province…: the save's second province, its names, culture, religion and development,
    // then Kaluga again. The menu opens for each choice and closes after it, so the window's header
    // shows whole; the province quick pick is shown once a name is typed in it, its whole list cut.
    id: 'data',
    async run(context) {
      const { wb, take } = context;
      const button = wb.frame.locator('#data-menu');
      const popup = wb.frame.locator('#data-popup');
      const province = popup.locator('button', { hasText: 'Province' });
      const quick = wb.page.locator('.quick-input-widget');
      const typedRow = (name: string): Locator =>
        wb.page.locator('.quick-input-list .monaco-list-row.focused', {
          hasText: new RegExp(`^${name}#`),
        });
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      // The menu's button, and open, every layer down to the generated text's lengths, the last
      // layer's actions (the lists the game fills, under them, are not the loop's), measured
      // before the take; then the province quick pick's input and row with a name typed in it.
      take.mark('button', { source: 'vscode', rect: await wb.box(button) });
      await wb.openMenu('data');
      take.mark('popup', {
        source: 'vscode',
        rect: union(
          await wb.box(button),
          await wb.box(popup.locator('h4').first()),
          await wb.box(popup.locator('.actions').last()),
        ),
      });
      take.mark('covers', { source: 'vscode', rect: await wb.box(popup) });
      await province.click();
      await quick.locator('input').waitFor();
      await wb.page.keyboard.type(SAMPLE_PROVINCE);
      await typedRow(SAMPLE_PROVINCE).waitFor();
      take.mark('typing', {
        source: 'vscode',
        rect: union(await wb.box(quick.locator('input')), await wb.box(typedRow(SAMPLE_PROVINCE))),
      });
      await wb.page.keyboard.press('Escape');
      await quick.waitFor({ state: 'hidden' });
      if (await popup.isVisible()) await wb.closeMenus();

      // The loop starts and ends on the closed menu, the pointer at rest.
      const rest = await startTake(context);
      take.mark('start');
      await sleep(500);
      for (const name of [SECOND_PROVINCE, SAMPLE_PROVINCE]) {
        // Up through the editor and along the toolbar: the straight way crosses the window.
        if (name === SECOND_PROVINCE) await toToolbar(context, await centre(button));
        await clickOn(context, button, { ms: 250 });
        await popup.waitFor();
        take.mark('open', { label: name });
        await sleep(350);
        await pointTo(context, await centre(province), 300);
        await sleep(150);
        take.click();
        take.mark('press', { label: name });
        await province.click();
        await quick.locator('input').waitFor();
        await wb.page.keyboard.type(name);
        await typedRow(name).waitFor();
        await sleep(150);
        take.mark('typed', { label: name });
        await sleep(700);
        take.mark('enter', { label: name });
        const painted = wb.paint(() => wb.page.keyboard.press('Enter'));
        await quick.waitFor({ state: 'hidden' });
        take.mark('picked', { label: name });
        await painted;
        if (!(await popup.isVisible())) throw new Error('Data ▾ closed with the quick pick');
        // Escape closes the menu at once: while it is open the window's panel holds its frame from
        // before, so a menu naming the new province beside the old header would contradict it.
        await sleep(100);
        await wb.closeMenus();
        take.mark('closed', { label: name });
        await sleep(name === SECOND_PROVINCE ? 1500 : 300);
      }
      await viaToolbar(context);
      await endTake(context, rest);
    },
    edit(log, sources) {
      // The menu down to its last layer, every layer whole; as large as the stage's height allows.
      const menu = menuViews(rectOf(eventOf(log, 'button')), rectOf(eventOf(log, 'popup')), 5);
      const menuScale = Math.min(UI_SCALE, STAGE.h / menu.open.h);
      const area = onScreen(rectOf(eventOf(log, 'screen')), HEADER_AREA);
      const frames = pair(sized(menu.open, menuScale), sized(area, STAGE.h / area.h));
      const { unfolded, folded } = menuFrames(menu, frames.left);
      // The quick pick's input and the typed name's row, at the menu panel's top, its left part.
      const typing = rectOf(eventOf(log, 'typing'));
      const typingView = {
        x: typing.x - 10,
        y: typing.y - 10,
        w: frames.left.w / menuScale,
        h: typing.h + 20,
      };
      const typingFrame = { ...unfolded, h: typingView.h * menuScale };
      const opens = eventsOf(log, 'open', 2);
      const presses = eventsOf(log, 'press', 2);
      const typed = eventsOf(log, 'typed', 2);
      const enters = eventsOf(log, 'enter', 2);
      const closes = eventsOf(log, 'closed', 2);
      const covers = rectOf(eventOf(log, 'covers'));
      const windowPanel = still('vscode', frames.right, area);
      const SAVE = 'Sample data from a save: Russia, 1719';
      // Each press of Province… is cut at its click: the quick pick shows a frame later, its whole
      // list over the toolbar and the window. The take goes on once the name is typed and its row
      // alone.
      const spans = [
        { s0: eventOf(log, 'start').t - LEAD, end: (presses[0] as TakeEvent).t },
        { s0: (typed[0] as TakeEvent).t, end: (presses[1] as TakeEvent).t },
        { s0: (typed[1] as TakeEvent).t, end: eventOf(log, 'end').t + 0.4 },
      ];
      const parts: Part[] = spans.map((span, i) => {
        const local = (event: TakeEvent | undefined): number =>
          event === undefined ? Infinity : event.t - span.s0;
        const shots: Shot[] = [];
        const add = (at: number, frame: Rect, view: Rect, move: number): void => {
          if (at >= 0 && at < span.end - span.s0) shots.push({ at, frame, view, move });
        };
        if (i === 0) shots.push({ at: 0, frame: folded, view: menu.folded });
        else shots.push({ at: 0, frame: typingFrame, view: typingView });
        // The quick pick hides on Enter and the menu shows again, naming the new province, until
        // Escape closes it, while the window's panel still holds the old header: the menu's panel
        // holds the quick pick's last frame instead, then cuts to the folded row as the header
        // changes.
        add(local(closes[i - 1]) - 0.05, folded, menu.folded, 0);
        add(local(opens[i]) + 0.02, unfolded, menu.open, UNFOLD);
        const enter = enters[i - 1];
        const typingHold =
          enter === undefined
            ? []
            : [
                {
                  from: local(enter),
                  to: local(closes[i - 1]) - 0.05,
                  panel: 0,
                  at: enter.t - 0.03,
                },
              ];
        const name = i === 0 ? undefined : i === 1 ? SECOND_PROVINCE : SAMPLE_PROVINCE;
        // The window's header shows the province once the menu is closed and its hold ends.
        const chosen = local(closes[i - 1]);
        const next = local(opens[i]) - 0.1;
        return {
          span,
          tracks: [{ source: 'vscode', shots }, windowPanel],
          // The open menu covers the header's top right: the window's panel holds its frame from
          // before, and the menu's panel shows the menu.
          holds: [
            ...typingHold,
            ...menuHolds(
              1,
              area,
              covers,
              opens.map((open, k) => ({ opens: open.t, closes: (closes[k] as TakeEvent).t })),
              span,
            ),
          ],
          captions: sequence(
            [
              ...(name === undefined
                ? [{ from: 0, text: SAVE }]
                : [
                    { from: 0, text: `Province… ${name}` },
                    {
                      from: chosen,
                      text:
                        name === SAMPLE_PROVINCE
                          ? SAVE
                          : `${name} from the save: its names, culture, religion and development`,
                    },
                  ]),
              ...(Number.isFinite(next) && i > 0
                ? [{ from: next, text: `Province… ${SAMPLE_PROVINCE}` }]
                : []),
            ],
            span.end - span.s0,
          ),
        };
      });
      return cuts('data', log, sources, parts);
    },
  },
  {
    // Ctrl+wheel: the screen zoomed around the pointer inside a still frame; the level fits it.
    id: 'zoom',
    async run(context) {
      const { wb, take } = context;
      const level = wb.frame.locator('#zoom-level');
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      take.mark('level', { source: 'vscode', rect: await wb.box(level) });
      const rest = await startTake(context);
      take.mark('start');
      const initial = ((await level.textContent()) ?? '').trim();
      const point = await wb.screenPoint(ZOOM_POINT);
      // Up through the editor, then right over the empty screen above the window, then down to
      // the point: the straight way crosses the window, whose widgets would show their tips.
      const above = await wb.screenPoint({ x: ZOOM_POINT.x, y: 120 });
      await pointTo(context, { x: rest.x, y: above.y }, 450);
      await pointTo(context, above, 450);
      await pointTo(context, point, 250);
      await sleep(350);
      const tip = wb.frame.locator('#tip:not([hidden])');
      if (await tip.isVisible()) {
        throw new Error(`the zoom point shows a tip: ${await tip.innerText()}`);
      }
      take.mark('at', { label: initial });
      await sleep(250);
      for (let tick = 0; tick < ZOOM_TICKS; tick++) {
        const before = ((await level.textContent()) ?? '').trim();
        await wb.page.keyboard.down('Control');
        await wb.page.mouse.wheel(0, -120);
        await wb.page.keyboard.up('Control');
        await wb.frame.locator('#zoom-level', { hasNotText: before }).waitFor({ timeout: 2_000 });
        take.mark('zoom', { label: ((await level.textContent()) ?? '').trim() });
        await sleep(1100);
      }
      // Straight up over the empty screen above the window to the toolbar, then along it.
      const target = await centre(level);
      await pointTo(context, { x: point.x, y: target.y }, 350);
      await pointTo(context, target, 350);
      await sleep(150);
      take.click();
      await level.click();
      await wb.frame.locator('#zoom-level', { hasText: initial }).waitFor({ timeout: 2_000 });
      take.mark('fit', { label: ((await level.textContent()) ?? '').trim() });
      await sleep(600);
      await viaToolbar(context);
      await endTake(context, rest);
    },
    edit(log, sources) {
      // From the pointer at rest on its point, to a second after the fit: the pointer's ways there
      // and home again are still frames of the same fitted window, so the loop leaves them out and
      // dissolves from the pointer on the level to the pointer on its point.
      const s0 = eventOf(log, 'at').t - 0.9;
      const at = (t: number): number => t - s0;
      const level = grow(rectOf(eventOf(log, 'level')), 14);
      const area = onScreen(rectOf(eventOf(log, 'screen')), ZOOM_AREA);
      const frames = pair(sized(level, 3.2), sized(area, STAGE.h / area.h));
      const zooms = eventsOf(log, 'zoom', ZOOM_TICKS);
      const fit = eventOf(log, 'fit');
      const FADE = 0.5;
      const end = at(fit.t) + 1.3 + FADE;
      return single(
        'zoom',
        log,
        sources,
        { s0, end: s0 + end },
        [still('vscode', frames.left, level), still('vscode', frames.right, area)],
        {
          loopFade: FADE,
          captions: sequence(
            [
              ...zooms.map((zoom) => ({
                from: at(zoom.t) - 0.15,
                keys: ['Ctrl', 'Wheel'],
                text: `${zoom.label ?? ''}, around the pointer`,
              })),
              { from: at(fit.t) - 0.05, text: `A click on the level: ${fit.label ?? ''}` },
            ],
            end - FADE - 0.1,
          ),
          highlights: [
            { from: at(fit.t), to: at(fit.t) + 1.0, panel: 0, rect: rectOf(eventOf(log, 'level')) },
          ],
        },
      );
    },
  },
  {
    // Hover: a widget's tip; click: its definition and outline row; Go Back: where the cursor was.
    id: 'outline',
    async run(context) {
      const { wb, take } = context;
      await wb.command('Explorer: Focus on Widget Outline View');
      // The Explorer's file tree collapsed, so the outline has the sidebar.
      const folders = wb.page.locator('.part.sidebar .pane-header').first();
      if ((await folders.getAttribute('aria-expanded')) === 'true') await folders.click();
      await wb.page
        .locator('.part.sidebar .pane-header[aria-expanded="true"]', { hasText: 'Widget Outline' })
        .waitFor();
      await wb.fitPreview();
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      await wb.focusEditor();
      // The cursor outside every widget (parkCursor): the preview outlines nothing before the click.
      await wb.highlightCleared();
      const home = await wb.cursor();
      const outlineRow = wb.page
        .locator('.part.sidebar .pane', {
          has: wb.page.locator('.pane-header', { hasText: 'Widget Outline' }),
        })
        .locator('.monaco-list-row.selected');
      const rest = await startTake(context);
      take.mark('start');
      // Every widget on the way would show its tip, the window's own and its panels' included, and
      // every way crosses some: the drawn pointer glides to each widget, and Playwright's mouse
      // reaches it at the end only, so only the hovered widgets' tips show.
      for (const [i, { point, widget }] of OUTLINE_HOVERS.entries()) {
        await glideOver(context, await wb.screenPoint(point), i === 0 ? 700 : 350);
        take.mark('hover', { source: 'vscode', rect: await expectTip(wb, widget), label: widget });
        await sleep(900);
      }
      // The last hovered widget is the icon: the pointer is on it, and clicks it.
      await sleep(200);
      take.click();
      const clicked = OUTLINE_HOVERS[OUTLINE_HOVERS.length - 1];
      if (clicked === undefined) throw new Error('outline hovers nothing');
      await wb.clickScreen(clicked.point);
      await wb.page
        .locator('[id="status.editor.selection"]', { hasNotText: `Ln ${String(home.line)},` })
        .waitFor();
      await outlineRow.first().waitFor();
      await wb.highlightSettled();
      take.mark('picked', { source: 'vscode', rect: await editorLine(wb) });
      take.mark('row', { source: 'vscode', rect: await wb.box(outlineRow) });
      // Home while the preview is out of view: the way crosses its widgets, whose tips show.
      await pointTo(context, rest, 700);
      await wb.restMouse();
      await sleep(1600);
      // Back to where the cursor was, as Go Back takes it. The keys go to the editor: after the
      // preview's click the keyboard may still be in the preview.
      await wb.focusEditor();
      take.mark('back');
      await wb.press('Alt+ArrowLeft');
      await wb.page
        .locator('[id="status.editor.selection"]', { hasText: `Ln ${String(home.line)},` })
        .waitFor();
      take.mark('returned', { source: 'vscode', rect: await editorLine(wb) });
      await sleep(1400);
      take.mark('leaving');
      await sleep(800);
      await endTake(context, rest);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const hovers = eventsOf(log, 'hover', OUTLINE_HOVERS.length);
      const band = union(...hovers.map(rectOf));
      // Close on the band of hovered widgets and their tips, the tips' text large enough to read
      // on the site, unless the band is wider.
      const hoverScale = Math.min(2.5, STAGE.w / (band.w + 60), STAGE.h / (band.h + 60));
      // From the screen's left edge, where the window's labels start (centred on the band, the
      // view cut them: "oduction", "onomy"), unless the band and its tips need it further right.
      const centred = viewAt(band, hoverScale, STAGE, source);
      const hoverView = { ...centred, x: Math.min(centred.x, rectOf(eventOf(log, 'screen')).x) };
      const picked = eventOf(log, 'picked');
      const row = rectOf(eventOf(log, 'row'));
      const returned = eventOf(log, 'returned');
      // The outline's rows only, from the sidebar's left edge to its right, the row in the middle;
      // the editor beside it is the right panel's.
      const sidebar = (row.w + 10) * UI_SCALE;
      const frames = pair(
        { w: sidebar, h: STAGE.h },
        { w: STAGE.w - GUTTER - sidebar, h: STAGE.h },
      );
      const rowView = viewAt(row, UI_SCALE, frames.left, source, { x: 5 / (row.w + 10), y: 0.45 });
      const definition = rectOf(picked);
      // The editor across the right panel, without its scroll bar or the preview beside it.
      const codeScale = Math.max(CODE_SCALE, (STAGE.w - GUTTER - sidebar) / (definition.w - 40));
      const back = at(eventOf(log, 'back').t);
      const leaving = at(eventOf(log, 'leaving').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      // The close-up and the split change through the background, never blended: one fades out,
      // then the other in.
      const DIP = 0.25;
      const split = at(picked.t) - 0.1;
      const shown = (frame: Rect, view: Rect): Shot[] => [
        { at: 0, frame, view, opacity: 0 },
        { at: split + DIP, frame, view, opacity: 1, move: DIP },
        { at: leaving, frame, view, opacity: 0, move: DIP },
      ];
      return single(
        'outline',
        log,
        sources,
        { s0, end: s0 + end },
        [
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: STAGE, view: hoverView },
              { at: split, frame: STAGE, view: hoverView, opacity: 0, move: DIP },
              { at: leaving + DIP, frame: STAGE, view: hoverView, opacity: 1, move: DIP },
            ],
          },
          { source: 'vscode', shots: shown(frames.left, rowView) },
          {
            source: 'vscode',
            shots: [
              ...shown(frames.right, codeView(definition, frames.right, source, codeScale)),
              // Go Back reveals the cursor's line where it was, maybe elsewhere in the editor.
              {
                at: at(returned.t),
                frame: frames.right,
                view: codeView(rectOf(returned), frames.right, source, codeScale),
                move: 0.4,
              },
            ].sort((a, b) => a.at - b.at),
          },
        ],
        {
          captions: sequence(
            [
              {
                from: at((hovers[0] as TakeEvent).t) - 0.1,
                text: 'Hover: the widget, its kind and rect',
              },
              { from: split + 0.2, text: 'Click: its definition and its row in the outline' },
              { from: back - 0.05, keys: ['Alt', '←'], text: 'back where the cursor was' },
            ],
            leaving,
          ),
          highlights: [
            // The definition's keyword and its name below it, and the outline's row.
            {
              from: split + 0.6,
              to: back - 0.1,
              panel: 2,
              rect: { ...definition, w: Math.min(definition.w, 640), h: definition.h * 2 },
            },
            { from: split + 0.6, to: back - 0.1, panel: 1, rect: row },
          ],
        },
      );
    },
  },
  {
    // A misspelled sprite: its warning in Problems, the buildings panel drawn without it; undone.
    id: 'problems',
    async run(context) {
      const { wb, take } = context;
      await wb.page.keyboard.press('Control+Shift+M');
      await wb.page.locator('.markers-panel').waitFor();
      await wb.focusEditor();
      await wb.fitPreview();
      await expectNoProblems(wb);
      const sprite = await wb.find(SPRITE);
      await wb.walkCursorTo({ line: sprite.line, column: sprite.start + SPRITE.indexOf('ui') }, 0);
      await wb.press('Shift+ArrowRight', 2);
      await wb.selectionIs(2);
      take.mark('line', { source: 'vscode', rect: await editorLine(wb) });
      take.mark('panel', { source: 'vscode', rect: await wb.box(wb.page.locator('.part.panel')) });
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      const allow: PaintResult[] = ['problems'];
      const rest = await startTake(context);
      const first = take.mark('start');
      for (const [i, key] of ['i', 'u'].entries()) {
        await take.until(first + i * 0.6);
        take.mark('key', { label: key });
        await wb.paint(() => wb.type(key), allow);
      }
      const row = wb.page.locator('.markers-panel .monaco-list-row', { hasText: TYPO });
      await row.first().waitFor();
      take.mark('problem', { source: 'vscode', rect: await wb.box(row) });
      await sleep(3400);
      take.mark('undo');
      for (let i = 0; i < 3 && (await wb.dirty()); i++) {
        await wb.paint(() => wb.press('Control+Z'), allow);
      }
      await row.first().waitFor({ state: 'detached' });
      take.mark('fixed');
      await sleep(600);
      await endTake(context, rest);
      if (await wb.dirty()) throw new Error('the loop does not close: the file is still unsaved');
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const area = onScreen(rectOf(eventOf(log, 'screen')), BUILDINGS_AREA);
      const outer = pair(
        { w: STAGE.w - GUTTER - area.w * (STAGE.h / area.h), h: STAGE.h },
        sized(area, STAGE.h / area.h),
      );
      const keys = eventsOf(log, 'key', 2);
      const problem = eventOf(log, 'problem');
      // Problems down to its warning, the code above it.
      const panel = rectOf(eventOf(log, 'panel'));
      const left = rows(outer.left, outer.left.h - GUTTER - problemsHeight(panel, rectOf(problem)));
      const code = codeView(rectOf(eventOf(log, 'line')), left.top, source, CODE_SCALE, 0.45);
      const problems = viewAt(panel, UI_SCALE, left.bottom, source, { x: 0, y: 0 });
      // The row spans the panel; its message is at its left, the ring ending at the fade.
      const row = {
        ...rectOf(problem),
        w: Math.min(rectOf(problem).w, problems.w - TEXT_FADE / UI_SCALE - 8),
      };
      const undo = at(eventOf(log, 'undo').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      return single(
        'problems',
        log,
        sources,
        { s0, end: s0 + end },
        [
          still('vscode', left.top, code, TEXT_FADE),
          still('vscode', left.bottom, problems, TEXT_FADE),
          still('vscode', outer.right, area),
        ],
        {
          captions: sequence(
            [
              // The keys over the selected `ui`, the second naming what they did.
              ...keys.map((key, i) => ({
                from: at(key.t) - 0.05,
                keys: [key.label ?? ''],
                ...(i === keys.length - 1 ? { text: `Two letters swapped: ${TYPO}` } : {}),
              })),
              {
                from: Math.max(at(problem.t), at((keys[keys.length - 1] as TakeEvent).t) + 0.9),
                text: 'No such sprite: in Problems as you type, the rest still draws',
              },
              { from: undo - 0.05, keys: ['Ctrl', 'Z'], text: 'back to building' },
            ],
            end - 0.4,
          ),
          highlights: [{ from: at(problem.t) + 0.2, to: undo - 0.1, panel: 1, rect: row }],
        },
      );
    },
  },
  {
    // The script profile's page: a name opens its block with the lens; Ctrl+W, back to the page.
    id: 'profile',
    async run(context) {
      const { wb, take, profile } = context;
      if (profile === undefined) {
        throw new Error('the profile clip needs a script profile: pass --profile');
      }
      // The live game's private profile, in the run's throwaway user data: the command searches
      // the player's own profile first, which this copy outdates (its time is now).
      const logs = path.join(
        path.dirname(wb.workspace),
        'user-data',
        'User',
        'globalStorage',
        'happy-dwarf-team.etch',
        'private-install',
        'profile',
        'logs',
      );
      await mkdir(logs, { recursive: true });
      await copyFile(profile, path.join(logs, path.basename(profile)));
      // The page opens before the take, and the loop starts and ends on it.
      await wb.command('Etch: Show Latest Script Profile');
      const page = await wb.markdownPreview('Script profile');
      const link = page.locator('a', { hasText: new RegExp(`^${PROFILED}$`) }).first();
      await link.waitFor();
      take.mark('table', {
        source: 'vscode',
        rect: await wb.box(link.locator('xpath=ancestor::table[1]')),
      });
      take.mark('row', {
        source: 'vscode',
        rect: await wb.box(link.locator('xpath=ancestor::tr[1]')),
      });
      const rest = await startTake(context, { focus: false });
      take.mark('start');
      const target = await centre(link);
      await pointTo(context, target, 900);
      await sleep(300);
      // The drawn pointer is where the page's own hover is: the click's row.
      const hovered = (): Promise<string> =>
        page.evaluate(() => document.querySelector('a:hover')?.textContent.trim() ?? '');
      const hover = await hovered();
      if (hover !== PROFILED) throw new Error(`the pointer hovers "${hover}", not ${PROFILED}`);
      take.mark('clicking');
      take.click();
      await link.click();
      // The file has a lens above every measured block; the one in view is the clicked name's.
      await wb.page.locator('.tab.active', { hasText: '.txt' }).waitFor();
      take.mark('opened');
      const lens = wb.page
        .locator('.part.editor .codelens-decoration', { hasText: 'Script profile:' })
        .filter({ visible: true })
        .first();
      await lens.waitFor();
      await sleep(300);
      take.mark('lens', { source: 'vscode', rect: await wb.box(lens) });
      take.mark('block', { source: 'vscode', rect: await editorLine(wb) });
      await pointTo(context, rest, 700);
      await sleep(2600);
      take.mark('closing');
      await wb.press('Control+W');
      await wb.page.locator('.tab.active', { hasText: 'Script profile' }).waitFor();
      take.mark('closed');
      // The page's webview draws again a moment after its tab is back.
      await (
        await wb.markdownPreview('Script profile')
      )
        .locator('a', { hasText: new RegExp(`^${PROFILED}$`) })
        .first()
        .waitFor();
      take.mark('shown');
      await sleep(400);
      await endTake(context, rest, { focus: false });
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const table = rectOf(eventOf(log, 'table'));
      const row = rectOf(eventOf(log, 'row'));
      // The table from its header, without the page's header (paths, the build); the row in view.
      const tableScale = Math.min(DETAIL_SCALE, STAGE.w / (table.w + 40));
      const tableView = viewAt(table, tableScale, STAGE, source, { x: 20 / STAGE.w, y: 0.04 });
      const shownTable =
        row.y + row.h + 20 > tableView.y + tableView.h
          ? { ...tableView, y: row.y + row.h + 20 - tableView.h }
          : tableView;
      const lens = rectOf(eventOf(log, 'lens'));
      const block = rectOf(eventOf(log, 'block'));
      // The editor across the stage, without its scroll bar or the preview's edge beside it.
      const blockView = codeView(
        { ...block, y: lens.y },
        STAGE,
        source,
        STAGE.w / (block.w - 40),
        0.3,
      );
      const clicking = at(eventOf(log, 'clicking').t);
      // The file once its lens is drawn (the take marks it 0.3 s after the lens shows): before,
      // the lens line pops in over the block and pushes its code down a line.
      const opened = at(eventOf(log, 'lens').t) - 0.25;
      const closing = at(eventOf(log, 'closing').t);
      // The page back, drawn: a frame of its blank webview before.
      const shown = Math.max(at(eventOf(log, 'shown').t), at(eventOf(log, 'closed').t) + 0.15);
      const end = at(eventOf(log, 'end').t) + 0.4;
      return single(
        'profile',
        log,
        sources,
        { s0, end: s0 + end },
        [
          {
            source: 'vscode',
            // Cuts, not moves: the page and the file are different documents, and a move
            // between them reads as a scroll of either.
            shots: [
              { at: 0, frame: STAGE, view: shownTable },
              { at: opened, frame: STAGE, view: blockView, move: 0 },
              { at: shown + 0.05, frame: STAGE, view: shownTable, move: 0 },
            ],
          },
        ],
        {
          // From the click until the file's lens is drawn, the page as it was clicked; from Ctrl+W
          // until the page is drawn again, the file as it was: VS Code draws an empty editor
          // between them.
          holds: [
            { from: clicking + 0.1, to: opened, panel: 0, at: s0 + clicking + 0.05 },
            { from: closing, to: shown + 0.05, panel: 0, at: s0 + closing - 0.05 },
          ],
          captions: sequence(
            [
              { from: 0.2, text: 'The newest script profile, the slowest first' },
              { from: opened + 0.1, text: 'A name opens its block, its time in the lens above' },
              { from: closing - 0.05, keys: ['Ctrl', 'W'] },
            ],
            end - 0.4,
          ),
          highlights: [
            {
              from: opened + 0.4,
              to: closing - 0.1,
              panel: 0,
              rect: { ...lens, w: Math.min(lens.w, 900) },
            },
          ],
          core: { from: clicking - 0.5, to: closing },
        },
      );
    },
  },
  {
    // A province id the map lacks and an idea group the playset lacks, each in Problems; undone.
    id: 'names',
    async run(context) {
      const { wb, take } = context;
      await wb.quickOpen(EVENTS_FILE);
      await wb.page.keyboard.press('Control+Shift+M');
      await wb.page.locator('.markers-panel').waitFor();
      await wb.focusEditor();
      await wb.fitPreview();
      await expectNoProblems(wb);
      const idea = await wb.find(IDEA_GROUP);
      const ideaAt = { line: idea.line, column: idea.start + IDEA_GROUP.indexOf('_ideas') };
      const owns = await wb.find(OWNS);
      const home = { line: owns.line, column: owns.start + 'owns = '.length };
      await wb.walkCursorTo(home, 0);
      take.mark('line', { source: 'vscode', rect: await editorLine(wb) });
      take.mark('panel', { source: 'vscode', rect: await wb.box(wb.page.locator('.part.panel')) });
      const listed = wb.page.locator('.markers-panel .monaco-list-row');
      const rest = await startTake(context);
      take.mark('start');
      take.mark('key', { label: '5' });
      await wb.type('5');
      const province = listed.filter({ hasText: 'Province 5151' });
      await province.first().waitFor();
      take.mark('province', { source: 'vscode', rect: await wb.box(province) });
      await sleep(2200);
      take.mark('walk');
      await wb.walkCursorTo(ideaAt, 60);
      await sleep(300);
      take.mark('key', { label: IDEA_KEY });
      await wb.page.keyboard.type(IDEA_KEY);
      const named = listed.filter({ hasText: `economic${IDEA_KEY}_ideas` });
      await named.first().waitFor();
      take.mark('idea', { source: 'vscode', rect: await wb.box(named) });
      await sleep(2600);
      // One Ctrl+Z for each edit, each taking its own problem away.
      take.mark('undo');
      await wb.press('Control+Z');
      await named.first().waitFor({ state: 'detached' });
      if ((await province.count()) === 0) throw new Error('one Ctrl+Z undid both edits');
      await sleep(1200);
      take.mark('undo');
      await wb.press('Control+Z');
      await province.first().waitFor({ state: 'detached' });
      if (await wb.dirty()) throw new Error('the loop does not close: the file is still unsaved');
      take.mark('fixed');
      await sleep(500);
      await wb.walkCursorTo(home, 0);
      await endTake(context, rest);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const keys = eventsOf(log, 'key', 2);
      const province = eventOf(log, 'province');
      const idea = eventOf(log, 'idea');
      // Problems down to its second warning, the code above it: the event's lines are short, so
      // the editor's left part, its lines larger, its right part fading out.
      const panel = rectOf(eventOf(log, 'panel'));
      const panels = rows(STAGE, STAGE.h - GUTTER - problemsHeight(panel, rectOf(idea)));
      const line = rectOf(eventOf(log, 'line'));
      const code = codeView(line, panels.top, source, NAMES_CODE_SCALE, 0.25);
      const problems = viewAt(panel, UI_SCALE, panels.bottom, source, { x: 0, y: 0 });
      const undos = eventsOf(log, 'undo', 2);
      const walk = at(eventOf(log, 'walk').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      // The rows span the panel; their messages start at their left, the ring ending at the fade.
      const left = (rect: Rect): Rect => ({
        ...rect,
        w: Math.min(rect.w, problems.w - TEXT_FADE / UI_SCALE - 8),
      });
      const firstUndo = at((undos[0] as TakeEvent).t);
      const secondUndo = at((undos[1] as TakeEvent).t);
      return single(
        'names',
        log,
        sources,
        { s0, end: s0 + end },
        [
          still('vscode', panels.top, code, TEXT_FADE),
          still('vscode', panels.bottom, problems, TEXT_FADE),
        ],
        {
          // Each keystroke's keycap with what it does: the warning follows it within a third of a
          // second, too soon for a keycap of its own.
          captions: sequence(
            [
              {
                from: at((keys[0] as TakeEvent).t) - 0.05,
                keys: ['5'],
                text: 'No province 5151 on the map, and the game says nothing',
              },
              {
                from: at((keys[1] as TakeEvent).t) - 0.05,
                keys: [IDEA_KEY],
                text: 'No such idea group: add_idea_group crashes the game on it',
              },
              { from: firstUndo - 0.05, keys: ['Ctrl', 'Z'], text: 'economic_ideas again' },
              { from: secondUndo - 0.05, keys: ['Ctrl', 'Z'], text: 'province 151 again' },
            ],
            end - 0.4,
          ),
          highlights: [
            {
              from: at(province.t) + 0.2,
              to: secondUndo - 0.1,
              panel: 1,
              rect: left(rectOf(province)),
            },
            { from: at(idea.t) + 0.2, to: firstUndo - 0.1, panel: 1, rect: left(rectOf(idea)) },
          ],
          core: { from: walk - 0.4, to: firstUndo },
        },
      );
    },
  },
];

/**
 * The hero's trailer: the cores of other clips' cuts, one after another (their panels and captions
 * are in the cuts), each fading in from the background and out into it, so a seam is a short dip,
 * not a cut. The loop's end is a dip too: the last part fades out into the background, and the
 * loop's own dissolve brings the first frame in from it.
 */
export function heroEdit(
  sources: Readonly<Record<string, Source>>,
  parts: readonly EditSpec[],
): EditSpec {
  const DIP = 0.25;
  const full: Rect = { x: 0, y: 0, w: 1920, h: 1080 };
  const segments: Segment[] = parts.map((part, i) => {
    const length = editLength(part).seconds;
    const core = part.core ?? { from: 0, to: length };
    // Never into a part's own dissolve into its first frame: the hero would show three shots.
    const to = Math.min(core.to, length - (part.loopFade ?? 0) - 0.05);
    const last = i === parts.length - 1;
    // The last part runs on a dip longer, faded out, for the loop's dissolve.
    const duration = to - core.from + (last ? DIP : 0);
    const out = last ? duration - DIP : duration;
    return {
      duration,
      panels: [
        {
          source: part.id,
          start: core.from,
          keys: [
            { at: 0, frame: full, view: full, opacity: i === 0 ? 1 : 0 },
            { at: DIP, frame: full, view: full, opacity: 1 },
            { at: out - DIP, frame: full, view: full, opacity: 1 },
            { at: out, frame: full, view: full, opacity: 0 },
            ...(last ? [{ at: duration, frame: full, view: full, opacity: 0 }] : []),
          ],
        },
      ],
      captions: [],
      highlights: [],
    };
  });
  return { id: 'hero', sources, segments, loopFade: DIP };
}
