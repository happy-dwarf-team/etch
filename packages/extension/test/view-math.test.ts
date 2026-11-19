import { describe, expect, it } from 'vitest';
import {
  edgesOf,
  eyeOf,
  FRAMED_FILL,
  FRAMED_PITCH,
  FRAMED_YAW,
  frameOf,
  framing,
  normalise,
  placedBounds,
  placement,
  scaling,
  viewProjection,
  type Bounds,
} from '../webview/view-math.ts';

/** `m × (x, y, z, 1)` for a column-major 4 × 4 matrix. */
function apply(m: Float32Array, [x = 0, y = 0, z = 0]: readonly number[]): number[] {
  return [0, 1, 2, 3].map(
    (row) => (m[row] ?? 0) * x + (m[4 + row] ?? 0) * y + (m[8 + row] ?? 0) * z + (m[12 + row] ?? 0),
  );
}

function translation(x: number, y: number, z: number): Float32Array {
  const m = scaling(1);
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function corners({ min, max }: Bounds): number[][] {
  const out: number[][] = [];
  for (const x of [min[0] ?? 0, max[0] ?? 0])
    for (const y of [min[1] ?? 0, max[1] ?? 0])
      for (const z of [min[2] ?? 0, max[2] ?? 0]) out.push([x, y, z]);
  return out;
}

describe('view math', () => {
  it('lists each triangle edge once, shared edges included', () => {
    // A quad as two triangles sharing the edge 1–2.
    const edges = edgesOf(Uint32Array.of(0, 1, 2, 2, 1, 3));
    const pairs = [];
    for (let i = 0; i < edges.length; i += 2)
      pairs.push(`${String(edges[i])}-${String(edges[i + 1])}`);
    expect(pairs.sort()).toEqual(['0-1', '0-2', '1-2', '1-3', '2-3']);
    expect(edgesOf(Uint32Array.of(0, 1))).toHaveLength(0);
  });

  it('loops the animation frame and stays at 0 without one', () => {
    const animation = { frames: 10, fps: 30 };
    expect(frameOf(animation, 0)).toBe(0);
    expect(frameOf(animation, 0.1)).toBeCloseTo(3);
    expect(frameOf(animation, 0.5)).toBeCloseTo(5);
    expect(frameOf(undefined, 2)).toBe(0);
    expect(frameOf({ frames: 0, fps: 30 }, 2)).toBe(0);
  });

  it("places an attachment on its parent's bone at its own scale", () => {
    expect(Array.from(placement(0.5))).toEqual(Array.from(scaling(0.5)));
    // A soldier at 0.5 with a hand bone 2 up in his mesh's space, and a musket at 0.47 in it.
    const parent = { model: scaling(0.5), scale: 0.5 };
    const musket = placement(0.47, parent, translation(0, 2, 0));
    const grip = apply(musket, [0, 0, 0]);
    const muzzle = apply(musket, [1, 0, 0]);
    // The bone's position is scaled with the soldier; the musket's length is its own scale.
    expect(grip[1]).toBeCloseTo(1);
    expect((muzzle[0] ?? 0) - (grip[0] ?? 0)).toBeCloseTo(0.47);
    // Without a bone the attachment sits at its parent's origin.
    expect(apply(placement(0.47, parent), [0, 0, 0]).slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('bounds placed vertices with Z mirrored and gives none without vertices', () => {
    const bounds = placedBounds([
      { model: translation(1, 0, 0), positions: Float32Array.of(0, 0, 1, 0, 2, -1) },
      { model: scaling(2), positions: Float32Array.of(-1, 0, 0) },
    ]);
    expect(bounds).toEqual({ min: [-2, 0, -1], max: [1, 2, 1] });
    expect(placedBounds([{ model: scaling(1), positions: new Float32Array(0) }])).toBeUndefined();
  });

  it('frames a box with its farthest corner at the fill line, at any aspect', () => {
    const boxes: Bounds[] = [
      { min: [-0.5, 0, -0.5], max: [0.5, 9, 0.5] }, // a soldier: tall and thin
      { min: [-20, 0, -4], max: [20, 6, 4] }, // a ship: long and low
      { min: [3, 3, 3], max: [4, 4, 4] }, // a small cube away from the origin
      { min: [-1, 0, -1], max: [1, 0, 1] }, // a flat square
    ];
    for (const box of boxes) {
      for (const aspect of [0.4, 1, 1600 / 900, 3]) {
        const camera = framing(box, aspect);
        expect(camera.yaw).toBe(FRAMED_YAW);
        expect(camera.pitch).toBe(FRAMED_PITCH);
        const matrix = viewProjection(camera, aspect);
        const centre = apply(matrix, camera.target);
        expect((centre[0] ?? 0) / (centre[3] ?? 1)).toBeCloseTo(0);
        expect((centre[1] ?? 0) / (centre[3] ?? 1)).toBeCloseTo(0);
        let reach = 0;
        for (const corner of corners(box)) {
          const [x = 0, y = 0, z = 0, w = 0] = apply(matrix, corner);
          expect(w).toBeGreaterThan(0);
          expect(Math.abs(x / w)).toBeLessThanOrEqual(FRAMED_FILL + 1e-6);
          expect(Math.abs(y / w)).toBeLessThanOrEqual(FRAMED_FILL + 1e-6);
          expect(Math.abs(z / w)).toBeLessThanOrEqual(1);
          reach = Math.max(reach, Math.abs(x / w), Math.abs(y / w));
        }
        expect(reach).toBeCloseTo(FRAMED_FILL, 5);
      }
    }
  });

  it('keeps the eye outside the box', () => {
    // A box seen along its long side would otherwise fit with the eye inside it.
    const box = { min: [-0.1, -0.1, -50], max: [0.1, 0.1, 50] };
    const camera = framing(box, 1);
    const eye = eyeOf(camera);
    expect(Math.hypot(...eye)).toBeGreaterThan(50);
  });

  it('puts the eye at the camera distance from its target', () => {
    const camera = { yaw: 1.2, pitch: -0.3, distance: 7, target: [1, 2, 3] };
    const eye = eyeOf(camera);
    expect(Math.hypot(...eye.map((v, i) => v - (camera.target[i] ?? 0)))).toBeCloseTo(7);
    expect(Math.hypot(...normalise([3, 4, 12]))).toBeCloseTo(1);
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
