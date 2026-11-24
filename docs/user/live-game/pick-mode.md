---
title: Pick mode
description: Point at a widget in the live game and open the line that defines it in VS Code.
clip: pick
---

Pick mode lets you point at any part of the [live game](start-and-stop.md)'s interface and jump to
its definition. While it is on, the widget under the pointer is outlined and named, and a click
opens its definition in VS Code instead of acting in the game.

## Turn it on and off

- Press <kbd>Ctrl+Shift+E</kbd> in the game, or
- click **Live game** in the status bar and choose **Turn Pick Mode On**, or
- run **Etch: Toggle Pick Mode** from the Command Palette. It also brings the game forward.

A badge in the game says "Etch pick — Ctrl+Shift+E to leave", and the status bar in VS Code shows
**Pick mode** beside **Live game**, so you know why a click in the game opens a file. Press the key
again, or click **Pick mode** in the status bar, to leave pick mode. Turning it on from VS Code
brings the game forward; turning it off from VS Code leaves the game behind VS Code.

To use another key, change the setting `etch.liveGame.pickModeKey`: <kbd>Ctrl</kbd> or
<kbd>Alt</kbd>, with <kbd>Shift</kbd> if you like, and a letter, a digit or
<kbd>F1</kbd>–<kbd>F24</kbd>. The change applies at once, also while the game runs. In the game,
<kbd>Ctrl+Shift+E</kbd> does nothing else, and pick mode leaves <kbd>Esc</kbd> to the game.

## What you see

The widget under the pointer is outlined, and the window it belongs to gets a dashed outline. A
label beside it shows:

- the widget's name, its kind (button, icon, text and so on) and its size in pixels;
- where it is defined: the mod ("EU4" for the base game), the file and the line;
- the names of the widgets it sits in, from the window down, shortened.

Over the map, a tooltip or the console, the label says "not a GUI widget". A widget outlined in red
is out of date: the game built it before a reload and no longer knows which line defines it. A
click then finds it by its name: Etch opens the first widget of that name in the file.

While pick mode is on, the game shows no tooltips, so none covers the widget you point at. They
come back when you leave it.

## Step through the widgets under the pointer

Often several widgets lie under the pointer, such as a button and its text. Turn the mouse wheel to
step through them; the label says, for example, "2 of 4 under the pointer · wheel to step". This
is how you reach a button's own text.

## Open a definition

Click the outlined widget. The game does not take the click: no button is pressed. VS Code comes
forward with the file open at the widget, its name selected. Pick mode stays on, so you can go back
to the game and pick the next one. The click with which you bring the game back to the front
already picks a widget.

- A click on a widget built from a template in another file, such as a list row or a scroll bar
  part from `core.gui`, opens the widget that uses the template. **Go to template**, in the notice
  after the pick, then opens the template's own definition.
- For an icon or a button that names a sprite, the notice offers **Go to sprite**, which opens the
  `.gfx` file that defines the sprite.

## Files of the base game or another mod

A file that is not your mod's opens read-only, and a notice says where it comes from, such as
"Defined in EU4, read-only". To change it:

1. Click **Override in my mod** in the notice.
2. Etch copies the whole file to the same path in your mod and opens your copy at the same line.
3. Edit your copy and save it: the live game reloads it like any other file.

If a mod later in your [playset](../reference/glossary.md#playset) (your mod and the mods it
depends on) has the same file, Etch still copies it, but warns that the game reads that mod's copy,
not yours. If your mod has the file already, nothing is copied and yours opens.

**Etch: Override in My Mod** does the same for the file of the `interface` folder that is open in
the editor, such as a `.gui` or `.gfx` file.

## The preview after a pick

A pick also [pins the preview](../interface-windows/preview.md) on the window you picked, so it
stays there while you edit other files. The pick takes a
[live snapshot](../reference/glossary.md#live-snapshot) as well: the texts, the shown and hidden
widgets and the states the game showed. The preview shows the window as in that snapshot, instead
of any [view](../reference/glossary.md#view) (one way the game shows a window) you chose.
[Snapshot and compare](snapshot-and-compare.md) says more. A pick is a moment: the preview does not
follow the game afterwards.

## What it doesn't do

- It works only in the live game, not in your own EU4.
- The map, tooltips and the console are not widgets: a click there opens nothing.
- An out-of-date widget (outlined in red) opens at the first widget of its name, not at its own
  line.
- The preview does not follow the game after a pick.
- **Etch: Override in My Mod** works only once you have started the live game in this VS Code
  window: that is how Etch learns your playset.
