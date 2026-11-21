---
title: Etch 1.x
description: What Etch 2.0.0 replaced from Etch 1.x, and how to stay on 1.0.x if you need it.
---

Etch 2.0.0, released on 1 November 2026, replaced two parts of Etch 1.x, the game host and its
diff view (described below), with the [live game](../reference/glossary.md#live-game): the game
itself, which you play beside the editor. If you need the two parts, you can stay on Etch 1.0.x.

## What 1.x had

- **The game host.** Etch 1.x started a hidden copy of the game, which stayed in its main menu
  behind VS Code. It drew the window you edited, and drew it again when you changed the file. A
  switch in the preview showed either Etch's own drawing or the game's. The game only drew the
  window: the game's code that fills it never ran, so lists and texts such as a province's name
  stayed empty.
- **The diff view.** It laid the difference between those two pictures over the preview, pixel by
  pixel: the pixels both drew the same in grey, those they drew differently in red, those only
  Etch drew in blue and those only the game drew in yellow.

The [v1 specification](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/v1.md),
Etch's design document for 1.x, describes everything Etch 1.x does.

## What replaced them

- **The live game** is the game itself, started with your mod and the mods it needs. You play it
  beside the editor, and a window's `.gui` file, a localisation file or a texture you save is
  reloaded into the game's own window, with its real data. See
  [Start and stop](../live-game/start-and-stop.md) and
  [Reload on save](../live-game/reload-on-save.md).
- **Pick mode** takes you from a widget in the game to where it is written in your files, and
  **live snapshots** bring the texts and states the game shows into the preview. See
  [Pick mode](../live-game/pick-mode.md) and
  [Snapshot and compare](../live-game/snapshot-and-compare.md).
- The preview gained [views](../reference/glossary.md#view), the different ways the game shows
  one window, such as for your own province or a foreign one. They come from
  [window profiles](../reference/glossary.md#window-profile). It also gained
  [sample data](../reference/glossary.md#sample-data), stand-in texts such as a province's name,
  which can come from a save. See [Views and window profiles](../interface-windows/views.md) and
  [Sample data](../interface-windows/sample-data.md).
- Since 2.7.0, **Etch: Compare with Live Game** lists every widget the preview places or shows
  otherwise than the game. See [Accuracy](accuracy.md).

The first time Etch 2 starts, it removes the game host's files from Etch's storage and tells you
so once. Your game folder, your EU4 profile (usually in Documents) and your mods are not changed.

## Stay on 1.0.x

1. Open the Extensions view in VS Code and find Etch.
2. In Etch's gear menu, choose **Install Specific Version…**, then a 1.0.x version.
3. In the same gear menu, turn off automatic updates for Etch, so that VS Code does not update it
   to 2.x again.

## What it doesn't do

- Etch 1.0.x got only bug fixes, and none since 2.0.0.
- Etch 1.0.x has none of Etch 2's features: no live game, pick mode, live snapshots, views or
  sample data, and nothing the later 2.x releases added
  ([changelog](https://github.com/happy-dwarf-team/etch/blob/main/CHANGELOG.md)).
- Etch 2 cannot show the game host or the diff view.
