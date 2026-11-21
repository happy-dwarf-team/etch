---
title: Hovers and links
description: Check and open the textures, meshes, animations and sprites your files name, and pick font colours, from the editor.
since: 2.13.0
clip: hovers
---

Etch turns the names of textures, meshes, animations and sprites in your files into hovers and
links. Hover over a name to see what the game will load; <kbd>Ctrl</kbd>+click it to open that
file. Font colours in `.gfx` files get a colour picker.

## Paths in .gfx and .asset files

In `.gfx` and `.asset` files, every texture (`.dds`, `.tga`), mesh (`.mesh`) and animation
(`.anim`) path is a link. <kbd>Ctrl</kbd>+click it to open the file your
[playset](../reference/glossary.md#playset) (the game, your mod and the mods it depends on) loads:

- your mod's file, when it has one, instead of the game's;
- for a `.tga` path when only a `.dds` of that name exists, that `.dds`, as the game does.

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
- its texture, `gfx/interface/provinceview_bg.dds`, with its size and format and a small picture.
  For a strip of frames the picture is the first frame.

To open the `.gfx` file at the sprite's name, press <kbd>F12</kbd> on the name, or
<kbd>Ctrl</kbd>+click it (**Go to Definition**).

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

- Etch does not read the game's DLC archives, which define many vanilla event pictures. The hover
  of such a picture says it has no sprite.
- In script files, only the keys listed under [Sprites in script files](#sprites-in-script-files)
  get sprite hovers. An `icon` elsewhere in `common` is not always a sprite: a government
  reform's `icon`, for example, names a texture file. So those get no hover.
- Each key is read only where the base game writes it: a `sprite` nested deeper in a subject
  type, for example, gets no hover.
- **Find All References** and **Rename Symbol** work only on sprite names, not on texture paths,
  fonts or widget names. They do not see the DLC archives either: a rename cannot warn about a
  DLC file that uses the name.
- Colours elsewhere in `.gfx` files, such as in `objectTypes` or written as decimals like
  `{ 0.0 0.5 0.0 }`, get no square. A `textcolors` entry with a number above 255 gets none either.
- Sprite hovers, **Find All References**, **Rename Symbol** and paths with a folder need the game
  folder. When Etch does not find the game (see
  [Where Etch finds the game](../getting-started/finding-the-game.md)), sprite names get no hover,
  Find All References finds nothing, a rename says "Etch cannot read the playset", and a path with
  a folder is "Not in the playset".
