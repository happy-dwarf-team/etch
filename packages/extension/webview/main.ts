// The preview webview's script (bundled to dist/webview.js): draws each draw list the extension
// host posts with `@etch/renderer`, fetching textures through webview URIs (ADR 0001), marks each
// paint on the canvas for Etch's own tools (paint-marker.ts), shows the painted screen at the
// zoom the user chose (zoom.ts, etch#162), and shows the toolbar, the window list under the
// title (etch#648, finding P1.3), its menus (`View ▾`, spec section 4; `Data ▾`, section 5) and
// the notices and links the host describes.

import { Painter, createContext, readPixels } from '@etch/renderer';
import type { DrawRect } from '@etch/core/draw-list';
import type {
  DataAction,
  DataMenu,
  HostMessage,
  Point,
  TextLengthName,
  ViewAction,
  ViewMenu,
  ViewState,
  WebviewMessage,
  WebviewState,
  Zoom,
} from '../src/preview/protocol.ts';
import { markPaint, paintResult } from './paint-marker.ts';
import { listenForZoomKeys } from './zoom-keys.ts';
import { attachMenu, SEPARATOR, type MenuHeading, type MenuItem } from './menu.ts';
import { attachPopover } from './popover.ts';
import {
  FIT,
  FIT_WINDOW,
  type Panel,
  type Placement,
  pan,
  pannable,
  panelRect,
  place,
  reveal,
  screenPoint,
  step,
  wheelDelta,
  wheelPixels,
  zoomAround,
  zoomLabel,
  zoomOf,
} from './zoom.ts';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: WebviewState): void;
};

const vscode = acquireVsCodeApi();
const post = (message: WebviewMessage): void => {
  vscode.postMessage(message);
};

function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`the page has no #${id}`);
  return found;
}

const canvas = element('screen', HTMLCanvasElement);
const stage = element('stage', HTMLElement);
const zoomOut = element('zoom-out', HTMLButtonElement);
const zoomLevel = element('zoom-level', HTMLButtonElement);
const zoomIn = element('zoom-in', HTMLButtonElement);
/** The sizes in the zoom's menu, after Fit. */
const PREVIEW_SIZES = [0.5, 1, 2, 4] as const;
const title = element('title', HTMLButtonElement);
const pinnedBadge = element('pinned', HTMLSpanElement);
const windowsPop = element('windows-pop', HTMLDivElement);
const windowFilter = element('window-filter', HTMLInputElement);
const windowList = element('window-list', HTMLDivElement);
const file = element('file', HTMLSpanElement);
const notices = element('notices', HTMLUListElement);
const resolution = element('resolution', HTMLButtonElement);
const liveGame = element('live-game', HTMLButtonElement);
const viewButton = element('view-menu', HTMLButtonElement);
const viewPopup = element('view-popup', HTMLDivElement);
const dataButton = element('data-menu', HTMLButtonElement);
const dataPop = element('data-pop', HTMLDivElement);
const dataBody = element('data-body', HTMLDivElement);
const selectorsPop = element('selectors-pop', HTMLDivElement);
const selectorsBody = element('selectors-body', HTMLDivElement);
const hoverBox = element('hover', HTMLDivElement);
const selectedBox = element('selected', HTMLDivElement);
const tip = element('tip', HTMLDivElement);
const selectedLabel = element('selected-label', HTMLDivElement);
const busy = element('busy', HTMLDivElement);
const busyText = element('busy-text', HTMLSpanElement);

let painter: Painter | undefined;
let failure: string | undefined;
try {
  painter = new Painter(createContext(canvas));
} catch (error) {
  failure = messageOf(error);
}
let state: ViewState | undefined;
let overlay: Extract<HostMessage, { type: 'overlay' }> | undefined;
/** The pointer over the canvas, in the page's pixels. */
let pointer: { x: number; y: number } | undefined;
let pointerFrame = 0;
/** The panel's state as VS Code keeps it: the host's memento and the zoom. */
let kept: WebviewState = keptState(vscode.getState());
let zoom: Zoom = kept.zoom ?? FIT_WINDOW;
/** The previewed window's rect on the screen, which Fit window fits. */
let windowRect: DrawRect | undefined;
/** Where the canvas is shown, once something is painted. */
let placement: Placement | undefined;
window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  void receive(event.data);
});

// The window list (etch#648, finding P1.3): the title opens it, with a filter over the file's
// windows. Choosing one pins it; Follow the cursor unpins.
attachPopover(title, windowsPop);
title.addEventListener('click', () => {
  if (windowsPop.hidden) return;
  windowFilter.value = '';
  showWindowList();
});
windowFilter.addEventListener('input', () => {
  showWindowList();
});
windowFilter.addEventListener('keydown', (event) => {
  const options = [...windowList.querySelectorAll<HTMLButtonElement>('button.item')];
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    options[0]?.focus();
  } else if (event.key === 'Enter') {
    // The first window that matches; Follow the cursor is not one.
    event.preventDefault();
    options.find((option) => option.dataset['window'] !== undefined)?.click();
  }
});
windowList.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const options = [...windowList.querySelectorAll<HTMLButtonElement>('button.item')];
  const at = options.indexOf(document.activeElement as HTMLButtonElement);
  event.preventDefault();
  const next = at + (event.key === 'ArrowDown' ? 1 : -1);
  if (next < 0) windowFilter.focus();
  else options[Math.min(next, options.length - 1)]?.focus();
});

/** Opens the window list, or closes it after a choice (the focus goes back to the title). */
function toggleWindowList(open: boolean): void {
  if (windowsPop.hidden === open) title.click();
}

/** Fills the window list: Follow the cursor, then the file's windows that match the filter. */
function showWindowList(): void {
  const windows = state?.windows ?? [];
  const pinned = state?.pinned === true;
  const filter = windowFilter.value.trim().toLowerCase();
  const shown =
    filter === '' ? windows : windows.filter((w) => w.label.toLowerCase().includes(filter));
  const name = state?.file.split('/').pop() ?? '';
  windowFilter.placeholder = `Filter the ${String(windows.length)} ${
    windows.length === 1 ? 'window' : 'windows'
  } of ${name}`;
  const option = (
    label: string,
    aside: string,
    selected: boolean,
    pick: () => void,
    sub?: string,
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(selected));
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.textContent = label;
    const side = document.createElement('span');
    side.className = 'aside';
    side.textContent = aside;
    button.append(mark, text, side);
    if (sub !== undefined) {
      const detail = document.createElement('span');
      detail.className = 'sub';
      detail.textContent = sub;
      button.append(detail);
    }
    button.addEventListener('click', () => {
      pick();
      toggleWindowList(false);
    });
    return button;
  };
  const head = document.createElement('div');
  head.className = 'head';
  head.setAttribute('role', 'presentation');
  head.textContent = `Pin a window of ${name}`;
  const children: HTMLElement[] = [
    option(
      'Follow the cursor',
      pinned ? '' : 'now',
      !pinned,
      () => {
        post({ type: 'pin', pinned: false });
      },
      "The window around the cursor in the editor; with the cursor in none, the last one shown or the file's first.",
    ),
    head,
  ];
  for (const window of shown) {
    const size =
      window.size === undefined
        ? ''
        : `${String(window.size.width)} × ${String(window.size.height)} · `;
    const item = option(
      window.label,
      `${size}line ${String(window.line)}`,
      pinned && window.index === state?.window,
      () => {
        post({ type: 'pinWindow', index: window.index });
      },
    );
    item.dataset['window'] = String(window.index);
    children.push(item);
  }
  if (shown.length === 0) {
    const none = document.createElement('div');
    none.className = 'none';
    none.textContent = windows.length === 0 ? 'The file has no window.' : 'No window matches.';
    children.push(none);
  }
  windowList.replaceChildren(...children);
}

resolution.addEventListener('click', () => {
  post({ type: 'resolution' });
});

liveGame.addEventListener('click', () => {
  post({ type: 'startLiveGame' });
});

// `View` is a menu of the views and the commands (etch#648, finding P3.16): the arrow keys move
// in it and Esc gives the focus back to its button. Its forms are dialogs: Selectors… opens one
// under View, and `Data` opens the sample data's.
const selectorsPopover = attachPopover(viewButton, selectorsPop, { opensOnClick: false });
const dataPopover = attachPopover(dataButton, dataPop);

attachMenu(viewButton, viewPopup, () => {
  const menu = state?.menu;
  if (menu === undefined) return [];
  const items: (MenuItem | MenuHeading | typeof SEPARATOR)[] = [];
  if (menu.views.length > 0) {
    items.push({ heading: 'Views' });
    for (const view of menu.views) {
      items.push({
        label: view.label,
        ...(view.mine ? { keys: 'yours' } : {}),
        checked: view.current,
        pick: () => {
          viewAction({ kind: 'chooseView', id: view.id });
        },
      });
    }
    items.push(SEPARATOR);
  }
  if (menu.selectors.length > 0) {
    items.push({
      label: 'Selectors…',
      keys: String(menu.selectors.length),
      title: 'The values that choose what the window shows, and where each came from',
      pick: () => {
        selectorsPopover.open();
      },
    });
  }
  if (menu.gameToggles > 0) {
    items.push({
      label: 'Compare with Live Game',
      keys: String(menu.gameToggles),
      title: `The profile differs in ${countOf(menu.gameToggles, 'path')} from the live game, shown as toggles from the game. List in Problems every widget the offline preview places or shows otherwise than the game.`,
      pick: () => {
        dataAction({ kind: 'compareLive' });
      },
    });
  }
  items.push({
    label: 'Save as View…',
    disabled: !menu.canSave,
    title: menu.canSave
      ? "Write these selectors and hand toggles as a view into the mod project's .etch/profiles."
      : 'Save as View writes into a mod project; open a file of a mod.',
    pick: () => {
      viewAction({ kind: 'saveView' });
    },
  });
  if (menu.handToggles > 0) {
    items.push({
      label: 'Reset Hand Toggles',
      keys: String(menu.handToggles),
      title: "Show and hide the widgets by the profile's rules again; the notice can undo it",
      pick: () => {
        viewAction({ kind: 'resetToggles' });
      },
    });
  }
  items.push({
    label: 'Open the Window Profile',
    pick: () => {
      viewAction({ kind: 'openProfile' });
    },
  });
  return items;
});

const dataAction = (action: DataAction): void => {
  post({ type: 'data', action });
};

/** `1 path`, `2 paths`. */
function countOf(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

/** A button of a dialog; `key` finds it again after the dialog is filled anew. */
function dialogButton(
  key: string,
  text: string,
  onClick: () => void,
  title?: string,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.dataset['key'] = key;
  if (title !== undefined) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function textLine(className: string, text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

/**
 * Fills a dialog's body anew from the host's state, keeping the focus on the control with the
 * same `data-key`, or on the dialog's close button when that control is gone.
 */
function refill(body: HTMLElement, pop: HTMLElement, children: readonly Node[]): void {
  const active = document.activeElement;
  const key =
    active instanceof HTMLElement && body.contains(active) ? active.dataset['key'] : undefined;
  body.replaceChildren(...children);
  if (key === undefined) return;
  const again = [...body.querySelectorAll<HTMLElement>('[data-key]')].find(
    (control) => control.dataset['key'] === key && !(control as HTMLButtonElement).disabled,
  );
  (again ?? pop.querySelector<HTMLElement>('[data-close]'))?.focus();
}

const LENGTHS: readonly TextLengthName[] = ['short', 'typical', 'long', 'overflow'];

/**
 * Fills the sample data's dialog (spec section 5): the layers, upper ones winning, each with how
 * many texts it fills; typing a text under the hand layer, the save's choices under its layer,
 * the generated text's length under its own; then the lists the game fills, each with its number
 * of entries.
 */
function showDataMenu(menu: DataMenu | undefined): void {
  dataButton.hidden = menu === undefined;
  if (menu === undefined) {
    dataPopover.close(false);
    dataBody.replaceChildren();
    return;
  }
  dataButton.textContent = menu.label;
  dataButton.title = "Sample data of this window: a save, the playset's files, generated text.";
  const children: HTMLElement[] = [];
  for (const layer of menu.layers) {
    const block = document.createElement('section');
    block.className = 'layer';
    const head = document.createElement('div');
    head.className = 'layer-head';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = layer.on;
    box.disabled = !layer.canToggle;
    box.dataset['key'] = `layer:${layer.id}`;
    box.setAttribute('aria-label', `Use ${layer.label}`);
    box.title = layer.canToggle ? 'Use this layer' : 'This layer is on when it has data';
    box.addEventListener('change', () => {
      dataAction({ kind: 'live', on: box.checked });
    });
    const name = document.createElement('b');
    name.textContent = layer.label;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = countOf(layer.count, 'text');
    head.append(box, name, count);
    block.append(head, textLine('help', layer.detail));
    const actions = document.createElement('div');
    actions.className = 'row';
    if (layer.id === 'hand') {
      actions.append(
        dialogButton(
          'type',
          'Type a Text…',
          () => {
            dataAction({ kind: 'typeText' });
          },
          'Choose a text of the window and type what it shows',
        ),
      );
      if (layer.count > 0) {
        actions.append(
          dialogButton(
            'clear',
            'Clear',
            () => {
              // At once; the notice above the window can undo it, and the focus goes back to
              // the Data button (etch#648, finding P2.20).
              dataPopover.close(true);
              dataAction({ kind: 'clearHand' });
            },
            'Take back every text typed for this window; the notice can undo it',
          ),
        );
      }
    }
    if (layer.id === 'live') {
      if (menu.canRefresh) {
        actions.append(
          dialogButton(
            'refresh',
            'Refresh from Live Game',
            () => {
              dataAction({ kind: 'refreshLive' });
            },
            'Take a live snapshot of this window, which the live game must show',
          ),
        );
      }
      if (menu.canRefresh || layer.count > 0) {
        actions.append(
          dialogButton(
            'compare',
            'Compare with Live Game',
            () => {
              dataAction({ kind: 'compareLive' });
            },
            'List in Problems every widget the offline preview places or shows otherwise than the game',
          ),
        );
      }
    }
    if (layer.id === 'save') {
      actions.append(
        dialogButton('save', menu.save.state === 'none' ? 'Choose a Save…' : 'Other Save…', () => {
          dataAction({ kind: 'chooseSave' });
        }),
      );
      if (menu.save.state === 'ready') {
        actions.append(
          dialogButton(
            'country',
            'Country…',
            () => {
              dataAction({ kind: 'chooseCountry' });
            },
            'The country that plays the player: own and foreign provinces follow from it',
          ),
          dialogButton(
            'province',
            'Province…',
            () => {
              dataAction({ kind: 'chooseProvince' });
            },
            'Any province, own or foreign',
          ),
        );
      }
      if (menu.save.state !== 'none') {
        actions.append(
          dialogButton(
            'drop',
            'Drop',
            () => {
              dataAction({ kind: 'dropSave' });
            },
            'Show no save',
          ),
        );
      }
    }
    if (layer.id === 'generated') {
      const lengths = document.createElement('span');
      lengths.className = 'buttons';
      lengths.setAttribute('role', 'group');
      lengths.setAttribute('aria-label', 'Length of the generated text');
      for (const length of LENGTHS) {
        const b = dialogButton(`length:${length}`, length, () => {
          dataAction({ kind: 'length', length });
        });
        b.setAttribute('aria-pressed', String(length === menu.length));
        lengths.append(b);
      }
      actions.append(lengths);
    }
    if (actions.childElementCount > 0) block.append(actions);
    if (layer.id === 'save' && menu.save.mismatch !== undefined) {
      block.append(textLine('help warning', menu.save.mismatch));
    }
    children.push(block);
  }
  if (menu.lists.length > 0) {
    const lists = document.createElement('div');
    lists.className = 'heading';
    lists.textContent = 'Lists the game fills';
    const grid = document.createElement('div');
    grid.className = 'lists';
    for (const list of menu.lists) {
      const label = document.createElement('span');
      label.textContent = list.label;
      label.title = list.detail;
      const less = dialogButton(
        `less:${list.id}`,
        '−',
        () => {
          dataAction({ kind: 'entries', list: list.id, count: list.count - 1 });
        },
        'One entry fewer',
      );
      less.disabled = list.count === 0;
      less.setAttribute('aria-label', `One entry fewer in ${list.label}`);
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = `${String(list.count)} ${list.count === 1 ? 'entry' : 'entries'}`;
      const more = dialogButton(
        `more:${list.id}`,
        '+',
        () => {
          dataAction({ kind: 'entries', list: list.id, count: list.count + 1 });
        },
        'One entry more',
      );
      more.setAttribute('aria-label', `One entry more in ${list.label}`);
      const reset = list.bySet
        ? dialogButton(
            `reset:${list.id}`,
            'Reset',
            () => {
              dataAction({ kind: 'entries', list: list.id });
            },
            "Back to the save's or the profile's number",
          )
        : document.createElement('span');
      grid.append(label, less, count, more, reset);
    }
    children.push(lists, grid);
  }
  refill(dataBody, dataPop, children);
}

const viewAction = (action: ViewAction): void => {
  post({ type: 'view', action });
};

/** Where a selector's value came from, as the Selectors dialog names it. */
const SELECTOR_SOURCES: Readonly<Record<ViewMenu['selectors'][number]['source'], string>> = {
  auto: 'auto',
  save: 'save',
  live: 'live',
  you: 'you',
  default: 'default',
};

/**
 * The View button's label, and the Selectors dialog: every selector with its value and where
 * the value came from (spec section 4).
 */
function showViewMenu(menu: ViewMenu | undefined): void {
  viewButton.hidden = menu === undefined;
  if (menu === undefined) {
    viewPopup.hidden = true;
    selectorsPopover.close(false);
    selectorsBody.replaceChildren();
    return;
  }
  viewButton.textContent = `View: ${menu.label}`;
  viewButton.title = 'Views of this window, its selectors and hand toggles.';
  const children: HTMLElement[] = [];
  if (menu.liveUnknown.length > 0) {
    children.push(
      textLine(
        'help warning',
        `Live: no value of ${menu.liveUnknown.join(', ')} predicts what the game showed.`,
      ),
    );
  }
  const grid = document.createElement('div');
  grid.className = 'selectors';
  for (const selector of menu.selectors) {
    const id = `selector-${selector.id}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = selector.label;
    if (selector.note !== undefined) label.title = selector.note;
    const select = document.createElement('select');
    select.id = id;
    select.dataset['key'] = `select:${selector.id}`;
    select.title = `${selector.label} (${selector.kind})`;
    for (const value of selector.values) {
      const option = document.createElement('option');
      option.value = value.id;
      option.textContent = value.label;
      option.selected = value.id === selector.value;
      select.append(option);
    }
    // The resolution follows the preview's screen.
    select.disabled = selector.kind === 'resolution';
    select.addEventListener('change', () => {
      viewAction({ kind: 'select', selector: selector.id, value: select.value });
    });
    const source = document.createElement('span');
    source.className = 'count';
    source.textContent = SELECTOR_SOURCES[selector.source];
    if (selector.source === 'you') {
      const release = dialogButton(
        `release:${selector.id}`,
        selector.kind === 'data' ? 'Follow Save' : '×',
        () => {
          viewAction({ kind: 'release', selector: selector.id });
        },
        selector.kind === 'data' ? 'Follow the save again' : "Back to the profile's default",
      );
      if (selector.kind !== 'data') {
        release.setAttribute('aria-label', `${selector.label}: back to the profile's default`);
      }
      source.append(' ', release);
    }
    grid.append(label, select, source);
  }
  children.push(grid);
  refill(selectorsBody, selectorsPop, children);
}

canvas.addEventListener('mousemove', (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  // One message per frame, however often the mouse reports.
  if (pointerFrame !== 0) return;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0;
    const point = pointer && toScreen(pointer.x, pointer.y);
    post(point === undefined ? { type: 'pointer' } : { type: 'pointer', point });
  });
});

canvas.addEventListener('mouseleave', () => {
  pointer = undefined;
  post({ type: 'pointer' });
});

canvas.addEventListener('click', (event) => {
  // The click that ends a drag panned the screen; it picks nothing.
  if (dragged) {
    dragged = false;
    return;
  }
  const point = toScreen(event.clientX, event.clientY);
  if (point !== undefined) post({ type: 'click', point });
});

// Zoom (etch#162): Ctrl+wheel and Ctrl+= / Ctrl+- around the cursor, Ctrl+0 back to 100 %,
// Ctrl+Shift+0 to fit the panel; the wheel and a drag pan a screen larger than the panel. The
// keys are kept from VS Code, whose own zoom would otherwise take them.
zoomIn.addEventListener('click', () => {
  zoomBy(1);
});
zoomOut.addEventListener('click', () => {
  zoomBy(-1);
});
// The level shows the zoom and opens its menu: fit the window or the whole screen into the panel,
// or one of the sizes, around the panel's middle (etch#648, finding P1.3).
attachMenu(zoomLevel, element('zoom-menu', HTMLDivElement), () => [
  {
    label: 'Fit window',
    keys: 'Ctrl+Shift+0',
    checked: zoom.fit && zoom.window === true,
    pick: () => {
      setZoom(FIT_WINDOW);
    },
  },
  {
    label: 'Fit screen',
    keys: 'Ctrl+Shift+0 twice',
    checked: zoom.fit && zoom.window !== true,
    pick: () => {
      setZoom(FIT);
    },
  },
  SEPARATOR,
  ...PREVIEW_SIZES.map((size) => ({
    label: `${String(size * 100)} %`,
    ...(size === 1 ? { keys: 'Ctrl+0' } : {}),
    checked: !zoom.fit && Math.abs(zoom.scale - size) < 1e-6,
    pick: () => {
      zoomTo(size);
    },
  })),
]);

listenForZoomKeys({
  zoomIn: () => {
    zoomBy(1, pointer);
  },
  zoomOut: () => {
    zoomBy(-1, pointer);
  },
  actualSize: () => {
    zoomTo(1, pointer);
  },
  // The window, and pressed again the whole screen.
  fit: () => {
    setZoom(zoom.fit && zoom.window === true ? FIT : FIT_WINDOW);
  },
});

/** Ctrl+wheel distance not yet turned into a zoom step, in pixels. */
let wheel = 0;
stage.addEventListener(
  'wheel',
  (event) => {
    if (placement === undefined) return;
    if (event.ctrlKey) {
      const turned = wheelDelta(wheel, wheelPixels(event.deltaY, event.deltaMode));
      wheel = turned.left;
      const at = { x: event.clientX, y: event.clientY };
      for (let i = 0; i < Math.abs(turned.steps); i++) zoomBy(turned.steps > 0 ? 1 : -1, at);
    } else {
      if (zoom.fit || !pannable(placement, panel())) return;
      const sideways = event.shiftKey && event.deltaX === 0;
      const dx = wheelPixels(sideways ? event.deltaY : event.deltaX, event.deltaMode);
      const dy = sideways ? 0 : wheelPixels(event.deltaY, event.deltaMode);
      setZoom(pan(zoom, placement, -dx, -dy, window.devicePixelRatio));
    }
    event.preventDefault();
    event.stopPropagation();
  },
  { passive: false },
);

/** A press that may pan: where the pointer last was, and whether it moved far enough to pan. */
let drag: { x: number; y: number; moved: boolean } | undefined;
/** The press that just ended panned, so its click picks nothing. */
let dragged = false;
/** How far the pointer moves before a press pans, in CSS pixels. */
const DRAG_SLOP = 4;
stage.addEventListener('mousedown', (event) => {
  dragged = false;
  if (event.button !== 0 && event.button !== 1) return;
  if (placement === undefined || zoom.fit || !pannable(placement, panel())) return;
  // The middle button would start the page's autoscroll.
  if (event.button === 1) event.preventDefault();
  drag = { x: event.clientX, y: event.clientY, moved: false };
});
window.addEventListener('mousemove', (event) => {
  if (drag === undefined || placement === undefined) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
  drag = { x: event.clientX, y: event.clientY, moved: true };
  stage.classList.add('panning');
  setZoom(pan(zoom, placement, dx, dy, window.devicePixelRatio));
});
window.addEventListener('mouseup', () => {
  if (drag === undefined) return;
  dragged = drag.moved;
  drag = undefined;
  stage.classList.remove('panning');
});

/** The panel the canvas is shown in. */
function panel(): Panel {
  const box = stage.getBoundingClientRect();
  return { left: box.left, top: box.top, width: stage.clientWidth, height: stage.clientHeight };
}

/** Steps the zoom in or out around a point of the page, else around the panel's middle. */
function zoomBy(direction: 1 | -1, at?: { x: number; y: number }): void {
  if (placement === undefined) return;
  zoomTo(step(placement.scale, direction), at);
}

/** Zooms to a scale around a point of the page, else around the panel's middle. */
function zoomTo(scale: number, at?: { x: number; y: number }): void {
  if (placement === undefined) return;
  const area = panel();
  const anchor =
    at === undefined
      ? { x: area.width / 2, y: area.height / 2 }
      : { x: at.x - area.left, y: at.y - area.top };
  setZoom(zoomAround(placement, scale, anchor, area, window.devicePixelRatio));
}

function setZoom(next: Zoom): void {
  zoom = next;
  layout();
}

/** Places the canvas in the panel at the zoom, and the outlines over it; keeps the zoom. */
function layout(): void {
  if (canvas.hidden || canvas.width === 0 || canvas.height === 0) {
    placement = undefined;
  } else {
    const area = panel();
    placement = place(zoom, canvas, area, window.devicePixelRatio, windowRect);
    // Panning held at an edge stays there.
    if (!zoom.fit) zoom = { fit: false, scale: zoom.scale, center: placement.center };
    canvas.style.left = `${String(placement.left)}px`;
    canvas.style.top = `${String(placement.top)}px`;
    canvas.style.width = `${String(placement.width)}px`;
    canvas.style.height = `${String(placement.height)}px`;
    canvas.classList.toggle('sharp', placement.scale > 1);
    stage.classList.toggle('pannable', !zoom.fit && pannable(placement, area));
  }
  const fitWindow = zoom.fit && zoom.window === true;
  zoomLevel.textContent = zoomLabel(
    zoom,
    placement?.scale,
    fitWindow ? 'Fit window' : 'Fit screen',
  );
  zoomLevel.title = !zoom.fit
    ? 'Monitor pixels per pixel of the screen. Click to fit or for a size.'
    : fitWindow
      ? 'The window fitted into the panel, never above 100 %. Click to fit the screen or for a size.'
      : 'The screen fitted into the panel, never above 100 %. Click to fit the window or for a size.';
  zoomOut.disabled = placement === undefined;
  zoomIn.disabled = placement === undefined;
  showOverlay();
  keep({ ...kept, zoom });
}

/** Keeps the panel's state, when it changed. */
function keep(next: WebviewState): void {
  if (JSON.stringify(next) === JSON.stringify(kept)) return;
  kept = next;
  vscode.setState(kept);
}

/** The state VS Code kept for the panel, its zoom checked. */
function keptState(restored: unknown): WebviewState {
  if (typeof restored !== 'object' || restored === null) return {};
  const { zoom: remembered, ...memento } = restored as WebviewState;
  const checked = zoomOf(remembered);
  return checked === undefined ? memento : { ...memento, zoom: checked };
}

new ResizeObserver(() => {
  layout();
}).observe(stage);

window.addEventListener('resize', () => {
  // The device pixel ratio changes with VS Code's own zoom.
  layout();
  reportMonitor();
});

let monitor = '';
/** Tells the host the monitor's resolution in device pixels (spec section 6), when it changed. */
function reportMonitor(): void {
  const width = Math.round(window.screen.width * window.devicePixelRatio);
  const height = Math.round(window.screen.height * window.devicePixelRatio);
  const key = `${String(width)}x${String(height)}`;
  if (key === monitor || width <= 0 || height <= 0) return;
  monitor = key;
  post({ type: 'monitor', screen: { width, height } });
}

async function receive(message: HostMessage): Promise<void> {
  switch (message.type) {
    case 'draw':
      await draw(message);
      break;
    case 'state':
      show(message.state);
      break;
    case 'overlay': {
      const before = overlay?.selected;
      overlay = message;
      // A widget highlighted from the source or the outline outside the panel comes into view.
      const selected = message.selected;
      const shown =
        selected !== undefined &&
        placement !== undefined &&
        JSON.stringify(selected) !== JSON.stringify(before)
          ? reveal(zoom, placement, selected, panel(), window.devicePixelRatio)
          : undefined;
      if (shown === undefined) showOverlay();
      else setZoom(shown);
      break;
    }
    case 'busy':
      showBusy(message.text);
      break;
    case 'invalidate':
      for (const url of message.urls) painter?.textures.invalidate(url);
      break;
    case 'remember':
      keep({ ...message.memento, zoom });
      break;
  }
}

/** How long the host reads before the preview says it is busy: a warm reload never shows it. */
const BUSY_DELAY_MS = 300;
let busyTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Shows what the host reads, after {@link BUSY_DELAY_MS}, with the stage `aria-busy`; hides it
 * when `text` is undefined (etch#648, finding P2.19).
 */
function showBusy(text: string | undefined): void {
  clearTimeout(busyTimer);
  busyTimer = undefined;
  if (text === undefined) {
    busy.hidden = true;
    stage.removeAttribute('aria-busy');
    return;
  }
  busyTimer = setTimeout(() => {
    busyText.textContent = text;
    busy.hidden = false;
    stage.setAttribute('aria-busy', 'true');
  }, BUSY_DELAY_MS);
}

async function draw(message: Extract<HostMessage, { type: 'draw' }>): Promise<void> {
  if (painter === undefined) {
    markPaint(canvas, message.id, 'failed');
    post({ type: 'failed', id: message.id, message: failure ?? 'no WebGL2 context' });
    return;
  }
  try {
    const result = await painter.paint(message.list);
    let pixels: number[][] | undefined;
    const gl = painter.gl;
    if (result.painted) {
      canvas.hidden = false;
      windowRect = message.window;
      layout();
      if (message.probes !== undefined) {
        const rgba = readPixels(gl);
        pixels = message.probes.map(({ x, y }) => {
          const i = (Math.floor(y) * gl.drawingBufferWidth + Math.floor(x)) * 4;
          return Array.from(rgba.subarray(i, i + 4));
        });
      } else {
        // Waits for the GPU, so that `at` is when the pixels exist (spec section 7).
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      }
    }
    markPaint(canvas, message.id, paintResult(result.painted, result.problems.length));
    post({
      type: 'painted',
      id: message.id,
      painted: result.painted,
      problems: result.problems.map(({ url, code, message: text }) => ({
        url,
        code,
        message: text,
      })),
      skipped: result.skipped,
      ...(pixels === undefined ? {} : { pixels }),
      at: performance.timeOrigin + performance.now(),
    });
  } catch (error) {
    markPaint(canvas, message.id, 'failed');
    post({ type: 'failed', id: message.id, message: messageOf(error) });
  }
}

/** A point of the page as pixels of the preview screen the canvas shows at the zoom. */
function toScreen(clientX: number, clientY: number): Point | undefined {
  if (placement === undefined) return undefined;
  const area = panel();
  const { x, y } = screenPoint(
    placement,
    { x: clientX - area.left, y: clientY - area.top },
    window.devicePixelRatio,
  );
  return x < 0 || y < 0 || x >= canvas.width || y >= canvas.height ? undefined : { x, y };
}

/** Places an outline over a rect of the preview screen, at the zoom, or hides it. */
function outline(box: HTMLElement, rect: DrawRect | undefined): void {
  if (rect === undefined || placement === undefined) {
    box.hidden = true;
    return;
  }
  const shown = panelRect(placement, rect, window.devicePixelRatio);
  box.hidden = false;
  box.style.left = `${String(shown.x)}px`;
  box.style.top = `${String(shown.y)}px`;
  box.style.width = `${String(Math.max(1, shown.width))}px`;
  box.style.height = `${String(Math.max(1, shown.height))}px`;
}

function showOverlay(): void {
  outline(hoverBox, overlay?.hover?.rect);
  outline(selectedBox, overlay?.selected);
  showSelectedLabel();
  const hovered = overlay?.hover;
  const parent = stage.getBoundingClientRect();
  if (hovered === undefined || pointer === undefined) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.textContent = hovered.text;
  // Inside the stage: past its right or bottom edge the tip flips to the pointer's other side
  // (etch#648, finding P3.17).
  const x = pointer.x - parent.left;
  const y = pointer.y - parent.top;
  const left = x + 12 + tip.offsetWidth > stage.clientWidth - 4 ? x - 12 - tip.offsetWidth : x + 12;
  const top =
    y + 12 + tip.offsetHeight > stage.clientHeight - 4 ? y - 12 - tip.offsetHeight : y + 12;
  tip.style.left = `${String(Math.max(4, left))}px`;
  tip.style.top = `${String(Math.max(4, top))}px`;
}

/**
 * The highlighted widget's name, kind, size and place under its outline, or over it at the
 * stage's bottom, inside the stage (etch#648, finding P3.21).
 */
function showSelectedLabel(): void {
  const text = overlay?.selectedLabel;
  if (text === undefined || text === '' || selectedBox.hidden) {
    selectedLabel.hidden = true;
    return;
  }
  selectedLabel.hidden = false;
  selectedLabel.textContent = text;
  const box = selectedBox.getBoundingClientRect();
  const parent = stage.getBoundingClientRect();
  const width = selectedLabel.offsetWidth;
  const height = selectedLabel.offsetHeight;
  const below = box.bottom - parent.top + 3;
  const top = below + height > stage.clientHeight - 2 ? box.top - parent.top - height - 3 : below;
  const left = Math.min(box.left - parent.left, stage.clientWidth - width - 4);
  selectedLabel.style.left = `${String(Math.max(4, left))}px`;
  selectedLabel.style.top = `${String(Math.max(4, top))}px`;
}

function show(next: ViewState): void {
  state = next;
  title.textContent = next.title;
  file.textContent = next.file;
  file.title = next.file;
  pinnedBadge.hidden = !next.pinned;
  canvas.classList.toggle('stale', next.stale === true);
  // Without windows the list closes first: a disabled button takes no click.
  const none = (next.windows?.length ?? 0) === 0;
  if (none) toggleWindowList(false);
  else if (!windowsPop.hidden) showWindowList();
  title.disabled = none;
  showViewMenu(next.menu);
  showDataMenu(next.data);
  resolution.textContent = next.resolution.text;
  resolution.title =
    `Preview resolution ${next.resolution.text}, ${SOURCES[next.resolution.source]}. ` +
    'Click to choose another.';
  const shown = failure === undefined ? next.notices : [...next.notices, failureNotice(failure)];
  // A link that holds: a note with a button that pins the window the game opens instead.
  const links = (next.links ?? []).map((link) => {
    const item = document.createElement('li');
    item.className = 'information link';
    const text = document.createElement('span');
    text.textContent = link.label;
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = `Pin ${link.window}`;
    open.addEventListener('click', () => {
      post({ type: 'openLink', window: link.window });
    });
    item.append(text, open);
    return item;
  });
  notices.replaceChildren(
    ...shown.map((notice) => {
      const item = document.createElement('li');
      item.className = notice.severity;
      // An error is read out at once; the others with the list's polite live region.
      if (notice.severity === 'error') item.setAttribute('role', 'alert');
      if (notice.action === undefined) {
        item.textContent = notice.message;
        return item;
      }
      // A notice with the way on: the window list (etch#648, finding P1.3).
      item.classList.add('action');
      const text = document.createElement('span');
      text.textContent = notice.message;
      const act = document.createElement('button');
      act.type = 'button';
      act.textContent = notice.action.label;
      const kind = notice.action.kind;
      act.addEventListener('click', () => {
        if (kind === 'chooseWindow') toggleWindowList(true);
        else post({ type: 'noticeAction', kind });
      });
      item.append(text, act);
      const dismiss = notice.dismiss;
      if (dismiss !== undefined) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'dismiss';
        close.textContent = '×';
        close.title = 'Dismiss';
        close.setAttribute('aria-label', 'Dismiss');
        close.addEventListener('click', () => {
          post({ type: 'noticeAction', kind: dismiss });
        });
        item.append(close);
      }
      return item;
    }),
    ...links,
  );
}

const SOURCES: Readonly<Record<ViewState['resolution']['source'], string>> = {
  setting: 'chosen in the settings',
  'settings.txt': "from the game's settings.txt",
  native: "the monitor's resolution",
  fallback: 'until the monitor is known',
};

function failureNotice(message: string): ViewState['notices'][number] {
  return { severity: 'error', message: `The preview cannot draw: ${message}` };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (failure !== undefined) {
  notices.replaceChildren();
  const item = document.createElement('li');
  item.className = 'error';
  item.textContent = failureNotice(failure).message;
  notices.append(item);
}
reportMonitor();
post({ type: 'ready' });
