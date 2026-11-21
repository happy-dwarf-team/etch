---
title: Widget Outline
description: See the widgets of a window as a tree, jump to their lines, and show, hide or fill them by hand.
clip: outline
---

The Widget Outline lists the widgets of a window as a tree, in the order of the file. It is a
section of VS Code's Explorer (<kbd>Ctrl+Shift+E</kbd>) named **Widget Outline**. When the section
is folded, click its title to open it. Use it to find a widget, see why the preview shows or hides
it, and change that by hand.

## The tree

While the preview is open, the outline shows the window the preview draws, the
[previewed window](../reference/glossary.md#previewed-window). Without the preview, it follows the
cursor in the `.gui` file you edit. The window's name stands next to the outline's title. With no
`.gui` file open, it says "Open a .gui file to see the widgets of its window."

Each row shows a widget's name with an icon for its kind. After the name, in grey:

- its kind, such as `instantTextBoxType`;
- "hidden" when the preview hides it, and "not created" when the game does not create it at the
  preview's screen height;
- "by hand" when you changed it, or "from the game" when the
  [live game](../reference/glossary.md#live-game), EU4 running beside the editor, showed it
  differently from what the [window profile](../reference/glossary.md#window-profile) says;
- for a text, the text the preview shows and where it comes from, such as
  "Northmarch" (generated). See [Sample data](sample-data.md).

Point at a row: a tooltip gives the widget's path (the widgets it sits in, down to its own name),
its place and size, and why it shows or not, such as the profile's rule that hides it.
**Collapse All** in the outline's title bar folds the tree.

## From the outline to the file and back

- Click a row: the editor shows the line that defines the widget, and the preview outlines it.
- Move the cursor in the editor, or click a widget in the preview: the outline selects that widget.

## Show and hide widgets by hand

In a window with a [window profile](views.md), the outline has buttons at the end of each row.
Point at a row to see them.

- **Hide by Hand**, an eye, hides a widget the preview shows.
- **Show by Hand**, a closed eye, shows a widget the preview hides.
- **Choose by Hand**, a circle, picks one of a set of widgets of which the game shows one.

Widgets of which the game shows only one at a time are grouped under a row "(one of)". Its grey
text names the set, such as a tab or a side panel. Each of them has a round button: a filled
circle marks the one that shows. Choose another and the preview shows it instead, and hides the
others. When the game may also show none of them, a "(none)" row lets you hide them all.

A widget the game does not create, such as a `_large` widget on a screen less than 814 pixels high,
is struck through and has no buttons. To draw it, change the preview resolution: see
[Zoom and resolution](zoom-and-resolution.md).

Each change by hand is counted in the preview's **View ▾** button, such as
"View: Own province · 2 by hand ▾". A change that agrees with what the profile shows anyway does
not count. **Reset hand toggles (2)** in **View ▾** takes them all back, and **Save as view…**
keeps them in your mod: see [Views and window profiles](views.md).

## Type a sample text

The rows of texts, edit boxes and buttons have one more button: **Type Sample Text…**, a pencil.

1. Point at the row of a text, such as `provincename`, and click the pencil. Or right-click the
   row and choose **Type Sample Text…**.
2. Type what the text should show and press <kbd>Enter</kbd>.

The preview shows your text over every other kind of sample data. To take it back, right-click the
row and choose **Clear Sample Text**. Etch keeps typed texts for each window, also after you close
VS Code.

## What it doesn't do

- A window without a profile has no buttons to show, hide, choose or fill widgets, unless you took
  a [live snapshot](../reference/glossary.md#live-snapshot) of it in the live game. Without one,
  the preview draws every widget.
- Changes by hand last only until you close the preview. To keep them, save a view.
- You cannot add, move or rename widgets from the outline. Edit the file.
