---
title: Glossary
description: Etch's own words in plain words, each with the page that explains it.
---

Etch uses a few words of its own. Here they are in plain words, each with the page that tells you
more.

## By hand

A widget you showed or hid yourself in the Widget Outline, or chose from a set of alternatives
that the game shows one at a time, instead of leaving it to the view (the way the game shows the
window). The preview marks it "by hand" and counts it in the label of **View ▾**, such as
"Own province · 1 by hand". See [Views and window profiles](../interface-windows/views.md).

## Coverage survey

A check by Etch's team of every screen a player can open, in the base game and in Anbennar: each
screen is captured from the game and compared with the preview. It shows how much of the game the
preview gets right. Unlike the precision corpus, a release does not have to pass it. See
[Accuracy](../about/accuracy.md).

## Diff view

In Etch 1.x, a way to show the previewed window as the difference, pixel by pixel, between Etch's
drawing and the game host's. Etch 2.0.0 removed it. See [Etch 1.x](../about/etch-1x.md).

## Game host

In Etch 1.x, a hidden copy of the game that drew the previewed window. Etch 2.0.0 replaced it with
the live game. See [Etch 1.x](../about/etch-1x.md).

## Layer

One of several places a value can come from, stacked so that the top one wins. Sample data has
layers: the texts you type by hand on top, then a live snapshot, a save, the game's and your mod's
files, and last, stand-in text that Etch makes up (**Generated**). **Data ▾** in the preview shows
them. Your playset is stacked the same way: each mod lies over the game, and a later mod's file
wins. See [Sample data](../interface-windows/sample-data.md).

## Live difference

A widget that the offline preview puts in another place than the live game does, or shows where
the game hides it, or the other way round. **Etch: Compare with Live Game** lists them in the
Problems panel. See [Snapshot and compare](../live-game/snapshot-and-compare.md).

## Live game

A copy of the game that Etch starts with your mod's playset, from its private install. You play
it, and most `.gui` files, localisation files and textures you save in VS Code are reloaded into
the running game; other files need a [planned restart](#planned-restart). See
[Start and stop](../live-game/start-and-stop.md).

## Live snapshot

What the live game showed in one window at one moment: its texts, which widgets were visible, and
their states, such as whether a button could be clicked or a box was ticked. A click in pick mode
takes one, and so does **Etch: Snapshot from the Live Game**. The preview uses it as a layer of its
sample data, above saves and files, until a newer one replaces it. See
[Snapshot and compare](../live-game/snapshot-and-compare.md).

## Offline preview

The preview Etch draws from the files of the game and your mods, with no game running. See
[Snapshot and compare](../live-game/snapshot-and-compare.md).

## Pick mode

A mode of the live game in which the widget under the pointer is outlined with its name, and a
click opens where it is written in VS Code instead of acting in the game. <kbd>Ctrl+Shift+E</kbd>
(by default) or **Etch: Toggle Pick Mode** turns it on and off. See
[Pick mode](../live-game/pick-mode.md).

## Pin

Keeps the preview on one window while you edit other files. Click **Pin** in the preview, or run
**Etch: Pin or Unpin the Previewed Window**. See [Preview](../interface-windows/preview.md).

## Planned restart

A restart of the live game that Etch asks you for when you save a file the game cannot reload
while it runs, such as `countryview.gui` or a `.gfx` file. Only after you click **Restart now** does
Etch save your game, start it again and load that save, so you lose no play. See
[Reload on save](../live-game/reload-on-save.md).

## Playset

The mods Etch previews and plays with, in load order, on top of the game and its DLCs: your mod
and the mods its descriptor names as `dependencies`, or the list in `etch.playset`. A later mod's
file wins over an earlier mod's, and any mod's file wins over a DLC's. See
[Where Etch finds the game](../getting-started/finding-the-game.md).

## Precision corpus

The fixed set of game screens that Etch's team captured from the game, to measure how closely the
preview matches it. A release ships only when the preview passes it. The sizes that **Etch: Choose
the Preview Resolution** offers, from 1280×720 to 3840×2160, are the corpus's sizes; 3840×2160 has
not been compared with the game. See [Accuracy](../about/accuracy.md).

## Previewed window

The window the preview shows: the outermost window around the line your cursor is on in your
`.gui` file, or the one you pinned. See [Preview](../interface-windows/preview.md).

## Private install

Etch's own copy of the game, in the extension's storage, in which the live game runs. It has its
own saves, and it never writes to your game folder, your own saves and settings, or your mods.
See [The private install](../live-game/private-install.md).

## Sample data

Stand-in values for the texts the game's code fills, such as a province's name or its
development, so the preview can show a believable window. They come from texts you type, a live
snapshot, a save, the game's and your mod's files, or generated text. See
[Sample data](../interface-windows/sample-data.md).

## Script profile

The file in which Anvil's script profiler writes how long your triggers and effects took, grouped
by what they belong to. Anvil loads plugins into EU4. A script profile has nothing to do with a
window profile. See [Script profile](../scripts/script-profile.md).

## Selector

One of the things that decide which view of a window the game shows, such as the screen height,
whose province it is, or which tab is open. **View ▾** in the preview lists each selector with
where its value comes from. See [Views and window profiles](../interface-windows/views.md).

## View

One way the game shows a window: which of its parts are visible. The province view of your own
province and of a foreign one are two views of `provinceview`. See
[Views and window profiles](../interface-windows/views.md).

## Widget

One element of a `.gui` file, such as a `windowType`, an `iconType`, a `guiButtonType` or an
`instantTextBoxType`. The box that shows a province's name in `provinceview.gui`, `provincename`,
is one. See [Widget Outline](../interface-windows/widget-outline.md).

## Widget Outline

A list in VS Code's Explorer of the previewed window's widgets. Its eye buttons show or hide a
widget by hand, and its circle buttons pick one of a set of alternatives that the game shows one
at a time. See [Widget Outline](../interface-windows/widget-outline.md).

## Window profile

What Etch knows about a game window beyond its `.gui` file: its views, when the game shows each
of them, and where the texts the game's code fills come from. Etch has profiles for
`provinceview` and other windows, and your mod can add its own in its `.etch/profiles` folder. See
[Views and window profiles](../interface-windows/views.md).
