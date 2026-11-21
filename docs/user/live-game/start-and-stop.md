---
title: Start and stop
description: Start Etch's own copy of EU4 with your mod's playset beside the editor, and stop it.
---

The live game is EU4 itself: a private copy of the game that Etch starts with your mod's
playset (your mod and the mods its descriptor depends on). You play it as usual, and each file you
save goes into it at once ([Reload on save](reload-on-save.md)).

## Start the live game

1. Open a `.gui` file of your mod, for example your copy of `interface/provinceview.gui`. The live
   game plays with the playset of the mod that file belongs to.
2. Run **Etch: Start the Live Game** from the Command Palette (<kbd>Ctrl+Shift+P</kbd>), or click
   **Live game** in the preview.
3. The first time, Etch asks you to confirm what the live game does (below). Click **Start**.
4. Choose where the game starts (below).
5. The first time, Etch also asks "Create the private install?" and says how much it copies.
   Click **Create**. [The private install](private-install.md) says what it holds.

The status bar shows **Live game starting**, then **Live game** once the game is ready, and a
notice says how long it took. A first start of a big playset can take several minutes. Etch keeps
waiting; after two minutes a notice offers **Stop**.

## The first start

The confirmation comes once. It says that the live game:

- runs in front of your other windows, as EU4 always does;
- takes your settings at every start: resolution, graphics, sound, UI scale and language;
- plays copies of your saves in an EU4 profile of its own (its own folder of settings, saves and
  mods, see [The private install](private-install.md)), and writes nothing back to your own
  profile or saves;
- counts as your EU4 session for Steam while it runs.

If your autosave is off, the live game autosaves monthly anyway, so that a crash loses little. The
confirmation says so.

## Choose where it starts

A list asks "Where should the live game start?"

- **Continue** starts from the live game's newest save.
- **Main menu** starts at the game's main menu.
- Under **Your saves** come your own saves, newest first. The one you choose is copied into the
  live game's saves and played as a copy; your own file does not change.
- Ironman saves show with a lock and "reload does not work in ironman". You cannot choose them:
  the live game cannot reload files in ironman, so Etch does not copy them.

## Your settings

The live game copies your `settings.txt` and `pdx_settings.txt` at every start. A setting you
change in the live game, such as the resolution, is gone at the next start. If you have never
started EU4, it opens in a borderless window at your monitor's size.

## Steam and your own game

While the live game runs, Steam shows you playing EU4 and does not start your own game beside it.
To play your own game, stop the live game first. The other way round, Etch does not start the live
game while your own EU4 runs, and says so.

Etch runs one live game per machine. If another VS Code window runs it, Etch says so.

## Stop the live game

- Run **Etch: Stop the Live Game**, or click **Live game** in the status bar.
- Close the VS Code window.

Both save first: Etch saves the game as `autosave.eu4` in the live game's saves, waits up to 30
seconds until the file is written, then closes the game. **Continue** starts from that save next
time. Etch saves nothing when the game is at the main menu, in ironman or in multiplayer.

Quitting from the game's own menu stops the live game too. **Exit to Main Menu** makes EU4 close
and start again by itself. Etch takes over the new game when it can; if it cannot, it closes the
game and asks you to start the live game again.

**Etch: Open the Live Game's Saves Folder** opens the folder of the live game's own saves: the
copies of your saves, the saves you make in it and the ones Etch makes before a stop.

## When the game crashes

If the game crashes or stops answering Etch, Etch starts it again at the live game's newest save:
an autosave, the save Etch made at the last stop or restart, or one you saved. A notice says why it
restarts. After the third crash within five minutes, Etch stops the live game and shows the end of
the game's `error.log`; start it again yourself.

A game that only stands still is not a crash. Loading a save, starting a new game, saving or a big
event can freeze it for a while, and Windows may mark its window "not responding". After five
minutes in which the game draws nothing new, Etch asks **Keep Waiting** or **Close and Restart**,
and closes it only on your answer.

## In Anbennar

When the live game starts from a save in Anbennar's playset, Etch answers the achievements prompt
that Anbennar shows before the save loads. The save's own events are left to you.

## What it doesn't do

- It starts only EU4 1.37.5 from Steam: Etch refuses any other `eu4.exe`.
- It does not copy ironman saves.
- It does not save before a stop at the main menu, in ironman or in multiplayer.
- Settings you change in the live game do not last.
- It runs one live game per machine, and not beside your own EU4.
- All playsets share the live game's saves folder, so **Continue** may offer the newest save of
  another playset.
- It never writes to your own saves or profile.
