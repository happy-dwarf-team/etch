---
title: The private install
description: See what Etch's own copy of EU4 holds and never touches, and how to remove it.
---

The private install is Etch's own copy of EU4, with an EU4 profile of its own, that the
[live game](start-and-stop.md) runs from. An EU4 profile is the folder where EU4 keeps settings,
saves and mods; yours is usually `Paradox Interactive/Europa Universalis IV` in your Documents.
Etch creates the private install at the first start, after you click **Create** in "Create the
private install?", and checks it before every start.

## Where it lives

It lives in a folder named `private-install`, inside the folder VS Code keeps for Etch's own files
(the extension's storage). It is not in your game folder, your EU4 profile or your mods.

## What it holds

- Links to the folders of your game folder. A link takes no space: the game's files stay where they
  are, and the private install reads them from there.
- Copies of the files directly in your game folder (not in its subfolders), such as `eu4.exe`.
  "Create the private install?" says how much space they take.
- Its own EU4 profile: copies of your settings, the live game's saves (with the copies of your own
  saves you chose to play), and the mods of your [playset](../reference/glossary.md#playset) (your
  mod and the mods it depends on). It turns on every DLC you own.
- These tools, in the versions that come with Etch:
  - [Anvil](https://anvil.happydwarf.dev/), which lets EU4 load plugins: add-ons to the game's own
    program. The live game runs on it. Etch also loads Anvil's own map and script plugins,
    `anvil-map` and `anvil-script`, so a mod that uses map modes or effects that plugins add, or
    `has_dlc = "anvil:<id>"`, works as in a player's game.
  - [Bellows](https://anvil.happydwarf.dev/plugins/bellows/), which makes the game start faster.
  - [Tongs](https://anvil.happydwarf.dev/plugins/tongs/), which lets Etch read the game's widgets:
    what [pick mode](pick-mode.md) outlines and what a
    [live snapshot](../reference/glossary.md#live-snapshot) (what a window showed at one moment)
    holds. Here it only reads; it takes no input and does not control the game.
  - Etch's own plugin, which reloads the files you save, runs pick mode and Run selection, and saves
    the game before a stop.

## Before every start

Before every start Etch checks the private install and brings it up to date:

- Your `eu4.exe` must be EU4 1.37.5 from Steam, the only version the live game starts. Etch
  refuses any other and says so.
- Anvil, Bellows, Tongs and Etch's plugin must be exactly the files that came with Etch. Etch
  checks this with a fingerprint of each file's contents, and replaces a file that differs with its
  own copy. If Etch's own copy of one of them is damaged, Etch says so and asks you to reinstall
  Etch.
- Etch removes any other plugin it finds in the private install, so nothing else loads into the
  live game.
- Etch updates the links and copies to match your game folder, and copies your settings again.

## What it never touches

The private install never writes to your game folder, your EU4 profile or your mods, and never
changes `eu4.exe`. Its links are only links: removing them deletes nothing from your game folder.

## Remove it

1. If you want to keep a save of the live game, run **Etch: Open the Live Game's Saves Folder**
   and copy it somewhere else first: the live game's saves are inside the private install.
2. Run **Etch: Remove the Private Install**.
3. Etch stops the live game, if it runs, and deletes the private install. A notice says "The
   private install was removed."

The next start asks "Create the private install?" again.

## What it doesn't do

- It does not run any `eu4.exe` other than EU4 1.37.5 from Steam.
- It loads no other Anvil plugin, and no other version of these tools than the one that comes
  with Etch.
- Etch does not remove the private install while another VS Code window runs the live game.
- Etch does not delete a `private-install` folder that holds files it did not make.
