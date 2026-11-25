---
title: Snapshot and compare
description: Fill the preview with what the live game shows, and find where the preview differs.
clip: snapshot
---

A live snapshot is what the [live game](start-and-stop.md) showed in one window at one moment: its
texts, which widgets were shown or hidden, the states of its buttons and check boxes, and the
sprites, flags and pie charts that the game set itself. The preview uses it as
[sample data](../reference/glossary.md#sample-data) (stand-in values for what the game fills in),
so the window looks as it did in the game. **Compare with Live Game** then lists in Problems every
widget the preview still draws differently from the game.

## Take a snapshot

- Pick a widget in [pick mode](pick-mode.md): the pick takes a snapshot of its window.
- Or open the window in the live game and the same window in the preview, then run **Etch:
  Snapshot from the Live Game**, or click **Refresh from Live Game** under **Live snapshot** in
  **Data ▾**.

The game must show the window. If it does not, Etch asks you to open it in the game first.

## In the preview

The snapshot is the **Live snapshot** layer of **Data ▾**
([Sample data](../interface-windows/sample-data.md)). A [layer](../reference/glossary.md#layer) is
one of the sources of sample data, stacked on top of each other, where the upper one wins. The
snapshot's texts win over a save's, the game's files and generated text; only a text you type by
hand wins over it. Its tick box turns the layer off and on.

**Data ▾** says when the snapshot was taken, with the game date and the save, such as "as of
06:00:00, 1719.3.17, Russia1719.eu4". It also says:

- "older", after the live game restarted or loaded another save;
- how many values no longer match a widget of your file, for example after you renamed one. A
  widget without a value takes its text from the layers below.

The snapshot also sets the selectors of the
[window profile](../reference/glossary.md#window-profile) (the choices that pick which
[view](../reference/glossary.md#view) of the window the preview shows) to what the game showed;
**Selectors…** in **View ▾** marks them "live". Where the window profile still shows or hides a
widget differently from the game, **View ▾** has **Compare with Live Game** with the number of
such paths after it, and the Widget
Outline marks those widgets "from the game"
([Views and window profiles](../interface-windows/views.md)).

Etch keeps the latest snapshot of each window of your
[playset](../reference/glossary.md#playset), in VS Code's storage for your workspace. It never
writes it into your mod and never sends it anywhere. A snapshot does not expire. But when you take
one with another playset, Etch deletes the snapshots of the playset before.

## Compare with the live game

**Etch: Compare with the Live Game** came in Etch 2.7.0. It draws the window the preview shows from your
files alone, as the preview does, but with the game's texts, the pictures the game set itself and
the view the game showed. Then it checks each widget against the game: whether it stands in the
same place, and whether it shows or hides as in the game. A selector that no widget's visibility
gives can come from a text the game wrote: the stability view's marker stands at the stability the
game shows.

1. Save the window's file, so that the game has your latest version.
2. Open the window in the live game, and in the preview.
3. Run **Etch: Compare with the Live Game** (the Command Palette offers it while the preview is open),
   or click **Compare with Live Game** under **Live snapshot** in **Data ▾**.

A notice says how many [live differences](../reference/glossary.md#live-difference) (widgets the
preview draws differently from the game) it found, with **Show Problems** when there are any. Each one shows in the Problems panel as
information, not as a warning, on the widget's line in the `.gui` file. A widget only the game has
goes on the line of the nearest widget that holds it. There are three kinds:

- both show the widget, but in different places;
- only the game has the widget, or only the preview;
- one shows the widget and the other hides it.

When the game does not show the window, Compare uses the stored snapshot, as long as the file has
not changed since the snapshot was taken. When Etch cannot compare, it says why: the file has
unsaved changes, the game reads another mod's copy of it, or the snapshot is of another version of
the file.

The entries stay until you compare that window again or change its file; stopping the game does
not remove them.

## Report to Etch

Most differences are mistakes in Etch's preview, not in your file. To tell the Etch team about
one:

1. Open the entry's quick fixes (the light bulb, or <kbd>Ctrl+.</kbd>) and choose **Report to
   Etch…**.
2. Etch shows every field the report holds. Click **Open in Browser**.
3. Your browser opens a new issue of Etch on GitHub, filled in. Add how to open the window in the
   game, if you can, and send it yourself.

The issue holds:

- the widget's path in the window;
- the kind of difference;
- where the game and the preview draw the widget: its position and size in each;
- which of them shows it;
- whether the window has a window profile;
- the resolution;
- the versions of Etch and of the tools the live game runs on
  ([The private install](private-install.md)).

No file or text of your mod goes in it. Etch sends nothing by itself.

## A window without a profile

Without a window profile the preview draws every widget of a window. Compare then has one entry
for all the widgets the game hid, with two more quick fixes:

- **Save as view** asks for a name, suggesting "As the live game showed it". It writes a view that
  hides those widgets into your mod's own window profile, `.etch/profiles/<window>.jsonc`, then
  opens the file.
- **Open profile** opens that file, once it exists.

## What it doesn't do

- A snapshot comes only from the live game, of a window it shows.
- It takes no snapshot of a window that the game built before a reload and has not rebuilt since:
  restart the live game first.
- It keeps snapshots of one playset at a time.
- Compare needs your saved file, and the game must read your copy of it.
- Compare does not work on a window that the preview draws inside another one, such as a
  government mechanic's window in the government view, or in place of another one, such as
  `colonisationpanel` for an uncolonised province.
- Etch writes nothing into your mod's window profiles by itself: only **Save as view** does, when
  you click it. The profile differences that **View ▾** counts are not entries in Problems; only
  Compare lists differences there.
