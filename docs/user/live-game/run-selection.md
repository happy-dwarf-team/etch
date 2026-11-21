---
title: Run selection
description: Run an effect or check a trigger in the live game, with the game's errors on your lines.
since: 2.9.0
clip: run
---

Run selection takes the script you select in the editor and runs it in the
[live game](start-and-stop.md), through the game's own console. Use it to try an effect or a
trigger without writing an event that fires it.

## Run an effect or check a trigger

1. Start the live game and load a save, or start a new game.
2. In a script file of your [playset](../reference/glossary.md#playset) (your mod and the mods it
   depends on), such as an event file in `events`, select an effect or a trigger.
3. Run one of these commands from the Command Palette (<kbd>Ctrl+Shift+P</kbd>). While the game
   runs, the editor's right-click menu offers them too, in `.txt` files.

| Command                                               | What it does                                         |
| ----------------------------------------------------- | ---------------------------------------------------- |
| **Etch: Run Selection in the Live Game**              | Runs the effects in your country.                    |
| **Etch: Run Selection in the Province on Screen**     | Runs them in the province you have open in the game. |
| **Etch: Check Selection as Trigger in the Live Game** | Says whether the trigger is true.                    |

With nothing selected, Etch runs what starts on the cursor's line, such as `add_treasury = 100`,
with its whole block when it opens one, such as `capital_scope = { … }`. The editor then selects
what ran. **Etch: Check Selection as Trigger in the Live Game** checks in your country; when a
province is on screen, it asks where: **Your country** or that province.

## An example

Select `add_treasury = 500` and run **Etch: Run Selection in the Live Game**. A notice says "Ran in
your country.", and the treasury in the game's top bar goes up by 500.

Then open your capital's province view in the game, put the cursor on `is_capital = yes` and run
**Etch: Check Selection as Trigger in the Live Game**. Choose the province: the notice says that
the trigger is TRUE there.

## The game's errors in Problems

The lines the game writes to its `error.log` during the run show in the Problems panel, on your
selection:

- a line that names a line of the script, with "near line: 2", goes on that line of your
  selection;
- any other line covers the whole selection.

Every line the game wrote during the run is there, even the ones that are not about your script.
They go away when you edit the file.

A trigger the game cannot read counts as true: the game leaves it out and checks the rest. Etch
then adds a note to the notice. On its own, a typo such as `adm_techh = 5` gives TRUE, with
"Unknown trigger type" in Problems.

If your selection has a `{` without its `}`, or a `}` without its `{`, Etch does not run it: the
game would run a block that never closes, and write nothing about it to `error.log`. A character
that the game's [encoding](../scripts/encoding.md), Windows-1252, does not have becomes `?` when it
runs, and the notice says how many there were.

## Your saves stay as they are

A Run changes only the game you play in the live game, which plays copies of your saves in the
[private install](private-install.md). Your own saves never change. The first Run in each game you
load says so.

A save the live game writes after a Run holds what the Run changed. When you start the live game
again, **Continue** says "written after Run changed the game" if its newest save is one of those.

## What it doesn't do

- It runs only in the live game, with a game loaded: not in the main menu.
- It does not run in ironman or multiplayer games.
- It does not check your script itself: it hands it to the game and shows what the game answers.
- It runs one thing at a time: while the game reloads a file, run the selection again a moment
  later.
- It takes a selection of up to 262,144 characters.
