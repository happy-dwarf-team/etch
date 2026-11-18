// An `.anim` file: per-joint rest values and frame-major samples.
//
//   [info]      fps (f), sa (i, the frame count), j (i, the joint count)
//     [[joint]] sa (s: which of "t", "q", "s" are sampled), t (3), q (4: x, y, z, w), s (1)
//   [samples]   t, q, s: for each frame, the values of every joint whose `sa` names that
//               channel, in joint order
//
// The layout was checked on all 149 binary animations of EU4 1.37.5: each sample array is exactly
// frames × sampled joints × width long.

import { childOf, floats, ints, PdxAssetError, readPdxAsset, strings } from './pdx-asset.ts';

/** A joint's local transform: translation, rotation (x, y, z, w) and uniform scale. */
export interface JointPose {
  readonly t: readonly [number, number, number];
  readonly q: readonly [number, number, number, number];
  readonly s: number;
}

export interface AnimJoint {
  readonly name: string;
  readonly rest: JointPose;
  /** The joint's rank among the joints sampling each channel, or -1 when it does not. */
  readonly ranks: { readonly t: number; readonly q: number; readonly s: number };
}

export interface PdxAnimation {
  readonly fps: number;
  readonly frames: number;
  readonly joints: readonly AnimJoint[];
  readonly samples: {
    readonly t: Float32Array;
    readonly q: Float32Array;
    readonly s: Float32Array;
  };
  /** How many joints sample each channel. */
  readonly sampled: { readonly t: number; readonly q: number; readonly s: number };
}

export function readAnimation(bytes: Uint8Array): PdxAnimation {
  const root = readPdxAsset(bytes);
  const info = childOf(root, 'info');
  if (info === undefined) throw new PdxAssetError('the animation file has no [info]');
  const fps = floats(info, 'fps')?.[0] ?? 15;
  const frames = ints(info, 'sa')?.[0] ?? 0;
  const sampled = { t: 0, q: 0, s: 0 };
  const joints = info.children.map((joint): AnimJoint => {
    const mask = strings(joint, 'sa')?.[0] ?? '';
    const t = floats(joint, 't');
    const q = floats(joint, 'q');
    const rank = (channel: 't' | 'q' | 's'): number =>
      mask.includes(channel) ? sampled[channel]++ : -1;
    return {
      name: joint.name,
      rest: {
        t: [t?.[0] ?? 0, t?.[1] ?? 0, t?.[2] ?? 0],
        q: [q?.[0] ?? 0, q?.[1] ?? 0, q?.[2] ?? 0, q?.[3] ?? 1],
        s: floats(joint, 's')?.[0] ?? 1,
      },
      ranks: { t: rank('t'), q: rank('q'), s: rank('s') },
    };
  });
  const block = childOf(root, 'samples');
  const samples = {
    t: (block && floats(block, 't')) ?? new Float32Array(0),
    q: (block && floats(block, 'q')) ?? new Float32Array(0),
    s: (block && floats(block, 's')) ?? new Float32Array(0),
  };
  const widths = { t: 3, q: 4, s: 1 } as const;
  for (const channel of ['t', 'q', 's'] as const) {
    const expected = frames * sampled[channel] * widths[channel];
    if (samples[channel].length !== expected) {
      throw new PdxAssetError(
        `samples ${channel} has ${String(samples[channel].length)} values, not ${String(expected)}`,
      );
    }
  }
  return { fps, frames, joints, samples, sampled };
}

/** A joint's pose at a frame, which may be fractional: linear between frames, wrapping. */
export function jointPose(animation: PdxAnimation, joint: number, frame: number): JointPose {
  const found = animation.joints[joint];
  if (found === undefined) throw new RangeError(`no joint ${String(joint)}`);
  const { frames, samples, sampled } = animation;
  if (frames === 0) return found.rest;
  const wrapped = ((frame % frames) + frames) % frames;
  const a = Math.floor(wrapped);
  const b = (a + 1) % frames;
  const f = wrapped - a;
  const at = (channel: 't' | 'q' | 's', width: number, frameIndex: number, i: number): number =>
    samples[channel][(frameIndex * sampled[channel] + found.ranks[channel]) * width + i] ?? 0;
  const mix = (channel: 't' | 'q' | 's', width: number, i: number): number =>
    at(channel, width, a, i) * (1 - f) + at(channel, width, b, i) * f;
  const t: [number, number, number] =
    found.ranks.t < 0 ? [...found.rest.t] : [mix('t', 3, 0), mix('t', 3, 1), mix('t', 3, 2)];
  let q: [number, number, number, number] = [...found.rest.q];
  if (found.ranks.q >= 0) {
    // Normalised linear blend along the shorter arc.
    const qa = [0, 1, 2, 3].map((i) => at('q', 4, a, i));
    const qb = [0, 1, 2, 3].map((i) => at('q', 4, b, i));
    const dot = qa.reduce((sum, v, i) => sum + v * (qb[i] ?? 0), 0);
    const sign = dot < 0 ? -1 : 1;
    const blended = qa.map((v, i) => v * (1 - f) + sign * (qb[i] ?? 0) * f);
    const length = Math.hypot(...blended) || 1;
    q = [
      (blended[0] ?? 0) / length,
      (blended[1] ?? 0) / length,
      (blended[2] ?? 0) / length,
      (blended[3] ?? 1) / length,
    ];
  }
  const s = found.ranks.s < 0 ? found.rest.s : mix('s', 1, 0);
  return { t, q, s };
}
