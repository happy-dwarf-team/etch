// The mesh view's play clock (`mesh.ts`), apart from the WebGL code so the tests can load it.

/** A longer gap between two frames is taken as a pause: the window was hidden, the machine slept. */
export const MAX_FRAME_GAP_MS = 1000;

/**
 * The clock's start (`performance.now()` at the animation's second 0) for a frame at `now`, when
 * the frame before was at `last` (`undefined` for the first frame since Play). A gap longer than
 * `maxGapMs` is left out, as a pause, so the play time goes on from where it stopped. Without
 * this, the time would jump by the whole gap, and the particle layer, which runs a jump of more
 * than a second again from the state's start, would replay every second played since Play.
 */
export function startAfterGap(
  started: number,
  last: number | undefined,
  now: number,
  maxGapMs = MAX_FRAME_GAP_MS,
): number {
  if (last === undefined) return started;
  const gap = now - last;
  return gap > maxGapMs ? started + gap : started;
}

/**
 * One `requestAnimationFrame` callback at a time: asking again while a frame is pending does
 * nothing, so playing, a redraw and choosing another animation never start a second loop.
 */
export class FrameRequest {
  private pending = false;
  private readonly draw: (now: number) => void;
  private readonly schedule: (callback: (now: number) => void) => unknown;

  constructor(draw: (now: number) => void, schedule: (callback: (now: number) => void) => unknown) {
    this.draw = draw;
    this.schedule = schedule;
  }

  /** Asks for a frame, unless one is already asked for. */
  ask(): void {
    if (this.pending) return;
    this.pending = true;
    this.schedule((now) => {
      this.pending = false;
      this.draw(now);
    });
  }
}
