---
title: Settings
description: Open Etch's settings, choose user or workspace settings, and find the ones to set first.
---

Etch's settings are in VS Code's Settings, under **Etch**. Most people need none of them: Etch
finds the game through Steam, and previews with your mod and the mods its descriptor names as
`dependencies`.

## Open Settings

1. Press <kbd>Ctrl+,</kbd>, or choose **File › Preferences › Settings**.
2. Type "etch" in the search box at the top: Etch's settings show under **Etch**.

## User and workspace settings

Settings has two tabs, **User** and **Workspace**:

- A **User** setting counts for all your mods, whichever folder you open in VS Code.
- A **Workspace** setting counts only for the mod folder you have open now. VS Code keeps it in a
  `.vscode` folder inside that folder. It wins over the same setting in **User**.

The game folder is usually the same for all your mods, so `etch.gamePath` fits in **User**. Each
mod has its own [playset](glossary.md#playset), so `etch.playset` fits in **Workspace**.
`etch.liveGame.pickModeKey`, the key that turns [pick mode](glossary.md#pick-mode) on and off,
can be set only in **User**. In pick mode, a click on a widget in the game opens where it is
written.

## Settings to set first

Set these two when Etch does not find what you need on its own:

- `etch.gamePath`: the game folder, the one that holds `eu4.exe`, when Etch does not find it
  through Steam, for example a GOG game.
- `etch.playset`: the mods to preview with, in load order, when you need other mods than yours
  and the ones its descriptor names under `dependencies`.

[Where Etch finds the game](../getting-started/finding-the-game.md) explains both.

The list of every Etch setting follows.
