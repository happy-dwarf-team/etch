import { describe, expect, it } from 'vitest';
import {
  animationFacts,
  animationFits,
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
import {
  ANIM,
  ANIM_THREE_JOINTS,
  binary,
  floats,
  half,
  ints,
  MESH,
  obj,
  strs,
  text,
} from './fixtures/pdx-asset.ts';

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
    expect(mesh.shapes.map((s) => [s.name, s.collision, s.lod])).toEqual([
      ['flagShape', false, undefined],
      ['pickShape', true, undefined],
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

  it("reads each shape's level of detail from its lod property, not its name", () => {
    const shape = (name: string, lod?: number) => [
      obj(2, name),
      ...(lod === undefined ? [] : [ints('lod', lod)]),
      obj(3, 'mesh'),
      floats('p', 0, 0, 0, 1, 0, 0, 0, 1, 0),
      ints('tri', 0, 1, 2),
      obj(4, 'material'),
      strs('shader', 'PdxMeshStandard'),
    ];
    const mesh = readMesh(
      binary([
        ints('pdxasset', 1, 0),
        obj(1, 'object'),
        floats('loddist', 0, 20, 50),
        // As vanilla's Mapitems trees and savanna trees name them.
        ...shape('HighShape', 0),
        ...shape('LodShape2', 1),
        ...shape('lodShape3', 2),
        // A name alone gives no level, and a negative level is every distance.
        ...shape('lodShape1'),
        ...shape('bannerShape', -1),
      ]),
    );
    expect(mesh.shapes.map((s) => [s.name, s.lod])).toEqual([
      ['HighShape', 0],
      ['LodShape2', 1],
      ['lodShape3', 2],
      ['lodShape1', undefined],
      ['bannerShape', undefined],
    ]);
    expect(mesh.lodDistances).toEqual([0, 20, 50]);
    expect(readMesh(binary(MESH)).lodDistances).toBeUndefined();
  });

  it('refuses a triangle index past the vertices', () => {
    const broken = MESH.map((item) =>
      'name' in item && item.name === 'tri' && item.values.length === 6
        ? ints('tri', 0, 1, 9, 1, 3, 2)
        : item,
    );
    expect(() => readMesh(binary(broken))).toThrow(/out of range/);
  });

  it('skips an empty [mesh] beside the full ones, as the game draws the rest', () => {
    // As Anbennar's t1_troll.mesh writes it: a full mesh, then one with no properties and no
    // children, in the same shape.
    const full = [
      obj(3, 'mesh'),
      floats('p', 0, 0, 0, 1, 0, 0, 0, 1, 0),
      ints('tri', 0, 1, 2),
      obj(4, 'material'),
      strs('shader', 'PdxMeshStandard'),
    ];
    const items = [
      ints('pdxasset', 1, 0),
      obj(1, 'object'),
      obj(2, 'trollShape'),
      ...full,
      obj(3, 'mesh'),
      ...full,
      obj(3, 'mesh'),
      obj(2, 'otherShape'),
      ...full,
    ];
    for (const encode of [binary, text]) {
      const mesh = readMesh(encode(items));
      expect(mesh.shapes.map((s) => [s.name, s.parts.length])).toEqual([
        ['trollShape', 2],
        ['otherShape', 1],
      ]);
      expect(mesh.bounds).toEqual({ min: [0, 0, 0], max: [1, 1, 0] });
    }
  });

  it('refuses a mesh with p but no tri, or tri but no p', () => {
    // flagShape's mesh has 4 vertices (12 values of p) and 2 triangles (6 values of tri).
    const without = (name: string, length: number): typeof MESH =>
      MESH.filter(
        (item) => !('name' in item && item.name === name && item.values.length === length),
      );
    expect(() => readMesh(binary(without('tri', 6)))).toThrow(/"flagShape" has no p or tri/);
    expect(() => readMesh(binary(without('p', 12)))).toThrow(/"flagShape" has no p or tri/);
  });

  it('refuses a bone index outside the skeleton or given twice', () => {
    // The skeleton's second bone, `tip`, has ix 1 (the skin's ix has 16 values).
    const tipIndex = (index: number): typeof MESH =>
      MESH.map((item) =>
        'name' in item && item.name === 'ix' && item.values.length === 1 && item.values[0] === 1
          ? ints('ix', index)
          : item,
      );
    // A mutated file once gave ix 1258291209: a sparse skeleton that long took 27 s to walk.
    expect(() => readMesh(binary(tipIndex(1258291209)))).toThrow(/not one of 0 to 1 once/);
    expect(() => readMesh(binary(tipIndex(-1)))).toThrow(PdxAssetError);
    expect(() => readMesh(binary(tipIndex(0)))).toThrow(/"tip" has ix 0/);
    expect(readMesh(binary(tipIndex(1))).shapes[0]?.skeleton).toHaveLength(2);
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

  /** Two joints over two frames; `b` samples its scale, written `width` floats wide. */
  const scaled = (width: 1 | 3, samples: number[]): typeof ANIM => [
    ints('pdxasset', 1, 0),
    obj(1, 'info'),
    floats('fps', 24),
    ints('sa', 2),
    ints('j', 2),
    obj(2, 'a'),
    strs('sa', ''),
    floats('t', 0, 0, 0),
    floats('q', 0, 0, 0, 1),
    floats('s', ...(width === 3 ? [1, 1, 0.99999994] : [1])),
    obj(2, 'b'),
    strs('sa', 's'),
    floats('t', 0, 0, 0),
    floats('q', 0, 0, 0, 1),
    floats('s', ...(width === 3 ? [1, 2, 3] : [2])),
    obj(1, 'samples'),
    floats('s', ...samples),
  ];

  it('reads a uniform scale of one float per joint, as vanilla writes it', () => {
    const animation = readAnimation(binary(scaled(1, [1, 3])));
    expect(animation.scaleWidth).toBe(1);
    expect(animation.joints[0]?.rest.s).toEqual([1, 1, 1]);
    expect(animation.joints[1]?.rest.s).toEqual([2, 2, 2]);
    expect(jointPose(animation, 1, 0.5).s).toEqual([2, 2, 2]);
    expect(jointPose(animation, 0, 0.5).s).toEqual([1, 1, 1]);
  });

  it('reads a scale of three floats per joint, in the rest values and the samples', () => {
    // As Anbennar's troll_3_retreat.anim writes it.
    for (const encode of [binary, text]) {
      const animation = readAnimation(encode(scaled(3, [1, 1, 1, 3, 5, 7])));
      expect(animation.scaleWidth).toBe(3);
      expect(animation.joints[0]?.rest.s.map((v) => Math.fround(v))).toEqual([
        1,
        1,
        Math.fround(0.99999994),
      ]);
      expect(animation.joints[1]?.rest.s).toEqual([1, 2, 3]);
      expect(jointPose(animation, 1, 0).s).toEqual([1, 1, 1]);
      expect(jointPose(animation, 1, 0.5).s).toEqual([2, 3, 4]);
      expect(jointPose(animation, 1, 1).s).toEqual([3, 5, 7]);
    }
  });

  it('refuses scale samples neither one nor three floats per joint and frame', () => {
    expect(() => readAnimation(binary(scaled(3, [1, 1, 1, 1])))).toThrow(
      /samples s has 4 values, not 2 or 6/,
    );
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

  it('binds joints to bones by index, whatever their names, as the game does', () => {
    // Swapped names: by name the root would take the turning joint; the game poses bone k with
    // joint k, so the tip still turns (vanilla's rifleman_idle names joint 9 attack_L_hand where
    // the skeleton's bone 9 is Left_hand_node).
    const names: Record<string, string> = { root: 'tip', tip: 'root' };
    const swapped = ANIM.map((item) =>
      'object' in item && item.object in names ? obj(2, names[item.object] ?? '') : item,
    );
    const mesh = readMesh(binary(MESH));
    const shape = mesh.shapes[0];
    const part = shape?.parts[0];
    if (shape === undefined || part === undefined) throw new Error('no shape');
    const animation = readAnimation(binary(swapped));
    expect(animationFits(shape.skeleton, animation)).toBe(true);
    expect(jointsOfBones(shape.skeleton, animation)).toEqual([0, 1]);
    const bent = skinPart(part, skinningMatrices(shape.skeleton, animation, 1));
    const round = (v: number): number => Math.round(v * 1e5) / 1e5 + 0;
    expect(Array.from(bent.positions.subarray(3, 6)).map(round)).toEqual([1, 1, 0]);
  });

  it('plays nothing when the joint count is not the bone count, as the game does', () => {
    const mesh = readMesh(binary(MESH));
    const shape = mesh.shapes[0];
    const part = shape?.parts[0];
    if (shape === undefined || part === undefined) throw new Error('no shape');
    const animation = readAnimation(binary(ANIM_THREE_JOINTS));
    expect(animation.joints).toHaveLength(3);
    expect(animationFits(shape.skeleton, animation)).toBe(false);
    expect(jointsOfBones(shape.skeleton, animation)).toEqual([undefined, undefined]);
    // Every bone keeps its bind pose: nothing moves at the frame that turns the tip.
    const still = skinPart(part, skinningMatrices(shape.skeleton, animation, 1));
    expect(Array.from(still.positions).map((v) => Math.round(v * 1e5) / 1e5)).toEqual(
      Array.from(part.positions),
    );
  });
});
