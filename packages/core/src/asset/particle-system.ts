// A particle system read for drawing (etch#631, step 3): a `particle` block of an `.asset` file
// turned into plain data that the entity preview's player (`particle-player.ts`) runs. The data
// is what EU4 1.37.5 builds when it loads the block, as the EU4 engine lab read it in the game's
// code and checked it in the game (step 2):
//
// - A value (`size = { 0.75,size_increase 0.4 }`) is a value list and a variation list. The last
//   number of a list is its base; its curves are kept in two passes, those of `time = spawn` first,
//   then the others in list order. A curve name no `animation` block has is left out.
// - A curve is 64 samples of a Catmull-Rom spline through its points, with phantom end points,
//   mapped from 0–1 onto `minValue`–`maxValue`. Its `time` is case-sensitive: any text other than
//   `life`, `life_abs` and `system` is `spawn`. A `duration` of 0 or less becomes 1.
// - A subsystem's `force` list names the effect's `force` blocks; unknown names are left out.
//
// Nothing here depends on the editor or the browser, so the data can be sent to the webview.

import type { BlockNode, EntryNode, ScalarNode } from '../script/tree.ts';
import { keyOf } from '../model/properties.ts';

/** What a curve's input is: the subsystem's time, or the particle's age in seconds or in lives. */
export type CurveTime = 'spawn' | 'system' | 'life_abs' | 'life';

export const CURVE_SAMPLES = 64;

export interface ParticleCurve {
  readonly name: string;
  readonly time: CurveTime;
  readonly start: number;
  /** `start` + `duration`. */
  readonly end: number;
  readonly repeat: boolean;
  readonly op: 'add' | 'mul' | 'abs';
  /** `CURVE_SAMPLES` values, already in `minValue`–`maxValue`. */
  readonly samples: readonly number[];
}

/** A value: a base with curves, and a variation with curves (indices into the system's curves). */
export interface ParticleValue {
  readonly base: number;
  readonly curves: readonly number[];
  readonly variation: number;
  readonly variationCurves: readonly number[];
}

export type ForceType = 'planar' | 'point' | 'vortex' | 'friction' | 'turbulence' | 'spin';

export interface ParticleForce {
  readonly name: string;
  readonly type: ForceType | undefined;
  readonly amount: ParticleValue;
  readonly direction: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  /** Degrees. */
  readonly yaw: number;
  readonly division: number;
  readonly localForce: boolean;
}

export type ParticleShader = 'alpha' | 'premultiplied' | 'additive';

export interface ParticleSubsystem {
  readonly maxAmount: number;
  readonly sort: 'none' | 'depth' | 'distance' | 'age';
  readonly invert: boolean;
  readonly texture: {
    readonly file: string | undefined;
    /** The effect as written (`ParticleAlphaBlend`), and the blend it draws with. */
    readonly effect: string | undefined;
    readonly shader: ParticleShader;
    readonly columns: number;
    readonly rows: number;
  };
  readonly start: ParticleValue;
  readonly duration: ParticleValue;
  readonly pulseDuration: ParticleValue;
  readonly pulseSilence: ParticleValue;
  readonly emission: ParticleValue;
  readonly emitterYaw: ParticleValue;
  readonly emitterPitch: ParticleValue;
  readonly velocityYaw: ParticleValue;
  readonly velocityPitch: ParticleValue;
  readonly velocity: ParticleValue;
  readonly size: ParticleValue;
  readonly life: ParticleValue;
  readonly position: readonly [ParticleValue, ParticleValue, ParticleValue];
  /** Roll on screen, degrees (`rotation` or `particle_roll`). */
  readonly rotation: ParticleValue;
  readonly rotationSpeed: ParticleValue;
  readonly mass: ParticleValue;
  readonly color: readonly [ParticleValue, ParticleValue, ParticleValue, ParticleValue];
  readonly emitter: 'point' | 'sphere' | 'box';
  readonly sphere: readonly [ParticleValue, ParticleValue, ParticleValue];
  readonly box: readonly [ParticleValue, ParticleValue, ParticleValue];
  /** Indices into the system's forces. */
  readonly forces: readonly number[];
  readonly localSpace: boolean;
  readonly trail: boolean;
  readonly billboard: boolean;
  readonly slaveParticles: number;
}

export interface ParticleSystem {
  readonly name: string;
  readonly curves: readonly ParticleCurve[];
  readonly forces: readonly ParticleForce[];
  readonly subsystems: readonly ParticleSubsystem[];
}

const ZERO: ParticleValue = { base: 0, curves: [], variation: 0, variationCurves: [] };

function constant(base: number): ParticleValue {
  return { base, curves: [], variation: 0, variationCurves: [] };
}

/** The `particle` block named `name` (any case) among a file's entries, or `undefined`. */
export function findParticleBlock(
  entries: readonly EntryNode[],
  name: string,
): BlockNode | undefined {
  let found: BlockNode | undefined;
  for (const block of propertyBlocks(entries, 'particle')) {
    if (lastScalar(block, 'name')?.text.toLowerCase() === name.toLowerCase()) found = block;
  }
  return found;
}

/** A `particle` block as the game loads it. */
export function readParticleSystem(block: BlockNode): ParticleSystem {
  const curves: ParticleCurve[] = [];
  const curveIndex = new Map<string, number>();
  for (const node of propertyBlocks(block.entries, 'animation')) {
    const curve = readCurve(node);
    if (curve === undefined) continue;
    curveIndex.set(curve.name.toLowerCase(), curves.length);
    curves.push(curve);
  }
  const value = (node: ScalarNode | BlockNode | undefined, fallback = ZERO): ParticleValue =>
    node === undefined ? fallback : readValue(node, curves, curveIndex);
  const forces: ParticleForce[] = [];
  const forceIndex = new Map<string, number>();
  for (const node of propertyBlocks(block.entries, 'force')) {
    const name = lastScalar(node, 'name')?.text ?? '';
    const type = lastScalar(node, 'type')?.text.toLowerCase();
    forceIndex.set(name.toLowerCase(), forces.length);
    forces.push({
      name,
      type: FORCE_TYPES.find((known) => known === type),
      amount: value(lastValue(node, 'amount')),
      direction: vector(lastValue(node, 'direction')),
      position: vector(lastValue(node, 'position')),
      yaw: numberOf(lastScalar(node, 'yaw')) ?? 0,
      division: numberOf(lastScalar(node, 'division')) ?? 1,
      localForce: lastScalar(node, 'local_force')?.text.toLowerCase() === 'yes',
    });
  }
  const subsystems = propertyBlocks(block.entries, 'subsystem').map((node) => {
    const get = (key: string, fallback = ZERO): ParticleValue =>
      value(lastValue(node, key), fallback);
    const part = (key: string, inner: string, fallback = ZERO): ParticleValue => {
      const group = lastValue(node, key);
      return group?.kind === 'block' ? value(lastValue(group, inner), fallback) : fallback;
    };
    const texture = propertyBlocks(node.entries, 'texture').at(-1);
    const effect = texture === undefined ? undefined : lastScalar(texture, 'shader')?.text;
    const flag = (key: string, fallback = false): boolean => {
      const text = lastScalar(node, key)?.text.toLowerCase();
      return text === undefined ? fallback : text === 'yes';
    };
    const sort = lastScalar(node, 'sort')?.text.toLowerCase();
    const emitter = lastScalar(node, 'emitter_type')?.text.toLowerCase();
    const trail = flag('trail');
    return {
      maxAmount: flag('hide')
        ? 0
        : Math.max(0, Math.trunc(numberOf(lastScalar(node, 'max_amount')) ?? 0)),
      sort: sort === 'depth' || sort === 'distance' || sort === 'age' ? sort : 'none',
      invert: flag('invert'),
      texture: {
        file: texture === undefined ? undefined : lastScalar(texture, 'file')?.text,
        effect,
        shader: shaderOf(effect),
        columns: Math.max(1, Math.trunc(numberOf(texture && lastScalar(texture, 'x')) ?? 1)),
        rows: Math.max(1, Math.trunc(numberOf(texture && lastScalar(texture, 'y')) ?? 1)),
      },
      start: get('start'),
      duration: get('duration'),
      pulseDuration: get('emission_pulse_duration'),
      pulseSilence: get('emission_pulse_silence'),
      emission: get('emission'),
      emitterYaw: get('emitter_yaw'),
      emitterPitch: get('emitter_pitch'),
      velocityYaw: get('velocity_yaw'),
      velocityPitch: get('velocity_pitch'),
      velocity: get('velocity'),
      size: get('size'),
      life: get('life'),
      position: [part('position', 'x'), part('position', 'y'), part('position', 'z')],
      rotation:
        lastValue(node, 'particle_roll') === undefined ? get('rotation') : get('particle_roll'),
      rotationSpeed:
        lastValue(node, 'rotation_speed_roll') === undefined
          ? get('rotation_speed')
          : get('rotation_speed_roll'),
      mass: get('mass', constant(1)),
      // A colour channel with no value is 255.
      color: [
        part('color', 'r', constant(255)),
        part('color', 'g', constant(255)),
        part('color', 'b', constant(255)),
        part('color', 'alpha', constant(255)),
      ],
      emitter: emitter === 'sphere' || emitter === 'box' ? emitter : 'point',
      sphere: [
        get('sphere_emitter_radius'),
        get('sphere_emitter_yaw'),
        get('sphere_emitter_pitch'),
      ],
      box: [get('box_emitter_x'), get('box_emitter_y'), get('box_emitter_z')],
      forces: forceNames(node).flatMap((name) => {
        const index = forceIndex.get(name.toLowerCase());
        return index === undefined ? [] : [index];
      }),
      localSpace: flag('local_space'),
      trail,
      billboard: flag('billboard', !trail),
      slaveParticles: Math.max(0, Math.trunc(numberOf(lastScalar(node, 'slave_particles')) ?? 0)),
    } satisfies ParticleSubsystem;
  });
  return { name: lastScalar(block, 'name')?.text ?? '', curves, forces, subsystems };
}

const FORCE_TYPES: readonly ForceType[] = [
  'planar',
  'point',
  'vortex',
  'friction',
  'turbulence',
  'spin',
];

function shaderOf(effect: string | undefined): ParticleShader {
  const name = effect?.toLowerCase() ?? '';
  if (name.includes('additive')) return 'additive';
  if (name.includes('prealpha')) return 'premultiplied';
  return 'alpha';
}

function readCurve(node: BlockNode): ParticleCurve | undefined {
  const name = lastScalar(node, 'name')?.text;
  if (name === undefined) return undefined;
  const written = lastScalar(node, 'time')?.text;
  const time: CurveTime =
    written === 'life' || written === 'life_abs' || written === 'system' ? written : 'spawn';
  const start = numberOf(lastScalar(node, 'start')) ?? 0;
  const duration = numberOf(lastScalar(node, 'duration')) ?? 1;
  const op = lastScalar(node, 'op')?.text.toLowerCase();
  const min = numberOf(lastScalar(node, 'minvalue')) ?? 0;
  const max = numberOf(lastScalar(node, 'maxvalue')) ?? 1;
  const curve = lastValue(node, 'curve');
  const numbers =
    curve?.kind === 'block'
      ? curve.entries.flatMap((entry) => {
          const n = entry.kind === 'scalar' ? numberOf(entry) : undefined;
          return n === undefined ? [] : [n];
        })
      : [];
  const points: [number, number][] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2)
    points.push([numbers[i] ?? 0, numbers[i + 1] ?? 0]);
  return {
    name,
    time,
    start,
    end: start + (duration > 0 ? duration : 1),
    repeat: lastScalar(node, 'repeat')?.text.toLowerCase() === 'yes',
    op: op === 'add' || op === 'abs' ? op : 'mul',
    samples: sampleCurve(points).map((y) => min + (max - min) * y),
  };
}

/**
 * The 64 samples of a curve's points, at x = i / 63: Catmull-Rom between each pair of points,
 * with phantom end points 2p0 − p1 and 2pn − pn−1. Fewer than two points give zeros.
 */
export function sampleCurve(points: readonly (readonly [number, number])[]): number[] {
  if (points.length < 2) return new Array<number>(CURVE_SAMPLES).fill(0);
  const first = points[0] ?? [0, 0];
  const second = points[1] ?? first;
  const last = points[points.length - 1] ?? first;
  const before = points[points.length - 2] ?? last;
  const all: (readonly [number, number])[] = [
    [2 * first[0] - second[0], 2 * first[1] - second[1]],
    ...points,
    [2 * last[0] - before[0], 2 * last[1] - before[1]],
  ];
  const out: number[] = [];
  for (let i = 0; i < CURVE_SAMPLES; i++) {
    const x = i / (CURVE_SAMPLES - 1);
    let segment = 1;
    while (segment < all.length - 3 && x > (all[segment + 1]?.[0] ?? 0)) segment++;
    const p0 = all[segment - 1] ?? first;
    const p1 = all[segment] ?? first;
    const p2 = all[segment + 1] ?? last;
    const p3 = all[segment + 2] ?? last;
    const span = p2[0] - p1[0];
    const u = span === 0 ? 0 : Math.min(1, Math.max(0, (x - p1[0]) / span));
    out.push(catmullRom(p0[1], p1[1], p2[1], p3[1], u));
  }
  return out;
}

function catmullRom(a: number, b: number, c: number, d: number, u: number): number {
  return (
    0.5 *
    (2 * b +
      (c - a) * u +
      (2 * a - 5 * b + 4 * c - d) * u * u +
      (3 * b - a - 3 * c + d) * u * u * u)
  );
}

/**
 * A value as written: a scalar (`4`), or a block of up to two groups, each a comma-joined list of
 * numbers and curve names; a word after a comma continues its group (`{ 1.75, size_increase 0.4 }`).
 */
function readValue(
  node: ScalarNode | BlockNode,
  curves: readonly ParticleCurve[],
  index: ReadonlyMap<string, number>,
): ParticleValue {
  const groups: string[][] = [];
  const scalars =
    node.kind === 'scalar'
      ? [node]
      : node.entries.filter((entry): entry is ScalarNode => entry.kind === 'scalar');
  let continues = false;
  for (const scalar of scalars) {
    const items = scalar.text.split(',').map((item) => item.trim());
    const current = groups.at(-1);
    if (current !== undefined && (continues || scalar.text.trimStart().startsWith(','))) {
      current.push(...items.filter((item) => item !== ''));
    } else {
      groups.push(items.filter((item) => item !== ''));
    }
    continues = scalar.text.trimEnd().endsWith(',');
  }
  const [base, baseCurves] = readList(groups[0] ?? [], curves, index);
  const [variation, variationCurves] = readList(groups[1] ?? [], curves, index);
  return { base, curves: baseCurves, variation, variationCurves };
}

/** A list's base (its last number, else 0) and its curves, `spawn` ones first. */
function readList(
  items: readonly string[],
  curves: readonly ParticleCurve[],
  index: ReadonlyMap<string, number>,
): [number, number[]] {
  let base = 0;
  const found: number[] = [];
  for (const item of items) {
    const n = Number(item);
    if (item !== '' && Number.isFinite(n)) {
      base = n;
    } else {
      const curve = index.get(item.toLowerCase());
      if (curve !== undefined) found.push(curve);
    }
  }
  const spawnFirst = [
    ...found.filter((i) => curves[i]?.time === 'spawn'),
    ...found.filter((i) => curves[i]?.time !== 'spawn'),
  ];
  return [base, spawnFirst];
}

function vector(node: ScalarNode | BlockNode | undefined): [number, number, number] {
  if (node?.kind !== 'block') return [0, 0, 0];
  const named = (key: string): number | undefined => numberOf(lastScalar(node, key));
  const bare = node.entries.flatMap((entry) => {
    const n = entry.kind === 'scalar' ? numberOf(entry) : undefined;
    return n === undefined ? [] : [n];
  });
  return [named('x') ?? bare[0] ?? 0, named('y') ?? bare[1] ?? 0, named('z') ?? bare[2] ?? 0];
}

/** The force names of a subsystem: its `force` values and the bare words after a trailing comma. */
function forceNames(subsystem: BlockNode): string[] {
  const found: string[] = [];
  let continues = false;
  for (const entry of subsystem.entries) {
    if (entry.kind === 'property' && keyOf(entry) === 'force') {
      const value = entry.value;
      if (value?.kind === 'scalar') {
        found.push(...value.text.split(','));
        continues = value.text.trimEnd().endsWith(',');
      } else {
        if (value?.kind === 'block') {
          for (const e of value.entries) if (e.kind === 'scalar') found.push(...e.text.split(','));
        }
        continues = false;
      }
    } else if (entry.kind === 'scalar' && (continues || entry.text.startsWith(','))) {
      found.push(...entry.text.split(','));
      continues = entry.text.trimEnd().endsWith(',');
    } else {
      continues = false;
    }
  }
  return found.map((name) => name.trim()).filter((name) => name !== '');
}

function numberOf(node: ScalarNode | undefined): number | undefined {
  if (node === undefined) return undefined;
  const n = Number(node.text);
  return node.text.trim() !== '' && Number.isFinite(n) ? n : undefined;
}

function propertyBlocks(entries: readonly EntryNode[], key: string): BlockNode[] {
  return entries.flatMap((entry) =>
    entry.kind === 'property' && keyOf(entry) === key && entry.value?.kind === 'block'
      ? [entry.value]
      : [],
  );
}

function lastValue(block: BlockNode, key: string): ScalarNode | BlockNode | undefined {
  let found: ScalarNode | BlockNode | undefined;
  for (const entry of block.entries) {
    if (entry.kind === 'property' && keyOf(entry) === key && entry.value !== undefined) {
      found = entry.value;
    }
  }
  return found;
}

function lastScalar(block: BlockNode, key: string): ScalarNode | undefined {
  const value = lastValue(block, key);
  return value?.kind === 'scalar' ? value : undefined;
}
