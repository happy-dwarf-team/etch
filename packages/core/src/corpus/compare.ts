/**
 * The per-widget comparison of ADR 0002 (etch#43): the offline renderer's layout and image of a
 * corpus view against the capture of the same view in the game.
 *
 * {@link planCapture} matches the laid-out windows with the capture's widget trees and says what
 * to render: the roots' draws, without the widgets the game hides. {@link compareCapture} then
 * compares that render with the screenshot, widget by widget:
 *
 * - A widget's pixels are those where its own draws are the topmost in the render (the rects of
 *   its sprites and glyphs, in paint order), so every pixel counts for one widget only.
 * - Two kinds of pixel are masked: pixels the render does not cover fully (alpha below 255),
 *   because the game blends those edges over the map; and pixels of code-filled content, under
 *   the game's rects of the widgets the code fills and of everything inside them, and under the
 *   render's own draws of those widgets.
 * - A static widget passes when its rect rounds to the game's rect and at least 99 % of its
 *   compared pixels are within ±2 in each of red, green and blue.
 * - A view passes when every widget passes, is code-filled, hidden by the game, not covered by
 *   the corpus, or a failure a known deviation covers.
 *
 * Aggregate figures (share within ±2, mean difference) are reported for trends but gate nothing.
 */
import type { Draw, DrawList } from '../draw-list.ts';
import { DRAW_LIST_VERSION, GLYPH_STRIDE, effectName } from '../draw-list.ts';
import type { LaidOutWidget, WindowLayout } from '../layout/window.ts';
import type { Screen, Widget, WidgetKind } from '../model/gui.ts';
import type { Constants } from '../model/properties.ts';
import { widgetProperties } from '../model/gui.ts';
import type { InterfaceIndex } from '../model/interface-index.ts';
import {
  captureKeyOf,
  type CaptureRecord,
  type CapturedWidget,
  type TongsWidgetType,
} from './capture.ts';
import {
  type CaptureKey,
  deviationCovers,
  findView,
  resolutionKey,
  viewInPlayset,
  type CorpusManifest,
  type PlaysetGate,
} from './manifest.ts';
import { matchesWidgetPattern, splitWidgetPath } from './widget-path.ts';
import type { RgbaImage } from './png.ts';
import type { SaveTextReport, VisibilityResult } from './visibility.ts';

/** How far a channel may differ and still count as equal (ADR 0002). */
export const CHANNEL_TOLERANCE = 2;
/** The share of a widget's compared pixels that must be within {@link CHANNEL_TOLERANCE}. */
export const PASS_SHARE = 0.99;
const RECT_FIELDS = ['x', 'y', 'w', 'h'] as const;
/** Widget kinds whose rect is compared by position only: windows, which draw nothing themselves. */
const WINDOW_KINDS: ReadonlySet<string> = new Set(['windowType', 'eu3dialogtype']);
/**
 * The largest share of a widget's pixels that may have changed between the shots: they are left
 * out like masked ones, and more of them make the widget an unstable capture (ADR 0002, etch#44).
 */
export const UNSTABLE_SHARE = 0.05;

/** A rect in client pixels, as Tongs reports it. */
export interface WidgetRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One top-level window of the playset, laid out at the capture's resolution. */
export interface PlanWindow {
  readonly layout: WindowLayout;
  /**
   * The shader of the sprite a widget draws, as {@link effectName} names it, for the corpus's
   * not-covered shaders; see {@link spriteShaderOf}.
   */
  readonly shaderOf?: (widget: Widget) => string | undefined;
}

export interface CapturePlanInput {
  readonly manifest: CorpusManifest;
  readonly record: CaptureRecord;
  /** The laid-out top-level windows the record's roots are in; found by name, ignoring case. */
  readonly windows: readonly PlanWindow[];
}

/** One widget of the view: in the capture, in the layout, or in both. */
export interface PlannedWidget {
  /** The capture's path; for a widget only the layout has, a path built the same way. */
  readonly path: string;
  /** Index of the parent in {@link CapturePlan.widgets}, −1 for a root. */
  readonly parent: number;
  readonly captured?: CapturedWidget;
  readonly laidOut?: LaidOutWidget;
  /** The `.gui` kind, from the layout. */
  readonly kind?: WidgetKind;
  /** The game does not show it (Tongs' `visible` is false for it or an ancestor): not drawn. */
  readonly hidden: boolean;
  /** Why the game's code fills it: the manifest's pattern or kind, or the code-filled parent. */
  readonly codeFilled?: string;
  /** Why the corpus does not measure it: the manifest's not-covered kind or shader. */
  readonly notCovered?: string;
  /** How far the layout was moved to where the game's code put it (the view's `codeMoved`). */
  readonly moved?: { readonly x: number; readonly y: number };
}

export interface CapturePlan {
  readonly key: CaptureKey;
  readonly widgets: readonly PlannedWidget[];
  /**
   * What to render: the roots' draws in paint order, without the widgets the game hides. Its
   * textures are the layout's game-relative paths.
   */
  readonly drawList: DrawList;
  /** The widget, as an index in {@link widgets}, that each draw of {@link drawList} belongs to. */
  readonly drawOwners: readonly number[];
  /** What keeps the view from being compared fully, such as a root the playset does not define. */
  readonly problems: readonly string[];
}

/**
 * Matches a capture's widget trees with the laid-out windows. The first step of each root's path
 * names a top-level window; children pair by name, ignoring case, in order among siblings of the
 * same name, and unnamed children in order among the unnamed ones.
 */
export function planCapture(input: CapturePlanInput): CapturePlan {
  const { manifest, record } = input;
  const found = findView(manifest, record.view)?.view;
  const playset = manifest.playsets.find((p) => p.id === record.playset);
  const view = found === undefined || playset === undefined ? found : viewInPlayset(found, playset);
  const widgets: PlannedWidget[] = [];
  const problems: string[] = [];
  /** Planned index of each laid-out widget, per window. */
  const planned = input.windows.map((w) => new Int32Array(w.layout.widgets.length).fill(-1));
  const children = input.windows.map((w) => childrenOf(w.layout));
  const rootWindows: number[] = [];

  const flags = (
    path: string,
    kind: WidgetKind | undefined,
    widget: Widget | undefined,
    window: PlanWindow | undefined,
    parent: number,
    captured: CapturedWidget | undefined,
  ): Pick<PlannedWidget, 'codeFilled' | 'notCovered'> => {
    const up = widgets[parent];
    let codeFilled: string | undefined;
    if (up?.codeFilled !== undefined) codeFilled = `inside ${up.path}`;
    // The game's code sets these states; the offline renderer draws the .gui's (spec section 3).
    else if (captured?.enabled === false) codeFilled = 'disabled by the game';
    else if (captured?.checked === true) codeFilled = 'checked by the game';
    else {
      const pattern = view?.codeFilled.find((p) => matchesWidgetPattern(p, path));
      if (pattern !== undefined) codeFilled = pattern;
      else if (kind !== undefined && manifest.codeFilledKinds.includes(kind)) codeFilled = kind;
    }
    let notCovered: string | undefined;
    for (const entry of manifest.notCovered) {
      if ('widgetKind' in entry && entry.widgetKind === kind) notCovered = entry.widgetKind;
    }
    if (notCovered === undefined && widget !== undefined && window?.shaderOf !== undefined) {
      const shader = window.shaderOf(widget);
      if (manifest.notCovered.some((e) => 'shader' in e && e.shader === shader)) {
        notCovered = `${String(shader)} shader`;
      }
    }
    return {
      ...(codeFilled === undefined ? {} : { codeFilled }),
      ...(notCovered === undefined ? {} : { notCovered }),
    };
  };

  const add = (widget: PlannedWidget): number => {
    widgets.push(widget);
    return widgets.length - 1;
  };

  /** Each planned widget's offset from its layout, inherited from a moved ancestor. */
  const shifts: ({ x: number; y: number } | undefined)[] = [];
  const shifted = (laid: LaidOutWidget, shift: { x: number; y: number } | undefined) =>
    shift === undefined ? laid : { ...laid, x: laid.x + shift.x, y: laid.y + shift.y };

  const addLayoutOnly = (w: number, at: number, path: string, parent: number): void => {
    const window = input.windows[w];
    const laidOut = window?.layout.widgets[at];
    if (window === undefined || laidOut === undefined) return;
    const shift = shifts[parent];
    const index = add({
      path,
      parent,
      laidOut: shifted(laidOut, shift),
      kind: laidOut.widget.kind,
      hidden: widgets[parent]?.hidden ?? false,
      ...flags(path, laidOut.widget.kind, laidOut.widget, window, parent, undefined),
    });
    (planned[w] ?? [])[at] = index;
    shifts[index] = shift;
    const kids = children[w]?.[at] ?? [];
    kids.forEach((kid, position) => {
      const name = window.layout.widgets[kid]?.widget.name ?? '';
      addLayoutOnly(w, kid, `${path}/${layoutStep(window.layout, kids, position, name)}`, index);
    });
  };

  const addCaptureOnly = (captured: CapturedWidget, parent: number): void => {
    const index = add({
      path: captured.path,
      parent,
      captured,
      hidden: (widgets[parent]?.hidden ?? false) || !captured.visible,
      ...flags(captured.path, undefined, undefined, undefined, parent, captured),
    });
    for (const child of captured.children ?? []) addCaptureOnly(child, index);
  };

  const match = (w: number, at: number, captured: CapturedWidget, parent: number): void => {
    const window = input.windows[w];
    const laidOut = window?.layout.widgets[at];
    if (window === undefined || laidOut === undefined) return;
    let shift = shifts[parent];
    const moves = view?.codeMoved?.some((p) => matchesWidgetPattern(p, captured.path)) === true;
    if (moves) shift = { x: captured.rect.x - laidOut.x, y: captured.rect.y - laidOut.y };
    const index = add({
      path: captured.path,
      parent,
      captured,
      laidOut: shifted(laidOut, shift),
      kind: laidOut.widget.kind,
      hidden: (widgets[parent]?.hidden ?? false) || !captured.visible,
      ...flags(captured.path, laidOut.widget.kind, laidOut.widget, window, parent, captured),
      ...(moves && shift !== undefined ? { moved: shift } : {}),
    });
    (planned[w] ?? [])[at] = index;
    shifts[index] = shift;

    const kids = children[w]?.[at] ?? [];
    const byName = new Map<string, number[]>();
    for (const kid of kids) {
      const key = (window.layout.widgets[kid]?.widget.name ?? '').toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), kid]);
    }
    const taken = new Set<number>();
    const seen = new Map<string, number>();
    for (const child of captured.children ?? []) {
      const key = child.name.toLowerCase();
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const kid = byName.get(key)?.[n];
      if (kid === undefined) {
        addCaptureOnly(child, index);
      } else {
        taken.add(kid);
        match(w, kid, child, index);
      }
    }
    kids.forEach((kid, position) => {
      if (taken.has(kid)) return;
      const name = window.layout.widgets[kid]?.widget.name ?? '';
      addLayoutOnly(
        w,
        kid,
        `${captured.path}/${layoutStep(window.layout, kids, position, name)}`,
        index,
      );
    });
  };

  for (const root of record.widgets) {
    const found = findRoot(input.windows, children, root.path);
    if (typeof found === 'string') {
      // A root the game's code creates (the lobby's bookmark shields) has no layout; the view names
      // it code-filled, and it masks what it covers (etch#44).
      if (!view?.codeFilled.some((p) => matchesWidgetPattern(p, root.path))) problems.push(found);
      addCaptureOnly(root, -1);
      continue;
    }
    rootWindows.push(found.window);
    match(found.window, found.at, root, -1);
  }

  // The render: each root's window in record order, its widgets in paint order.
  const textures: string[] = [];
  const textureIndex = new Map<string, number>();
  const draws: Draw[] = [];
  const drawOwners: number[] = [];
  for (const w of new Set(rootWindows)) {
    const layout = input.windows[w]?.layout;
    if (layout === undefined) continue;
    const remap = layout.drawList.textures.map((path) => {
      let at = textureIndex.get(path);
      if (at === undefined) {
        at = textures.length;
        textures.push(path);
        textureIndex.set(path, at);
      }
      return at;
    });
    layout.widgets.forEach((laidOut, at) => {
      const owner = planned[w]?.[at] ?? -1;
      const widget = widgets[owner];
      if (owner < 0 || widget?.hidden !== false) return;
      // A code-filled widget the game did not create (only the layout has it) is not drawn: it
      // would cover what the game shows there (etch#44).
      if (widget.captured === undefined && widget.codeFilled !== undefined) return;
      for (let d = laidOut.drawStart; d < laidOut.drawEnd; d++) {
        const draw = layout.drawList.draws[d];
        if (draw === undefined) continue;
        const shift = shifts[owner];
        draws.push(remapTextures(shift === undefined ? draw : moveDraw(draw, shift), remap));
        drawOwners.push(owner);
      }
    });
  }

  return {
    key: captureKeyOf(record),
    widgets,
    drawList: {
      version: DRAW_LIST_VERSION,
      width: record.resolution.width,
      height: record.resolution.height,
      textures,
      draws,
    },
    drawOwners,
    problems,
  };
}

/**
 * The shader of the sprite an icon, button or part draws, as {@link effectName} names it, or
 * `undefined` when it names no sprite the index has.
 */
export function spriteShaderOf(
  widget: Widget,
  context: {
    readonly constants: Constants;
    readonly index: InterfaceIndex;
    readonly screen: Screen;
  },
): string | undefined {
  const props = widgetProperties(widget, context.constants, context.screen);
  const name = props.text(props.has('spritetype') ? 'spritetype' : 'quadtexturesprite');
  if (name === undefined || name === '') return undefined;
  const sprite = context.index.sprite(name)?.item;
  return sprite === undefined ? undefined : effectName(sprite.effectFile);
}

/** What the comparison did with a pixel, in {@link PixelMap.classes}. */
export const PIXEL = {
  /** Nothing of the view's widgets is drawn there. */
  empty: 0,
  /** The render covers it partly (alpha below 255). */
  partial: 1,
  /** Under code-filled content. */
  masked: 2,
  /** Compared, within ±2. */
  equal: 3,
  /** Compared, beyond ±2. */
  different: 4,
} as const;

/** Per pixel of the screen: what the comparison did, and the largest channel difference. */
export interface PixelMap {
  readonly width: number;
  readonly height: number;
  readonly classes: Uint8Array;
  /** The largest of the red, green and blue differences, where the pixel was compared. */
  readonly differences: Uint8Array;
}

export type WidgetStatus =
  'pass' | 'fail' | 'deviation' | 'code-filled' | 'hidden' | 'not-covered' | 'absent';

/** The status order of reports: what needs attention first. */
export const WIDGET_STATUSES: readonly WidgetStatus[] = [
  'fail',
  'deviation',
  'pass',
  'not-covered',
  'code-filled',
  'hidden',
  'absent',
];

export interface PixelCounts {
  /** Pixels where the widget's draws are the topmost and the render covers them fully. */
  readonly compared: number;
  /** Of those, the ones within ±2 in every colour channel. */
  readonly within: number;
  /** The mean of each compared pixel's largest channel difference. */
  readonly meanDifference: number;
  /** Its pixels the render covers only partly. */
  readonly partial: number;
  /** Its pixels under code-filled content. */
  readonly masked: number;
  /**
   * Its pixels that would be compared but were not the same in every shot of the capture
   * (the capture's unstable mask, etch#42); they are left out, and any of them fail the widget.
   */
  readonly unstable: number;
}

export interface WidgetComparison {
  readonly path: string;
  readonly kind?: WidgetKind;
  readonly type?: TongsWidgetType;
  readonly status: WidgetStatus;
  /** What differs; a widget that passes has none. */
  readonly problems: readonly string[];
  /** Why it is code-filled or not covered. */
  readonly reason?: string;
  /** The known deviations that cover a failure. */
  readonly deviations?: readonly string[];
  readonly gameRect?: WidgetRect;
  /** Where the render drew it; moved with a widget the game's code moves. */
  readonly renderRect?: WidgetRect;
  /** How far the render was moved to where the game's code put this widget (`codeMoved`). */
  readonly moved?: { readonly x: number; readonly y: number };
  readonly pixels: PixelCounts;
}

export interface CaptureComparison {
  readonly playset: string;
  readonly resolution: string;
  readonly view: string;
  /** The corpus window of the view. */
  readonly window: string;
  readonly gate: PlaysetGate;
  readonly passed: boolean;
  readonly problems: readonly string[];
  /** Widgets in tree order. */
  readonly widgets: readonly WidgetComparison[];
  readonly totals: {
    readonly widgets: Readonly<Record<WidgetStatus, number>>;
    /** Pixels of the widgets that gate (pass, fail, deviation). */
    readonly pixels: PixelCounts;
  };
  /**
   * The visibility gate of Etch's profiles of the view's root windows (ADR 0006): one result per
   * profiled root; a mismatch fails the capture.
   */
  readonly visibility?: readonly VisibilityResult[];
  /** The profiles' `save` texts against the capture's, reported only (spec v2 section 14). */
  readonly saveTexts?: readonly SaveTextReport[];
}

/**
 * Compares the render of a plan with the capture's screenshot. Both are straight RGBA at the
 * capture's resolution; the screenshot's alpha is ignored. `unstable` is the capture's unstable
 * mask (any channel above 0 marks a pixel that differed between the shots), when it has one.
 */
export function compareCapture(
  manifest: CorpusManifest,
  plan: CapturePlan,
  render: RgbaImage,
  screenshot: RgbaImage,
  unstable?: RgbaImage,
): { comparison: CaptureComparison; map: PixelMap } {
  const { width, height } = plan.drawList;
  for (const [name, image] of [
    ['render', render],
    ['screenshot', screenshot],
    ...(unstable === undefined ? [] : ([['unstable mask', unstable]] as const)),
  ] as const) {
    if (image.width !== width || image.height !== height) {
      throw new Error(
        `The ${name} is ${String(image.width)}x${String(image.height)}, ` +
          `not ${String(width)}x${String(height)}.`,
      );
    }
  }
  const count = width * height;

  // Each pixel's widget: the last draw whose rect covers it.
  const owners = new Int32Array(count).fill(-1);
  const cover = (owner: number, x: number, y: number, w: number, h: number): void => {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(width, Math.ceil(x + w));
    const y1 = Math.min(height, Math.ceil(y + h));
    for (let row = y0; row < y1; row++) owners.fill(owner, row * width + x0, row * width + x1);
  };
  plan.drawList.draws.forEach((draw, d) => {
    const owner = plan.drawOwners[d] ?? -1;
    if (draw.kind === 'text') {
      const g = draw.glyphs;
      for (let i = 0; i + 3 < g.length; i += GLYPH_STRIDE) {
        cover(owner, g[i] ?? 0, g[i + 1] ?? 0, g[i + 2] ?? 0, g[i + 3] ?? 0);
      }
    } else {
      cover(owner, draw.x, draw.y, draw.width, draw.height);
    }
  });

  // Code-filled content, by the game's rects. Tongs gives shields a width of 0 or 1 (etch#42); the
  // game draws them about as wide as they are high, so such a rect is taken as a square (etch#44).
  const masked = new Uint8Array(count);
  for (const widget of plan.widgets) {
    const rect = widget.captured?.rect;
    if (widget.codeFilled === undefined || widget.hidden || rect === undefined) continue;
    const w = rect.w <= 1 && rect.h > 1 ? rect.h : rect.w;
    const x0 = Math.max(0, rect.x);
    const x1 = Math.min(width, rect.x + w);
    if (x1 <= x0) continue;
    for (let row = Math.max(0, rect.y); row < Math.min(height, rect.y + rect.h); row++) {
      masked.fill(1, row * width + x0, row * width + x1);
    }
  }

  const n = plan.widgets.length;
  const compared = new Float64Array(n);
  const within = new Float64Array(n);
  const sum = new Float64Array(n);
  const partial = new Float64Array(n);
  const maskedBy = new Float64Array(n);
  const unstableBy = new Float64Array(n);
  const shaky = unstable?.data;
  const classes = new Uint8Array(count);
  const differences = new Uint8Array(count);
  const r = render.data;
  const s = screenshot.data;
  for (let p = 0; p < count; p++) {
    const owner = owners[p] ?? -1;
    const o = p * 4;
    const alpha = r[o + 3] ?? 0;
    if (owner < 0 || alpha === 0) {
      if (masked[p] === 1) classes[p] = PIXEL.masked;
      continue;
    }
    if (alpha < 255) {
      partial[owner] = (partial[owner] ?? 0) + 1;
      classes[p] = PIXEL.partial;
    } else if (masked[p] === 1 || plan.widgets[owner]?.codeFilled !== undefined) {
      maskedBy[owner] = (maskedBy[owner] ?? 0) + 1;
      classes[p] = PIXEL.masked;
    } else if (shaky !== undefined && (shaky[o] ?? 0) > 0) {
      unstableBy[owner] = (unstableBy[owner] ?? 0) + 1;
      classes[p] = PIXEL.masked;
    } else {
      const difference = Math.max(
        Math.abs((r[o] ?? 0) - (s[o] ?? 0)),
        Math.abs((r[o + 1] ?? 0) - (s[o + 1] ?? 0)),
        Math.abs((r[o + 2] ?? 0) - (s[o + 2] ?? 0)),
      );
      compared[owner] = (compared[owner] ?? 0) + 1;
      sum[owner] = (sum[owner] ?? 0) + difference;
      differences[p] = difference;
      if (difference <= CHANNEL_TOLERANCE) {
        within[owner] = (within[owner] ?? 0) + 1;
        classes[p] = PIXEL.equal;
      } else {
        classes[p] = PIXEL.different;
      }
    }
  }

  const key = plan.key;
  const drawsOf = new Uint8Array(n);
  for (const owner of plan.drawOwners) drawsOf[owner] = 1;
  const results = plan.widgets.map((widget, i): WidgetComparison => {
    const pixels: PixelCounts = {
      compared: compared[i] ?? 0,
      within: within[i] ?? 0,
      meanDifference: (compared[i] ?? 0) === 0 ? 0 : (sum[i] ?? 0) / (compared[i] ?? 1),
      partial: partial[i] ?? 0,
      masked: maskedBy[i] ?? 0,
      unstable: unstableBy[i] ?? 0,
    };
    const gameRect = widget.captured?.rect;
    const renderRect =
      widget.laidOut === undefined
        ? undefined
        : {
            x: widget.laidOut.x,
            y: widget.laidOut.y,
            w: widget.laidOut.width,
            h: widget.laidOut.height,
          };
    const base = {
      path: widget.path,
      ...(widget.kind === undefined ? {} : { kind: widget.kind }),
      ...(widget.captured === undefined ? {} : { type: widget.captured.type }),
      ...(gameRect === undefined ? {} : { gameRect }),
      ...(renderRect === undefined ? {} : { renderRect }),
      ...(widget.moved === undefined ? {} : { moved: widget.moved }),
      pixels,
    };
    if (widget.hidden) return { ...base, status: 'hidden', problems: [] };
    if (widget.codeFilled !== undefined) {
      return { ...base, status: 'code-filled', problems: [], reason: widget.codeFilled };
    }

    const problems: string[] = [];
    if (widget.captured === undefined) {
      if (drawsOf[i] !== 1) return { ...base, status: 'absent', problems: [] };
      problems.push('The game has no such widget, but the render draws it.');
    } else if (widget.laidOut === undefined) {
      // The .gui's size, which can be negative (provinceview's foreign_province_window).
      if (gameRect !== undefined && (gameRect.w <= 0 || gameRect.h <= 0)) {
        return { ...base, status: 'absent', problems: [] };
      }
      problems.push('The render has no such widget.');
    } else if (gameRect !== undefined && renderRect !== undefined) {
      // A window draws nothing itself, and Tongs' window sizes may not be the drawn panel (its
      // README): Proper 2K UI Enhanced's ledger is 1921 × 80 to Tongs at every size (etch#44).
      const fields = WINDOW_KINDS.has(widget.kind ?? '') ? (['x', 'y'] as const) : RECT_FIELDS;
      const differs = fields.filter((c) => Math.round(renderRect[c]) !== gameRect[c]);
      if (differs.length > 0) {
        problems.push(`The rect is ${showRect(renderRect)}; the game's is ${showRect(gameRect)}.`);
      }
    }
    if (pixels.unstable > UNSTABLE_SHARE * (pixels.compared + pixels.unstable)) {
      problems.push(
        `${String(pixels.unstable)} of its pixels changed between the capture's shots, more ` +
          `than ${percent(UNSTABLE_SHARE)}; recapture it, or mask what the game animates there.`,
      );
    }
    if (pixels.compared > 0 && pixels.within / pixels.compared < PASS_SHARE) {
      problems.push(
        `${percent(pixels.within / pixels.compared)} of ${String(pixels.compared)} pixels ` +
          `are within ±${String(CHANNEL_TOLERANCE)} (mean difference ` +
          `${pixels.meanDifference.toFixed(2)}).`,
      );
    }
    if (widget.notCovered !== undefined) {
      return { ...base, status: 'not-covered', problems, reason: widget.notCovered };
    }
    if (problems.length === 0) return { ...base, status: 'pass', problems };
    const deviations = manifest.knownDeviations
      .filter((d) => deviationCovers(d, key, widget.path, widget.kind))
      .map((d) => d.id);
    return deviations.length > 0
      ? { ...base, status: 'deviation', problems, deviations }
      : { ...base, status: 'fail', problems };
  });

  const byStatus = Object.fromEntries(WIDGET_STATUSES.map((s) => [s, 0])) as Record<
    WidgetStatus,
    number
  >;
  let totalCompared = 0;
  let totalWithin = 0;
  let totalSum = 0;
  let totalPartial = 0;
  let totalMasked = 0;
  let totalUnstable = 0;
  results.forEach((result, i) => {
    byStatus[result.status]++;
    if (result.status !== 'pass' && result.status !== 'fail' && result.status !== 'deviation') {
      return;
    }
    totalCompared += result.pixels.compared;
    totalWithin += result.pixels.within;
    totalSum += sum[i] ?? 0;
    totalPartial += result.pixels.partial;
    totalMasked += result.pixels.masked;
    totalUnstable += result.pixels.unstable;
  });

  const found = findView(manifest, key.view);
  const gate = manifest.playsets.find((p) => p.id === key.playset)?.gate ?? 'report';
  return {
    comparison: {
      playset: key.playset,
      resolution: resolutionKey(key.resolution),
      view: key.view,
      window: found?.window.id ?? '',
      gate,
      passed: plan.problems.length === 0 && byStatus.fail === 0,
      problems: plan.problems,
      widgets: results,
      totals: {
        widgets: byStatus,
        pixels: {
          compared: totalCompared,
          within: totalWithin,
          meanDifference: totalCompared === 0 ? 0 : totalSum / totalCompared,
          partial: totalPartial,
          masked: totalMasked,
          unstable: totalUnstable,
        },
      },
    },
    map: { width, height, classes, differences },
  };
}

/**
 * A picture of a comparison for finding what differs: the screenshot dimmed in grey where nothing
 * was compared, blue where it was masked, light grey where the render matches and red, brighter
 * the larger the difference, where it does not.
 */
export function differenceImage(map: PixelMap, screenshot: RgbaImage): RgbaImage {
  const data = new Uint8Array(map.width * map.height * 4);
  const s = screenshot.data;
  for (let p = 0; p < map.width * map.height; p++) {
    const o = p * 4;
    const grey = ((s[o] ?? 0) * 77 + (s[o + 1] ?? 0) * 150 + (s[o + 2] ?? 0) * 29) >> 8;
    let rgb: readonly [number, number, number];
    switch (map.classes[p]) {
      case PIXEL.partial:
        rgb = [grey >> 2, grey >> 2, 64 + (grey >> 2)];
        break;
      case PIXEL.masked:
        rgb = [grey >> 2, grey >> 2, 112 + (grey >> 2)];
        break;
      case PIXEL.equal:
        rgb = [grey >> 1, 64 + (grey >> 2), grey >> 1];
        break;
      case PIXEL.different:
        rgb = [Math.min(255, 128 + (map.differences[p] ?? 0)), 0, 0];
        break;
      default:
        rgb = [grey >> 2, grey >> 2, grey >> 2];
    }
    data.set(rgb, o);
    data[o + 3] = 255;
  }
  return { width: map.width, height: map.height, data };
}

function childrenOf(layout: WindowLayout): number[][] {
  const children: number[][] = layout.widgets.map(() => []);
  layout.widgets.forEach((w, i) => {
    if (w.parent >= 0) children[w.parent]?.push(i);
  });
  return children;
}

/** The path step of a laid-out widget among its siblings, as Tongs would write it. */
function layoutStep(
  layout: WindowLayout,
  siblings: readonly number[],
  position: number,
  name: string,
): string {
  if (name === '' || /[\s/[\]*?"]/.test(name)) return `[${String(position + 1)}]`;
  const same = siblings.filter(
    (s) => (layout.widgets[s]?.widget.name ?? '').toLowerCase() === name.toLowerCase(),
  );
  if (same.length < 2) return name;
  const at = siblings[position];
  return `${name}[${String(same.findIndex((s) => s === at) + 1)}]`;
}

/** The laid-out widget a root's path names, or why there is none. */
function findRoot(
  windows: readonly PlanWindow[],
  children: readonly (readonly number[][])[],
  path: string,
): { window: number; at: number } | string {
  const steps = splitWidgetPath(path);
  const [first, ...rest] = steps ?? [];
  if (first === undefined) return `"${path}" is not a widget path.`;
  const window = windows.findIndex(
    (w) => (w.layout.widgets[0]?.widget.name ?? '').toLowerCase() === first.name.toLowerCase(),
  );
  if (window < 0) return `The playset defines no window "${first.name}" for the root "${path}".`;
  let at = 0;
  for (const step of rest) {
    const layout = windows[window]?.layout;
    const kids = children[window]?.[at] ?? [];
    const candidates =
      step.name === ''
        ? kids
        : kids.filter(
            (k) =>
              (layout?.widgets[k]?.widget.name ?? '').toLowerCase() === step.name.toLowerCase(),
          );
    const next = candidates[(step.index ?? 1) - 1];
    if (next === undefined) return `The layout has no widget "${path}".`;
    at = next;
  }
  return { window, at };
}

/** A draw moved by an offset: its rect, or each glyph of a text. */
function moveDraw(draw: Draw, by: { x: number; y: number }): Draw {
  if (draw.kind === 'text') return { ...draw, glyphs: moveGlyphs(draw.glyphs, by) };
  const moved = { ...draw, x: draw.x + by.x, y: draw.y + by.y };
  if (moved.kind !== 'sprite' || moved.text === undefined) return moved;
  return { ...moved, text: { ...moved.text, glyphs: moveGlyphs(moved.text.glyphs, by) } };
}

function moveGlyphs(glyphs: readonly number[], by: { x: number; y: number }): number[] {
  const moved = [...glyphs];
  for (let i = 0; i + 1 < moved.length; i += GLYPH_STRIDE) {
    moved[i] = (moved[i] ?? 0) + by.x;
    moved[i + 1] = (moved[i + 1] ?? 0) + by.y;
  }
  return moved;
}

function remapTextures(draw: Draw, remap: readonly number[]): Draw {
  const t = (index: number): number => remap[index] ?? index;
  switch (draw.kind) {
    case 'sprite':
      return draw.text === undefined
        ? { ...draw, texture: t(draw.texture) }
        : {
            ...draw,
            texture: t(draw.texture),
            text: { ...draw.text, texture: t(draw.text.texture) },
          };
    case 'text':
      return { ...draw, texture: t(draw.texture) };
    case 'masked':
      return { ...draw, texture: t(draw.texture), mask: t(draw.mask) };
    case 'progress': {
      const fill = (f: typeof draw.first): typeof draw.first =>
        'texture' in f ? { texture: t(f.texture) } : f;
      return { ...draw, first: fill(draw.first), second: fill(draw.second) };
    }
  }
}

function showRect(rect: WidgetRect): string {
  const n = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  return `(${n(rect.x)}, ${n(rect.y)}) ${n(rect.w)}×${n(rect.h)}`;
}

function percent(share: number): string {
  return `${(Math.floor(share * 10000) / 100).toFixed(2)} %`;
}
