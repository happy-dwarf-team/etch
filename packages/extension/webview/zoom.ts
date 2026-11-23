// The preview's zoom (etch#162): where the canvas goes in the panel and how big it is, from the
// zoom the user chose. It changes only how the painted screen is shown, never the resolution the
// window is laid out at. Pure functions of sizes in CSS pixels; webview/main.ts applies them.

import type { Point, Zoom } from '../src/preview/protocol.ts';
import type { DrawRect } from '@etch/core/draw-list';

/** The preview screen, in its pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** The panel the canvas is shown in: its size and its place in the page, in CSS pixels. */
export interface Panel extends Size {
  readonly left: number;
  readonly top: number;
}

/** Where the canvas goes, in CSS pixels from the panel's corner, and the scale it is shown at. */
export interface Placement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Monitor pixels per pixel of the screen. */
  readonly scale: number;
  /** The screen's point in the middle of the panel, once panning is held at the edges. */
  readonly center: Point;
}

/** Fits the whole screen (Fit screen in the interface preview, Fit in the texture preview). */
export const FIT: Zoom = { fit: true };

/**
 * Fits the previewed window into the panel, the interface preview's default (etch#648, finding
 * P1.3): a small window shows at 100 % in the middle, not in a corner of a fitted screen.
 */
export const FIT_WINDOW: Zoom = { fit: true, window: true };

/**
 * The scales `+` and `-` step through. Above 100 % only whole ones, so that every pixel of the
 * screen covers the same number of monitor pixels and stays sharp.
 */
export const STEPS: readonly number[] = [0.125, 0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1, 2, 3, 4, 6, 8];

/** The space fitting leaves around the screen, in CSS pixels. */
export const MARGIN = 8;

const EPSILON = 1e-6;

/** The scale that shows the whole screen in the panel, never above 100 %. */
export function fitScale(screen: Size, panel: Size, ratio: number): number {
  const width = Math.max(1, panel.width - 2 * MARGIN);
  const height = Math.max(1, panel.height - 2 * MARGIN);
  return Math.min(1, (width * ratio) / screen.width, (height * ratio) / screen.height);
}

/**
 * Places the screen in the panel: centred on an axis where it fits, else with `center` in the
 * middle but never panned past an edge. Its corner lands on a monitor pixel. `ratio` is the
 * page's device pixel ratio. Fit window fits `window` (a rect of the screen) instead and puts its
 * middle in the panel's, the screen around it wherever that takes it; without a part of the
 * window on the screen it fits the screen.
 */
export function place(
  zoom: Zoom,
  screen: Size,
  panel: Panel,
  ratio: number,
  window?: DrawRect,
): Placement {
  const target = zoom.fit && zoom.window === true ? onScreen(screen, window) : undefined;
  if (target !== undefined) {
    const scale = fitScale(target, panel, ratio);
    const css = scale / ratio;
    const center = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    return {
      left: snap(panel.width / 2 - center.x * css, panel.left, ratio),
      top: snap(panel.height / 2 - center.y * css, panel.top, ratio),
      width: screen.width * css,
      height: screen.height * css,
      scale,
      center,
    };
  }
  const scale = zoom.fit ? fitScale(screen, panel, ratio) : zoom.scale;
  const css = scale / ratio;
  const width = screen.width * css;
  const height = screen.height * css;
  const center = zoom.fit ? { x: screen.width / 2, y: screen.height / 2 } : zoom.center;
  const left = snap(start(panel.width, width, center.x * css), panel.left, ratio);
  const top = snap(start(panel.height, height, center.y * css), panel.top, ratio);
  return {
    left,
    top,
    width,
    height,
    scale,
    center: {
      x: clamp((panel.width / 2 - left) / css, 0, screen.width),
      y: clamp((panel.height / 2 - top) / css, 0, screen.height),
    },
  };
}

/** The part of a rect on the screen, or `undefined` when less than a pixel of it is. */
export function onScreen(screen: Size, rect: DrawRect | undefined): DrawRect | undefined {
  if (rect === undefined) return undefined;
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const width = Math.min(screen.width, rect.x + rect.width) - x;
  const height = Math.min(screen.height, rect.y + rect.height) - y;
  return width >= 1 && height >= 1 ? { x, y, width, height } : undefined;
}

/** Where the screen starts on one axis of the panel. */
function start(panel: number, size: number, center: number): number {
  if (size <= panel) return (panel - size) / 2;
  return clamp(panel / 2 - center, panel - size, 0);
}

/** A position in the panel moved to the nearest monitor pixel of the page. */
function snap(position: number, origin: number, ratio: number): number {
  return Math.round((origin + position) * ratio) / ratio - origin;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The next step above (`1`) or below (`-1`) a scale, or the last step that way. */
export function step(scale: number, direction: 1 | -1): number {
  if (direction > 0) return STEPS.find((s) => s > scale * (1 + EPSILON)) ?? STEPS.at(-1) ?? 1;
  return STEPS.findLast((s) => s < scale * (1 - EPSILON)) ?? STEPS[0] ?? 1;
}

/** How far the wheel turns for one step of zoom, in pixels: one notch of a mouse wheel. */
export const WHEEL_STEP = 100;

/** A wheel event's distance in pixels, whatever unit it came in (`WheelEvent.deltaMode`). */
export function wheelPixels(delta: number, mode: number): number {
  return delta * (mode === 1 ? 40 : mode === 2 ? 800 : 1);
}

/**
 * Adds a Ctrl+wheel distance to what is left of the earlier ones, and gives the zoom steps it
 * makes (positive in, negative out) and what is left. A touchpad's pinch comes as many small
 * events; turning the other way drops what was left.
 */
export function wheelDelta(left: number, pixels: number): { steps: number; left: number } {
  const total = Math.sign(pixels) === Math.sign(left) ? left + pixels : pixels;
  const steps = Math.trunc(total / WHEEL_STEP);
  return { steps: steps === 0 ? 0 : -steps, left: total - steps * WHEEL_STEP };
}

/** Zooms to `scale`, keeping the screen's point under `anchor` (a point of the panel) there. */
export function zoomAround(
  placement: Placement,
  scale: number,
  anchor: Point,
  panel: Size,
  ratio: number,
): Zoom {
  const point = screenPoint(placement, anchor, ratio);
  const css = scale / ratio;
  return {
    fit: false,
    scale,
    center: {
      x: point.x + (panel.width / 2 - anchor.x) / css,
      y: point.y + (panel.height / 2 - anchor.y) / css,
    },
  };
}

/** Pans by a distance in CSS pixels, the way a drag moves the screen. Fitting does not pan. */
export function pan(zoom: Zoom, placement: Placement, dx: number, dy: number, ratio: number): Zoom {
  if (zoom.fit) return zoom;
  const css = placement.scale / ratio;
  return {
    fit: false,
    scale: zoom.scale,
    center: { x: placement.center.x - dx / css, y: placement.center.y - dy / css },
  };
}

/** Whether the screen is larger than the panel on an axis, so that it can be panned. */
export function pannable(placement: Placement, panel: Size): boolean {
  return placement.width > panel.width + EPSILON || placement.height > panel.height + EPSILON;
}

/** The screen's point (in its pixels, not checked against its size) at a point of the panel. */
export function screenPoint(placement: Placement, point: Point, ratio: number): Point {
  const css = placement.scale / ratio;
  return { x: (point.x - placement.left) / css, y: (point.y - placement.top) / css };
}

/** A rect of the screen as a rect of the panel, in CSS pixels. */
export function panelRect(placement: Placement, rect: DrawRect, ratio: number): DrawRect {
  const css = placement.scale / ratio;
  return {
    x: placement.left + rect.x * css,
    y: placement.top + rect.y * css,
    width: rect.width * css,
    height: rect.height * css,
  };
}

/**
 * A zoom that brings a rect of the screen into view when it is not wholly in the panel: its
 * centre in the middle, at the same scale. `undefined` when it is in view or the zoom fits.
 */
export function reveal(
  zoom: Zoom,
  placement: Placement,
  rect: DrawRect,
  panel: Size,
  ratio: number,
): Zoom | undefined {
  if (zoom.fit) return undefined;
  const shown = panelRect(placement, rect, ratio);
  const inside =
    shown.x >= -EPSILON &&
    shown.y >= -EPSILON &&
    shown.x + shown.width <= panel.width + EPSILON &&
    shown.y + shown.height <= panel.height + EPSILON;
  if (inside) return undefined;
  return {
    fit: false,
    scale: zoom.scale,
    center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
  };
}

/**
 * The toolbar's label: `Fit · 47 %`, `200 %`, or `Fit` before anything is shown. `fit` names the
 * fitting zoom: the interface preview says `Fit window` and `Fit screen`.
 */
export function zoomLabel(zoom: Zoom, shown: number | undefined, fit = 'Fit'): string {
  const scale = zoom.fit ? shown : zoom.scale;
  if (scale === undefined) return fit;
  const percent = `${String(Math.round(scale * 100))} %`;
  return zoom.fit ? `${fit} · ${percent}` : percent;
}

/** A zoom the webview kept, checked: it comes back from VS Code's storage. */
export function zoomOf(state: unknown): Zoom | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const { fit, window, scale, center } = state as Record<string, unknown>;
  if (fit === true) return window === true ? FIT_WINDOW : FIT;
  if (fit !== false || typeof scale !== 'number' || typeof center !== 'object') return undefined;
  if (center === null || !(scale >= (STEPS[0] ?? 0) && scale <= (STEPS.at(-1) ?? 0))) {
    return undefined;
  }
  const { x, y } = center as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x + y)) return undefined;
  return { fit: false, scale, center: { x, y } };
}

/** What each zoom key does in one view (webview/zoom-keys.ts listens for them). */
export interface ZoomKeys {
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  /** Ctrl+0: 100 %. */
  readonly actualSize: () => void;
  /** Ctrl+Shift+0: fit the view. */
  readonly fit: () => void;
}

/** The modifiers and the key of a key press, as a `KeyboardEvent` has them. */
export interface KeyPress {
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  /** The key's place on the keyboard, so that Shift and the layout do not change it. */
  readonly code: string;
}

/**
 * The zoom action of a key press, the same in the three previews (etch#648, finding P2.6), or
 * `undefined` for a key that is not a zoom key.
 */
export function zoomKey(event: KeyPress): keyof ZoomKeys | undefined {
  if (!event.ctrlKey || event.altKey || event.metaKey) return undefined;
  switch (event.code) {
    case 'Equal':
    case 'NumpadAdd':
      return 'zoomIn';
    case 'Minus':
    case 'NumpadSubtract':
      return 'zoomOut';
    case 'Digit0':
    case 'Numpad0':
      return event.shiftKey ? 'fit' : 'actualSize';
    default:
      return undefined;
  }
}
