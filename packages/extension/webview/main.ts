// The preview webview's script (bundled to dist/webview.js): draws each draw list the extension
// host posts with `@etch/renderer`, fetching textures through webview URIs (ADR 0001), and shows
// the toolbar and notices the host describes.

import { Painter, createContext, readPixels } from '@etch/renderer';
import type { DrawRect } from '@etch/core/draw-list';
import type {
  HostMessage,
  Point,
  PreviewBackend,
  ViewState,
  WebviewMessage,
} from '../src/preview/protocol.ts';

declare function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };

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
const backend = element('backend', HTMLSelectElement);
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

backend.addEventListener('change', () => {
  post({ type: 'backend', backend: backend.value as PreviewBackend });
});

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
});

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
  }
}

async function draw(message: Extract<HostMessage, { type: 'draw' }>): Promise<void> {
  if (painter === undefined) {
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
  const text = overlay?.hover?.text;
  const parent = canvas.parentElement?.getBoundingClientRect();
  if (text === undefined || pointer === undefined || parent === undefined) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  tip.textContent = text;
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
  backend.value = next.backend;
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
post({ type: 'ready' });
