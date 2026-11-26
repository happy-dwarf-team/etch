---
title: Particle effects
description: Hover over the keys of a particle effect to see what they do, and get warnings where the game would not do what you wrote.
since: 2.15.0
---

Particle effects are the smoke, sparks and flashes of units and buildings: the
`particle = { … }` blocks of `.asset` files, such as the base game's
`gfx/particles/artillery_cannon.asset`. Etch explains their keys when you hover over them. It also
warns you about mistakes that the game does not report, or reports only in its error log.

## The parts of an effect

- `subsystem`: an emitter. It sends out particles, small pictures that face the camera. An effect
  can have several: the base game's `artillery_cannon` has smoke, sparks, a flash and fire.
- `texture`, inside a subsystem: the picture (`file`) and how it blends with what is behind it
  (`shader`).
- `animation`: a curve with a name. It makes a value change over time, for example over the life
  of a particle. A key uses it by writing its name after the number and a comma:
  `alpha = { 75,smoke_fade }` fades the particles out.
- `force`: a force with a name, such as gravity or drag. A subsystem lists the forces that act on
  its particles: `force = drag,gravity`.

## Hover over a key

1. Open an `.asset` file with a `particle = { … }` block.
2. Hold the mouse over a key, such as `life` in a `subsystem`.

A box shows what the key takes and what it does. Over other words you see:

- **A curve name in a value**, such as `size_increase` in `size = { 1.75,size_increase 0.4 }`: the
  box shows that `animation` block, with the points of its curve.
- **A force name**, such as `drag` in `force = drag,upforce`: the box shows that `force` block.

In a `.gfx` file, the keys of a `pdxparticle = { … }` get the same boxes.

The game does not document these keys. Etch knows which keys the game reads, and the values some
of them take. For many keys, what they do is Etch's reading of their names and of how the base
game uses them. The box then ends with "It is not checked in the game."

## Warnings

Open an `.asset` file from a `gfx` folder. A wavy underline marks each case below. The same
warning shows in VS Code's Problems panel (<kbd>Ctrl+Shift+M</kbd>), with "Etch" next to it.

- **A key the game does not read**, such as `lifee`. The game does not use it. The warning names
  the key you probably meant, here `life`.
- **A curve or force name with no `animation` or `force` block of that name in the same
  `particle` block**, such as `size_increse`. The game leaves the curve or force out. It writes one
  line about it in its error log, among many others, so it is easy to miss. The warning names the
  curve or force you probably meant, here `size_increase`.
- **A curve's `time` that the game reads as `spawn`.** The game knows only `life`, `life_abs`,
  `system` and `spawn`, in lowercase. The base game's files have a comment `# Life`, but
  `time = "Life"` counts as `spawn`. Then the curve does not follow the life of each particle: by
  Etch's reading, `spawn` is the effect's time when the particle was born.
- **A curve's `duration` of 0 or less.** The game uses 1 instead.
- **A word the game does not know** in a force's `type`, a subsystem's `sort` or `emitter_type`,
  or a curve's `op`, such as `type = "gravity"`. The game knows these words, in any case:

  | Key | Words | Without one the game knows |
  | --- | --- | --- |
  | `type` | `planar`, `point`, `vortex`, `friction`, `turbulence`, `spin` | `planar` |
  | `sort` | `depth`, `distance`, `age` | not sorted |
  | `emitter_type` | `point`, `sphere`, `box` | `point` |
  | `op` | `mul`, `add`, `abs` | `add` |

  It skips any other word. The block then keeps the word written before it, or gets the value in
  the last column, and Etch's preview plays it the same way. A curve without `op` adds to the
  value: write `op = "MUL"` to scale it, as the base game does.
- **A key the game does not take in a `position` or `color` block**, such as `zz`. The game takes
  `x`, `y`, `z` and `w`, or `r`, `g`, `b` and `alpha` (or `a`), in any case and in both blocks:
  `r` is the same as `x`, and `a` the same as `alpha` and `w`. When a block has a key twice, the
  last one wins. The game skips any other key and writes `Unexpected token` in its error log.
  A `position` has no fourth value: the game reads its `w` and drops it, without a line in its
  error log.
- **A key of the other emitter shape**: `box_emitter_x` with `emitter_type = sphere`, or
  `sphere_emitter_radius` with `emitter_type = box`. The game stores the two shapes' keys in the
  same three places, so such a key still sets a value of the shape you have:

  | Sphere | Box |
  | --- | --- |
  | `sphere_emitter_radius` | `box_emitter_x` |
  | `sphere_emitter_yaw` | `box_emitter_y` |
  | `sphere_emitter_pitch` | `box_emitter_z` |

  With `emitter_type = sphere`, `box_emitter_x = 30` is a radius of 30. When a subsystem has both
  keys of a row, the last one wins. The preview reads them the same way.
- **A shader effect the game does not have.** The texture's `shader` must name an effect of
  `gfx/FX/particle.shader`. With `trail = yes` or `billboard = no`, the game adds `Trail` or
  `NoBillboard` to that name. The base game's file has no effect with either ending. So such a
  subsystem needs a `gfx/FX/particle.shader` in your mod with that effect, such as
  `ParticleAlphaBlendTrail`. Without one, the game draws a trail as a flat grey band, and not at
  all while the effect's other parts have particles on screen, unless a trail with its own effect
  comes before it: then it is drawn with that effect (see [Entities](entities.md#particles)).
- **`local_space = yes` that the shader does not place.** The game passes the effect's place to
  `gfx/FX/particle.shader` in `InstanceWorldMatrix`. The base game's file does not use it. So the
  game draws these particles at their own coordinates on the map: around its south-west corner,
  moved by the subsystem's `position`, and not at the effect. The game draws nothing of a
  `particle`, children included, unless one of its top-level `subsystem` blocks has no
  `local_space = yes` and sends out particles. A child without it does not count, and neither does
  a subsystem whose `emission` is 0. The warning says when that happens. Leave
  `local_space` out, or ship a `particle.shader` in your mod whose vertex shader multiplies the
  position by `InstanceWorldMatrix`.
- **A texture that is missing**: your
  [playset](../reference/glossary.md#playset) (the game, your mod and the mods it depends on) has
  no file at the texture's `file`.

When the game writes a line to its error log for a case, the warning quotes it.

The warnings update as you type. For shader effects, `local_space` and textures, Etch looks at the files saved on
disk. After you add one, save its file, and the warnings update.

An entity's `event` names the particle that it starts. Those names have warnings of their own:
see [Warnings in the files](entities.md#warnings-in-the-files) on the Entities page.

## What it doesn't do

- Opening an `.asset` file does not show its effects. To see one, open the entity preview of an
  entity whose state starts it (see [Entities](entities.md#particles)).
- What many keys do is Etch's reading, not checked in the game. Etch does not know how a value's
  variation (the second number in `{ 1.75 0.4 }`) and its curves add up.
- The warnings about shader effects, `local_space` and textures need the game folder: without it, Etch gives
  only the others.
- It does not change your files.
