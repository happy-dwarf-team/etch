---
title: Hovers and links
description: Check and open the textures, meshes, animations, sprites and fonts your files name, and pick font colours, from the editor.
since: 2.13.0
clip: hovers
---

Etch turns the names of textures, meshes, animations, sprites and fonts in your files into hovers
and links. Hover over a name to see what the game will load; <kbd>Ctrl</kbd>+click it to open that
file. Font colours in `.gfx` files get a colour picker.

## Paths in .gfx and .asset files

In `.gfx` and `.asset` files, every texture (`.dds`, `.tga`), mesh (`.mesh`) and animation
(`.anim`) path is a link. <kbd>Ctrl</kbd>+click it to open the file your
[playset](../reference/glossary.md#playset) (the game, your mod and the mods it depends on) loads:

- your mod's file, when it has one, instead of the game's;
- for a `.tga` path, the `.dds` of the same name when there is one, even when the `.tga` exists
  too. The game draws the `.dds` in that case, and Etch does the same.

A texture opens in the [texture preview](texture-preview.md), a mesh in the
[mesh preview](mesh-preview.md). A path your playset does not have gets no link: its hover says
"Not in the playset" and names the files Etch looked for.

## A file name without a folder

Some lines name a file without its folder. Etch looks for it where vanilla keeps such files:

- In a `pdxmesh`, beside the mesh its `file` names. In `interface/assets/dharma_mapitems.gfx`,
  `texture_diffuse = "trade_node_hub_01_diffuse.dds"` leads to the texture in
  `gfx/models/Mapitems/dharma`, beside `trade_node_hub_01.mesh`.
- Elsewhere, such as an animation's `file` in an `.asset` file, beside the `.asset` file. In
  `gfx/models/Units/animation/animation.asset`, `file = "polearm_twohanded_idle.anim"` leads to
  the animation in that same folder.

Etch looks in that folder through your playset, so a mod's file there wins over the game's.

## What the hovers show

Each hover first gives the path Etch found and where it comes from: the game, a mod's name, or
"beside this file" for a file outside your playset. Then:

- A texture shows itself, small, with its size, its format, its mip levels (the smaller copies
  the game uses when it shows the texture small) and whether it uses its alpha (the see-through
  part), as the [texture preview](texture-preview.md) lists them.
- A mesh lists its shapes, vertices (corner points), triangles and bones (its skeleton), its
  shaders (the way the game paints each part, see [Mesh preview](mesh-preview.md)) and its colour
  textures. Below, a small picture shows the mesh with those textures, found beside it; a part
  whose texture is missing is grey. A mesh with levels of detail is drawn at its most detailed
  level.
- An animation gives its frames, its speed, its length in seconds and how many joints (bones) it
  moves.

A file Etch cannot read says why in its hover.

## Sprites in .gui files

In `.gui` files, hover over the sprite name after `spriteType`, `quadTextureSprite` or a list's
`background` to see the sprite the game draws. For `spriteType = "GFX_provinceview_bg"` in
`interface/provinceview.gui`, the hover shows:

- the sprite's kind, such as `spriteType`, and its number of frames when it has more than one;
- the `.gfx` file and the mod that define it, here `interface/provinceview.gfx` of the game. When
  several files define it, the hover says how many: the one loaded last wins, as in the game;
- its texture, `gfx/interface/provinceview_bg.dds`, with its size and format and a picture of it
  on a grey checkerboard, so that you see which parts are transparent.
  - For a strip of frames, such as a button's normal, hover and pressed looks side by side in one
    texture, the picture shows every frame, left to right, and a line under it says so, such as
    "Frames 1 to 3, left to right, at 2×." Many frames wrap onto up to four rows; when even that
    is not enough, the line says how many of them the picture shows.
  - A small frame, at most 64 pixels on its longest side, is shown at twice its size (2×), with
    its pixels kept sharp. A frame over 128 pixels is shown smaller.

To open the `.gfx` file at the sprite's name, press <kbd>F12</kbd> on the name, or
<kbd>Ctrl</kbd>+click it (**Go to Definition**). With CWTools on, CWTools may open it instead:
see [Etch and CWTools in the same file](../getting-started/install.md#etch-and-cwtools-in-the-same-file).

A sprite name that no `.gfx` file of your playset defines gets no hover in a `.gui` file: the
[Problems panel](../interface-windows/problems.md) warns about it instead.

## Sprites in script files

The same hovers and **Go to Definition** work on the sprite names of these script files:

- an event's `picture`, such as `picture = MERCHANTS_TALKING_eventPicture` in
  `events/Republics.txt`. A conditional picture works too:
  `picture = { trigger = { … } picture = … }`;
- a mission's `icon`, in the `missions` folder;
- an estate privilege's `icon`, such as `icon = privilege_grant_autonomy` in
  `common/estate_privileges/0002_rajput_privileges.txt`;
- in these folders of `common`, the keys the game reads as sprite names:

  | Folder | Key |
  | --- | --- |
  | `church_aspects` | `sprite` |
  | `federation_advancements` | `gfx` |
  | `government_mechanics` | `alert_icon_gfx` at the top of a mechanic, and `icon` of each power inside its `powers` |
  | `holy_orders` | `icon` |
  | `professionalism` | `marker_sprite` |
  | `religions` | `picture` of a religious school (the base game's seven Muslim schools, such as Hanafi) |
  | `religious_conversions` | `map_icon` |
  | `subject_types` | `sprite`, `diplomacy_overlord_sprite`, `diplomacy_subject_sprite` |
  | `tradecompany_investments` | `sprite` |
  | `trading_policies` | `button_gfx` |

In a script file, a name with no sprite in your playset's `.gfx` files says so in its hover.

## Sprites of DLCs

Etch reads the `.gfx` files and textures of the DLCs in the game folder too (see
[The DLCs](../getting-started/finding-the-game.md#the-dlcs)). For example, hover over
`picture = ANGLICAN_SERMON_eventPicture`, an event picture from Rule Britannia. You see the
picture, as for any other sprite. Where the hover would name a mod, it names the DLC:
"Defined in `interface/eventpictures_rb.gfx` — Rule Britannia".

**Go to Definition** on such a sprite opens the DLC's `.gfx` file, read-only, at the line that
defines the sprite. **Find All References** lists the DLC's files too. **Rename Symbol** does not
rename a name that a DLC defines or uses: it shows a "Not renamed" message, as for the game's own
names (see [Rename a sprite](#rename-a-sprite)).

## See sprites beside the line numbers

Etch can show a small picture of each sprite beside the line numbers, so you see a whole file's
icons and event pictures without hovering. It is off by default. To turn it on:

1. Open [Settings](../reference/settings.md) and search for `etch.editor.spriteThumbnails`.
2. Tick its checkbox.

Each line of a `.gui` file, or of a script file listed under
[Sprites in script files](#sprites-in-script-files), that names a sprite then shows the sprite's
picture beside its line number. If a sprite has several frames side by side (a strip), you see
the first frame. When a line names several sprites, you see the first one that has a picture.

The pictures update about half a second after you stop typing, and when you save a `.gfx` file.
You don't need to restart VS Code. You can turn them on for one folder only, in the **Workspace**
or **Folder** tab of Settings.

## Find every use of a sprite

Put the cursor on a sprite name and press <kbd>Shift+F12</kbd> (**Find All References**). The
name can be in a `.gfx` file, after `name`, or in a `.gui` or script file, as above. A list opens
with every place your playset's files write that name: the `.gfx` file that defines it, the `.gui`
files, and the script files listed under [Sprites in script files](#sprites-in-script-files)
that use it. Etch finds the name whatever
its capital letters, as the game does.

## Rename a sprite

Your mod's files are the files in the folder you have open in VS Code. Open your mod's folder,
put the cursor on a sprite name and press <kbd>F2</kbd> (**Rename Symbol**). Type the new name and
press <kbd>Enter</kbd>. Etch changes the name in your mod's `.gfx` file, and in every `.gui` file
and script file of your mod that uses it (the script files listed under
[Sprites in script files](#sprites-in-script-files)). Files that were not open are
changed too and left unsaved: save them to keep the change.

Etch does not rename a sprite when that would leave the old name somewhere. It shows a message
that starts with "Not renamed", says why, and changes nothing. That happens when:

- another mod of your playset defines or uses the name. One such file is enough: it would keep the
  old name, and its windows would lose the sprite;
- the game defines or uses the name;
- your mod's `.gfx` files do not define the sprite;
- a `.gui` file of your mod writes the name as an `@` constant: `spriteType = @badge`, with
  `@badge = "GFX_x"` set at the top of the file. Change the constant by hand instead;
- the new name is already a sprite of the playset, or uses anything but letters, digits, `_`, `.`
  and `-`.

## Turn off references and rename

**Find All References** and **Rename Symbol** on sprite names are on by default. To turn both off,
open [Settings](../reference/settings.md), search for `etch.editor.rename` and clear its checkbox.
Etch then offers neither command on sprite names. Do this if another extension already finds or
renames sprite names in these files, and you want its answers to stand alone.

Set it in the **User** tab of Settings: it cannot be set for one folder. To get the commands back,
tick the checkbox again. You don't need to restart VS Code.

## Fonts in .gui and .gfx files

In `.gui` files, hover over the font name after `font` or `buttonFont` to see the font. For
`font = "vic_22"` in the base game's `interface/provinceview.gui`, the hover shows:

- the `.gfx` file and the mod that define the font, here `interface/core.gfx` of the game. When
  several files define it, the hover says how many: Etch uses the first one it loads;
- its `path`, `gfx/fonts/vic_22`, and its colours: `color`, and `border_color` when it has one,
  each with a small square of the colour and its `0x` value (see
  [Font colours in .gfx files](#font-colours-in-gfx-files));
- its letters file (`.fnt`), with how many characters it has and its line height, and its
  texture, with its size and format;
- a line of sample text, `Aa Bb Cc 0123`, drawn in the font and its colour. A small font, with
  lines at most 16 pixels high, is shown at twice its size (2×). When the font has no letter for
  some of the sample's characters, a line under the picture says how many.

A font whose `.fnt` file or texture your playset does not have says "Not in the playset" and
names the file Etch looked for.

To open the `.gfx` file at the font's name, press <kbd>F12</kbd> on the name, or
<kbd>Ctrl</kbd>+click it (**Go to Definition**). With CWTools on, CWTools may open it instead:
see [Etch and CWTools in the same file](../getting-started/install.md#etch-and-cwtools-in-the-same-file).

The same hover and **Go to Definition** work in `.gfx` files, on the `font` of the texts the game
shows over the map, such as `font = "Main_14_bold"` in an `animatedmaptext` of
`interface/core.gfx`.

A font name that no `.gfx` file of your playset defines gets no hover in a `.gui` file: the
[Problems panel](../interface-windows/problems.md) warns about it instead. In a `.gfx` file, its
hover says there is no font of that name.

## Font colours in .gfx files

In a `.gfx` file, the `bitmapfonts` block lists the game's fonts. Each font colour in it shows a
small square of its colour in front of it:

- a `textcolors` entry (a named colour the font's text can use), such as `G = { 0 255 0 }`: red,
  green and blue, each from 0 to 255;
- a font's `color` and `border_color`, such as `0xffcc8800`: `0x`, then two digits each for
  opacity (`ff`), red (`cc`), green (`88`) and blue (`00`).

Hover over the square to open VS Code's colour picker. Etch writes the colour you pick in the same
form: three numbers in braces, or `0x` and eight digits. A `{ R G B }` colour has no opacity, so
Etch writes only the three numbers and drops any opacity you set.


## What it doesn't do

- Etch does not check which DLCs you own: it reads every DLC in the game folder that the game's
  launcher has not turned off. A player without a DLC does not see its pictures.
- 54 of the base game's event pictures are defined by no `.gfx` file, in the game folder or in a
  DLC. Their hover says there is no sprite of that name. This is a gap of the game itself: there
  is nothing to fix in your mod.
- In script files, only the keys listed under [Sprites in script files](#sprites-in-script-files)
  get sprite hovers. An `icon` elsewhere in `common` is not always a sprite: a government
  reform's `icon`, for example, names a texture file. So those get no hover.
- Each key is read only where the base game writes it: a `sprite` nested deeper in a subject
  type, for example, gets no hover.
- A file shows at most 500 pictures beside its line numbers, on its first 500 lines that get one.
  A line gets none when Etch finds no texture for its sprite, as with a missing sprite.
- **Find All References** and **Rename Symbol** work only on sprite names, not on texture paths,
  fonts or widget names.
- When several `.gfx` files define a font, the font hover and **Go to Definition** use the first
  one Etch loads, as the preview does. Which one the game uses is not checked yet.
- The font sample is drawn by Etch, not by the game: it shows the font's letters and colour, not
  the exact look of a text box in the game.
- Colours elsewhere in `.gfx` files, such as in `objectTypes` or written as decimals like
  `{ 0.0 0.5 0.0 }`, get no square. A `textcolors` entry with a number above 255 gets none either.
- Sprite and font hovers, **Find All References**, **Rename Symbol** and paths with a folder need
  the game folder. When Etch does not find the game (see
  [Where Etch finds the game](../getting-started/finding-the-game.md)), sprite and font names get
  no hover,
  Find All References finds nothing, a rename says "Etch cannot read the playset", and a path with
  a folder is "Not in the playset".
