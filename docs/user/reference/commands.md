---
title: Commands
description: Run Etch's commands from the Command Palette, the preview, right-click menus and keys.
---

Most of what Etch does, you start with a command. In the Command Palette, all of Etch's commands
begin with "Etch:". Etch's own words, such as live game and pick mode, are explained in the
[Glossary](glossary.md).

## Run a command

1. Press <kbd>Ctrl+Shift+P</kbd> to open the Command Palette.
2. Type "Etch": the list shows Etch's commands. Type more of a command's name to narrow it down.
3. Click the command, or press <kbd>Enter</kbd>.

## Other ways to run them

Many commands are also a button, a menu entry or a key:

- **In the preview**: **Live game** runs **Etch: Start the Live Game**, the window list under
  the window's name pins a window as **Etch: Pin or Unpin the Previewed Window** does, and the
  resolution button, which shows the resolution (such as **1920×1080**), runs **Etch: Choose the
  Preview Resolution**. **Data ▾** holds **Compare with
  Live Game**.
- **In the editor's title bar**: in a `.gui` file, the **Open Preview** button at the right of the
  title bar runs **Etch: Open Preview**.
- **In the status bar**, while the live game runs: **Live game** opens its menu, with **Turn Pick
  Mode On**, **Snapshot from the Live Game**, **Restart the Live Game**, **Stop the Live Game** and
  more ([Start and stop](../live-game/start-and-stop.md#the-live-game-in-the-status-bar)).
  **Pick mode**, while pick mode is on, turns it off.
- **In the editor's right-click menu**: in a `.txt` script file, while the live game runs,
  **Run Selection in the Live Game**, **Run Selection in the Province on Screen** and **Check
  Selection as Trigger in the Live Game**.
- **In the Widget Outline**, in the Explorer: the buttons on a widget's row hide or show it
  [by hand](glossary.md#by-hand) (**Hide by Hand**, **Show by Hand**), pick it from a set of
  alternatives (**Choose by Hand**), or let you type its [sample text](glossary.md#sample-data)
  (**Type Sample Text…**). Right-click a text's row for **Type Sample Text…** and **Clear Sample
  Text**. With no `.gui` file open, **Get started** there runs **Etch: Get Started**.
- **On the Get Started page**: each step's button, such as **Start the Live Game**
  ([The Get Started page](../getting-started/install.md#the-get-started-page)).
- **Above an entity** in an `.asset` file: **Preview Entity** previews that entity at once, as
  **Etch: Preview Entity…** does after you pick it from its list.
- **With a key**: in the live game, <kbd>Ctrl+Shift+E</kbd> turns pick mode on and off, as
  **Etch: Toggle Pick Mode** does. You press it in the game's window, and you can choose another
  key with the setting `etch.liveGame.pickModeKey`.

## Commands that appear only when you can use them

Some commands show in the Command Palette only when they can do something:

- **Etch: Pin or Unpin the Previewed Window**, **Etch: Compare with the Live Game** and **Etch: Add
  Scripted Selectors to the Window Profile**: while a preview is open.
- **Etch: Start the Live Game** and **Etch: Remove the Private Install**: while no live game runs.
- **Etch: Stop the Live Game**: while the live game starts, runs or restarts.
- **Etch: Restart the Live Game** and **Etch: Toggle Pick Mode**: while the live game is ready.
  **Etch: Snapshot from the Live Game** too, when a preview is open.
- **Etch: Run Selection in the Live Game**, **Etch: Run Selection in the Province on Screen**,
  **Etch: Check Selection as Trigger in the Live Game** and **Etch: Check File in the Live Game**:
  while the live game is ready, in a `.txt` script file.
- **Etch: Preview Entity…**: in an `.asset` file.
- **Etch: Override in My Mod**: in a `.gui` or `.gfx` file of an `interface` folder.
- **Etch: Hide the Script Profile in Script Files**: while a script profile is shown.

A few are never in the Command Palette, only on their buttons: the buttons on the Widget Outline's
rows, and the quick fixes on the entries that **Etch: Compare with the Live Game** lists in the
Problems panel (**Report to Etch…**, **Save as view** and **Open profile**).

The list of every Etch command follows.
