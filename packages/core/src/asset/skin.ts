// Posing a skinned mesh with an animation, on the CPU: each bone's world matrix from the joint
// poses (bones without a joint keep their bind pose), the skinning matrix world × inverse bind,
// and the vertices blended by their weights. Matrices are 4 × 4 by columns.
//
// The game binds an animation's joints to the skeleton's bones by index, not by name: EU4 1.37.5's
// `AnimPlayAnimation` (pdx_anim.cpp) refuses an animation whose joint count is not the mesh's bone
// count and otherwise writes joint k's pose to bone k. The animation it keeps holds no joint names.

import { jointPose, type JointPose, type PdxAnimation } from './anim.ts';
import type { MeshPart, SkeletonBone } from './mesh.ts';

/** Whether the game plays the animation on the skeleton: as many joints as bones. */
export function animationFits(skeleton: readonly SkeletonBone[], animation: PdxAnimation): boolean {
  return skeleton.length > 0 && animation.joints.length === skeleton.length;
}

/**
 * For each bone (by index), the animation's joint that poses it: the joint of the same index,
 * whatever its name, as the game binds them. When the animation does not fit the skeleton, every
 * bone is `undefined`, since the game then plays nothing.
 */
export function jointsOfBones(
  skeleton: readonly SkeletonBone[],
  animation: PdxAnimation,
): (number | undefined)[] {
  const fits = animationFits(skeleton, animation);
  return skeleton.map((_, index) => (fits ? index : undefined));
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] ?? 0) * (b[column * 4 + k] ?? 0);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** The inverse of an affine matrix (last row 0 0 0 1). */
export function invertAffine(m: Float32Array): Float32Array {
  const [a = 0, b = 0, c = 0, , d = 0, e = 0, f = 0, , g = 0, h = 0, i = 0, , x = 0, y = 0, z = 0] =
    m;
  // Columns (a b c), (d e f), (g h i): the 3 × 3 part M; the inverse is M⁻¹ and −M⁻¹ t.
  const A = e * i - f * h;
  const B = -(b * i - c * h);
  const C = b * f - c * e;
  const determinant = a * A + d * B + g * C;
  const r = determinant === 0 ? 0 : 1 / determinant;
  const out = new Float32Array(16);
  out[0] = A * r;
  out[1] = B * r;
  out[2] = C * r;
  out[4] = -(d * i - f * g) * r;
  out[5] = (a * i - c * g) * r;
  out[6] = -(a * f - c * d) * r;
  out[8] = (d * h - e * g) * r;
  out[9] = -(a * h - b * g) * r;
  out[10] = (a * e - b * d) * r;
  out[12] = -(out[0] * x + out[4] * y + out[8] * z);
  out[13] = -(out[1] * x + out[5] * y + out[9] * z);
  out[14] = -(out[2] * x + out[6] * y + out[10] * z);
  out[15] = 1;
  return out;
}

/** The matrix of a joint pose: translate × rotate × scale (per axis: column i times s[i]). */
export function poseMatrix({ t, q, s }: JointPose): Float32Array {
  const [x, y, z, w] = q;
  const [sx, sy, sz] = s;
  const out = new Float32Array(16);
  out[0] = (1 - 2 * (y * y + z * z)) * sx;
  out[1] = 2 * (x * y + z * w) * sx;
  out[2] = 2 * (x * z - y * w) * sx;
  out[4] = 2 * (x * y - z * w) * sy;
  out[5] = (1 - 2 * (x * x + z * z)) * sy;
  out[6] = 2 * (y * z + x * w) * sy;
  out[8] = 2 * (x * z + y * w) * sz;
  out[9] = 2 * (y * z - x * w) * sz;
  out[10] = (1 - 2 * (x * x + y * y)) * sz;
  out[12] = t[0];
  out[13] = t[1];
  out[14] = t[2];
  out[15] = 1;
  return out;
}

/**
 * The skinning matrix of every bone at a frame: world × inverse bind. A bone without a joint
 * keeps its bind pose relative to its parent.
 */
export function skinningMatrices(
  skeleton: readonly SkeletonBone[],
  animation: PdxAnimation,
  frame: number,
  joints: readonly (number | undefined)[] = jointsOfBones(skeleton, animation),
): Float32Array[] {
  const world = boneWorldMatrices(skeleton, animation, frame, joints);
  return skeleton.map((bone, index) => multiply(world[index] ?? identity(), bone.inverseBind));
}

/**
 * The matrix of every bone in the mesh's space at a frame, or in the bind pose without an
 * animation: where an attachment on that bone (an `.asset` `attach`) is drawn.
 */
export function boneWorldMatrices(
  skeleton: readonly SkeletonBone[],
  animation: PdxAnimation | undefined,
  frame = 0,
  joints: readonly (number | undefined)[] = animation === undefined
    ? []
    : jointsOfBones(skeleton, animation),
): Float32Array[] {
  if (animation === undefined) {
    return skeleton.map((bone) => invertAffine(bone.inverseBind));
  }
  const world: (Float32Array | undefined)[] = [];
  const worldOf = (index: number, depth = 0): Float32Array => {
    const known = world[index];
    if (known !== undefined) return known;
    const bone = skeleton[index];
    if (bone === undefined || depth > skeleton.length) return identity();
    const parent =
      bone.parent === undefined || bone.parent === index
        ? undefined
        : worldOf(bone.parent, depth + 1);
    const joint = joints[index];
    let local: Float32Array;
    if (joint !== undefined) {
      local = poseMatrix(jointPose(animation, joint, frame));
    } else {
      // The bind pose relative to the parent: inverseBind(parent) × bind(bone).
      const bind = invertAffine(bone.inverseBind);
      const parentBone = bone.parent === undefined ? undefined : skeleton[bone.parent];
      local = parentBone === undefined ? bind : multiply(parentBone.inverseBind, bind);
    }
    const result = parent === undefined ? local : multiply(parent, local);
    world[index] = result;
    return result;
  };
  return skeleton.map((_, index) => worldOf(index));
}

function identity(): Float32Array {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** A part's vertices (and normals and tangents) posed by the skinning matrices. */
export function skinPart(
  part: MeshPart,
  matrices: readonly Float32Array[],
  positions = new Float32Array(part.positions.length),
  normals: Float32Array | undefined = part.normals && new Float32Array(part.normals.length),
  tangents: Float32Array | undefined = part.tangents && new Float32Array(part.tangents.length),
): {
  positions: Float32Array;
  normals: Float32Array | undefined;
  tangents: Float32Array | undefined;
} {
  const { skin } = part;
  if (skin === undefined) {
    positions.set(part.positions);
    if (normals !== undefined && part.normals !== undefined) normals.set(part.normals);
    if (tangents !== undefined && part.tangents !== undefined) tangents.set(part.tangents);
    return { positions, normals, tangents };
  }
  const vertices = part.positions.length / 3;
  for (let v = 0; v < vertices; v++) {
    const px = part.positions[v * 3] ?? 0;
    const py = part.positions[v * 3 + 1] ?? 0;
    const pz = part.positions[v * 3 + 2] ?? 0;
    const nx = part.normals?.[v * 3] ?? 0;
    const ny = part.normals?.[v * 3 + 1] ?? 0;
    const nz = part.normals?.[v * 3 + 2] ?? 0;
    let x = 0;
    let y = 0;
    let z = 0;
    let mx = 0;
    let my = 0;
    let mz = 0;
    const tx = part.tangents?.[v * 4] ?? 0;
    const ty = part.tangents?.[v * 4 + 1] ?? 0;
    const tz = part.tangents?.[v * 4 + 2] ?? 0;
    let ux = 0;
    let uy = 0;
    let uz = 0;
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const bone = skin.bones[v * 4 + k] ?? -1;
      const weight = skin.weights[v * 4 + k] ?? 0;
      const m = bone >= 0 ? matrices[bone] : undefined;
      if (weight <= 0 || m === undefined) continue;
      total += weight;
      x += weight * ((m[0] ?? 0) * px + (m[4] ?? 0) * py + (m[8] ?? 0) * pz + (m[12] ?? 0));
      y += weight * ((m[1] ?? 0) * px + (m[5] ?? 0) * py + (m[9] ?? 0) * pz + (m[13] ?? 0));
      z += weight * ((m[2] ?? 0) * px + (m[6] ?? 0) * py + (m[10] ?? 0) * pz + (m[14] ?? 0));
      mx += weight * ((m[0] ?? 0) * nx + (m[4] ?? 0) * ny + (m[8] ?? 0) * nz);
      my += weight * ((m[1] ?? 0) * nx + (m[5] ?? 0) * ny + (m[9] ?? 0) * nz);
      mz += weight * ((m[2] ?? 0) * nx + (m[6] ?? 0) * ny + (m[10] ?? 0) * nz);
      ux += weight * ((m[0] ?? 0) * tx + (m[4] ?? 0) * ty + (m[8] ?? 0) * tz);
      uy += weight * ((m[1] ?? 0) * tx + (m[5] ?? 0) * ty + (m[9] ?? 0) * tz);
      uz += weight * ((m[2] ?? 0) * tx + (m[6] ?? 0) * ty + (m[10] ?? 0) * tz);
    }
    if (total === 0) {
      x = px;
      y = py;
      z = pz;
      mx = nx;
      my = ny;
      mz = nz;
      ux = tx;
      uy = ty;
      uz = tz;
      total = 1;
    }
    positions[v * 3] = x / total;
    positions[v * 3 + 1] = y / total;
    positions[v * 3 + 2] = z / total;
    if (normals !== undefined) {
      const length = Math.hypot(mx, my, mz) || 1;
      normals[v * 3] = mx / length;
      normals[v * 3 + 1] = my / length;
      normals[v * 3 + 2] = mz / length;
    }
    if (tangents !== undefined) {
      const length = Math.hypot(ux, uy, uz) || 1;
      tangents[v * 4] = ux / length;
      tangents[v * 4 + 1] = uy / length;
      tangents[v * 4 + 2] = uz / length;
      tangents[v * 4 + 3] = part.tangents?.[v * 4 + 3] ?? 1;
    }
  }
  return { positions, normals, tangents };
}
