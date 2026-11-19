import { describe, expect, it } from 'vitest';
import {
  animationFacts,
  meshFacts,
  jointPose,
  jointsOfBones,
  PdxAssetError,
  readAnimation,
  readMesh,
  readPdxAsset,
  skinningMatrices,
  skinPart,
} from '../src/asset/index.ts';
import { ANIM, binary, floats, half, ints, MESH, obj, text } from './fixtures/pdx-asset.ts';

describe('readPdxAsset', () => {
  it('reads the same tree from the binary and the text encoding', () => {
    const fromBinary = readPdxAsset(binary(MESH));
    const fromText = readPdxAsset(text(MESH));
    expect(fromText).toEqual(fromBinary);
    const shape = fromBinary.children[0]?.children[0];
    expect(shape?.name).toBe('flagShape');
    expect(fromBinary.properties.get('pdxasset')).toEqual({
      type: 'i',
      values: Int32Array.from([1, 0]),
    });
  });

  it('names what is wrong with a broken file', () => {
    expect(() => readPdxAsset(new TextEncoder().encode('DDS '))).toThrow(PdxAssetError);
    const whole = binary(MESH);
    expect(() => readPdxAsset(whole.subarray(0, whole.length - 3))).toThrow(/ends inside/);
    expect(() => readPdxAsset(binary([obj(2, 'orphan')]))).toThrow(/has no parent/);
    expect(() => readPdxAsset(new TextEncoder().encode('@@t@\n\tp q 1 0'))).toThrow(
      /no type and count/,
    );
  });
});

describe('readMesh', () => {
  it('reads the parts, material, skin and skeleton and keeps collision shapes apart', () => {
    const mesh = readMesh(binary(MESH));
    expect(mesh.shapes.map((s) => [s.name, s.collision])).toEqual([
      ['flagShape', false],
      ['pickShape', true],
    ]);
    const [flag] = mesh.shapes;
    const part = flag?.parts[0];
    expect(part?.material).toEqual({
      shader: 'PdxMeshStandardSkinned',
      diffuse: 'flag_diffuse.dds',
      normal: undefined,
      specular: undefined,
    });
    expect(part?.uvs?.length).toBe(8);
    expect(Array.from(part?.uvs1 ?? [])).toEqual([0, 0, 1, 0, 0, 1, 1, 1]);
    expect(Array.from(part?.tangents?.subarray(0, 4) ?? [])).toEqual([1, 0, 0, 1]);
    expect(part?.skin?.influences).toBe(1);
    expect(flag?.skeleton.map((b) => [b.name, b.parent])).toEqual([
      ['root', undefined],
      ['tip', 0],
    ]);
    // tx is 3 × 3 by columns, then the translation.
    expect(Array.from(flag?.skeleton[1]?.inverseBind ?? [])).toEqual([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 1,
    ]);
    // The bounds leave out the collision box.
    expect(mesh.bounds).toEqual({ min: [0, 0, 0], max: [2, 1, 0] });
  });

  it('refuses a triangle index past the vertices', () => {
    const broken = MESH.map((item) =>
      'name' in item && item.name === 'tri' && item.values.length === 6
        ? ints('tri', 0, 1, 9, 1, 3, 2)
        : item,
    );
    expect(() => readMesh(binary(broken))).toThrow(/out of range/);
  });
});

describe('readAnimation', () => {
  it('reads the joints and the frame-major samples', () => {
    const animation = readAnimation(binary(ANIM));
    expect(animation).toMatchObject({ fps: 15, frames: 2, sampled: { t: 0, q: 1, s: 0 } });
    expect(animation.joints.map((j) => [j.name, j.ranks])).toEqual([
      ['root', { t: -1, q: -1, s: -1 }],
      ['tip', { t: -1, q: 0, s: -1 }],
    ]);
    expect(jointPose(animation, 1, 1).q[2]).toBeCloseTo(half);
    // Halfway: 45 degrees.
    expect(jointPose(animation, 1, 0.5).q[2]).toBeCloseTo(Math.sin(Math.PI / 8));
    expect(jointPose(animation, 0, 1).t).toEqual([0, 0, 0]);
  });

  it('refuses samples of the wrong length', () => {
    const broken = ANIM.map((item) =>
      'name' in item && item.name === 'q' && item.values.length === 8
        ? floats('q', 0, 0, 0, 1)
        : item,
    );
    expect(() => readAnimation(binary(broken))).toThrow(/samples q has 4 values, not 8/);
  });
});

describe('meshFacts and animationFacts', () => {
  it('sums the drawn shapes and names their shaders and textures', () => {
    expect(meshFacts(readMesh(binary(MESH)))).toEqual({
      summary: '1 shape · 4 vertices · 2 triangles · 2 bones · 1 collision shape',
      shaders: ['PdxMeshStandardSkinned'],
      textures: ['flag_diffuse.dds'],
    });
  });

  it('gives the frames, the speed, the length and the joints', () => {
    expect(animationFacts(readAnimation(binary(ANIM)))).toBe(
      '2 frames at 15 fps (0.1 s) · 2 joints',
    );
  });
});

describe('skinning', () => {
  it('bends the vertices of the tip bone with the animation', () => {
    const mesh = readMesh(text(MESH));
    const animation = readAnimation(text(ANIM));
    const shape = mesh.shapes[0];
    const part = shape?.parts[0];
    if (shape === undefined || part === undefined) throw new Error('no shape');
    expect(jointsOfBones(shape.skeleton, animation)).toEqual([0, 1]);
    // Frame 0 is the bind pose: nothing moves.
    const still = skinPart(part, skinningMatrices(shape.skeleton, animation, 0));
    expect(Array.from(still.positions).map((v) => Math.round(v * 1e5) / 1e5)).toEqual(
      Array.from(part.positions),
    );
    // Frame 1 turns the tip 90 degrees about Z at x = 1: (2, 0) goes to (1, 1), (2, 1) to (0, 1).
    const bent = skinPart(part, skinningMatrices(shape.skeleton, animation, 1));
    const round = (v: number): number => Math.round(v * 1e5) / 1e5 + 0;
    expect(Array.from(bent.positions.subarray(3, 6)).map(round)).toEqual([1, 1, 0]);
    expect(Array.from(bent.positions.subarray(9, 12)).map(round)).toEqual([0, 1, 0]);
    // Vertices on the root bone stay.
    expect(Array.from(bent.positions.subarray(0, 3)).map(round)).toEqual([0, 0, 0]);
    // Tangents turn with the bone and keep their bitangent sign; normals along Z stay.
    expect(Array.from(bent.tangents?.subarray(4, 8) ?? []).map(round)).toEqual([0, 1, 0, 1]);
    expect(Array.from(bent.tangents?.subarray(0, 4) ?? []).map(round)).toEqual([1, 0, 0, 1]);
    expect(Array.from(bent.normals?.subarray(3, 6) ?? []).map(round)).toEqual([0, 0, -1]);
  });

  it('matches a joint named by its path to the bone of its last name', () => {
    const renamed = ANIM.map((item) =>
      'object' in item && item.object === 'tip' ? obj(2, 'root|tip') : item,
    );
    const mesh = readMesh(binary(MESH));
    const skeleton = mesh.shapes[0]?.skeleton ?? [];
    expect(jointsOfBones(skeleton, readAnimation(binary(renamed)))).toEqual([0, 1]);
  });
});
