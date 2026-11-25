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

When CWTools is on and its rules check the name after `spriteType` or `quadTextureSprite`,
CWTools warns about a missing sprite there, and Etch leaves its own warning out, so you see one
(see
[Etch and CWTools in the same file](../getting-started/install.md#etch-and-cwtools-in-the-same-file)).
CWTools reads only your workspace and the game, so it also warns about a sprite that only a mod
in your `dependencies` defines. Etch does not.

## Missing definitions and widgets

- "No .gui file of the playset defines my_scrollbar at top level." A `scrollbartype`, or a
  `parent` that should name a definition written directly in `guiTypes`, names one that no `.gui`
  file of the playset has. Fix the name, or add the definition.
- "my_window has no widget named my_bg." A window's `background`, the `slider`, `track`,
  `leftbutton` or `rightbutton` of a scroll bar, or a `parent` inside a window names a widget
  that is not there. Fix the name, or add the widget.
- "Constant @my_width is not defined in this file." A `@name` value needs its `@name = …` line in
  the same file.

## Keys and values the game does not read

Etch checks each widget against the keys EU4 1.37.5 reads for that kind of widget. The game
reads keys in upper or lower case, so `Orientation` and `orientation` are both fine. When
CWTools is on and its rules cover the widgets of `.gui` files, CWTools gives these warnings
instead, and Etch leaves them out (see
[Etch and CWTools in the same file](../getting-started/install.md#etch-and-cwtools-in-the-same-file)).

- "The game does not read sacle in iconType." The key is misspelled, or this kind of widget has
  no such key. The game skips it. Fix the spelling, or move the key to a widget that takes it.
- "The game does not read guiButtonType in containerWindowType. It takes buttonType for this
  widget here." The game creates only some kinds of widget inside each kind of widget. Here it
  never creates the button, so it does not show in the game, and the preview leaves it out too,
  with everything inside it. Use the kind the entry names.
- "The game ignores text in iconType." An `iconType` shows no `text`, `font`, `buttonText` or
  `buttonFont`, and an `instantTextBoxType` ignores `size`. Remove the key, or use a widget that
  shows it.
- "LEFT is not one of the nine anchors the game reads for orientation; the game puts the widget
  at the upper left." Use one of the nine anchors: `UPPER_LEFT`, `UPPER_RIGHT`, `LOWER_LEFT`,
  `LOWER_RIGHT`, `CENTER_LEFT`, `CENTER_RIGHT`, `CENTER`, `CENTER_UP` or `CENTER_DOWN`. A
  `containerWindowType` takes seven: not `CENTER_LEFT` or `CENTER_RIGHT`. The base game writes
  `LEFT` 25 times: those widgets sit at the upper left.
- "The game reads spacing as a whole number: 2.5 is read as 2." The game drops the part after
  the point. Write the whole number you want.
- "The game reads alwaystransparent as yes or no, not maybe." The value is the wrong kind for the
  key: a word where the game wants a number, a block `{ … }` where it wants one value, or the
  reverse. The entry says what the game reads.

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

- "The game reads browserType, but vanilla EU4 1.37.5 does not use it and Etch does not draw
  it." The game shows the widget; the preview leaves it out. Keep it if you meant it.
  A block the game does not read at all gets a warning instead: see
  [Keys and values the game does not read](#keys-and-values-the-game-does-not-read).
- "my_spriteType is not a sprite kind vanilla EU4 1.37.5 uses; Etch does not draw it." Check the
  spelling of the block's name.
- "Texture gfx/interface/my_icon.dds cannot be drawn: …" and similar entries mean that a texture
  or `.fnt` file is there, but Etch cannot read it. The entry says why. Save the file again from
  your image editor.

## Where the preview differs from the game

These are information entries. They tell you where the preview may differ from the game:

- a sprite whose shader Etch does not have is drawn with Etch's default shader;
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
- the mistakes the live game finds in your files while it starts: see
  [Start and stop](../live-game/start-and-stop.md#mistakes-the-game-finds-at-the-start);
- the widgets the preview places or shows differently from the live game: see
  [Snapshot and compare](../live-game/snapshot-and-compare.md).

## What it doesn't do

- The preview checks only while it is open, and only the previewed window's file and the `.gui`
  and `.gfx` files you change. Other files get no entries from it.
- An entry that says "unverified" describes a case that has not been checked against the game.
