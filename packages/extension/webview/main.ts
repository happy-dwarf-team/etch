// The preview webview's script (bundled to dist/webview.js): draws each draw list the extension
// host posts with `@etch/renderer`, fetching textures through webview URIs (ADR 0001), marks each
// paint on the canvas for Etch's own tools (paint-marker.ts), shows the diff view (diff.ts), and shows
// the toolbar and notices the host describes.

import { Painter, createContext, readPixels } from '@etch/renderer';
import type { DrawRect } from '@etch/core/draw-list';
import type {
  DiffState,
  DiffSummary,
  HostMessage,
  Point,
  PreviewBackend,
  PreviewMemento,
  ViewState,
  WebviewMessage,
} from '../src/preview/protocol.ts';
import {
  DIFF_COLOURS,
  DIFF_TOLERANCE,
  diffCounts,
  diffImages,
  readHostImage,
  type DiffPicture,
} from './diff.ts';
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
const backend = element('backend', HTMLSelectElement);
const diffToggle = element('diff', HTMLButtonElement);
const diffCanvas = element('diffview', HTMLCanvasElement);
const legend = element('legend', HTMLDivElement);
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
/** The diff view shown, for the counts under the pointer; `undefined` when it is not shown. */
let picture: DiffPicture | undefined;
/** The id of the latest draw or diff, so that an older one's late result is not shown. */
let latest = 0;

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  void receive(event.data);
});

pin.addEventListener('click', () => {
  post({ type: 'pin', pinned: state?.pinned !== true });
});

resolution.addEventListener('click', () => {
  post({ type: 'resolution' });
});

backend.addEventListener('change', () => {
  post({ type: 'backend', backend: backend.value as PreviewBackend });
});

diffToggle.addEventListener('click', () => {
  post({ type: 'diff', on: state?.diff.on !== true });
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
    case 'diff':
      await diff(message);
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
  latest = message.id;
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
      showDiff(undefined);
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

/**
 * Shows the diff view: paints the offline renderer's window, reads its straight RGBA, reads the
 * game host's image and shows their difference over the screen (spec section 5).
 */
async function diff(message: Extract<HostMessage, { type: 'diff' }>): Promise<void> {
  latest = message.id;
  const fail = (text: string): void => {
    markPaint(canvas, message.id, 'failed');
    post({ type: 'failed', id: message.id, message: text });
  };
  const blank = (): void => {
    markPaint(canvas, message.id, 'blank');
    post({ type: 'painted', id: message.id, painted: false, problems: [], skipped: [], at: now() });
  };
  if (painter === undefined) {
    fail(failure ?? 'no WebGL2 context');
    return;
  }
  try {
    const result = await painter.paint(message.list);
    if (!result.painted || latest !== message.id) {
      blank();
      return;
    }
    const gl = painter.gl;
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const rendered = { width, height, data: readPixels(gl) };
    const response = await fetch(message.image.url);
    if (!response.ok) {
      fail(`the game host's image cannot be read: HTTP ${String(response.status)}`);
      return;
    }
    const host = readHostImage(new Uint8Array(await response.arrayBuffer()));
    if (latest !== message.id) {
      blank();
      return;
    }
    const shown = diffImages(rendered, host, message.image.crop);
    diffCanvas.width = width;
    diffCanvas.height = height;
    const context = diffCanvas.getContext('2d');
    if (context === null) {
      fail('the diff view has no 2D canvas');
      return;
    }
    context.putImageData(new ImageData(shown.image, width, height), 0, 0);
    canvas.hidden = false;
    showDiff(shown);
    showOverlay();
    const pixels = message.probes?.map(({ x, y }) => {
      const i = (Math.floor(y) * width + Math.floor(x)) * 4;
      return Array.from(shown.image.subarray(i, i + 4));
    });
    markPaint(canvas, message.id, paintResult(true, result.problems.length));
    post({
      type: 'painted',
      id: message.id,
      painted: true,
      problems: result.problems.map(({ url, code, message: text }) => ({
        url,
        code,
        message: text,
      })),
      skipped: result.skipped,
      ...(pixels === undefined ? {} : { pixels }),
      diff: shown.summary,
      at: now(),
    });
  } catch (error) {
    fail(messageOf(error));
  }
}

/** Shows a diff view's picture and legend over the screen, or hides them. */
function showDiff(shown: DiffPicture | undefined): void {
  picture = shown;
  diffCanvas.hidden = shown === undefined;
  legend.hidden = shown === undefined;
  if (shown === undefined) {
    legend.replaceChildren();
    return;
  }
  legend.replaceChildren(
    span(summaryText(shown.summary)),
    swatch(DIFF_COLOURS.different, 'both draw, differently'),
    swatch(DIFF_COLOURS.offlineOnly, 'only the offline renderer'),
    swatch(DIFF_COLOURS.hostOnly, 'only the game host'),
    swatch([96, 96, 96], `the same, ±${String(DIFF_TOLERANCE)}`),
  );
}

function summaryText(summary: DiffSummary): string {
  const differing = summary.different + summary.offlineOnly + summary.hostOnly;
  if (differing === 0) {
    return `Diff: all ${count(summary.compared)} pixels of the game host's image are the same.`;
  }
  return (
    `Diff: ${count(differing)} of ${count(summary.compared)} pixels differ ` +
    `(${percent(differing, summary.compared)}), by up to ${String(summary.largest)}.`
  );
}

function swatch(rgb: readonly number[], label: string): HTMLElement {
  const item = document.createElement('span');
  const colour = document.createElement('span');
  colour.className = 'swatch';
  colour.style.background = `rgb(${rgb.join(',')})`;
  item.append(colour, label);
  return item;
}

function span(content: string): HTMLElement {
  const item = document.createElement('span');
  item.textContent = content;
  return item;
}

function count(n: number): string {
  return n.toLocaleString('en');
}

function percent(part: number, whole: number): string {
  return `${whole === 0 ? '0' : ((100 * part) / whole).toFixed(1)} %`;
}

function now(): number {
  return performance.timeOrigin + performance.now();
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
  tip.textContent =
    picture === undefined ? hovered.text : `${hovered.text}\n${diffLine(picture, hovered.rect)}`;
  tip.style.left = `${String(pointer.x - parent.left + 12)}px`;
  tip.style.top = `${String(pointer.y - parent.top + 12)}px`;
}

/** What the diff view found in a widget's rect, for the hover tip. */
function diffLine(shown: DiffPicture, rect: DrawRect): string {
  const { compared, differing } = diffCounts(shown, rect);
  if (compared === 0) return "Diff: outside the game host's image";
  return differing === 0
    ? `Diff: all ${count(compared)} pixels the same`
    : `Diff: ${count(differing)} of ${count(compared)} pixels differ (${percent(differing, compared)})`;
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
  canvas.classList.toggle('stale', next.stale);
  diffCanvas.classList.toggle('stale', next.stale);
  showToggle(next.diff);
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

function showToggle(diffState: DiffState): void {
  const shown = diffState.on && diffState.blocked === undefined;
  diffToggle.disabled = diffState.blocked !== undefined;
  diffToggle.setAttribute('aria-pressed', String(shown));
  diffToggle.title =
    diffState.blocked ??
    (shown
      ? 'The preview shows the difference between both backends. Click to show the game host.'
      : 'Show the per-pixel difference between the offline renderer and the game host.');
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
