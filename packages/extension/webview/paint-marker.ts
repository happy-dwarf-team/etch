// The paint marker (happy-dwarf-team/.github#23): after each `draw`, the webview writes onto
// `canvas#screen` which paint the canvas shows and how it ended, so that Etch's own tools (the
// media capture script, packages/media) can wait for a paint from outside the extension host.
// Unstable: meant for Etch's own tools only, and it may change with any release. It carries no
// file or window name, and nothing leaves the machine.

/** How a `draw` ended. */
export type PaintResult =
  /** Painted, every texture loaded. */
  | 'ok'
  /** Painted, with texture problems. */
  | 'problems'
  /** Not painted: a later draw arrived first, or there was nothing to draw. */
  | 'blank'
  /** No WebGL2 context, or the paint threw. */
  | 'failed';

/** The element the marker is written on; `canvas#screen` in the webview. */
export interface PaintMarked {
  setAttribute(name: string, value: string): void;
}

/** The result of a paint that did not throw. */
export function paintResult(painted: boolean, problems: number): PaintResult {
  if (!painted) return 'blank';
  return problems > 0 ? 'problems' : 'ok';
}

/** Marks `canvas` with the draw's `id` (`PreviewPaint.id` in `onDidPaint`) and its result. */
export function markPaint(canvas: PaintMarked, id: number, result: PaintResult): void {
  canvas.setAttribute('data-paint-id', String(id));
  canvas.setAttribute('data-paint-result', result);
}
