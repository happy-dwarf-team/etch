// A `.mesh` file as Etch draws it. The tree (pdx-asset.ts) is
//
//   [object] / [[shape]] / [[[mesh]]]       p (xyz), n (xyz), ta (xyzw), u0 (uv), u1, tri
//                          [[[[aabb]]]]     min, max
//                          [[[[material]]]] shader, diff, n, spec (file names beside the mesh)
//                          [[[[skin]]]]     bones (influences per vertex), ix and w (4 per vertex)
//                        [[[skeleton]]] / [[[[bone]]]]  ix, pa (parent; none on the root),
//                                                       tx (inverse bind: 3 × 3 by columns, then
//                                                       the translation)
//
// as every mesh of EU4 1.37.5 writes it. Shapes whose shader is `Collision` are the game's
// picking volumes: they have no texture coordinates and are kept apart.

import { childOf, floats, ints, PdxAssetError, readPdxAsset, strings } from './pdx-asset.ts';
import type { PdxNode } from './pdx-asset.ts';

export interface MeshMaterial {
  readonly shader: string;
  readonly diffuse: string | undefined;
  readonly normal: string | undefined;
  readonly specular: string | undefined;
}

export interface MeshSkin {
  /** Influences used per vertex, 1–4; `bones` and `weights` always hold 4 per vertex. */
  readonly influences: number;
  /** Indices into the shape's skeleton; unused slots are negative or have weight 0. */
  readonly bones: Int32Array;
  readonly weights: Float32Array;
}

export interface MeshPart {
  readonly positions: Float32Array;
  readonly normals: Float32Array | undefined;
  /**
   * Tangents, 4 per vertex: the direction of +u in xyz and in w the sign (±1) of the bitangent,
   * which is `cross(normal, tangent.xyz) × w`, as the game's mesh shader builds it.
   */
  readonly tangents: Float32Array | undefined;
  readonly uvs: Float32Array | undefined;
  /**
   * The second texture coordinates (`u1`, 2 per vertex): where a `PdxMeshTextureAtlas` part (a
   * ship's sails, a map flag) samples its country's flag.
   */
  readonly uvs1: Float32Array | undefined;
  readonly indices: Uint32Array;
  readonly material: MeshMaterial;
  readonly skin: MeshSkin | undefined;
}

export interface SkeletonBone {
  readonly name: string;
  /** The index `skin.bones` uses. */
  readonly index: number;
  readonly parent: number | undefined;
  /** The inverse bind matrix, 4 × 4 by columns. */
  readonly inverseBind: Float32Array;
}

export interface MeshShape {
  readonly name: string;
  readonly parts: readonly MeshPart[];
  /** Indexed by `SkeletonBone.index`; empty for a shape that is not skinned. */
  readonly skeleton: readonly SkeletonBone[];
  readonly collision: boolean;
}

export interface PdxMesh {
  readonly shapes: readonly MeshShape[];
  /** The bounds of every drawn (not collision) vertex, or `undefined` for none. */
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] } | undefined;
}

export function readMesh(bytes: Uint8Array): PdxMesh {
  const root = readPdxAsset(bytes);
  const object = childOf(root, 'object');
  if (object === undefined) throw new PdxAssetError('the mesh file has no [object]');
  const shapes: MeshShape[] = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const shape of object.children) {
    const parts: MeshPart[] = [];
    for (const mesh of shape.children.filter((child) => child.name === 'mesh')) {
      const positions = floats(mesh, 'p');
      const triangles = ints(mesh, 'tri');
      if (positions === undefined || triangles === undefined) {
        throw new PdxAssetError(`a mesh of shape "${shape.name}" has no p or tri`);
      }
      const vertices = positions.length / 3;
      for (const index of triangles) {
        if (index < 0 || index >= vertices) {
          throw new PdxAssetError(`shape "${shape.name}" has a triangle index out of range`);
        }
      }
      const material = childOf(mesh, 'material');
      const first = (name: string): string | undefined =>
        material === undefined ? undefined : strings(material, name)?.[0];
      const skin = childOf(mesh, 'skin');
      const bones = skin === undefined ? undefined : ints(skin, 'ix');
      const weights = skin === undefined ? undefined : floats(skin, 'w');
      const sized = (values: Float32Array | undefined, width: number): Float32Array | undefined =>
        values?.length === vertices * width ? values : undefined;
      parts.push({
        positions,
        normals: sized(floats(mesh, 'n'), 3),
        tangents: sized(floats(mesh, 'ta'), 4),
        uvs: sized(floats(mesh, 'u0'), 2),
        uvs1: sized(floats(mesh, 'u1'), 2),
        indices: Uint32Array.from(triangles),
        material: {
          shader: first('shader') ?? '',
          diffuse: first('diff'),
          normal: first('n'),
          specular: first('spec'),
        },
        skin:
          skin !== undefined && bones?.length === vertices * 4 && weights?.length === vertices * 4
            ? { influences: ints(skin, 'bones')?.[0] ?? 4, bones, weights }
            : undefined,
      });
    }
    const collision =
      parts.length > 0 && parts.every((part) => part.material.shader === 'Collision');
    if (!collision) {
      for (const part of parts) {
        for (let i = 0; i < part.positions.length; i++) {
          const axis = i % 3;
          const value = part.positions[i] ?? 0;
          if (value < (min[axis] ?? 0)) min[axis] = value;
          if (value > (max[axis] ?? 0)) max[axis] = value;
        }
      }
    }
    shapes.push({ name: shape.name, parts, skeleton: skeletonOf(shape), collision });
  }
  return {
    shapes,
    bounds: (min[0] ?? Infinity) <= (max[0] ?? -Infinity) ? { min, max } : undefined,
  };
}

function skeletonOf(shape: PdxNode): SkeletonBone[] {
  const skeleton = childOf(shape, 'skeleton');
  if (skeleton === undefined) return [];
  const bones: SkeletonBone[] = [];
  for (const bone of skeleton.children) {
    const index = ints(bone, 'ix')?.[0];
    const tx = floats(bone, 'tx');
    if (index === undefined || tx?.length !== 12) {
      throw new PdxAssetError(`bone "${bone.name}" has no ix or a tx of 12 floats`);
    }
    const m = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 3; row++) m[column * 4 + row] = tx[column * 3 + row] ?? 0;
    }
    m[15] = 1;
    bones[index] = { name: bone.name, index, parent: ints(bone, 'pa')?.[0], inverseBind: m };
  }
  return bones;
}
