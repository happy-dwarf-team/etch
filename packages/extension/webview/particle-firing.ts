// When a state's event starts its particle effect (etch#631, step 4), apart from the WebGL layer
// in `particles.ts` so the tests can load it.

/**
 * Whether an event at `time` starts in the step [from, to) of the state's time, as the game's
 * code decides it: with a loop `loop` seconds long, in every loop; a time past the loop's end or
 * below 0 on each wrap to its start; without a loop, once.
 */
export function fires(time: number, from: number, to: number, loop: number | undefined): boolean {
  if (!(to > from)) return false;
  if (loop === undefined || !(loop > 0)) return time >= from && time < to;
  if (time >= 0 && time < loop) {
    const k = Math.max(0, Math.ceil((from - time) / loop));
    return time + k * loop < to;
  }
  const wrap = Math.max(1, Math.floor(from / loop) + 1);
  return wrap * loop <= to;
}
