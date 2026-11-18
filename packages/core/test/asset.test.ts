import { describe, expect, it } from 'vitest';
import {
  animationFacts,
  meshFacts,
  jointPose,
  PdxAssetError,
  readAnimation,
  readMesh,
  readPdxAsset,
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
