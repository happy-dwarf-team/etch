// The window list under the preview's title and the rect Fit window fits (etch#648, finding
// P1.3). Pure functions of the parsed file and the layout, so that they are unit-tested.

import {
  widgetProperties,
  type DrawRect,
  type GuiFile,
  type LaidOutWidget,
  type Screen,
} from '@etch/core';
import type { WindowEntry } from './protocol.ts';

/**
 * The file's windows as the list shows them: each top-level definition with its `size` on the
 * screen (a percentage counts from the screen, as for a window the game puts on it) and the line
 * it starts on. `lineOf` gives the line, from 1, of an offset in the game text.
 */
export function windowEntries(
  file: GuiFile,
  screen: Screen,
  lineOf: (offset: number) => number,
): WindowEntry[] {
  return file.definitions.map((widget, index) => {
    const size = widgetProperties(widget, file.constants, screen).size('size');
    const width = size?.width.percent ? (screen.width * size.width.value) / 100 : size?.width.value;
    const height = size?.height.percent
      ? (screen.height * size.height.value) / 100
      : size?.height.value;
    return {
      index,
      label: widget.name ?? widget.kind,
      ...(width === undefined || height === undefined
        ? {}
        : { size: { width: Math.round(width), height: Math.round(height) } }),
      line: lineOf(widget.node.start),
    };
  });
}

/**
 * The rect Fit window fits: the window's own, or, for a window without a size of its own (many
 * hold their widgets in a `size = { 0 0 }` window), the box around the widgets it lays out.
 * `undefined` when nothing of it has a size.
 */
export function fitRect(widgets: readonly LaidOutWidget[]): DrawRect | undefined {
  const root = widgets[0];
  if (root === undefined) return undefined;
  if (root.width >= 1 && root.height >= 1) return rectOf(root);
  let box: { left: number; top: number; right: number; bottom: number } | undefined;
  for (const widget of widgets.slice(1)) {
    if (widget.width < 1 || widget.height < 1) continue;
    const right = widget.x + widget.width;
    const bottom = widget.y + widget.height;
    box =
      box === undefined
        ? { left: widget.x, top: widget.y, right, bottom }
        : {
            left: Math.min(box.left, widget.x),
            top: Math.min(box.top, widget.y),
            right: Math.max(box.right, right),
            bottom: Math.max(box.bottom, bottom),
          };
  }
  return box === undefined
    ? undefined
    : { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
}

function rectOf(rect: DrawRect): DrawRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
