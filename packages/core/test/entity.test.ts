import { describe, expect, it } from 'vitest';
import {
  EntityIndex,
  mapTreeOf,
  readAssetFile,
  readPdxMeshTypes,
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
}
spriteTypes = { spriteType = { name = "GFX_x" texturefile = "gfx/x.dds" } }`;

const UNITS = `entity = {
  name = "soldier"
  pdxmesh = "soldier_mesh"
  state = { name = "idle" animation = "idle" }
  state = { name = "walk" animation = "walk" }
  state = { name = "death" }
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

const ANIMATIONS = `animation = { name = "soldier_idle_animation" file = "soldier_idle.anim" }
animation = { name = "soldier_walk_animation" file = "gfx/models/other/walk.anim" }`;

function index(): EntityIndex {
  return EntityIndex.of(
    [readPdxMeshTypes(parseScript(GFX), 'interface/units.gfx')],
    [
      readAssetFile(parseScript(UNITS), 'gfx/entities/units.asset'),
      readAssetFile(parseScript(ANIMATIONS), 'gfx/models/units/animation/animation.asset'),
    ],
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
    expect(soldier?.states).toEqual([
      { name: 'idle', file: 'gfx/models/units/animation/soldier_idle.anim', problem: undefined },
      { name: 'walk', file: 'gfx/models/other/walk.anim', problem: undefined },
      { name: 'death', file: undefined, problem: undefined },
    ]);
    expect(
      soldier?.attachments.map((a) => [a.group, a.bone, a.entity.name, a.entity.mesh]),
    ).toEqual([
      ['weapon', 'Right_hand_node', 'spear', 'gfx/models/units/spear.mesh'],
      [undefined, 'Back_node', 'flag', 'gfx/models/units/flag.mesh'],
    ]);
    expect(soldier?.problems).toEqual([]);
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
