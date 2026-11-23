// The texture preview's webview script (src/texture-preview.ts): decodes the posted DDS or TGA
// bytes with `@etch/renderer` and shows one mip level on a 2D canvas, the first unless the user
// picks another, with the header's facts, a channel view (RGBA, RGB, alpha), zoom and the texel
// under the mouse.

import { inspectTexture, TextureReadError } from '@etch/renderer';
import type { InspectedTexture, TextureSummary } from '@etch/renderer';
import type { TextureHostMessage, TextureWebviewMessage } from '../src/texture-protocol.ts';
import { FIT, fitScale, step, zoomLabel } from './zoom.ts';
import { listenForZoomKeys } from './zoom-keys.ts';
import { attachMenu, SEPARATOR } from './menu.ts';

/** Which channels show: colour with alpha, colour alone, or alpha as grey. */
type Channels = 'rgba' | 'rgb' | 'a';

declare function acquireVsCodeApi(): { postMessage(message: TextureWebviewMessage): void };
const vscode = acquireVsCodeApi();

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found;
}
const canvas = element('canvas') as HTMLCanvasElement;
const context = canvas.getContext('2d');
const facts = element('facts');
const status = element('status');
const errorBox = element('error');
const levelSelect = element('level') as HTMLSelectElement;
const main = document.querySelector('main') as HTMLElement;
const zoomLevel = element('zoom-level') as HTMLButtonElement;
/** The sizes in the zoom's menu, after Fit. */
const TEXTURE_SIZES = [1, 2, 4, 8] as const;

/** The file the host posted last, kept to read another mip level of it. */
let file: { readonly name: string; readonly bytes: Uint8Array } | undefined;
/** The mip level shown; a new file keeps it when the file has that level. */
let level = 0;
let shown: InspectedTexture | undefined;
let channels: Channels = 'rgba';
/**
 * Monitor pixels per texel, as in the interface preview's zoom (webview/zoom.ts); `undefined`
 * while the zoom follows the panel (Fit, never above 100 %).
 */
let scale: number | undefined;

function draw(): void {
  if (shown === undefined || context === null) return;
  const { summary, rgba } = shown;
  canvas.width = summary.width;
  canvas.height = summary.height;
  const image = context.createImageData(summary.width, summary.height);
  const out = image.data;
  for (let i = 0; i < rgba.length; i += 4) {
    if (channels === 'a') {
      const a = rgba[i + 3] ?? 0;
      out[i] = a;
      out[i + 1] = a;
      out[i + 2] = a;
      out[i + 3] = 255;
    } else {
      out[i] = rgba[i] ?? 0;
      out[i + 1] = rgba[i + 1] ?? 0;
      out[i + 2] = rgba[i + 2] ?? 0;
      out[i + 3] = channels === 'rgb' ? 255 : (rgba[i + 3] ?? 0);
    }
  }
  context.putImageData(image, 0, 0);
  place();
}

function currentScale(summary: TextureSummary): number {
  return (
    scale ??
    fitScale(summary, { width: main.clientWidth, height: main.clientHeight }, devicePixelRatio)
  );
}

function place(): void {
  if (shown === undefined) return;
  const s = currentScale(shown.summary) / devicePixelRatio;
  canvas.style.width = `${String(shown.summary.width * s)}px`;
  canvas.style.height = `${String(shown.summary.height * s)}px`;
  const current = currentScale(shown.summary);
  zoomLevel.textContent = zoomLabel(
    scale === undefined ? FIT : { fit: false, scale, center: { x: 0, y: 0 } },
    current,
  );
  zoomLevel.title =
    scale === undefined
      ? 'The texture fitted into the panel, never above 100 %. Click for fit or a size.'
      : 'Monitor pixels per texture pixel. Click for fit or a size.';
  status.dataset['zoom'] = `${String(Math.round(current * 100))} %`;
  status.textContent = status.dataset['texel'] ?? status.dataset['zoom'];
}

function describe(summary: TextureSummary): string[] {
  const size =
    summary.drawnWidth !== summary.width || summary.drawnHeight !== summary.height
      ? `${String(summary.width)} × ${String(summary.height)} (the game draws ${String(summary.drawnWidth)} × ${String(summary.drawnHeight)}: whole DXT blocks)`
      : `${String(summary.width)} × ${String(summary.height)}`;
  return [
    size,
    `${summary.container} ${summary.format}${summary.dx10 ? ' (DX10 header)' : ''}`,
    summary.mipLevels === 1 ? 'no mip chain' : `${String(summary.mipLevels)} mip levels`,
    summary.hasAlpha ? 'alpha used' : 'opaque',
  ];
}

function show(): void {
  if (file === undefined) return;
  const { name, bytes } = file;
  try {
    const first = inspectTexture(name, bytes);
    if (level >= first.summary.mipLevels) level = 0;
    shown = level === 0 ? first : inspectTexture(name, bytes, level);
    levelSelect.replaceChildren(
      ...Array.from({ length: first.summary.mipLevels }, (_, l) => {
        const option = document.createElement('option');
        option.value = String(l);
        option.textContent = `Mip ${String(l)}: ${String(Math.max(1, first.summary.width >> l))} × ${String(Math.max(1, first.summary.height >> l))}`;
        return option;
      }),
    );
    levelSelect.value = String(level);
    levelSelect.hidden = first.summary.mipLevels === 1;
  } catch (error) {
    shown = undefined;
    const text =
      error instanceof TextureReadError
        ? `Etch cannot show ${name}: ${error.message}.`
        : `Etch failed on ${name}: ${String(error)}`;
    errorBox.textContent = text;
    errorBox.hidden = false;
    facts.replaceChildren();
    levelSelect.hidden = true;
    canvas.width = 0;
    canvas.height = 0;
    vscode.postMessage({ type: 'failed', message: text });
    return;
  }
  errorBox.hidden = true;
  facts.replaceChildren(
    ...describe(shown.summary).map((text) => {
      const span = document.createElement('span');
      span.textContent = text;
      return span;
    }),
  );
  facts.title = `${String(bytes.byteLength)} bytes`;
  draw();
  vscode.postMessage({ type: 'shown', summary: shown.summary });
}

levelSelect.addEventListener('change', () => {
  level = Number(levelSelect.value);
  show();
});

// RGBA, RGB and A are one choice (role="radiogroup"): a click or the arrow keys pick one, and
// Tab reaches the group at the chosen one.
const channelButtons = [...document.querySelectorAll<HTMLButtonElement>('#channels button')];
function chooseChannels(button: HTMLButtonElement): void {
  channels = (button.dataset['channels'] ?? 'rgba') as Channels;
  for (const other of channelButtons) {
    other.setAttribute('aria-checked', String(other === button));
    other.tabIndex = other === button ? 0 : -1;
  }
  draw();
}
for (const [index, button] of channelButtons.entries()) {
  button.addEventListener('click', () => {
    chooseChannels(button);
  });
  button.addEventListener('keydown', (event) => {
    const move = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = channelButtons[(index + move + channelButtons.length) % channelButtons.length];
    if (next === undefined) return;
    chooseChannels(next);
    next.focus();
  });
}

function zoom(direction: 1 | -1): void {
  if (shown === undefined) return;
  scale = step(currentScale(shown.summary), direction);
  place();
}
element('zoom-in').addEventListener('click', () => {
  zoom(1);
});
element('zoom-out').addEventListener('click', () => {
  zoom(-1);
});
/** Sets the zoom: a scale, or `undefined` to fit the panel. */
function zoomTo(next: number | undefined): void {
  scale = next;
  place();
}
// The level shows the zoom and opens its menu: fit the panel, or one of the sizes.
attachMenu(zoomLevel, element('zoom-menu'), () => [
  {
    label: 'Fit',
    keys: 'Ctrl+Shift+0',
    checked: scale === undefined,
    pick: () => {
      zoomTo(undefined);
    },
  },
  SEPARATOR,
  ...TEXTURE_SIZES.map((size) => ({
    label: `${String(size * 100)} %`,
    ...(size === 1 ? { keys: 'Ctrl+0' } : {}),
    checked: scale === size,
    pick: () => {
      zoomTo(size);
    },
  })),
]);
listenForZoomKeys({
  zoomIn: () => {
    zoom(1);
  },
  zoomOut: () => {
    zoom(-1);
  },
  actualSize: () => {
    zoomTo(1);
  },
  fit: () => {
    zoomTo(undefined);
  },
});
main.addEventListener(
  'wheel',
  (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);
window.addEventListener('resize', place);

canvas.addEventListener('mousemove', (event) => {
  if (shown === undefined) return;
  const s = currentScale(shown.summary) / devicePixelRatio;
  const x = Math.min(shown.summary.width - 1, Math.floor(event.offsetX / s));
  const y = Math.min(shown.summary.height - 1, Math.floor(event.offsetY / s));
  const i = (y * shown.summary.width + x) * 4;
  const [r, g, b, a] = shown.rgba.subarray(i, i + 4);
  status.dataset['texel'] =
    `${String(x)}, ${String(y)}   R ${String(r)}  G ${String(g)}  B ${String(b)}  A ${String(a)}   ${status.dataset['zoom'] ?? ''}`;
  status.textContent = status.dataset['texel'];
});
canvas.addEventListener('mouseleave', () => {
  delete status.dataset['texel'];
  status.textContent = status.dataset['zoom'] ?? '';
});

window.addEventListener('message', (event: MessageEvent<TextureHostMessage>) => {
  // A copy in this frame's realm: the posted array's buffer is not an ArrayBuffer here, and
  // DataView refuses it.
  file = { name: event.data.name, bytes: new Uint8Array(event.data.bytes) };
  show();
});
vscode.postMessage({ type: 'ready' });
