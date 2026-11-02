// The clips (etch-website docs/spec.md section 8.5): each a feature of Etch shown as a short silent
// loop. A clip's take performs its steps in a fresh VS Code with the demo mod and the base game's
// `interface/provinceview.gui` open beside Etch's preview, logging events; its edit turns the log
// into the camera, captions and highlights the composition renders (edit.ts). Every clip starts and
// ends on the same wide shot of the same state, so it loops without a seam.
import type { Locator } from '@playwright/test';
import {
  cameraKeys,
  editLength,
  focus,
  FULL_FRAME,
  MOVE,
  OUTPUT,
  whole,
  type Caption,
  type EditSpec,
  type Highlight,
  type PointerPath,
  type Rect,
  type Segment,
  type Source,
  union,
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
import type { Cursor, Workbench } from './workbench.ts';

/**
 * The base-game files the workspace overrides, copied from the local game at every run (spec
 * section 8.2): the province view, the window modders change most. No game file is kept.
 */
export const OVERRIDES = ['interface/provinceview.gui'] as const;
/** The file every take opens first, and the window it previews. */
export const START_FILE = 'interface/provinceview.gui';
export const WINDOW_NAME = 'provinceview';

export interface ClipContext {
  readonly wb: Workbench;
  readonly take: Take;
  /** Starts recording VS Code's window; the steps before it are not in the masters. */
  readonly record: () => Promise<void>;
}

export interface Clip {
  readonly id: string;
  run(context: ClipContext): Promise<void>;
  edit(log: TakeLog, sources: Readonly<Record<string, Source>>): EditSpec;
}

/** Still frames before the first step and after the last, for the cut to start and end in. */
export const PRE_ROLL_MS = 2500;
export const POST_ROLL_MS = 2000;
/** The wide shot before the first move and after the last: the loop's seam. */
const LEAD = 2.2;
const TAIL = 1.4;

const ASPECT = OUTPUT.width / OUTPUT.height;

/** The cursor just before the `offset`-th character of the one match of `text`. */
async function cursorIn(wb: Workbench, text: string, offset: number): Promise<Cursor> {
  const match = await wb.find(text);
  return { line: match.line, column: match.start + offset };
}

/** The output rect of a source rect under a full-frame view of the whole source. */
function underWide(rect: Rect, source: Source): Rect {
  const scale = OUTPUT.width / whole(source, ASPECT).w;
  return { x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale };
}

/** The buildings side panel's position: its x, 480, is retyped digit by digit. */
const BUILDINGS_POSITION = 'x=480 y=13';
const TYPED = ['7', '2', '0'];
const KEY_MS = 650;

/**
 * Where the code inset sits over a close-up of the preview: top right, over the game screen's
 * empty part (the province view is at the left, and the buildings panel, which the clips move,
 * starts lower).
 */
const INSET: Rect = { x: 1060, y: 40, w: 820, h: 200 };
/** Where the preview's inset sits over a close-up of the code: top right, over the editor's end. */
const PREVIEW_INSET: Rect = { x: 1392, y: 40, w: 488, h: 274 };

/** The views `views` shows, the first two the menu lists besides the current one. */
const VIEWS = ['Foreign province', 'Build army', 'Build navy', 'State'];

/** Game-screen points at 1280 × 720, in the own province view with the buildings side panel. */
const PROVINCE_HEADER = { x: 150, y: 120 };
const FIRST_BUILDING = { x: 545, y: 225 };
/** The widgets `outline` hovers before it clicks the first building. */
const HOVERED = [PROVINCE_HEADER, { x: 120, y: 330 }, { x: 330, y: 470 }];
/** The province view's header on the game screen, where long names show first. */
const HEADER = { x: 0, y: 50, w: 600, h: 190 };
/** Ctrl+wheel steps in `zoom`: 100 % to 300 % and back. */
const ZOOM_TICKS = 2;

/** `problems`: a sprite of the province view, and the typo swapping its `ui`. */
const SPRITE = '"GFX_provinceview_building_bg"';
const TYPO = 'biulding';

/** The province view's header in the preview, in master pixels. */
async function headerRect(wb: Workbench): Promise<Rect> {
  const screen = await wb.screenRect();
  return { x: screen.x + HEADER.x, y: screen.y + HEADER.y, w: HEADER.w, h: HEADER.h };
}

/** The page point (CSS px) at the centre of a locator's first match. */
async function centre(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.first().boundingBox();
  if (box === null) throw new Error(`${locator.toString()} is not shown`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where the drawn pointer waits: over the editor's bottom left, where it shows nothing. */
async function restPoint(wb: Workbench): Promise<{ x: number; y: number }> {
  const box = await wb.page
    .locator('.part.editor .monaco-editor .view-lines')
    .first()
    .boundingBox();
  if (box === null) throw new Error('the editor is not shown');
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

/** The drawn pointer of a take, for its VS Code panel. */
function pointerOf(log: TakeLog): PointerPath {
  return { points: log.pointer, clicks: log.clicks };
}

/** A camera step of `vscodeEdit`: from `at`, the panel moves to `view` over `move` seconds. */
interface Step {
  readonly at: number;
  readonly view: Rect;
  readonly move?: number;
  /**
   * The part of the editor the code inset shows while the view leaves the editor out, so every
   * frame shows the editor and the preview together (etch-website docs/spec.md section 1.1).
   */
  readonly inset?: Rect;
  /** Where the inset is: the code inset's place unless given (the preview's inset). */
  readonly insetFrame?: Rect;
}

/**
 * A one-segment edit of VS Code's master from `s0` to `end` (take times): its camera steps (at
 * segment times), the code inset, the drawn pointer, captions and highlights. It starts wide.
 */
function vscodeEdit(
  id: string,
  log: TakeLog,
  sources: Readonly<Record<string, Source>>,
  span: { s0: number; end: number },
  steps: readonly Step[],
  extras: { captions?: Caption[]; highlights?: Highlight[] } = {},
): EditSpec {
  const source = sources['vscode'] as Source;
  const wide = whole(source, ASPECT);
  const first = steps[0];
  const last = steps[steps.length - 1];
  // The inset grows out of the editor where its text is, and goes back there.
  const insetSteps: { at: number; frame: Rect; view: Rect; opacity: number; move?: number }[] = [];
  let shown: Rect | undefined = steps.find((step) => step.inset !== undefined)?.inset;
  if (shown !== undefined) {
    insetSteps.push({ at: 0, frame: underWide(shown, source), view: shown, opacity: 0 });
    for (const step of steps) {
      if (step.inset !== undefined) shown = step.inset;
      insetSteps.push({
        at: step.at,
        frame: step.inset === undefined ? underWide(shown, source) : (step.insetFrame ?? INSET),
        view: shown,
        opacity: step.inset === undefined ? 0 : 1,
        ...(step.move === undefined ? {} : { move: step.move }),
      });
    }
  }
  return {
    id,
    sources,
    // The core runs from the first camera move to the end of the last, back to the wide shot.
    ...(first === undefined || last === undefined
      ? {}
      : { core: { from: first.at, to: last.at + (last.move ?? MOVE) } }),
    segments: [
      {
        duration: span.end - span.s0,
        panels: [
          {
            source: 'vscode',
            start: span.s0,
            keys: cameraKeys([{ at: 0, view: wide }, ...steps]),
            pointer: pointerOf(log),
          },
          ...(insetSteps.length === 0
            ? []
            : [{ source: 'vscode', start: span.s0, keys: cameraKeys(insetSteps) }]),
        ],
        captions: extras.captions ?? [],
        highlights: extras.highlights ?? [],
      },
    ],
  };
}

/**
 * The code inset's view of a line: its start (indented code is at the left) and a few lines around
 * it, in the inset's shape, about twice the master's size.
 */
function insetOf(line: Rect, source: Source): Rect {
  return focus(lineStart(line), source, INSET.w / INSET.h, { margin: 16, minWidth: 440 });
}

/** The start of a line, where indented code is; a line's rect spans the whole text area. */
function lineStart(line: Rect): Rect {
  return { ...line, w: Math.min(line.w, 420) };
}

/** The preview's inset over a close-up of the code: the game screen, whole. */
function previewInset(screen: Rect, source: Source): { inset: Rect; insetFrame: Rect } {
  return {
    inset: focus(screen, source, PREVIEW_INSET.w / PREVIEW_INSET.h, { margin: 0 }),
    insetFrame: PREVIEW_INSET,
  };
}

/** Logs the drawn pointer at its rest, records, and waits out the pre-roll; returns the rest. */
async function startTake(context: ClipContext): Promise<{ x: number; y: number }> {
  await context.wb.focusEditor();
  context.take.mark('line', { source: 'vscode', rect: await context.wb.lineRect() });
  const rest = await restPoint(context.wb);
  await pointTo(context, rest, 16);
  await context.record();
  await context.take.until(context.take.t() + PRE_ROLL_MS / 1000);
  return rest;
}

/**
 * Moves the drawn pointer back to its rest. Playwright's mouse then leaves for the preview's
 * title, where it highlights nothing: a widget it hovered on the way stays hovered otherwise.
 */
async function backToRest(context: ClipContext, rest: { x: number; y: number }): Promise<void> {
  await pointTo(context, rest, 700);
  await context.wb.restMouse();
}

/** Back to the rest, then the post-roll. */
async function endTake(context: ClipContext, rest: { x: number; y: number }): Promise<void> {
  await backToRest(context, rest);
  context.take.mark('end');
  await context.take.until(context.take.t() + POST_ROLL_MS / 1000);
}

export const CLIPS: readonly Clip[] = [
  {
    id: 'preview',
    async run({ wb, take, record }) {
      await wb.walkCursorTo(await cursorIn(wb, BUILDINGS_POSITION, 2), 0);
      await wb.press('Shift+ArrowRight', 3);
      await wb.selectionIs(3);
      await wb.highlightSettled();
      await wb.parkMouse();
      take.mark('line', { source: 'vscode', rect: await wb.lineRect() });
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      take.mark('panel', { source: 'vscode', rect: await wb.selectedRect() });
      await record();
      await take.until(take.t() + PRE_ROLL_MS / 1000);

      const first = take.mark('start');
      for (const [i, key] of TYPED.entries()) {
        await take.until(first + (i * KEY_MS) / 1000);
        take.mark('key', { label: key });
        await wb.paint(() => wb.type(key));
        await wb.highlightSettled();
        take.mark('panel', { source: 'vscode', rect: await wb.selectedRect() });
      }
      await take.until(take.t() + 1.8);
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
      const panels = eventsOf(log, 'panel', TYPED.length + 1);
      const lastPaint = (panels[panels.length - 1] as { t: number }).t;
      const undo = eventOf(log, 'undo').t;
      const undone = eventOf(log, 'undone').t;
      const line = insetOf(rectOf(eventOf(log, 'line')), source);
      const screen = focus(rectOf(eventOf(log, 'screen')), source, ASPECT, { margin: 0 });
      // The inset is the typing's caption; the undo's comes in the wide shot, after it.
      return vscodeEdit(
        'preview',
        log,
        sources,
        { s0, end: undone + TAIL },
        [
          { at: at((keys[0] as { t: number }).t) - 1.1, view: screen, inset: line },
          { at: at(lastPaint) + 1.2, view: whole(source, ASPECT) },
        ],
        { captions: [{ from: at(undo) - 0.2, to: at(undone) + 0.8, keys: ['Ctrl', 'Z'] }] },
      );
    },
  },
  {
    id: 'views',
    async run(context) {
      const { wb, take } = context;
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      const rest = await startTake(context);
      take.mark('start');
      const menu = wb.frame.locator('#view-menu');
      const popup = wb.frame.locator('#view-popup');
      const current = /View: (.+?)(?: ·.*)? ▾/.exec((await menu.textContent()) ?? '')?.[1];
      let chosen: string[] | undefined;
      // Each view: the menu, the item, the menu closed, and a look at the window.
      for (let i = 0; i < 3; i++) {
        await clickOn(context, menu);
        await wb.frame.locator('#view-popup:not([hidden])').waitFor();
        if (chosen === undefined) {
          const labels = (await wb.frame.locator('#view-popup .item').allTextContents()).map(
            (text) => text.slice(2).trim(),
          );
          chosen = VIEWS.filter((label) => labels.includes(label) && label !== current);
          if (current === undefined || chosen.length < 2) {
            throw new Error(
              `View ▾ lists ${labels.join(', ')}; the view is ${current ?? 'unknown'}`,
            );
          }
          chosen = [...chosen.slice(0, 2), current];
        }
        const label = chosen[i] as string;
        take.mark('menu', {
          source: 'vscode',
          rect: union(await wb.box(menu), await wb.box(popup)),
        });
        await sleep(450);
        await clickOn(context, viewItem(wb, label), { ms: 600, paint: true });
        await wb.frame.locator('#view-menu', { hasText: `View: ${label}` }).waitFor();
        await wb.closeMenus();
        take.mark('view', { label });
        await backToRest(context, rest);
        await sleep(i === 2 ? 600 : 1700);
      }
      await endTake(context, rest);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const screen = focus(rectOf(eventOf(log, 'screen')), source, ASPECT, { margin: 0 });
      const inset = insetOf(rectOf(eventOf(log, 'line')), source);
      const menus = eventsOf(log, 'menu', 3);
      const views = eventsOf(log, 'view', 3);
      const steps: Step[] = [];
      const captions: Caption[] = [];
      for (const [i, menu] of menus.entries()) {
        const view = views[i] as TakeEvent;
        steps.push(
          { at: at(menu.t) - 0.7, view: focus(rectOf(menu), source, ASPECT, { minWidth: 1280 }) },
          { at: at(view.t) + 0.05, view: screen, inset },
        );
        const next = menus[i + 1];
        captions.push({
          from: at(view.t) + 0.3,
          to: next === undefined ? at(view.t) + 1.2 : at(next.t) - 0.8,
          text: `View: ${view.label ?? ''}`,
        });
      }
      const last = views[views.length - 1] as TakeEvent;
      steps.push({ at: at(last.t) + 1.2, view: whole(source, ASPECT) });
      return vscodeEdit('views', log, sources, { s0, end: eventOf(log, 'end').t + TAIL }, steps, {
        captions,
      });
    },
  },
  {
    id: 'data',
    async run(context) {
      const { wb, take } = context;
      take.mark('header', { source: 'vscode', rect: await headerRect(wb) });
      const rest = await startTake(context);
      take.mark('start');
      const menu = wb.frame.locator('#data-menu');
      for (const length of ['long', 'typical'] as const) {
        await clickOn(context, menu);
        await wb.frame.locator('#data-popup:not([hidden])').waitFor();
        take.mark('menu', {
          source: 'vscode',
          rect: union(await wb.box(menu), await wb.box(wb.frame.locator('#data-popup'))),
        });
        await sleep(450);
        const button = wb.frame.locator('#data-popup .actions button', { hasText: length });
        await clickOn(context, button, { ms: 600, paint: true });
        await wb.frame
          .locator('#data-popup .actions button[aria-pressed="true"]', { hasText: length })
          .waitFor();
        take.mark('length', { label: length });
        await sleep(500);
        await wb.closeMenus();
        take.mark('closed', { label: length });
        await backToRest(context, rest);
        // The long texts held close up; the typical ones only long enough to see them back.
        await sleep(length === 'long' ? 2600 : 600);
      }
      await endTake(context, rest);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const header = focus(rectOf(eventOf(log, 'header')), source, ASPECT, {
        margin: 40,
        minWidth: 1280,
      });
      const inset = insetOf(rectOf(eventOf(log, 'line')), source);
      const menus = eventsOf(log, 'menu', 2);
      const menuView = (i: number): Rect =>
        focus(rectOf(menus[i] as TakeEvent), source, ASPECT, { minWidth: 1280 });
      const closings = eventsOf(log, 'closed', 2);
      const longClosed = closings[0] as { t: number };
      const typicalClosed = closings[1] as { t: number };
      const lengths = eventsOf(log, 'length', 2);
      return vscodeEdit(
        'data',
        log,
        sources,
        { s0, end: eventOf(log, 'end').t + TAIL },
        [
          { at: at((menus[0] as TakeEvent).t) - 0.7, view: menuView(0) },
          { at: at(longClosed.t) + 0.1, view: header, inset },
          { at: at((menus[1] as TakeEvent).t) - 0.7, view: menuView(1) },
          { at: at(typicalClosed.t) + 0.3, view: whole(source, ASPECT) },
        ],
        {
          captions: [
            {
              from: at((lengths[0] as { t: number }).t) - 0.2,
              to: at((menus[1] as TakeEvent).t) - 0.8,
              text: 'Generated text, long: do the names still fit?',
            },
          ],
        },
      );
    },
  },
  {
    id: 'zoom',
    async run(context) {
      const { wb, take } = context;
      const level = wb.frame.locator('#zoom-level');
      take.mark('screen', {
        source: 'vscode',
        rect: union(await wb.screenRect(), await wb.box(level)),
      });
      const rest = await startTake(context);
      take.mark('start');
      const initial = ((await level.textContent()) ?? '').trim();
      await pointTo(context, await wb.screenPoint(PROVINCE_HEADER), 800);
      await sleep(400);
      for (let tick = 0; tick < ZOOM_TICKS; tick++) {
        const before = ((await level.textContent()) ?? '').trim();
        await wb.page.keyboard.down('Control');
        await wb.page.mouse.wheel(0, -120);
        await wb.page.keyboard.up('Control');
        await wb.frame.locator('#zoom-level', { hasNotText: before }).waitFor({ timeout: 2_000 });
        take.mark('zoom', { label: ((await level.textContent()) ?? '').trim() });
        await sleep(700);
      }
      await sleep(1400);
      // The level's button fits the screen into the panel again: the start state.
      await clickOn(context, level);
      await wb.frame.locator('#zoom-level', { hasText: initial }).waitFor({ timeout: 2_000 });
      take.mark('fit');
      await sleep(600);
      await endTake(context, rest);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const screen = focus(rectOf(eventOf(log, 'screen')), source, ASPECT, { margin: 20 });
      const zooms = eventsOf(log, 'zoom', ZOOM_TICKS);
      const fit = at(eventOf(log, 'fit').t);
      return vscodeEdit(
        'zoom',
        log,
        sources,
        { s0, end: eventOf(log, 'end').t + TAIL },
        [
          { at: LEAD - 0.6, view: screen, inset: insetOf(rectOf(eventOf(log, 'line')), source) },
          { at: fit + 0.5, view: whole(source, ASPECT) },
        ],
        {
          captions: [
            {
              from: at((zooms[0] as TakeEvent).t) - 0.5,
              to: fit - 0.9,
              keys: ['Ctrl'],
              text: '+ mouse wheel: zoom around the pointer, pixels stay sharp',
            },
            { from: fit - 0.5, to: fit + 0.6, text: 'A click on the level: fitted again' },
          ],
        },
      );
    },
  },
  {
    id: 'outline',
    async run(context) {
      const { wb, take } = context;
      await wb.command('Explorer: Focus on Widget Outline View');
      await wb.fitPreview();
      await wb.focusEditor();
      await wb.highlightSettled();
      const home = await wb.cursor();
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      take.mark('sidebar', {
        source: 'vscode',
        rect: await wb.box(wb.page.locator('.part.sidebar')),
      });
      take.mark('editor', {
        source: 'vscode',
        rect: await wb.box(wb.page.locator('.part.editor')),
      });
      const rest = await startTake(context);
      take.mark('start');
      for (const point of HOVERED) {
        await pointTo(context, await wb.screenPoint(point), 750);
        await wb.frame.locator('#tip:not([hidden])').waitFor();
        take.mark('hover', { source: 'vscode', rect: await wb.box(wb.frame.locator('#hover')) });
        await sleep(1000);
      }
      await pointTo(context, await wb.screenPoint(FIRST_BUILDING), 600);
      await sleep(300);
      take.click();
      await wb.clickScreen(FIRST_BUILDING);
      await wb.page.locator('.part.sidebar .monaco-list-row.selected').first().waitFor();
      await wb.page
        .locator('[id="status.editor.selection"]', { hasNotText: `Ln ${String(home.line)},` })
        .waitFor();
      take.mark('picked', {
        source: 'vscode',
        rect: union(
          await wb.box(wb.page.locator('.part.sidebar .monaco-list-row.selected')),
          lineStart(await wb.lineRect()),
        ),
      });
      await sleep(2400);
      // Back to where the cursor was, as Go Back takes it.
      await wb.press('Alt+ArrowLeft');
      await wb.page
        .locator('[id="status.editor.selection"]', { hasText: `Ln ${String(home.line)},` })
        .waitFor();
      take.mark('back');
      await endTake(context, rest);
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const screen = focus(rectOf(eventOf(log, 'screen')), source, ASPECT, { margin: 40 });
      const pick = eventOf(log, 'picked');
      const code = focus(rectOf(pick), source, ASPECT, { margin: 80, minWidth: 1280 });
      const screenRect = rectOf(eventOf(log, 'screen'));
      const hovers = eventsOf(log, 'hover', HOVERED.length);
      const picked = at(pick.t);
      const back = at(eventOf(log, 'back').t);
      return vscodeEdit(
        'outline',
        log,
        sources,
        { s0, end: eventOf(log, 'end').t + TAIL },
        [
          { at: LEAD - 0.4, view: screen, inset: insetOf(rectOf(eventOf(log, 'line')), source) },
          { at: picked - 0.2, view: code, ...previewInset(screenRect, source) },
          { at: back + 0.1, view: whole(source, ASPECT) },
        ],
        {
          captions: [
            {
              from: at((hovers[0] as { t: number }).t) - 0.2,
              to: picked - 0.6,
              text: 'Hover a widget: its path and rect',
            },
            { from: picked, to: back, text: 'Click: its definition and its place in the outline' },
          ],
        },
      );
    },
  },
  {
    id: 'problems',
    async run(context) {
      const { wb, take } = context;
      await wb.page.keyboard.press('Control+Shift+M');
      await wb.page.locator('.markers-panel').waitFor();
      // Problems shows only the typo's warning: the base game's file has problems of its own.
      const filter = wb.page
        .locator('.markers-panel-action-filter input, .viewpane-filter input')
        .first();
      await filter.click();
      await filter.fill(TYPO);
      if ((await filter.inputValue()) !== TYPO) throw new Error('the Problems filter took no text');
      await wb.page
        .locator('.markers-panel .monaco-list-row', { hasText: 'Etch' })
        .first()
        .waitFor({ state: 'detached' });
      await wb.focusEditor();
      await wb.fitPreview();
      const sprite = await wb.find(SPRITE);
      await wb.walkCursorTo({ line: sprite.line, column: sprite.start + SPRITE.indexOf('ui') }, 0);
      await wb.press('Shift+ArrowRight', 2);
      await wb.selectionIs(2);
      take.mark('line', { source: 'vscode', rect: await wb.lineRect() });
      take.mark('panel', { source: 'vscode', rect: await wb.box(wb.page.locator('.part.panel')) });
      take.mark('screen', { source: 'vscode', rect: await wb.screenRect() });
      const allow: PaintResult[] = ['problems'];
      // A filter set before a problem exists does not list it until it is set again.
      const refilter = async (): Promise<void> => {
        await filter.fill('');
        await filter.fill(TYPO);
        await wb.focusEditor();
      };
      const rest = await startTake(context);
      const first = take.mark('start');
      for (const [i, key] of ['i', 'u'].entries()) {
        await take.until(first + i * 0.35);
        await wb.paint(() => wb.type(key), allow);
      }
      const row = wb.page.locator('.markers-panel .monaco-list-row', { hasText: TYPO });
      await refilter();
      await row.first().waitFor();
      take.mark('problem', { source: 'vscode', rect: await wb.box(row) });
      await sleep(4200);
      take.mark('undo');
      for (let i = 0; i < 3 && (await wb.dirty()); i++) {
        await wb.paint(() => wb.press('Control+Z'), allow);
      }
      await refilter();
      await row.first().waitFor({ state: 'detached' });
      take.mark('fixed');
      await endTake(context, rest);
      if (await wb.dirty()) throw new Error('the loop does not close: the file is still unsaved');
    },
    edit(log, sources) {
      const source = sources['vscode'] as Source;
      const s0 = eventOf(log, 'start').t - LEAD;
      const at = (t: number): number => t - s0;
      const line = rectOf(eventOf(log, 'line'));
      const screenRect = rectOf(eventOf(log, 'screen'));
      const screen = focus(screenRect, source, ASPECT, { margin: 40 });
      const preview = previewInset(screenRect, source);
      const problem = eventOf(log, 'problem');
      // The row spans the panel; its message is at its left.
      const row = { ...rectOf(problem), w: Math.min(rectOf(problem).w, 1000) };
      const undo = at(eventOf(log, 'undo').t);
      const fixed = at(eventOf(log, 'fixed').t);
      return vscodeEdit(
        'problems',
        log,
        sources,
        { s0, end: eventOf(log, 'end').t + TAIL },
        [
          {
            at: LEAD - 0.9,
            view: focus(lineStart(line), source, ASPECT, { margin: 60, minWidth: 1100 }),
            ...preview,
          },
          {
            at: at(problem.t) + 0.1,
            view: focus(row, source, ASPECT, { margin: 60, minWidth: 1280 }),
            ...preview,
          },
          { at: at(problem.t) + 2.0, view: screen, inset: insetOf(line, source) },
          { at: undo - 0.2, view: whole(source, ASPECT) },
        ],
        {
          captions: [
            {
              from: at(problem.t) - 0.1,
              to: at(problem.t) + 1.9,
              text: 'A misspelled sprite, in Problems as you type',
            },
            {
              from: at(problem.t) + 2.6,
              to: undo - 0.3,
              text: 'The rest of the window still draws',
            },
            { from: undo - 0.1, to: fixed + 0.8, keys: ['Ctrl', 'Z'] },
          ],
          highlights: [{ from: at(problem.t) + 0.4, to: at(problem.t) + 1.9, panel: 0, rect: row }],
        },
      );
    },
  },
];

/**
 * The hero's trailer: the cores of other clips' cuts, one after another (their camera and captions
 * are in the cuts). The first part opens on its wide shot, the last ends at its clip's end, so the
 * trailer opens and closes on a wide shot.
 */
export function heroEdit(
  sources: Readonly<Record<string, Source>>,
  parts: readonly EditSpec[],
): EditSpec {
  const segments: Segment[] = parts.map((part, i) => {
    const length = editLength(part).seconds;
    const core = part.core ?? { from: 0, to: length };
    // The first part opens a little before its first move, still on the wide shot.
    const from = Math.max(0, core.from - (i === 0 ? 0.4 : 0));
    const to = i === parts.length - 1 ? length : core.to;
    return {
      duration: to - from,
      panels: [{ source: part.id, start: from, keys: cameraKeys([{ at: 0, view: FULL_FRAME }]) }],
      captions: [],
      highlights: [],
    };
  });
  return { id: 'hero', sources, segments };
}
