// A player of a particle system (etch#631, steps 3 to 6), for the entity preview. It runs a
// `ParticleSystem` (`particle-system.ts`) the way the EU4 engine lab read EU4 1.37.5's update in
// the game's code, and gives each frame's camera-facing quads to the renderer.
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
// - Random numbers (step 6): one MSVC `rand()` sequence per effect, two steps to a 30-bit number
//   (the second step's 15 bits on top), drawn in the game's order: each subsystem's position,
//   duration, start and pulse values; then the turbulence fields; every frame a subsystem's
//   emission and its forces' amounts; and at a spawn of n particles each value n times in turn
//   (life, size, the particle's yaw, pitch and roll, the three turn speeds, mass, the four
//   colours), the emitter's yaw and pitch once, the velocity's pitch, yaw and speed, the shape's
//   three values, and two tile draws per particle. A value without variation draws nothing.
// - Steps are at least 0.1 s long or a quarter of the frame, whichever is longer.
//
// - Forces (step 4): `planar` pushes along its direction; `point` pushes away from its centre for
//   a positive amount, as hard at any distance; `vortex` pushes out from its axis (as written,
//   not made length 1) and turns round it by its yaw; `friction` is −velocity × amount; a
//   centre is the force's position × scale, moved by the node's position with `local_force`.
//   `turbulence` reads the game's field.
// - `spin` (step 5): each step a particle's place is turned by amount · dt radians about the
//   axis through the centre, and the push takes it along that chord while cancelling the
//   velocity it had along the turn. Nothing pulls it back towards the axis, so it spirals
//   outwards, faster with a larger scale; a test in the game showed the same outward spiral.
// - A trail subsystem keeps its particles in the order they came out.
// - Child systems (step 10): a subsystem's `childsystem` blocks are subsystems of their own that
//   each of its particles emits from where it is. A parent has one of `max_amount` slots, and
//   each slot keeps one block per child: its time (from minus its `start`), duration, pulses and
//   emission, which go on from parent to parent in that slot and are not reset; only its
//   particles are its own. A child runs while its slot's parent lives or waits: it emits only
//   while the parent lives, from the parent's last place to its new one, with no turn (a
//   world-space child) or at the origin (`local_space`), and a dead parent keeps its slot,
//   undrawn, until its children are gone.
// - What is drawn in what order (step 11): see `layers`.
//
// What differs: the seed of the random numbers (the game takes it from the clock, so no two of its
// runs match either), and the order of the draws of an effect with child systems.

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

  /** 30 bits from two draws, the second on top, as the game joins them. */
  next30(): number {
    const low = this.next15();
    return this.next15() * 32768 + low;
  }

  /** Uniform in [0, 1): `next30()` / 2^30. */
  unit(): number {
    return this.next30() / 1073741824;
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
  /** Its slot among the subsystem's, for an effect with child systems; -1 without. */
  slot: number;
  /** Where it was before this step's move, which its children emit from. */
  px: number;
  py: number;
  pz: number;
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
  /** Per slot (`max_amount` of them), one state for each child subsystem; none without. */
  readonly slots: readonly (readonly SubsystemState[])[];
  /** Whether a live or waiting parent holds each slot. */
  readonly used: boolean[];
  /** Dead parents that keep their slot until their children are gone, not drawn. */
  readonly waiting: Particle[];
}

const DEGREES = Math.PI / 180;
/** Closer to a `point` or `vortex` force's centre than this, it gives no push. */
const NEAR = 0.01;
const IDENTITY: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** One running particle system, started by a state event on a node. */
export class ParticleEffect {
  private readonly states: SubsystemState[];
  private readonly random: ParticleRandom;
  private node: Matrix4 = IDENTITY;
  private previous: [number, number, number] | undefined;
  /** One per `turbulence` force of the effect, in its order. */
  private readonly fields: TurbulenceField[];
  readonly system: ParticleSystem;
  /** The pdxparticle's `scale` (1 when it has none). */
  readonly scale: number;

  /** @param seed the random sequence's start; the game seeds it from the clock. */
  constructor(system: ParticleSystem, scale = 1, seed = 1) {
    this.system = system;
    this.scale = scale;
    this.random = new ParticleRandom(seed);
    this.states = system.subsystems.map((def) => this.newState(def));
    this.fields = system.forces
      .filter((force) => force.type === 'turbulence')
      .map((force) => new TurbulenceField(this.random, force.division));
  }

  /** A subsystem's state, with its children's blocks for every slot first. */
  private newState(def: ParticleSubsystem): SubsystemState {
    const slots =
      def.children.length === 0
        ? []
        : Array.from({ length: def.maxAmount }, () =>
            def.children.map((child) => this.newState(child)),
          );
    const at = (value: ParticleValue): number =>
      spawnValue(value, this.system.curves, 0, this.random);
    // The game's order of these draws.
    const offset: [number, number, number] = [
      at(def.position[0]),
      at(def.position[1]),
      at(def.position[2]),
    ];
    const duration = at(def.duration);
    const start = at(def.start);
    const pulseDuration = at(def.pulseDuration);
    const pulseSilence = at(def.pulseSilence);
    return {
      def,
      particles: [],
      time: -start,
      duration,
      pulseDuration,
      pulseSilence,
      emitting: true,
      timer: 0,
      accumulated: 0,
      offset,
      slots,
      used: slots.map(() => false),
      waiting: [],
    };
  }

  /**
   * Stops an effect that emits forever, as the game does when its state ends: when a subsystem
   * emits forever, every subsystem's `duration` becomes its time so far, so none emits again
   * and the particles live out their life. (A subsystem still waiting for its `start` gets a
   * duration below 0, so it emits forever after all, as in the game.)
   */
  stop(): void {
    if (!this.states.some((state) => state.duration < 0)) return;
    for (const state of this.states) state.duration = state.time;
  }

  /** Whether nothing is alive and no subsystem will emit again. */
  get finished(): boolean {
    return (
      this.count === 0 &&
      this.states.every(
        (state) =>
          state.waiting.length === 0 &&
          (state.def.maxAmount === 0 || (state.duration >= 0 && state.time > state.duration)),
      )
    );
  }

  /** The number of live particles, children's too. */
  get count(): number {
    return this.states.reduce((sum, state) => sum + alive(state), 0);
  }

  /** Advances the effect by dt seconds, with the node's world matrix at the end of the step. */
  step(dt: number, node: Matrix4): void {
    this.node = node;
    const position: [number, number, number] = [node[12] ?? 0, node[13] ?? 0, node[14] ?? 0];
    const from = this.previous ?? position;
    this.previous = position;
    // A step this short is rounding noise, such as the leftover of a replay to a frame: the spin
    // force divides by dt², which would turn that noise into a throw (etch#725).
    if (!(dt > MIN_STEP)) return;
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
    return state === undefined ? [] : this.quadsOf(state);
  }

  /**
   * What to draw, in the game's order (step 11): each subsystem, then for each of its particles
   * (the live ones, then the dead ones that wait for their children) each child system's own
   * particles, and theirs in turn. A child's particles are one layer per parent. The game draws
   * an effect's layers that are not trails in this order, then its trails in this order.
   */
  layers(): { readonly subsystem: ParticleSubsystem; readonly quads: ParticleQuad[] }[] {
    const out: { subsystem: ParticleSubsystem; quads: ParticleQuad[] }[] = [];
    const visit = (state: SubsystemState): void => {
      out.push({ subsystem: state.def, quads: this.quadsOf(state) });
      if (state.slots.length === 0) return;
      for (const p of [...state.particles, ...state.waiting]) {
        for (const child of state.slots[p.slot] ?? []) visit(child);
      }
    };
    for (const state of this.states) visit(state);
    return out;
  }

  private quadsOf(state: SubsystemState): ParticleQuad[] {
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

  /**
   * Runs a subsystem for dt seconds; `emits` is false for a child whose parent is dead, and
   * `node` turns what it emits (none for a child).
   */
  private update(
    state: SubsystemState,
    dt: number,
    from: [number, number, number],
    to: [number, number, number],
    emits = true,
    node: Matrix4 = this.node,
  ): void {
    const { def } = state;
    const curves = this.system.curves;
    const particles = state.particles;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p === undefined) continue;
      p.age += dt;
      if (p.age < 0 || p.age > p.life) {
        // A parent whose children live keeps its slot until they are gone.
        if (p.slot >= 0) {
          if ((state.slots[p.slot] ?? []).some((child) => alive(child) > 0)) {
            state.waiting.push(p);
          } else {
            state.used[p.slot] = false;
          }
        }
        // A trail keeps its particles in the order they came out, the band's order.
        if (def.trail) {
          particles.splice(i, 1);
          continue;
        }
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
      emits &&
      state.time >= 0 &&
      (state.time <= state.duration || state.duration < 0) &&
      state.emitting
    ) {
      const rate = Math.max(0, spawnValue(def.emission, curves, state.time, this.random));
      state.accumulated += rate * dt;
      const n = Math.min(
        Math.floor(state.accumulated),
        Math.max(0, def.maxAmount - particles.length - state.waiting.length),
      );
      state.accumulated -= n;
      if (n > 0) this.spawn(state, n, from, to, node);
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
    // Every field turns to this subsystem's time before its forces, as in the game.
    if (particles.length > 0) for (const field of this.fields) field.setTime(state.time);
    for (const p of particles) {
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
    }
    this.applyForces(state, dt);
    state.time += dt;
    if (state.slots.length > 0) this.updateChildren(state, dt);
  }

  /** Runs the children of each live and each waiting parent, and frees the slots they leave. */
  private updateChildren(state: SubsystemState, dt: number): void {
    const run = (p: Particle, emits: boolean): void => {
      for (const child of state.slots[p.slot] ?? []) {
        const local = child.def.localSpace;
        this.update(
          child,
          dt,
          local ? [0, 0, 0] : [p.px, p.py, p.pz],
          local ? [0, 0, 0] : [p.x, p.y, p.z],
          emits,
          IDENTITY,
        );
      }
    };
    for (const p of state.particles) run(p, true);
    for (const p of state.waiting) run(p, false);
    for (let i = state.waiting.length - 1; i >= 0; i--) {
      const p = state.waiting[i];
      if (p === undefined) continue;
      if ((state.slots[p.slot] ?? []).some((child) => alive(child) > 0)) continue;
      state.used[p.slot] = false;
      state.waiting.splice(i, 1);
    }
  }

  private spawn(
    state: SubsystemState,
    n: number,
    from: [number, number, number],
    to: [number, number, number],
    emitterNode: Matrix4,
  ): void {
    const { def } = state;
    const curves = this.system.curves;
    const at = (value: ParticleValue): number => spawnValue(value, curves, state.time, this.random);
    // The game draws each value for all n particles before the next value.
    const column = (value: ParticleValue): number[] => Array.from({ length: n }, () => at(value));
    const life = column(def.life);
    const size = column(def.size);
    column(def.particleYaw);
    column(def.particlePitch);
    const roll = column(def.rotation);
    column(def.rotationSpeedYaw);
    column(def.rotationSpeedPitch);
    const rollSpeed = column(def.rotationSpeed);
    const mass = column(def.mass);
    const colors = [
      column(def.color[0]),
      column(def.color[1]),
      column(def.color[2]),
      column(def.color[3]),
    ];
    const yaw = (at(def.emitterYaw) + 90) * -DEGREES;
    const pitch = at(def.emitterPitch) * -DEGREES;
    const velocityPitch = column(def.velocityPitch);
    const velocityYaw = column(def.velocityYaw);
    const velocity = column(def.velocity);
    // A sphere and a box draw the same three values; only their offset differs.
    const shapes =
      def.emitter === 'point'
        ? undefined
        : [column(def.shape[0]), column(def.shape[1]), column(def.shape[2])];
    const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    // The emitter's matrix, by columns, and the node's (none in local space) applied after it.
    const emitter = [cy * cp, -sp, sy * cp, cy * sp, cp, sy * sp, -sy, 0, cy];
    const local = def.localSpace;
    const node = local ? IDENTITY : emitterNode;
    const scale = local ? 1 : this.scale;
    for (let i = 0; i < n; i++) {
      const color = colors.map((values) => clamp255(values[i] ?? 0)) as [
        number,
        number,
        number,
        number,
      ];
      const a = (velocityPitch[i] ?? 0) * DEGREES;
      const b = (velocityYaw[i] ?? 0) * DEGREES;
      const speed = (velocity[i] ?? 0) * (scale === 1 ? 1 : scale);
      const d = [Math.cos(a) * Math.cos(b), Math.sin(a), -Math.cos(a) * Math.sin(b)];
      const e = mul3(emitter, d[0] ?? 0, d[1] ?? 0, d[2] ?? 0);
      const [vx, vy, vz] = transform(node, e[0], e[1], e[2], 0);
      let shape: [number, number, number] = [0, 0, 0];
      const [s0 = 0, s1 = 0, s2 = 0] = shapes?.map((values) => values[i] ?? 0) ?? [];
      if (def.emitter === 'sphere') {
        const sy2 = s1 * -DEGREES;
        const sp2 = s2 * -DEGREES;
        shape = [
          s0 * Math.cos(sp2) * Math.cos(sy2),
          -s0 * Math.sin(sp2),
          s0 * Math.sin(sy2) * Math.cos(sp2),
        ];
      } else if (def.emitter === 'box') {
        shape = [s0, s1, s2];
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
      // A parent takes the first free slot; the blocks there keep their time.
      const slot = state.used.indexOf(false);
      if (slot >= 0) {
        state.used[slot] = true;
        for (const child of state.slots[slot] ?? []) child.particles.length = 0;
      }
      const x = (base[0] ?? 0) + state.offset[0] + ox;
      const y = (base[1] ?? 0) + state.offset[1] + oy;
      const z = (base[2] ?? 0) + state.offset[2] + oz;
      state.particles.push({
        x,
        y,
        z,
        vx: vx * speed,
        vy: vy * speed,
        vz: vz * speed,
        age: 0,
        life: life[i] ?? 0,
        size0: size[i] ?? 0,
        size: size[i] ?? 0,
        roll0: roll[i] ?? 0,
        roll: roll[i] ?? 0,
        spun: 0,
        rollSpeed: rollSpeed[i] ?? 0,
        mass: mass[i] === 0 ? 1 : (mass[i] ?? 1),
        color0: [...color],
        color,
        // The game draws both tiles even for a sheet of one.
        tileX: this.random.next30() % columns,
        tileY: this.random.next30() % rows,
        slot,
        px: x,
        py: y,
        pz: z,
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
    // A subsystem's n-th turbulence force reads the effect's n-th field. As in the game, a force
    // whose amount is 0 at the moment is skipped before it is counted, so the next turbulence
    // force reads the field the skipped one would have read (etch#725).
    let turbulence = 0;
    for (const index of def.forces) {
      const force = this.system.forces[index];
      if (force === undefined) continue;
      const amount = spawnValue(force.amount, curves, state.time, this.random);
      if (amount === 0) continue;
      const [dx, dy, dz] = force.direction;
      // The centre is the force's position times the scale, moved by the node's position (not
      // turned) with `local_force`.
      const centre = [
        force.position[0] * scale + (force.localForce ? (this.node[12] ?? 0) : 0),
        force.position[1] * scale + (force.localForce ? (this.node[13] ?? 0) : 0),
        force.position[2] * scale + (force.localForce ? (this.node[14] ?? 0) : 0),
      ] as const;
      const field = force.type === 'turbulence' ? this.fields[turbulence++] : undefined;
      if (force.type === 'spin') {
        if (dt > 0) spin(particles, m, accel, centre, force.direction, amount, scale, dt);
        continue;
      }
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
          // Away from the centre for a positive amount, at the same strength at any distance.
          const qx = p.x - centre[0];
          const qy = p.y - centre[1];
          const qz = p.z - centre[2];
          const length = Math.hypot(qx, qy, qz);
          if (length > NEAR) {
            const k = (amount * scale) / length;
            ax = k * qx;
            ay = k * qy;
            az = k * qz;
          }
        } else if (force.type === 'vortex') {
          // The direction as written, not made length 1.
          let qx = p.x - centre[0];
          let qy = p.y - centre[1];
          let qz = p.z - centre[2];
          const along = qx * dx + qy * dy + qz * dz;
          qx -= along * dx;
          qy -= along * dy;
          qz -= along * dz;
          const length = Math.hypot(qx, qy, qz);
          if (length > NEAR) {
            const k = (amount * scale) / length;
            const c = Math.cos(force.yaw * DEGREES);
            const s = Math.sin(force.yaw * DEGREES);
            ax = k * (c * qx + s * (qy * dz - qz * dy));
            ay = k * (c * qy + s * (qz * dx - qx * dz));
            az = k * (c * qz + s * (qx * dy - qy * dx));
          }
        } else if (force.type === 'friction') {
          ax = -p.vx * amount;
          ay = -p.vy * amount;
          az = -p.vz * amount;
        } else if (field !== undefined) {
          const [nx, ny, nz] = field.direction(p.x, p.y, p.z);
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
 * The game's turbulence field, as the EU4 engine lab read it: 256 random unit gradients, each
 * turning about its own random axis at π to 2π radians a second of the subsystem's time, read as
 * gradient noise with linear weights on a lattice of 1 unit. A force's push is |amount| along the
 * direction of three samples of that noise at shifted points.
 *
 * Two quirks of the game's code are kept: the cell of a coordinate is found by cutting off its
 * fraction (so below 0 each cell is mirrored), and the hash reads past the 256-byte permutation
 * into the bytes of the turning gradients, which sit right after it.
 */
class TurbulenceField {
  /** The permutation, then the turning gradients: the hash can read into them. */
  private readonly bytes: Uint8Array;
  private readonly gradients: Float32Array;
  private readonly base = new Float32Array(256 * 3);
  private readonly axes = new Float32Array(256 * 3);
  private readonly speeds = new Float32Array(256);
  private readonly division: number;
  private calls = 0;

  constructor(random: ParticleRandom, division: number) {
    const buffer = new ArrayBuffer(256 + 256 * 12);
    this.bytes = new Uint8Array(buffer);
    this.gradients = new Float32Array(buffer, 256, 256 * 3);
    const unit = (): number => random.unit();
    const unitVector = (): [number, number, number] => {
      for (;;) {
        const x = (unit() - 0.5) * 2;
        const y = (unit() - 0.5) * 2;
        const z = (unit() - 0.5) * 2;
        const length2 = x * x + y * y + z * z;
        if (length2 <= 1 && length2 >= 0.001) return normalise(x, y, z);
      }
    };
    for (let i = 0; i < 256; i++) {
      this.base.set(unitVector(), i * 3);
      this.axes.set(unitVector(), i * 3);
      this.speeds[i] = unit() * Math.PI + Math.PI;
      this.bytes[i] = i;
    }
    this.gradients.set(this.base);
    for (let i = 1; i < 256; i++) {
      const j = random.next30() % (i + 1);
      const swap = this.bytes[i] ?? 0;
      this.bytes[i] = this.bytes[j] ?? 0;
      this.bytes[j] = swap;
    }
    // The game rounds `division` up to a divisor of 256: each call turns that share of them.
    let d = Math.trunc(division);
    if (!(d >= 1)) d = 1;
    else if (d > 256) d = 256;
    else while (256 % d !== 0) d++;
    this.division = d;
  }

  /** Turns the next share of the gradients to their angle at `time` from where they began. */
  setTime(time: number): void {
    this.calls %= this.division;
    const count = 256 / this.division;
    const first = this.calls * count;
    for (let i = first; i < first + count; i++) {
      const g = [this.base[i * 3] ?? 0, this.base[i * 3 + 1] ?? 0, this.base[i * 3 + 2] ?? 0];
      const k = [this.axes[i * 3] ?? 0, this.axes[i * 3 + 1] ?? 0, this.axes[i * 3 + 2] ?? 0];
      this.gradients.set(rodrigues(g, k, time * (this.speeds[i] ?? 0)), i * 3);
    }
    this.calls++;
  }

  /** The unit direction of the push at a point, or zeros where all three samples are 0. */
  direction(x: number, y: number, z: number): [number, number, number] {
    return normalise(
      this.sample(x, y, z),
      this.sample(y + 31.416, z - 47.853, x + 12.793),
      this.sample(z - 233.145, x - 113.408, y - 185.31),
    );
  }

  private sample(a: number, b: number, c: number): number {
    const ia = Math.trunc(a) | 0;
    const ib = Math.trunc(b) | 0;
    const ic = Math.trunc(c) | 0;
    const fa = Math.abs(a - ia);
    const fb = Math.abs(b - ib);
    const fc = Math.abs(c - ic);
    const bytes = this.bytes;
    const g = this.gradients;
    // Only the indices are wrapped to 0–255, not their sums.
    const corner = (i: number, j: number, k: number, x: number, y: number, z: number): number => {
      const h =
        bytes[((ic + k) & 255) + (bytes[((ib + j) & 255) + (bytes[(ia + i) & 255] ?? 0)] ?? 0)] ??
        0;
      return (g[h * 3] ?? 0) * x + (g[h * 3 + 1] ?? 0) * y + (g[h * 3 + 2] ?? 0) * z;
    };
    const ga = fa - 1;
    const gb = fb - 1;
    const gc = fc - 1;
    const lerp = (p: number, q: number, f: number): number => p * (1 - f) + q * f;
    return lerp(
      lerp(
        lerp(corner(0, 0, 0, fa, fb, fc), corner(1, 0, 0, ga, fb, fc), fa),
        lerp(corner(0, 1, 0, fa, gb, fc), corner(1, 1, 0, ga, gb, fc), fa),
        fb,
      ),
      lerp(
        lerp(corner(0, 0, 1, fa, fb, gc), corner(1, 0, 1, ga, fb, gc), fa),
        lerp(corner(0, 1, 1, fa, gb, gc), corner(1, 1, 1, ga, gb, gc), fa),
        fb,
      ),
      fc,
    );
  }
}

function rodrigues(
  v: readonly number[],
  k: readonly number[],
  angle: number,
): [number, number, number] {
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

/**
 * Adds a `spin` force's push to the first `m` particles' accelerations, as the EU4 engine lab
 * read the game's code (etch#631 step 5). The particle's place is turned by amount · dt radians
 * about the axis through the centre (a positive amount turns +X towards +Z about +Y); the push,
 * with the step's velocity · scale · dt, moves the particle along that chord while cancelling its
 * velocity along the turn:
 *
 *   accel += mass · ((turned − place) − dt · (t · v) t) / (scale · dt²)
 *
 * where t is the direction of the turn at the particle. Nothing pulls a particle back towards
 * the axis, so the velocity it keeps across the turn carries it outwards: particles spiral away
 * from the axis, faster the larger the scale. A zero direction leaves the axis zero, and the turn
 * then shrinks the offset by cos(amount · dt), as the game's matrix does.
 */
function spin(
  particles: readonly Particle[],
  m: number,
  accel: Float64Array,
  centre: readonly number[],
  direction: readonly number[],
  amount: number,
  scale: number,
  dt: number,
): void {
  const axis = normalise(direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0);
  const [cx = 0, cy = 0, cz = 0] = centre;
  const angle = amount * dt;
  for (let i = 0; i < m; i++) {
    const p = particles[i];
    if (p === undefined) continue;
    const offset: [number, number, number] = [p.x - cx, p.y - cy, p.z - cz];
    const ahead = rodrigues(offset, axis, -angle);
    const behind = rodrigues(offset, axis, angle);
    const t = normalise(offset[0] - behind[0], offset[1] - behind[1], offset[2] - behind[2]);
    const along = t[0] * p.vx + t[1] * p.vy + t[2] * p.vz;
    const k = p.mass / (scale * dt * dt);
    accel[i * 3] = (accel[i * 3] ?? 0) + (ahead[0] - offset[0] - dt * along * t[0]) * k;
    accel[i * 3 + 1] = (accel[i * 3 + 1] ?? 0) + (ahead[1] - offset[1] - dt * along * t[1]) * k;
    accel[i * 3 + 2] = (accel[i * 3 + 2] ?? 0) + (ahead[2] - offset[2] - dt * along * t[2]) * k;
  }
}

/** The live particles of a subsystem and of all its slots' children. */
function alive(state: SubsystemState): number {
  let n = state.particles.length;
  for (const slot of state.slots) for (const child of slot) n += alive(child);
  return n;
}

/** The shortest step the effect runs; shorter ones are rounding noise and change nothing. */
const MIN_STEP = 1e-9;

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
