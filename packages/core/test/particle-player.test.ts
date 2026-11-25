// Reading a particle block for drawing and running it (etch#631, step 3), on procedural text with
// no game content.
import { describe, expect, it } from 'vitest';
import {
  CURVE_SAMPLES,
  ParticleEffect,
  ParticleRandom,
  curveAt,
  findParticleBlock,
  readParticleSystem,
  sampleCurve,
  spawnValue,
  type ParticleSystem,
} from '../src/asset/index.ts';
import { parseScript } from '../src/index.ts';

const SMOKE = `particle = {
	name = "etch_smoke"
	subsystem = {
		max_amount = 100
		sort = "depth"
		texture = { shader = "ParticleAlphaBlend" file = "gfx/particles/etch_cloud.dds" x = 2 y = 2 }
		duration = 0.1
		emission = 1000
		life = { 5 }
		size = { 0.6,size_increase 0.3 }
		color = { r = { 100 } g = 100 b = { 100 } alpha = { 75,smoke_fade } }
		rotation = { spin 180 }
		velocity = { 10 }
		force = chaos, upforce, drag
	}
	animation = { time = "life_abs" name = "spin" start = 0 duration = 7 repeat = yes op = "MUL" minValue = 0 maxValue = 2 curve = { 0 0 1 1 } }
	animation = { time = "life" name = "size_increase" duration = 1 op = "MUL" minValue = 1 maxValue = 2 curve = { 0 0 1 1 } }
	animation = { time = "life" name = "smoke_fade" duration = 1 op = "MUL" curve = { 0 0 0.1 1 1 0 } }
	force = { type = "planar" name = "upforce" direction = { 0 1 0 } amount = 1.0 }
	force = { type = "turbulence" name = "chaos" amount = 1.0 }
	force = { type = "friction" name = "drag" amount = 2.0 }
}
`;

function system(text: string, name: string): ParticleSystem {
  const block = findParticleBlock(parseScript(text).entries, name);
  if (block === undefined) throw new Error(`no particle ${name}`);
  return readParticleSystem(block);
}

/** One subsystem with the given lines, no curves or forces. */
function single(lines: string): ParticleSystem {
  return system(`particle = { name = "p" subsystem = { ${lines} } }`, 'p');
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('reading a particle block', () => {
  it('reads values, curves and forces as the game keeps them', () => {
    const smoke = system(SMOKE, 'ETCH_SMOKE');
    expect(smoke.curves.map((c) => [c.name, c.time, c.op, c.repeat])).toEqual([
      ['spin', 'life_abs', 'mul', true],
      ['size_increase', 'life', 'mul', false],
      ['smoke_fade', 'life', 'mul', false],
    ]);
    const sub = smoke.subsystems[0];
    expect(sub?.size).toEqual({ base: 0.6, curves: [1], variation: 0.3, variationCurves: [] });
    // A space starts the variation list: `{ spin 180 }` is spin on a base of 0, ± 180.
    expect(sub?.rotation).toEqual({ base: 0, curves: [0], variation: 180, variationCurves: [] });
    expect(sub?.color[0].base).toBe(100);
    expect(sub?.color[1].base).toBe(100);
    expect(sub?.color[3]).toEqual({ base: 75, curves: [2], variation: 0, variationCurves: [] });
    expect(sub?.forces).toEqual([1, 0, 2]);
    expect(smoke.forces.map((f) => f.type)).toEqual(['planar', 'turbulence', 'friction']);
    expect(sub?.texture).toMatchObject({ shader: 'alpha', columns: 2, rows: 2 });
    expect(sub?.mass.base).toBe(1);
  });

  it('gives a missing colour channel 255 and a hidden subsystem no particles', () => {
    const sub = single('hide = yes max_amount = 40 color = { r = 10 }').subsystems[0];
    expect(sub?.maxAmount).toBe(0);
    expect(sub?.color.map((c) => c.base)).toEqual([10, 255, 255, 255]);
  });

  it('keeps spawn curves first and leaves unknown names out', () => {
    const p = system(
      `particle = { name = "p"
        subsystem = { size = { grow, fixed, nowhere, 2 } }
        animation = { name = "grow" time = "life" curve = { 0 0 1 1 } }
        animation = { name = "fixed" time = "SPAWN" curve = { 0 0 1 1 } }
      }`,
      'p',
    );
    expect(p.curves.map((c) => c.time)).toEqual(['life', 'spawn']);
    expect(p.subsystems[0]?.size).toMatchObject({ base: 2, curves: [1, 0] });
  });

  it('picks the blend from the effect name', () => {
    const shaders = ['ParticleAdditive', 'ParticlePreAlphaBlend', 'ParticleAlphaBlend'].map(
      (shader) => single(`texture = { shader = "${shader}" }`).subsystems[0]?.texture.shader,
    );
    expect(shaders).toEqual(['additive', 'premultiplied', 'alpha']);
  });
});

describe('curves', () => {
  it('samples a straight line as a straight line', () => {
    const samples = sampleCurve([
      [0, 0],
      [1, 1],
    ]);
    expect(samples).toHaveLength(CURVE_SAMPLES);
    for (let i = 0; i < CURVE_SAMPLES; i++) expect(samples[i]).toBeCloseTo(i / 63, 6);
  });

  it('gives zeros for fewer than two points', () => {
    expect(sampleCurve([[0, 1]]).every((y) => y === 0)).toBe(true);
  });

  it('reads 64 samples over start to end, clamped, and repeats', () => {
    const curve = system(SMOKE, 'etch_smoke').curves[0];
    if (curve === undefined) throw new Error('no curve');
    expect(curveAt(curve, -1)).toBe(curve.samples[0]);
    expect(curveAt(curve, 6.99)).toBeCloseTo(curve.samples[63] ?? 0, 2);
    // With repeat, 7 s on is the same as 0 s and 10.5 s the same as 3.5 s.
    expect(curveAt(curve, 10.5)).toBeCloseTo(curveAt(curve, 3.5), 9);
    // x = 3.5 · 64 / 7 = 32, sample 32 of a 0–2 line.
    expect(curveAt(curve, 3.5)).toBeCloseTo((2 * 32) / 63, 6);
  });
});

describe('values', () => {
  it('draws a variation within ± its size', () => {
    const random = new ParticleRandom(7);
    const value = { base: 5, curves: [], variation: 2, variationCurves: [] };
    const draws = Array.from({ length: 500 }, () => spawnValue(value, [], 0, random));
    expect(Math.min(...draws)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...draws)).toBeLessThanOrEqual(7);
    expect(Math.max(...draws) - Math.min(...draws)).toBeGreaterThan(3.5);
  });

  it('skips the curves of a life at spawn', () => {
    const smoke = system(SMOKE, 'etch_smoke');
    const alpha = smoke.subsystems[0]?.color[3];
    if (alpha === undefined) throw new Error('no alpha');
    expect(spawnValue(alpha, smoke.curves, 0, new ParticleRandom(1))).toBe(75);
  });
});

describe('a running effect', () => {
  it('spawns up to max_amount and lets them die', () => {
    const effect = new ParticleEffect(system(SMOKE, 'etch_smoke'));
    effect.step(0.1, IDENTITY);
    expect(effect.count).toBe(100);
    effect.step(0.1, IDENTITY);
    expect(effect.count).toBe(100);
    expect(effect.finished).toBe(false);
    for (let i = 0; i < 60; i++) effect.step(0.1, IDENTITY);
    expect(effect.count).toBe(0);
    expect(effect.finished).toBe(true);
  });

  it('fades and grows along a particle life', () => {
    const effect = new ParticleEffect(system(SMOKE, 'etch_smoke'));
    effect.step(0.1, IDENTITY);
    const young = effect.quads(0);
    for (let i = 0; i < 24; i++) effect.step(0.1, IDENTITY);
    const old = effect.quads(0);
    const mean = (list: readonly { a: number; size: number }[], key: 'a' | 'size'): number =>
      list.reduce((sum, q) => sum + q[key], 0) / list.length;
    // At half a life, smoke_fade is near its peak and size_increase near 1.5.
    expect(mean(old, 'a')).toBeGreaterThan(mean(young, 'a'));
    expect(mean(old, 'size') / mean(young, 'size')).toBeGreaterThan(1.3);
    for (const q of old) {
      expect([0, 1]).toContain(q.tileX);
      expect([0, 1]).toContain(q.tileY);
    }
  });

  it('points velocity 0 along −Z, yaw −90 along +X and pitch 90 along +Y', () => {
    const along = (lines: string): number[] => {
      const effect = new ParticleEffect(
        single(`max_amount = 1 emission = 100 life = 10 velocity = 10 ${lines}`),
      );
      effect.step(0.1, IDENTITY);
      const q = effect.quads(0)[0];
      if (q === undefined) throw new Error('no particle');
      return [q.x, q.y, q.z].map((v) => Math.round(v * 1000) / 1000 + 0);
    };
    expect(along('')).toEqual([0, 0, -1]);
    expect(along('emitter_yaw = -90')).toEqual([1, 0, 0]);
    expect(along('velocity_pitch = 90')).toEqual([0, 1, 0]);
  });

  it('starts on the node and scales speed and travel by the pdxparticle scale', () => {
    const node = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 4, 5, 1];
    const make = (scale: number): ParticleEffect =>
      new ParticleEffect(single('max_amount = 1 emission = 100 life = 10 velocity = 10'), scale);
    const one = make(1);
    const two = make(2);
    one.step(0.1, node);
    two.step(0.1, node);
    expect(one.quads(0)[0]).toMatchObject({ x: 3, y: 4 });
    expect((one.quads(0)[0]?.z ?? 0) - 5).toBeCloseTo(-1, 9);
    expect((two.quads(0)[0]?.z ?? 0) - 5).toBeCloseTo(-4, 9);
  });

  it('emits in bursts when duration is below 0 and both pulse values are above 0', () => {
    const effect = new ParticleEffect(
      single(
        'max_amount = 1000 duration = -1 emission = 10 life = 100 emission_pulse_duration = 0.5 emission_pulse_silence = 1',
      ),
    );
    const counts: number[] = [];
    for (let i = 0; i < 30; i++) {
      effect.step(0.1, IDENTITY);
      counts.push(effect.count);
    }
    // Emitting for 0.5 s, silent for 1 s: the count stands still in the silences.
    expect(counts[4]).toBeGreaterThan(0);
    expect(counts[10]).toBe(counts[6]);
    expect(counts[18]).toBeGreaterThan(counts[10] ?? 0);
    expect(counts[29]).toBeLessThan(15);
  });

  it('runs the same for the same seed', () => {
    const run = (seed: number) => {
      const effect = new ParticleEffect(system(SMOKE, 'etch_smoke'), 1, seed);
      for (let i = 0; i < 10; i++) effect.step(1 / 30, IDENTITY);
      return effect.quads(0);
    };
    expect(run(3)).toEqual(run(3));
    expect(run(3)).not.toEqual(run(4));
  });

  it('pushes away from a point force with a positive amount, at any distance alike', () => {
    const at = (amount: number, x: number): number => {
      const effect = new ParticleEffect(
        system(
          `particle = { name = "p"
            force = { type = "point" name = "f" amount = ${String(amount)} position = { ${String(x)} 0 0 } }
            subsystem = { max_amount = 1 emission = 100 life = 100 velocity = 0 force = f } }`,
          'p',
        ),
      );
      for (let i = 0; i < 10; i++) effect.step(0.1, IDENTITY);
      return effect.quads(0)[0]?.x ?? Number.NaN;
    };
    expect(at(1, 1)).toBeLessThan(0);
    expect(at(-1, 1)).toBeGreaterThan(0);
    // Constant strength: the same push from a centre 1 or 10 away.
    expect(at(1, 1)).toBeCloseTo(at(1, 10), 9);
  });

  describe('spin', () => {
    // A particle born at rest 1 unit from a spin axis along +Y, a quarter turn a second. The box's
    // x goes through the emitter's default yaw, so it is born on −Z; `angle` is from there.
    const spun = (scale: number, steps: number, extra = '') => {
      const effect = new ParticleEffect(
        system(
          `particle = { name = "p"
            force = { type = "spin" name = "f" amount = ${String(Math.PI / 2)} direction = { 0 1 0 } position = { 0 0 0 } }
            ${extra}
            subsystem = { max_amount = 1 emission = 10 life = 100 velocity = 0
              emitter_type = box box_emitter_x = 1 force = f${extra === '' ? '' : ', g'} } }`,
          'p',
        ),
        scale,
      );
      for (let i = 0; i < steps; i++) effect.step(0.1, IDENTITY);
      const q = effect.quads(0)[0];
      if (q === undefined) throw new Error('no particle');
      return { radius: Math.hypot(q.x, q.z), angle: Math.atan2(q.z, q.x) + Math.PI / 2, y: q.y };
    };

    it('moves a particle along the chord of a turn of amount · dt, turning −Z towards +X', () => {
      // Born in the first step and pushed in it: 0.1 s at π/2 rad/s is a turn of π/20.
      const first = spun(1, 1);
      expect(first.angle).toBeCloseTo(Math.PI / 20, 9);
      expect(first.radius).toBeCloseTo(1, 9);
      expect(first.y).toBeCloseTo(0, 9);
    });

    it('turns at amount radians a second when nothing else moves the particle at scale 1', () => {
      // The velocity stays along the last chord, so the push cancels it all: a circle.
      const end = spun(1, 11);
      expect(end.angle).toBeCloseTo((11 * Math.PI) / 20, 9);
      expect(end.radius).toBeCloseTo(1, 9);
    });

    it('spirals outwards at a scale above 1', () => {
      // The push is divided by the scale and the move multiplied by it, so a share of the old
      // velocity survives each turn and carries the particle away from the axis (values from the
      // lab's separate simulation of the game's code).
      const end = spun(2, 11);
      expect(end.radius).toBeCloseTo(3.270453, 5);
      expect(end.angle).toBeCloseTo(2.407596, 5);
    });

    it('spirals outwards when another force moves the particle across the turn', () => {
      const end = spun(
        1,
        11,
        'force = { type = "planar" name = "g" amount = 1 direction = { 1 0 0 } }',
      );
      expect(end.radius).toBeGreaterThan(1.1);
    });
  });

  it('pushes with turbulence at exactly its amount, in a direction that changes over time', () => {
    const effect = new ParticleEffect(
      system(
        `particle = { name = "p"
          force = { type = "turbulence" name = "f" amount = 2 }
          subsystem = { max_amount = 1 emission = 100 life = 100 velocity = 0 force = f } }`,
        'p',
      ),
    );
    const positions: number[][] = [];
    for (let i = 0; i < 4; i++) {
      effect.step(0.1, IDENTITY);
      const q = effect.quads(0)[0];
      if (q === undefined) throw new Error('no particle');
      positions.push([q.x, q.y, q.z]);
    }
    // In the first step the particle, still, moves by amount · dt² (2 · 0.01).
    const [first = [], second = [], third = []] = positions;
    expect(Math.hypot(first[0] ?? 0, first[1] ?? 0, first[2] ?? 0)).toBeCloseTo(0.02, 6);
    const step = (a: number[], b: number[]): number[] => a.map((v, i) => (b[i] ?? 0) - v);
    expect(step(first, second)).not.toEqual(step(second, third));
  });

  it('lets a stopped effect finish', () => {
    const effect = new ParticleEffect(
      single('max_amount = 10 duration = -1 emission = 50 life = 1'),
    );
    effect.step(0.5, IDENTITY);
    expect(effect.count).toBe(10);
    effect.stop();
    for (let i = 0; i < 20; i++) effect.step(0.1, IDENTITY);
    expect(effect.finished).toBe(true);
  });
});
