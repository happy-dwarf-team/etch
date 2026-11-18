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
  skinningMatrices,
  skinPart,
  type PdxAnimation,
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
  it('reads every mesh and animation and poses the animations on their meshes', () => {
    const root = join(gamePath ?? '', 'gfx');
    const meshes = new Map<string, PdxMesh>();
    const stats = { meshes: 0, parts: 0, vertices: 0, triangles: 0, skinned: 0, collision: 0 };
    const failed: string[] = [];
    for (const file of files(root, '.mesh')) {
      try {
        const mesh = readMesh(readFileSync(file));
        meshes.set(file, mesh);
        stats.meshes++;
        for (const shape of mesh.shapes) {
          if (shape.collision) stats.collision++;
          for (const part of shape.parts) {
            stats.parts++;
            stats.vertices += part.positions.length / 3;
            stats.triangles += part.indices.length / 3;
            if (part.skin !== undefined) stats.skinned++;
          }
        }
      } catch (error) {
        failed.push(`${relative(root, file)}: ${String(error)}`);
      }
    }
    const animations = new Map<string, PdxAnimation>();
    for (const file of files(root, '.anim')) {
      try {
        animations.set(file, readAnimation(readFileSync(file)));
      } catch (error) {
        failed.push(`${relative(root, file)}: ${String(error)}`);
      }
    }
    // The animations an `.asset` file names (others, such as western_generic_01_type1_none, are
    // left over and fit no mesh beside them).
    const used = new Set<string>();
    for (const file of files(root, '.asset')) {
      for (const match of readFileSync(file, 'latin1').matchAll(/file\s*=\s*"([^"]+\.anim)"/gi)) {
        used.add((match[1] ?? '').toLowerCase());
      }
    }
    // Pose each used animation on each skinned mesh beside it whose bones it names (half at least).
    const posed = { pairs: 0, sane: 0, ratios: [] as number[], odd: [] as string[] };
    for (const [animFile, animation] of animations) {
      if (!used.has(basename(animFile).toLowerCase())) continue;
      for (const [meshFile, mesh] of meshes) {
        if (dirname(meshFile) !== dirname(animFile)) continue;
        for (const shape of mesh.shapes) {
          const skinned = shape.parts.filter((part) => part.skin !== undefined);
          if (skinned.length === 0 || shape.skeleton.length === 0) continue;
          const joints = jointsOfBones(shape.skeleton, animation);
          const named = joints.filter((joint) => joint !== undefined).length;
          if (named * 2 < shape.skeleton.length) continue;
          posed.pairs++;
          const bind = diagonal(skinned.map((part) => part.positions));
          const frames = [0, Math.floor(animation.frames / 2)];
          let worst = 1;
          let finite = true;
          for (const frame of frames) {
            const matrices = skinningMatrices(shape.skeleton, animation, frame, joints);
            const moved = skinned.map((part) => skinPart(part, matrices).positions);
            finite &&= moved.every((positions) => positions.every(Number.isFinite));
            const ratio = diagonal(moved) / bind;
            if (Math.abs(Math.log(ratio)) > Math.abs(Math.log(worst))) worst = ratio;
          }
          posed.ratios.push(worst);
          if (finite && worst > 0.5 && worst < 2) posed.sane++;
          else {
            posed.odd.push(
              `${relative(root, animFile)} on ${relative(root, meshFile)}/${shape.name}: ${worst.toFixed(2)}`,
            );
          }
        }
      }
    }
    console.log(stats, { animations: animations.size, failed });
    console.log({ used: used.size, pairs: posed.pairs, sane: posed.sane }, posed.odd.slice(0, 20));
    expect(failed).toEqual([]);
    expect(posed.pairs).toBeGreaterThan(100);
    expect(posed.sane).toBe(posed.pairs);
  });
});
