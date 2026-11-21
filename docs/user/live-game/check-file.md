---
title: Check File in the Live Game
description: Let the live game read an event, decision or mission file's triggers and effects, and see what it complains about in Problems.
since: 2.14.0
---

Check File sends the triggers and effects of the open script file to the
[live game](start-and-stop.md). The game reads them but runs none of them. What it complains
about shows in the Problems panel, on your lines. Use it to find a typo in an effect or a trigger
without restarting the game or firing the event.

## Check a file

1. Start the live game and load a save, or start a new game.
2. Open a `.txt` file of your mod in one of these folders: `events`, `decisions`, `missions`,
   `common/scripted_effects` or `common/scripted_triggers`.
3. Run **Etch: Check File in the Live Game** from the Command Palette (<kbd>Ctrl+Shift+P</kbd>).
   While the game runs, the editor's right-click menu offers it too, in `.txt` files.

A notice says how many problems the game found, or that it found nothing. The problems show in
the Problems panel as "Etch game check". They disappear when you edit the file. Run the check
again to get them back.

To check a file each time you save it, turn on the setting `etch.liveGame.checkOnSave`. A check on
save shows no notice: what the game finds appears in the Problems panel. When the live game is not
running, or no save is loaded, saving checks nothing.

## What the game reads

Etch takes these parts of the file and gives them to the game:

- in an event: `trigger`, `immediate`, `option` and `after`;
- in a decision: `potential`, `allow`, `effect` and `provinces_to_highlight`;
- in a mission: `potential`, `trigger`, `effect` and `provinces_to_highlight`, and the
  `potential` of the mission series;
- in `common/scripted_effects` and `common/scripted_triggers`: each effect or trigger.

In an `option`, the game reads the effects and the option's own `trigger`, but not `name`,
`ai_chance`, `highlight` or `goto`.

Etch puts each part inside an `if` that can never be true, so the game reads the part but does
not carry it out.
Your country, your provinces and the date stay as they were. A check is not a
[Run](run-selection.md): it does not mark the saves the game writes afterwards.

## Example: a typo in an effect

Write a typo in an event's `immediate`:

```
immediate = {
	add_treasuryy = 5
}
```

Run **Etch: Check File in the Live Game**. Problems shows "Unknown effect type. Key:
add_treasuryy" on that line. The treasury in the game's top bar does not change.

## What it finds

- An effect or a trigger the game does not know, such as `add_treasuryy` or `adm_techh`, on its
  line.
- A modifier the game does not know, written in an effect such as `add_country_modifier`, on the
  line that names it.

Each problem says what the game wrote to its `error.log` file. When the game writes the same line more
than once, Problems shows it once, with "(×2)".

## What it doesn't do

- It does not find a value the game cannot use, such as `add_treasury = lots`: the game writes
  nothing about it.
- It does not find a modifier the game does not know when a trigger names it, such as
  `has_country_modifier`. The game says so only when it starts, and the
  [start report](start-and-stop.md#mistakes-the-game-finds-at-the-start), the list of mistakes
  the game finds when it starts, shows it then.
- It does not find a trigger or an effect used in the wrong place, such as a province trigger
  in a country event: the game finds that only when the script runs, so a check cannot show it.
- It does not check an event's other lines, such as `id`, `title` or `picture`. The start report
  shows the game's complaints about them.
- It does not check a scripted effect or trigger with `$` or `[[` in it, such as `$amount$`: the
  game reads those only where they are used.
- It does not check a file whose `{` and `}` do not match, or with a `"` that is not closed. The
  notice of the command names the line.
- If you edit the file while the game reads it, the check shows nothing: run it again.
- It works only in the live game, with a game loaded: not in the main menu, and not in ironman or
  multiplayer games.
- The game may write lines about other things while it reads your file. Those go to the **Etch**
  output panel, not to Problems.
- A character that the game's [encoding](../scripts/encoding.md), Windows-1252, does not have
  becomes `?`, and the notice says how many there were.
