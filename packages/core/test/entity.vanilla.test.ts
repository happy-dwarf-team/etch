/// <reference types="node" />
// Local only: resolves every entity of the installed game's `.asset` files through its `.gfx`
// pdxmesh types, read in place and read only, and checks that each attachment's bone is a bone
// of the mesh it hangs on. Runs when ETCH_GAME_PATH names the game folder and is skipped
// otherwise (CI has no game). Game files never enter the repository.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAP_TREE_NAME,
  mapTreeOf,
  readMesh,
  resolveEntity,
  type PdxMesh,
  type ResolvedEntity,
} from '../src/asset/index.ts';
import {
  GameFiles,
  loadEntityIndex,
  loadPdxMeshTypes,
  loadTexturesByName,
} from '../src/playset/index.ts';

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

  it('finds a texture by name in another folder than its mesh', async () => {
    const byName = await loadTexturesByName(
      new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]),
    );
    // EU4 1.37.5: the desert forts in gfx/models/Buildings name a specular map that is only in
    // Buildings/Western.
    expect(byName.get('cose_fort_02_spec.dds')?.path).toBe(
      'gfx/models/Buildings/Western/cose_fort_02_spec.dds',
    );
  });
});
