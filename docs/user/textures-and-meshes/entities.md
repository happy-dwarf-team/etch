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
2. Click **Preview entity**, which shows above each `entity = { … }`, for example above
   `westerngfx_INFANTRY_1`. Or run **Etch: Preview Entity…** from the Command Palette
   (<kbd>Ctrl+Shift+P</kbd>) and pick the entity from the list.
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

The list in the bar above the model holds the entity's states (**State: idle**, **State: walk**,
…). The preview starts with the entity's `default_state`. Without one, it starts with `idle`, if
the entity has that state.

- Pick a state to play it, in a loop, on the entity and on everything attached to it. The line at
  the bottom shows the state, its frame and its speed.
- Click **Pause** to stop it, and **Play** to go on from the same frame. **Bind pose**, at the
  top of the list, shows the entity without an animation.
- The slider beside **Play** goes to a frame, as in the mesh preview (see
  [Go to a frame](mesh-preview.md#go-to-a-frame)). The slider follows the animation of the
  entity's own mesh. Everything attached to the entity, such as the soldier's halberd, shows the
  same moment.

A state's `animation` names one of the `animation` blocks of the entity's pdxmesh, by its `id`.
That block's `type` names an `animation` of an `.asset` file, and that one's `file` is the `.anim`
file that plays. For the soldier, `idle` plays `polearm_twohanded_idle.anim`. An attached entity
with no animation for the state stays on its bone as the bone moves.

Turning, moving and zooming, the colour boxes, **Flag**, **Region**, **LOD**, **Snow**, **Wire**,
**Bones**, **Diffuse**, **Normal**, **Spec** and **Reset view** work as in the
[mesh preview](mesh-preview.md). **Bones** shows the skeletons of the entity and of everything
attached to it. An orange dot marks each bone an attached entity hangs on: point at it to see the
bone's name and the entity's.

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
- a particle that no `.asset` file defines;
- a texture that is missing.

## Particles

A state's `event = { … }` blocks (not EU4 events) start particle effects, such as the muzzle
flash of an artillery piece. In `western_units.asset`, the `attack` state of
`westerngfx_ARTILLERY_1_cannon` starts `artillery_cannon` on the bone `cannon_muzzle`. Etch does not
draw them: while the state plays, the line at the bottom names them after "particles not drawn".

Particles are defined in `.asset` files as `particle = { name = … }`; the game's are in
`gfx/particles`. When a state starts a particle that no `.asset` file defines, the box under the
bar lists it: the game has nothing to start there.

## What it doesn't do

- It does not draw particle effects.
- It does not draw an attachment that hangs more than six levels down (an entity on an entity on
  an entity …). Vanilla's go three levels down at most.
- It combines an entity with its `clone` by Etch's own reading: how the game does it is not
  documented.
- It does not change the `.asset` file.
- It draws nothing when Etch does not find the game folder.
