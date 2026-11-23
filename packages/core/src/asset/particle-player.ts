// An approximate player of a particle system (etch#631, step 3), for the entity preview. It runs
// a `ParticleSystem` (`particle-system.ts`) the way the EU4 engine lab read EU4 1.37.5's update in
// the game's code (step 2), and gives each frame's camera-facing quads to the renderer.
//
// What follows the game's code as read:
// - A value at spawn is its base with its curves of time `spawn` and `system` applied in order
//   (`add`, `mul`, `abs`), plus a uniform draw in ± its variation (itself through its curves).
//   A value with curves of time `life` or `life_abs` is evaluated again every frame from the
//   particle's spawn value, all of its curves applied again.
// - A curve is read at x = (t − start) · 64 / (end − start), clamped to its 64 samples and linear
//   between them; with `repeat`, t is taken modulo `end` first.
// - Emission accumulates rate × dt; whole particles spawn, at most `max_amount` alive, and the
//   fraction carries over. A subsystem emits from its `start` until its `duration` ends, forever
//   when `duration` is below 0, and then in bursts when both pulse values are above 0.
// - The start velocity's direction comes from `velocity_pitch` and `velocity_yaw` through the
//   emitter's angles and the node's matrix; pitch 0 and yaw 0 point along −Z.
// - Forces add up as acceleration; velocity += acceleration · dt / mass, and a particle moves by
//   velocity · scale · dt, with the start speed also multiplied by the pdxparticle `scale`.
// - A sprite-sheet tile is drawn at random per particle and kept for its life.
// - Steps are at least 0.1 s long or a quarter of the frame, whichever is longer.
//
// What is a stand-in, because the game's answer is not known: the random numbers (the game seeds
// them from the clock, so no two runs match anyway), the turbulence field (a smooth noise here),
// the sign of a `point` force (here it pulls), the units of a `spin` force (radians per second
// here), and trails (drawn as camera-facing quads). Child systems are not run.

import type {
  ParticleCurve,
  ParticleSubsystem,
  ParticleSystem,
  ParticleValue,
} from './particle-system.ts';

/** A column-major 4 × 4 matrix, as WebGL takes it. */
export type Matrix4 = ArrayLike<number>;

/** One quad to draw: world position, size (before the pdxparticle scale), roll and colour. */
export interface ParticleQuad {
  x: number;
  y: number;
  z: number;
  size: number;
  /** Degrees. */
  rotation: number;
  tileX: number;
  tileY: number;
  /** 0–255 each. */
  r: number;
  g: number;
  b: number;
  a: number;
  age: number;
}

/** The MSVC `rand()` sequence the game's particles draw from, seeded by the caller. */
export class ParticleRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** 15 bits, as `rand()` returns. */
  next15(): number {
    this.state = (Math.imul(this.state, 214013) + 2531011) >>> 0;
    return (this.state >>> 16) & 0x7fff;
  }

  /** Uniform in [0, 1), from two draws joined into 30 bits. */
  unit(): number {
    const high = this.next15();
    const low = this.next15();
    return (high * 32768 + low) / 1073741824;
  }
}

/** The value of a curve at input t. */
export function curveAt(curve: ParticleCurve, t: number): number {
  const time = curve.repeat && curve.end > 0 ? t % curve.end : t;
  const x = ((time - curve.start) * 64) / (curve.end - curve.start);
  const samples = curve.samples;
  const last = samples.length - 1;
  if (!(x >= 0)) return samples[0] ?? 0;
  if (x >= last) return samples[last] ?? 0;
  const i = Math.floor(x);
  const a = samples[i] ?? 0;
  const b = samples[i + 1] ?? a;
  return a + (b - a) * (x - i);
}

interface Clock {
  readonly system: number;
  /** `undefined` at spawn, when the curves of a particle's life are skipped. */
  readonly age: number | undefined;
  readonly life: number;
}

function applyCurves(
  base: number,
  indices: readonly number[],
  curves: readonly ParticleCurve[],
  clock: Clock,
): number {
  let out = base;
  for (const index of indices) {
    const curve = curves[index];
    if (curve === undefined) continue;
    let t = clock.system;
    if (curve.time === 'life' || curve.time === 'life_abs') {
      if (clock.age === undefined) continue;
      t = curve.time === 'life_abs' ? clock.age : clock.life > 0 ? clock.age / clock.life : 0;
    }
    const sample = curveAt(curve, t);
    if (curve.op === 'add') out += sample;
    else if (curve.op === 'mul') out *= sample;
    else out = sample;
  }
  return out;
}

/** A value as a new particle (or the subsystem, once) draws it. */
export function spawnValue(
  value: ParticleValue,
  curves: readonly ParticleCurve[],
  system: number,
  random: ParticleRandom,
): number {
  const clock = { system, age: undefined, life: 1 };
  const x = applyCurves(value.base, value.curves, curves, clock);
  if (value.variation === 0 && value.variationCurves.length === 0) return x;
  const v = applyCurves(value.variation, value.variationCurves, curves, clock);
  return x + (2 * random.unit() - 1) * v;
}

/** Whether a value changes over a particle's life or the subsystem's time after its spawn. */
function updates(value: ParticleValue, curves: readonly ParticleCurve[]): boolean {
  return value.curves.some((index) => curves[index]?.time !== 'spawn');
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size0: number;
  size: number;
  roll0: number;
  roll: number;
  spun: number;
  rollSpeed: number;
  mass: number;
  color0: [number, number, number, number];
  color: [number, number, number, number];
  tileX: number;
  tileY: number;
}

interface SubsystemState {
  readonly def: ParticleSubsystem;
  readonly particles: Particle[];
  time: number;
  duration: number;
  readonly pulseDuration: number;
  readonly pulseSilence: number;
  emitting: boolean;
  timer: number;
  accumulated: number;
  readonly offset: [number, number, number];
}

const DEGREES = Math.PI / 180;
const IDENTITY: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** One running particle system, started by a state event on a node. */
export class ParticleEffect {
  private readonly states: SubsystemState[];
  private readonly random: ParticleRandom;
  private node: Matrix4 = IDENTITY;
  private previous: [number, number, number] | undefined;
  private readonly noise: TurbulenceField;
  readonly system: ParticleSystem;
  /** The pdxparticle's `scale` (1 when it has none). */
  readonly scale: number;

  /** @param seed the random sequence's start; the game seeds it from the clock. */
  constructor(system: ParticleSystem, scale = 1, seed = 1) {
    this.system = system;
    this.scale = scale;
    this.random = new ParticleRandom(seed);
    this.noise = new TurbulenceField(this.random);
    this.states = system.subsystems.map((def) => {
      const at = (value: ParticleValue): number => spawnValue(value, system.curves, 0, this.random);
      return {
        def,
        particles: [],
        time: -at(def.start),
        duration: at(def.duration),
        pulseDuration: at(def.pulseDuration),
        pulseSilence: at(def.pulseSilence),
        emitting: true,
        timer: 0,
        accumulated: 0,
        offset: [at(def.position[0]), at(def.position[1]), at(def.position[2])],
      };
    });
  }

  /** Stops the subsystems that emit forever; the particles they sent out live on. */
  stop(): void {
    for (const state of this.states) if (state.duration < 0) state.duration = state.time;
  }

  /** Whether nothing is alive and no subsystem will emit again. */
  get finished(): boolean {
    return this.states.every(
      (state) =>
        state.particles.length === 0 &&
        (state.def.maxAmount === 0 || (state.duration >= 0 && state.time > state.duration)),
    );
  }

  /** The number of live particles. */
  get count(): number {
    return this.states.reduce((sum, state) => sum + state.particles.length, 0);
  }

  /** Advances the effect by dt seconds, with the node's world matrix at the end of the step. */
  step(dt: number, node: Matrix4): void {
    this.node = node;
    const position: [number, number, number] = [node[12] ?? 0, node[13] ?? 0, node[14] ?? 0];
    const from = this.previous ?? position;
    this.previous = position;
    if (!(dt > 0)) return;
    const substep = Math.max(0.1, Math.abs(dt * 0.25));
    let done = 0;
    while (done < dt) {
      const h = Math.min(substep, dt - done);
      const t0 = done / dt;
      const t1 = (done + h) / dt;
      const lerp = (t: number): [number, number, number] => [
        from[0] + (position[0] - from[0]) * t,
        from[1] + (position[1] - from[1]) * t,
        from[2] + (position[2] - from[2]) * t,
      ];
      for (const state of this.states) this.update(state, h, lerp(t0), lerp(t1));
      done += h;
    }
  }

  /** The quads of one subsystem, in world space, in its draw order before any camera sort. */
  quads(subsystem: number): ParticleQuad[] {
    const state = this.states[subsystem];
    if (state === undefined) return [];
    const local = state.def.localSpace;
    const m = local ? withoutScale(this.node) : IDENTITY;
    return state.particles.map((p) => {
      const [x, y, z] = transform(m, p.x, p.y, p.z, 1);
      return {
        x,
        y,
        z,
        size: p.size,
        rotation: p.roll + p.spun,
        tileX: p.tileX,
        tileY: p.tileY,
        r: p.color[0],
        g: p.color[1],
        b: p.color[2],
        a: p.color[3],
        age: p.age,
      };
    });
  }

  private update(
    state: SubsystemState,
    dt: number,
    from: [number, number, number],
    to: [number, number, number],
  ): void {
    const { def } = state;
    const curves = this.system.curves;
    const particles = state.particles;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p === undefined) continue;
      p.age += dt;
      if (p.age < 0 || p.age > p.life) {
        const last = particles.pop();
        if (last !== undefined && i < particles.length) particles[i] = last;
      }
    }
    if (state.duration < 0 && state.pulseDuration > 0 && state.pulseSilence > 0) {
      state.timer += dt;
      if (state.emitting && state.timer > state.pulseDuration) {
        state.emitting = false;
        state.timer = 0;
      } else if (!state.emitting && state.timer > state.pulseSilence) {
        state.emitting = true;
        state.timer = 0;
        state.time = dt;
      }
    }
    if (
      state.time >= 0 &&
      (state.time <= state.duration || state.duration < 0) &&
      state.emitting &&
      def.maxAmount > 0
    ) {
      const rate = Math.max(0, spawnValue(def.emission, curves, state.time, this.random));
      state.accumulated += rate * dt;
      const n = Math.min(
        Math.floor(state.accumulated),
        Math.max(0, def.maxAmount - particles.length),
      );
      state.accumulated -= n;
      if (n > 0) this.spawn(state, n, from, to);
    }
    for (const p of particles) {
      const clock = { system: state.time, age: p.age, life: p.life };
      if (updates(def.size, curves)) p.size = applyCurves(p.size0, def.size.curves, curves, clock);
      if (updates(def.rotation, curves)) {
        p.roll = applyCurves(p.roll0, def.rotation.curves, curves, clock);
      }
      p.spun += dt * p.rollSpeed;
      for (let c = 0; c < 4; c++) {
        const value = def.color[c];
        if (value !== undefined && updates(value, curves)) {
          p.color[c] = clamp255(applyCurves(p.color0[c] ?? 0, value.curves, curves, clock));
        }
      }
    }
    this.applyForces(state, dt);
    state.time += dt;
  }

  private spawn(
    state: SubsystemState,
    n: number,
    from: [number, number, number],
    to: [number, number, number],
  ): void {
    const { def } = state;
    const curves = this.system.curves;
    const at = (value: ParticleValue): number => spawnValue(value, curves, state.time, this.random);
    const yaw = (at(def.emitterYaw) + 90) * -DEGREES;
    const pitch = at(def.emitterPitch) * -DEGREES;
    const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    // The emitter's matrix, by columns, and the node's (none in local space) applied after it.
    const emitter = [cy * cp, -sp, sy * cp, cy * sp, cp, sy * sp, -sy, 0, cy];
    const local = def.localSpace;
    const node = local ? IDENTITY : this.node;
    const scale = local ? 1 : this.scale;
    for (let i = 0; i < n; i++) {
      const life = at(def.life);
      const size = at(def.size);
      const roll = at(def.rotation);
      const rollSpeed = at(def.rotationSpeed);
      const mass = at(def.mass);
      const color: [number, number, number, number] = [
        clamp255(at(def.color[0])),
        clamp255(at(def.color[1])),
        clamp255(at(def.color[2])),
        clamp255(at(def.color[3])),
      ];
      const a = at(def.velocityPitch) * DEGREES;
      const b = at(def.velocityYaw) * DEGREES;
      const speed = at(def.velocity) * (scale === 1 ? 1 : scale);
      const d = [Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b)];
      const e = mul3(emitter, d[0] ?? 0, d[1] ?? 0, d[2] ?? 0);
      const [vx, vy, vz] = transform(node, e[0], e[1], e[2], 0);
      let shape: [number, number, number] = [0, 0, 0];
      if (def.emitter === 'sphere') {
        const r = at(def.sphere[0]);
        const sy2 = at(def.sphere[1]) * -DEGREES;
        const sp2 = at(def.sphere[2]) * -DEGREES;
        shape = [
          r * Math.cos(sp2) * Math.cos(sy2),
          -r * Math.sin(sp2),
          r * Math.sin(sy2) * Math.cos(sp2),
        ];
      } else if (def.emitter === 'box') {
        shape = [at(def.box[0]), at(def.box[1]), at(def.box[2])];
      }
      const s = mul3(emitter, ...shape);
      const [ox, oy, oz] = transform(node, s[0], s[1], s[2], 0);
      const t = n === 1 ? 1 : i / n;
      const base = local
        ? [0, 0, 0]
        : [
            from[0] + (to[0] - from[0]) * t,
            from[1] + (to[1] - from[1]) * t,
            from[2] + (to[2] - from[2]) * t,
          ];
      const columns = def.texture.columns;
      const rows = def.texture.rows;
      state.particles.push({
        x: (base[0] ?? 0) + state.offset[0] + ox,
        y: (base[1] ?? 0) + state.offset[1] + oy,
        z: (base[2] ?? 0) + state.offset[2] + oz,
        vx: vx * speed,
        vy: vy * speed,
        vz: vz * speed,
        age: 0,
        life,
        size0: size,
        size,
        roll0: roll,
        roll,
        spun: 0,
        rollSpeed,
        mass: mass === 0 ? 1 : mass,
        color0: [...color],
        color,
        tileX: columns > 1 ? this.random.next15() % columns : 0,
        tileY: rows > 1 ? this.random.next15() % rows : 0,
      });
    }
  }

  private applyForces(state: SubsystemState, dt: number): void {
    const { def } = state;
    const particles = state.particles;
    if (particles.length === 0) return;
    const scale = def.localSpace ? 1 : this.scale;
    const curves = this.system.curves;
    const shared = def.slaveParticles > 0;
    const m = shared
      ? Math.floor(particles.length / (def.slaveParticles + 1)) + 1
      : particles.length;
    const accel = new Float64Array(m * 3);
    for (const index of def.forces) {
      const force = this.system.forces[index];
      if (force === undefined) continue;
      const amount = spawnValue(force.amount, curves, state.time, this.random);
      if (amount === 0) continue;
      const [dx, dy, dz] = force.direction;
      const centre = force.localForce
        ? transform(this.node, force.position[0], force.position[1], force.position[2], 1)
        : force.position;
      if (force.type === 'spin') {
        rotateAbout(particles, centre, force.direction, amount * dt);
        continue;
      }
      if (force.type === 'turbulence') this.noise.advance(state.time);
      for (let i = 0; i < m; i++) {
        const p = particles[i];
        if (p === undefined) continue;
        let ax = 0;
        let ay = 0;
        let az = 0;
        if (force.type === 'planar') {
          ax = amount * dx;
          ay = amount * dy;
          az = amount * dz;
        } else if (force.type === 'point') {
          const qx = centre[0] - p.x;
          const qy = centre[1] - p.y;
          const qz = centre[2] - p.z;
          const length = Math.hypot(qx, qy, qz);
          if (length > 1e-6) {
            const k = (amount * scale) / length;
            ax = k * qx;
            ay = k * qy;
            az = k * qz;
          }
        } else if (force.type === 'vortex') {
          const axis = normalise(dx, dy, dz);
          let qx = p.x - centre[0];
          let qy = p.y - centre[1];
          let qz = p.z - centre[2];
          const along = qx * axis[0] + qy * axis[1] + qz * axis[2];
          qx -= along * axis[0];
          qy -= along * axis[1];
          qz -= along * axis[2];
          const length = Math.hypot(qx, qy, qz);
          if (length > 1e-6) {
            const k = (amount * scale) / length;
            const c = Math.cos(force.yaw * DEGREES);
            const s = Math.sin(force.yaw * DEGREES);
            ax = k * (c * qx + s * (qy * axis[2] - qz * axis[1]));
            ay = k * (c * qy + s * (qz * axis[0] - qx * axis[2]));
            az = k * (c * qz + s * (qx * axis[1] - qy * axis[0]));
          }
        } else if (force.type === 'friction') {
          ax = -p.vx * amount;
          ay = -p.vy * amount;
          az = -p.vz * amount;
        } else if (force.type === 'turbulence') {
          const [nx, ny, nz] = this.noise.at(p.x, p.y, p.z);
          ax = amount * nx;
          ay = amount * ny;
          az = amount * nz;
        }
        accel[i * 3] = (accel[i * 3] ?? 0) + ax;
        accel[i * 3 + 1] = (accel[i * 3 + 1] ?? 0) + ay;
        accel[i * 3 + 2] = (accel[i * 3 + 2] ?? 0) + az;
      }
    }
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p === undefined) continue;
      const j = (i % m) * 3;
      const k = dt / p.mass;
      p.vx += (accel[j] ?? 0) * k;
      p.vy += (accel[j + 1] ?? 0) * k;
      p.vz += (accel[j + 2] ?? 0) * k;
      p.x += p.vx * scale * dt;
      p.y += p.vy * scale * dt;
      p.z += p.vz * scale * dt;
    }
  }
}

/**
 * A stand-in for the game's turbulence: 256 random unit gradients turning about random axes,
 * read as smooth gradient noise, one sample per axis. The game's field has the same parts; how
 * it reads them is not known.
 */
class TurbulenceField {
  private readonly base: Float64Array;
  private readonly axes: Float64Array;
  private readonly speeds: Float64Array;
  private readonly gradients: Float64Array;
  private readonly permutation: Uint8Array;
  private time = Number.NaN;

  constructor(random: ParticleRandom) {
    this.base = new Float64Array(256 * 3);
    this.axes = new Float64Array(256 * 3);
    this.speeds = new Float64Array(256);
    this.gradients = new Float64Array(256 * 3);
    this.permutation = new Uint8Array(512);
    const unitVector = (): [number, number, number] => {
      const z = 2 * random.unit() - 1;
      const a = 2 * Math.PI * random.unit();
      const r = Math.sqrt(1 - z * z);
      return [r * Math.cos(a), r * Math.sin(a), z];
    };
    for (let i = 0; i < 256; i++) {
      this.base.set(unitVector(), i * 3);
      this.axes.set(unitVector(), i * 3);
      this.speeds[i] = Math.PI * (1 + random.unit());
      this.permutation[i] = i;
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random.unit() * (i + 1));
      const swap = this.permutation[i] ?? 0;
      this.permutation[i] = this.permutation[j] ?? 0;
      this.permutation[j] = swap;
    }
    for (let i = 0; i < 256; i++) this.permutation[i + 256] = this.permutation[i] ?? 0;
    this.gradients.set(this.base);
  }

  advance(time: number): void {
    if (time === this.time) return;
    this.time = time;
    for (let i = 0; i < 256; i++) {
      const g = [this.base[i * 3] ?? 0, this.base[i * 3 + 1] ?? 0, this.base[i * 3 + 2] ?? 0];
      const k = [this.axes[i * 3] ?? 0, this.axes[i * 3 + 1] ?? 0, this.axes[i * 3 + 2] ?? 0];
      const angle = (this.speeds[i] ?? 0) * time;
      this.gradients.set(rodrigues(g, k, angle), i * 3);
    }
  }

  at(x: number, y: number, z: number): [number, number, number] {
    return [
      this.noise(x, y, z),
      this.noise(x + 31.4, y - 17.2, z + 5.9),
      this.noise(x - 8.3, y + 23.1, z - 41.7),
    ];
  }

  private noise(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fy = y - yi;
    const fz = z - zi;
    const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
    const u = fade(fx);
    const v = fade(fy);
    const w = fade(fz);
    const p = this.permutation;
    const corner = (dx: number, dy: number, dz: number): number => {
      const h = p[(p[(p[(xi + dx) & 255] ?? 0) + ((yi + dy) & 255)] ?? 0) + ((zi + dz) & 255)] ?? 0;
      return (
        (this.gradients[h * 3] ?? 0) * (fx - dx) +
        (this.gradients[h * 3 + 1] ?? 0) * (fy - dy) +
        (this.gradients[h * 3 + 2] ?? 0) * (fz - dz)
      );
    };
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
    return lerp(
      lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), u), lerp(corner(0, 1, 0), corner(1, 1, 0), u), v),
      lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), u), lerp(corner(0, 1, 1), corner(1, 1, 1), u), v),
      w,
    );
  }
}

function rodrigues(v: number[], k: number[], angle: number): [number, number, number] {
  const [vx = 0, vy = 0, vz = 0] = v;
  const [kx = 0, ky = 0, kz = 0] = k;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = kx * vx + ky * vy + kz * vz;
  return [
    vx * c + (ky * vz - kz * vy) * s + kx * dot * (1 - c),
    vy * c + (kz * vx - kx * vz) * s + ky * dot * (1 - c),
    vz * c + (kx * vy - ky * vx) * s + kz * dot * (1 - c),
  ];
}

function rotateAbout(
  particles: Particle[],
  centre: readonly number[],
  direction: readonly number[],
  angle: number,
): void {
  const axis = normalise(direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0);
  if (axis[0] === 0 && axis[1] === 0 && axis[2] === 0) return;
  const [cx = 0, cy = 0, cz = 0] = centre;
  for (const p of particles) {
    const [x, y, z] = rodrigues([p.x - cx, p.y - cy, p.z - cz], axis, angle);
    p.x = cx + x;
    p.y = cy + y;
    p.z = cz + z;
  }
}

function normalise(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z);
  return length > 0 ? [x / length, y / length, z / length] : [0, 0, 0];
}

function clamp255(value: number): number {
  return Math.min(255, Math.max(0, value));
}

/** A 3 × 3 matrix by columns times a vector. */
function mul3(m: readonly number[], x: number, y: number, z: number): [number, number, number] {
  return [
    (m[0] ?? 0) * x + (m[3] ?? 0) * y + (m[6] ?? 0) * z,
    (m[1] ?? 0) * x + (m[4] ?? 0) * y + (m[7] ?? 0) * z,
    (m[2] ?? 0) * x + (m[5] ?? 0) * y + (m[8] ?? 0) * z,
  ];
}

/** A column-major 4 × 4 matrix times (x, y, z, w). */
function transform(
  m: Matrix4,
  x: number,
  y: number,
  z: number,
  w: number,
): [number, number, number] {
  return [
    (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0) * w,
    (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0) * w,
    (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0) * w,
  ];
}

/** The matrix with each axis column scaled to length 1. */
function withoutScale(m: Matrix4): number[] {
  const out = Array.from(m);
  for (let c = 0; c < 3; c++) {
    const length = Math.hypot(out[c * 4] ?? 0, out[c * 4 + 1] ?? 0, out[c * 4 + 2] ?? 0);
    if (length > 0) for (let r = 0; r < 3; r++) out[c * 4 + r] = (out[c * 4 + r] ?? 0) / length;
  }
  return out;
}
