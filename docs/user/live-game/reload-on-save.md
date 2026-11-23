---
title: Reload on save
description: Save a file of your mod and see the change in the live game's own window.
clip: reload
---

While the [live game](start-and-stop.md) runs, the game loads again each file you save in your
[playset](../reference/glossary.md#playset) (your mod and the mods it depends on). You see the
change in the game's own window, with the game's real data.

## Save a file

1. Start the live game and open the window you work on, for example a province view.
2. Edit the window's file in VS Code, for example `interface/provinceview.gui`, and save it
   (<kbd>Ctrl+S</kbd>).
3. The game rebuilds the window, and your change shows.

Only saved files go to the game. What you type before you save shows in the preview, not in the
game.

## Files that reload at once

- The `.gui` files of the windows the game rebuilds: the province view, the country view's tabs,
  the ledger, the settings, the event window and the HUD (the top bar, the outliner and the other
  parts around the map).
- Localisation: the `.yml` files in `localisation`. Etch then rebuilds whichever of these windows
  are on screen, so their texts change too.
- Textures: `.dds`, `.tga` and `.png` files. When your image editor writes one into your
  workspace, the game takes the new one.

After `provinceview.gui` reloads, the province view stays on your province and shows its name.
Saving `countrydiplomacyview.gui` closes the declare war window if it is open; a notice asks you to
open it again.

## Files that need a planned restart

The game reads some files only when it starts. When you save one of them, Etch asks for a planned
restart: it saves the game, starts it again and continues that save. These files are:

- `countryview.gui`, `core.gui`, and a `.gui` file in which two widgets directly under `guiTypes`
  have the same name;
- `.gfx` files and fonts;
- the files of `common/custom_gui` and `common/scripted_guis`;
- any other file the game reads, such as an event or a file in `common`;
- a texture you created after the start that the game had already drawn as missing.

Etch also asks for one after ten reloads that rebuild the HUD, and when the game did not rebuild a
window on screen after a reload.

A notice says "Restart needed:" with the file and the reason, and offers **Restart Now** and
**Later**. The status bar shows **Live game: restart needed**. Nothing restarts until you click:

1. Click **Restart Now** in the notice. Or click **Live game: restart needed** in the status bar
   and choose **Restart Now** in its menu.
2. "Restarting the live game" shows while Etch saves, closes the game and starts it again from
   that save.

Until you restart, the game does not reload the files you save; after the restart it reads them
all. If the game does not finish its save within 30 seconds, Etch closes it anyway and continues
the newest save there is.

## Back on your province

After a planned restart, and after a crash, the province view comes back on the province you had
open, unless you have already opened something else yourself. When Etch cannot open it again, for
example a province in terra incognita, the game stays on the map and a notice says why. Etch does
not open the country view again: a notice asks you to open it.

## Game errors in Problems

After each reload, the new lines the game writes to its `error.log` show in the Problems panel on
the file you saved, marked "Etch live game":

- a line that names a line of your file goes on that line;
- a missing sprite goes on the widgets that use it;
- anything else goes on the file's first window.

A line the game repeats shows once, with how many times it came, such as (×12). Etch leaves out
two lines the base game writes on every reload of the province view: they are not about your
file. When the game refuses a reload, Problems says so too.

## A file another mod overrides

If another mod of the playset has the same file, and the game reads that mod's copy, saving yours
reloads nothing. Problems shows a warning on your file that names the mod: "Saving this file
changes nothing in the live game". Files outside the folders the game reads, such as a README or
`.etch/`, change nothing either.

## What it doesn't do

- It does not reload in ironman or multiplayer games. The game refuses, Etch says so once per game,
  and it never goes around the refusal.
- It sends only saved files to the game.
- Files the game reads only at start need a planned restart.
- After a restart it does not open the country view again.
- It never restarts a game you play without your click, except after a crash.
