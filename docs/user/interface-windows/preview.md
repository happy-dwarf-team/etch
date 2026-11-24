---
title: Preview
description: See the window your text cursor is in, drawn close to how the game draws it and again as you type.
clip: preview
---

The preview draws a window of your mod beside the editor, from your files alone, with no game
running. Open it with **Etch: Open Preview** from the Command Palette (<kbd>Ctrl+Shift+P</kbd>), or
with the **Open Preview** button in the title bar of a `.gui` file's editor.

## The previewed window

The preview shows one window at a time, the **previewed window**: the window that holds the cursor
in the `.gui` file you edit. Only windows written directly inside the file's `guiTypes = { … }`
count; a window inside another one shows as part of the outer one. Move the cursor into another
window, or into another `.gui` file, and the preview follows.

When the cursor is outside every window, the preview stays on the window it showed last in that
file, or shows the file's first window. When you switch to a file that is not a `.gui` file, the
preview stays on the last window.

The toolbar names the previewed window and its file. For a `.gui` file with no window, the preview
says "This file defines no window to preview." Where the window is see-through, a mid grey shows
through.

## It follows what you type

The preview draws what you typed, saved or not, as the game will read it once you save. It
redraws on every change you make:

- in the `.gui` file of the window;
- in your mod's `.gfx` files, such as the texture of a sprite the window uses;
- in your mod's localisation files, such as the text of a key the window shows.

When a texture or font file changes, for example after you export it again from your image
editor, the preview draws the new one. After you reload VS Code's window, the preview opens again
and shows the window it showed before.

## Pin a window

The window's name at the left of the toolbar opens the window list: every window of the file,
with its size and the line it starts on. Type to filter the list, and press <kbd>Enter</kbd> or
click a window to preview it.

- The window you choose stays in the preview while you edit other files, such as its `.gfx` or its
  localisation: it is pinned, and **Pinned** shows beside its name.
- **Follow the cursor**, at the top of the list, unpins it: the preview shows the window around
  the cursor again.
- **Etch: Pin or Unpin the Previewed Window** pins the window the preview shows, or unpins it, from
  the Command Palette.
- When you delete the pinned window from its file, a notice says it is no longer there. The
  window list stays, so you can choose another window or **Follow the cursor**.

When the cursor is in no window, for example on the file's first line, the preview shows the last
window it showed in the file, or the file's first window. A notice above it says so, and its
**Choose a Window…** button opens the list.

In the [live game](../reference/glossary.md#live-game), EU4 running beside the editor,
[pick mode](../reference/glossary.md#pick-mode) lets you click a widget in the game to open the
line that defines it. Such a click also pins the preview on the window you picked.

## From the preview to the file

- Click a widget in the preview: the editor shows the line that defines it and selects its name.
- Point at a widget: an outline and a tooltip give its path, its kind, its place and its size. The
  path names the widgets it sits in, down to its own name, such as
  "provinceview › top_section_window › provincename".
- Move the cursor in the editor, or choose a widget in the [Widget Outline](widget-outline.md):
  the preview outlines that widget, and a label under it gives its name, its kind, its size and
  its place, such as "title · instantTextBoxType · 300 × 24 at 20, 12".
- The tooltip and the label stay inside the panel: near its right or bottom edge they move to the
  other side.

The [Widget Outline](widget-outline.md) lists the same widgets as a tree.

## Where the game changes the layout

The game's code decides some things that no `.gui` file says. The preview does them the same way:

- **Large variants.** Of two widgets `X` and `X_large` in the same block, the game makes only one:
  the small one on a screen less than 814 pixels high, the large one from 814 pixels. The preview
  draws only that one. In the base game's `provinceview.gui`, `provinceview_bg` and
  `provinceview_bg_large` are such a pair.
- **Moved sections.** The game's code moves some sections of the province view, such as its top
  section on a screen 814 pixels high or more. The preview moves them the same way.
- **Government mechanics.** A window that a government mechanic names (`gui` in
  `common/government_mechanics`) has no place of its own: the game puts it among the mechanic's
  rows in the government view. The preview draws it there, so its negative positions land where
  they do in the game. A note above the window says so, with a button
  **Pin countrygovernmentview** to edit the government view itself.

Some windows have a [window profile](../reference/glossary.md#window-profile): Etch's notes on
which of their widgets the game shows together. Such a window is drawn in one
[view](../reference/glossary.md#view), one situation as the game shows it: see
[Views and window profiles](views.md). Without a profile, the preview draws every widget of the
window at once.

## Warnings in Problems

While the preview is open, Etch checks the previewed window's file, and each `.gui` or `.gfx` file
you change, against your [playset](../getting-started/finding-the-game.md), the mods loaded with
yours. What it finds goes to VS Code's Problems panel
(<kbd>Ctrl+Shift+M</kbd>), on the line it is about: a missing sprite, font or texture, a name
written twice and more. Closing the preview clears them. Each one is explained on the
[Problems](problems.md) page.

What goes wrong in finding the game or the mods shows as a notice above the window instead: see
[Where Etch finds the game](../getting-started/finding-the-game.md).

## While it reads, and when it cannot draw

The first preview in a playset reads its sprites, fonts and texts, which takes about a second. When
reading takes longer than 0.3 seconds, a thin bar runs at the top of the preview with what Etch
reads. A redraw after an edit is faster, so it shows no bar.

When the preview cannot draw the file, the last window it drew stays, faded, and a notice above
it says why with a button that fixes it. For a file saved in UTF-16, which the game cannot read,
**Save with Encoding…** opens VS Code's choice of encodings: pick **Save with Encoding** and then
UTF-8. Screen readers read such notices out.

## Start the live game

**Live game** in the toolbar starts the game itself with the preview's playset, beside the editor:
see [Start and stop](../live-game/start-and-stop.md).

## What it doesn't do

- It does not run the game's code. Texts the game fills get stand-ins only in windows with a
  window profile: see [Sample data](sample-data.md).
- You cannot move or change widgets in the preview. Edit the file.
- It lays windows out at UI scale 1.0 only: see [Zoom and resolution](zoom-and-resolution.md).
- A country's flag in a text (`@SWE`) is not drawn: its space in the text stays empty.
- A widget's `rotation` and `origo` are not applied, and a sprite whose shader Etch does not have
  is drawn with Etch's default shader. The Problems panel names each case.
- In a government mechanic's window, only the widgets of that window respond when you click or
  point at them; the rest of the government view does not.
