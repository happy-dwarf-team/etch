---
title: Entities
description: See a unit or a ship drawn from its .asset entity, with what hangs on its bones and its animations.
since: 2.13.0
clip: entity
---

The game builds each unit and ship from an `entity` in an `.asset` file. An entity has a mesh,
other entities hung on the mesh's bones (its skeleton), and states (its animations, such as idle
or walk). Etch draws an entity the same way, in the same preview as a single
[mesh](mesh-preview.md).

## Preview an entity

1. Open an `.asset` file, for example the base game's `gfx/entities/western_units.asset`.
2. Click **Preview Entity**, which shows above each `entity = { … }`, for example above
   `westerngfx_INFANTRY_1`. Or run **Etch: Preview Entity…** from the Command Palette
   (<kbd>Ctrl+Shift+P</kbd>) and pick the entity from the list:
   - the entity your cursor is in comes first, under **At the cursor**, with its states (such as
     `idle · walk · attack`), so <kbd>Enter</kbd> previews it;
   - the others follow under **In the file**, in the order the file has them;
   - each one shows its `pdxmesh`, or "clone of" and the entity it copies, and the line it
     starts on.

   Type in the box at the top of the list to filter it by name.
3. The entity opens beside the editor, in a tab called "Entity: westerngfx_INFANTRY_1".

The command shows in the Command Palette only while you are in an `.asset` file.

## What an entity is made of

Etch follows the entity's keys as the game does:

- Its `pdxmesh = …` names a `pdxmesh` block of a `.gfx` file, whose `file` is the mesh. For
  `westerngfx_INFANTRY_1`, the block `western_generic_01_type1` in `interface/assets/western.gfx`
  has `gfx/models/Units/western_generic_01_type1.mesh`.
- Its size is the pdxmesh's `scale` times the entity's own `scale`.
- A `clone` makes it start from the entity it names. What the entity writes itself replaces the
  clone's: its `pdxmesh`, its `scale`, a state of the same name, an `attach` block of the same
  `name`.
- Each `attach` block hangs other entities on the bones it names, each at its own scale. In the
  soldier above, `Right_hand_node = "western_halbard"` puts a halberd in his right hand. An
  attached entity moves with its bone.

## States

The list in the bar under the model holds the entity's states (**State: idle**, **State: walk**,
…). The preview starts with the entity's `default_state`. Without one, it starts with `idle`, if
the entity has that state.

- Pick a state to play it, in a loop, on the entity and on everything attached to it. The line at
  the bottom shows the state, its frame and its speed.
- Click **Pause** to stop it, and **Play** to go on from the same frame, or press
  <kbd>Space</kbd>. **Bind pose**, at the top of the list, shows the entity without an animation.
- If your system is set to reduce motion, a state waits on its first frame, also the one the
  preview starts with. Click **Play** or press <kbd>Space</kbd> to start it (see
  [Animations](mesh-preview.md#animations)).
- The slider beside **Play** goes to a frame, as in the mesh preview (see
  [Go to a frame](mesh-preview.md#go-to-a-frame)). The slider follows the animation of the
  entity's own mesh. Everything attached to the entity, such as the soldier's halberd, shows the
  same moment.

A state's `animation` names one of the `animation` blocks of the entity's pdxmesh, by its `id`.
That block's `type` names an `animation` of an `.asset` file, and that one's `file` is the `.anim`
file that plays. For the soldier, `idle` plays `polearm_twohanded_idle.anim`. An attached entity
with no animation for the state stays on its bone as the bone moves.

A state with `time_offset = { 1 0.5 }` starts 1 second in, plus a random part of the second
number. Its animation starts at that point, and an `event` timed before it waits for the next
loop, or never comes in a state that does not loop. The preview starts the state at the first
number.

The animation moves the mesh's bones by their order, as the game does: joint 1 moves bone 1, joint
2 bone 2, whatever their names. A musket on `Left_hand_node`, the tenth bone, therefore follows the
tenth joint of `rifleman_idle.anim`, `attack_L_hand`. An animation with more or fewer joints than
the mesh has bones does not play in the game: the preview shows that entity in its bind pose and
names the state in the box under the bar.

You turn, move and zoom the model as in the [mesh preview](mesh-preview.md). The country colours
(the colour boxes, **Country** and **Region**), **LOD**, **Snow**, **Wire**, **Bones**,
**Diffuse**, **Normal**, **Spec** and the zoom with **Fit model** work the same way. **Particles**
shows or hides the state's smoke, sparks and flashes (see [Particles](#particles)). As there, the
country colours, **LOD** and **Snow** show only when the model has parts they work on. **Bones** shows the skeletons of the
entity and of everything attached to it that has one. An orange dot marks each bone an attached
entity hangs on: point at it to see the bone's name, then the name of the attached entity.

## Where it finds the files

Etch takes every file from your [playset](../reference/glossary.md#playset) (the game, your mod
and the mods it depends on). It reads the `.gfx` and `.asset` files of the game and your mods.
When two of them define the same name, the one loaded later wins. Then it loads the meshes,
textures and animations they name. For the `.asset` file you have open, Etch uses what is in the
editor, even before you save. When you save an `.asset` or `.gfx` file, the open entity previews
draw again.

Most of what an entity uses is defined in the game's own files, so the entity preview needs the
game folder. Etch finds it through Steam; if it does not, set `etch.gamePath` (see
[Where Etch finds the game](../getting-started/finding-the-game.md)). Without the game folder, Etch
says so and draws nothing.

## What the bar shows

The bar lists the entity's name, its mesh file and how many entities hang on it, such as
"western_generic_01_type1.mesh and 1 attached". Then come the same counts (shapes, vertices,
triangles, bones), shaders and textures as in the [mesh preview](mesh-preview.md), for everything
drawn together, and the entity's scale when it is not 1.

Hover over the bar's first line to see the attachments: each entity, the bone it hangs on and its
mesh file.

A box under the bar lists what Etch could not find or draw:

- a missing pdxmesh, mesh file, animation or attached entity;
- a `clone` loop: an entity that clones another one that clones it back;
- an entity that would hang under itself, directly or further down; Etch does not draw it;
- a particle the game cannot start (see [Particles](#particles));
- an animation that does not fit its mesh: another number of joints than the mesh has bones;
- a texture that is missing.

## Particles

A state's `event = { … }` blocks (not EU4 events) start particle effects, such as the muzzle
flash of an artillery piece. In `western_units.asset`, the `attack` state of
`westerngfx_ARTILLERY_1_cannon` starts `artillery_cannon` on the bone `cannon_muzzle`.

Etch draws these effects while the state plays. The smoke, sparks and flashes come out of the
event's `node` at its `time`, every time the animation comes round to it. Each start is a new
copy of the effect, and the earlier copies play on.

As in the game:

- An event whose `time` is past the end of the animation, or below 0, starts each time the
  animation starts over.
- A state without an animation starts its effects once. With `state_time = 2`, they start again
  every 2 seconds.
- With `trigger_once = yes`, the event starts only in the state's first round: the first pass
  through its animation, or its first `state_time` seconds. A state with neither never starts it.
- When you pick another state, the effects and their particles go at once. An event with
  `keep_particle = yes` keeps its effect, and the particles already out live on. If one of its
  subsystems (the parts of the effect) would send out particles for ever, the effect stops
  sending out new ones.

A subsystem with `trail = yes` draws a band through its particles, from the oldest to the newest,
as wide as the particles are big. With `billboard = yes` the band faces the camera; otherwise it
lies flat. The base game has no shader effect for trails, so the game draws the band in one flat,
grey colour, solid, whatever the particles' colour, alpha and `texture`, and only the side that
faces the camera. Etch draws it the same way. A band that faces the camera shows whole. A flat
band seen from above does not show, except, in the game, for scraps where particles overtake each
other; Etch shows no such scraps. And the game shows no band at all while another part of the same
effect has particles on screen, whether that part comes before or after the trail in the file, so
a trail shows only in an effect of trails, or while its other parts have no particle. Without its
own shader effect, the band is drawn with the last shader the game used, and after the effect's
particles that shader draws nothing. Etch does the same. A trail whose shader effect your playset's
`gfx/FX/particle.shader` has (see [Particle effects](particles.md)) shows next to the other parts,
in the game and in Etch.

The `node` is a bone of the mesh, or a named point that the `.mesh` file stores for this. The
`muzzle` of vanilla's muskets is such a point. If the mesh has neither of that name, the effect
starts at the entity's feet.

Etch draws the effects in its own way: close to the game's, but not the same (see
[Differences from the game](#differences-from-the-game)). While they play, the line at the bottom
says how many particles there are, then the effects' names, for example "particles (approximate,
120 alive): western_musket: musket_muzzle on muzzle at 0.9 s".

**Particles** shows only for an entity with effects that Etch can draw. Click it to hide them: the
line then says "particles off", then the names. When none of the state's effects can be drawn, the
line says "particles not drawn", then the names, and the box under the bar says why (see below).

Pause the animation and drag the frame slider: a frame always shows the same particles, however
you got to it. When the preview could not draw for more than a second (its tab was hidden, the
computer slept), the animation goes on from where it stopped, as after a pause.

To start a particle, the game needs two definitions:

1. A `pdxparticle` in a `.gfx` file in the `interface` folder, inside its `objectTypes = { … }`
   block. The event's `particle = …` uses its `name`. The game's are in
   `interface/assets/particles.gfx`, such as
   `pdxparticle = { name = "siege_cannon" type = "artillery_cannon" scale = 0.8 }`.
2. The effect that its `type` names: a `particle = { name = "artillery_cannon" … }` block in an
   `.asset` file. The game's are in `gfx/particles`.

So in the game, an event with `particle = "siege_cannon"` starts the effect `artillery_cannon`
with the scale 0.8, and so does Etch. The scale makes each particle that many times bigger and
makes it fly the square of the scale as far: at a scale of 2, twice as big and four times as far.
The game reads the scale when it starts, so restart it after you change one; `reload assets`
keeps the old scale.
The line at the bottom shows the effect and the scale after the name: "siege_cannon
(artillery_cannon, scale 0.8)". It shows them only when the effect has another name or the
`pdxparticle` has a scale.

The box under the bar lists an event whose particle the game cannot start:

- No `.gfx` file has a `pdxparticle` of that name. An effect of that name in an `.asset` file is
  not enough. The game's own message for this begins `Couldn't find particle 3D object`.
- The `pdxparticle` has no `type`, or its `type` is not the name of any effect in an `.asset`
  file. The game's own message for the second begins `Could not find particle effect`.

To fix it, add or correct the `pdxparticle` in your mod's `.gfx` file.

### Warnings in the files

Etch also warns you about these two cases in the files, without the preview. Open an `.asset`
file from a `gfx` folder, or a `.gfx` file from an `interface` folder. A wavy underline marks
each case. The same warning shows in VS Code's Problems panel (<kbd>Ctrl+Shift+M</kbd>), with
"Etch" next to it.

- In the `.asset` file, the underline is under the name in `particle = "…"` when no `.gfx` file
  has a `pdxparticle` of that name. Sometimes you wrote the name of the effect instead of the
  name of the `pdxparticle`: `my_smoke_effect` where your `.gfx` file has
  `pdxparticle = { name = "my_smoke" type = "my_smoke_effect" }`. Then the warning tells you the
  name of the `pdxparticle` to use, here `my_smoke`.
- In the `.gfx` file, the underline is under `type = "…"` when no `.asset` file has an effect of
  that name. It is under `name = "…"` when the `pdxparticle` has no `type`.

The warnings update as you type in the open file. For the other files, Etch reads them as they
are saved. So after you add a `pdxparticle` or an effect in another file, save that file. The
warnings in the open files then update.

Etch also explains the keys inside the effect's own `particle = { … }` block when you hover over
them, and warns about mistakes in them: see [Particle effects](particles.md).

### Differences from the game

These parts work as in the game:

- when an effect sends out particles, and how many;
- how long they live, how fast and which way they fly;
- how their size, rotation and colour change over their life;
- the picture from the effect's `texture`, and how it blends with what is behind it;
- the force blocks (explained in [Particle effects](particles.md)) of `type = "planar"`,
  `"point"`, `"vortex"`, `"friction"`, `"turbulence"` and `"spin"`. A `point` force with a
  positive `amount` pushes the particles away from its `position`. A `spin` force swings them
  round its axis, `amount` radians a second (a full turn is about 6.28), but nothing holds them on
  the circle: in an effect whose pdxparticle `scale` is above 1, or with another force or a start
  speed, they spiral outwards and soon fly off. With the siege smoke's scale of 2, `amount = 1`
  throws the particles away within a few seconds;
- when an event starts its effect, and what happens to it when you pick another state;
- the shape and look of a trail;
- a `childsystem` block inside a `subsystem`: it takes the keys of a subsystem, and each particle
  of the subsystem sends out its particles from where it is, while it lives. A child with
  `local_space = yes` sends them out from the effect's own place instead. A particle that dies
  stays, unseen, until its children are gone, so it still counts towards `max_amount`;
- the order in which the parts of an effect are drawn, which decides what covers what. First come
  the effect's particles that are not trails, subsystem by subsystem in the file's order. After
  each subsystem come its particles' child systems, parent by parent. The trails come last, in the
  same order. A trail without its own shader effect comes only while the effect's other particles
  are not on screen (see the trail above).
  A subsystem's `sort` changes the order of its particles, and so the order of their child
  systems too. Like the game, Etch sorts a little each frame, so the order settles over a few
  frames after you turn the camera. The game never moves the last particle in its list, which is
  usually the newest, so that one is drawn last whatever its distance. A subsystem with only two
  particles is not sorted at all.

These parts differ:

- The exact direction and other chance values of each particle, and the swirl of a `turbulence`
  force. Etch picks them by the game's rule and in the game's order, but the game starts its
  sequence from the computer's clock each time an effect starts, so its own shots differ from
  each other too and Etch cannot match any one of them.
- A trail in a mod that adds its own shader effect for it (see
  [Particle effects](particles.md)). The game draws the band with that effect. Etch still draws it in
  grey.
- Where a state with a `time_offset` starts. The game adds a random part of its second number;
  Etch starts at the first.
- How many particles and effects can be alive. Like the game, Etch starts a new copy of an
  event's effect each time the event comes round, while the earlier copies still play. But once
  100,000 particles are alive, or 1,000 effects are running, Etch starts no new copy, and the line
  at the bottom says so. The game has no limit, so an effect that sends out particles forever,
  started on every loop of its state, keeps growing there. The 1,000 effects matter for an effect
  that runs forever but keeps few particles alive, such as one with a low `emission` or a short
  `life`.
- A subsystem or child with `local_space = yes`. Etch draws it at the model. The game passes the
  model's place to `gfx/FX/particle.shader` in `InstanceWorldMatrix`, and the base game's shader
  does not use it, so in the game these particles do not show at the model. Etch warns on
  `local_space = yes` when your playset's `particle.shader` does not use `InstanceWorldMatrix`.
  To keep the particles at the model, leave `local_space` out, or ship a `particle.shader` whose
  vertex shader multiplies the position by `InstanceWorldMatrix`.

## What it doesn't do

- It does not draw particle effects exactly as the game does: see
  [Differences from the game](#differences-from-the-game).
- It does not draw an attachment that hangs more than six levels down (an entity on an entity on
  an entity …). Vanilla's go three levels down at most.
- It combines an entity with its `clone` by Etch's own reading: how the game does it is not
  documented.
- It does not change the `.asset` file.
- It draws nothing when Etch does not find the game folder.
