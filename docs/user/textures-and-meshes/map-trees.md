---
title: Map trees
description: See a map tree drawn as the game draws it on the map, with its tint, ground colour, season and snow.
since: 2.13.0
clip: trees
---

The trees on the game's map are meshes too, but the game draws them its own way. When your
[playset](../reference/glossary.md#playset) (the game, your mod and the mods it depends on) names a
mesh as a map tree, the [mesh preview](mesh-preview.md) draws it that way and adds controls for
what the map changes about it.

## Which meshes are map trees

A mesh is a map tree when a `pdxmesh` named `mapobject_<n>` names it in a `.gfx` file of your
playset. In the base game they are in `interface/assets/mapitems.gfx`: `mapobject_2`, for example,
names `gfx/models/Mapitems/Trees/Pine_01.mesh`.

Open such a mesh, and the bar above the model names its tree type and the shader the game draws it
with: "mapobject_2: the map's tree shader, not PdxMeshStandard". The game paints every map tree
with its own tree shader (its way of painting it), whatever shader the mesh's materials name:

- Where the colour texture's alpha (its see-through part) is below half, the tree has holes you
  can see through.
- It does not shine: there is no highlight.

Turning, moving and zooming, **Wire**, **Diffuse**, **Normal** and the levels of detail
(**LOD**, **LOD auto**) work as for any mesh: see [Mesh preview](mesh-preview.md). With
**Diffuse** off, the holes go too: the tree shows as solid grey cards.

## Tint and Turn

The game lays its tint map, `map/terrain/Tree_tint.bmp` of your playset, over the tree. On the
map, the game turns each tree at random, and that turn also moves the place in the tint map that
the tree takes its tint from. **Turn** sets that turn here, from 0 (none) to 1 (a full turn).

## Ground

Then the game lays over the tree the map's colour where the tree stands, at a quarter strength. In
**Ground**, you pick that colour yourself. It starts at grey (#808080), which changes nothing.

## Season: Date and North

Last, the game adds a season colour from `map/terrain/Tree_season.bmp`, only in the map's northern
half.

- **Date** is the day of the year; it starts at 1 July. The `tree_*` blocks of your playset's
  `map/seasons.txt` say which tree season the day falls in, or between which two. That picks where
  in `Tree_season.bmp` the colour comes from (one of its eight columns, or between two), as the
  game picks it. Hover over **Date** to see the season.
- **North** sets how much season colour the tree takes. 0 stands for the middle and south of the
  map, where the tree takes none; 1 stands for the far north.

## Place

To stand the tree in a real place, type a province ID in **Place**, such as `1` (Stockholm). Etch
takes the province's position from your playset's `map/positions.txt`:

- **Ground** takes the map's colour there, from `map/terrain/colormap_*.dds`. Etch takes the colour
  map of the season the **Date** falls in; between two seasons, it mixes the two, as the game does.
- **North** takes how far north the place is.

While **Place** holds a province Etch found, you cannot change **Ground** and **North** by hand. The
bar names the province, its position and where the colour maps came from. Empty **Place** to set
**Ground** and **North** by hand again.

## Snow

**Snow** puts snow on the tree as the game does in winter, from 0 (none) to 1. On a tree, snow
settles only on the parts that face steeply up. The higher you set **Snow**, the more snow they
take. In the game the amount comes from the map at the tree's place; here you set it.

## The files it reads

Etch takes every file from your playset; a mod's file wins over the game's. The bar names where
each one came from.

| File                                   | What it is for                                  |
| -------------------------------------- | ----------------------------------------------- |
| `.gfx` files                           | Which meshes are map trees (`mapobject_<n>`).   |
| `map/terrain/Tree_tint.bmp`            | The tint, with **Turn**.                        |
| `map/terrain/Tree_season.bmp`          | The season colour, with **Date** and **North**. |
| `map/seasons.txt`                      | The tree and map seasons, for **Date**.         |
| `map/default.map`, `map/positions.txt` | The province's place on the map, for **Place**. |
| `map/terrain/colormap_*.dds`           | The map's colour in each season, for **Place**. |

When a file is missing or cannot be read, the box under the bar names it, and the preview draws
the tree without it. Without the tint map there is no **Turn**; without the season map, no **Date**
and **North**.

## What it doesn't do

- It does not give the tree the random height and turn that the game gives each tree on the map.
  You turn the tree yourself; **Turn** changes only its tint.
- It does not take **Snow** from the map; you set it.
- It draws a tree as a plain mesh when it cannot tell it is a map tree: when Etch does not find
  the game (see [Where Etch finds the game](../getting-started/finding-the-game.md)), or when you
  open a copy of the mesh from outside your playset's folders.
