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
  checkAssetParticles,
  checkGfxParticles,
  checkParticleBlocks,
  MAP_TREE_NAME,
  mapTreeOf,
  particleTextureFiles,
  readAnimation,
  readMesh,
  resolveEntity,
  shaderEffectNames,
  shaderPlacesLocalSpace,
  type PdxMesh,
  type ResolvedEntity,
} from '../src/asset/index.ts';
import { decodeGameText, parseScript } from '../src/index.ts';
import { keyOf } from '../src/model/properties.ts';
import { normaliseGamePath, textureCandidates } from '../src/model/references.ts';
import {
  GameFiles,
  loadEntityIndex,
  loadPdxMeshTypes,
  type GameFile,
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
    /** Each event particle of a top-level entity's states, with its system and scale. */
    const events = new Map<string, number>();
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
        for (const state of entity.states) {
          for (const event of state.events) {
            if (event.particle === undefined) continue;
            const key = `${event.particle} → ${event.system ?? '(none)'} × ${String(event.pdxparticle?.scale ?? 1)}`;
            events.set(key, (events.get(key) ?? 0) + 1);
          }
        }
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
    // EU4 1.37.5: every state event's particle is a pdxparticle type whose `type` names a
    // particle system. Etch 2.14 and earlier looked the name up among the systems and reported
    // 67 problems here: "devastation_smoke_particle" in two devastation states of
    // "westerngfx_city_0" and the 32 entities that clone it, and "siege_cannon" in the siege
    // cannon's idle state (the systems "siege_smoke_particle" at scale 3.5 and
    // "artillery_cannon" at 0.8).
    expect(Object.fromEntries(problems)).toEqual({});
    expect([...missingBones].slice(0, 10)).toEqual([]);
    // EU4 1.37.5: every entity has a mesh once its clone is applied, every state animation
    // resolves to an .anim, and every attachment's bone is in the mesh's skeleton.
    expect(stats).toEqual({
      entities: 1523,
      withMesh: 1523,
      states: 5060,
      statesWithAnimation: 4601,
      attachments: 1411,
      bonesFound: 1411,
      problems: 0,
    });
    // The 577 particle events of the resolved states (clones included), by pdxparticle type,
    // system and scale (1 where the type has none): all 11 types of vanilla's
    // interface/assets/particles.gfx and robot_particles.gfx, two of them under another name.
    expect(Object.fromEntries(events)).toEqual({
      'artillery_cannon → artillery_cannon × 1.2': 33,
      'devastation_smoke_particle → siege_smoke_particle × 3.5': 66,
      'musket_muzzle → musket_muzzle × 1': 13,
      'musket_smoke_residue → musket_smoke_residue × 1': 2,
      'musket_trigger_smoke → musket_trigger_smoke × 1': 2,
      'robot_rifle_laser_muzzle → robot_rifle_laser_muzzle × 1': 11,
      'ship_cannon → ship_cannon × 1': 151,
      'siege_cannon → artillery_cannon × 0.8': 1,
      'siege_smoke_particle → siege_smoke_particle × 2': 264,
      'smith_sparks → smith_sparks × 1': 1,
      'white_smoke_particle → white_smoke_particle × 2': 33,
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

  it('warns on no particle reference of its .asset and .gfx files', async () => {
    const files = new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]);
    const index = await loadEntityIndex(files);
    const under = async (dir: string, extension: string): Promise<GameFile[]> => [
      ...(await files.list(dir, extension)),
      ...(await Promise.all((await files.folders(dir)).map((sub) => under(sub, extension)))).flat(),
    ];
    const text = (file: GameFile): string =>
      decodeGameText(readFileSync(file.absolutePath), 'script').text;
    const assets = await under('gfx', '.asset');
    const gfx = await under('interface', '.gfx');
    const warnings = [
      ...assets.flatMap((file) => checkAssetParticles(parseScript(text(file)), index)),
      ...gfx.flatMap((file) => checkGfxParticles(parseScript(text(file)), index)),
    ];
    expect(warnings).toEqual([]);
    expect(assets.length).toBeGreaterThan(0);
    expect(gfx.length).toBeGreaterThan(0);
  });

  it('warns on nothing in its particle blocks, and finds each of their textures', async () => {
    const files = new GameFiles([{ name: 'game', root: gamePath ?? '', replacePaths: [] }]);
    const under = async (dir: string, extension: string): Promise<GameFile[]> => [
      ...(await files.list(dir, extension)),
      ...(await Promise.all((await files.folders(dir)).map((sub) => under(sub, extension)))).flat(),
    ];
    const shader = await files.find('gfx/FX/particle.shader');
    expect(shader).toBeDefined();
    const shaderText = readFileSync(shader?.absolutePath ?? '', 'latin1');
    const effects = shaderEffectNames(shaderText);
    // Vanilla declares InstanceWorldMatrix and never reads it: local_space particles miss the effect.
    expect(shaderPlacesLocalSpace(shaderText)).toBe(false);
    expect([...effects].sort()).toEqual([
      'ParticleAdditive',
      'ParticleAlphaBlend',
      'ParticlePreAlphaBlend',
    ]);
    const warnings: string[] = [];
    const textures: string[] = [];
    let blocks = 0;
    for (const file of await under('gfx', '.asset')) {
      const parsed = parseScript(decodeGameText(readFileSync(file.absolutePath), 'script').text);
      blocks += parsed.entries.filter(
        (e) => e.kind === 'property' && keyOf(e) === 'particle',
      ).length;
      for (const d of checkParticleBlocks(parsed, effects))
        warnings.push(`${file.path}: ${d.message}`);
      for (const node of particleTextureFiles(parsed)) {
        const candidates = textureCandidates(normaliseGamePath(node.text));
        const found = await Promise.all(candidates.map((c) => files.find(c)));
        if (!found.some((f) => f !== undefined)) textures.push(`${file.path}: ${node.text}`);
      }
    }
    expect(warnings).toEqual([]);
    expect(textures).toEqual([]);
    expect(blocks).toBe(9);
  });
});
