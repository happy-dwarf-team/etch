---
title: Script profile
description: Open the latest timings of your triggers and effects, measured by Anvil's script profiler.
since: 2.10.0
clip: profile
---

[Anvil](https://anvil.happydwarf.dev/), which loads plugins into EU4, has a script profiler: a tool
that measures how long the triggers and effects of your events, decisions and other scripts take
while you play. **Etch: Show Latest Script Profile** opens what it measured as a page in VS Code,
links each row to where it is written, and shows the times in your script files too.

## Measure a profile

The profiler comes with Anvil 1.22 and newer. It runs in your own game.

1. Start your game with Anvil 1.22 or newer, and load a game.
2. Open the Anvil panel with <kbd>Ctrl+Shift+F12</kbd> (by default), and show its **Script
   profiler** window.
3. Click **Start**, play for a while, then click **Stop**. Or click **Measure 30 days** (the
   number is a setting of the profiler): the measurement then stops by itself after that many days
   of game time.
4. When the measurement ends, the profiler writes a CSV file to the `logs` folder of your EU4
   profile (usually `Documents/Paradox Interactive/Europa Universalis IV/logs`), where
   `error.log` is too.

## Open the profile

Run **Etch: Show Latest Script Profile** from the Command Palette (<kbd>Ctrl+Shift+P</kbd>). Etch
opens the newest profile in your profile's `logs` folder as a page in VS Code's Markdown preview.
It also looks in the `logs` folder of Etch's [live game](../reference/glossary.md#live-game), the
copy of EU4 that Etch starts for you to play beside the editor. If there is none yet, Etch says
how to measure one.

Etch keeps the page as a file in its own storage and writes it again each time you open it (see
[What Etch reads and writes](../about/reads-and-writes.md)).

## What the page shows

At the top of the page you see:

- the CSV file's path;
- the span, the stretch of play the profile measured: how many days of game time it covered and
  their dates, how many seconds it took, and when it started;
- the game's version and Anvil's version;
- whether the game was multiplayer or ironman.

Then come two lists, **Triggers** and **Effects**. Each starts with its total time and calls,
then shows the 30 rows that took the most time, the slowest first; the CSV has the rest. Each row
is one block of script, and its columns say:

- **Owner**: what the block belongs to, such as an event, an event option, a decision, a mission,
  an `on_action`, a casus belli, a triggered modifier, a church aspect or a scripted trigger.
- **Name**: the owner's name, such as an event's id. An event option is its event's id, `#` and
  the option's number, counting from 1: the second option of the base game's event
  `flavor_rus.13` is `flavor_rus.13 #2`.
- **Role**: which of the owner's blocks was timed, such as `trigger`, `potential` or
  `mean_time_to_happen`.
- **Calls**: how many times the game ran the block.
- **Total (ms)**: all those runs together, in milliseconds.
- **Mean (µs)**: one run on average, in microseconds (thousandths of a millisecond).
- **Max (µs)**: the longest single run, in microseconds.

When the profiler cannot tell what a block belongs to, the page puts it in one row, **No owner
found**, as the profiler's window does. The CSV splits these blocks by where in the game they run.

The times add up the work of all the game's threads, the parts of the game that run side by
side. A trigger inside an effect, such as a `limit`, counts in both lists.

## Interrupted spans

When a measurement ends early, because you load a save, go back to the menu or quit the game, the
page says **Interrupted** at the top. The lists hold what was measured until then.

## Scripted triggers

When the profile holds scripted triggers by name, the page also has a **Scripted triggers** list,
between the triggers and the effects. It has one row for each scripted trigger, with all its uses
added up, also those inside an event or a decision. That time is part of the **Triggers** list
too, so do not add the two lists up.

## Go to where a block is written

Each name links to where it is written: an event, a decision, a mission, an `on_action`, a casus
belli, a triggered modifier, a church aspect or a scripted trigger. The link opens the file at the
block the row measured, such as an option's `ai_chance`. Hover over a link to see the file, its
line and the mod it comes from, and how many more definitions of it your
[playset](../reference/glossary.md#playset) has, such as a second event with the same id.

The links lead into the playset of the mod folder you have open in VS Code. With no folder open,
they lead into the game folder.

## Numbers in your script files

While a profile is shown, your script files show its numbers too. A line above each measured
event, option, decision and other owner gives its triggers' and effects' time and calls, for
example "Script profile: triggers 40.25 ms (100 calls) · effects 62 ms (10 calls)". A scripted
trigger's line counts all its uses.

- Hover over the line to see each of its rows.
- Click it to open the profile page again.

Only the copy of a file that your playset loads shows numbers: a copy that another mod replaces
did not run in the game. To take the numbers away, run **Etch: Hide the Script Profile in Script
Files**.

## A profile from another playset

The page says which playset its links lead into, which may not be the one the profile was
measured with.

## What it doesn't do

- Etch does not measure scripts itself: Anvil's script profiler does, in your own game.
- The page shows the 30 slowest rows of each list. The rest are only in the CSV.
- Blocks whose owner the profiler cannot tell are one row, **No owner found**.
- Etch may not find every name of a profile from another playset. A name it does not find has no
  link.
