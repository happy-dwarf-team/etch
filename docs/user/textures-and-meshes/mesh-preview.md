---
title: Mesh preview
description: Open a .mesh file and turn the model in your hand, with its textures, colours and animations.
since: 2.13.0
clip: mesh
---

With Etch, `.mesh` files open in the **Etch Mesh Preview**: the model drawn with its textures and
lit the way the game lights it, so you can turn it in your hand.

## Open a mesh

Open any `.mesh` file from the Explorer, for example the base game's
`gfx/models/ships/carrack.mesh`. The model shows with the three textures its materials name: the
colour texture (`carrack_diffuse.dds`), the normal map that gives it small bumps
(`carrack_normal.dds`) and the specular map that makes it shine (`carrack_spec.dds`).

Etch looks for these textures in the mesh's own folder, as the game does. It looks through your
[playset](../reference/glossary.md#playset) (the game, your mod and the mods it depends on), so
your mod's file wins over the game's. A `.tga` name finds the `.dds` of the same name when only
that exists. A mesh outside your playset takes the textures beside it. A part whose texture is
missing shows grey, and a box under the bar above the model names the texture.

The bar above the model lists:

- the file's name;
- its shapes, vertices (corner points), triangles and bones (the skeleton an animation moves);
- how many of its parts have a colour texture, a normal map and a specular map;
- its shaders, such as `PdxMeshStandard`: a shader is the way the game paints a part, and each
  part's material names one;
- each texture and where it came from: the game, a mod's name, beside the mesh, or not found.

The bar also counts the mesh's collision shapes, as "collision (hidden)".

## Controls

| Control                              | What it does                                              |
| ------------------------------------ | --------------------------------------------------------- |
| Drag                                 | Turns the model.                                          |
| <kbd>Shift</kbd>+drag, or right-drag | Moves it.                                                 |
| Mouse wheel                          | Zooms in and out.                                         |
| **Reset view**                       | Turns the model back as it opened and fits all of it in.  |
| **Wire**                             | Shows the edges of its triangles as lines over the model. |
| **Diffuse**                          | Turns the colour texture off and on.                      |
| **Normal**                           | Turns the normal map off and on.                          |
| **Spec**                             | Turns the specular map off and on.                        |

More controls show only when the mesh has the parts they work on. The sections below explain them.

## See what each texture does

**Diffuse** (the colour texture), **Normal** (the normal map) and **Spec** (the specular map)
each turn one texture off and on, so you can see what it adds. A button is greyed out when no
part of the model has that texture. The bar lists the textures that are off, such as "maps off:
diffuse, normal".

- With **Diffuse** off, the model is plain grey. What the colour texture's see-through part (what
  **A** shows in the [texture preview](texture-preview.md)) controls goes too: the country flag on
  `PdxMeshTextureAtlas` parts, the see-through of `PdxMeshAlphaBlend` parts and the holes in a
  [map tree](map-trees.md).
- With **Normal** off, the small bumps go, and the surface looks smooth.
- With **Spec** off, the shine (the bright highlights) goes. On `PdxMeshColor` parts the country
  colours go too, because the specular map marks where they are (see
  [Country colours](#country-colours)). The bar then also reads "no country colours without the
  specular map".

## Country colours

A part with the `PdxMeshColor` shader takes a country's colours, such as a unit's uniform or a
ship's sails. Its specular map marks where: its red channel for the first colour, its green
channel for the second and its blue channel for the third. For such a mesh, three colour boxes
show in the bar. Pick colours there to see the model in another country's colours.

## Flag

A part with the `PdxMeshTextureAtlas` shader shows a country's flag, as on vanilla's ships and the
flags on the map. The alpha of its colour texture (what **A** shows in the
[texture preview](texture-preview.md)) marks where the flag goes.

Type a country tag in **Flag**, such as `SWE`, to see that country's flag from your playset:
`gfx/flags/SWE.tga`. With **Flag** empty, the part shows the three colours of the colour boxes as
stripes instead.

**Region** shows a colonial nation's flag and colours as the game shows them. Type the overlord's
tag in **Flag**, then tick **Region**, or pick a colour in the box beside it. The right half of the
flag takes that colour, and `PdxMeshColor` parts take it in place of their third colour.

## Levels of detail

Some meshes hold levels of detail: simpler copies of the model that the game draws when the
camera is far away. Vanilla's map trees have them, such as
`gfx/models/Mapitems/Trees/Pine_01.mesh`. The preview draws the most detailed level first.

- The **LOD** list picks another level (**LOD 1**, **LOD 2**, …). The bar shows how far away the
  camera must be for the game to start that level (from the mesh's `loddist`).
- **LOD auto** picks the level as the game does: by how far the camera is from the model. Zoom
  out, and the level changes. It shows when the mesh has a `loddist`.

## See-through parts

A part with the `PdxMeshAlphaBlend` shader, such as vanilla's African buildings or a unit's
selection ring, is see-through where the alpha of its colour texture says. You see what is behind
it, as in the game.

## Snow

A part with the `PdxMeshSnow` shader takes snow in winter: vanilla's city buildings and forts, such
as `gfx/models/Buildings/Western/cose_castle.mesh`. For such a mesh, **Snow** puts snow on the
surfaces that face up, as the game does, from 0 (none) to 1. In the game the amount comes from the
map at the building's place; here you set it.

Map trees take snow too, in their own way: see [Map trees](map-trees.md).

## Animations

If the mesh has a skeleton, a list in the bar offers the `.anim` files in its folder that move at
least half of its bones. The ones whose names start with the mesh's name come first, such as
`carrack_idle.anim` for `carrack.mesh`.

1. Pick an animation in the list. It plays in a loop, and the line at the bottom shows its frame
   and speed.
2. Click **Pause** to stop it, and **Play** to go on from the same frame.
3. Pick **Bind pose**, at the top of the list, to see the model without an animation.

### Go to a frame

The slider beside **Play** shows where the animation is. It moves along as the animation plays.

- Drag the slider to a frame: the animation stops there while you drag, and the model takes that
  frame's pose. When you let go, the animation plays on from that frame if it was playing before
  you dragged. If it was paused, it stays paused.
- Click the slider once to select it, then press <kbd>←</kbd> or <kbd>→</kbd> to step one frame
  back or forward. The animation pauses at that frame.
- Or press the comma key <kbd>,</kbd> (one frame back) or the full stop key <kbd>.</kbd> (one
  frame forward) anywhere in the preview, as in a video player. They do nothing while you type in
  a box, such as **Flag**.

The line at the bottom shows the frame you are on. **Play** goes on from there.

## Front and back of a surface

Each triangle has a front and a back, and the preview draws only its front, as the game does.
Seen from behind, a triangle is not drawn. A closed model looks the same either way, but a single
sheet, such as a cape made of one layer, vanishes when you turn it round. To show a sheet from both
sides, model it twice in your 3D editor, the second copy flipped, as vanilla does with its ships'
sails.

## Edit and see it at once

Keep the mesh open while you work on it. When the mesh, or a texture or an animation in its folder,
changes on disk, for example after a new export, the preview shows the new one at once. Your view
and the animation you picked stay.

## Open it another way

To open a mesh with another viewer, run **View: Reopen Editor With…** from the Command Palette
(<kbd>Ctrl+Shift+P</kbd>).

## What it doesn't do

- It does not change the mesh; use your 3D editor.
- It draws the model alone: the map's fog of war and distance fog are not drawn, and there is no
  snow but what **Snow** puts on.
- It does not draw collision shapes.
- It offers only the animations in the mesh's own folder. Vanilla keeps its soldiers' animations
  in `gfx/models/Units/animation`: to play them, open the unit's entity instead (see
  [Entities](entities.md)).
- A flag, and a map tree's colours, come from your playset. When Etch does not find the game (see
  [Where Etch finds the game](../getting-started/finding-the-game.md)), the preview shows no flag
  and draws a map tree as a plain mesh.
