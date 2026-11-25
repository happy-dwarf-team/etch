// The keys of a particle effect's blocks (etch#631) and the checks and hovers on them: the
// `particle` blocks of `.asset` files, with their `subsystem`, `texture`, `animation` and `force`
// blocks, and the `pdxparticle` types of `.gfx` files. What the game reads is EU4 1.37.5's, from
// its readers (the research on branch `research/particles`, `docs/research/particles.md`): the keys
// each block accepts, the value syntax, the curve `time` names (case-sensitive) and the log lines
// for a curve without duration and for an emitter with the other shape's keys. What most keys do
// is read from vanilla's use and the keys' names, not checked in the game; a key's `known` says
// which.
//
//   particle = { name subsystem = { … texture = { file shader x y } force = a,b … }
//                animation = { name time start duration repeat op minValue maxValue curve }
//                force = { name type amount direction … } }
//
// A value is a number, `{ number variation }`, or numbers and curve names joined by commas:
// `size = { 1.75,size_increase 0.4 }`. A subsystem's `force` lists force names joined by commas;
// vanilla writes `force = chaos, upforce, drag`, which reads as the property `force = chaos,` and
// the bare words `upforce,` and `drag`.

import type {
  BlockNode,
  EntryNode,
  ParsedScript,
  ScalarNode,
  SourceRange,
} from '../script/tree.ts';
import { keyOf } from '../model/properties.ts';
import { PARTICLE_CHOICES, particleChoice } from './particle-system.ts';

/** The blocks whose keys Etch knows: an effect's and its parts', and a `.gfx` pdxparticle type. */
export type ParticleBlockKind =
  'particle' | 'subsystem' | 'texture' | 'animation' | 'force' | 'pdxparticle';

/** How sure the meaning of a key is. */
export type ParticleKeyKnown =
  /** Read in the game's code or files. */
  | 'game'
  /** Etch's reading of the key's name and of the base game's files. */
  | 'reading'
  /** The game reads the key; what it does is not known. */
  | 'unknown';

export interface ParticleKeyDoc {
  /** What the key takes, in a few words. */
  readonly value: string;
  /** What the key does, in plain sentences; empty when it is not known. */
  readonly meaning: string;
  readonly known: ParticleKeyKnown;
}

const WITH_CURVES = 'or with curves: `{ 1.75,size_increase 0.4 }`';
const VALUE = `a number: \`2\`, \`{ 2 0.5 }\` with a variation, ${WITH_CURVES}`;
const SECONDS = `a number of seconds: \`2\`, \`{ 2 0.5 }\` with a variation, ${WITH_CURVES}`;
const DEGREES = `a number of degrees: \`90\`, \`{ 90 20 }\` with a variation, ${WITH_CURVES}`;
const YES_NO = '`yes` or `no`';

function doc(value: string, meaning: string, known: ParticleKeyKnown = 'reading'): ParticleKeyDoc {
  return { value, meaning, known };
}

function unknown(value: string): ParticleKeyDoc {
  return { value, meaning: '', known: 'unknown' };
}

const SUBSYSTEM: [string, ParticleKeyDoc][] = [
  ['name', doc('text', 'A name for this emitter.', 'game')],
  [
    'max_amount',
    doc(
      'a whole number, without curves or variation',
      'The most particles of this emitter alive at the same time. Once that many are alive, the emitter sends out no more until some die.',
      'game',
    ),
  ],
  [
    'sort',
    doc(
      '`depth`, `distance` or `age`, in any case',
      'The order in which its particles are drawn. Unsorted when the block has none the game knows (it skips one it does not know).',
    ),
  ],
  [
    'invert',
    doc(YES_NO, 'With `yes`, the particles are drawn in the reverse order of `sort`.', 'game'),
  ],
  [
    'texture',
    doc(
      '`{ file shader x y }`',
      'The picture of each particle and how it blends with what is behind it.',
      'game',
    ),
  ],
  [
    'position',
    doc(
      '`{ x = … y = … z = … }`, each a value',
      'Where the emitter sits, from the bone of the model where the entity’s event starts the effect.',
    ),
  ],
  [
    'color',
    doc(
      '`{ r = … g = … b = … alpha = … }`, each a value from 0 to 255',
      'The colour and the opacity of each particle.',
    ),
  ],
  ['start', doc(SECONDS, 'How long the emitter waits before it sends out particles.')],
  [
    'duration',
    doc(
      SECONDS,
      'How long the emitter sends out particles. `-1` means for as long as the effect runs, as in the base game’s siege smoke.',
    ),
  ],
  ['emission', doc(VALUE, 'How many particles the emitter sends out each second.')],
  [
    'emission_pulse_duration',
    doc(
      SECONDS,
      'For bursts of particles: how long each burst lasts. Bursts happen only when this subsystem’s `duration` is below 0, such as `duration = -1`.',
      'game',
    ),
  ],
  [
    'emission_pulse_silence',
    doc(
      SECONDS,
      'For bursts of particles: the pause between two bursts. Bursts happen only when this subsystem’s `duration` is below 0, such as `duration = -1`.',
      'game',
    ),
  ],
  ['life', doc(SECONDS, 'How long each particle lives.')],
  ['size', doc(VALUE, 'The size of each particle, before the scale of the pdxparticle.')],
  ['velocity', doc(VALUE, 'The speed each particle starts with.')],
  [
    'velocity_pitch',
    doc(
      DEGREES,
      'The up and down angle each particle starts moving in: `90` sends them straight up. Its variation spreads them around that angle.',
    ),
  ],
  [
    'velocity_yaw',
    doc(
      DEGREES,
      'The sideways angle each particle starts moving in. Its variation spreads the particles.',
    ),
  ],
  [
    'rotation',
    doc(
      DEGREES,
      'How far the picture of each particle is turned on the screen. `rotation` and `particle_roll` are the same key.',
      'game',
    ),
  ],
  [
    'particle_roll',
    doc(
      DEGREES,
      'How far the picture of each particle is turned on the screen. `rotation` and `particle_roll` are the same key.',
      'game',
    ),
  ],
  ['particle_yaw', doc(VALUE, 'The sideways turn of a particle that does not face the camera.')],
  [
    'particle_pitch',
    doc(VALUE, 'The up and down turn of a particle that does not face the camera.'),
  ],
  [
    'rotation_speed',
    doc(
      VALUE,
      'How fast each particle turns on the screen. `rotation_speed` and `rotation_speed_roll` are the same key.',
    ),
  ],
  [
    'rotation_speed_roll',
    doc(
      VALUE,
      'How fast each particle turns on the screen. `rotation_speed` and `rotation_speed_roll` are the same key.',
    ),
  ],
  ['rotation_speed_yaw', doc(VALUE, 'How fast each particle turns sideways.')],
  ['rotation_speed_pitch', doc(VALUE, 'How fast each particle turns up and down.')],
  ['mass', doc(VALUE, 'The weight of each particle against the forces.')],
  [
    'force',
    doc(
      'force names joined by commas: `force = drag,gravity`',
      'The forces that act on its particles: the `force` blocks of this effect, by their names.',
      'game',
    ),
  ],
  [
    'emitter_type',
    doc(
      '`point`, `sphere` or `box`, in any case',
      'The shape that particles start in; `point` when the block has none the game knows (it skips one it does not know).',
      'game',
    ),
  ],
  ['emitter_yaw', doc(VALUE, 'The sideways turn of the emitter.')],
  ['emitter_pitch', doc(VALUE, 'The up and down turn of the emitter.')],
  ['sphere_emitter_radius', doc(VALUE, 'The size of a sphere emitter (`emitter_type = sphere`).')],
  ['sphere_emitter_yaw', doc(VALUE, 'The sideways turn of a sphere emitter.')],
  ['sphere_emitter_pitch', doc(VALUE, 'The up and down turn of a sphere emitter.')],
  ['box_emitter_x', doc(VALUE, 'The size of a box emitter (`emitter_type = box`) along x.')],
  ['box_emitter_y', doc(VALUE, 'The size of a box emitter (`emitter_type = box`) along y.')],
  ['box_emitter_z', doc(VALUE, 'The size of a box emitter (`emitter_type = box`) along z.')],
  [
    'childsystem',
    doc(
      'a block with the keys of a subsystem',
      'Another emitter that each particle of this one carries: it sends out its own particles from where the particle is, while the particle lives. A dead particle stays, unseen, until they are gone.',
      'game',
    ),
  ],
  ['slave_particles', unknown('a whole number')],
  [
    'local_space',
    doc(
      YES_NO,
      'With `yes`, the particles move with the model. Otherwise they stay where they were sent out.',
    ),
  ],
  [
    'trail',
    doc(
      YES_NO,
      'With `yes`, the subsystem draws trail particles. They stop facing the camera unless you also write `billboard = yes`, and the game looks for a shader effect whose name ends in `Trail`. The base game’s `gfx/FX/particle.shader` has none.',
      'game',
    ),
  ],
  [
    'billboard',
    doc(
      YES_NO,
      'Whether each particle faces the camera. With `no`, the game looks for a shader effect whose name ends in `NoBillboard`. The base game’s `gfx/FX/particle.shader` has none.',
      'game',
    ),
  ],
  ['hide', doc(YES_NO, 'With `yes`, the emitter sends out no particles.', 'game')],
];

/** The keys each block accepts, with what they do. Keys are matched without case. */
export const PARTICLE_KEYS: Readonly<
  Record<ParticleBlockKind, ReadonlyMap<string, ParticleKeyDoc>>
> = {
  particle: new Map([
    [
      'name',
      doc(
        'text',
        'The name of this particle effect. A pdxparticle in a `.gfx` file starts it by this name, in its `type`.',
        'game',
      ),
    ],
    [
      'subsystem',
      doc(
        'a block, one or more',
        'An emitter: it sends out particles, small pictures that face the camera.',
        'game',
      ),
    ],
    [
      'animation',
      doc(
        'a block, one or more',
        'A curve with a name. The values of the subsystems use it by its name, to change over time.',
        'game',
      ),
    ],
    [
      'force',
      doc(
        'a block, one or more',
        'A force with a name, such as gravity or drag. A subsystem lists it in its `force`.',
        'game',
      ),
    ],
  ]),
  subsystem: new Map(SUBSYSTEM),
  texture: new Map([
    [
      'file',
      doc('a path in the game folder', 'The picture of each particle, a `.dds` file.', 'game'),
    ],
    [
      'shader',
      doc(
        '`ParticleAlphaBlend`, `ParticleAdditive` or `ParticlePreAlphaBlend`',
        'How the picture blends with what is behind it: an effect of `gfx/FX/particle.shader`. `ParticleAlphaBlend` blends by the picture’s transparency, `ParticleAdditive` brightens what is behind.',
        'game',
      ),
    ],
    [
      'x',
      doc(
        'a whole number',
        'How many columns of small pictures the picture holds. Each particle shows one of them, chosen at random when the emitter sends the particle out.',
        'game',
      ),
    ],
    [
      'y',
      doc(
        'a whole number',
        'How many rows of small pictures the picture holds. Each particle shows one of them, chosen at random when the emitter sends the particle out.',
        'game',
      ),
    ],
  ]),
  animation: new Map([
    ['name', doc('text', 'The name the values of the subsystems use for this curve.', 'game')],
    [
      'time',
      doc(
        '`life`, `life_abs`, `system` or `spawn`, in lowercase',
        'What the curve follows: `life` runs from 0 to 1 over the life of a particle, `life_abs` is the age of a particle in seconds, `system` the time of the effect, and `spawn` the time of the effect when the particle was born. The game reads any other text, such as `Life`, as `spawn`.',
      ),
    ],
    ['start', doc('a number', 'When the curve starts.')],
    [
      'duration',
      doc(
        'a number above 0',
        'How long the curve runs. For 0 or less, the game uses 1 and writes an error.',
        'game',
      ),
    ],
    ['repeat', doc(YES_NO, 'Whether the curve starts again when it ends.')],
    [
      'op',
      doc(
        '`MUL`, `ADD` or `ABS`, in any case',
        'How the curve changes the value: `MUL` multiplies it, `ADD` adds to it, `ABS` replaces it. Without an `op` the game knows (it skips one it does not know), the curve adds: write `op = "MUL"` to scale the value, as the base game does.',
      ),
    ],
    ['minvalue', doc('a number', 'What the curve gives at its lowest point.')],
    ['maxvalue', doc('a number', 'What the curve gives at its highest point.')],
    [
      'curve',
      doc(
        'pairs of time and value',
        'The points of the curve: `0 0 1 1` runs from 0 to 1.',
        'game',
      ),
    ],
  ]),
  force: new Map([
    ['name', doc('text', 'The name a subsystem uses for this force, in its `force`.', 'game')],
    [
      'type',
      doc(
        '`planar`, `point`, `vortex`, `friction`, `turbulence` or `spin`, in any case',
        'The kind of force; `planar` when the block has none the game knows (it skips one it does not know). `planar` pushes along `direction`, such as gravity. `point` pushes away from `position`, as hard at any distance; a negative `amount` pulls. `vortex` pushes out from the line through `position` along `direction` and turns round it by `yaw`. `friction` slows the particles: `amount` times their speed. `turbulence` pushes each particle by `amount` in a direction that changes from place to place and over time. `spin` swings the particles round the line through `position` along `direction`, `amount` radians a second, but nothing holds them on the circle: with a pdxparticle `scale` above 1, another force or a start speed they spiral outwards and fly off. The base game uses `planar`, `friction` and `turbulence`.',
        'game',
      ),
    ],
    ['amount', doc(VALUE, 'How strong the force is.')],
    [
      'direction',
      doc(
        '`{ x y z }`',
        'Where a `planar` force pushes, `{ 0 -1 0 }` being down, or the axis of a `vortex` or `spin` force.',
        'game',
      ),
    ],
    [
      'position',
      doc(
        '`{ x y z }`',
        'The centre of a `point`, `vortex` or `spin` force, from where the effect starts, times the pdxparticle’s `scale`.',
        'game',
      ),
    ],
    [
      'yaw',
      doc(
        'a number of degrees',
        'How a `vortex` force pushes: 0 straight out from its line, 90 round it.',
        'game',
      ),
    ],
    [
      'division',
      doc(
        'a whole number',
        'For `turbulence`: into how many parts the changing directions are split, one part changing at a time, so a higher number changes them less smoothly. The game rounds it up to a number 256 can be divided by.',
        'game',
      ),
    ],
    [
      'local_force',
      doc(
        YES_NO,
        'With `yes`, the force’s `position` moves with the point the effect starts on.',
        'game',
      ),
    ],
  ]),
  pdxparticle: new Map([
    [
      'name',
      doc(
        'text',
        'The name that starts this particle: `particle = "…"` in an `event` of an entity’s state.',
        'game',
      ),
    ],
    [
      'type',
      doc(
        'the name of a particle effect',
        'The particle effect it starts: a `particle = { name = … }` block in an `.asset` file.',
        'game',
      ),
    ],
    ['scale', doc('a number', 'The size of the effect.')],
  ]),
};

/** The subsystem keys that take a value, which may name curves. */
const VALUE_KEYS = new Set([
  'start',
  'duration',
  'emission',
  'emission_pulse_duration',
  'emission_pulse_silence',
  'life',
  'size',
  'velocity',
  'velocity_pitch',
  'velocity_yaw',
  'rotation',
  'particle_roll',
  'particle_yaw',
  'particle_pitch',
  'rotation_speed',
  'rotation_speed_roll',
  'rotation_speed_yaw',
  'rotation_speed_pitch',
  'mass',
  'emitter_yaw',
  'emitter_pitch',
  'sphere_emitter_radius',
  'sphere_emitter_yaw',
  'sphere_emitter_pitch',
  'box_emitter_x',
  'box_emitter_y',
  'box_emitter_z',
]);

/** Blocks of values inside a subsystem: `position = { x y z }`, `color = { r g b alpha }`. */
const VALUE_BLOCKS = new Set(['position', 'color']);

const FORCE_VALUE_KEYS = new Set(['amount', 'yaw', 'division']);

const CURVE_TIMES = ['life', 'life_abs', 'system', 'spawn'];

const BOX_KEYS = ['box_emitter_x', 'box_emitter_y', 'box_emitter_z'];
const SPHERE_KEYS = ['sphere_emitter_radius', 'sphere_emitter_yaw', 'sphere_emitter_pitch'];

/** What the blocks of a particle effect are called in a message, with their article. */
const BLOCK_NAMES: Record<ParticleBlockKind, string> = {
  particle: 'a particle',
  subsystem: 'a subsystem',
  texture: 'a texture',
  animation: 'an animation',
  force: 'a force',
  pdxparticle: 'a pdxparticle',
};

export type ParticleBlockCode =
  | 'unknown-particle-key'
  | 'unknown-particle-curve'
  | 'unknown-particle-force'
  | 'particle-curve-time'
  | 'particle-skipped-value'
  | 'particle-curve-without-duration'
  | 'particle-emitter-keys'
  | 'unknown-particle-shader';

export interface ParticleBlockDiagnostic extends SourceRange {
  readonly code: ParticleBlockCode;
  readonly message: string;
}

/** A name a value or a `force` list uses, where it is written. */
interface NameUse extends SourceRange {
  readonly name: string;
}

/** One `particle` block of an `.asset` file, with what its parts define and use. */
interface ParticleEffect {
  readonly block: BlockNode;
  readonly curves: ReadonlyMap<string, BlockNode>;
  readonly forces: ReadonlyMap<string, BlockNode>;
  readonly curveUses: readonly NameUse[];
  readonly forceUses: readonly NameUse[];
}

/**
 * The warnings of the `particle` blocks of a parsed `.asset` file:
 * - a key that its block does not accept (`unknown-particle-key`), with the nearest known key;
 * - a curve name in a value, or a force name in a subsystem's `force`, that no `animation` or
 *   `force` block of the same effect has, which the game leaves out and logs;
 * - a curve `time` the game reads as `spawn`;
 * - a curve `duration` of 0 or less, which the game logs and replaces by 1;
 * - box emitter keys on a sphere emitter, and the reverse, which the game logs;
 * - a word the game does not know in a force's `type`, a subsystem's `sort` or `emitter_type`, or a
 *   curve's `op`, which it skips: the block keeps the word before it, or the reader's default;
 * - when `effects` is given (the effect names of the playset's `gfx/FX/particle.shader`), a
 *   subsystem whose texture's `shader`, with `Trail` and `NoBillboard` as the game adds them, names
 *   no effect there.
 * A missing texture file is the extension's check (`particleTextureFiles`), which needs the disk.
 */
export function checkParticleBlocks(
  parsed: ParsedScript,
  effects?: ReadonlySet<string>,
): ParticleBlockDiagnostic[] {
  const out: ParticleBlockDiagnostic[] = [];
  for (const block of propertyBlocks(parsed.entries, 'particle')) {
    const effect = readEffect(block);
    unknownKeys(block, 'particle', out);
    for (const subsystem of subsystemBlocks(block)) {
      unknownKeys(subsystem, 'subsystem', out);
      for (const texture of propertyBlocks(subsystem.entries, 'texture')) {
        unknownKeys(texture, 'texture', out);
      }
      skippedChoices(subsystem, 'subsystem', out);
      emitterKeys(subsystem, out);
      if (effects !== undefined) shaderEffect(subsystem, effects, out);
    }
    for (const curve of propertyBlocks(block.entries, 'animation')) {
      unknownKeys(curve, 'animation', out);
      curveTime(curve, out);
      skippedChoices(curve, 'animation', out);
      curveDuration(curve, out);
    }
    for (const force of propertyBlocks(block.entries, 'force')) {
      unknownKeys(force, 'force', out);
      skippedChoices(force, 'force', out);
    }
    for (const use of effect.curveUses) {
      if (effect.curves.has(use.name.toLowerCase())) continue;
      out.push({
        code: 'unknown-particle-curve',
        start: use.start,
        end: use.end,
        message: `No animation block of this particle effect is named "${use.name}".${nearest(use.name, effect.curves.keys())} The game leaves the curve out and writes in its error log: Couldn't find animation "${use.name}".`,
      });
    }
    const effectName = lastScalar(block, 'name')?.text;
    for (const use of effect.forceUses) {
      if (effect.forces.has(use.name.toLowerCase())) continue;
      const log = `Couldn't find particle force "${use.name}"${effectName === undefined ? '' : ` in: ${effectName}`}`;
      out.push({
        code: 'unknown-particle-force',
        start: use.start,
        end: use.end,
        message: `No force block of this particle effect is named "${use.name}".${nearest(use.name, effect.forces.keys())} The game leaves the force out and writes in its error log: ${log}.`,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The `file` scalars of the subsystems' `texture` blocks, for the extension to look up. */
export function particleTextureFiles(parsed: ParsedScript): ScalarNode[] {
  const found: ScalarNode[] = [];
  for (const block of propertyBlocks(parsed.entries, 'particle')) {
    for (const subsystem of propertyBlocks(block.entries, 'subsystem')) {
      for (const texture of propertyBlocks(subsystem.entries, 'texture')) {
        const file = lastScalar(texture, 'file');
        if (file !== undefined && file.text.trim() !== '') found.push(file);
      }
    }
  }
  return found;
}

/**
 * The effect names of a `.shader` file: `Effect ParticleAlphaBlend { … }`. Vanilla's
 * `gfx/FX/particle.shader` has `ParticleAlphaBlend`, `ParticlePreAlphaBlend` and
 * `ParticleAdditive`.
 */
export function shaderEffectNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text
    .replace(/#[^\n]*/g, '')
    .matchAll(/(?:^|\n)\s*Effect\s+([A-Za-z_]\w*)/g)) {
    const name = match[1];
    if (name !== undefined) names.add(name);
  }
  return names;
}

/** A hover in a particle block: what a key does, or the curve or force a name refers to. */
export interface ParticleHover extends SourceRange {
  readonly markdown: string;
}

/**
 * The hover at an offset of a parsed `.asset` or `.gfx` file: on a key of a particle effect's
 * block or of a `.gfx` pdxparticle, what the key takes and does; on a curve or force name a
 * subsystem uses, that curve's or force's definition. `undefined` elsewhere.
 */
export function particleHoverAt(parsed: ParsedScript, offset: number): ParticleHover | undefined {
  for (const block of propertyBlocks(parsed.entries, 'particle')) {
    if (!inside(block, offset)) continue;
    const effect = readEffect(block);
    for (const use of [...effect.curveUses, ...effect.forceUses]) {
      if (offset < use.start || offset >= use.end) continue;
      const isCurve = effect.curveUses.includes(use);
      const definition = (isCurve ? effect.curves : effect.forces).get(use.name.toLowerCase());
      return {
        start: use.start,
        end: use.end,
        markdown:
          definition === undefined
            ? `No ${isCurve ? 'animation' : 'force'} of this particle effect is named \`${use.name}\`.`
            : isCurve
              ? describeCurve(use.name, definition)
              : describeForce(use.name, definition),
      };
    }
    return keyHover(block, 'particle', offset);
  }
  for (const types of propertyBlocks(parsed.entries, 'objecttypes')) {
    for (const block of propertyBlocks(types.entries, 'pdxparticle')) {
      if (inside(block, offset)) return keyHover(block, 'pdxparticle', offset);
    }
  }
  return undefined;
}

/** The markdown of a key's hover. */
export function describeParticleKey(
  kind: ParticleBlockKind,
  key: string,
  doc: ParticleKeyDoc,
): string {
  const lines = [`**\`${key}\`** in ${BLOCK_NAMES[kind]} block`, `Takes ${doc.value}.`];
  if (doc.known === 'unknown') {
    lines.push('The game reads this key. Etch does not know what it does.');
  } else {
    lines.push(doc.meaning);
    if (doc.known === 'reading') {
      lines.push(
        '_Etch reads this from the key’s name and the base game’s files. It is not checked in the game._',
      );
    }
  }
  return lines.join('\n\n');
}

function keyHover(
  block: BlockNode,
  kind: ParticleBlockKind,
  offset: number,
): ParticleHover | undefined {
  for (const entry of block.entries) {
    if (entry.kind !== 'property') continue;
    const key = keyOf(entry);
    if (offset >= entry.key.start && offset < entry.key.end) {
      const found = PARTICLE_KEYS[kind].get(key);
      if (found === undefined) return undefined;
      return {
        start: entry.key.start,
        end: entry.key.end,
        markdown: describeParticleKey(kind, entry.key.text, found),
      };
    }
    const value = entry.value;
    if (value?.kind !== 'block' || !inside(value, offset)) continue;
    const child = childKind(kind, key);
    return child === undefined ? undefined : keyHover(value, child, offset);
  }
  return undefined;
}

function childKind(kind: ParticleBlockKind, key: string): ParticleBlockKind | undefined {
  if (kind === 'particle') {
    if (key === 'subsystem') return 'subsystem';
    if (key === 'animation') return 'animation';
    if (key === 'force') return 'force';
  }
  if (kind === 'subsystem' && key === 'texture') return 'texture';
  if (kind === 'subsystem' && key === 'childsystem') return 'subsystem';
  return undefined;
}

/** An effect's subsystem blocks with their `childsystem` blocks, which the game reads alike. */
function subsystemBlocks(block: BlockNode): BlockNode[] {
  const out: BlockNode[] = [];
  const visit = (node: BlockNode): void => {
    out.push(node);
    for (const child of propertyBlocks(node.entries, 'childsystem')) visit(child);
  };
  for (const subsystem of propertyBlocks(block.entries, 'subsystem')) visit(subsystem);
  return out;
}

function readEffect(block: BlockNode): ParticleEffect {
  const curves = new Map<string, BlockNode>();
  const forces = new Map<string, BlockNode>();
  for (const curve of propertyBlocks(block.entries, 'animation')) {
    const name = lastScalar(curve, 'name')?.text;
    if (name !== undefined) curves.set(name.toLowerCase(), curve);
  }
  for (const force of propertyBlocks(block.entries, 'force')) {
    const name = lastScalar(force, 'name')?.text;
    if (name !== undefined) forces.set(name.toLowerCase(), force);
  }
  const curveUses: NameUse[] = [];
  const forceUses: NameUse[] = [];
  for (const subsystem of subsystemBlocks(block)) {
    for (const entry of subsystem.entries) {
      if (entry.kind !== 'property' || entry.value === undefined) continue;
      const key = keyOf(entry);
      if (VALUE_KEYS.has(key)) {
        curveUses.push(...valueNames(entry.value));
      } else if (VALUE_BLOCKS.has(key) && entry.value.kind === 'block') {
        for (const part of entry.value.entries) {
          if (part.kind === 'property' && part.value !== undefined) {
            curveUses.push(...valueNames(part.value));
          }
        }
      }
    }
    forceUses.push(...forceList(subsystem).flatMap((node) => names(node)));
  }
  for (const force of propertyBlocks(block.entries, 'force')) {
    for (const entry of force.entries) {
      if (
        entry.kind === 'property' &&
        entry.value !== undefined &&
        FORCE_VALUE_KEYS.has(keyOf(entry))
      ) {
        curveUses.push(...valueNames(entry.value));
      }
    }
  }
  return { block, curves, forces, curveUses, forceUses };
}

/** The curve names of a value: its items that are not numbers. */
function valueNames(value: ScalarNode | BlockNode): NameUse[] {
  const scalars =
    value.kind === 'scalar'
      ? [value]
      : value.entries.filter((entry): entry is ScalarNode => entry.kind === 'scalar');
  return scalars.flatMap((scalar) => names(scalar).filter((use) => !isNumber(use.name)));
}

/** The comma-separated items of a scalar, with their ranges inside it. */
function names(scalar: ScalarNode): NameUse[] {
  const offset = scalar.quoted ? scalar.start + 1 : scalar.start;
  const uses: NameUse[] = [];
  let at = 0;
  for (const part of scalar.text.split(',')) {
    const lead = part.length - part.trimStart().length;
    const name = part.trim();
    if (name !== '') {
      const start = offset + at + lead;
      uses.push({ name, start, end: start + name.length });
    }
    at += part.length + 1;
  }
  return uses;
}

function isNumber(text: string): boolean {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text);
}

/**
 * The scalars of a subsystem's `force` lists: the property's value, and the bare words that
 * continue it after a comma (`force = chaos, upforce, drag`).
 */
function forceList(subsystem: BlockNode): ScalarNode[] {
  const found: ScalarNode[] = [];
  let continues = false;
  for (const entry of subsystem.entries) {
    if (entry.kind === 'property' && keyOf(entry) === 'force') {
      const value = entry.value;
      if (value?.kind === 'scalar') {
        found.push(value);
        continues = value.text.trimEnd().endsWith(',');
      } else {
        if (value?.kind === 'block') {
          found.push(...value.entries.filter((e): e is ScalarNode => e.kind === 'scalar'));
        }
        continues = false;
      }
    } else if (entry.kind === 'scalar' && (continues || entry.text.startsWith(','))) {
      found.push(entry);
      continues = entry.text.trimEnd().endsWith(',');
    } else {
      continues = false;
    }
  }
  return found;
}

function unknownKeys(
  block: BlockNode,
  kind: ParticleBlockKind,
  out: ParticleBlockDiagnostic[],
): void {
  const known = PARTICLE_KEYS[kind];
  for (const entry of block.entries) {
    if (entry.kind !== 'property') continue;
    const key = keyOf(entry);
    if (known.has(key)) continue;
    out.push({
      code: 'unknown-particle-key',
      start: entry.key.start,
      end: entry.key.end,
      message: `The game does not read "${entry.key.text}" in ${BLOCK_NAMES[kind]} block, so it has no effect.${nearest(entry.key.text, known.keys())} The game writes in its error log: Unexpected token: ${entry.key.text}.`,
    });
  }
}

function emitterKeys(subsystem: BlockNode, out: ParticleBlockDiagnostic[]): void {
  const type = particleChoice(subsystem, 'subsystem', 'emitter_type');
  if (type === 'point') return;
  const other = type === 'sphere' ? BOX_KEYS : SPHERE_KEYS;
  const log =
    type === 'sphere'
      ? 'Sphere emitter contains box emitter parameters and will probably be wrong'
      : 'Box emitter contains sphere emitter parameters and will probably be wrong';
  for (const entry of subsystem.entries) {
    if (entry.kind !== 'property' || !other.includes(keyOf(entry))) continue;
    out.push({
      code: 'particle-emitter-keys',
      start: entry.key.start,
      end: entry.key.end,
      message: `This subsystem has emitter_type = ${type}, but "${entry.key.text}" is a key of a ${type === 'sphere' ? 'box' : 'sphere'} emitter. The game writes in its error log: ${log}.`,
    });
  }
}

function shaderEffect(
  subsystem: BlockNode,
  effects: ReadonlySet<string>,
  out: ParticleBlockDiagnostic[],
): void {
  const shader = propertyBlocks(subsystem.entries, 'texture')
    .map((texture) => lastScalar(texture, 'shader'))
    .filter((node) => node !== undefined)
    .at(-1);
  if (shader === undefined || shader.text === '') return;
  const trail = lastScalar(subsystem, 'trail')?.text.toLowerCase() === 'yes';
  const billboard = lastScalar(subsystem, 'billboard')?.text.toLowerCase();
  const noBillboard = billboard === 'no' || (trail && billboard === undefined);
  const effect = `${shader.text}${trail ? 'Trail' : ''}${noBillboard ? 'NoBillboard' : ''}`;
  if (effects.has(effect)) return;
  const added = [
    ...(trail ? ['Trail for trail = yes'] : []),
    ...(noBillboard
      ? [
          billboard === 'no'
            ? 'NoBillboard for billboard = no'
            : 'NoBillboard because a trail does not face the camera',
        ]
      : []),
  ];
  const list = [...effects].sort();
  const has = list.length === 0 ? '' : ` The file has ${list.join(', ')}.`;
  const how =
    added.length === 0
      ? `, the texture's shader.`
      : `. The game looks for that name: the texture's shader, plus ${added.join(' and ')}.`;
  out.push({
    code: 'unknown-particle-shader',
    start: shader.start,
    end: shader.end,
    message: `gfx/FX/particle.shader has no shader effect "${effect}"${how}${has}`,
  });
}

/** What a block of `PARTICLE_CHOICES` is called, and what it does without a known word. */
const CHOICE_WORDING: Record<string, { readonly noun: string; readonly fallback: string }> = {
  type: { noun: 'force', fallback: 'is planar' },
  sort: { noun: 'subsystem', fallback: 'is not sorted' },
  emitter_type: { noun: 'subsystem', fallback: 'is a point emitter' },
  op: { noun: 'curve', fallback: 'adds to the value' },
};

function skippedChoices(
  block: BlockNode,
  kind: keyof typeof PARTICLE_CHOICES,
  out: ParticleBlockDiagnostic[],
): void {
  const choices: Record<string, { readonly known: readonly string[] }> = PARTICLE_CHOICES[kind];
  for (const entry of block.entries) {
    if (entry.kind !== 'property' || entry.value?.kind !== 'scalar') continue;
    const key = keyOf(entry);
    const known = choices[key]?.known;
    const wording = CHOICE_WORDING[key];
    if (known === undefined || wording === undefined) continue;
    const value = entry.value;
    if (known.includes(value.text.toLowerCase())) continue;
    out.push({
      code: 'particle-skipped-value',
      start: value.start,
      end: value.end,
      message: `The game skips ${entry.key.text} = "${value.text}": the ${wording.noun} keeps the ${key} written before it, or ${wording.fallback} without one. It knows ${known.join(', ')}, in any case.`,
    });
  }
}

function curveTime(curve: BlockNode, out: ParticleBlockDiagnostic[]): void {
  const time = lastScalar(curve, 'time');
  if (time === undefined || CURVE_TIMES.includes(time.text)) return;
  const lower = time.text.toLowerCase();
  const hint = CURVE_TIMES.includes(lower) ? ` Write "${lower}" in lowercase.` : '';
  out.push({
    code: 'particle-curve-time',
    start: time.start,
    end: time.end,
    message: `The game reads time = "${time.text}" as spawn. It knows only life, life_abs, system and spawn.${hint}`,
  });
}

function curveDuration(curve: BlockNode, out: ParticleBlockDiagnostic[]): void {
  const duration = lastScalar(curve, 'duration');
  if (duration === undefined || !isNumber(duration.text) || Number(duration.text) > 0) return;
  out.push({
    code: 'particle-curve-without-duration',
    start: duration.start,
    end: duration.end,
    message: `A curve's duration must be above 0. The game uses 1 instead, and writes in its error log: Curve animation has no duration!`,
  });
}

function describeCurve(written: string, curve: BlockNode): string {
  const name = lastScalar(curve, 'name')?.text ?? written;
  const parts: string[] = [];
  const time = lastScalar(curve, 'time')?.text;
  if (time !== undefined) parts.push(`follows \`${time}\``);
  const start = lastScalar(curve, 'start')?.text;
  const duration = lastScalar(curve, 'duration')?.text;
  if (start !== undefined || duration !== undefined) {
    parts.push(`starts at \`${start ?? '0'}\` and runs for \`${duration ?? '?'}\``);
  }
  if (lastScalar(curve, 'repeat')?.text.toLowerCase() === 'yes') parts.push('repeats');
  const op = lastScalar(curve, 'op')?.text;
  if (op !== undefined) parts.push(`\`op = ${op}\``);
  const min = lastScalar(curve, 'minvalue')?.text;
  const max = lastScalar(curve, 'maxvalue')?.text;
  if (min !== undefined || max !== undefined)
    parts.push(`gives \`${min ?? '?'}\` to \`${max ?? '?'}\``);
  const points = curvePoints(curve);
  const lines = [`**Animation \`${name}\`** of this particle effect`];
  if (parts.length > 0) lines.push(`${capitalise(parts.join(', '))}.`);
  if (points.length > 0)
    lines.push(`Points (time, value): ${points.map(([t, v]) => `(${t}, ${v})`).join(' ')}`);
  return lines.join('\n\n');
}

function describeForce(written: string, force: BlockNode): string {
  const name = lastScalar(force, 'name')?.text ?? written;
  const parts: string[] = [];
  const type = lastScalar(force, 'type')?.text;
  if (type !== undefined) parts.push(`\`${type}\``);
  const amount = valueText(force, 'amount');
  if (amount !== undefined) parts.push(`\`amount = ${amount}\``);
  const direction = valueText(force, 'direction');
  if (direction !== undefined) parts.push(`\`direction = ${direction}\``);
  const lines = [`**Force \`${name}\`** of this particle effect`];
  if (parts.length > 0) lines.push(`${capitalise(parts.join(', '))}.`);
  return lines.join('\n\n');
}

function curvePoints(curve: BlockNode): [string, string][] {
  let block: BlockNode | undefined;
  for (const entry of curve.entries) {
    if (entry.kind === 'property' && keyOf(entry) === 'curve' && entry.value?.kind === 'block') {
      block = entry.value;
    }
  }
  if (block === undefined) return [];
  const numbers = block.entries
    .filter((e): e is ScalarNode => e.kind === 'scalar')
    .map((s) => s.text);
  const points: [string, string][] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    const time = numbers[i];
    const value = numbers[i + 1];
    if (time !== undefined && value !== undefined) points.push([time, value]);
  }
  return points;
}

/** A key's value as written: a scalar's text, or a block's words in braces. */
function valueText(block: BlockNode, key: string): string | undefined {
  let found: string | undefined;
  for (const entry of block.entries) {
    if (entry.kind !== 'property' || keyOf(entry) !== key || entry.value === undefined) continue;
    const value = entry.value;
    found =
      value.kind === 'scalar'
        ? value.text
        : `{ ${value.entries
            .filter((e): e is ScalarNode => e.kind === 'scalar')
            .map((s) => s.text)
            .join(' ')} }`;
  }
  return found;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** ` Did you mean "…"?` with the closest known name within two edits, or '' without one. */
function nearest(written: string, known: Iterable<string>): string {
  const lower = written.toLowerCase();
  let best: string | undefined;
  let bestDistance = 3;
  for (const name of known) {
    const distance = editDistance(lower, name.toLowerCase());
    if (distance < bestDistance && distance < Math.max(2, name.length / 2)) {
      best = name;
      bestDistance = distance;
    }
  }
  return best === undefined ? '' : ` Did you mean "${best}"?`;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

function propertyBlocks(entries: readonly EntryNode[], key: string): BlockNode[] {
  return entries.flatMap((entry) =>
    entry.kind === 'property' && keyOf(entry) === key && entry.value?.kind === 'block'
      ? [entry.value]
      : [],
  );
}

function lastScalar(block: BlockNode, key: string): ScalarNode | undefined {
  let found: ScalarNode | undefined;
  for (const entry of block.entries) {
    if (entry.kind === 'property' && keyOf(entry) === key && entry.value?.kind === 'scalar') {
      found = entry.value;
    }
  }
  return found;
}

function inside(range: SourceRange, offset: number): boolean {
  return offset >= range.start && offset < range.end;
}
