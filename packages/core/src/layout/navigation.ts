/**
 * Navigation over a laid-out window (spec section 2, "Widget outline and navigation"): which
 * widget is under a point of the preview, and the path and rect hovering it shows. Offsets are
 * game text offsets, as the model and the draw list's `source` give them.
 */
import type { Widget } from '../model/gui.ts';
import type { LaidOutWidget } from './window.ts';

/** A widget's name, or its kind in angle brackets when it has none. */
export function widgetLabel(widget: Widget): string {
  return widget.name ?? `<${widget.kind}>`;
}

/**
 * The index in `widgets` (paint order) of the widget drawn on top at a point of the screen: the
 * last whose rect holds it, its right and bottom edges excluded. −1 when none does.
 */
export function widgetAt(widgets: readonly LaidOutWidget[], x: number, y: number): number {
  for (let i = widgets.length - 1; i >= 0; i--) {
    const { x: left, y: top, width, height } = widgets[i] as LaidOutWidget;
    if (x >= left && y >= top && x < left + width && y < top + height) return i;
  }
  return -1;
}

/** The laid-out widgets from the window down to the one at `index`. */
export function laidOutPath(
  widgets: readonly LaidOutWidget[],
  index: number,
): readonly LaidOutWidget[] {
  const path: LaidOutWidget[] = [];
  for (let i = index; i >= 0;) {
    const entry = widgets[i];
    if (entry === undefined) break;
    path.unshift(entry);
    i = entry.parent;
  }
  return path;
}

/** The text hovering a widget shows: its path from the window, then its rect on the screen. */
export function widgetHoverText(widgets: readonly LaidOutWidget[], index: number): string {
  const path = laidOutPath(widgets, index);
  const entry = path.at(-1);
  if (entry === undefined) return '';
  const names = path.map((step) => widgetLabel(step.widget)).join(' › ');
  const rect = [entry.x, entry.y].join(', ') + `, ${[entry.width, entry.height].join(' × ')}`;
  return `${names}\n${entry.widget.kind} at ${rect}`;
}

/**
 * The index of a widget in a layout, by its source offset (`widget.node.start`, a draw's
 * `source`); −1 when the layout has none there. Layout places each widget once.
 */
export function laidOutIndexOf(widgets: readonly LaidOutWidget[], source: number): number {
  return widgets.findIndex((entry) => entry.widget.node.start === source);
}
