---
title: Problems
description: What the preview's warnings in the Problems panel mean, and what to do about each one.
clip: problems
---

While the preview is open, Etch checks your window against your
[playset](../reference/glossary.md#playset), the mods loaded with yours, and lists what it finds
in VS Code's Problems panel (<kbd>Ctrl+Shift+M</kbd>). Each entry sits on the line it is about and
names Etch as its source. Click an entry to go to that line.

## What Etch checks

- the `.gui` file of the [previewed window](preview.md);
- each `.gui` or `.gfx` file you change while the preview is open.

It checks them as you type, against the game and every mod of your
[playset](../getting-started/finding-the-game.md). A sprite defined in a mod your mod depends on
counts. A sprite defined only in a mod outside your playset does not. Closing the preview clears
these entries.

The entries come in two kinds:

- a **warning**: the game is likely to show something other than you meant, or to fail;
- an **information** entry, marked with an "i": something Etch draws differently from the game,
  or does not know for sure.

## Missing sprites, textures and fonts

- "No .gfx file of the playset defines sprite GFX_my_icon." The name is misspelled, or the `.gfx`
  file that defines it is in a mod outside your playset. Fix the name, or add that mod to the
  `dependencies` of your `descriptor.mod`.
- "Texture gfx/interface/my_icon.dds is not in the playset." The file is missing, or its path is
  misspelled. Where a `.gfx` file names a `.tga` file, a `.dds` file of the same name counts too,
  as it does for the game.
- "No .gfx file of the playset defines font my_font." Use a font that a `.gfx` file defines, or
  define it.
- A font whose `.fnt` file or texture is missing gets a warning that names the missing file.

## Missing definitions and widgets

- "No .gui file of the playset defines my_scrollbar at top level." A `scrollbartype`, or a
  `parent` that should name a definition written directly in `guiTypes`, names one that no `.gui`
  file of the playset has. Fix the name, or add the definition.
- "my_window has no widget named my_bg." A window's `background`, the `slider`, `track`,
  `leftbutton` or `rightbutton` of a scroll bar, or a `parent` inside a window names a widget
  that is not there. Fix the name, or add the widget.
- "Constant @my_width is not defined in this file." A `@name` value needs its `@name = …` line in
  the same file.

## Names written twice

- "Top-level name my_window is already defined in this file …" Rename one of the two. At startup
  the game keeps one of them at random, and reloading the file can crash the game.
- A sprite defined again, in the same file or another, gets an information entry: the game uses
  the one loaded last, and the entry says which that is.
- A font defined again gets an information entry too. Etch uses the first one; which one the game
  uses is not known.

## Text

These warnings are about a text the preview draws, from the `.gui` file or from your
localisation. When the text comes from your localisation, the entry ends with "in the localisation
of" and the key.

- "The font has no glyph for U+…" The text's font has no letter for that character (U+… is the
  character's code number). Use another font, or another character.
- "Character U+… is not in Windows-1252." The game's fonts have letters only for the characters
  of Windows-1252, and this one is not among them. See [Encoding](../scripts/encoding.md).
- "Unknown text colour §x." No `textcolors` block of the playset's `.gfx` files defines that
  letter after `§`. A `§` at the very end of a text gets "Colour code § at the end of the text."
- "No sprite GFX_text_my_key for the text icon £my_key£." Define the sprite, or fix the key.
  The same goes for a font icon written with `¤`.

## Kinds and files Etch cannot draw

- "my_widgetType is not a widget kind vanilla EU4 1.37.5 uses; Etch does not draw it." The same
  goes for a sprite kind. Check the spelling of the block's name.
- "Texture gfx/interface/my_icon.dds cannot be drawn: …" and similar entries mean that a texture
  or `.fnt` file is there, but Etch cannot read it. The entry says why. Save the file again from
  your image editor.

## Where the preview differs from the game

These are information entries. They tell you where the preview may differ from the game:

- a sprite whose shader Etch does not have is drawn with Etch's default shader;
- a widget whose `orientation` is not one the game lists is anchored at the upper left;
- a widget's `rotation` and `origo` are not applied;
- a name that matches only when upper and lower case are ignored: Etch does not know whether the
  game ignores case there.

## Problems of your window profile

A mistake in your mod's [window profile](../reference/glossary.md#window-profile),
`.etch/profiles/<window>.jsonc`, is an error in the Problems panel, on its line. Etch leaves that
entry of the profile out and draws the rest. See [Views and window profiles](views.md).

Problems with finding the game or the mods of your playset are not in the Problems panel. They
show as a notice above the window: see
[Where Etch finds the game](../getting-started/finding-the-game.md).

## Other checks in Problems

Other parts of Etch list what they find in the same panel:

- [Province IDs and names](../scripts/province-ids-and-names.md) that the game does not check and
  can crash on;
- [Encoding](../scripts/encoding.md): where the game would read other letters than VS Code shows;
- the lines the [live game](../reference/glossary.md#live-game), EU4 running beside the editor,
  writes to its `error.log` after it reloads a file you saved: see
  [Reload on save](../live-game/reload-on-save.md);
- the widgets the preview places or shows differently from the live game: see
  [Snapshot and compare](../live-game/snapshot-and-compare.md).

## What it doesn't do

- The preview checks only while it is open, and only the previewed window's file and the `.gui`
  and `.gfx` files you change. Other files get no entries from it.
- An entry that says "unverified" describes a case that has not been checked against the game.
