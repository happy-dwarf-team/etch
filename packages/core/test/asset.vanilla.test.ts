/// <reference types="node" />
// Local only: reads every `.mesh` and `.anim` file of the installed game in place, read only. Runs
// when ETCH_GAME_PATH names the game folder and is skipped otherwise (CI has no game). Game files
// never enter the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAnimation, readMesh } from '../src/asset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

function* files(dir: string, extension: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path, extension);
    else if (entry.name.toLowerCase().endsWith(extension)) yield path;
  }
}

describe.skipIf(gamePath === undefined)('meshes and animations of the installed game', () => {
  it('reads every mesh and animation, binary and text', () => {
    const root = join(gamePath ?? '', 'gfx');
    const stats = { meshes: 0, parts: 0, vertices: 0, triangles: 0, skinned: 0, collision: 0 };
    const failed: string[] = [];
    for (const file of files(root, '.mesh')) {
      try {
        const mesh = readMesh(readFileSync(file));
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
    });
    expect(animation).toEqual({ files: 152, joints: 3_116, text: 3 });
  });
});
