# Government mechanics

A government mechanic's windows have no place of their own. `common/government_mechanics` names
them with `gui`, the game's code puts them in the government view, and no `.gui` file says where.
Mods rely on that: Anbennar's `drakonshan_bar` holds its bar at `y = -80` and its frame at
`y = -100`, counted from a row of that list, so that they stand over the mechanic's background.
Drawn alone at the top of the screen they stand above it, and a preview that keeps the window to
itself shows nothing.

So the preview draws such a window where the game does: in `countrygovernmentview`, among the rows
of its mechanic. The rules below were read in `eu4.exe` 1.37.5 (the addresses are RVAs) and checked
against the game; [the section at the end](#how-it-was-checked) says how.

## The rows of `specific_governments_list`

`0x13B54A0` fills the list from the country's mechanics, each adding its rows in this order
(`0x13B5B60`, `0x13B62A0`):

1. The powers with `show_before_interactions = yes`, one row each.
2. The interactions, three to a `government_mechanic_interactions` row. Each row holds a horizontal
   `government_interaction_list` of the interactions' windows (`gui`, by default
   `government_interaction_type`), and is as tall as the tallest of them.
3. The other powers, one row each.

A power's row is its `gui`, by default `government_shared_power`. A power that exactly one
interaction costs has no row: it shows in that interaction's window, in the
`government_power_bar` and `government_power_bar_frame` the window then shows (`0x13B3E90`). In
every other interaction's window the game hides those two.

An interaction's button takes its `icon` in place of the sprite the `.gui` names, and the game
centres it in the window's width unless the interaction says `center = no`: it adds half the
difference to the position the `.gui` gives. Vanilla's three interactions at 32, 132 and 232 have
their 82 px buttons at 49, 149 and 249 (8 + 9 from the window).

## The list's place

The list takes the position of the `positionType` `specific_governments_list_position`. When its
rows are lower than the `size` of the `.gui`, it stands centred in that height: `y` is the
`positionType`'s `y`, plus half the `.gui` height, less half the rows' height, each halved in
whole pixels. Its height is that of its rows. Russia's 100 px of rows stand at
230 + 61 − 50 = 241, Anbennar's 12 px of `anb_dummy_hold_mechanic` at 285, both below the view's
140.

So what a window's negative position means depends on the rows above it, and on the rows of the
other mechanics: Anbennar gives `anb_dummy_hold_mechanic` to every player through the basic
reforms, and its 12 rows of 1 px move every other mechanic 6 px down the screen.

## What the preview does

- A window a mechanic shows, without a profile of its own, draws the default view of
  `countrygovernmentview` with that mechanic's rows, and says so. Only the window's own widgets
  answer the mouse, the source and the outline; the notice's button pins the government view.
- The country's mechanics are that mechanic and those of the basic reforms (`basic_reform = yes`)
  whose `available` holds for every player (`ai = no`, `always = yes`, or none), above it.
- A `scripted` widget of the view follows its `potential` in `common/custom_gui` when the mechanic
  answers it: `has_government_mechanic`, `has_reform` for a reform its `available` names, `ai`,
  `always`, `AND`, `OR` and `NOT`. Anything else leaves the widget as the view has it. This is not
  a trigger evaluator: the country here is an example, so the rest cannot be known.
- A list places its entries itself: the `position` of an entry's window counts for nothing. This
  holds for every list the preview fills: `peace_entry` gives `y = 20` and stands at the top of
  `peace_list`, `diploactionentry_category` gives `y = 20` and stands 26 px down
  `diploaction_list`, under a first row of 26 px, and `drakonshan_button` gives `x = 10` and stands
  at the list's left.
- `common` files are read when the session loads: an edit of a mechanic shows after the preview's
  playset is loaded again.

## What it does not do

- Powers come in the order of a hash table of the game. The preview takes file order, which only
  a mechanic with several powers that have their own rows can tell apart.
- An interaction's `potential` can hide its window; the preview shows every interaction.
- A power bar shows its fill as the sprite does, not the country's value, and a button is drawn
  enabled: the game greys one whose `trigger` fails.
- `countrygovernmentview` itself still draws an empty list offline: which mechanic to show is not
  a choice of its `View ▾`.

## How it was checked

`eu4.exe` 1.37.5 (`9AD3EFE1…`), Anbennar alone, Anvil 1.13.0, Tongs 0.26.1, 3440×1440, a private
profile, the save and the mods unchanged. In the game, through Tongs' `ui tree` and `ui find`:

| Country | The list | Its rows and widgets |
| --- | --- | --- |
| H73 after `flavor_skewered_drake.2` | (32, 375), 300 × 112 | 12 rows of 1 px from 375, the interactions (32, 387) 300 × 90, windows at 32, 132 and 232, `drakonshan_bar` (32, 477) 300 × 10, its `frame_background` (42, 377), its `government_power_bar` (87, 397); `drakonshan_bg` (32, 377) shown, the buttons' own bars hidden |
| R62 (The Command) | (32, 376), 300 × 110 | `command_korashi_bar` first, `show_before_interactions`, (32, 376) 300 × 20; the interactions (32, 396) 300 × 90; 82 px buttons at (57, 404), (149, 404) and (241, 404), centred |

The layout gave the same rects for all of these. A screenshot of H73's government tab and the
preview's render at the same size show the panel, its frame and its buttons in the same place; they
differ in the disabled buttons and the texts. Russia's capture of the coverage survey
(`vanilla-save-s14`, `table_of_ranks_mechanic`) agrees too: the list (32, 381) 300 × 100 and the
buttons at 49, 149 and 249.

R62 was taken over with `tag` and shows no row of `anb_dummy_hold_mechanic`, not a month later
either, where the save's Verne and H73 after its reform do. Hypothesis: the game builds the list
when the reforms change, for the country as it stands then, and `available = { ai = no }` failed
while the AI played R62. A player's country has the rows, which is what the preview draws.

Not checked: a mechanic with several powers that have rows of their own (Anbennar's Grônstunad, a
mission's reform the console cannot give), and an interaction's `potential`.
