/**
 * Compare with Live Game (spec v3 section 4) and the coverage survey's measure 4 with the
 * snapshot's texts (docs/coverage.md), through the same functions so that the two cannot drift
 * apart:
 *
 * - {@link offlinePreviewLayers}: what the offline preview of a window takes from a live snapshot:
 *   with the window's profile, the selectors that fit the snapshot, and the snapshot's texts and
 *   list rows as sample data; never its positions, visibility or toggles, which are what is
 *   compared.
 * - {@link snapshotTree} and {@link planSnapshot}: a live snapshot as the game's widget tree, and
 *   the comparison's plan of a laid-out window against it, as the survey plans a capture.
 * - {@link compareLive}: the survey's geometry and visibility over a plan, and every live
 *   difference, with the widget it is of.
 */
import type { LayoutContent, LayoutView } from '../layout/window.ts';
import type { Screen, Widget } from '../model/gui.ts';
import type { LiveSnapshot } from '../profile/live.ts';
import { liveContent, liveMatch, liveSelectors } from '../profile/live.ts';
import type { LiveTexts, Template } from '../profile/sample.ts';
import { layoutContentOf, sampleData } from '../profile/sample.ts';
import type { WindowProfile } from '../profile/format.ts';
import { windowPaths } from '../profile/paths.ts';
import { evaluateView, layoutViewOf } from '../profile/view.ts';
import { CORPUS_FORMAT_VERSION, type CorpusManifest } from './manifest.ts';
import type { CapturedWidget, CaptureRecord, TongsWidgetType } from './capture.ts';
import { TONGS_WIDGET_TYPES } from './capture.ts';
import { planCapture, type CapturePlan, type PlanWindow, type WidgetRect } from './compare.ts';
import {
  outlineGeometry,
  visibilityAgreement,
  type GeometryCounts,
  type VisibilityCounts,
} from './coverage.ts';

export interface OfflinePreviewInput {
  readonly window: Widget;
  readonly screen: Screen;
  readonly snapshot: LiveSnapshot;
  /** The window's profile; `undefined` for a window without one. */
  readonly profile?: WindowProfile | undefined;
  /** The playset's localisation of a key; `undefined` when it has none. */
  readonly localise: (key: string) => string | undefined;
  /** The playset's top-level definition of a name, for a profile's repeaters. */
  readonly template?: (name: string) => Template | undefined;
}

export interface OfflinePreviewLayers {
  /** The profile's view at the selectors that fit the snapshot; none without a profile. */
  readonly view?: LayoutView;
  readonly content: LayoutContent;
  /** Selectors of the profile that no value fits to the snapshot. */
  readonly unknownSelectors: readonly string[];
}

/**
 * What the offline preview of a window takes from a live snapshot for Compare with Live Game: the
 * profile's selectors at the values that fit it (as an author who knows the game's state would set
 * `View ▾`) and its texts and list rows as sample data, so that boxes the game sizes to their text
 * have the game's text. Its positions, visibility and states are left out: they are what the
 * comparison compares. A window without a profile is the outline with the snapshot's texts.
 */
export function offlinePreviewLayers(input: OfflinePreviewInput): OfflinePreviewLayers {
  const { profile, window, screen, snapshot } = input;
  const matched = liveMatch(snapshot, window, profile).texts;
  const texts: LiveTexts = {
    text: (path) => matched.text(path),
    rows: (list) => matched.rows?.(list),
  };
  if (profile === undefined) {
    return {
      content: liveContent(window, { text: (path) => matched.text(path) }),
      unknownSelectors: [],
    };
  }
  const live = liveSelectors(profile, window, snapshot);
  const view = evaluateView(profile, window, screen, { set: live.values });
  const sample = sampleData(profile, window, view, {
    localise: input.localise,
    length: 'typical',
    live: texts,
    ...(input.template === undefined ? {} : { template: input.template }),
  });
  return {
    view: layoutViewOf(view),
    content: layoutContentOf(sample),
    unknownSelectors: live.unknown,
  };
}

/**
 * A live snapshot as the game's widget tree, as Tongs' `ui tree` gives a capture: the reverse of
 * the survey's `snapshotOf`. A list's rows keep the game's own path when the snapshot has it.
 * Without a name in the snapshot, a widget's `.gui` name comes from the path; a widget whose name
 * Tongs cannot write in a path (one with a space) has a step by the game's own position, `[46]`,
 * which is not its place in the `.gui`, so such steps take, in order, the names of the
 * definition's children that have one too (`window`).
 */
export function snapshotTree(snapshot: LiveSnapshot, window?: Widget): CapturedWidget[] {
  interface Node {
    path: string;
    name: string;
    type: TongsWidgetType;
    visible: boolean;
    rect: WidgetRect;
    text?: string;
    enabled: boolean;
    checked: boolean;
    children: Node[];
  }
  const byPath = new Map<string, Node>();
  const roots: Node[] = [];
  for (const w of snapshot.widgets) {
    const path = w.gamePath ?? w.path;
    const at = path.lastIndexOf('/');
    const step = path.slice(at + 1);
    const node: Node = {
      path,
      name: step.replace(/\[\d+\]$/, ''),
      type: (TONGS_WIDGET_TYPES as readonly string[]).includes(w.type)
        ? (w.type as TongsWidgetType)
        : 'other',
      visible: w.visible,
      rect: { x: w.rect[0], y: w.rect[1], w: w.rect[2], h: w.rect[3] },
      ...(w.text === undefined ? {} : { text: w.text }),
      enabled: w.enabled,
      checked: w.checked,
      children: [],
    };
    byPath.set(path.toLowerCase(), node);
    const parent = at < 0 ? undefined : byPath.get(path.slice(0, at).toLowerCase());
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  if (window !== undefined) {
    const named = (node: Node, definition: Widget): void => {
      node.name = definition.name ?? '';
      const steps = windowPaths(definition);
      const own = new Map<string, Widget>();
      const byPosition: Widget[] = [];
      for (const e of steps) {
        if (steps[e.parent]?.widget !== definition) continue;
        const step = e.path.slice(e.path.lastIndexOf('/') + 1);
        if (step.startsWith('[')) byPosition.push(e.widget);
        else own.set(step.toLowerCase(), e.widget);
      }
      let next = 0;
      for (const child of node.children) {
        const step = child.path.slice(child.path.lastIndexOf('/') + 1);
        const found = step.startsWith('[') ? byPosition[next++] : own.get(step.toLowerCase());
        if (found !== undefined) named(child, found);
      }
    };
    const root = roots.find((r) => r.name.toLowerCase() === (window.name ?? '').toLowerCase());
    if (root !== undefined) named(root, window);
  }
  const out = (node: Node): CapturedWidget => {
    const { children, ...own } = node;
    return { ...own, ...(children.length === 0 ? {} : { children: children.map(out) }) };
  };
  return roots.map(out);
}

/** What the game's code always fills, as in the corpus's manifest: compared by neither. */
export const LIVE_CODE_FILLED_KINDS = [
  'listboxType',
  'smoothListboxType',
  'gridBoxType',
  'OverlappingElementsBoxType',
] as const;

/**
 * The comparison's plan of a laid-out window against a live snapshot of it, as the survey plans a
 * capture (`planCapture`): with the corpus's code-filled kinds and no view of the corpus.
 */
export function planSnapshot(snapshot: LiveSnapshot, window: PlanWindow): CapturePlan {
  // The layout's first widget is the window itself.
  const definition = window.layout.widgets.find((w) => w.parent === -1)?.widget;
  const manifest: CorpusManifest = {
    formatVersion: CORPUS_FORMAT_VERSION,
    game: { version: '', exeSha256: '' },
    tongs: { version: '' },
    uiScale: 1,
    resolutions: [],
    codeFilledKinds: LIVE_CODE_FILLED_KINDS,
    notCovered: [],
    playsets: [],
    windows: [],
    knownDeviations: [],
  };
  const record: CaptureRecord = {
    formatVersion: CORPUS_FORMAT_VERSION,
    playset: '',
    resolution: snapshot.screen,
    view: '',
    takenAt: snapshot.takenAt,
    game: { exeSha256: '' },
    tongs: { version: '' },
    mods: [],
    disabledDlcs: [],
    recipe: { from: 'main-menu', steps: [], verified: false, evidence: 'A live snapshot.' },
    window: { width: snapshot.screen.width, height: snapshot.screen.height, dpi: 96 },
    screenshot: { sha256: '', width: 0, height: 0, shots: 0 },
    widgets: snapshotTree(snapshot, definition),
  };
  return planCapture({ manifest, record, windows: [window] });
}

/** One live difference: a widget whose place or visibility differs from the game's. */
export type LiveDifference =
  | {
      /** The game and the preview put it in other places (or the preview off the screen). */
      readonly kind: 'place';
      readonly path: string;
      readonly widget: Widget;
      readonly game: WidgetRect;
      readonly preview?: WidgetRect;
    }
  | {
      /** The game shows it; the window's files have no such widget. */
      readonly kind: 'gameOnly';
      readonly path: string;
      readonly game: WidgetRect;
    }
  | {
      /** The preview draws it; the game did not create it. */
      readonly kind: 'previewOnly';
      readonly path: string;
      readonly widget: Widget;
      readonly preview: WidgetRect;
    }
  | {
      /** The preview draws it; the game hides it. */
      readonly kind: 'hidden';
      readonly path: string;
      readonly widget: Widget;
      readonly game: WidgetRect;
    }
  | {
      /** The game shows it; the preview hides it. */
      readonly kind: 'shown';
      readonly path: string;
      readonly widget: Widget;
      readonly game: WidgetRect;
    }
  | {
      /**
       * A window without a profile: the game hides `paths.length` widgets the preview draws, as
       * one entry, since the preview draws every widget without a profile (spec v3 section 4).
       */
      readonly kind: 'hiddenInWindow';
      readonly path: string;
      readonly paths: readonly string[];
    };

export interface LiveComparison {
  readonly profiled: boolean;
  readonly geometry: GeometryCounts;
  readonly visibility: VisibilityCounts;
  readonly differences: readonly LiveDifference[];
}

/**
 * The survey's geometry and visibility over a plan, and every live difference. Without a profile,
 * the widgets the game hides and the preview draws are one difference for the whole window.
 */
export function compareLive(plan: CapturePlan, profiled: boolean, window?: Widget): LiveComparison {
  const geometry = outlineGeometry(plan);
  const visibility = visibilityAgreement(plan);
  const byPath = new Map(plan.widgets.map((w) => [w.path, w]));
  // A widget the view does not lay out is found in the window's definition by its path.
  const defined = new Map(
    (window === undefined ? [] : windowPaths(window)).map((e) => [e.path.toLowerCase(), e.widget]),
  );
  const widgetOf = (path: string): Widget | undefined =>
    byPath.get(path)?.laidOut?.widget ?? defined.get(path.toLowerCase());
  const gameRect = (path: string): WidgetRect => byPath.get(path)?.captured?.rect ?? ZERO;
  const differences: LiveDifference[] = [];
  for (const m of geometry.mismatches) {
    const widget = widgetOf(m.path);
    if (widget === undefined) continue;
    differences.push({
      kind: 'place',
      path: m.path,
      widget,
      game: m.game,
      ...(m.layout === undefined ? {} : { preview: m.layout }),
    });
  }
  const shownMissing = new Set(visibility.shownMissing);
  for (const path of geometry.gameOnly) {
    // The preview hides a widget of its files: a visibility difference, listed below.
    if (shownMissing.has(path) && widgetOf(path) !== undefined) continue;
    differences.push({ kind: 'gameOnly', path, game: gameRect(path) });
  }
  for (const path of geometry.layoutOnly) {
    const planned = byPath.get(path);
    if (planned?.laidOut === undefined) continue;
    differences.push({
      kind: 'previewOnly',
      path,
      widget: planned.laidOut.widget,
      preview: planned.rect ?? rectOf(planned.laidOut),
    });
  }
  if (profiled) {
    for (const path of visibility.drawnHidden) {
      const widget = widgetOf(path);
      if (widget !== undefined)
        differences.push({ kind: 'hidden', path, widget, game: gameRect(path) });
    }
  } else if (visibility.drawnHidden.length > 0) {
    const root = plan.widgets.find((w) => w.parent === -1);
    differences.push({
      kind: 'hiddenInWindow',
      path: root?.path ?? '',
      paths: visibility.drawnHidden,
    });
  }
  for (const path of visibility.shownMissing) {
    const widget = widgetOf(path);
    // Not in the window's files: listed as only the game's above.
    if (widget !== undefined)
      differences.push({ kind: 'shown', path, widget, game: gameRect(path) });
  }
  return { profiled, geometry, visibility, differences };
}

const ZERO: WidgetRect = { x: 0, y: 0, w: 0, h: 0 };

function rectOf(laid: { x: number; y: number; width: number; height: number }): WidgetRect {
  return {
    x: Math.round(laid.x),
    y: Math.round(laid.y),
    w: Math.round(laid.width),
    h: Math.round(laid.height),
  };
}
