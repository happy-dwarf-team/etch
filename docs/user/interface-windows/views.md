---
title: Views and window profiles
description: Draw a window as the game shows it in one situation, switch to another, and save your own views with your mod.
clip: views
---

Many windows hold widgets for several situations at once: the province view has parts for your
own province and for a foreign one, for each tab and each side panel, and the game's code shows
only some of them. A **window profile** tells Etch which parts go together, so the preview draws
the window in one **view**, one situation as the game shows it, instead of every widget at once.

## Views and selectors

- A **selector** is one choice the game's code makes for the window, such as whose province it
  is or which tab is open. Each of its values shows some widgets and hides others.
- A **view** is a named set of selector values, such as **Own province** or **Foreign province**.
- The window profile holds a window's selectors, its views and the rules that say which widget
  shows for which value.

For example, Etch's profile of the base game's province view has the selectors **Province owner**,
**Tab**, **Side panel**, **Sub-panel** and more, and the views **Own province** (the one the
preview starts with), **Foreign province**, **State tab**, **Build army**, **Build navy** and
**Change culture**.

## Choose a view

1. Open the preview on a window with a profile, such as `provinceview`.
2. Click **View ▾** in the toolbar. The button names the view you see, such as
   "View: Own province ▾".
3. Under **Views**, click another one, such as **Foreign province**: the preview draws the window
   in that view. A check (✓) marks the current view, and "yours" a view of your mod.

The arrow keys move through the menu and <kbd>Enter</kbd> picks an item. <kbd>Esc</kbd> closes
the menu and puts the focus back on its button.

## Set a selector

Click **Selectors…** in **View ▾**, with the number of selectors after it. A dialog lists each
selector with its values. Choose another value to draw the window with it; the dialog stays open,
and <kbd>Tab</kbd> moves between the lists. Point at a selector's name to read its note. After the
list, a word says where the value comes from:

| Word | Where the value comes from |
| --- | --- |
| you | you chose it, or the view you clicked set it |
| live | the [live game](../reference/glossary.md#live-game), EU4 running beside the editor, showed the window this way |
| save | the save you chose in **Data ▾**: see [Sample data](sample-data.md) |
| auto | the preview resolution, the screen size the preview lays the window out at |
| default | the profile's default |

A value you chose has a button after it. **×** goes back to the profile's default. For a selector
that a save can set, the button is **Follow Save** instead: it takes the save's value again.
<kbd>Esc</kbd> or a click beside the dialog closes it.

The **Screen height** selector follows the preview resolution, so you cannot choose it here. To
change it, choose another resolution: see [Zoom and resolution](zoom-and-resolution.md).

When the values no longer match the view you clicked, the button says "Custom view".

## Show and hide widgets by hand

In the [Widget Outline](widget-outline.md), widgets of which the game shows only one at a time
have a round button, and every other widget has an eye. Click them to show or hide widgets by
hand. Each change by hand is counted in the **View ▾** button, such as
"View: Own province · 2 by hand ▾". **Reset Hand Toggles** in **View ▾**, with the count after it,
takes them all back at once. A notice above the window says how many it reset, with **Undo** to
bring them back; it goes at your next change, or with its **×**.

- A change that agrees with what the profile shows anyway does not count.
- Clicking a view replaces your changes by hand with the view's own.
- Etch keeps your changes for each window until you close the preview. To keep them, save a view.

After you click a widget in [pick mode](../reference/glossary.md#pick-mode) in the live game, the
button can also say "live" or "3 from the game": see
[Snapshot and compare](../live-game/snapshot-and-compare.md).

## Save a view with your mod

1. Set the selectors, and show or hide widgets by hand, until the window looks as you want.
2. Click **View ▾**, then **Save as View…**.
3. Type a name for the view and press <kbd>Enter</kbd>.

Etch writes the view into your mod, beside its `descriptor.mod`, in
`.etch/profiles/<window>.jsonc`, such as `.etch/profiles/provinceview.jsonc`. It saves every
selector's value except the screen height, and your changes by hand. Your views show "(yours)" in
the menu. Saving again under the same name replaces your view. Etch keeps the rest of the file,
comments too. Keep the file with your mod, and commit it if your mod is in Git: everyone who works
on the mod then sees the same views.

**Save as View…** needs a mod: when it is greyed out, open a file of a mod first.

**Open the Window Profile** opens the profile file that counts for this window: your mod's
`.etch/profiles/<window>.jsonc` when it has one, else Etch's own profile of the window.

## Write your own profile

Your mod's `.etch/profiles/<window>.jsonc` is a window profile of its own, on top of Etch's. It
can add selectors, views and rules, change one of Etch's, or remove one of Etch's by setting it to
`null`. Etch combines the profiles in this order; a later one wins:

1. Etch's profile for the base game;
2. Etch's profile for each mod of your [playset](../getting-started/finding-the-game.md) (the mods
   loaded with yours), where Etch has one;
3. your mod's file.

VS Code checks the file as you type it. A mistake, such as the path of a widget the window does
not have, shows in the Problems panel as an error on its line, and Etch leaves that entry out.
While the file is open, the preview follows what you type in it.

A profile can also send you to another window. When the province view's **Colonised** selector is
**Uncolonised**, a note above the window says "The game opens the colonisation panel for an
uncolonised province, not the province view.", with a button **Pin colonisationpanel** that pins
the preview on that window.

### What a rule can change

A rule applies when its selectors have the values it names. It tells the preview what the game's
code does to the window in that case:

- `show` and `hide`: widgets the game shows or hides; `notCreated`: widgets the game does not make
  at all.
- `position` and `offset`: widgets the game's code moves; `hidePosition`: widgets the game keeps at
  their `hide_position`.
- `frame` and `sprite`: the frame or the sprite the game's code puts on a widget in place of the
  `.gui` file's.
- `chartSize` (added in 2.14.0): the size the game's code gives a chart, such as the estates
  view's pie chart at 32 × 32, in place of its sprite's size.
- `slider` (added in 2.14.0): a marker the game's code places along a bar from a value, such as
  the patriarch authority's marker in the religion view. The rule names the bar's two ends, the
  marker and its value text, and either a fixed share from 0 to 1 or a number from the save
  (`country.patriarchAuthority`).
- `adopt`: definitions the game's code puts inside a widget.

How to write a profile, with every field of these rules:
[window profiles](https://github.com/happy-dwarf-team/etch/blob/main/docs/window-profiles.md).

## Add scripted selectors

Added in 2.12.0.

In `common/custom_gui`, a mod can give a widget a `potential`: a trigger the game tests to decide
whether to show the widget. Etch can write a first set of selectors for these widgets:

1. Open the preview on the window.
2. Run **Etch: Add Scripted Selectors to the Window Profile** from the Command Palette
   (<kbd>Ctrl+Shift+P</kbd>).
3. Etch writes the selectors into your mod's `.etch/profiles/<window>.jsonc` and opens the file. A
   message says how many it added.
4. Set each one to **Shown** or **Hidden** in **Selectors…** of **View ▾**.

What Etch writes:

- Each widget with a `potential` gets a selector. Its label is the widget's name and its
  tooltip's text from your playset's localisation; its note quotes the `potential`.
- A widget with `potential = { always = yes }` gets none: the game always shows it. One with
  `always = no` gets a rule that always hides it.
- Widgets with the same `potential` share one selector, labelled with their names.
- Some widgets each test the same one of these triggers against a different value: `tag`,
  `religion`, `religion_group`, `government`, `primary_culture`, `culture_group`,
  `technology_group` or `is_subject_of_type`. They share one selector, such as
  "religion (scripted)". It has one value for each tested value, named as the game names it, and
  one more, such as "Another religion", for any other value.
- Etch keeps the selectors already in your file as they are, and leaves out those that Etch's own
  profile already has.

## Which windows have a profile

Etch has profiles for:

- **The base game:** the province view; the country view and each of its tabs; the top bar; the
  menu bar; the ledger; the main menu and the settings; the minimap; the peace view; the Holy Roman
  Empire window; the colonisation panel; the declare war dialog; the unit panel; and a few more.
- **Anbennar:** 16 windows, among them the province view, the top bar and the country view's tabs.
- **Proper 2K UI Enhanced:** the military, stability and technology tabs of the country view.
- **Anbennar's patch for Proper 2K UI Enhanced:** the province view and the country selection
  panel.

A window without a profile has no **View ▾**: the preview draws every widget of it.

## What it doesn't do

- Etch never tests a trigger. You choose the value of each scripted selector.
- **Etch: Add Scripted Selectors to the Window Profile** makes a shared selector only for widgets
  that test one of the triggers listed above. For other widgets of which the game shows one at a
  time, such as widgets that each test a different flag, write the selector yourself.
- A selector can take its value from a save only for what Etch reads from saves: see
  [Sample data](sample-data.md).
- A view does not set the screen height: that follows the preview resolution.
