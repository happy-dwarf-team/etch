import { describe, expect, it } from 'vitest';
import {
  checkAssetParticles,
  checkGfxParticles,
  EntityIndex,
  mapTreeOf,
  readAssetFile,
  readPdxMeshTypes,
  readPdxParticleTypes,
  resolveEntity,
} from '../src/asset/index.ts';
import { parseScript } from '../src/index.ts';

const GFX = `objectTypes = {
  pdxmesh = {
    name = "soldier_mesh"
    file = "gfx/models/units/soldier.mesh"
    animation = { id = "idle" type = "soldier_idle_animation" }
    animation = { id = "walk" type = "soldier_walk_animation" }
    scale = 0.5
  }
  pdxmesh = { name = "officer_mesh" file = "gfx\\\\models\\\\units\\\\officer.mesh"
    animation = { id = "idle" type = "soldier_idle_animation" } }
  pdxmesh = { name = "spear_mesh" file = "gfx/models/units/spear.mesh" scale = 0.5 }
  pdxmesh = { name = "flag_mesh" file = "gfx/models/units/flag.mesh" }
  pdxparticle = { name = "musket_flash" type = "musket_smoke" scale = 0.8 }
}
spriteTypes = { spriteType = { name = "GFX_x" texturefile = "gfx/x.dds" } }`;

const UNITS = `entity = {
  name = "soldier"
  pdxmesh = "soldier_mesh"
  state = { name = "idle" animation = "idle" }
  state = { name = "walk" animation = "walk" }
  state = { name = "death" event = { time = 0.25 node = "muzzle" particle = "musket_flash" keep_particle = yes } event = { particle = "dust" trigger_once = yes } loop_time = 2.0f time_offset = { 0.5 0.25 } }
  attach = { name = "weapon" Right_hand_node = "spear" }
  attach = { Back_node = "flag" }
}
entity = {
  clone = "soldier"
  name = "officer"
  pdxmesh = "officer_mesh"
  scale = 2
  state = { name = "walk" animation = "run" }
  attach = { name = "weapon" Left_hand_node = "flag" }
}
entity = { name = "spear" pdxmesh = "spear_mesh" }
entity = { name = "flag" pdxmesh = "flag_mesh" }
entity = { name = "lost" pdxmesh = "no_such_mesh" attach = { node = "nobody" } }
entity = { name = "loop_a" clone = "loop_b" }
entity = { name = "loop_b" clone = "loop_a" }
entity = { name = "swarm" pdxmesh = "spear_mesh" attach = { a_node = "swarm" b_node = "swarm" } }
entity = { name = "ring_a" pdxmesh = "spear_mesh" attach = { a_node = "ring_b" } }
entity = { name = "ring_b" pdxmesh = "flag_mesh" attach = { b_node = "ring_a" c_node = "flag" } }`;

const PARTICLES = `particle = { name = "musket_smoke" subsystem = { max_amount = 10 } }`;

const ANIMATIONS = `animation = { name = "soldier_idle_animation" file = "soldier_idle.anim" }
animation = { name = "soldier_walk_animation" file = "gfx/models/other/walk.anim" }`;

function index(): EntityIndex {
  return EntityIndex.of(
    [readPdxMeshTypes(parseScript(GFX), 'interface/units.gfx')],
    [
      readAssetFile(parseScript(UNITS), 'gfx/entities/units.asset'),
      readAssetFile(parseScript(ANIMATIONS), 'gfx/models/units/animation/animation.asset'),
      readAssetFile(parseScript(PARTICLES), 'gfx/particles/musket_smoke.asset'),
    ],
    [readPdxParticleTypes(parseScript(GFX), 'interface/units.gfx')],
  );
}

describe('readPdxMeshTypes and readAssetFile', () => {
  it('reads pdxmesh types with game-relative files, scales and animation ids', () => {
    const types = readPdxMeshTypes(parseScript(GFX), 'interface/units.gfx');
    expect(types.map((t) => [t.name, t.file, t.scale])).toEqual([
      ['soldier_mesh', 'gfx/models/units/soldier.mesh', 0.5],
      ['officer_mesh', 'gfx/models/units/officer.mesh', undefined],
      ['spear_mesh', 'gfx/models/units/spear.mesh', 0.5],
      ['flag_mesh', 'gfx/models/units/flag.mesh', undefined],
    ]);
    expect(Object.fromEntries(types[0]?.animations ?? [])).toEqual({
      idle: 'soldier_idle_animation',
      walk: 'soldier_walk_animation',
    });
  });

  it('puts a bare animation file beside the .asset file and keeps a path with a folder', () => {
    const { animations } = readAssetFile(
      parseScript(ANIMATIONS),
      'gfx/models/units/animation/animation.asset',
    );
    expect(animations.map((a) => [a.name, a.file])).toEqual([
      ['soldier_idle_animation', 'gfx/models/units/animation/soldier_idle.anim'],
      ['soldier_walk_animation', 'gfx/models/other/walk.anim'],
    ]);
  });

  it("reads the names of a file's particle systems", () => {
    const { particles } = readAssetFile(
      parseScript(
        `${PARTICLES}\nparticle = { subsystem = { } }\nparticle = { name = "dust_cloud" }`,
      ),
      'gfx/particles/smoke.asset',
    );
    expect(particles).toEqual(['musket_smoke', 'dust_cloud']);
  });

  it('reads pdxparticle types with their particle system and scale, beside pdxmesh types', () => {
    const types = readPdxParticleTypes(parseScript(GFX), 'interface/units.gfx');
    expect(types.map((t) => [t.name, t.type, t.scale, t.at.path, t.at.node?.text])).toEqual([
      ['musket_flash', 'musket_smoke', 0.8, 'interface/units.gfx', 'musket_flash'],
    ]);
    expect(readPdxMeshTypes(parseScript(GFX), 'interface/units.gfx')).toHaveLength(4);
    expect(
      readPdxParticleTypes(
        parseScript('objectTypes = { pdxparticle = { type = "x" } pdxparticle = { name = "y" } }'),
        'interface/p.gfx',
      ).map((t) => [t.name, t.type, t.scale]),
    ).toEqual([['y', undefined, undefined]]);
  });
});

describe('mapTreeOf', () => {
  const TREES = `objectTypes = {
    pdxmesh = { name = "mapobject_2" file = "gfx/models/Mapitems/Trees/Pine_01.mesh" }
    pdxmesh = { name = "mapobject_12" file = "gfx\\\\models\\\\Mapitems\\\\Trees\\\\Palms_02.mesh" }
    pdxmesh = { name = "mapobject_x" file = "gfx/models/Mapitems/rock.mesh" }
    pdxmesh = { name = "big_mapobject_3" file = "gfx/models/Mapitems/rock.mesh" }
  }`;
  const types = readPdxMeshTypes(parseScript(TREES), 'interface/assets/mapitems.gfx');

  it('finds the mapobject_<n> type of a mesh path, in any case and separator', () => {
    expect(mapTreeOf(types, 'gfx/models/mapitems/trees/pine_01.mesh')?.name).toBe('mapobject_2');
    expect(mapTreeOf(types, 'gfx\\models\\Mapitems\\Trees\\Palms_02.mesh')?.name).toBe(
      'mapobject_12',
    );
  });

  it('takes only mapobject_ and a number as a tree type', () => {
    expect(mapTreeOf(types, 'gfx/models/Mapitems/rock.mesh')).toBeUndefined();
    expect(mapTreeOf(types, 'gfx/models/units/soldier.mesh')).toBeUndefined();
  });
});

describe('resolveEntity', () => {
  it('resolves the mesh, the scale, the state animations and the attachments', () => {
    const soldier = resolveEntity(index(), 'soldier');
    expect(soldier?.mesh).toBe('gfx/models/units/soldier.mesh');
    expect(soldier?.scale).toBe(0.5);
    expect(soldier?.states).toMatchObject([
      {
        name: 'idle',
        file: 'gfx/models/units/animation/soldier_idle.anim',
        problem: undefined,
        events: [],
      },
      {
        name: 'walk',
        file: 'gfx/models/other/walk.anim',
        problem: undefined,
        events: [],
        timeOffset: undefined,
      },
      {
        name: 'death',
        file: undefined,
        problem: undefined,
        // A state's particle events, with or without a time and a bone.
        events: [
          {
            time: 0.25,
            node: 'muzzle',
            particle: 'musket_flash',
            keepParticle: true,
            triggerOnce: false,
          },
          {
            time: undefined,
            node: undefined,
            particle: 'dust',
            keepParticle: false,
            triggerOnce: true,
          },
        ],
        // `loop_time` is a name of `state_time`; the game reads `2.0f` as 2.
        stateTime: 2,
        timeOffset: { base: 0.5, variation: 0.25 },
      },
    ]);
    expect(
      soldier?.attachments.map((a) => [a.group, a.bone, a.entity.name, a.entity.mesh]),
    ).toEqual([
      ['weapon', 'Right_hand_node', 'spear', 'gfx/models/units/spear.mesh'],
      [undefined, 'Back_node', 'flag', 'gfx/models/units/flag.mesh'],
    ]);
    // "musket_flash" is a pdxparticle type drawing the system "musket_smoke", "dust" nothing.
    expect(
      soldier?.states[2]?.events.map((e) => [e.particle, e.pdxparticle?.name, e.system]),
    ).toEqual([
      ['musket_flash', 'musket_flash', 'musket_smoke'],
      ['dust', undefined, undefined],
    ]);
    expect(soldier?.problems).toEqual(['state death: no pdxparticle "dust" in the .gfx files']);
  });

  it('starts a particle system only through a pdxparticle type, as the game does', () => {
    const gfx = `objectTypes = {
      pdxmesh = { name = "gun_mesh" file = "gfx/models/gun.mesh" }
      pdxparticle = { name = "flash" type = "flash_system" }
      pdxparticle = { name = "smoke" type = "no_system" scale = 2 }
      pdxparticle = { name = "bare" }
    }`;
    const asset = `entity = { name = "gun" pdxmesh = "gun_mesh"
      state = { name = "fire" event = { particle = "flash" } event = { particle = "flash_system" }
        event = { particle = "smoke" } event = { particle = "bare" } event = { particle = "gun_mesh" } }
      state = { name = "again" event = { particle = "flash_system" } }
    }
    particle = { name = "flash_system" }`;
    const gun = resolveEntity(
      EntityIndex.of(
        [readPdxMeshTypes(parseScript(gfx), 'interface/gun.gfx')],
        [readAssetFile(parseScript(asset), 'gfx/gun.asset')],
        [readPdxParticleTypes(parseScript(gfx), 'interface/gun.gfx')],
      ),
      'gun',
    );
    expect(gun?.states[0]?.events.map((e) => [e.particle, e.system])).toEqual([
      ['flash', 'flash_system'],
      ['flash_system', undefined],
      ['smoke', undefined],
      ['bare', undefined],
      ['gun_mesh', undefined],
    ]);
    // A particle system's own name, or a pdxmesh's, is no pdxparticle type: the game logs
    // `Couldn't find particle 3D object`. A type naming no system is logged when the .gfx loads.
    expect(gun?.problems).toEqual([
      'state fire: no pdxparticle "flash_system" in the .gfx files',
      'state fire: pdxparticle "smoke" names no particle "no_system" in the .asset files',
      'state fire: pdxparticle "bare" names no particle system (no type)',
      'state fire: no pdxparticle "gun_mesh" in the .gfx files',
      'state again: no pdxparticle "flash_system" in the .gfx files',
    ]);
  });

  it('warns on the particle references of an .asset and a .gfx file the game cannot start', () => {
    const gfx = `objectTypes = {
      pdxparticle = { name = "flash" type = "flash_system" scale = 0.8 }
      pdxparticle = { name = "smoke" type = "smoke_sytem" }
      pdxparticle = { name = "bare" }
      pdxparticle = { type = "nameless" }
    }`;
    const particles = `particle = { name = "flash_system" }
    particle = { name = "lonely_system" }`;
    const asset = `entity = { name = "gun"
      state = { name = "fire"
        event = { particle = "flash" } event = { time = 0.5 particle = "flash_system" }
        event = { particle = "lonely_system" } event = { particle = "dust" } event = { time = 1 } }
    }`;
    const index = EntityIndex.of(
      [],
      [readAssetFile(parseScript(particles), 'gfx/particles/p.asset')],
      [readPdxParticleTypes(parseScript(gfx), 'interface/p.gfx')],
    );
    const at = (text: string, d: { start: number; end: number }): string =>
      text.slice(d.start, d.end);

    const onAsset = checkAssetParticles(parseScript(asset), index);
    expect(onAsset.map((d) => [d.code, at(asset, d)])).toEqual([
      ['unknown-pdxparticle', '"flash_system"'],
      ['unknown-pdxparticle', '"lonely_system"'],
      ['unknown-pdxparticle', '"dust"'],
    ]);
    expect(onAsset.map((d) => d.message)).toEqual([
      'No .gfx file has a pdxparticle named "flash_system", so the game does not start this particle. The game writes in its error log: Couldn\'t find particle 3D object "flash_system". "flash_system" is the name of a particle effect, not of a pdxparticle: use the pdxparticle that starts it, "flash".',
      'No .gfx file has a pdxparticle named "lonely_system", so the game does not start this particle. The game writes in its error log: Couldn\'t find particle 3D object "lonely_system". "lonely_system" is the name of a particle effect, not of a pdxparticle: add a pdxparticle with type = "lonely_system" to a .gfx file, and write its name here.',
      'No .gfx file has a pdxparticle named "dust", so the game does not start this particle. The game writes in its error log: Couldn\'t find particle 3D object "dust".',
    ]);

    const onGfx = checkGfxParticles(parseScript(gfx), index);
    expect(onGfx.map((d) => [d.code, at(gfx, d), d.message])).toEqual([
      [
        'unknown-particle-system',
        '"smoke_sytem"',
        'No .asset file has a particle effect named "smoke_sytem", so the game cannot start the pdxparticle "smoke". The game writes in its error log: Could not find particle effect [smoke_sytem].',
      ],
      [
        'pdxparticle-without-type',
        '"bare"',
        'The pdxparticle "bare" has no type, so the game does not know which particle effect to start. Add type = "…" with the name of an effect from an .asset file.',
      ],
    ]);
    // Outside an objectTypes block, a pdxparticle is not a type the game reads.
    expect(
      checkGfxParticles(parseScript('pdxparticle = { name = "x" type = "y" }'), index),
    ).toEqual([]);
  });

  it('applies a clone, then the entity: its mesh, scale, states and attach groups by name', () => {
    const officer = resolveEntity(index(), 'officer');
    expect(officer?.mesh).toBe('gfx/models/units/officer.mesh');
    expect(officer?.scale).toBe(2);
    expect(officer?.states.map((s) => [s.name, s.file, s.problem])).toEqual([
      ['idle', 'gfx/models/units/animation/soldier_idle.anim', undefined],
      ['walk', undefined, 'pdxmesh "officer_mesh" has no animation id "run"'],
      ['death', undefined, undefined],
    ]);
    // The "weapon" group is replaced; the unnamed group of the clone stays.
    expect(officer?.attachments.map((a) => [a.group, a.bone, a.entity.name])).toEqual([
      ['weapon', 'Left_hand_node', 'flag'],
      [undefined, 'Back_node', 'flag'],
    ]);
  });

  it('names what it cannot resolve', () => {
    expect(resolveEntity(index(), 'nobody')).toBeUndefined();
    expect(resolveEntity(index(), 'lost')?.problems).toEqual([
      'no pdxmesh "no_such_mesh" in the .gfx files',
      'no entity "nobody" to attach to node',
    ]);
    expect(resolveEntity(index(), 'loop_a')?.problems).toEqual([
      '"loop_b" clones "loop_a", which clones it back',
      '"loop_a" names no pdxmesh',
    ]);
  });

  it('does not attach an entity under itself', () => {
    const swarm = resolveEntity(index(), 'swarm');
    expect(swarm?.attachments).toEqual([]);
    expect(swarm?.problems).toEqual([
      '"swarm" on a_node is not drawn: it would attach itself again',
      '"swarm" on b_node is not drawn: it would attach itself again',
    ]);
    const ring = resolveEntity(index(), 'ring_a');
    const ringB = ring?.attachments[0]?.entity;
    expect(ringB?.name).toBe('ring_b');
    expect(ringB?.attachments.map((a) => [a.bone, a.entity.name])).toEqual([['c_node', 'flag']]);
    expect(ringB?.problems).toEqual([
      '"ring_a" on b_node is not drawn: it would attach itself again',
    ]);
    // From ring_b the loop is the other way round.
    expect(resolveEntity(index(), 'ring_b')?.attachments[0]?.entity.attachments).toEqual([]);
  });
});
