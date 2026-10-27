// The preview webview's script (bundled to dist/webview.js): draws each draw list the extension
// host posts with `@etch/renderer`, fetching textures through webview URIs (ADR 0001), marks each
// paint on the canvas for Etch's own tools (paint-marker.ts), and shows the toolbar, its menus
// (`View ▾`, spec section 4) and the notices the host describes.

import { Painter, createContext, readPixels } from '@etch/renderer';
import type { DrawRect } from '@etch/core/draw-list';
import type {
  HostMessage,
  Point,
  PreviewMemento,
  ViewAction,
  ViewMenu,
  ViewState,
  WebviewMessage,
} from '../src/preview/protocol.ts';
import { markPaint, paintResult } from './paint-marker.ts';

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  setState(state: PreviewMemento): void;
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
const title = element('title', HTMLSpanElement);
const file = element('file', HTMLSpanElement);
const notices = element('notices', HTMLUListElement);
const pin = element('pin', HTMLButtonElement);
const resolution = element('resolution', HTMLButtonElement);
const liveGame = element('live-game', HTMLButtonElement);
const viewButton = element('view-menu', HTMLButtonElement);
const viewPopup = element('view-popup', HTMLDivElement);
const hoverBox = element('hover', HTMLDivElement);
const selectedBox = element('selected', HTMLDivElement);
const tip = element('tip', HTMLDivElement);

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
window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  void receive(event.data);
});

pin.addEventListener('click', () => {
  post({ type: 'pin', pinned: state?.pinned !== true });
});

resolution.addEventListener('click', () => {
  post({ type: 'resolution' });
});

liveGame.addEventListener('click', () => {
  post({ type: 'startLiveGame' });
});

// `View ▾` stays open while the user clicks in it; a click elsewhere or Escape closes it.
viewButton.addEventListener('click', () => {
  openViewMenu(viewPopup.hidden === true);
});
document.addEventListener('mousedown', (event) => {
  const target = event.target;
  if (target instanceof Node && (viewPopup.contains(target) || viewButton.contains(target))) return;
  openViewMenu(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') openViewMenu(false);
});

function openViewMenu(open: boolean): void {
  viewPopup.hidden = !open || state?.menu === undefined;
  viewButton.setAttribute('aria-expanded', String(!viewPopup.hidden));
}

const viewAction = (action: ViewAction): void => {
  post({ type: 'view', action });
};

/** Where a selector's value came from, as `View ▾` names it. */
const SELECTOR_SOURCES: Readonly<Record<ViewMenu['selectors'][number]['source'], string>> = {
  auto: 'auto',
  save: 'save',
  live: 'live',
  you: 'you',
  default: 'default',
};

/** Fills `View ▾`: the views, the actions, then every selector with its value's source. */
function showViewMenu(menu: ViewMenu | undefined): void {
  viewButton.hidden = menu === undefined;
  if (menu === undefined) {
    viewPopup.hidden = true;
    viewPopup.replaceChildren();
    return;
  }
  viewButton.textContent = `View: ${menu.label} ▾`;
  viewButton.title = 'Views of this window and the selectors that choose them (View ▾).';
  const item = (text: string, onClick: () => void, title?: string): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item';
    button.setAttribute('role', 'menuitem');
    button.textContent = text;
    if (title !== undefined) button.title = title;
    button.addEventListener('click', onClick);
    return button;
  };
  const heading = (text: string): HTMLElement => {
    const h = document.createElement('h4');
    h.textContent = text;
    return h;
  };
  const children: HTMLElement[] = [];
  if (menu.views.length > 0) {
    children.push(heading('Views'));
    for (const view of menu.views) {
      const button = item(
        `${view.current ? '●' : '○'} ${view.label}${view.mine ? ' (yours)' : ''}`,
        () => {
          viewAction({ kind: 'chooseView', id: view.id });
        },
      );
      button.setAttribute('aria-checked', String(view.current));
      children.push(button);
    }
  }
  children.push(document.createElement('hr'));
  const save = item('Save as view…', () => {
    viewAction({ kind: 'saveView' });
  });
  save.disabled = !menu.canSave;
  save.title = menu.canSave
    ? "Write these selectors and hand toggles as a view into the mod project's .etch/profiles."
    : 'Save as view writes into a mod project; open a file of a mod.';
  children.push(save);
  if (menu.handToggles > 0) {
    children.push(
      item(`Reset hand toggles (${String(menu.handToggles)})`, () => {
        viewAction({ kind: 'resetToggles' });
      }),
    );
  }
  children.push(
    item('Open profile', () => {
      viewAction({ kind: 'openProfile' });
    }),
  );
  if (menu.selectors.length > 0) {
    children.push(document.createElement('hr'), heading('Selectors'));
    for (const selector of menu.selectors) {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('span');
      label.textContent = selector.label;
      if (selector.note !== undefined) label.title = selector.note;
      const select = document.createElement('select');
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
      source.className = 'source';
      source.textContent = SELECTOR_SOURCES[selector.source];
      if (selector.source === 'you') {
        const release = document.createElement('button');
        release.type = 'button';
        release.className = 'release';
        release.textContent = selector.kind === 'data' ? 'follow save' : '×';
        release.title =
          selector.kind === 'data' ? 'Follow the save again' : 'Back to the profile default';
        release.addEventListener('click', () => {
          viewAction({ kind: 'release', selector: selector.id });
        });
        source.append(' ', release);
      }
      row.append(label, select, source);
      children.push(row);
    }
  }
  viewPopup.replaceChildren(...children);
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
  const point = toScreen(event.clientX, event.clientY);
  if (point !== undefined) post({ type: 'click', point });
});

window.addEventListener('resize', () => {
  showOverlay();
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
    case 'overlay':
      overlay = message;
      showOverlay();
      break;
    case 'invalidate':
      for (const url of message.urls) painter?.textures.invalidate(url);
      break;
    case 'remember':
      vscode.setState(message.memento);
      break;
  }
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
      showOverlay();
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

/** A point of the page as pixels of the preview screen the canvas shows scaled. */
function toScreen(clientX: number, clientY: number): Point | undefined {
  const box = canvas.getBoundingClientRect();
  if (canvas.hidden || box.width === 0 || box.height === 0) return undefined;
  const x = ((clientX - box.left) * canvas.width) / box.width;
  const y = ((clientY - box.top) * canvas.height) / box.height;
  return x < 0 || y < 0 || x >= canvas.width || y >= canvas.height ? undefined : { x, y };
}

/** Places an outline over a rect of the preview screen, or hides it. */
function outline(box: HTMLElement, rect: DrawRect | undefined): void {
  const area = canvas.getBoundingClientRect();
  const parent = canvas.parentElement?.getBoundingClientRect();
  if (rect === undefined || canvas.hidden || parent === undefined || canvas.width === 0) {
    box.hidden = true;
    return;
  }
  const scale = area.width / canvas.width;
  box.hidden = false;
  box.style.left = `${String(area.left - parent.left + rect.x * scale)}px`;
  box.style.top = `${String(area.top - parent.top + rect.y * scale)}px`;
  box.style.width = `${String(Math.max(1, rect.width * scale))}px`;
  box.style.height = `${String(Math.max(1, rect.height * scale))}px`;
}

function showOverlay(): void {
  outline(hoverBox, overlay?.hover?.rect);
  outline(selectedBox, overlay?.selected);
  const hovered = overlay?.hover;
  const parent = canvas.parentElement?.getBoundingClientRect();
  if (hovered === undefined || pointer === undefined || parent === undefined) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.textContent = hovered.text;
  tip.style.left = `${String(pointer.x - parent.left + 12)}px`;
  tip.style.top = `${String(pointer.y - parent.top + 12)}px`;
}

function show(next: ViewState): void {
  state = next;
  title.textContent = next.title;
  file.textContent = next.file;
  file.title = next.file;
  pin.disabled = !next.pinnable;
  pin.textContent = next.pinned ? 'Pinned' : 'Pin';
  pin.setAttribute('aria-pressed', String(next.pinned));
  pin.title = next.pinned
    ? 'The preview stays on this window. Click to follow the cursor again.'
    : 'Keep the preview on this window while other files are edited.';
  showViewMenu(next.menu);
  resolution.textContent = next.resolution.text;
  resolution.title =
    `Preview resolution ${next.resolution.text}, ${SOURCES[next.resolution.source]}. ` +
    'Click to choose another.';
  const shown = failure === undefined ? next.notices : [...next.notices, failureNotice(failure)];
  notices.replaceChildren(
    ...shown.map((notice) => {
      const item = document.createElement('li');
      item.className = notice.severity;
      item.textContent = notice.message;
      return item;
    }),
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
