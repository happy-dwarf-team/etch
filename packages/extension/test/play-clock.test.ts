// The mesh view's play clock: a long gap between frames is a pause, and one frame is pending at a time.
import { describe, expect, it } from 'vitest';
import { FrameRequest, MAX_FRAME_GAP_MS, startAfterGap } from '../webview/play-clock.ts';

describe('the play clock', () => {
  it('keeps the start over frames close together', () => {
    expect(startAfterGap(100, undefined, 5000)).toBe(100);
    expect(startAfterGap(100, 4984, 5000)).toBe(100);
    expect(startAfterGap(100, 5000 - MAX_FRAME_GAP_MS, 5000)).toBe(100);
  });

  it('leaves out a gap longer than a second, so the time goes on from the frame before', () => {
    // An hour played, then the machine slept for ten minutes.
    const started = 0;
    const last = 3_600_000;
    const now = last + 600_000;
    const next = startAfterGap(started, last, now);
    expect((now - next) / 1000).toBe(3600);
  });
});

describe('FrameRequest', () => {
  it('keeps one frame pending however often it is asked for', () => {
    const queued: ((now: number) => void)[] = [];
    let drawn = 0;
    const frames = new FrameRequest(
      () => drawn++,
      (callback) => queued.push(callback),
    );
    frames.ask();
    frames.ask();
    frames.ask();
    expect(queued).toHaveLength(1);
    queued.shift()?.(16);
    expect(drawn).toBe(1);
    frames.ask();
    expect(queued).toHaveLength(1);
  });

  it('can ask for the next frame from the frame it draws', () => {
    const queued: ((now: number) => void)[] = [];
    let drawn = 0;
    const frames: FrameRequest = new FrameRequest(
      () => {
        drawn++;
        if (drawn < 3) frames.ask();
      },
      (callback) => queued.push(callback),
    );
    frames.ask();
    while (queued.length > 0) queued.shift()?.(16);
    expect(drawn).toBe(3);
  });
});
