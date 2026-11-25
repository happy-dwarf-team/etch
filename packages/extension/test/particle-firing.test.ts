// When a state's event starts its particle effect (etch#631, step 4): the rule of the game's code
// as the EU4 engine lab read it, on the state's time in seconds.
import { describe, expect, it } from 'vitest';
import { PARTICLE_BUDGET, fires, withinBudget } from '../webview/particle-firing.ts';

/** The times an event at `time` starts in 1/10 s steps from 0 to `until`. */
function starts(time: number, loop: number | undefined, until: number): number[] {
  const out: number[] = [];
  for (let i = 0; i * 0.1 < until - 1e-9; i++) {
    const from = i * 0.1;
    if (fires(time, from, from + 0.1, loop)) out.push(Math.round(from * 10) / 10);
  }
  return out;
}

describe('when a state event starts its effect', () => {
  it('starts in the step that holds its time, once a loop', () => {
    expect(starts(0.25, 1, 3)).toEqual([0.2, 1.2, 2.2]);
  });

  it('starts at 0 in the state’s first step, and nothing in a step of no time', () => {
    expect(fires(0, 0, 0.1, 1)).toBe(true);
    expect(fires(0, 0, 0, 1)).toBe(false);
  });

  it('starts once without a loop', () => {
    expect(starts(0.25, undefined, 3)).toEqual([0.2]);
  });

  it('starts an event timed past the loop’s end on each wrap', () => {
    expect(starts(1.5, 1, 3.05)).toEqual([0.9, 1.9, 2.9]);
    expect(starts(-1, 1, 3.05)).toEqual([0.9, 1.9, 2.9]);
  });
});

describe('how many copies of an effect run', () => {
  it('has no limit per event, only a budget of particles alive (step 7)', () => {
    // Forty starts of an event, as forty loops of a looping state give, all within the budget.
    let alive = 0;
    let started = 0;
    for (let i = 0; i < 40; i++) {
      if (withinBudget(alive)) started++;
      alive += 10;
    }
    expect(started).toBe(40);
    expect(withinBudget(PARTICLE_BUDGET - 1)).toBe(true);
    expect(withinBudget(PARTICLE_BUDGET)).toBe(false);
  });
});
