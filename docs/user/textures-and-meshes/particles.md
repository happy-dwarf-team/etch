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
- **A curve or force name the effect does not have**, such as `size_increse`. The game writes no
  error for this, so it is easy to miss. The `animation` or `force` block must be in the same
  `particle` block.
- **A curve's `time` that the game reads as `spawn`.** The game knows only `life`, `life_abs`,
  `system` and `spawn`, in lowercase. The base game's files have a comment `# Life`, but
  `time = "Life"` counts as `spawn`. Then the curve does not follow the life of each particle: by
  Etch's reading, `spawn` is the effect's time when the particle was born.
- **A curve's `duration` of 0 or less.** The game uses 1 instead.
- **A key of the other emitter shape**: `box_emitter_x` with `emitter_type = sphere`, or
  `sphere_emitter_radius` with `emitter_type = box`.
- **A shader effect the game does not have.** The texture's `shader` must name an effect of
  `gfx/FX/particle.shader`. With `trail = yes` or `billboard = no`, the game adds `Trail` or
  `NoBillboard` to that name. The base game's file has no effect with either ending. So such a
  subsystem needs a `gfx/FX/particle.shader` in your mod with that effect, such as
  `ParticleAlphaBlendTrail`.
- **A texture that is missing**: your
  [playset](../reference/glossary.md#playset) (the game, your mod and the mods it depends on) has
  no file at the texture's `file`.

When the game writes a line to its error log for a case, the warning quotes it.

The warnings update as you type. For shader effects and textures, Etch looks at the files saved on
disk. After you add one, save its file, and the warnings update.

An entity's `event` names the particle that it starts. Those names have warnings of their own:
see [Warnings in the files](entities.md#warnings-in-the-files) on the Entities page.

## What it doesn't do

- It does not draw particle effects (see [Entities](entities.md)).
- What many keys do is Etch's reading, not checked in the game. Etch does not know how a value's
  variation (the second number in `{ 1.75 0.4 }`) and its curves add up.
- It does not check the keys inside `childsystem`, `position` and `color` blocks.
- The warnings about shader effects and textures need the game folder: without it, Etch gives
  only the others.
- It does not change your files.
