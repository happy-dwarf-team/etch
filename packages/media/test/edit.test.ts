import { describe, expect, it } from 'vitest';
import {
  cameraKeys,
  CAPTION_BAND,
  columns,
  editLength,
  focus,
  GUTTER,
  OUTPUT,
  panelState,
  pointerAt,
  rows,
  STAGE,
  toOutput,
  viewAt,
  whole,
  type Panel,
} from '../src/edit.ts';

const SOURCE = { width: 2560, height: 1440 };
const ASPECT = 16 / 9;

describe('the edit model', () => {
  it('places a panel at its first step, then eases to the next over the move', () => {
    const wide = whole(SOURCE, ASPECT);
    const close = { x: 1280, y: 720, w: 1280, h: 720 };
    const panel: Panel = {
      source: 'vscode',
      start: 0,
      keys: cameraKeys([
        { at: 0, view: wide },
        { at: 2, view: close, move: 1 },
      ]),
    };
    expect(panelState(panel, 1).view).toEqual(wide);
    expect(panelState(panel, 2.5).view).toEqual({ x: 640, y: 360, w: 1920, h: 1080 });
    expect(panelState(panel, 9).view).toEqual(close);
    expect(panelState(panel, 9).frame).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });

  it('maps source points through the camera', () => {
    const state = {
      frame: { x: 0, y: 0, w: 1920, h: 1080 },
      view: { x: 100, y: 50, w: 960, h: 540 },
      opacity: 1,
    };
    expect(toOutput(state, { x: 200, y: 100 })).toEqual({ x: 200, y: 100, scale: 2 });
  });

  it('focuses a rect with a margin, the frame aspect, a deepest zoom and the source edges', () => {
    const view = focus({ x: 2400, y: 20, w: 100, h: 40 }, SOURCE, ASPECT, {
      margin: 20,
      minWidth: 1280,
    });
    expect(view).toEqual({ x: 1280, y: 0, w: 1280, h: 720 });
    const big = focus({ x: 0, y: 0, w: 4000, h: 100 }, SOURCE, ASPECT);
    expect(big).toEqual({ x: 0, y: 0, w: 2560, h: 1440 });
  });

  it('moves the drawn pointer in straight lines between its points', () => {
    const path = {
      points: [
        { t: 1, x: 0, y: 0 },
        { t: 2, x: 100, y: 50 },
      ],
      clicks: [],
    };
    expect(pointerAt(path, 0.5)).toBeUndefined();
    expect(pointerAt(path, 1.5)).toEqual({ x: 50, y: 25 });
    expect(pointerAt(path, 5)).toEqual({ t: 2, x: 100, y: 50 });
  });

  it('keeps the panels above the caption band, two of them side by side or one above the other', () => {
    expect(STAGE).toEqual({ x: 24, y: 24, w: 1872, h: 882 });
    expect(STAGE.y + STAGE.h + GUTTER).toBe(OUTPUT.height - CAPTION_BAND);
    expect(columns(600)).toEqual({
      left: { x: 24, y: 24, w: 600, h: 882 },
      right: { x: 648, y: 24, w: 1248, h: 882 },
    });
    expect(rows(STAGE, 500).bottom).toEqual({ x: 24, y: 548, w: 1872, h: 358 });
  });

  it('shows a part of a source at a scale, centred or anchored, inside the source', () => {
    const frame = { x: 0, y: 0, w: 900, h: 600 };
    expect(viewAt({ x: 1000, y: 700, w: 100, h: 20 }, 1.5, frame, SOURCE)).toEqual({
      x: 750,
      y: 510,
      w: 600,
      h: 400,
    });
    // The line's left edge at the view's, a third of the way down.
    expect(viewAt({ x: 40, y: 300, w: 900, h: 24 }, 2, frame, SOURCE, { x: 0, y: 1 / 3 })).toEqual({
      x: 40,
      y: 200,
      w: 450,
      h: 300,
    });
    expect(viewAt({ x: 2500, y: 1400, w: 40, h: 20 }, 1, frame, SOURCE)).toEqual({
      x: 1660,
      y: 840,
      w: 900,
      h: 600,
    });
  });

  it('counts the clip in whole output frames', () => {
    const segment = { duration: 2.51, panels: [], captions: [], highlights: [] };
    expect(editLength({ id: 'x', sources: {}, segments: [segment, segment] })).toEqual({
      seconds: 5,
      frames: 150,
    });
  });
});
