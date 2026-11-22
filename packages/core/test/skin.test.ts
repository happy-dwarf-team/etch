// The matrix work behind posing a skinned mesh (`@etch/core/asset`'s skin.ts): products,
// inverses, joint poses, the bones' world matrices with and without an animation, and the joint
// pose between frames. The mesh-level skinning is in asset.test.ts.
import { describe, expect, it } from 'vitest';
import {
  boneWorldMatrices,
  invertAffine,
  jointPose,
  multiply,
  poseMatrix,
  skinningMatrices,
  type JointPose,
  type PdxAnimation,
  type SkeletonBone,
} from '../src/asset/index.ts';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function rounded(m: Float32Array | undefined): number[] {
  return Array.from(m ?? []).map((v) => Math.round(v * 1e5) / 1e5 + 0);
}

/** A point (x, y, z) through a matrix by columns. */
function apply(m: Float32Array, [x, y, z]: readonly number[]): number[] {
  return [0, 1, 2].map(
    (row) =>
      Math.round(
        ((m[row] ?? 0) * (x ?? 0) +
          (m[4 + row] ?? 0) * (y ?? 0) +
          (m[8 + row] ?? 0) * (z ?? 0) +
          (m[12 + row] ?? 0)) *
          1e5,
      ) /
        1e5 +
      0,
  );
}

/** A unit quaternion of `degrees` about an axis. */
function turn(axis: readonly [number, number, number], degrees: number): JointPose['q'] {
  const half = (degrees * Math.PI) / 360;
  const length = Math.hypot(...axis);
  const s = Math.sin(half) / length;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function pose(
  t: JointPose['t'],
  q: JointPose['q'] = [0, 0, 0, 1],
  s: number | JointPose['s'] = 1,
): JointPose {
  return { t, q, s: typeof s === 'number' ? [s, s, s] : s };
}

/** A bone whose bind matrix (in the mesh's space) is `bind`. */
function bone(name: string, index: number, parent: number | undefined, bind: Float32Array) {
  return { name, index, parent, inverseBind: invertAffine(bind) } satisfies SkeletonBone;
}

/** An animation of joints at their rest pose only (no frames sampled). */
function restAnimation(joints: readonly { name: string; rest: JointPose }[]): PdxAnimation {
  return {
    fps: 15,
    frames: 0,
    joints: joints.map((joint) => ({ ...joint, ranks: { t: -1, q: -1, s: -1 } })),
    samples: { t: new Float32Array(), q: new Float32Array(), s: new Float32Array() },
    sampled: { t: 0, q: 0, s: 0 },
    scaleWidth: 1,
  };
}

describe('multiply, invertAffine and poseMatrix', () => {
  it('multiplies by columns: translate × scale scales first', () => {
    const translate = poseMatrix(pose([1, 2, 3]));
    const scale = poseMatrix(pose([0, 0, 0], [0, 0, 0, 1], 2));
    expect(apply(multiply(translate, scale), [1, 1, 1])).toEqual([3, 4, 5]);
    expect(apply(multiply(scale, translate), [1, 1, 1])).toEqual([4, 6, 8]);
    expect(rounded(multiply(translate, poseMatrix(pose([0, 0, 0]))))).toEqual(rounded(translate));
  });

  it('builds translate × rotate × scale, right-handed', () => {
    // 90 degrees about Y takes +X to -Z; the scale applies before the turn and the move after.
    const m = poseMatrix(pose([10, 0, 0], turn([0, 1, 0], 90), 2));
    expect(apply(m, [1, 0, 0])).toEqual([10, 0, -2]);
    expect(apply(m, [0, 1, 0])).toEqual([10, 2, 0]);
    expect(apply(m, [0, 0, 1])).toEqual([12, 0, 0]);
  });

  it('inverts an affine matrix both ways', () => {
    const m = poseMatrix(pose([1, -2, 3], turn([0.3, 1, -0.4], 70), 1.5));
    expect(rounded(multiply(m, invertAffine(m)))).toEqual(IDENTITY);
    expect(rounded(multiply(invertAffine(m), m))).toEqual(IDENTITY);
  });

  it('scales each axis by its own value before the turn', () => {
    // A scale of (2, 3, 4), then 90 degrees about Z (+X to +Y, +Y to -X), then a move.
    const m = poseMatrix(pose([10, 0, 0], turn([0, 0, 1], 90), [2, 3, 4]));
    expect(apply(m, [1, 0, 0])).toEqual([10, 2, 0]);
    expect(apply(m, [0, 1, 0])).toEqual([7, 0, 0]);
    expect(apply(m, [0, 0, 1])).toEqual([10, 0, 4]);
    // Three equal values are the uniform scale.
    expect(rounded(poseMatrix(pose([1, 2, 3], turn([1, 1, 0], 30), [2, 2, 2])))).toEqual(
      rounded(poseMatrix(pose([1, 2, 3], turn([1, 1, 0], 30), 2))),
    );
  });

  it('gives finite numbers for a singular matrix', () => {
    const flat = poseMatrix(pose([1, 2, 3], [0, 0, 0, 1], 0));
    expect(Array.from(invertAffine(flat)).every(Number.isFinite)).toBe(true);
  });
});

describe('boneWorldMatrices', () => {
  // A chain: the root at the origin, its child one up and turned 90 degrees about Z, and the
  // grandchild one further along the child's own X (so one more up in the mesh's space).
  const rootBind = poseMatrix(pose([0, 0, 0]));
  const childBind = poseMatrix(pose([0, 1, 0], turn([0, 0, 1], 90)));
  const tipBind = multiply(childBind, poseMatrix(pose([1, 0, 0])));
  const skeleton = [
    bone('root', 0, undefined, rootBind),
    bone('child', 1, 0, childBind),
    bone('tip', 2, 1, tipBind),
  ];

  it('is the bind pose without an animation', () => {
    const world = boneWorldMatrices(skeleton, undefined);
    expect(world.map(rounded)).toEqual([rootBind, childBind, tipBind].map(rounded));
    expect(apply(world[2] ?? new Float32Array(16), [0, 0, 0])).toEqual([0, 2, 0]);
  });

  it('keeps the bind pose of the bones an animation does not name', () => {
    const animation = restAnimation([{ name: 'elsewhere', rest: pose([5, 5, 5]) }]);
    const world = boneWorldMatrices(skeleton, animation);
    expect(world.map(rounded)).toEqual([rootBind, childBind, tipBind].map(rounded));
    // So their skinning matrices leave the mesh where it is.
    expect(skinningMatrices(skeleton, animation, 0).map(rounded)).toEqual([
      IDENTITY,
      IDENTITY,
      IDENTITY,
    ]);
  });

  it('poses a named joint and carries the unnamed bones below it along', () => {
    // The child, relative to the root, straight up two instead of one and not turned.
    const animation = restAnimation([{ name: 'child', rest: pose([0, 2, 0]) }]);
    const world = boneWorldMatrices(skeleton, animation);
    expect(rounded(world[0])).toEqual(rounded(rootBind));
    expect(apply(world[1] ?? new Float32Array(16), [0, 0, 0])).toEqual([0, 2, 0]);
    // The tip keeps its bind offset from the child, one along the child's X, now unturned.
    expect(apply(world[2] ?? new Float32Array(16), [0, 0, 0])).toEqual([1, 2, 0]);
  });

  it('treats a bone that names itself as its parent as a root', () => {
    const looped = [bone('self', 0, 0, childBind)];
    const animation = restAnimation([{ name: 'self', rest: pose([3, 0, 0]) }]);
    expect(
      apply(boneWorldMatrices(looped, animation)[0] ?? new Float32Array(16), [0, 0, 0]),
    ).toEqual([3, 0, 0]);
  });
});

describe('jointPose', () => {
  // One joint sampling its rotation over two frames: q at frame 0 and -q (the same turn) at 1.
  const q = turn([0, 0, 1], 60);
  const animation: PdxAnimation = {
    fps: 15,
    frames: 2,
    joints: [{ name: 'j', rest: pose([1, 2, 3]), ranks: { t: -1, q: 0, s: -1 } }],
    samples: {
      t: new Float32Array(),
      q: new Float32Array([...q, ...q.map((v) => -v)]),
      s: new Float32Array(),
    },
    sampled: { t: 0, q: 1, s: 0 },
    scaleWidth: 1,
  };

  it('blends along the shorter arc, so q and -q give the same turn between frames', () => {
    const half = jointPose(animation, 0, 0.5);
    expect(half.q.map((v) => Math.round(v * 1e5) / 1e5 + 0)).toEqual(
      q.map((v) => Math.round(v * 1e5) / 1e5 + 0),
    );
    // Channels the joint does not sample keep its rest pose.
    expect([half.t, half.s]).toEqual([
      [1, 2, 3],
      [1, 1, 1],
    ]);
  });

  it('wraps a frame past the last one to the start', () => {
    expect(jointPose(animation, 0, 2).q).toEqual(jointPose(animation, 0, 0).q);
    expect(jointPose(animation, 0, -1).q).toEqual(jointPose(animation, 0, 1).q);
  });

  it('refuses a joint the animation does not have', () => {
    expect(() => jointPose(animation, 1, 0)).toThrow(RangeError);
  });
});
