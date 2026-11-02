// The edit of a clip (etch-website docs/spec.md section 8.6): what the composition in `motion/`
// renders, built from a take's masters and the events it logged. A clip is a list of segments cut
// one after another; a segment shows one or more panels, each a part of one source (a master) moved
// by a camera, with key captions and highlights over them. Times are seconds; rects are pixels of a
// source, or of the 1920 × 1080 output for a panel's frame. Nothing here depends on Remotion, so the
// edits are built and tested in Node and the composition only draws them.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The output frame of every clip. */
export const OUTPUT = { width: 1920, height: 1080, fps: 30 } as const;
export const FULL_FRAME: Rect = { x: 0, y: 0, w: OUTPUT.width, h: OUTPUT.height };

/** A master, as the composition loads it: a file of its public folder. */
export interface Source {
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

/** Where a panel is at one moment: its frame in the output, the part of its source it shows. */
export interface PanelState {
  readonly frame: Rect;
  readonly view: Rect;
  readonly opacity: number;
}

/** A panel's state from `at` on; between two keys the state eases from one to the other. */
export interface PanelKey extends PanelState {
  readonly at: number;
}

/** A pointer drawn over a source that was recorded without one (VS Code's master). */
export interface PointerPath {
  /** Source time and position; between two points the pointer moves in a straight line. */
  readonly points: readonly (Point & { readonly t: number })[];
  /** Source times of clicks. */
  readonly clicks: readonly number[];
}

export interface Panel {
  readonly source: string;
  /** The source time shown at the segment's start. */
  readonly start: number;
  readonly keys: readonly PanelKey[];
  readonly pointer?: PointerPath;
}

/** A caption over the output: keys pressed (`['Ctrl', 'S']`) and/or a line of text. */
export interface Caption {
  readonly from: number;
  readonly to: number;
  readonly keys?: readonly string[];
  readonly text?: string;
}

/** A ring around a rect of a panel's source, following its camera. */
export interface Highlight {
  readonly from: number;
  readonly to: number;
  readonly panel: number;
  readonly rect: Rect;
}

export interface Segment {
  readonly duration: number;
  readonly panels: readonly Panel[];
  readonly captions: readonly Caption[];
  readonly highlights: readonly Highlight[];
}

export interface EditSpec {
  readonly id: string;
  readonly sources: Readonly<Record<string, Source>>;
  readonly segments: readonly Segment[];
  /** The clip's core, in clip time: the part the hero's trailer takes from it. */
  readonly core?: { readonly from: number; readonly to: number };
  /**
   * Seconds over which the clip's end dissolves into its first frame: for a take whose end state
   * differs from its start (the editor moved by a pick), so the loop still has no jump.
   */
  readonly loopFade?: number;
}

/** How long the clip lasts, in seconds and in output frames. */
export function editLength(spec: EditSpec): { seconds: number; frames: number } {
  const frames = spec.segments.reduce(
    (sum, segment) => sum + Math.round(segment.duration * OUTPUT.fps),
    0,
  );
  return { seconds: frames / OUTPUT.fps, frames };
}

/** Ease in and out (cubic): slow off the mark, slow into place. */
export function ease(p: number): number {
  const c = Math.min(1, Math.max(0, p));
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
}

const mix = (a: number, b: number, p: number): number => a + (b - a) * p;

export function mixRect(a: Rect, b: Rect, p: number): Rect {
  return { x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), w: mix(a.w, b.w, p), h: mix(a.h, b.h, p) };
}

/** A panel's state at segment time `t`: its last key's, or eased between the keys around `t`. */
export function panelState(panel: Panel, t: number): PanelState {
  const keys = panel.keys;
  const first = keys[0];
  if (first === undefined) throw new Error(`a panel of ${panel.source} has no keys`);
  let state: PanelState = first;
  for (let i = 1; i < keys.length; i++) {
    const before = keys[i - 1] as PanelKey;
    const key = keys[i] as PanelKey;
    if (t >= key.at) {
      state = key;
      continue;
    }
    if (t > before.at) {
      const p = ease((t - before.at) / (key.at - before.at));
      state = {
        frame: mixRect(before.frame, key.frame, p),
        view: mixRect(before.view, key.view, p),
        opacity: mix(before.opacity, key.opacity, p),
      };
    }
    break;
  }
  return state;
}

/** Where a point of the source is drawn in the output, and how much the panel scales it. */
export function toOutput(state: PanelState, point: Point): Point & { scale: number } {
  const scale = state.frame.w / state.view.w;
  return {
    x: state.frame.x + (point.x - state.view.x) * scale,
    y: state.frame.y + (point.y - state.view.y) * scale,
    scale,
  };
}

/** The pointer's position at source time `t`, or undefined before its first point. */
export function pointerAt(path: PointerPath, t: number): Point | undefined {
  const points = path.points;
  const first = points[0];
  if (first === undefined || t < first.t) return undefined;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Point & { t: number };
    const b = points[i] as Point & { t: number };
    if (t < b.t) {
      const p = (t - a.t) / (b.t - a.t);
      return { x: mix(a.x, b.x, p), y: mix(a.y, b.y, p) };
    }
  }
  return points[points.length - 1];
}

/**
 * The part of a `source` to show in a frame of `aspect` (width / height) so that `rect` is in view
 * with `margin` around it: never narrower than `minWidth` (the deepest zoom), never past the
 * source's edges, centred on the rect where it can be.
 */
export function focus(
  rect: Rect,
  source: { width: number; height: number },
  aspect: number,
  options: { margin?: number; minWidth?: number } = {},
): Rect {
  const margin = options.margin ?? 80;
  let w = Math.max(rect.w + 2 * margin, (rect.h + 2 * margin) * aspect, options.minWidth ?? 0);
  w = Math.min(w, source.width, source.height * aspect);
  const h = w / aspect;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const x = Math.min(Math.max(cx - w / 2, 0), source.width - w);
  const y = Math.min(Math.max(cy - h / 2, 0), source.height - h);
  return { x, y, w, h };
}

/** The whole source in a frame of `aspect`, cropped at its bottom or right edge if it must be. */
export function whole(source: { width: number; height: number }, aspect: number): Rect {
  const w = Math.min(source.width, source.height * aspect);
  return { x: 0, y: 0, w, h: w / aspect };
}

/** The smallest rect around all of `rects`. */
export function union(...rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** How long a camera move takes, unless a step says otherwise. */
export const MOVE = 0.8;

/**
 * Builds a panel's keys from camera steps: from `at`, the panel moves to its new frame and view
 * over `move` seconds and stays there until the next step. The first step places it at once.
 */
export function cameraKeys(
  steps: readonly { at: number; frame?: Rect; view: Rect; opacity?: number; move?: number }[],
): PanelKey[] {
  const keys: PanelKey[] = [];
  let current: PanelState | undefined;
  for (const step of steps) {
    const next: PanelState = {
      frame: step.frame ?? current?.frame ?? FULL_FRAME,
      view: step.view,
      opacity: step.opacity ?? current?.opacity ?? 1,
    };
    if (current === undefined) keys.push({ at: step.at, ...next });
    else {
      keys.push({ at: step.at, ...current });
      keys.push({ at: step.at + (step.move ?? MOVE), ...next });
    }
    current = next;
  }
  return keys;
}
