// The zoom keys, the same in all three previews (etch#648, finding P2.6): Ctrl+= (or Ctrl and the
// keypad's +) zooms in, Ctrl+- out, Ctrl+0 shows 100 % and Ctrl+Shift+0 fits the view. The keys
// are kept from VS Code, whose own zoom of the window would otherwise take them. Which key does
// what is `zoomKey` in zoom.ts, which the unit tests read without a page.

import { zoomKey, type ZoomKeys } from './zoom.ts';

/** Listens for the zoom keys anywhere in the page, before its controls see them. */
export function listenForZoomKeys(keys: ZoomKeys): void {
  window.addEventListener(
    'keydown',
    (event) => {
      const action = zoomKey(event);
      if (action === undefined) return;
      keys[action]();
      event.preventDefault();
      event.stopPropagation();
    },
    { capture: true },
  );
}
