import { describe, expect, it } from 'vitest';
import {
  cameraKeys,
  editLength,
  focus,
  panelState,
  pointerAt,
  toOutput,
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

  it('counts the clip in whole output frames', () => {
    const segment = { duration: 2.51, panels: [], captions: [], highlights: [] };
    expect(editLength({ id: 'x', sources: {}, segments: [segment, segment] })).toEqual({
      seconds: 5,
      frames: 150,
    });
  });
});
