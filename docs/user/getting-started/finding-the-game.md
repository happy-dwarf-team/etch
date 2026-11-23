---
title: Where Etch finds the game
description: How Etch finds your game folder and your EU4 profile, which mods it loads with yours, and which language it shows.
---

Etch draws with your game's own files. So it first finds the game folder, then the mods to load
with yours, the **playset**. Most of the time it finds both by itself.

## The game folder

If EU4 is installed through Steam, Etch finds it by itself, in whichever Steam library folder
holds it (its `steamapps/common/Europa Universalis IV` folder).

If Etch does not find it, or you want another copy of the game, such as a GOG copy:

1. Open the settings (<kbd>Ctrl+,</kbd>) and search for `etch.gamePath`.
2. Type the full path of the game folder, the folder that holds `eu4.exe`. An open preview then
   loads the game from that folder and draws again.

Etch only reads this folder. When something is wrong, a notice above the window in the preview
says what:

- EU4 was not found in Steam's libraries: set `etch.gamePath`.
- The folder in `etch.gamePath` has no `eu4.exe`: set it to the game folder.
- The `eu4.exe` is not the Steam build of EU4 1.37.5, for example another version or a GOG copy:
  the preview still works, but Etch has been checked only against 1.37.5, so it may draw some
  things differently from your game.

The same notices are written to Etch's log: **View › Output**, then **Etch** in the list at the
top right of the panel.

## Your EU4 profile

Etch also reads your EU4 profile, the folder where the game keeps your `settings.txt`, your saves
and the mods of its `mod` folder. It finds it the way the game does: usually
`Documents/Paradox Interactive/Europa Universalis IV`, or
`Documents/Paradox Interactive/Europa Universalis IV GOG` for a GOG copy, unless the game folder's
`userdir.txt` names another folder. Etch finds your Workshop mods in the Steam library folder that
holds the game.

## The playset

The playset is the list of mods loaded on top of the game, in order. As in the game, a later
mod's file wins over the same file of an earlier one. It is not the playset you chose in the
game's launcher: Etch does not read that one.

By default the playset is your mod and what it needs:

1. the mods listed under `dependencies` in your mod's descriptor, and the mods those list in
   turn. Each one is loaded before the mod that lists it;
2. your mod, last.

Etch looks for each dependency, by its name or its Workshop number, among your Workshop mods and
the mods in the `mod` folder of your EU4 profile. When it cannot find one, a notice says so, and
Etch loads the other mods without it.

Your mod is the mod whose folder holds the file you edit, among the mods in your profile's `mod`
folder and your Workshop mods. If none of them holds it, Etch takes the first folder with a
`descriptor.mod`, going up from the file's folder. If there is none either, Etch previews the open
folder as a mod without dependencies and says so in a notice. To fix that, add the mod in the
game's launcher, or set `etch.playset`.

When you edit the game's own files in the game folder, the preview shows the base game alone.

### The DLCs

Many of the game's files are not in the game folder itself but in its DLCs: in the zip files
of the `dlc` and `builtin_dlc` folders. Many of the base game's event pictures are there, for
example. Etch reads those zip files where they are, as the game does, and unpacks nothing.

When two places have a file of the same name, the later one wins. The order is the game folder,
then the DLCs, then your playset's mods. So a DLC's file wins over the game folder's, and a mod's
file wins over a DLC's.

Etch reads every DLC in the game folder except the ones you turned off in the game's launcher.
You turn DLCs on and off there as usual: the launcher keeps the list in `dlc_load.json`, in
[your EU4 profile](#your-eu4-profile), and Etch reads it from there. After you turn a DLC on or
off, reload VS Code (**Developer: Reload Window**) to see the change.

Etch does not check which DLCs you own. A player without a DLC does not see its pictures, so a
window of your mod that uses one looks different for them.

A DLC's file opens read-only, like the game's own files, so you can't change it by accident.

### Choose the mods yourself

Set `etch.playset` to the mods to load, in load order. Each entry is a mod's name, its folder or
its `.mod` file. Your mod is added last unless the list names it. When the list is not empty, it
replaces the default playset. Write it in the `.vscode/settings.json` of your mod's folder, which
holds the settings of that folder only:

```jsonc
"etch.playset": ["Proper 2K UI Enhanced"]
```

## The language

The setting `etch.language` picks the language of the texts that the preview draws, and of the
[localisation texts](../scripts/localisation-texts.md) in the editor: `english` (the default),
`french`, `german` or `spanish`.

All of Etch's settings are on the [Settings](../reference/settings.md) page.

## What it doesn't do

- It leaves out a mod packed in an archive (a descriptor with `archive=`): Etch reads only mods in
  folders.
- Finding the game and the mods writes nothing: not to your game folder, your EU4 profile or your
  mods.
- A GOG copy works for the preview only. The [live game](../reference/glossary.md#live-game), EU4
  itself started by Etch beside the editor, needs the Steam version of 1.37.5.
