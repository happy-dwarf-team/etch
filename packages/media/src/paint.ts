// Waits on Etch's paint marker (happy-dwarf-team/.github#23): the preview webview writes the id
// and result of each paint onto `canvas#screen`. A step is done when the id has grown past the one
// read before the step and no new paint has come for a quiet window; intermediate paints never
// release it. A timeout fails the run, with no fallback to a fixed delay.
import type { Frame } from '@playwright/test';
import { QUIET_MS, PAINT_TIMEOUT_MS } from './config.ts';

/** `data-paint-result`, as `packages/extension/webview/paint-marker.ts` writes it. */
export type PaintResult = 'ok' | 'problems' | 'blank' | 'failed';

export interface Paint {
  readonly id: number;
  readonly result: PaintResult;
}

export interface PaintWait {
  /** No new paint for this long ends the wait. */
  readonly quietMs?: number;
  readonly timeoutMs?: number;
  /** Results besides `ok` that the scene shows on purpose. */
  readonly allow?: readonly PaintResult[];
}

/** The id of the last paint, or -1 before the first. */
export async function paintId(frame: Frame): Promise<number> {
  return (await lastPaint(frame))?.id ?? -1;
}

/** The last paint the canvas shows, if any. */
export async function lastPaint(frame: Frame): Promise<Paint | undefined> {
  const marker = await frame.evaluate(() => {
    const canvas = document.querySelector('canvas#screen');
    return canvas === null
      ? undefined
      : {
          id: canvas.getAttribute('data-paint-id'),
          result: canvas.getAttribute('data-paint-result'),
        };
  });
  if (marker?.id == null || marker.result == null) return undefined;
  return { id: Number(marker.id), result: marker.result as PaintResult };
}

/** Waits for the paint that settles after `before` (see the file comment) and checks its result. */
export async function settledPaint(
  frame: Frame,
  before: number,
  options: PaintWait = {},
): Promise<Paint> {
  const quietMs = options.quietMs ?? QUIET_MS;
  const timeoutMs = options.timeoutMs ?? PAINT_TIMEOUT_MS;
  try {
    await frame.waitForFunction(
      ({ before, quietMs }) => {
        const canvas = document.querySelector('canvas#screen');
        const id = Number(canvas?.getAttribute('data-paint-id') ?? -1);
        if (id <= before) return false;
        const seen = window as unknown as { etchMediaPaint?: { id: number; at: number } };
        const now = performance.now();
        if (seen.etchMediaPaint?.id !== id) {
          seen.etchMediaPaint = { id, at: now };
          return false;
        }
        return now - seen.etchMediaPaint.at >= quietMs;
      },
      { before, quietMs },
      { polling: 25, timeout: timeoutMs },
    );
  } catch (error) {
    throw new Error(
      `the preview painted nothing new after paint ${String(before)} in ${String(timeoutMs)} ms`,
      { cause: error },
    );
  }
  const paint = await lastPaint(frame);
  if (paint === undefined) throw new Error('the paint marker disappeared');
  checkPaint(paint, options.allow ?? []);
  return paint;
}

/** Fails on a result the scene did not declare. */
export function checkPaint(paint: Paint, allow: readonly PaintResult[]): void {
  if (paint.result === 'ok' || allow.includes(paint.result)) return;
  throw new Error(
    `paint ${String(paint.id)} ended "${paint.result}", which the scene does not declare`,
  );
}

/** Performs a step that changes what the preview draws and waits for its settled paint. */
export async function paintStep(
  frame: Frame,
  step: () => Promise<void>,
  options: PaintWait = {},
): Promise<Paint> {
  const before = await paintId(frame);
  await step();
  return settledPaint(frame, before, options);
}
