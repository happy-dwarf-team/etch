/// <reference types="node" />
// Local only: resolves every entity of the installed game's `.asset` files through its `.gfx`
// pdxmesh types, read in place and read only, and checks that each attachment's bone is a bone
// of the mesh it hangs on. Runs when ETCH_GAME_PATH names the game folder and is skipped
// otherwise (CI has no game). Game files never enter the repository.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  animationFits,
  MAP_TREE_NAME,
  mapTreeOf,
  readAnimation,
  readMesh,
  resolveEntity,
  type PdxMesh,
  type ResolvedEntity,
} from '../src/asset/index.ts';
import { GameFiles, loadEntityIndex, loadPdxMeshTypes } from '../src/playset/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];

describe.skipIf(gamePath === undefined)('entities of the installed game', () => {
  it('resolves every entity, its states and its attachments', async () => {
    const root = gamePath ?? '';
    const index = await loadEntityIndex(new GameFiles([{ name: 'game', root, replacePaths: [] }]));
    const meshes = new Map<string, PdxMesh | undefined>();
    const meshOf = (path: string): PdxMesh | undefined => {
      if (!meshes.has(path)) {
        try {
          meshes.set(path, readMesh(readFileSync(join(root, path))));
        } catch {
          meshes.set(path, undefined);
        }
      }
      return meshes.get(path);
    };
    const stats = {
      entities: 0,
      withMesh: 0,
      states: 0,
      statesWithAnimation: 0,
      attachments: 0,
      bonesFound: 0,
      problems: 0,
    };
    const missingBones = new Set<string>();
    const problems = new Map<string, number>();
    const walk = (entity: ResolvedEntity, top: boolean): void => {
      if (top) {
        stats.entities++;
        if (entity.mesh !== undefined) stats.withMesh++;
        stats.states += entity.states.length;
        stats.statesWithAnimation += entity.states.filter((s) => s.file !== undefined).length;
        for (const problem of entity.problems) {
          const kind = problem.replace(/"[^"]*"/g, '…');
          problems.set(kind, (problems.get(kind) ?? 0) + 1);
        }
        stats.problems += entity.problems.length;
      }
      const mesh = entity.mesh === undefined ? undefined : meshOf(entity.mesh);
      const bones = new Set(mesh?.shapes.flatMap((s) => s.skeleton.map((b) => b.name)));
      for (const attachment of entity.attachments) {
        if (top) {
          stats.attachments++;
          if (bones.has(attachment.bone)) stats.bonesFound++;
          else missingBones.add(`${entity.name}: ${attachment.bone}`);
        }
      }
    };
    for (const name of index.entities.keys()) {
      const entity = resolveEntity(index, name);
      if (entity !== undefined) walk(entity, true);
    }
    // EU4 1.37.5 names two particles no .asset file of the game folder defines:
    // "devastation_smoke_particle" in two devastation states of "westerngfx_city_0" and the 32
    // entities that clone it, and "siege_cannon" in the siege cannon's idle state.
    expect(Object.fromEntries(problems)).toEqual({
      'state devastation_4: no particle … in the .asset files': 33,
      'state devastation_5: no particle … in the .asset files': 33,
      'state idle: no particle … in the .asset files': 1,
    });
    expect([...missingBones].slice(0, 10)).toEqual([]);
    // EU4 1.37.5: every entity has a mesh once its clone is applied, every state animation
    // resolves to an .anim, and every attachment's bone is in the mesh's skeleton; the only
    // problems are the particles above.
    expect(stats).toEqual({
      entities: 1523,
      withMesh: 1523,
      states: 5060,
      statesWithAnimation: 4601,
      attachments: 1411,
      bonesFound: 1411,
      problems: 67,
    });
  });

  it('plays every pdxmesh animation on its mesh, joints bound to bones by index', async () => {
    const root = gamePath ?? '';
    const index = await loadEntityIndex(new GameFiles([{ name: 'game', root, replacePaths: [] }]));
    const counts = { pairs: 0, fit: 0, nameIsIndex: 0, differ: new Map<string, number>() };
    for (const type of index.pdxmeshes.values()) {
      if (type.file === undefined) continue;
      const mesh = readMesh(readFileSync(join(root, type.file)));
      for (const animationType of type.animations.values()) {
        const file = index.animations.get(animationType)?.file;
        if (file === undefined) continue;
        const animation = readAnimation(readFileSync(join(root, file)));
        for (const shape of mesh.shapes) {
          if (shape.skeleton.length === 0) continue;
          counts.pairs++;
          if (!animationFits(shape.skeleton, animation)) continue;
          counts.fit++;
          // The bones a binding by name (Etch 2.14 and earlier) would pose with another joint, or none.
          const byName = shape.skeleton.flatMap((bone, k) =>
            animation.joints[k]?.name === bone.name
              ? []
              : [`${bone.name}←${animation.joints[k]?.name ?? ''}`],
          );
          if (byName.length === 0) counts.nameIsIndex++;
          for (const pair of byName) counts.differ.set(pair, (counts.differ.get(pair) ?? 0) + 1);
        }
      }
    }
    // EU4 1.37.5: every animation a pdxmesh names has its mesh's bone count, so the game plays
    // them all. In 645 pairs some joint's name is not its bone's: the hand nodes of the infantry
    // animations (rifleman_*, musketeer_02_*, polearm_*) and the galleass's attack, whose skeleton
    // names its bones by path ("Top4|Top2") and the animation by the last name.
    expect([counts.pairs, counts.fit, counts.nameIsIndex]).toEqual([1579, 1579, 934]);
    expect(Object.fromEntries(counts.differ)).toEqual({
      'Left_hand_node←attack_L_hand': 644,
      'Right_hand_node←attack_R_hand': 610,
      'Top4|Top2←Top2': 1,
      'Top4|Top2|Top3←Top3': 1,
      'Top5|Top2←Top2': 1,
      'Top5|Top2|Top3←Top3': 1,
      'Top6|Top2←Top2': 1,
      'Top6|Top2|Top3←Top3': 1,
    });
  });

  it('names the map trees mapobject_<n>, each a mesh of Mapitems/Trees', async () => {
    const root = gamePath ?? '';
    const types = (
      await loadPdxMeshTypes(new GameFiles([{ name: 'game', root, replacePaths: [] }]))
    ).flat();
    const trees = types.filter((t) => MAP_TREE_NAME.test(t.name));
    const meshes = new Set(trees.map((t) => t.file));
    // EU4 1.37.5: 21 tree types in interface/assets/mapitems.gfx over 17 meshes, all read.
    expect([trees.length, meshes.size]).toEqual([21, 17]);
    expect(trees.every((t) => t.at.path === 'interface/assets/mapitems.gfx')).toBe(true);
    expect([...meshes].every((file) => file?.startsWith('gfx/models/Mapitems/Trees/'))).toBe(true);
    const shapes = [...meshes].map(
      (file) => readMesh(readFileSync(join(root, file ?? ''))).shapes.length,
    );
    expect(shapes.every((count) => count > 0)).toBe(true);
    expect(mapTreeOf(types, 'gfx/models/Mapitems/Trees/Pine_01.mesh')?.name).toBe('mapobject_2');
  });
});
