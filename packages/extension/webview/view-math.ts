// The geometry of the mesh preview (mesh.ts) that needs no WebGL: wire edges, animation frames,
// where an attachment is placed, the drawn bounds, the camera's framing and its matrices. Matrices
// are 4 × 4 by columns, as `@etch/core/asset` and WebGL take them. The drawn space mirrors the
// game's Z (its files are left-handed with Y up).

import { multiply } from '@etch/core/asset';

/** An orbit camera: angles in radians, distance from the target, in the drawn space. */
export interface OrbitCamera {
  yaw: number;
  pitch: number;
  distance: number;
  target: number[];
}

/** An axis-aligned box in the drawn space. */
export interface Bounds {
  min: number[];
  max: number[];
}

/** The angles the camera takes when it frames a mesh. */
export const FRAMED_YAW = 0.6;
export const FRAMED_PITCH = 0.35;

/** The view's vertical angle, in degrees. */
export const FIELD_OF_VIEW = 40;

export function scaling(factor: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = factor;
  m[15] = 1;
  return m;
}

/** Each triangle edge once, as line pairs. */
export function edgesOf(indices: Uint32Array): Uint32Array {
  const seen = new Set<string>();
  const out: number[] = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    for (const [a, b] of [
      [indices[i], indices[i + 1]],
      [indices[i + 1], indices[i + 2]],
      [indices[i + 2], indices[i]],
    ] as const) {
      const lo = Math.min(a ?? 0, b ?? 0);
      const hi = Math.max(a ?? 0, b ?? 0);
      const key = `${String(lo)},${String(hi)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(lo, hi);
    }
  }
  return Uint32Array.from(out);
}

/** The animation's frame `seconds` into playing it, looping; 0 without an animation. */
export function frameOf(
  animation: { readonly frames: number; readonly fps: number } | undefined,
  seconds: number,
): number {
  if (animation === undefined || animation.frames <= 0) return 0;
  return (seconds * animation.fps) % animation.frames;
}

/**
 * The model matrix of an instance: a root at its scale; an attachment on its parent's bone (the
 * bone's matrix in the parent mesh's space, or the parent's origin without one) at its own scale,
 * not multiplied by its parent's.
 */
export function placement(
  scale: number,
  parent?: { readonly model: Float32Array; readonly scale: number },
  bone?: Float32Array,
): Float32Array {
  if (parent === undefined) return scaling(scale);
  return multiply(multiply(parent.model, bone ?? scaling(1)), scaling(scale / (parent.scale || 1)));
}

/**
 * The bounds of the positions (x, y, z triples) placed by their model matrices, in the drawn (Z
 * mirrored) space; undefined when there is no vertex.
 */
export function placedBounds(
  items: Iterable<{ readonly model: Float32Array; readonly positions: Float32Array }>,
): Bounds | undefined {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { model: m, positions: p } of items) {
    for (let v = 0; v + 2 < p.length; v += 3) {
      const x = p[v] ?? 0;
      const y = p[v + 1] ?? 0;
      const z = p[v + 2] ?? 0;
      const placed = [
        (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
        (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
        -((m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0)),
      ];
      for (let axis = 0; axis < 3; axis++) {
        const value = placed[axis] ?? 0;
        if (value < (min[axis] ?? 0)) min[axis] = value;
        if (value > (max[axis] ?? 0)) max[axis] = value;
      }
    }
  }
  return (min[0] ?? Infinity) <= (max[0] ?? -Infinity) ? { min, max } : undefined;
}

/** A bone as the Bones button draws it, in the drawn (Z mirrored) space. */
export interface PlacedBone {
  readonly name: string;
  /** The bone's origin: the translation of its matrix. */
  readonly at: readonly number[];
  /** Its parent's origin; `undefined` for a root bone. */
  readonly parent: readonly number[] | undefined;
}

/**
 * The bones of a skeleton placed by an instance's model matrix: each bone's origin at a frame
 * (`worlds`, the bone matrices in the mesh's space by skeleton index, as `boneWorldMatrices` gives
 * them) and its parent's, in the drawn (Z mirrored) space.
 */
export function placedBones(
  skeleton: readonly { readonly name: string; readonly parent: number | undefined }[],
  worlds: readonly Float32Array[],
  model: Float32Array,
): PlacedBone[] {
  const origin = (index: number): number[] | undefined => {
    const w = worlds[index];
    if (w === undefined) return undefined;
    const x = w[12] ?? 0;
    const y = w[13] ?? 0;
    const z = w[14] ?? 0;
    const m = model;
    return [
      (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0),
      (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0),
      -((m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0)),
    ];
  };
  return skeleton.flatMap((bone, index) => {
    const at = origin(index);
    if (at === undefined) return [];
    const parent =
      bone.parent === undefined || bone.parent === index ? undefined : origin(bone.parent);
    return [{ name: bone.name, at, parent }];
  });
}

/**
 * Where a point of the drawn space shows on a canvas `width` × `height` pixels, from its top left;
 * `undefined` for a point behind the camera.
 */
export function onScreen(
  viewProjection: Float32Array,
  [x = 0, y = 0, z = 0]: readonly number[],
  width: number,
  height: number,
): { x: number; y: number } | undefined {
  const m = viewProjection;
  const clip = [0, 1, 3].map(
    (row) => (m[row] ?? 0) * x + (m[4 + row] ?? 0) * y + (m[8 + row] ?? 0) * z + (m[12 + row] ?? 0),
  );
  const [cx = 0, cy = 0, w = 0] = clip;
  if (w <= 0) return undefined;
  return { x: ((cx / w + 1) / 2) * width, y: ((1 - cy / w) / 2) * height };
}

/** How much of the view's height or width a framed box fills, at most. */
export const FRAMED_FILL = 0.9;

/**
 * The camera that frames the bounds on a canvas of this aspect (width / height): aimed at the
 * box's centre at the framing angles, as near as lets every corner of the box fall within
 * `FRAMED_FILL` of the view, and outside the box's sphere.
 */
export function framing(bounds: Bounds, aspect: number): OrbitCamera {
  const [x0 = 0, y0 = 0, z0 = 0] = bounds.min;
  const [x1 = 0, y1 = 0, z1 = 0] = bounds.max;
  const target = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const radius = Math.max(Math.hypot(x1 - x0, y1 - y0, z1 - z0), 0.01) / 2;
  const { s, u, f } = axesOf(FRAMED_YAW, FRAMED_PITCH);
  const t = 1 / Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
  const wide = aspect > 0 ? aspect : 1;
  // A corner `c` from the target is `distance + f·c` deep and shows at `s·c × t / aspect` across
  // and `u·c × t` up, over that depth.
  let distance = radius * 1.05;
  for (const x of [x0 - (target[0] ?? 0), x1 - (target[0] ?? 0)]) {
    for (const y of [y0 - (target[1] ?? 0), y1 - (target[1] ?? 0)]) {
      for (const z of [z0 - (target[2] ?? 0), z1 - (target[2] ?? 0)]) {
        const c = [x, y, z];
        const across = (Math.abs(dot(s, c)) * t) / (wide * FRAMED_FILL);
        const up = (Math.abs(dot(u, c)) * t) / FRAMED_FILL;
        distance = Math.max(distance, Math.max(across, up) - dot(f, c));
      }
    }
  }
  return { yaw: FRAMED_YAW, pitch: FRAMED_PITCH, distance, target };
}

/** The camera's right, up and forward (towards the target) unit vectors at these angles. */
function axesOf(yaw: number, pitch: number): { s: number[]; u: number[]; f: number[] } {
  const f = [-Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
  const s = normalise(cross(f, [0, 1, 0]));
  return { s, u: cross(s, f), f };
}

/**
 * The level of detail a mesh with these levels shows when `chosen` is picked: the most detailed of
 * its levels that is not more detailed than the choice, or its most detailed one when it has none
 * as coarse; `undefined` for a mesh without levels.
 */
export function shownLevel(levels: readonly number[], chosen: number): number | undefined {
  const sorted = [...new Set(levels)].sort((a, b) => a - b);
  const coarser = sorted.filter((level) => level <= chosen);
  return coarser.length > 0 ? coarser[coarser.length - 1] : sorted[0];
}

/**
 * The level of detail the game picks at `distance` from the camera to a mesh's origin, by the
 * mesh's `loddist`: the last level whose distance is reached, or the last level when not even the
 * first one is; `undefined` without distances.
 */
export function levelAtDistance(
  distance: number,
  lodDistances: readonly number[],
): number | undefined {
  if (lodDistances.length === 0) return undefined;
  for (let level = lodDistances.length - 1; level >= 0; level--) {
    const from = lodDistances[level] ?? 0;
    if (distance * distance >= from * from) return level;
  }
  return lodDistances.length - 1;
}

/** The camera's position, in the drawn space. */
export function eyeOf(camera: OrbitCamera): number[] {
  const { yaw, pitch, distance, target } = camera;
  const [tx = 0, ty = 0, tz = 0] = target;
  return [
    tx + distance * Math.cos(pitch) * Math.sin(yaw),
    ty + distance * Math.sin(pitch),
    tz + distance * Math.cos(pitch) * Math.cos(yaw),
  ];
}

/** Perspective × look-at for a canvas of this aspect (width / height). */
export function viewProjection(camera: OrbitCamera, aspect: number): Float32Array {
  const { distance } = camera;
  const eye = eyeOf(camera);
  const { s, u, f } = axesOf(camera.yaw, camera.pitch);
  const view = new Float32Array([
    s[0] ?? 0,
    u[0] ?? 0,
    -(f[0] ?? 0),
    0,
    s[1] ?? 0,
    u[1] ?? 0,
    -(f[1] ?? 0),
    0,
    s[2] ?? 0,
    u[2] ?? 0,
    -(f[2] ?? 0),
    0,
    -dot(s, eye),
    -dot(u, eye),
    dot(f, eye),
    1,
  ]);
  const near = distance / 100;
  const far = distance * 10;
  const t = 1 / Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
  const projection = new Float32Array([
    t / aspect,
    0,
    0,
    0,
    0,
    t,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ]);
  return multiply(projection, view);
}

function cross(a: readonly number[], b: readonly number[]): number[] {
  const [ax = 0, ay = 0, az = 0] = a;
  const [bx = 0, by = 0, bz = 0] = b;
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
}
export function normalise(v: readonly number[]): number[] {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
}
