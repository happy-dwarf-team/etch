---
title: Limits
description: Everything Etch does not do, in one place, each with a link to the page where it matters.
---

Each page of these docs ends with what its feature doesn't do. This page puts all of those limits
in one place, grouped by where you meet them.

## The preview

- You edit in VS Code's own text editor. You cannot move or change a widget in the preview, or in
  the game. See [Preview](../interface-windows/preview.md).
- A window without a [window profile](../reference/glossary.md#window-profile) is drawn with every
  widget at once, and the texts the game's code fills stay as the `.gui` file writes them. A
  window profile is what Etch knows about a window beyond its files: which parts the game shows
  together, and where its texts come from. Etch comes with profiles for the base game, Anbennar,
  Proper 2K UI Enhanced and Anbennar's patch for it.
  See [Views and window profiles](../interface-windows/views.md).
- **Etch: Add Scripted Selectors to the Window Profile** does not work out whether a widget's
  `potential` is true. You set each widget that has a `potential` to shown or hidden yourself, in
  **View ▾**. Only a few simple cases, such as `always = yes`, need no choice from you. See
  [Views and window profiles](../interface-windows/views.md).
- The preview always lays windows out at UI scale 1.0, whatever your game's settings say. See
  [Zoom and resolution](../interface-windows/zoom-and-resolution.md).
- You can pick 3840×2160 for the preview, but that size has not been compared with the game. See
  [Accuracy](accuracy.md).
- Suggestions in `.gui` files list only what some file of your playset writes, and work in `.gui`
  files only, not in `.gfx` files or scripts. See
  [Suggestions in .gui files](../interface-windows/completion.md).

## Saves and sample data

- [Sample data](../reference/glossary.md#sample-data), the stand-in texts the preview shows where
  the game's code fills a window, can come from a save. Etch reads text saves, zipped or not. It
  cannot read ironman saves or other saves in the game's binary format, which is not plain text.
  See [Sample data](../interface-windows/sample-data.md).
- Etch never works out a value the way the game does, such as income or a modifier. A value the
  save does not hold comes from a [live snapshot](../reference/glossary.md#live-snapshot) (what
  the running game showed), or it is generated: stand-in text of a length you choose. See
  [Sample data](../interface-windows/sample-data.md).
- A save or generated text fills only the texts that the window's profile names a source for. A
  live snapshot fills every text the game showed. See
  [Sample data](../interface-windows/sample-data.md).

## The live game

- The [live game](../reference/glossary.md#live-game), Etch's own copy of EU4 that you play beside
  the editor, starts only the Steam build of EU4 1.37.5. It refuses any other `eu4.exe`. See
  [Start and stop](../live-game/start-and-stop.md).
- The live game and your own game cannot run at the same time: Steam counts the live game as your
  EU4 session. Only one live game runs at a time on your PC. See
  [Start and stop](../live-game/start-and-stop.md).
- The live game takes your `settings.txt` and `pdx_settings.txt` at every start. Settings you
  change in the live game are not kept. See [Start and stop](../live-game/start-and-stop.md).
- When you choose a save to start from, ironman saves are greyed out. See
  [Start and stop](../live-game/start-and-stop.md).
- Files you save in VS Code are not reloaded into the game in ironman or multiplayer games. See
  [Reload on save](../live-game/reload-on-save.md).
- Some files cannot be reloaded into the running game: `countryview.gui`, `.gfx` files, fonts,
  `core.gui`, scripted GUIs and any other file the game reads, such as an event or a file in
  `common`. They need a
  [planned restart](../reference/glossary.md#planned-restart): Etch saves your game, starts it
  again and loads that save, but only when you click **Restart now**. See
  [Reload on save](../live-game/reload-on-save.md).
- A file you save is not reloaded into the game when another mod of the
  [playset](../reference/glossary.md#playset) (the mods loaded with yours) has its own copy of it,
  and that copy is the one the game uses. Etch names that mod. See
  [Reload on save](../live-game/reload-on-save.md).
- In [pick mode](../reference/glossary.md#pick-mode), where a click on a widget in the game opens
  where it is written, a file of the base game or of another mod opens read-only. **Override in my
  mod** copies it into your mod for you to edit. See [Pick mode](../live-game/pick-mode.md).
- **Etch: Snapshot from the Live Game** works only while the game has the previewed window (the
  window the preview shows) open. See
  [Snapshot and compare](../live-game/snapshot-and-compare.md).
- **Etch: Compare with the Live Game** compares the window as its file is saved, not your unsaved
  edits. When it has no live snapshot of the window as it is saved now, it tells you what to do.
  See [Snapshot and compare](../live-game/snapshot-and-compare.md).
- Run selection, which runs the script you select in the live game, does not work in ironman or
  multiplayer games. It changes only the live game's own copy of the game, never your own saves.
  See [Run selection](../live-game/run-selection.md).
- When the game cannot read the trigger you selected, **Etch: Check Selection as Trigger in the
  Live Game** answers true. Etch then shows the game's error beside the answer. See
  [Run selection](../live-game/run-selection.md).
- **Etch: Check File in the Live Game** finds only what the game complains about while it reads
  the file, such as a key it does not know. It does not find a value the game cannot use, or a
  trigger or effect in the wrong place. It works only with
  a game loaded, and not in ironman or multiplayer games. See
  [Check File in the Live Game](../live-game/check-file.md).

## Script checks

- A province ID written as a tag, a scope or a variable is not checked. See
  [Province IDs and names](../scripts/province-ids-and-names.md).
- Etch checks the script files you open. To check every file the playset loads, run **Etch:
  Check Province IDs and Names in the Playset**. See
  [Province IDs and names](../scripts/province-ids-and-names.md).
- Idea and idea group names are not checked in a scripted effect's `$argument$`, nor in the values
  you pass to a scripted effect or trigger. `has_idea_group` is not checked, as the game reports
  it in `error.log` itself. A country tag or a scope in `change_graphical_culture` is not checked.
  See [Province IDs and names](../scripts/province-ids-and-names.md).
- A name that crashes the game only in a tooltip is not checked inside a
  `custom_trigger_tooltip`, which shows its own text instead. See
  [Province IDs and names](../scripts/province-ids-and-names.md).
- Etch does not check that a country file exists when its name has a letter such as `ö`, as in
  `Jötunnheim.txt`. See [Province IDs and names](../scripts/province-ids-and-names.md).
- Etch warns about a second history file for a province or a country only when the game has a file
  for it too. Two files from mods, for a province or country that the game has no file for, get no
  warning. See [Province IDs and names](../scripts/province-ids-and-names.md).
- **Etch: Show the Latest Script Profile** needs Anvil 1.22 or newer, which loads plugins into EU4 and
  whose script profiler times your scripts. Etch does not measure scripts itself. See
  [Script profile](../scripts/script-profile.md).
- The script profile page shows the 30 slowest rows of each list; the rest are only in the CSV.
  Script blocks the profiler cannot match to an event, a decision or another owner show as one
  row, **No owner found**. See [Script profile](../scripts/script-profile.md).
- The script profile page finds each name in the playset of your workspace, so a profile measured
  with another playset may not find every name. See [Script profile](../scripts/script-profile.md).

## Encoding

- Etch checks the encoding only of the files you have open, and only of interface files, script
  files and localisation. Other files, such as the `.txt` files of `map`, are not checked. See
  [Encoding](../scripts/encoding.md).
- Etch does not change VS Code's encoding settings, and it does not save the file for you. See
  [Encoding](../scripts/encoding.md).

## Localisation texts

- Etch shows the text of a localisation key after it only on these lines: `text`, `tooltip`,
  `tooltipText` and `delayedTooltipText` in `.gui` files, and `title`, `desc`, `name`, `tooltip`
  and `custom_tooltip` in the script files of `events`, `decisions`, `missions` and `common`. A
  value that no `.yml` file of your playset defines gets no text. See
  [Localisation texts](../scripts/localisation-texts.md).
- A change to a `.yml` file shows in these texts only after you save the file. When Etch cannot
  find the game folder, it shows no texts. See
  [Localisation texts](../scripts/localisation-texts.md).

## Textures and meshes

- The texture preview does not edit textures; use your image editor. See
  [Texture preview](../textures-and-meshes/texture-preview.md).
- A few kinds of `.dds` file do not open, such as a cube map or a BC7 texture. The preview names
  the format instead. See [Texture preview](../textures-and-meshes/texture-preview.md).
- The mesh preview leaves out the map's fog of war and distance fog. It also leaves out the snow
  the game takes from the map: **Snow** sets it by hand instead. Collision shapes are hidden. See
  [Mesh preview](../textures-and-meshes/mesh-preview.md).
- In the game, a map tree's colours depend on where it stands on the map and on a random turn.
  **Turn**, **Ground** and **North** stand in for them; **Place** sets **Ground** and **North**
  from a province you type. See [Map trees](../textures-and-meshes/map-trees.md).
- The entity preview draws particle effects, such as an artillery piece's muzzle flash, in its
  own way: close to the game's, but not the same. See
  [Entities](../textures-and-meshes/entities.md#differences-from-the-game).
- Etch does not check which DLCs you own: it reads every DLC in the game folder that the game's
  launcher has not turned off. A player without a DLC does not see its pictures. See
  [The DLCs](../getting-started/finding-the-game.md#the-dlcs).
- **Find All References** and **Rename Symbol** work only on sprite names. A rename changes only
  your mod's files: Etch refuses it when a file of the base game, a DLC or another mod also uses
  the name.
  See [Hovers and links](../textures-and-meshes/hovers-and-links.md#rename-a-sprite).
- A file shows at most 500 of the pictures beside the line numbers. See
  [Hovers and links](../textures-and-meshes/hovers-and-links.md#see-sprites-beside-the-line-numbers).

## Platform and versions

- Etch needs Windows (x64) and VS Code 1.100 or later. See
  [Install and requirements](../getting-started/install.md).
- Etch is made for EU4 1.37.5. The preview works with another version of the game, but warns
  that Etch's results are only checked against 1.37.5. See
  [Install and requirements](../getting-started/install.md).
- The live game needs the Steam build of 1.37.5. A GOG game works for the preview only. See
  [Where Etch finds the game](../getting-started/finding-the-game.md).
- Etch contains no game files. It needs the game installed, and draws with the game's own
  textures, fonts and localisation. See [Install and requirements](../getting-started/install.md).
- Etch 2 has no game host and no diff view: the live game replaced them in 2.0.0. See
  [Etch 1.x](etch-1x.md).
