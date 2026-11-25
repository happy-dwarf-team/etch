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

/**
 * The particles the preview keeps alive at most before it starts no new effect. The game starts
 * every event's effect however many copies already run (etch#631 step 7); the preview follows it
 * up to this many particles, so that an effect that emits forever, started again on every loop,
 * cannot slow the editor down without bound.
 */
export const PARTICLE_BUDGET = 100_000;

/** Whether another effect may start while `alive` particles live. */
export function withinBudget(alive: number): boolean {
  return alive < PARTICLE_BUDGET;
}
