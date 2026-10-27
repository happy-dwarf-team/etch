import { describe, expect, it } from 'vitest';
import type { Zoom } from '../src/preview/protocol.ts';
import {
  FIT,
  MARGIN,
  STEPS,
  WHEEL_STEP,
  fitScale,
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
} from '../webview/zoom.ts';

const screen = { width: 1920, height: 1080 };
const panel = { left: 0, top: 30, width: 1000, height: 600 };
const at = (scale: number, x = 960, y = 540): Zoom => ({ fit: false, scale, center: { x, y } });

describe('preview zoom', () => {
  it('fits the screen into the panel inside its margin, never above 100 %', () => {
    const fitted = place(FIT, screen, panel, 1);
    expect(fitted.scale).toBeCloseTo((1000 - 2 * MARGIN) / 1920);
    expect(fitted.width).toBeCloseTo(1000 - 2 * MARGIN);
    expect(fitted.left).toBeCloseTo(MARGIN, 0);
    expect(place(FIT, { width: 640, height: 360 }, panel, 1)).toMatchObject({
      scale: 1,
      width: 640,
      height: 360,
      left: 180,
      top: 120,
    });
  });

  it('counts 100 % in monitor pixels, so a high-DPI panel shows the screen smaller in CSS', () => {
    const big = { left: 0, top: 0, width: 3000, height: 2000 };
    expect(fitScale(screen, big, 1.5)).toBe(1);
    expect(place(at(1), screen, big, 1.5)).toMatchObject({ width: 1280, height: 720 });
    expect(place(at(2), screen, big, 1.5)).toMatchObject({ width: 2560, height: 1440 });
  });

  it('pans a screen larger than the panel but never past its edges', () => {
    const middle = place(at(1), screen, panel, 1);
    expect(middle).toMatchObject({ left: 500 - 960, top: 300 - 540 });
    const corner = place(at(1, 0, 0), screen, panel, 1);
    expect(corner).toMatchObject({ left: 0, top: 0, center: { x: 500, y: 300 } });
    const far = place(at(1, 5000, 5000), screen, panel, 1);
    expect(far).toMatchObject({ left: 1000 - 1920, top: 600 - 1080 });
    expect(far.center).toEqual({ x: 1920 - 500, y: 1080 - 300 });
  });

  it('centres an axis where the screen fits, whatever the pan', () => {
    const wide = { left: 0, top: 0, width: 2500, height: 600 };
    const placed = place(at(1, 0, 0), screen, wide, 1);
    expect(placed.left).toBe(290);
    expect(placed.top).toBe(0);
    expect(placed.center.x).toBe(960);
  });

  it("puts the canvas's corner on a monitor pixel of the page", () => {
    const odd = { left: 0.3, top: 27.2, width: 999, height: 601 };
    for (const ratio of [1, 1.25, 1.5, 2]) {
      for (const zoom of [FIT, at(1), at(2, 333.3, 77.7), at(1 / 3)]) {
        const placed = place(zoom, screen, odd, ratio);
        const x = (odd.left + placed.left) * ratio;
        const y = (odd.top + placed.top) * ratio;
        expect(Math.abs(x - Math.round(x))).toBeLessThan(1e-9);
        expect(Math.abs(y - Math.round(y))).toBeLessThan(1e-9);
      }
    }
  });

  it('steps through the scales, whole ones above 100 %', () => {
    expect(STEPS.filter((s) => s > 1).every(Number.isInteger)).toBe(true);
    expect(step(1, 1)).toBe(2);
    expect(step(1, -1)).toBe(0.75);
    expect(step(0.47, 1)).toBe(0.5);
    expect(step(0.47, -1)).toBe(1 / 3);
    expect(step(8, 1)).toBe(8);
    expect(step(0.125, -1)).toBe(0.125);
    expect(step(0.05, 1)).toBe(0.125);
  });

  it('keeps the point under the cursor where it was when zooming', () => {
    for (const ratio of [1, 1.5]) {
      const before = place(at(1, 700, 400), screen, panel, ratio);
      const cursor = { x: 260, y: 410 };
      const under = screenPoint(before, cursor, ratio);
      const after = place(zoomAround(before, 3, cursor, panel, ratio), screen, panel, ratio);
      const still = screenPoint(after, cursor, ratio);
      // Within the monitor pixel the corner snaps to.
      expect(Math.abs(still.x - under.x)).toBeLessThan(1 / 3);
      expect(Math.abs(still.y - under.y)).toBeLessThan(1 / 3);
    }
  });

  it('zooms from fit around the cursor too', () => {
    const fitted = place(FIT, screen, panel, 1);
    const cursor = { x: 100, y: 200 };
    const under = screenPoint(fitted, cursor, 1);
    const zoomed = place(zoomAround(fitted, 2, cursor, panel, 1), screen, panel, 1);
    const still = screenPoint(zoomed, cursor, 1);
    expect(still.x).toBeCloseTo(under.x, 0);
    expect(still.y).toBeCloseTo(under.y, 0);
  });

  it('pans with a drag, and not while fitting', () => {
    const placed = place(at(2), screen, panel, 1);
    expect(pan(at(2), placed, 100, -50, 1)).toEqual(at(2, 960 - 50, 540 + 25));
    expect(pan(FIT, place(FIT, screen, panel, 1), 100, 100, 1)).toBe(FIT);
    expect(pannable(placed, panel)).toBe(true);
    expect(pannable(place(FIT, screen, panel, 1), panel)).toBe(false);
  });

  it('maps picks and outlines through the same placement', () => {
    for (const zoom of [FIT, at(2, 300, 200), at(1 / 3)]) {
      const placed = place(zoom, screen, panel, 1.25);
      const rect = { x: 120, y: 80, width: 300, height: 40 };
      const shown = panelRect(placed, rect, 1.25);
      expect(screenPoint(placed, { x: shown.x, y: shown.y }, 1.25).x).toBeCloseTo(120);
      expect(screenPoint(placed, { x: shown.x, y: shown.y }, 1.25).y).toBeCloseTo(80);
      const corner = screenPoint(
        placed,
        { x: shown.x + shown.width, y: shown.y + shown.height },
        1.25,
      );
      expect(corner.x).toBeCloseTo(420);
      expect(corner.y).toBeCloseTo(120);
    }
  });

  it('brings a highlighted widget outside the panel into view, keeping the scale', () => {
    const placed = place(at(4, 100, 100), screen, panel, 1);
    const far = { x: 1500, y: 900, width: 100, height: 20 };
    expect(reveal(at(4, 100, 100), placed, far, panel, 1)).toEqual(at(4, 1550, 910));
    const near = { x: 90, y: 90, width: 10, height: 10 };
    expect(reveal(at(4, 100, 100), placed, near, panel, 1)).toBeUndefined();
    expect(reveal(FIT, place(FIT, screen, panel, 1), far, panel, 1)).toBeUndefined();
  });

  it('turns the wheel into steps, a notch each, and a pinch into fewer', () => {
    expect(wheelDelta(0, -WHEEL_STEP)).toEqual({ steps: 1, left: 0 });
    expect(wheelDelta(0, 3 * WHEEL_STEP)).toEqual({ steps: -3, left: 0 });
    let left = 0;
    let steps = 0;
    for (let i = 0; i < 10; i++) {
      const turned = wheelDelta(left, -30);
      left = turned.left;
      steps += turned.steps;
    }
    expect(steps).toBe(3);
    expect(wheelDelta(-90, 20)).toEqual({ steps: 0, left: 20 });
    expect(wheelPixels(3, 1)).toBe(120);
    expect(wheelPixels(1, 2)).toBe(800);
  });

  it('labels the zoom', () => {
    expect(zoomLabel(FIT, 0.4712)).toBe('Fit · 47 %');
    expect(zoomLabel(FIT, undefined)).toBe('Fit');
    expect(zoomLabel(at(2), undefined)).toBe('200 %');
    expect(zoomLabel(at(1 / 3), 1 / 3)).toBe('33 %');
  });

  it('takes back only a zoom it could have kept', () => {
    expect(zoomOf({ fit: true })).toEqual(FIT);
    expect(zoomOf(at(3, 10, 20))).toEqual(at(3, 10, 20));
    expect(zoomOf(undefined)).toBeUndefined();
    expect(zoomOf({ fit: false, scale: 100, center: { x: 0, y: 0 } })).toBeUndefined();
    expect(zoomOf({ fit: false, scale: 2, center: { x: Number.NaN, y: 0 } })).toBeUndefined();
    expect(zoomOf({ fit: false, scale: 2 })).toBeUndefined();
    expect(zoomOf({ fit: 'yes' })).toBeUndefined();
  });
});
