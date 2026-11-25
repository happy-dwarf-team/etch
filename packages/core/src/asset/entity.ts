// The game's 3D objects as `.gfx` and `.asset` files define them, and one entity resolved into the
// meshes it draws. Read from parsed script, so it needs neither Node nor the DOM.
//
//   .gfx:   objectTypes = { pdxmesh = { name file scale animation = { id type } ... }
//                           pdxparticle = { name type scale } }
//   .asset: entity = { name pdxmesh clone scale default_state
//                      state = { name animation event = { time node particle } state_time
//                                time_offset }
//                      attach = { name = <group> <bone> = <entity> ... } }
//           animation = { name file }        (a bare file name beside the `.asset` file)
//           particle = { name subsystem ... } (a particle system)
//
// A state event's `particle` names a pdxparticle type, not a particle system: the type's `type`
// names the system (vanilla's `siege_cannon` is the system `artillery_cannon` at scale 0.8).
// EU4 1.37.5's entity event looks the name up among the 3D object types and logs
// `Couldn't find particle 3D object "X" (or X is not of 'pdxparticle' type)` when it is none; the
// pdxparticle reader logs `Could not find particle effect [Y]` for a `type` no system has.
//
// An entity names its mesh by a pdxmesh's `name`; a state's `animation` is one of that pdxmesh's
// animation `id`s, whose `type` is the `name` of an `.asset` `animation`, whose `file` is the
// `.anim`. Over EU4 1.37.5 every one of the 865 state animations of the 735 entities with a
// pdxmesh resolves this way, and every `clone` names an entity. An `attach` block puts other
// entities on the mesh's bones, its `name` names the group.
//
// How a `clone` combines with the entity's own keys is not documented: here the clone is resolved
// first, then the entity's own pdxmesh, scale and default state replace the clone's, its states
// replace the clone's states of the same name, and its attach groups replace the clone's groups
// of the same name (an unnamed group is added).

import type { BlockNode, ParsedScript, ScalarNode, SourceRange } from '../script/tree.ts';
import { keyOf } from '../model/properties.ts';
import { normaliseGamePath } from '../model/references.ts';

/** Where a definition came from: its file (game-relative) and the scalar of its name. */
export interface DefinedAt {
  readonly path: string;
  readonly node: ScalarNode | undefined;
}

export interface PdxMeshType {
  readonly name: string;
  /** Game-relative `.mesh` path, or `undefined` when the block has no `file`. */
  readonly file: string | undefined;
  readonly scale: number | undefined;
  /** Animation `type` by `id`. */
  readonly animations: ReadonlyMap<string, string>;
  readonly at: DefinedAt;
}

export interface EntityState {
  readonly name: string;
  /** An animation `id` of the entity's pdxmesh. */
  readonly animation: string | undefined;
  /** The state's `event` blocks: a particle effect started on a bone, seconds into the state. */
  readonly events: readonly EntityEvent[];
  /**
   * `state_time` (or `loop_time`): how long a state with no animation lasts before it starts
   * again; `undefined` without one.
   */
  readonly stateTime: number | undefined;
  /**
   * `time_offset = { base variation }`: the state's time starts at `base` plus a random share of
   * `variation` seconds, so its animation starts there and an event timed before it waits for
   * the next loop (none in vanilla 1.37.5); `undefined` without.
   */
  readonly timeOffset: TimeOffset | undefined;
}

/** A state's `time_offset`, in seconds. */
export interface TimeOffset {
  readonly base: number;
  readonly variation: number;
}

/**
 * An `event` of an entity state, as vanilla writes them (209 in 1.37.5: artillery muzzle flashes,
 * siege smoke): `event = { time = 0.0 node = "cannon_muzzle" particle = "artillery_cannon" }`.
 */
export interface EntityEvent {
  readonly time: number | undefined;
  /** The bone it starts on; `undefined` for the entity's origin. */
  readonly node: string | undefined;
  readonly particle: string | undefined;
  /** `keep_particle = yes`: the effect goes on, stopped, after the state ends. */
  readonly keepParticle: boolean;
  /** `trigger_once = yes`: the event starts its effect in the state's first loop only. */
  readonly triggerOnce: boolean;
}

/**
 * A pdxparticle type of a `.gfx` file: the name a state event starts, the particle system it draws
 * (`type`, a `particle` block's name) and its scale.
 */
export interface PdxParticleType {
  readonly name: string;
  readonly type: string | undefined;
  readonly scale: number | undefined;
  readonly at: DefinedAt;
}

/** A state event with its pdxparticle type and particle system, where they are defined. */
export interface ResolvedEvent extends EntityEvent {
  readonly pdxparticle: PdxParticleType | undefined;
  /** The particle system's name, when an `.asset` file defines it. */
  readonly system: string | undefined;
}

export interface AttachGroup {
  readonly name: string | undefined;
  readonly nodes: readonly { readonly bone: string; readonly entity: string }[];
}

export interface EntityDefinition {
  readonly name: string;
  readonly pdxmesh: string | undefined;
  readonly clone: string | undefined;
  readonly scale: number | undefined;
  readonly defaultState: string | undefined;
  readonly states: readonly EntityState[];
  readonly attach: readonly AttachGroup[];
  readonly at: DefinedAt;
}

export interface AnimationDefinition {
  readonly name: string;
  /** Game-relative `.anim` path: a bare file name is in the defining `.asset` file's folder. */
  readonly file: string | undefined;
  readonly at: DefinedAt;
}

function scalarOf(block: BlockNode, key: string): ScalarNode | undefined {
  let found: ScalarNode | undefined;
  for (const entry of block.entries) {
    if (entry.kind === 'property' && keyOf(entry) === key && entry.value?.kind === 'scalar') {
      found = entry.value;
    }
  }
  return found;
}

function blocksOf(block: BlockNode | ParsedScript, key: string): BlockNode[] {
  return block.entries.flatMap((entry) =>
    entry.kind === 'property' && keyOf(entry) === key && entry.value?.kind === 'block'
      ? [entry.value]
      : [],
  );
}

/** The number of the last of `keys` the block writes (`2.0f` reads as 2). */
function lastNumber(block: BlockNode, keys: readonly string[]): number | undefined {
  let found: number | undefined;
  for (const entry of block.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'scalar') continue;
    if (!keys.includes(keyOf(entry))) continue;
    const value = Number.parseFloat(entry.value.text);
    if (Number.isFinite(value)) found = value;
  }
  return found;
}

/** A state's last `time_offset = { base variation }`, a missing variation being 0. */
function timeOffsetOf(state: BlockNode): TimeOffset | undefined {
  const block = blocksOf(state, 'time_offset').at(-1);
  if (block === undefined) return undefined;
  const numbers = block.entries.flatMap((entry) => {
    if (entry.kind !== 'scalar') return [];
    const value = Number.parseFloat(entry.text);
    return Number.isFinite(value) ? [value] : [];
  });
  const [base, variation = 0] = numbers;
  return base === undefined ? undefined : { base, variation };
}

function numberOf(block: BlockNode, key: string): number | undefined {
  const text = scalarOf(block, key)?.text;
  if (text === undefined) return undefined;
  const value = Number.parseFloat(text);
  return Number.isFinite(value) ? value : undefined;
}

/** The pdxmesh types of a parsed `.gfx` file. */
export function readPdxMeshTypes(parsed: ParsedScript, path: string): PdxMeshType[] {
  const found: PdxMeshType[] = [];
  for (const types of blocksOf(parsed, 'objecttypes')) {
    for (const block of blocksOf(types, 'pdxmesh')) {
      const name = scalarOf(block, 'name');
      if (name === undefined) continue;
      const animations = new Map<string, string>();
      for (const animation of blocksOf(block, 'animation')) {
        const id = scalarOf(animation, 'id')?.text;
        const type = scalarOf(animation, 'type')?.text;
        if (id !== undefined && type !== undefined) animations.set(id, type);
      }
      const file = scalarOf(block, 'file')?.text;
      found.push({
        name: name.text,
        file: file === undefined ? undefined : normaliseGamePath(file),
        scale: numberOf(block, 'scale'),
        animations,
        at: { path, node: name },
      });
    }
  }
  return found;
}

/** The pdxparticle types of a parsed `.gfx` file (vanilla keeps its 11 in `interface/assets`). */
export function readPdxParticleTypes(parsed: ParsedScript, path: string): PdxParticleType[] {
  return blocksOf(parsed, 'objecttypes').flatMap((types) =>
    blocksOf(types, 'pdxparticle').flatMap((block) => {
      const name = scalarOf(block, 'name');
      return name === undefined
        ? []
        : [
            {
              name: name.text,
              type: scalarOf(block, 'type')?.text,
              scale: numberOf(block, 'scale'),
              at: { path, node: name },
            },
          ];
    }),
  );
}

/**
 * The name the map's tree layer gives a tree type: `mapobject_<n>`, where `n` is a palette index of
 * `map/trees.bmp`. In vanilla 1.37.5 the 21 such pdxmeshes of `interface/assets/mapitems.gfx` name
 * 17 meshes of `gfx/models/Mapitems/Trees/`, and every index `trees.bmp` uses but 0 is one of
 * them. The game draws them with `gfx/FX/tree.shader` (its `tree` effect), not with the shader
 * their materials name.
 */
export const MAP_TREE_NAME = /^mapobject_\d+$/;

/** The first map tree type (`mapobject_<n>`) that draws the mesh at a game-relative path. */
export function mapTreeOf(types: Iterable<PdxMeshType>, meshPath: string): PdxMeshType | undefined {
  const wanted = normaliseGamePath(meshPath).toLowerCase();
  for (const type of types) {
    if (MAP_TREE_NAME.test(type.name) && type.file?.toLowerCase() === wanted) return type;
  }
  return undefined;
}

/**
 * The entities, animations and particle systems of a parsed `.asset` file at a game-relative
 * path. A particle system is named by its block (`particle = { name = "ship_cannon" … }`, vanilla
 * keeps its 9 in `gfx/particles`); only the name is read.
 */
export function readAssetFile(
  parsed: ParsedScript,
  path: string,
): {
  entities: EntityDefinition[];
  animations: AnimationDefinition[];
  particles: string[];
  path: string;
} {
  const folder = normaliseGamePath(path).split('/').slice(0, -1).join('/');
  const entities: EntityDefinition[] = [];
  for (const block of blocksOf(parsed, 'entity')) {
    const name = scalarOf(block, 'name');
    if (name === undefined) continue;
    const states: EntityState[] = blocksOf(block, 'state').flatMap((state) => {
      const stateName = scalarOf(state, 'name')?.text;
      return stateName === undefined
        ? []
        : [
            {
              name: stateName,
              animation: scalarOf(state, 'animation')?.text,
              events: blocksOf(state, 'event').map((event) => ({
                time: numberOf(event, 'time'),
                node: scalarOf(event, 'node')?.text,
                particle: scalarOf(event, 'particle')?.text,
                keepParticle: scalarOf(event, 'keep_particle')?.text.toLowerCase() === 'yes',
                triggerOnce: scalarOf(event, 'trigger_once')?.text.toLowerCase() === 'yes',
              })),
              stateTime: lastNumber(state, ['state_time', 'loop_time']),
              timeOffset: timeOffsetOf(state),
            },
          ];
    });
    const attach: AttachGroup[] = blocksOf(block, 'attach').map((group) => ({
      name: scalarOf(group, 'name')?.text,
      nodes: group.entries.flatMap((entry) =>
        entry.kind === 'property' && keyOf(entry) !== 'name' && entry.value?.kind === 'scalar'
          ? [{ bone: entry.key.text, entity: entry.value.text }]
          : [],
      ),
    }));
    entities.push({
      name: name.text,
      pdxmesh: scalarOf(block, 'pdxmesh')?.text,
      clone: scalarOf(block, 'clone')?.text,
      scale: numberOf(block, 'scale'),
      defaultState: scalarOf(block, 'default_state')?.text,
      states,
      attach,
      at: { path, node: name },
    });
  }
  const animations: AnimationDefinition[] = blocksOf(parsed, 'animation').flatMap((block) => {
    const name = scalarOf(block, 'name');
    if (name === undefined) return [];
    const written = scalarOf(block, 'file')?.text;
    const normal = written === undefined ? undefined : normaliseGamePath(written);
    const file =
      normal === undefined || normal.includes('/') || folder === ''
        ? normal
        : `${folder}/${normal}`;
    return [{ name: name.text, file, at: { path, node: name } }];
  });
  const particles = blocksOf(parsed, 'particle').flatMap((block) => {
    const name = scalarOf(block, 'name')?.text;
    return name === undefined ? [] : [name];
  });
  return { entities, animations, particles, path: normaliseGamePath(path) };
}

/**
 * The playset's pdxmesh and pdxparticle types, entities and animations by name (a later
 * definition wins), and the names of its particle systems.
 */
export class EntityIndex {
  readonly pdxmeshes = new Map<string, PdxMeshType>();
  readonly pdxparticles = new Map<string, PdxParticleType>();
  readonly entities = new Map<string, EntityDefinition>();
  readonly animations = new Map<string, AnimationDefinition>();
  readonly particles = new Set<string>();
  /** The game-relative `.asset` file of each particle system, by name. */
  readonly particleFiles = new Map<string, string>();

  /**
   * Files in load order: `.gfx` files' pdxmesh types, `.asset` files' definitions and `.gfx`
   * files' pdxparticle types.
   */
  static of(
    gfx: readonly (readonly PdxMeshType[])[],
    assets: readonly {
      readonly entities: readonly EntityDefinition[];
      readonly animations: readonly AnimationDefinition[];
      readonly particles?: readonly string[];
      readonly path?: string;
    }[],
    pdxparticles: readonly (readonly PdxParticleType[])[] = [],
  ): EntityIndex {
    const index = new EntityIndex();
    for (const file of gfx) for (const type of file) index.pdxmeshes.set(type.name, type);
    for (const file of pdxparticles) {
      for (const type of file) index.pdxparticles.set(type.name, type);
    }
    for (const file of assets) {
      for (const entity of file.entities) index.entities.set(entity.name, entity);
      for (const animation of file.animations) index.animations.set(animation.name, animation);
      for (const particle of file.particles ?? []) {
        index.particles.add(particle);
        if (file.path !== undefined) index.particleFiles.set(particle, file.path);
      }
    }
    return index;
  }
}

/** A state of a resolved entity: the `.anim` it plays, or why there is none. */
export interface ResolvedState {
  readonly name: string;
  /** Game-relative `.anim` path. */
  readonly file: string | undefined;
  /** Why `file` is missing, for a state that names an animation. */
  readonly problem: string | undefined;
  readonly events: readonly ResolvedEvent[];
  readonly stateTime: number | undefined;
  readonly timeOffset: TimeOffset | undefined;
}

/** A state event resolved through the pdxparticle types, and what the game logs when it fails. */
function resolveEvent(
  index: EntityIndex,
  event: EntityEvent,
): { event: ResolvedEvent; problem: string | undefined } {
  const pdxparticle =
    event.particle === undefined ? undefined : index.pdxparticles.get(event.particle);
  const system =
    pdxparticle?.type !== undefined && index.particles.has(pdxparticle.type)
      ? pdxparticle.type
      : undefined;
  const resolved = { ...event, pdxparticle, system };
  if (event.particle === undefined || system !== undefined) {
    return { event: resolved, problem: undefined };
  }
  if (pdxparticle === undefined) {
    return { event: resolved, problem: `no pdxparticle "${event.particle}" in the .gfx files` };
  }
  return {
    event: resolved,
    problem:
      pdxparticle.type === undefined
        ? `pdxparticle "${pdxparticle.name}" names no particle system (no type)`
        : `pdxparticle "${pdxparticle.name}" names no particle "${pdxparticle.type}" in the .asset files`,
  };
}

/** An entity with its clone applied, its mesh and states resolved, and its attachments. */
export interface ResolvedEntity {
  readonly name: string;
  readonly definition: EntityDefinition | undefined;
  readonly pdxmesh: PdxMeshType | undefined;
  /** Game-relative `.mesh` path. */
  readonly mesh: string | undefined;
  /** The pdxmesh's scale times the entity's, 1 where neither is given. */
  readonly scale: number;
  readonly defaultState: string | undefined;
  readonly states: readonly ResolvedState[];
  readonly attachments: readonly {
    readonly group: string | undefined;
    readonly bone: string;
    readonly entity: ResolvedEntity;
  }[];
  /** What could not be resolved, in words. */
  readonly problems: readonly string[];
}

/** Attachments deeper than this are not followed (vanilla's deepest is 3: gun crew, man, gun). */
const MAX_DEPTH = 6;

/** The entity of that name with everything it draws, or `undefined` when no entity has it. */
export function resolveEntity(index: EntityIndex, name: string): ResolvedEntity | undefined {
  return index.entities.has(name) ? resolve(index, name, [name]) : undefined;
}

interface Merged {
  pdxmesh: string | undefined;
  scale: number | undefined;
  defaultState: string | undefined;
  states: Map<string, EntityState>;
  attach: AttachGroup[];
}

function merged(index: EntityIndex, name: string, seen: Set<string>, problems: string[]): Merged {
  const definition = index.entities.get(name);
  if (definition === undefined) {
    problems.push(`no entity "${name}"`);
    return {
      pdxmesh: undefined,
      scale: undefined,
      defaultState: undefined,
      states: new Map(),
      attach: [],
    };
  }
  let base: Merged = {
    pdxmesh: undefined,
    scale: undefined,
    defaultState: undefined,
    states: new Map(),
    attach: [],
  };
  if (definition.clone !== undefined) {
    if (seen.has(definition.clone)) {
      problems.push(`"${name}" clones "${definition.clone}", which clones it back`);
    } else {
      base = merged(index, definition.clone, new Set([...seen, definition.clone]), problems);
    }
  }
  const states = new Map(base.states);
  for (const state of definition.states) states.set(state.name, state);
  const attach = [...base.attach];
  for (const group of definition.attach) {
    const same = group.name === undefined ? -1 : attach.findIndex((g) => g.name === group.name);
    if (same >= 0) attach[same] = group;
    else attach.push(group);
  }
  return {
    pdxmesh: definition.pdxmesh ?? base.pdxmesh,
    scale: definition.scale ?? base.scale,
    defaultState: definition.defaultState ?? base.defaultState,
    states,
    attach,
  };
}

/** `path`: the entities from the root down to this one, which an attachment may not repeat. */
function resolve(index: EntityIndex, name: string, path: readonly string[]): ResolvedEntity {
  const problems: string[] = [];
  const definition = index.entities.get(name);
  const own = merged(index, name, new Set([name]), problems);
  const pdxmesh = own.pdxmesh === undefined ? undefined : index.pdxmeshes.get(own.pdxmesh);
  if (own.pdxmesh === undefined) {
    if (definition !== undefined) problems.push(`"${name}" names no pdxmesh`);
  } else if (pdxmesh === undefined) {
    problems.push(`no pdxmesh "${own.pdxmesh}" in the .gfx files`);
  } else if (pdxmesh.file === undefined) {
    problems.push(`pdxmesh "${pdxmesh.name}" has no file`);
  }
  const states: ResolvedState[] = [...own.states.values()].map((state) => {
    const events = state.events.map((event) => {
      const resolved = resolveEvent(index, event);
      const problem =
        resolved.problem === undefined ? undefined : `state ${state.name}: ${resolved.problem}`;
      if (problem !== undefined && !problems.includes(problem)) problems.push(problem);
      return resolved.event;
    });
    const { stateTime, timeOffset } = state;
    if (state.animation === undefined)
      return {
        name: state.name,
        file: undefined,
        problem: undefined,
        events,
        stateTime,
        timeOffset,
      };
    const type = pdxmesh?.animations.get(state.animation);
    if (type === undefined) {
      return {
        name: state.name,
        file: undefined,
        problem: `pdxmesh "${own.pdxmesh ?? ''}" has no animation id "${state.animation}"`,
        events,
        stateTime,
        timeOffset,
      };
    }
    const animation = index.animations.get(type);
    if (animation?.file === undefined) {
      return {
        name: state.name,
        file: undefined,
        problem: `no animation "${type}" in the .asset files`,
        events,
        stateTime,
        timeOffset,
      };
    }
    return {
      name: state.name,
      file: animation.file,
      problem: undefined,
      events,
      stateTime,
      timeOffset,
    };
  });
  const attachments: ResolvedEntity['attachments'][number][] = [];
  for (const group of own.attach) {
    for (const node of group.nodes) {
      if (path.length > MAX_DEPTH) {
        problems.push(`attachments deeper than ${String(MAX_DEPTH)} are not drawn`);
        break;
      }
      if (!index.entities.has(node.entity)) {
        problems.push(`no entity "${node.entity}" to attach to ${node.bone}`);
        continue;
      }
      // An entity under itself would repeat to MAX_DEPTH, and branch: one attaching itself on
      // eight bones gave 299,593 entities to draw.
      if (path.includes(node.entity)) {
        problems.push(
          `"${node.entity}" on ${node.bone} is not drawn: it would attach itself again`,
        );
        continue;
      }
      attachments.push({
        group: group.name,
        bone: node.bone,
        entity: resolve(index, node.entity, [...path, node.entity]),
      });
    }
  }
  return {
    name,
    definition,
    pdxmesh,
    mesh: pdxmesh?.file,
    scale: (pdxmesh?.scale ?? 1) * (own.scale ?? 1),
    defaultState: own.defaultState,
    states,
    attachments,
    problems,
  };
}

/**
 * A warning on a particle reference of an `.asset` or `.gfx` file: a state event's particle that
 * no pdxparticle type has (`unknown-pdxparticle`), a pdxparticle type whose `type` names no
 * particle system (`unknown-particle-system`) or that has no `type` (`pdxparticle-without-type`).
 * The range is the scalar it is about.
 */
export interface ParticleDiagnostic extends SourceRange {
  readonly code: 'unknown-pdxparticle' | 'unknown-particle-system' | 'pdxparticle-without-type';
  readonly message: string;
}

/**
 * The state events of a parsed `.asset` file whose particle the game does not start: one that no
 * pdxparticle type of the index has. When the name is a particle system's, the message says which
 * pdxparticle types start it.
 */
export function checkAssetParticles(
  parsed: ParsedScript,
  index: EntityIndex,
): ParticleDiagnostic[] {
  const out: ParticleDiagnostic[] = [];
  for (const entity of blocksOf(parsed, 'entity')) {
    for (const state of blocksOf(entity, 'state')) {
      for (const event of blocksOf(state, 'event')) {
        const particle = scalarOf(event, 'particle');
        if (particle === undefined || index.pdxparticles.has(particle.text)) continue;
        const name = particle.text;
        let hint = '';
        if (index.particles.has(name)) {
          const starting = [...index.pdxparticles.values()]
            .filter((type) => type.type === name)
            .map((type) => `"${type.name}"`);
          hint =
            starting.length === 0
              ? ` "${name}" is the name of a particle effect, not of a pdxparticle: add a pdxparticle with type = "${name}" to a .gfx file, and write its name here.`
              : ` "${name}" is the name of a particle effect, not of a pdxparticle: use the pdxparticle that starts it, ${starting.join(' or ')}.`;
        }
        out.push({
          code: 'unknown-pdxparticle',
          start: particle.start,
          end: particle.end,
          message: `No .gfx file has a pdxparticle named "${name}", so the game does not start this particle. The game writes in its error log: Couldn't find particle 3D object "${name}".${hint}`,
        });
      }
    }
  }
  return out;
}

/**
 * The pdxparticle types of a parsed `.gfx` file that start no particle system: a `type` that no
 * `particle` block of the index has, or no `type` at all.
 */
export function checkGfxParticles(parsed: ParsedScript, index: EntityIndex): ParticleDiagnostic[] {
  const out: ParticleDiagnostic[] = [];
  for (const types of blocksOf(parsed, 'objecttypes')) {
    for (const block of blocksOf(types, 'pdxparticle')) {
      const name = scalarOf(block, 'name');
      if (name === undefined) continue;
      const type = scalarOf(block, 'type');
      if (type === undefined) {
        out.push({
          code: 'pdxparticle-without-type',
          start: name.start,
          end: name.end,
          message: `The pdxparticle "${name.text}" has no type, so the game does not know which particle effect to start. Add type = "…" with the name of an effect from an .asset file.`,
        });
      } else if (!index.particles.has(type.text)) {
        out.push({
          code: 'unknown-particle-system',
          start: type.start,
          end: type.end,
          message: `No .asset file has a particle effect named "${type.text}", so the game cannot start the pdxparticle "${name.text}". The game writes in its error log: Could not find particle effect [${type.text}].`,
        });
      }
    }
  }
  return out;
}
