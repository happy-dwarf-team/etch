/**
 * The coverage survey's measures (docs/coverage.md), from a capture's widget trees and the plans
 * of `planCapture`:
 *
 * - **Outline geometry**: for every widget the game shows and the offline layout has, whether the
 *   layout's rect, fitted as Tongs fits the game's, is the game's to the pixel (windows by
 *   position only, as the comparison does). Widgets the game shows that the layout lacks, and
 *   widgets the layout has that the game did not create, are counted apart.
 * - **Visibility**: for every widget the game created, whether the layout draws it exactly when the
 *   game shows it. Without a profile the offline renderer draws every widget.
 * - **Texts**: for every text the game shows, whether the preview took it from the live snapshot.
 * - **Constructs**: the `.gui` kinds, properties and enumerated values a widget is built from, so
 *   that what the survey confirmed carries over to windows no survey reached (a mod's own).
 */
import type { Screen, Widget } from '../model/gui.ts';
import type { LiveSnapshot } from '../profile/live.ts';
import type { LiveTexts } from '../profile/sample.ts';
import { LIVE_SNAPSHOT_FORMAT, liveWidgetsOf } from '../profile/live.ts';
import type { CapturedWidget } from './capture.ts';
import type { CapturePlan, PlannedWidget, WidgetRect } from './compare.ts';

/** Widget kinds whose rect is compared by position only, as `compareCapture` does. */
const WINDOW_KINDS: ReadonlySet<string> = new Set(['windowType', 'eu3dialogtype']);

export interface RectMismatch {
  readonly path: string;
  readonly kind?: string;
  readonly game: WidgetRect;
  /** The layout's fitted rect; none when the layout puts it outside the screen. */
  readonly layout?: WidgetRect;
}

export interface GeometryCounts {
  /** Shown by the game, in the layout, not code-filled: compared. */
  readonly compared: number;
  readonly exact: number;
  readonly mismatches: readonly RectMismatch[];
  /** Shown by the game, but the layout has no such widget (paths). */
  readonly gameOnly: readonly string[];
  /** In the layout and drawn, but the game did not create it. */
  readonly layoutOnly: readonly string[];
  /** Shown by the game, code-filled: placed by the game's code, not compared. */
  readonly codeFilled: number;
}

/** Whether a planned widget and all its ancestors are shown by the game. */
function shown(widget: PlannedWidget): boolean {
  return widget.captured !== undefined && !widget.hidden;
}

export function outlineGeometry(plan: CapturePlan): GeometryCounts {
  let compared = 0;
  let exact = 0;
  let codeFilled = 0;
  const mismatches: RectMismatch[] = [];
  const gameOnly: string[] = [];
  const layoutOnly: string[] = [];
  for (const w of plan.widgets) {
    if (w.captured === undefined) {
      const parent = plan.widgets[w.parent];
      if (w.laidOut !== undefined && w.codeFilled === undefined && !w.hidden) {
        if (parent === undefined || shown(parent)) layoutOnly.push(w.path);
      }
      continue;
    }
    if (!shown(w)) continue;
    if (w.codeFilled !== undefined) {
      codeFilled++;
      continue;
    }
    const game = w.captured.rect;
    if (w.laidOut === undefined) {
      if (game.w > 0 && game.h > 0) gameOnly.push(w.path);
      continue;
    }
    if (w.unplaced === true) continue;
    compared++;
    const layout = w.offScreen === true ? undefined : w.rect;
    const fields = WINDOW_KINDS.has(w.kind ?? '')
      ? (['x', 'y'] as const)
      : (['x', 'y', 'w', 'h'] as const);
    if (layout !== undefined && fields.every((f) => layout[f] === game[f])) exact++;
    else {
      mismatches.push({
        path: w.path,
        ...(w.kind === undefined ? {} : { kind: w.kind }),
        game,
        ...(layout === undefined ? {} : { layout }),
      });
    }
  }
  return { compared, exact, mismatches, gameOnly, layoutOnly, codeFilled };
}

export interface VisibilityCounts {
  /** Widgets the game created whose parent it shows: compared. */
  readonly compared: number;
  readonly agree: number;
  /** The layout draws them, the game hides them. */
  readonly drawnHidden: readonly string[];
  /** The game shows them, the layout does not draw them. */
  readonly shownMissing: readonly string[];
}

/**
 * Visibility of a plan whose layout was drawn with a view (a profile's, or none, which draws
 * everything): a widget the game created and whose parent it shows agrees when the layout lays it
 * out exactly when the game shows it. Widgets the layout has no counterpart of are left out: the
 * geometry counts them.
 */
export function visibilityAgreement(plan: CapturePlan): VisibilityCounts {
  let compared = 0;
  let agree = 0;
  const drawnHidden: string[] = [];
  const shownMissing: string[] = [];
  for (const w of plan.widgets) {
    if (w.captured === undefined) continue;
    const parent = plan.widgets[w.parent];
    if (parent !== undefined && !shown(parent)) continue;
    const game = w.captured.visible;
    const drawn = w.laidOut !== undefined;
    if (!drawn && game && w.codeFilled !== undefined) continue;
    if (!drawn && !game) {
      // Neither: the layout has no such widget, or hides it as the game does.
      compared++;
      agree++;
      continue;
    }
    compared++;
    if (drawn === game) agree++;
    else if (drawn) drawnHidden.push(w.path);
    else shownMissing.push(w.path);
  }
  return { compared, agree, drawnHidden, shownMissing };
}

/** The widgets of a captured tree in tree order, as the live game's plugin reads them. */
function* flatten(widget: CapturedWidget): Generator<CapturedWidget> {
  yield widget;
  for (const child of widget.children ?? []) yield* flatten(child);
}

/**
 * The live snapshot the plugin would have taken of a captured top-level window (spec v2 section
 * 7): the same fields of `tongs.ui` version 1, read from the same game, so the preview's path from
 * a snapshot can be measured on every capture.
 */
export function snapshotOf(root: CapturedWidget, screen: Screen, takenAt: string): LiveSnapshot {
  const widgets = liveWidgetsOf(
    [...flatten(root)].map((w) => ({
      path: w.path,
      type: w.type,
      visible: w.visible,
      enabled: w.enabled ?? true,
      checked: w.checked ?? false,
      text: w.text,
      rect: [w.rect.x, w.rect.y, w.rect.w, w.rect.h] as const,
    })),
  );
  return {
    formatVersion: LIVE_SNAPSHOT_FORMAT,
    window: root.path,
    takenAt,
    screen,
    widgets,
    stale: 0,
  };
}

export interface TextCounts {
  /** Texts the game shows, not empty. */
  readonly shown: number;
  /** Of those, the ones the preview takes from the snapshot, as the game shows them. */
  readonly taken: number;
  readonly missing: readonly string[];
}

/** Which of the texts the game shows the preview takes from a snapshot's match. */
export function textAgreement(snapshot: LiveSnapshot, texts: LiveTexts | undefined): TextCounts {
  let shownCount = 0;
  let taken = 0;
  const missing: string[] = [];
  for (const w of snapshot.widgets) {
    if (!w.visible || w.text === undefined || w.text.trim() === '') continue;
    shownCount++;
    const value = texts?.text(w.path);
    if (value !== undefined && stripCodes(value) === w.text) taken++;
    else missing.push(w.path);
  }
  return { shown: shownCount, taken, missing };
}

/** A text without the game's colour codes (`§G…§!`), as Tongs' `text` gives it. */
function stripCodes(text: string): string {
  return text.replace(/§[^§]?/g, '').replace(/§/g, '');
}

/** Properties whose value is a choice among a few words: their values are constructs of their own. */
const ENUMERATED = new Set([
  'orientation',
  'format',
  'fixedsize',
  'truncate',
  'alwaystransparent',
  'horizontal',
  'vertical',
  'scrollbartype',
]);

/** Properties that name content, never a construct: names, sprites, fonts, texts. */
const CONTENT = new Set([
  'name',
  'spritetype',
  'quadtexturesprite',
  'font',
  'text',
  'buttontext',
  'buttonfont',
  'texturefile',
  'shortcut',
  'tooltip',
  'tooltiptext',
  'delayedtooltiptext',
  'clicksound',
  'oversound',
]);

/**
 * The constructs a widget is built from: its kind, each property it sets (`iconType.position`),
 * the value of each enumerated property (`instantTextBoxType.format=centre`) and whether it has
 * `if_resolution` blocks. Content (names, sprites, fonts, texts) is left out.
 */
export function constructsOf(widget: Widget): string[] {
  const out = new Set<string>([widget.kind]);
  for (const property of widget.properties) {
    const key = property.key.text.toLowerCase();
    if (key === 'if_resolution') {
      out.add(`${widget.kind}.if_resolution`);
      continue;
    }
    if (CONTENT.has(key)) continue;
    out.add(`${widget.kind}.${key}`);
    const value = property.value;
    if (ENUMERATED.has(key) && value?.kind === 'scalar') {
      out.add(`${widget.kind}.${key}=${value.text.toLowerCase()}`);
    }
  }
  return [...out];
}
