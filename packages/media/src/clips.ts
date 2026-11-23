// The clips (etch-website docs/spec.md section 8.5): each a feature of Etch shown as a short silent
// loop. A clip's take performs its steps in a fresh VS Code with the demo mod and the base game's
// `interface/provinceview.gui` open beside Etch's preview, which shows a save's province
// (`SAMPLE_PROVINCE`), logging events; its edit turns the log into the panels, captions and
// highlights the composition renders (edit.ts). A loop is built for the site, which shows it about
// 650 px wide: each panel shows a part of a master large enough to read there (`CODE_SCALE`,
// `UI_SCALE`, `DETAIL_SCALE`), the control on the left and its effect on the right, both still
// while a step runs, and the captions stay in the band under the panels. Every clip starts and ends
// on the same shot of the same state, so it loops without a seam.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { Frame, Locator } from '@playwright/test';
import {
  cameraKeys,
  editLength,
  focus,
  grow,
  GUTTER,
  OUTPUT,
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
  /** The local game's folder, whose art the art takes open read-only (spec section 8.2). */
  readonly gamePath: string;
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
 * `outline`: the widget its eye hides by hand (the window's lower left part), the side panel's
 * member shown in the view and the one its radio picks, the text whose sample it types and the
 * name typed. The name is the province name's editBox in the header, at (100, -8) in
 * `top_section_window`, 180 × 32; `area_name` at (100, 0), 300 × 26, lies over all of it but its
 * top 8 px, where the take clicks.
 */
const OUTLINE_HIDDEN = 'province_window';
const OUTLINE_PANEL = 'buildings_window';
const OUTLINE_CHOSEN = 'institutions_window';
const OUTLINE_HEADER = 'top_section_window';
const OUTLINE_NAME = 'provincename';
const OUTLINE_NAME_AT: Rect = { x: 100, y: -8, w: 180, h: 32 };
const OUTLINE_SAMPLE = 'Kaluga and the Upper Oka';
/** The outline take's sidebar, in CSS px: the rows' names whole, `institutions_window` too. */
const OUTLINE_SIDEBAR = 320;
/** The outline's rows on the left: their names read at the site's size beside the preview. */
const OUTLINE_SCALE = 2;

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
 * `texture`: a base-game texture with an alpha and a mip chain (spec section 8.2), opened
 * read-only from the local game: the game settings' crowned frame, whose alpha is its outline.
 */
const TEXTURE_FILE = 'gfx/interface/game_settings_bg.dds';
/** Where the pointer rests on the texture, as fractions of its canvas: on the crown. */
const TEXEL_AT = { x: 0.5, y: 0.1 } as const;
/** The mip levels `texture` steps down to with ↓, one at a time. */
const MIP_STEPS = 2;

/**
 * `encoding`: the ruler's name in the demo mod's second event, ASCII in the file; an é typed before
 * its last letter makes it Renée.
 */
const RULER_NAME = '"Rene"';
const ACCENT = 'é';

/**
 * `hovers`: the sprite `problems` misspells, hovered in `provinceview.gui`; the demo mod's models
 * `.gfx` (spec section 8.2), its mesh path hovered and its diffuse texture's path Ctrl+clicked.
 */
const HOVERED_SPRITE = 'GFX_provinceview_building_bg';
const MODELS_FILE = 'etch_demo_models.gfx';
const MESH_PATH = 'gfx/models/ships/carrack.mesh';
const TEXTURE_PATH = 'carrack_diffuse.dds';

/**
 * `mesh`: a base-game ship with a skeleton, its own idle animation and sails that show a flag
 * (`PdxMeshTextureAtlas`), opened read-only from the local game (spec section 8.2); the country
 * whose flag it shows, and the animation it plays.
 */
const MESH_FILE = 'gfx/models/ships/carrack.mesh';
const FLAG_TAG = 'FRA';
const IDLE_ANIMATION = 'carrack_idle';
/**
 * The drag that turns the ship: from the canvas's middle, this far right (CSS px), this long (the
 * preview draws at every step, so the drag takes about twice as long).
 */
const DRAG = { from: { x: 0.35, y: 0.55 }, by: 520, ms: 1000 } as const;
/**
 * The canvas's middle band that the loop shows, a share of its height: the preview frames the
 * ship in about the middle 60 % at the take's size, turned or not.
 */
const SHIP_BAND = 0.72;

/**
 * `trees`: a base-game map tree (`mapobject_5` in `interface/assets/mapitems.gfx`), opened
 * read-only from the local game (spec section 8.2). A leaf tree: only the season map's first row
 * has colours, and the pines take theirs from the grey rows, so their season colour never changes.
 * Date runs from spring (1 April, in the game's `tree_spring2`) to autumn (28 October,
 * `tree_autumn2`); Place is Stockholm, the docs' example, whose North (0.85) is below the 1 the
 * take drags it to, so both Ground and North follow it.
 */
const TREE_FILE = 'gfx/models/Mapitems/Trees/leafs_01.mesh';
const TREE_DAYS = { spring: 90, autumn: 300 } as const;
const TREE_PLACE = '1';
/**
 * The part of the canvas `trees` shows, in shares of its size: the preview frames the mesh's eight
 * trees in about x 0.25–0.8 and y 0.4–0.74 at the take's size.
 */
const TREE_FOCUS = { x: 0.22, y: 0.36, w: 0.61, h: 0.42 } as const;

/**
 * `entity`: a base-game land unit whose entity attaches a halberd to its right hand and has `idle`
 * and `walk` states, opened read-only from the local game (spec section 8.2). The file's first
 * entity, so its lens is in view as the file opens; the lines of its `attach` block and its `walk`
 * state, which the loop rings.
 */
const ENTITY_FILE = 'gfx/entities/western_units.asset';
const ENTITY_NAME = 'westerngfx_INFANTRY_1';
const ENTITY_LINES = { entity: 7, walk: 12, retreat: 14, attach: 20, end: 23 } as const;
const ENTITY_STATE = 'walk';
/**
 * The part of the entity preview's canvas `entity` shows, in shares of its size: the preview frames
 * the unit in about x 0.33–0.64 and y 0.07–0.9 at the take's size, its halberd included, idle or
 * walking.
 */
const UNIT_FOCUS = { x: 0.29, y: 0.04, w: 0.4, h: 0.89 } as const;

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
 * Both start `side` px left of the button and the menu and end as far right of them, so nothing at
 * their edges is cut by the panel's; a menu over the preview's canvas takes 0, so no strip of the
 * canvas shows beside it.
 */
function menuViews(button: Rect, menu: Rect, below = 12, side = 6): { open: Rect; folded: Rect } {
  const x = Math.min(button.x, menu.x) - side;
  const y = button.y - 12;
  const open = {
    x,
    y,
    w: Math.max(button.x + button.w, menu.x + menu.w) + side - x,
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
export async function centre(locator: Locator): Promise<{ x: number; y: number }> {
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
export async function pointTo(
  { wb, take }: Pick<ClipContext, 'wb' | 'take'>,
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

/**
 * The webview frame of an open custom editor, the Texture or the Mesh Preview, by an element only
 * its page has. Etch's window preview is not one of them.
 */
async function editorFrame(wb: Workbench, selector: string): Promise<Frame> {
  for (let i = 0; i < 300; i++) {
    for (const frame of wb.page.frames()) {
      const found = await frame
        .evaluate((s) => document.querySelector(s) !== null, selector)
        .catch(() => false);
      if (found) return frame;
    }
    await sleep(100);
  }
  throw new Error(`no webview with ${selector} appeared`);
}

/**
 * Opens a file of the local game read-only (spec section 8.2): Quick Open with its absolute path,
 * then the editor moved into the preview's group, where it takes the preview's width (section
 * 8.4). Etch opens a texture or a mesh in its own preview.
 */
async function openGameFile({ wb, gamePath }: ClipContext, file: string): Promise<void> {
  const name = path.posix.basename(file);
  await wb.quickOpen(name, path.join(gamePath, ...file.split('/')));
  await wb.command('View: Move Editor into Next Group');
  await wb.page.locator('.tab.active', { hasText: name }).waitFor();
}

/**
 * The rect of an element's text in a webview frame, in master pixels: `box`, the element's own
 * rect, from its left padding as wide as its text is now.
 */
async function textRect(frame: Frame, selector: string, box: Rect): Promise<Rect> {
  const text = await frame.evaluate((s) => {
    const element = document.querySelector(s);
    if (element === null) return undefined;
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    const left = element.getBoundingClientRect().left;
    return { x: rect.left - left, w: rect.width };
  }, selector);
  if (text === undefined) throw new Error(`${selector} is not in the page`);
  return { x: box.x + text.x - 6, y: box.y, w: text.w + 12, h: box.h };
}

/**
 * Picks an item of VS Code's open quick pick, typing `typed` first when given, and waits until the
 * focused row starts with `label` (a row reads its label, then its description).
 */
async function pickQuickItem(wb: Workbench, label: string, typed?: string): Promise<void> {
  // The list first: a key typed before the quick pick shows goes to the editor. VS Code filters by
  // the label, so `typed` is a part of it.
  const row = wb.page.locator('.quick-input-list .monaco-list-row', { hasText: label }).first();
  await row.waitFor();
  if (typed !== undefined) {
    await wb.page.keyboard.type(typed, { delay: 90 });
    await row.waitFor();
  }
  await wb.focusQuickPickItem(label);
}

/**
 * The rect of `text` on a line the active editor shows, in master pixels, for a pointer to hover or
 * a ring to mark: on line `number` when given, for text other lines in view repeat. Monaco splits a
 * line into token spans, so the line's text nodes are joined, and draws its spaces as no-break
 * spaces.
 */
async function textOnScreen(wb: Workbench, text: string, number?: number): Promise<Rect> {
  const found = await wb.page.evaluate(
    ({ wanted, number }) => {
      const editor = document.querySelector(
        '.part.editor .editor-group-container.active .monaco-editor',
      );
      let lines = [...(editor?.querySelectorAll('.view-lines .view-line') ?? [])];
      if (number !== undefined) {
        // A line's number and its text stand at the same height.
        const label = [
          ...(editor?.querySelectorAll('.margin-view-overlays .line-numbers') ?? []),
        ].find((element) => element.textContent.trim() === String(number));
        if (label === undefined) return undefined;
        const top = label.getBoundingClientRect().top;
        lines = lines.filter((line) => Math.abs(line.getBoundingClientRect().top - top) < 2);
      }
      for (const line of lines) {
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        const nodes: { node: Node; from: number }[] = [];
        let all = '';
        while (walker.nextNode()) {
          nodes.push({ node: walker.currentNode, from: all.length });
          all += (walker.currentNode.textContent ?? '').replace(/\u00a0/g, ' ');
        }
        const index = all.indexOf(wanted);
        if (index < 0) continue;
        const locate = (offset: number): [Node, number] => {
          const at = nodes.filter((n) => n.from <= offset).at(-1) ?? nodes[0];
          if (at === undefined) throw new Error('an empty line');
          return [at.node, offset - at.from];
        };
        const range = document.createRange();
        range.setStart(...locate(index));
        range.setEnd(...locate(index + wanted.length));
        const box = range.getBoundingClientRect();
        return { x: box.x, y: box.y, w: box.width, h: box.height };
      }
      return undefined;
    },
    { wanted: text, number },
  );
  if (found === undefined) {
    const where = number === undefined ? '' : ` on line ${String(number)}`;
    throw new Error(`the active editor shows no "${text}"${where}`);
  }
  return found;
}

/** A rect's centre, in the page's CSS pixels (the device scale is 1). */
function middle(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Sets VS Code settings for the rest of the take, in the run's throwaway settings file. VS Code
 * reads its settings file again when it changes.
 */
async function setSettings(
  wb: Workbench,
  changed: Readonly<Record<string, unknown>>,
): Promise<void> {
  const file = path.join(path.dirname(wb.workspace), 'user-data', 'User', 'settings.json');
  const settings = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, `${JSON.stringify({ ...settings, ...changed }, null, 2)}\n`);
  await sleep(1500);
}

/**
 * Turns VS Code's hovers on for the rest of the take: the takes run with them off (config.ts), so
 * that the pointer shows nothing on its way.
 */
async function enableHovers(wb: Workbench): Promise<void> {
  await setSettings(wb, { 'editor.hover.enabled': 'on' });
}

/** The editor's hover once it shows its content, a picture included; its rect in master pixels. */
async function shownHover(wb: Workbench, picture: boolean): Promise<Rect> {
  const hover = wb.page.locator('.monaco-hover:not(.hidden)').filter({ visible: true }).first();
  await hover.waitFor();
  if (picture) {
    const image = hover.locator('img').first();
    await image.waitFor();
    await image.evaluate(async (img: HTMLImageElement) => {
      if (!img.complete) {
        await new Promise((resolve) => {
          img.addEventListener('load', resolve);
        });
      }
    });
  }
  // VS Code places a hover again once its content has its size.
  await sleep(250);
  return wb.box(hover);
}

/**
 * Closes the editor's hover with Escape: a pointer moved onto a hover keeps it open, and it may
 * cover the next name the pointer goes to.
 */
async function hideHover(wb: Workbench): Promise<void> {
  await wb.press('Escape');
  await wb.page
    .locator('.monaco-hover:not(.hidden)')
    .filter({ visible: true })
    .first()
    .waitFor({ state: 'hidden' });
}

/** The page point of a range input's thumb at `value` (beyond its range: past its end). */
async function rangePoint(input: Locator, value: number): Promise<{ x: number; y: number }> {
  const box = await input.boundingBox();
  if (box === null) throw new Error(`${input.toString()} is not shown`);
  const { min, max } = await input.evaluate((el: HTMLInputElement) => ({
    min: Number(el.min),
    max: Number(el.max),
  }));
  // Chromium's thumb is about 16 px wide: its centre runs from 8 px in to 8 px before the end.
  const thumb = 8;
  return {
    x: box.x + thumb + ((box.width - 2 * thumb) * (value - min)) / (max - min),
    y: box.y + box.height / 2,
  };
}

/**
 * Drags a range input's thumb, where the pointer rests (`rangePoint`), to `to` as a hand would,
 * over `ms`.
 */
async function dragRange(
  context: ClipContext,
  input: Locator,
  to: number,
  ms: number,
): Promise<void> {
  await sleep(150);
  context.take.click();
  await context.wb.page.mouse.down();
  await pointTo(context, await rangePoint(input, to), ms);
  await context.wb.page.mouse.up();
}

/**
 * A Mesh Preview take's layout in `area` (the stage, or a part of it): the bar's strip at UI_SCALE
 * across its top, its camera on one control at a time (`stripOn`; the facts at the start), and
 * under it a part of the canvas (`focus`, in shares of its size) as large as the rest of the area
 * allows. A view wider than the canvas would take in the code beside it.
 */
function meshPreviewLayout(
  log: TakeLog,
  controls: readonly string[],
  focus: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  area: Rect = STAGE,
): {
  readonly bar: (name: string) => Rect;
  readonly strip: Rect;
  readonly stripOn: (rect: Rect) => Rect;
  readonly factsView: Rect;
  readonly model: Rect;
  readonly modelView: Rect;
} {
  const header = rectOf(eventOf(log, 'header'));
  const main = rectOf(eventOf(log, 'canvas'));
  const bar = (name: string): Rect => rectOf(eventOf(log, `bar-${name}`));
  const rowH = Math.max(...controls.map((n) => bar(n).h)) + 16;
  const barH = rowH * UI_SCALE;
  const strip: Rect = { x: area.x, y: area.y, w: area.w, h: barH };
  const stripW = area.w / UI_SCALE;
  const stripOn = (rect: Rect): Rect => ({
    x: Math.min(Math.max(rect.x + rect.w / 2 - stripW / 2, header.x), header.x + header.w - stripW),
    y: rect.y + rect.h / 2 - rowH / 2,
    w: stripW,
    h: rowH,
  });
  const facts = bar('facts');
  const factsView = stripOn({ ...facts, w: Math.min(facts.w, stripW - 20) });
  const modelH = area.h - barH - GUTTER;
  const modelView: Rect = {
    x: main.x + main.w * focus.x,
    y: main.y + main.h * focus.y,
    w: main.w * focus.w,
    h: main.h * focus.h,
  };
  const scale = Math.min(modelH / modelView.h, area.w / modelView.w);
  const model: Rect = {
    x: area.x + (area.w - modelView.w * scale) / 2,
    y: area.y + barH + GUTTER + (modelH - modelView.h * scale) / 2,
    w: modelView.w * scale,
    h: modelView.h * scale,
  };
  return { bar, strip, stripOn, factsView, model, modelView };
}

/** The encoding of the active editor, as VS Code's status bar names it. */
async function editorEncoding(wb: Workbench): Promise<string> {
  return ((await wb.page.locator('[id="status.editor.encoding"]').textContent()) ?? '').trim();
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
      // Its sides are the menu's own: beside it is the preview's canvas.
      const covers = rectOf(eventOf(log, 'covers'));
      const popup = rectOf(eventOf(log, 'popup'));
      const menu = menuViews(
        rectOf(eventOf(log, 'button')),
        { ...popup, x: covers.x, w: covers.w },
        5,
        0,
      );
      const menuScale = Math.min(UI_SCALE, STAGE.h / menu.open.h);
      const area = onScreen(rectOf(eventOf(log, 'screen')), HEADER_AREA);
      const frames = pair(sized(menu.open, menuScale), sized(area, STAGE.h / area.h));
      const { unfolded, folded } = menuFrames(menu, frames.left);
      // The quick pick's input and the typed name's row, at the menu panel's top, its left part. It
      // ends 3 px under the row, above the next row's text: another name may match too (Bali's
      // list also has Balikul).
      const typing = rectOf(eventOf(log, 'typing'));
      const typingView = {
        x: typing.x - 10,
        y: typing.y - 10,
        w: frames.left.w / menuScale,
        h: typing.h + 13,
      };
      const typingFrame = { ...unfolded, h: typingView.h * menuScale };
      const opens = eventsOf(log, 'open', 2);
      const presses = eventsOf(log, 'press', 2);
      const typed = eventsOf(log, 'typed', 2);
      const enters = eventsOf(log, 'enter', 2);
      const closes = eventsOf(log, 'closed', 2);
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
      // The level's menu opens on the current size; Fit is its first item.
      const fit = wb.frame.locator('#zoom-menu button.item', { hasText: 'Fit' });
      await fit.waitFor({ timeout: 2_000 });
      await sleep(300);
      await pointTo(context, await centre(fit), 250);
      await sleep(150);
      take.click();
      await fit.click();
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
    // The Widget Outline beside the preview: an eye hides a widget by hand, a radio picks which
    // panel shows, a click in the preview reveals its row and its line, and Type Sample Text… puts
    // a long name in the header.
    id: 'outline',
    async run(context) {
      const { wb, take } = context;
      // The workbench's own tooltips (a row's, a button's) off: one would show over the rows.
      await setSettings(wb, { 'workbench.hover.delay': 60_000 });
      await wb.command('Explorer: Focus on Widget Outline View');
      // The Explorer's file tree collapsed, so the outline has the sidebar.
      const folders = wb.page.locator('.part.sidebar .pane-header').first();
      if ((await folders.getAttribute('aria-expanded')) === 'true') await folders.click();
      const pane = wb.page.locator('.part.sidebar .pane', {
        has: wb.page.locator('.pane-header[aria-expanded="true"]', { hasText: 'Widget Outline' }),
      });
      await pane.waitFor();
      // A sidebar wide enough for the rows' names, their buttons beside them.
      await wb.fitPreview(OUTLINE_SIDEBAR);
      const screen = await wb.screenRect();
      take.mark('screen', { source: 'vscode', rect: screen });
      const row = (name: string): Locator =>
        pane.locator('.monaco-list-row', {
          has: wb.page.locator('.label-name', { hasText: new RegExp(`^${name}$`) }),
        });
      // A row's widget on the preview's screen, from the row's tooltip: "… at x, y, w × h".
      const placed = async (name: string): Promise<Rect> => {
        const label = (await row(name).getAttribute('aria-label')) ?? '';
        const found = /at (-?[\d.]+), (-?[\d.]+), ([\d.]+) × ([\d.]+)/.exec(label);
        if (found === null) throw new Error(`the outline row of ${name} gives no rect: ${label}`);
        const [x, y, w, h] = found.slice(1).map(Number) as [number, number, number, number];
        return onScreen(screen, { x, y, w, h });
      };
      await wb.focusEditor();
      await wb.highlightCleared();
      const header = await placed(OUTLINE_HEADER);
      // The name's top edge: `area_name` below it, its text right-aligned, covers the rest.
      const name = {
        x: header.x + OUTLINE_NAME_AT.x + OUTLINE_NAME_AT.w / 2,
        y: header.y + OUTLINE_NAME_AT.y + 4,
      };
      take.mark('hidden-area', { source: 'vscode', rect: await placed(OUTLINE_HIDDEN) });
      // The member the radio picks is laid out once it shows: its rect is marked then.
      take.mark('panel', { source: 'vscode', rect: await placed(OUTLINE_PANEL) });
      take.mark('header-area', { source: 'vscode', rect: header });
      take.mark('outline', { source: 'vscode', rect: await wb.box(pane.locator('.pane-body')) });
      const viewMenu = wb.frame.locator('#view-menu');
      await viewMenu.filter({ hasNotText: 'by hand' }).waitFor();
      take.mark('view-menu', { source: 'vscode', rect: await wb.box(viewMenu) });
      const rest = await startTake(context);
      take.mark('start');
      await sleep(900);
      // The eye of a row, which shows while the pointer is on the row.
      const press = async (widget: string, action: string, step: string): Promise<void> => {
        const target = row(widget);
        await pointTo(context, await centre(target), 800);
        const button = target.locator(`.actions [aria-label="${action}"]`);
        await button.waitFor();
        await sleep(200);
        await pointTo(context, await centre(button), 350);
        await sleep(200);
        take.mark(step, { source: 'vscode', rect: await wb.box(target) });
        take.click();
        await button.click();
      };
      take.mark('to', { label: 'hide' });
      await press(OUTLINE_HIDDEN, 'Hide by Hand', 'hide');
      await viewMenu.filter({ hasText: '1 by hand' }).waitFor();
      await sleep(300);
      take.mark('hidden', { source: 'vscode', rect: await wb.box(viewMenu) });
      await sleep(1500);
      // A radio: the side panel's other member.
      take.mark('to', { label: 'choose' });
      await press(OUTLINE_CHOSEN, 'Choose by Hand', 'choose');
      await viewMenu.filter({ hasText: '2 by hand' }).waitFor();
      await sleep(300);
      take.mark('chosen', { source: 'vscode', rect: await wb.box(viewMenu) });
      take.mark('chosen-area', { source: 'vscode', rect: await placed(OUTLINE_CHOSEN) });
      await sleep(1500);
      // A click on the province's name in the preview: its row and its line. The mouse moves at the
      // end only: on the way the preview would show the tip of every widget it crosses.
      take.mark('to', { label: 'name' });
      await glideOver(context, name, 1000);
      await expectTip(wb, OUTLINE_NAME);
      await sleep(300);
      take.mark('clicking');
      take.click();
      await wb.page.mouse.click(name.x, name.y);
      const named = row(OUTLINE_NAME);
      await named.and(pane.locator('.monaco-list-row.selected')).waitFor();
      await wb.highlightSettled();
      await sleep(300);
      take.mark('picked', { source: 'vscode', rect: await editorLine(wb) });
      take.mark('row', { source: 'vscode', rect: await wb.box(named) });
      // The tip stays while the mouse is out of the preview: the mouse moves, unseen, onto the
      // screen's empty top right corner, where no widget is, and the tip goes. The drawn pointer
      // goes on from the name.
      await wb.page.mouse.move(screen.x + screen.w - 30, screen.y + 30);
      await wb.frame.locator('#tip:not([hidden])').waitFor({ state: 'hidden', timeout: 3_000 });
      await sleep(1500);
      // Type Sample Text… on its row, whose buttons show while it is selected.
      take.mark('to', { label: 'type' });
      const edit = named.locator('.actions [aria-label="Type Sample Text…"]');
      await glideOver(context, await centre(edit), 900);
      await sleep(200);
      take.mark('edit', { source: 'vscode', rect: await wb.box(edit) });
      take.click();
      await edit.click();
      const input = wb.page.locator('.quick-input-widget');
      await input.locator('input').waitFor({ state: 'visible' });
      await sleep(300);
      take.mark('input', { source: 'vscode', rect: await wb.box(input) });
      await wb.page.keyboard.press('Control+A');
      await wb.page.keyboard.type(OUTLINE_SAMPLE, { delay: 70 });
      await sleep(400);
      take.mark('enter');
      await wb.page.keyboard.press('Enter');
      await input.waitFor({ state: 'hidden' });
      take.mark('entered');
      await named.filter({ hasText: OUTLINE_SAMPLE }).waitFor();
      await sleep(500);
      take.mark('named', { source: 'vscode', rect: await wb.selectedRect() });
      await sleep(1800);
      take.mark('leaving');
      await pointTo(context, rest, 800);
      await wb.focusEditor();
      await wb.parkMouse();
      take.mark('end');
      await take.until(take.t() + POST_ROLL_MS / 1000);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const screen = rectOf(eventOf(log, 'screen'));
      const outline = rectOf(eventOf(log, 'outline'));
      const menu = rectOf(eventOf(log, 'view-menu'));
      const moves = eventsOf(log, 'to', 4);
      const moveAt = (label: string): number => {
        const move = moves.find((m) => m.label === label);
        if (move === undefined) throw new Error(`outline's take has no move to ${label}`);
        return at(move.t);
      };
      // Left, the outline's rows at OUTLINE_SCALE, the camera on the row each step acts on.
      const left: Rect = { x: STAGE.x, y: STAGE.y, w: outline.w * OUTLINE_SCALE, h: STAGE.h };
      const rowsH = STAGE.h / OUTLINE_SCALE;
      const rowsOn = (rect: Rect): Rect => ({
        x: outline.x,
        y: Math.max(
          Math.min(rect.y + rect.h / 2 - rowsH / 2, outline.y + outline.h - rowsH),
          outline.y,
        ),
        w: outline.w,
        h: rowsH,
      });
      // Right, above, the preview's View ▾ at UI_SCALE, whose label counts the changes by hand;
      // under it the part of the screen each step changes, at most at UI_SCALE.
      const right: Rect = {
        x: left.x + left.w + GUTTER,
        y: STAGE.y,
        w: STAGE.w - left.w - GUTTER,
        h: STAGE.h,
      };
      const stripRow = menu.h + 16;
      const strip: Rect = { x: right.x, y: right.y, w: right.w, h: stripRow * UI_SCALE };
      const stripView: Rect = { x: menu.x - 12, y: menu.y - 8, w: right.w / UI_SCALE, h: stripRow };
      const below: Rect = {
        x: right.x,
        y: strip.y + strip.h + GUTTER,
        w: right.w,
        h: right.h - strip.h - GUTTER,
      };
      // The window on the screen, with its side panel either way: a view keeps inside it where it
      // can, rather than show the empty screen beside it. Its tabs stand above the header's box.
      const windows = grow(
        union(
          union(rectOf(eventOf(log, 'hidden-area')), rectOf(eventOf(log, 'header-area'))),
          union(rectOf(eventOf(log, 'panel')), rectOf(eventOf(log, 'chosen-area'))),
        ),
        16,
      );
      const windowArea: Rect = { ...windows, y: windows.y - 40, h: windows.h + 40 };
      const within = (from: number, size: number, start: number, length: number): number =>
        size >= length
          ? start + (length - size) / 2
          : Math.min(Math.max(from, start), start + length - size);
      const fit = (rect: Rect): Rect => {
        const scale = Math.min(UI_SCALE, below.w / (rect.w + 40), below.h / (rect.h + 40));
        const view = viewAt(rect, scale, below, source);
        const x = within(view.x, view.w, windowArea.x, windowArea.w);
        const y = within(view.y, view.h, windowArea.y, windowArea.h);
        // Never left of the screen, into the editor beside it.
        return { ...view, x: Math.max(x, screen.x), y };
      };
      const header = rectOf(eventOf(log, 'header-area'));
      // The province's name and what is around it, for the click and the sample text.
      const nameArea: Rect = {
        x: header.x + OUTLINE_NAME_AT.x - 60,
        y: header.y + OUTLINE_NAME_AT.y - 40,
        w: OUTLINE_NAME_AT.w + 300,
        h: OUTLINE_NAME_AT.h + 120,
      };
      const hide = eventOf(log, 'hide');
      const hidden = eventOf(log, 'hidden');
      const choose = eventOf(log, 'choose');
      const chosen = eventOf(log, 'chosen');
      const clicking = at(eventOf(log, 'clicking').t);
      const picked = eventOf(log, 'picked');
      const nameRow = rectOf(eventOf(log, 'row'));
      const edit = at(eventOf(log, 'edit').t);
      const input = rectOf(eventOf(log, 'input'));
      const entered = at(eventOf(log, 'entered').t);
      const named = eventOf(log, 'named');
      const leaving = at(eventOf(log, 'leaving').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      const line = rectOf(picked);
      const codeScale = Math.max(CODE_SCALE, below.w / (line.w - 40));
      // The code takes the screen's place through the background, never blended with it.
      const DIP = 0.25;
      const toCode = at(picked.t);
      const toScreen = moveAt('type') - DIP;
      // The input box over the screen's lower part while it is open, cut at its own edges: the
      // preview's toolbar is behind it.
      const inputScale = Math.min(UI_SCALE, below.w / input.w);
      const inputFrame: Rect = {
        x: below.x + (below.w - input.w * inputScale) / 2,
        y: below.y + below.h - input.h * inputScale,
        w: input.w * inputScale,
        h: input.h * inputScale,
      };
      return single(
        'outline',
        log,
        sources,
        { s0, end: s0 + end },
        [
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: left, view: rowsOn(rectOf(hide)) },
              { at: moveAt('choose'), frame: left, view: rowsOn(rectOf(choose)) },
              { at: toCode, frame: left, view: rowsOn(nameRow), move: 0.5 },
            ],
          },
          still('vscode', strip, stripView),
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: below, view: fit(rectOf(eventOf(log, 'hidden-area'))) },
              {
                at: moveAt('choose'),
                frame: below,
                view: fit(
                  union(rectOf(eventOf(log, 'panel')), rectOf(eventOf(log, 'chosen-area'))),
                ),
              },
              { at: moveAt('name'), frame: below, view: fit(nameArea) },
              {
                at: toCode,
                opacity: 0,
                move: DIP,
                frame: below,
                view: fit(nameArea),
              },
              {
                at: toScreen,
                opacity: 1,
                move: DIP,
                frame: below,
                view: fit(nameArea),
              },
            ],
          },
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: below, view: codeView(line, below, source, codeScale), opacity: 0 },
              {
                at: toCode + DIP,
                frame: below,
                view: codeView(line, below, source, codeScale),
                opacity: 1,
                move: DIP,
              },
              {
                at: toScreen - DIP,
                frame: below,
                view: codeView(line, below, source, codeScale),
                opacity: 0,
                move: DIP,
              },
            ],
          },
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: inputFrame, view: input, opacity: 0 },
              { at: edit + 0.1, frame: inputFrame, view: input, opacity: 1, move: 0.15 },
              {
                at: entered - 0.05,
                frame: inputFrame,
                view: input,
                opacity: 0,
                move: 0.15,
              },
            ],
          },
        ],
        {
          captions: sequence(
            [
              { from: 0.2, text: 'The Widget Outline: every widget of the previewed window' },
              { from: at(hide.t) - 0.05, text: 'The eye hides a widget by hand; View ▾ counts it' },
              {
                from: at(choose.t) - 0.05,
                text: "A radio picks which of the window's panels shows",
              },
              { from: clicking - 0.05, text: 'A click in the preview: its row and its line' },
              { from: edit - 0.05, text: 'Type Sample Text…: a long name in the header' },
            ],
            end - 0.4,
          ),
          highlights: [
            { from: at(hide.t) + 0.2, to: moveAt('choose') - 0.1, panel: 0, rect: rectOf(hide) },
            {
              from: at(hidden.t) + 0.1,
              to: moveAt('choose') - 0.1,
              panel: 1,
              rect: rectOf(hidden),
            },
            { from: at(choose.t) + 0.2, to: moveAt('name') - 0.1, panel: 0, rect: rectOf(choose) },
            { from: at(chosen.t) + 0.1, to: moveAt('name') - 0.1, panel: 1, rect: rectOf(chosen) },
            { from: toCode + 0.3, to: toScreen, panel: 0, rect: nameRow },
            {
              from: toCode + 2 * DIP,
              to: toScreen - DIP,
              panel: 3,
              rect: { ...line, w: Math.min(line.w, 640) },
            },
            { from: at(named.t) + 0.1, to: leaving - 0.1, panel: 2, rect: rectOf(named) },
          ],
          // The input box opens over the preview's toolbar: View ▾'s strip holds its frame from
          // before the click until the box is gone.
          holds: [
            {
              from: edit - 0.05,
              to: entered + 0.1,
              panel: 1,
              at: eventOf(log, 'edit').t - 0.1,
            },
          ],
          // The window keeps its changes by hand: the loop dissolves into its start.
          loopFade: 0.5,
          core: { from: moveAt('hide') - 0.3, to: at(named.t) + 1.5 },
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
  {
    // A base-game texture: its alpha alone and back, two mip levels down and back, a texel's values.
    id: 'texture',
    async run(context) {
      const { wb, take } = context;
      await openGameFile(context, TEXTURE_FILE);
      const view = await editorFrame(wb, '#channels');
      const canvas = view.locator('#canvas');
      const level = view.locator('#level');
      const status = view.locator('#status');
      await view.locator('#facts span').nth(3).waitFor();
      await view.waitForFunction(() => (document.querySelector('canvas')?.width ?? 0) > 0);
      const facts = await view.locator('#facts').innerText();
      const levels = Number(/(\d+) mip levels/.exec(facts)?.[1] ?? '1');
      if (!facts.includes('alpha used') || levels <= MIP_STEPS) {
        throw new Error(`${TEXTURE_FILE} needs an alpha and a mip chain: ${facts}`);
      }
      const options = await level.locator('option').allInnerTexts();
      take.mark('header', { source: 'vscode', rect: await wb.box(view.locator('header')) });
      take.mark('facts', { source: 'vscode', rect: await wb.box(view.locator('#facts')) });
      take.mark('controls', {
        source: 'vscode',
        rect: union(await wb.box(level), await wb.box(view.locator('#channels'))),
      });
      take.mark('canvas', { source: 'vscode', rect: await wb.box(canvas) });
      const statusBox = await wb.box(status);
      take.mark('status', { source: 'vscode', rect: statusBox });
      const button = (channels: string): Locator =>
        view.locator(`#channels button[data-channels="${channels}"]`);
      const pressed = (channels: string): Promise<void> =>
        view
          .locator(`#channels button[data-channels="${channels}"][aria-pressed="true"]`)
          .waitFor();
      const shownLevel = (n: number): Promise<unknown> =>
        view.waitForFunction<boolean, readonly [string, number]>(
          ([value, width]) =>
            document.querySelector<HTMLSelectElement>('#level')?.value === value &&
            document.querySelector('canvas')?.width === width,
          [String(n), Math.max(1, Number(/(\d+) ×/.exec(options[n] ?? '')?.[1] ?? 0))],
        );
      const rest = await startTake(context);
      take.mark('start');
      // Over the texture to the bar: the mouse moves at the end only, so the texture's bottom line
      // shows no texels on the way.
      await glideOver(context, await centre(button('a')), 900);
      await sleep(160);
      take.mark('alpha', { source: 'vscode', rect: await wb.box(button('a')) });
      take.click();
      await button('a').click();
      await pressed('a');
      await sleep(1300);
      await pointTo(context, await centre(button('rgba')), 400);
      await sleep(160);
      take.mark('rgba');
      take.click();
      await button('rgba').click();
      await pressed('rgba');
      await sleep(900);
      // The mip level with the keyboard: a click would open the list in a window of its own,
      // which the master does not record.
      await pointTo(context, await centre(level), 500);
      await sleep(200);
      await level.focus();
      for (let n = 1; n <= MIP_STEPS; n++) {
        take.mark('mip', { source: 'vscode', rect: await wb.box(level), label: options[n] ?? '' });
        await level.press('ArrowDown');
        await shownLevel(n);
        await sleep(n === MIP_STEPS ? 1200 : 800);
      }
      take.mark('mip0', { label: options[0] ?? '' });
      await level.press('Home');
      await shownLevel(0);
      await sleep(700);
      const shown = await canvas.boundingBox();
      if (shown === null) throw new Error('the texture is not shown');
      await pointTo(
        context,
        { x: shown.x + shown.width * TEXEL_AT.x, y: shown.y + shown.height * TEXEL_AT.y },
        800,
      );
      await view.waitForFunction(() =>
        /^\d+, \d+ /.test(document.querySelector('#status')?.textContent ?? ''),
      );
      await sleep(200);
      take.mark('texel', {
        source: 'vscode',
        rect: await textRect(view, '#status', statusBox),
        label: await status.innerText(),
      });
      await sleep(1800);
      take.mark('leaving');
      await pointTo(context, rest, 700);
      // As at the start: the keyboard in the editor beside, so the bar shows no focus.
      await wb.focusEditor();
      await wb.parkMouse();
      take.mark('end');
      await take.until(take.t() + POST_ROLL_MS / 1000);
    },
    edit(log, sources) {
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const header = rectOf(eventOf(log, 'header'));
      const facts = rectOf(eventOf(log, 'facts'));
      const controls = rectOf(eventOf(log, 'controls'));
      const canvas = rectOf(eventOf(log, 'canvas'));
      const status = rectOf(eventOf(log, 'status'));
      const texel = eventOf(log, 'texel');
      const texelRect = rectOf(texel);
      // The bar's two ends at UI_SCALE in a row across the stage, as in the preview: its facts on
      // the left and the controls the loop uses on the right; the texture under them, and the
      // bottom line, as wide as its texel's text, under the texture.
      const barH = header.h * UI_SCALE;
      const factsView: Rect = { x: facts.x - 10, y: header.y, w: facts.w + 20, h: header.h };
      const controlsView: Rect = {
        x: controls.x - 10,
        y: header.y,
        w: controls.w + 20,
        h: header.h,
      };
      const factsFrame: Rect = { x: STAGE.x, y: STAGE.y, w: factsView.w * UI_SCALE, h: barH };
      const controlsFrame: Rect = {
        x: STAGE.x + STAGE.w - controlsView.w * UI_SCALE,
        y: STAGE.y,
        w: controlsView.w * UI_SCALE,
        h: barH,
      };
      if (factsFrame.x + factsFrame.w + GUTTER > controlsFrame.x) {
        throw new Error("the bar's facts and controls do not fit the stage side by side");
      }
      const statusView: Rect = {
        x: status.x,
        y: status.y,
        w: texelRect.x + texelRect.w + 10 - status.x,
        h: status.h,
      };
      const statusH = status.h * UI_SCALE;
      const imageView = grow(canvas, 12);
      const imageH = STAGE.h - barH - statusH - 2 * GUTTER;
      const imageW = (imageView.w * imageH) / imageView.h;
      const imageFrame: Rect = {
        x: STAGE.x + (STAGE.w - imageW) / 2,
        y: STAGE.y + barH + GUTTER,
        w: imageW,
        h: imageH,
      };
      const statusFrame: Rect = {
        x: STAGE.x + (STAGE.w - statusView.w * UI_SCALE) / 2,
        y: STAGE.y + STAGE.h - statusH,
        w: statusView.w * UI_SCALE,
        h: statusH,
      };
      const alpha = eventOf(log, 'alpha');
      const rgba = at(eventOf(log, 'rgba').t);
      const mips = eventsOf(log, 'mip', MIP_STEPS);
      const mip0 = eventOf(log, 'mip0');
      const leaving = at(eventOf(log, 'leaving').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      const first = mips[0] as TakeEvent;
      return single(
        'texture',
        log,
        sources,
        { s0, end: s0 + end },
        [
          still('vscode', factsFrame, factsView),
          still('vscode', controlsFrame, controlsView),
          still('vscode', imageFrame, imageView),
          still('vscode', statusFrame, statusView),
        ],
        {
          captions: sequence(
            [
              { from: 0.2, text: 'A texture of the game, its size, format and mip levels' },
              { from: at(alpha.t) - 0.05, text: 'A: the alpha alone, in grey' },
              { from: rgba - 0.05, text: 'RGBA: the colour over a checkerboard again' },
              ...mips.map((mip) => ({
                from: at(mip.t) - 0.05,
                keys: ['↓'],
                text: mip.label ?? '',
              })),
              { from: at(mip0.t) - 0.05, keys: ['Home'], text: mip0.label ?? '' },
              { from: at(texel.t) - 0.1, text: 'The texel under the pointer, and its colour' },
            ],
            end - 0.4,
          ),
          highlights: [
            { from: at(alpha.t) + 0.2, to: rgba - 0.1, panel: 1, rect: rectOf(alpha) },
            {
              from: at(first.t) + 0.2,
              to: at(mip0.t) + 0.7,
              panel: 1,
              rect: rectOf(first),
            },
            { from: at(texel.t) + 0.2, to: leaving - 0.1, panel: 3, rect: texelRect },
          ],
        },
      );
    },
  },
  {
    // An é in a file VS Code saves as UTF-8: Etch's warning, then Save with Encoding as Windows 1252.
    id: 'encoding',
    async run(context) {
      const { wb, take } = context;
      await wb.quickOpen(EVENTS_FILE);
      // The take's VS Code opens files in the game's encoding (config.ts); a modder's opens them as
      // UTF-8, VS Code's default. The file is ASCII, so reopened as UTF-8 it reads the same.
      await wb.command('Change File Encoding', { keepsQuickInput: true });
      await pickQuickItem(wb, 'Reopen with Encoding');
      await wb.page.keyboard.press('Enter');
      await pickQuickItem(wb, 'UTF-8', 'UTF-8');
      await wb.page.keyboard.press('Enter');
      await wb.page.locator('.quick-input-widget').waitFor({ state: 'hidden' });
      const reopened = await editorEncoding(wb);
      if (reopened !== 'UTF-8') throw new Error(`the event file is open as ${reopened}, not UTF-8`);
      await wb.page.keyboard.press('Control+Shift+M');
      await wb.page.locator('.markers-panel').waitFor();
      await wb.focusEditor();
      await wb.fitPreview();
      await expectNoProblems(wb);
      const name = await wb.find(RULER_NAME);
      const home = { line: name.line, column: name.start + RULER_NAME.length - 2 };
      await wb.walkCursorTo(home, 0);
      take.mark('line', { source: 'vscode', rect: await editorLine(wb) });
      take.mark('panel', { source: 'vscode', rect: await wb.box(wb.page.locator('.part.panel')) });
      const listed = wb.page.locator('.markers-panel .monaco-list-row');
      const quick = wb.page.locator('.quick-input-widget');
      const quickRows = (): Locator => quick.locator('.quick-input-list .monaco-list-row');
      const rest = await startTake(context);
      take.mark('start');
      await sleep(300);
      take.mark('key', { label: ACCENT });
      await wb.type(ACCENT);
      const warning = listed.filter({ hasText: 'Ã©' });
      await warning.first().waitFor();
      take.mark('warning', { source: 'vscode', rect: await wb.box(warning) });
      await sleep(2000);
      take.mark('actions');
      await wb.press('Control+.');
      const actions = wb.page.locator('.action-widget');
      const save = actions.locator('.monaco-list-row', { hasText: 'Save with Encoding' });
      await save.first().waitFor();
      for (let i = 0; i < 6; i++) {
        const focused = (await actions.locator('.monaco-list-row.focused').textContent()) ?? '';
        if (focused.includes('Save with Encoding')) break;
        await wb.press('ArrowDown');
        await sleep(150);
      }
      take.mark('menu', { source: 'vscode', rect: await wb.box(actions) });
      await sleep(900);
      take.mark('save');
      await wb.press('Enter');
      await pickQuickItem(wb, 'Save with Encoding');
      await sleep(150);
      take.mark('pick', {
        source: 'vscode',
        rect: union(await wb.box(quick.locator('input')), await wb.box(quickRows().nth(1))),
      });
      await sleep(900);
      take.mark('chosen');
      await wb.press('Enter');
      await quickRows().nth(4).waitFor();
      take.mark('list');
      await pickQuickItem(wb, 'Western (Windows 1252)', '1252');
      await sleep(150);
      take.mark('typed', {
        source: 'vscode',
        rect: union(
          await wb.box(quick.locator('input')),
          await wb.box(quickRows().filter({ hasText: 'Windows 1252' })),
        ),
      });
      await sleep(900);
      take.mark('enter');
      await wb.press('Enter');
      await quick.waitFor({ state: 'hidden' });
      take.mark('saved');
      await warning.first().waitFor({ state: 'detached' });
      if (await wb.dirty()) throw new Error('the file is still unsaved after Save with Encoding');
      const saved = await editorEncoding(wb);
      if (saved !== 'Windows 1252') throw new Error(`the file is saved as ${saved}`);
      take.mark('fixed');
      await sleep(2000);
      await endTake(context, rest);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const warning = eventOf(log, 'warning');
      // Problems down to its warning, the code above it at the `names` loop's size: the quick fix
      // menu opens under the line, inside the code's view.
      const panel = rectOf(eventOf(log, 'panel'));
      const panels = rows(STAGE, STAGE.h - GUTTER - problemsHeight(panel, rectOf(warning)));
      const line = rectOf(eventOf(log, 'line'));
      const code = codeView(line, panels.top, source, NAMES_CODE_SCALE, 0.25);
      const problems = viewAt(panel, UI_SCALE, panels.bottom, source, { x: 0, y: 0 });
      // VS Code's encoding quick picks open at the window's top, far from the code: while one is
      // open the code's panel cuts to it, at UI_SCALE, centred in the panel.
      const pickShot = (rect: Rect): { frame: Rect; view: Rect } => {
        const view = grow(rect, 8);
        const scale = Math.min(UI_SCALE, panels.top.w / view.w, panels.top.h / view.h);
        const w = view.w * scale;
        const h = view.h * scale;
        return {
          frame: {
            x: panels.top.x + (panels.top.w - w) / 2,
            y: panels.top.y + (panels.top.h - h) / 2,
            w,
            h,
          },
          view,
        };
      };
      const pick = pickShot(rectOf(eventOf(log, 'pick')));
      const typed = pickShot(rectOf(eventOf(log, 'typed')));
      const key = at(eventOf(log, 'key').t);
      const actions = at(eventOf(log, 'actions').t);
      const saveAt = at(eventOf(log, 'save').t);
      const chosen = at(eventOf(log, 'chosen').t);
      const list = at(eventOf(log, 'list').t);
      const enter = at(eventOf(log, 'enter').t);
      const saved = at(eventOf(log, 'saved').t);
      const fixed = at(eventOf(log, 'fixed').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      const left = (rect: Rect): Rect => ({
        ...rect,
        w: Math.min(rect.w, problems.w - TEXT_FADE / UI_SCALE - 8),
      });
      return single(
        'encoding',
        log,
        sources,
        { s0, end: s0 + end },
        [
          {
            source: 'vscode',
            fade: TEXT_FADE,
            // Cuts: the quick picks are another part of the window, not a scroll of the code.
            shots: [
              { at: 0, frame: panels.top, view: code },
              { at: saveAt + 0.12, ...pick, move: 0 },
              { at: list + 0.05, ...typed, move: 0 },
              { at: saved, frame: panels.top, view: code, move: 0 },
            ],
          },
          still('vscode', panels.bottom, problems, TEXT_FADE),
        ],
        {
          captions: sequence(
            [
              {
                from: key - 0.05,
                keys: [ACCENT],
                text: 'Saved as UTF-8, the game would show Ã©',
              },
              { from: actions - 0.05, keys: ['Ctrl', '.'], text: "Etch's quick fix" },
              { from: saveAt + 0.05, text: 'Save with Encoding' },
              { from: chosen + 0.05, text: 'Windows 1252, the encoding the game reads' },
              { from: fixed - 0.05, text: 'Saved as Windows 1252: the warning is gone' },
            ],
            end - 0.4,
          ),
          highlights: [
            {
              from: at(warning.t) + 0.2,
              to: fixed - 0.1,
              panel: 1,
              rect: left(rectOf(warning)),
            },
            {
              from: actions + 0.4,
              to: saveAt - 0.05,
              panel: 0,
              rect: rectOf(eventOf(log, 'menu')),
            },
            { from: chosen + 0.5, to: enter - 0.05, panel: 0, rect: rectOf(eventOf(log, 'typed')) },
          ],
          // Between the two quick picks VS Code shows neither for a moment: the panel holds the
          // first one, as chosen, until the encodings' list is up.
          holds: [{ from: chosen, to: list + 0.05, panel: 0, at: eventOf(log, 'chosen').t }],
          // The file is saved in another encoding at the end: the loop dissolves into its start.
          loopFade: 0.5,
          core: { from: key - 0.4, to: fixed + 1 },
        },
      );
    },
  },
  {
    // A sprite's hover and F12 to its .gfx; then, after a cut, the demo mod's models .gfx: a mesh
    // path's hover draws the model, a texture path Ctrl+clicked opens it, Ctrl+W twice comes back.
    id: 'hovers',
    async run(context) {
      const { wb, take } = context;
      const sprite = await wb.find(`"${HOVERED_SPRITE}"`);
      // The text cursor on the name, for F12; the loop starts and ends with it there.
      await wb.walkCursorTo({ line: sprite.line, column: sprite.start + 1 }, 0);
      await wb.parkMouse();
      await enableHovers(wb);
      const group = wb.page.locator('.part.editor .editor-group-container').first();
      take.mark('group', { source: 'vscode', rect: await wb.box(group) });
      const name = await textOnScreen(wb, HOVERED_SPRITE);
      const rest = await startTake(context);
      take.mark('start');
      // The mouse moves at the end only: on the way it would hover other names.
      await glideOver(context, middle(name), 900);
      take.mark('hovering', { source: 'vscode', rect: name });
      take.mark('sprite-hover', { source: 'vscode', rect: await shownHover(wb, true) });
      await sleep(2300);
      // The pointer out of the way first: over the .gfx that opens it would hover another name.
      await glideOver(context, rest, 600);
      await sleep(250);
      take.mark('f12');
      await wb.press('F12');
      await wb.page.locator('.tab.active', { hasText: '.gfx' }).waitFor();
      await sleep(400);
      take.mark('definition', { source: 'vscode', rect: await textOnScreen(wb, HOVERED_SPRITE) });
      await sleep(1900);
      // Off camera, in the cut: the game's .gfx closed and the demo mod's models .gfx opened.
      take.mark('cut');
      await wb.press('Control+W');
      await wb.page.locator('.tab.active', { hasText: 'provinceview.gui' }).waitFor();
      await wb.quickOpen(MODELS_FILE);
      await sleep(500);
      const mesh = await textOnScreen(wb, MESH_PATH);
      const texture = await textOnScreen(wb, TEXTURE_PATH);
      take.mark('models', { source: 'vscode', rect: mesh });
      await sleep(300);
      await glideOver(context, middle(mesh), 800);
      take.mark('mesh-hover', { source: 'vscode', rect: await shownHover(wb, true) });
      await sleep(2500);
      // The mesh's hover covers the texture path below it.
      await hideHover(wb);
      await glideOver(context, middle(texture), 500);
      await sleep(200);
      take.mark('ctrl-click', { source: 'vscode', rect: texture });
      await wb.page.keyboard.down('Control');
      take.click();
      await wb.page.mouse.click(middle(texture).x, middle(texture).y);
      await wb.page.keyboard.up('Control');
      await wb.page.locator('.tab.active', { hasText: TEXTURE_PATH }).waitFor();
      const view = await editorFrame(wb, '#channels');
      await view.waitForFunction(() => (document.querySelector('canvas')?.width ?? 0) > 0);
      await sleep(200);
      take.mark('texture', { source: 'vscode', rect: await wb.box(view.locator('header')) });
      await sleep(1600);
      await glideOver(context, rest, 600);
      for (const back of [MODELS_FILE, 'provinceview.gui']) {
        take.mark('close');
        await wb.press('Control+W');
        await wb.page.locator('.tab.active', { hasText: back }).waitFor();
        await sleep(150);
        take.mark('closed');
        await sleep(back === MODELS_FILE ? 600 : 400);
      }
      await endTake(context, rest);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const group = rectOf(eventOf(log, 'group'));
      // The editor's group, about 1100 px wide, across the stage at CODE_SCALE: its tabs name the
      // file shown. Each shot centres what it shows in the stage's height.
      const scale = Math.min(CODE_SCALE, STAGE.w / group.w);
      const frame: Rect = {
        x: STAGE.x + (STAGE.w - group.w * scale) / 2,
        y: STAGE.y,
        w: group.w * scale,
        h: STAGE.h,
      };
      const viewH = STAGE.h / scale;
      const around = (rect: Rect): Rect => ({
        x: group.x,
        y: Math.min(Math.max(rect.y + rect.h / 2 - viewH / 2, group.y), source.height - viewH),
        w: group.w,
        h: viewH,
      });
      const spriteView = around(
        union(rectOf(eventOf(log, 'hovering')), rectOf(eventOf(log, 'sprite-hover'))),
      );
      const definition = eventOf(log, 'definition');
      const definitionView = around(rectOf(definition));
      // The models .gfx is short: from its tabs down, its first line whole and the hover in view.
      const modelsView: Rect = { x: group.x, y: group.y, w: group.w, h: viewH };
      const hovered = union(rectOf(eventOf(log, 'models')), rectOf(eventOf(log, 'mesh-hover')));
      if (hovered.y + hovered.h > group.y + viewH) {
        throw new Error('the mesh path and its hover reach below the models view');
      }
      // The Texture Preview centres the picture under its header ('texture'): the view on the
      // middle of the rest of the group.
      const header = rectOf(eventOf(log, 'texture'));
      const below = header.y + header.h;
      const textureView = around({ ...group, y: below, h: group.y + group.h - below });
      const s0 = eventOf(log, 'start').t - LEAD;
      const cut = eventOf(log, 'cut').t;
      const s1 = eventOf(log, 'models').t;
      const end = eventOf(log, 'end').t + 0.4;
      const f12 = eventOf(log, 'f12').t;
      const click = eventOf(log, 'ctrl-click').t;
      const opened = eventOf(log, 'texture').t;
      const closes = eventsOf(log, 'close', 2);
      const closed = eventsOf(log, 'closed', 2);
      const local = (t: number, from: number): number => t - from;
      return cuts('hovers', log, sources, [
        {
          span: { s0, end: cut },
          tracks: [
            {
              source: 'vscode',
              shots: [
                { at: 0, frame, view: spriteView },
                { at: local(definition.t, s0), frame, view: definitionView, move: 0 },
              ],
            },
          ],
          // From F12 until the .gfx is revealed at the name, the file as it was: VS Code opens the
          // new file at its top for a frame or two first.
          holds: [{ from: local(f12, s0), to: local(definition.t, s0), panel: 0, at: f12 - 0.05 }],
          captions: sequence(
            [
              {
                from: local(eventOf(log, 'hovering').t, s0) + 0.1,
                text: 'Hover a sprite: its picture, kind and the .gfx that defines it',
              },
              {
                from: local(f12, s0) - 0.05,
                keys: ['F12'],
                text: "Its definition, in the game's .gfx",
              },
            ],
            cut - s0,
          ),
          highlights: [
            {
              from: local(definition.t, s0) + 0.2,
              to: cut - s0 - 0.1,
              panel: 0,
              rect: rectOf(definition),
            },
          ],
        },
        {
          span: { s0: s1, end },
          tracks: [
            {
              source: 'vscode',
              shots: [
                { at: 0, frame, view: modelsView },
                { at: local(opened, s1), frame, view: textureView, move: 0 },
                ...closed.map((event, i) => ({
                  at: local(event.t, s1),
                  frame,
                  view: i === 0 ? modelsView : spriteView,
                  move: 0,
                })),
              ],
            },
          ],
          // From each click or key until its file is shown, the frame before it.
          holds: [
            { from: local(click, s1) + 0.1, to: local(opened, s1), panel: 0, at: click },
            ...closes.map((event, i) => ({
              from: local(event.t, s1),
              to: local((closed[i] as TakeEvent).t, s1),
              panel: 0,
              at: event.t - 0.05,
            })),
          ],
          captions: sequence(
            [
              { from: 0.1, text: 'Hover a mesh path: the model drawn, with its counts' },
              {
                from: local(click, s1) - 0.05,
                keys: ['Ctrl', 'Click'],
                text: 'A texture path opens in the Texture Preview',
              },
              { from: local((closes[0] as TakeEvent).t, s1) - 0.05, keys: ['Ctrl', 'W'] },
              {
                from: local((closes[1] as TakeEvent).t, s1) - 0.05,
                keys: ['Ctrl', 'W'],
                text: 'Back to provinceview.gui',
              },
            ],
            end - s1 - 0.4,
          ),
        },
      ]);
    },
  },
  {
    // A ship's mesh: a drag turns it, Wire on and off, a country's flag on its sails, its idle
    // animation playing, Fit model.
    id: 'mesh',
    async run(context) {
      const { wb, take } = context;
      await openGameFile(context, MESH_FILE);
      const view = await editorFrame(wb, '#wireframe');
      const canvas = view.locator('#canvas');
      const animation = view.locator('#animation');
      await view.locator('#facts').filter({ hasText: /\S/ }).waitFor();
      await animation.waitFor();
      const offered = await animation.locator('option').allInnerTexts();
      const idle = offered.find((label) => label.startsWith(IDLE_ANIMATION));
      if (idle === undefined) {
        throw new Error(`${MESH_FILE} offers no ${IDLE_ANIMATION}: ${offered.join(', ')}`);
      }
      if (await view.locator('#flag').isHidden()) throw new Error(`${MESH_FILE} shows no flag`);
      // Its textures load after the mesh.
      await sleep(1500);
      const flagInput = view.locator('#flag-tag');
      const controls = {
        facts: view.locator('#facts'),
        wire: view.locator('#wireframe'),
        flag: view.locator('#flag'),
        animation,
        reset: view.locator('#zoom-level'),
      };
      for (const [name, locator] of Object.entries(controls)) {
        take.mark(`bar-${name}`, { source: 'vscode', rect: await wb.box(locator) });
      }
      take.mark('header', { source: 'vscode', rect: await wb.box(view.locator('header')) });
      take.mark('canvas', { source: 'vscode', rect: await wb.box(view.locator('main')) });
      const box = await canvas.boundingBox();
      if (box === null) throw new Error('the mesh preview shows no canvas');
      const from = { x: box.x + box.width * DRAG.from.x, y: box.y + box.height * DRAG.from.y };
      const rest = await startTake(context);
      take.mark('start');
      await sleep(600);
      // A drag turns the ship.
      await pointTo(context, from, 600);
      await sleep(150);
      take.mark('drag');
      take.click();
      await wb.page.mouse.down();
      await pointTo(context, { x: from.x + DRAG.by, y: from.y }, DRAG.ms);
      await wb.page.mouse.up();
      take.mark('dragged');
      await sleep(300);
      // Wire on, and off again.
      take.mark('to', { label: 'wire' });
      for (const on of [true, false]) {
        await pointTo(context, await centre(controls.wire), on ? 500 : 200);
        await sleep(150);
        take.mark(on ? 'wire' : 'unwire', { source: 'vscode', rect: await wb.box(controls.wire) });
        take.click();
        await controls.wire.click();
        await view.locator(`#wireframe[aria-pressed="${String(on)}"]`).waitFor();
        await sleep(on ? 1200 : 400);
      }
      // A country's flag on the sails.
      take.mark('to', { label: 'flag' });
      await pointTo(context, await centre(flagInput), 500);
      await sleep(150);
      take.click();
      await flagInput.click();
      take.mark('tag', { source: 'vscode', rect: await wb.box(controls.flag) });
      await wb.page.keyboard.type(FLAG_TAG, { delay: 120 });
      await sleep(150);
      take.mark('enter');
      await wb.page.keyboard.press('Enter');
      await view.waitForFunction(
        (tag) => document.querySelector('#facts')?.textContent.includes(tag) ?? false,
        FLAG_TAG,
      );
      await sleep(1500);
      // Its idle animation, which plays once it is chosen. The list would open in a window of its
      // own, which the master does not record: the choice is made without it.
      take.mark('to', { label: 'animation' });
      await pointTo(context, await centre(animation), 500);
      await sleep(200);
      take.mark('animate', { source: 'vscode', rect: await wb.box(animation), label: idle });
      await animation.selectOption({ label: idle });
      await view.locator('#play[aria-pressed="true"]').waitFor();
      await sleep(2000);
      // Fit model frames the ship as at the start.
      take.mark('to', { label: 'reset' });
      await pointTo(context, await centre(controls.reset), 500);
      await sleep(150);
      take.mark('reset', { source: 'vscode', rect: await wb.box(controls.reset) });
      take.click();
      await controls.reset.click();
      await sleep(1200);
      take.mark('leaving');
      await pointTo(context, rest, 600);
      await wb.focusEditor();
      await wb.parkMouse();
      take.mark('end');
      await take.until(take.t() + POST_ROLL_MS / 1000);
    },
    edit(log, sources) {
      const layout = meshPreviewLayout(log, ['wire', 'flag', 'animation', 'reset'], {
        x: 0,
        y: (1 - SHIP_BAND) / 2,
        w: 1,
        h: SHIP_BAND,
      });
      const { bar, strip, stripOn, factsView } = layout;
      const facts = bar('facts');
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const moves = eventsOf(log, 'to', 4);
      const targets: Record<string, Rect> = {
        wire: bar('wire'),
        flag: bar('flag'),
        // The list and the Play button right of it, which shows once an animation is chosen.
        animation: { ...bar('animation'), w: bar('animation').w + 90 },
        reset: bar('reset'),
      };
      const drag = at(eventOf(log, 'drag').t);
      const wire = eventOf(log, 'wire');
      const unwire = at(eventOf(log, 'unwire').t);
      const tag = eventOf(log, 'tag');
      const enter = at(eventOf(log, 'enter').t);
      const animate = eventOf(log, 'animate');
      const reset = eventOf(log, 'reset');
      const leaving = at(eventOf(log, 'leaving').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      return single(
        'mesh',
        log,
        sources,
        { s0, end: s0 + end },
        [
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: strip, view: factsView },
              ...moves.map((move) => ({
                at: at(move.t),
                frame: strip,
                view: stripOn(targets[move.label ?? ''] ?? facts),
              })),
              { at: leaving, frame: strip, view: factsView },
            ],
          },
          still('vscode', layout.model, layout.modelView),
        ],
        {
          captions: sequence(
            [
              { from: 0.2, text: "A ship's mesh: its shapes, vertices, triangles and bones" },
              { from: drag - 0.05, text: 'A drag turns it' },
              { from: at(wire.t) - 0.05, text: 'Wire: its triangle edges' },
              {
                from: unwire + 0.3,
                keys: [FLAG_TAG, 'Enter'],
                text: 'Flag: a country on its sails',
              },
              { from: at(animate.t) - 0.05, text: `Its idle animation, playing` },
              { from: at(reset.t) - 0.05, text: 'Fit model' },
            ],
            end - 0.4,
          ),
          highlights: [
            { from: at(wire.t) + 0.2, to: unwire - 0.05, panel: 0, rect: rectOf(wire) },
            { from: enter + 0.3, to: at(animate.t) - 0.9, panel: 0, rect: rectOf(tag) },
            {
              from: at(animate.t) + 0.3,
              to: at(reset.t) - 0.9,
              panel: 0,
              rect: rectOf(animate),
            },
          ],
          // The ship keeps its flag and its animation: the loop dissolves into its start.
          loopFade: 0.5,
          core: { from: drag - 0.5, to: at(animate.t) + 2 },
        },
      );
    },
  },
  {
    // A map tree in the Mesh Preview: North dragged to 1, Date from spring to autumn, Snow from 0
    // to 1, and a province typed in Place: Ground and North follow the map there.
    id: 'trees',
    async run(context) {
      const { wb, take } = context;
      await openGameFile(context, TREE_FILE);
      const view = await editorFrame(wb, '#season-day');
      const facts = view.locator('#facts');
      await facts.filter({ hasText: /\S/ }).waitFor();
      await view.locator('#season').waitFor();
      const named = (await facts.textContent()) ?? '';
      if (!named.includes('mapobject_')) {
        throw new Error(`${TREE_FILE} is not drawn as a map tree: ${named}`);
      }
      // Its textures load after the mesh.
      await sleep(1500);
      const controls = {
        facts,
        north: view.locator('#season-north'),
        date: view.locator('#season-day'),
        day: view.locator('#season-date'),
        snow: view.locator('#snow-amount'),
        place: view.locator('#place-province'),
        ground: view.locator('#ground-colour'),
      };
      // Off camera: Date in spring, where the take's drag starts.
      await controls.date.evaluate((el: HTMLInputElement, day: number) => {
        el.value = String(day);
        el.dispatchEvent(new Event('input'));
        el.dispatchEvent(new Event('change'));
      }, TREE_DAYS.spring);
      await sleep(300);
      for (const [name, locator] of Object.entries(controls)) {
        take.mark(`bar-${name}`, { source: 'vscode', rect: await wb.box(locator) });
      }
      take.mark('header', { source: 'vscode', rect: await wb.box(view.locator('header')) });
      take.mark('canvas', { source: 'vscode', rect: await wb.box(view.locator('main')) });
      const value = async (input: Locator): Promise<number> => Number(await input.inputValue());
      const rest = await startTake(context);
      take.mark('start');
      await sleep(600);
      // North to 1: the tree takes the season colour, as in the map's far north.
      take.mark('to', { label: 'north' });
      await pointTo(context, await rangePoint(controls.north, 0), 500);
      take.mark('north', { source: 'vscode', rect: await wb.box(controls.north) });
      await dragRange(context, controls.north, 1.1, 700);
      if ((await value(controls.north)) !== 1) throw new Error('North is not at 1 after its drag');
      await sleep(700);
      // Date from spring to autumn: the season colour follows the day.
      take.mark('to', { label: 'date' });
      await pointTo(context, await rangePoint(controls.date, TREE_DAYS.spring), 500);
      take.mark('date', {
        source: 'vscode',
        rect: union(await wb.box(controls.date), await wb.box(controls.day)),
      });
      await dragRange(context, controls.date, TREE_DAYS.autumn, 1800);
      const day = await value(controls.date);
      if (Math.abs(day - TREE_DAYS.autumn) > 10) throw new Error(`Date ends at day ${String(day)}`);
      await sleep(700);
      // Snow from none to all.
      take.mark('to', { label: 'snow' });
      await pointTo(context, await rangePoint(controls.snow, 0), 500);
      take.mark('snow', { source: 'vscode', rect: await wb.box(controls.snow) });
      await dragRange(context, controls.snow, 1.1, 900);
      if ((await value(controls.snow)) !== 1) throw new Error('Snow is not at 1 after its drag');
      await sleep(900);
      // A province in Place: Ground and North take the map's values there, and lock.
      take.mark('to', { label: 'place' });
      await pointTo(context, await centre(controls.place), 500);
      await sleep(150);
      take.click();
      await controls.place.click();
      take.mark('typed', { source: 'vscode', rect: await wb.box(controls.place) });
      await wb.page.keyboard.type(TREE_PLACE, { delay: 120 });
      await sleep(150);
      take.mark('enter');
      await wb.page.keyboard.press('Enter');
      await view.locator('#season-north:disabled').waitFor();
      const north = await value(controls.north);
      if (north >= 1) throw new Error(`North stays at ${String(north)} at province ${TREE_PLACE}`);
      take.mark('placed');
      await sleep(1800);
      take.mark('leaving');
      await pointTo(context, rest, 600);
      await wb.focusEditor();
      await wb.parkMouse();
      take.mark('end');
      await take.until(take.t() + POST_ROLL_MS / 1000);
    },
    edit(log, sources) {
      const layout = meshPreviewLayout(log, ['north', 'date', 'snow', 'place'], TREE_FOCUS);
      const { bar, strip, stripOn, factsView } = layout;
      const facts = bar('facts');
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const moves = eventsOf(log, 'to', 4);
      const targets: Record<string, Rect> = {
        north: bar('north'),
        date: union(bar('date'), bar('day')),
        snow: bar('snow'),
        // The box, and Ground and North right of it, which follow it.
        place: union(bar('place'), bar('north')),
      };
      const north = eventOf(log, 'north');
      const date = eventOf(log, 'date');
      const snow = eventOf(log, 'snow');
      const typed = at(eventOf(log, 'typed').t);
      const placed = at(eventOf(log, 'placed').t);
      const leaving = at(eventOf(log, 'leaving').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      return single(
        'trees',
        log,
        sources,
        { s0, end: s0 + end },
        [
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: strip, view: factsView },
              ...moves.map((move) => ({
                at: at(move.t),
                frame: strip,
                view: stripOn(targets[move.label ?? ''] ?? facts),
              })),
              { at: leaving, frame: strip, view: factsView },
            ],
          },
          still('vscode', layout.model, layout.modelView),
        ],
        {
          captions: sequence(
            [
              { from: 0.2, text: "A map tree, drawn with the game's own tree shader" },
              { from: at(north.t) - 0.05, text: 'North at 1: the tree takes the season colour' },
              { from: at(date.t) - 0.05, text: 'Date: the season colour follows the day' },
              { from: at(snow.t) - 0.05, text: 'Snow, as the game puts it on in winter' },
              {
                from: typed - 0.05,
                keys: [TREE_PLACE, 'Enter'],
                text: "Place: Stockholm's ground colour and North",
              },
            ],
            end - 0.4,
          ),
          highlights: [
            { from: at(north.t) + 0.2, to: at(date.t) - 0.6, panel: 0, rect: rectOf(north) },
            { from: at(date.t) + 0.2, to: at(snow.t) - 0.6, panel: 0, rect: rectOf(date) },
            { from: at(snow.t) + 0.2, to: typed - 0.6, panel: 0, rect: rectOf(snow) },
            { from: placed + 0.2, to: leaving - 0.1, panel: 0, rect: bar('ground') },
            { from: placed + 0.2, to: leaving - 0.1, panel: 0, rect: bar('north') },
          ],
          // The tree keeps its snow and its place: the loop dissolves into its start.
          loopFade: 0.5,
          core: { from: at(north.t) - 0.5, to: placed + 1.5 },
        },
      );
    },
  },
  {
    // A unit's entity in its .asset file: Preview Entity above it builds the unit beside the code,
    // its halberd on its hand, playing idle; the state list set to walk.
    id: 'entity',
    async run(context) {
      const { wb, take, gamePath } = context;
      // In the editor's own group: the preview opens beside it, in the window preview's group.
      await wb.quickOpen(
        path.posix.basename(ENTITY_FILE),
        path.join(gamePath, ...ENTITY_FILE.split('/')),
      );
      const entityLine = await textOnScreen(wb, 'entity = {', ENTITY_LINES.entity);
      await textOnScreen(wb, `name = "${ENTITY_NAME}"`, ENTITY_LINES.entity + 1);
      // Every entity in view has a lens above it: the file's first is the topmost.
      const lenses = wb.page
        .locator('.part.editor .editor-group-container.active .codelens-decoration a', {
          hasText: 'Preview Entity',
        })
        .filter({ visible: true });
      await lenses.first().waitFor();
      let lens = lenses.first();
      let top = Number.POSITIVE_INFINITY;
      for (const candidate of await lenses.all()) {
        const box = await candidate.boundingBox();
        if (box !== null && box.y < top) {
          top = box.y;
          lens = candidate;
        }
      }
      if (top > entityLine.y || entityLine.y - top > 2 * entityLine.h) {
        throw new Error(`the topmost lens is not above line ${String(ENTITY_LINES.entity)}`);
      }
      // Off camera, once: the first preview reads the playset's .gfx and .asset files, which takes
      // seconds; the take's draws from them at once.
      const tab = wb.page.locator('.tab', { hasText: `Entity: ${ENTITY_NAME}` });
      await lens.click();
      const first = await editorFrame(wb, '#wireframe');
      await first.locator('#facts').filter({ hasText: ENTITY_NAME }).waitFor({ timeout: 60_000 });
      await tab.hover();
      await tab.locator('.tab-actions .action-label').first().click();
      await tab.waitFor({ state: 'detached' });
      await wb.focusEditor();
      await sleep(500);
      const group = wb.page.locator('.part.editor .editor-group-container').first();
      take.mark('group', { source: 'vscode', rect: await wb.box(group) });
      take.mark('lens', { source: 'vscode', rect: await wb.box(lens) });
      take.mark('block', {
        source: 'vscode',
        rect: union(entityLine, await textOnScreen(wb, '}', ENTITY_LINES.end)),
      });
      take.mark('wide', {
        source: 'vscode',
        rect: await textOnScreen(wb, 'animation = "retreat" }', ENTITY_LINES.retreat),
      });
      take.mark('attach', {
        source: 'vscode',
        rect: union(
          await textOnScreen(wb, 'attach = {', ENTITY_LINES.attach),
          await textOnScreen(wb, 'Right_hand_node = "western_halbard"', ENTITY_LINES.attach + 1),
          await textOnScreen(wb, '}', ENTITY_LINES.attach + 2),
        ),
      });
      take.mark('walk', {
        source: 'vscode',
        rect: union(
          await textOnScreen(wb, `state = { name = "${ENTITY_STATE}"`, ENTITY_LINES.walk),
          await textOnScreen(wb, `animation = "${ENTITY_STATE}" }`, ENTITY_LINES.walk),
        ),
      });
      const rest = await startTake(context);
      take.mark('start');
      await sleep(600);
      await pointTo(context, await centre(lens), 900);
      take.mark('pointed');
      await sleep(500);
      take.mark('click');
      take.click();
      await lens.click();
      const view = await editorFrame(wb, '#wireframe');
      const facts = view.locator('#facts');
      const animation = view.locator('#animation');
      await facts.filter({ hasText: ENTITY_NAME }).waitFor();
      await animation.locator(`option[value="${ENTITY_STATE}"]`).waitFor({ state: 'attached' });
      const playing = await animation.inputValue();
      if (playing !== 'idle') throw new Error(`the preview starts on "${playing}", not idle`);
      const attached = facts.locator('span').nth(1);
      const parts = (await attached.textContent()) ?? '';
      if (!parts.includes('1 attached')) throw new Error(`the facts read "${parts}"`);
      // Its textures load after the meshes.
      await sleep(800);
      take.mark('shown');
      const controls = { facts, animation, play: view.locator('#play') };
      for (const [name, locator] of Object.entries(controls)) {
        take.mark(`bar-${name}`, { source: 'vscode', rect: await wb.box(locator) });
      }
      take.mark('header', { source: 'vscode', rect: await wb.box(view.locator('header')) });
      take.mark('canvas', { source: 'vscode', rect: await wb.box(view.locator('main')) });
      take.mark('attached', { source: 'vscode', rect: await wb.box(attached) });
      await sleep(2200);
      // Its walk. The list would open in a window of its own, which the master does not record:
      // the choice is made without it.
      take.mark('to', { label: 'state' });
      await pointTo(context, await centre(animation), 900);
      await sleep(200);
      take.mark('state', { source: 'vscode', rect: await wb.box(animation) });
      await animation.selectOption({ label: `State: ${ENTITY_STATE}` });
      if ((await animation.inputValue()) !== ENTITY_STATE) {
        throw new Error(`the state list does not read ${ENTITY_STATE}`);
      }
      await sleep(3200);
      take.mark('leaving');
      await pointTo(context, rest, 700);
      await wb.focusEditor();
      await wb.parkMouse();
      take.mark('end');
      await take.until(take.t() + POST_ROLL_MS / 1000);
    },
    edit(log, sources) {
      const group = rectOf(eventOf(log, 'group'));
      const wide = rectOf(eventOf(log, 'wide'));
      const block = rectOf(eventOf(log, 'block'));
      // The code from the editor's left edge, its line numbers, past the widest state's end by the
      // fade, at CODE_SCALE: from the tabs, which name the file, while the entity fits under them.
      const viewH = STAGE.h / CODE_SCALE;
      const code: Rect = {
        x: group.x,
        y: Math.max(group.y, block.y + block.h + 40 - viewH),
        w: wide.x + wide.w + 30 + TEXT_FADE / CODE_SCALE - group.x,
        h: viewH,
      };
      const left: Rect = { x: STAGE.x, y: STAGE.y, w: code.w * CODE_SCALE, h: STAGE.h };
      const centred: Rect = { ...left, x: STAGE.x + (STAGE.w - left.w) / 2 };
      const right: Rect = {
        x: left.x + left.w + GUTTER,
        y: STAGE.y,
        w: STAGE.w - left.w - GUTTER,
        h: STAGE.h,
      };
      const layout = meshPreviewLayout(log, ['animation', 'play'], UNIT_FOCUS, right);
      const { bar, strip, stripOn, model, modelView } = layout;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const pointed = at(eventOf(log, 'pointed').t);
      const click = at(eventOf(log, 'click').t);
      // The code slides left once the unit is drawn; the preview fades in beside it after, so the
      // two never overlap. At the end the other way round.
      const SLIDE = 0.6;
      const FADE = 0.4;
      const shown = at(eventOf(log, 'shown').t);
      const drawn = shown + SLIDE;
      const to = at(eventOf(log, 'to').t);
      const state = eventOf(log, 'state');
      const leaving = at(eventOf(log, 'leaving').t);
      const end = at(eventOf(log, 'end').t) + 0.4;
      const attached = rectOf(eventOf(log, 'attached'));
      const factsView = stripOn(attached);
      const stateView = stripOn(union(bar('animation'), bar('play')));
      return single(
        'entity',
        log,
        sources,
        { s0, end: s0 + end },
        [
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: centred, view: code },
              { at: shown, frame: left, view: code, move: SLIDE },
              { at: leaving + FADE, frame: centred, view: code, move: SLIDE },
            ],
            fade: TEXT_FADE,
          },
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: strip, view: factsView, opacity: 0 },
              { at: drawn, frame: strip, view: factsView, opacity: 1, move: FADE },
              { at: to, frame: strip, view: stateView },
              { at: leaving, frame: strip, view: stateView, opacity: 0, move: FADE },
            ],
          },
          {
            source: 'vscode',
            shots: [
              { at: 0, frame: model, view: modelView, opacity: 0 },
              { at: drawn, frame: model, view: modelView, opacity: 1, move: FADE },
              { at: leaving, frame: model, view: modelView, opacity: 0, move: FADE },
            ],
          },
        ],
        {
          captions: sequence(
            [
              { from: 0.2, text: "A unit's entity in its .asset file: mesh, states, attachments" },
              { from: click - 0.05, text: 'Preview Entity builds the unit as the game does' },
              { from: drawn + 0.3, text: "Its halberd on the right hand's bone, playing idle" },
              {
                from: at(state.t) - 0.05,
                text: `State ${ENTITY_STATE}: the halberd moves with the hand`,
              },
            ],
            end - 0.4,
          ),
          highlights: [
            { from: pointed + 0.1, to: click + 0.4, panel: 0, rect: rectOf(eventOf(log, 'lens')) },
            {
              from: drawn + FADE,
              to: to - 0.1,
              panel: 0,
              rect: rectOf(eventOf(log, 'attach')),
            },
            { from: drawn + FADE, to: to - 0.1, panel: 1, rect: attached },
            {
              from: at(state.t) + 0.2,
              to: leaving - 0.1,
              panel: 0,
              rect: rectOf(eventOf(log, 'walk')),
            },
            { from: at(state.t) + 0.2, to: leaving - 0.1, panel: 1, rect: rectOf(state) },
          ],
          // The preview fades out and the code slides back: the loop ends as it starts.
          core: { from: click - 0.6, to: at(state.t) + 2.5 },
        },
      );
    },
  },
];

/** The sidebar's width in the hero's `open` take: the Explorer shows the demo mod's file names. */
const OPEN_SIDEBAR = 320;

/** A row of VS Code's Explorer, by its file or folder name. */
function explorerRow(wb: Workbench, name: string): Locator {
  return wb.page
    .locator('.explorer-folders-view .monaco-list-row')
    .filter({ has: wb.page.locator('.label-name', { hasText: new RegExp(`^${name}$`) }) });
}

/**
 * The hero's first chapter (etch-website docs/spec.md section 8.5), a take of its own and no loop
 * of the site: VS Code with the demo mod's folder in the Explorer and no editor open; a click on
 * `interface/provinceview.gui` opens it at the trade node button's line, and its title bar's Open
 * Preview opens Etch's preview beside it, which outlines the button. The camera shows the whole
 * window, then moves in to the line and the button.
 */
export const HERO_OPEN: Clip = {
  id: 'open',
  async run(context) {
    const { wb, take } = context;
    // VS Code opens the file again where its cursor was: on the trade node button's line.
    const position = await wb.find(TRADE_NODE_POSITION);
    await wb.walkCursorTo({ line: position.line, column: position.start + 1 }, 0);
    await wb.command('View: Show Explorer');
    await wb.fitPreview(OPEN_SIDEBAR);
    await wb.checkFrame();
    // Empty groups keep their sizes, so the preview opens again unscaled where it was.
    await setSettings(wb, { 'workbench.editor.closeEmptyGroups': false });
    await wb.command('View: Close All Editors');
    await wb.command('Collapse Folders in Explorer');
    const folder = explorerRow(wb, 'interface');
    await folder.waitFor();
    take.mark('window', { source: 'vscode', rect: { x: 0, y: 0, w: 2560, h: 1440 } });
    const rest = await startTake(context, { focus: false });

    take.mark('start');
    await clickOn(context, folder, { ms: 600 });
    const file = explorerRow(wb, 'provinceview\\.gui');
    await file.waitFor();
    await sleep(250);
    take.mark('file');
    await clickOn(context, file, { ms: 450 });
    await wb.page.locator('.part.editor .monaco-editor .view-lines').first().waitFor();
    await sleep(350);
    const button = wb.page
      .locator('.part.editor .editor-actions .action-label[aria-label*="Open Preview"]')
      .first();
    take.mark('button', { source: 'vscode', rect: await wb.box(button) });
    await pointTo(context, await centre(button), 650);
    await sleep(160);
    take.mark('preview');
    take.click();
    await button.click();
    await wb.previewOpened();
    await wb.expectPreviewed(WINDOW_NAME);
    const data = (await wb.frame.locator('#data-menu').textContent()) ?? '';
    if (!data.includes(SAMPLE_PROVINCE)) {
      throw new Error(
        `the preview opened again without ${SAMPLE_PROVINCE}: Data ▾ reads "${data}"`,
      );
    }
    await wb.highlightSettled();
    take.mark('shown');
    take.mark('line', { source: 'vscode', rect: await editorLine(wb) });
    take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
    await take.until(take.t() + 3);
    await endTake(context, rest);
  },
  edit(log, sources) {
    const source = sources['vscode'] as Source;
    const start = eventOf(log, 'start').t;
    const s0 = start - LEAD;
    const at = (t: number): number => t - s0;
    const shown = at(eventOf(log, 'shown').t);
    const end = at(eventOf(log, 'end').t) + TAIL;
    const aspect = OUTPUT.width / OUTPUT.height;
    const frame: Rect = {
      x: (OUTPUT.width - STAGE.h * aspect) / 2,
      y: STAGE.y,
      w: STAGE.h * aspect,
      h: STAGE.h,
    };
    const line = rectOf(eventOf(log, 'line'));
    const area = onScreen(rectOf(eventOf(log, 'screen')), TRADE_AREA);
    // The line's start, its code, and the button's part of the screen beside it, with the
    // window's edge, not the next panel, at the view's right.
    const near = focus(union({ ...line, w: 520 }, area), source, aspect, { margin: 48 });
    const close = { ...near, x: Math.max(0, area.x + area.w + 24 - near.w) };
    // The Explorer and the first editor group, up to its title bar's Open Preview.
    const button = rectOf(eventOf(log, 'button'));
    const width = Math.min(source.width, button.x + button.w + 160);
    const files: Rect = { x: 0, y: 0, w: width, h: width / aspect };
    // The camera sets off at the click: the preview opens while it moves.
    const moves = at(eventOf(log, 'preview').t) + 0.2;
    const settled = Math.max(moves + 1.2, shown) + 1.1;
    return single(
      'open',
      log,
      sources,
      { s0, end: s0 + end },
      [
        {
          source: 'vscode',
          shots: [
            { at: 0, frame, view: rectOf(eventOf(log, 'window')) },
            { at: at(start) + 0.3, frame, view: files, move: 0.8 },
            { at: moves, frame, view: close, move: 1.2 },
          ],
        },
      ],
      {
        captions: sequence(
          [
            { from: at(start) - 0.1, text: 'Your mod in VS Code' },
            { from: at(eventOf(log, 'file').t) - 0.1, text: 'Open a .gui file' },
            {
              from: at(eventOf(log, 'preview').t) - 0.1,
              text: 'Open Preview: the window as the game draws it',
            },
          ],
          end - 0.3,
        ),
        highlights: [
          {
            from: at(eventOf(log, 'button').t) + 0.3,
            to: at(eventOf(log, 'preview').t) + 0.4,
            panel: 0,
            rect: grow(rectOf(eventOf(log, 'button')), 4),
          },
        ],
        core: { from: at(start) - 0.5, to: settled },
      },
    );
  },
};

/**
 * The hero's demo loop: its chapters, each the core of a cut (the `open` take's, then other clips'
 * cuts, with their panels and captions), one after another, each fading in from the background
 * and out into it, so a seam is a short dip, not a cut. The loop's end is a dip too: the last part
 * fades out into the background, and the loop's own dissolve brings the first frame in from it.
 * Each chapter starts where its part does (etch-website spec sections 4.2 and 8.5).
 */
export function heroEdit(
  sources: Readonly<Record<string, Source>>,
  chapters: readonly { readonly chapter: string; readonly spec: EditSpec }[],
): EditSpec {
  const DIP = 0.25;
  const full: Rect = { x: 0, y: 0, w: 1920, h: 1080 };
  const parts = chapters.map(({ spec }) => spec);
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
  // A segment's start in whole output frames, as the render cuts it (`editLength`).
  let frames = 0;
  const starts = segments.map((segment) => {
    const start = frames / OUTPUT.fps;
    frames += Math.round(segment.duration * OUTPUT.fps);
    return Math.round(start * 1000) / 1000;
  });
  return {
    id: 'hero',
    sources,
    segments,
    loopFade: DIP,
    chapters: chapters.map(({ chapter }, i) => ({ id: chapter, start: starts[i] ?? 0 })),
  };
}
