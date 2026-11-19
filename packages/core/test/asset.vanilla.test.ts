/// <reference types="node" />
// Local only: reads every `.mesh` and `.anim` file of the installed game in place, read only, and
// poses each animation on the meshes beside it whose skeleton it names. Runs when ETCH_GAME_PATH
// names the game folder and is skipped otherwise (CI has no game). Game files never enter the
// repository.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  jointsOfBones,
  readAnimation,
  readMesh,
  renderMeshThumbnail,
  skinningMatrices,
  skinPart,
  type PdxMesh,
} from '../src/asset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

function* files(dir: string, extension: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path, extension);
    else if (entry.name.toLowerCase().endsWith(extension)) yield path;
  }
}

/** The diagonal of the bounds of a set of xyz positions. */
function diagonal(sets: readonly Float32Array[]): number {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const positions of sets) {
    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      const value = positions[i] ?? 0;
      min[axis] = Math.min(min[axis] ?? 0, value);
      max[axis] = Math.max(max[axis] ?? 0, value);
    }
  }
  return Math.hypot(...[0, 1, 2].map((axis) => (max[axis] ?? 0) - (min[axis] ?? 0)));
}

describe.skipIf(gamePath === undefined)('meshes and animations of the installed game', () => {
  it('reads every mesh and animation, binary and text', () => {
    const root = join(gamePath ?? '', 'gfx');
    const stats = {
      meshes: 0,
      parts: 0,
      vertices: 0,
      triangles: 0,
      skinned: 0,
      collision: 0,
      tangents: 0,
      uvs1: 0,
      atlasWithUvs1: 0,
      lodMeshes: 0,
      lodShapes: 0,
    };
    const failed: string[] = [];
    for (const file of files(root, '.mesh')) {
      try {
        const mesh = readMesh(readFileSync(file));
        stats.meshes++;
        const levels = mesh.shapes.filter((shape) => shape.lod !== undefined).length;
        if (levels > 0) stats.lodMeshes++;
        stats.lodShapes += levels;
        for (const shape of mesh.shapes) {
          if (shape.collision) stats.collision++;
          for (const part of shape.parts) {
            stats.parts++;
            stats.vertices += part.positions.length / 3;
            stats.triangles += part.indices.length / 3;
            if (part.skin !== undefined) stats.skinned++;
            if (part.tangents !== undefined) stats.tangents++;
            if (part.uvs1 !== undefined) {
              stats.uvs1++;
              if (part.material.shader === 'PdxMeshTextureAtlas') stats.atlasWithUvs1++;
            }
          }
        }
      } catch (error) {
        failed.push(`${relative(root, file)}: ${String(error)}`);
      }
    }
    const animation = { files: 0, joints: 0, text: 0 };
    for (const file of files(root, '.anim')) {
      try {
        const bytes = readFileSync(file);
        animation.joints += readAnimation(bytes).joints.length;
        animation.files++;
        if (bytes.subarray(0, 4).toString('latin1') === '@@t@') animation.text++;
      } catch (error) {
        failed.push(`${relative(root, file)}: ${String(error)}`);
      }
    }
    expect(failed).toEqual([]);
    expect(stats).toEqual({
      meshes: 476,
      parts: 644,
      vertices: 548_108,
      triangles: 636_463,
      skinned: 221,
      collision: 40,
      // Every part but the collision shapes' carries tangents for its normal map.
      tangents: 604,
      uvs1: 157,
      // Every PdxMeshTextureAtlas part (ships, the map flag) has the UVs its flag is drawn with.
      atlasWithUvs1: 21,
      // The map's trees (16, up to five levels each) and the map flag (one level).
      lodMeshes: 17,
      lodShapes: 66,
    });
    expect(animation).toEqual({ files: 152, joints: 3_116, text: 3 });
  });

  it('poses each animation an .asset file uses on the skinned meshes beside it', () => {
    const root = join(gamePath ?? '', 'gfx');
    // The animations an `.asset` file names (others, such as western_generic_01_type1_none, are
    // left over and fit no mesh beside them).
    const used = new Set<string>();
    for (const file of files(root, '.asset')) {
      for (const match of readFileSync(file, 'latin1').matchAll(/file\s*=\s*"([^"]+\.anim)"/gi)) {
        used.add((match[1] ?? '').toLowerCase());
      }
    }
    const meshes = new Map<string, PdxMesh>();
    for (const file of files(root, '.mesh')) meshes.set(file, readMesh(readFileSync(file)));
    const posed = { animations: 0, pairs: 0, sane: 0, odd: [] as string[] };
    for (const animFile of files(root, '.anim')) {
      if (!used.has(basename(animFile).toLowerCase())) continue;
      const animation = readAnimation(readFileSync(animFile));
      posed.animations++;
      for (const [meshFile, mesh] of meshes) {
        if (dirname(meshFile) !== dirname(animFile)) continue;
        for (const shape of mesh.shapes) {
          const skinned = shape.parts.filter((part) => part.skin !== undefined);
          if (skinned.length === 0 || shape.skeleton.length === 0) continue;
          // A mesh beside the animation whose bones it names, half of them at least.
          const joints = jointsOfBones(shape.skeleton, animation);
          const named = joints.filter((joint) => joint !== undefined).length;
          if (named * 2 < shape.skeleton.length) continue;
          posed.pairs++;
          const bind = diagonal(skinned.map((part) => part.positions));
          let worst = 1;
          let finite = true;
          for (const frame of [0, Math.floor(animation.frames / 2)]) {
            const matrices = skinningMatrices(shape.skeleton, animation, frame, joints);
            const moved = skinned.map((part) => skinPart(part, matrices).positions);
            finite &&= moved.every((positions) => positions.every(Number.isFinite));
            const ratio = diagonal(moved) / bind;
            if (Math.abs(Math.log(ratio)) > Math.abs(Math.log(worst))) worst = ratio;
          }
          // A wrong skeleton layout (matrix order, inverse bind, quaternion order) scatters the
          // vertices or collapses them; a right one keeps the posed mesh near its bind size.
          if (finite && worst > 0.5 && worst < 2) posed.sane++;
          else posed.odd.push(`${relative(root, animFile)} on ${shape.name}: ${worst.toFixed(2)}`);
        }
      }
    }
    expect(posed).toEqual({ animations: 151, pairs: 444, sane: 444, odd: [] });
  });

  it('renders a thumbnail of every mesh that draws something', () => {
    const root = join(gamePath ?? '', 'gfx');
    const rendered = { meshes: 0, empty: [] as string[], slowestMs: 0 };
    for (const file of files(root, '.mesh')) {
      const mesh = readMesh(readFileSync(file));
      if (mesh.bounds === undefined) continue;
      const started = performance.now();
      const image = renderMeshThumbnail(mesh, new Map(), 128);
      rendered.slowestMs = Math.max(rendered.slowestMs, performance.now() - started);
      rendered.meshes++;
      if (!image.rgba.some((value, i) => i % 4 === 3 && value > 0)) {
        rendered.empty.push(relative(root, file));
      }
    }
    console.log(rendered);
    expect(rendered.empty).toEqual([]);
    expect(rendered.meshes).toBe(476);
  });
});
