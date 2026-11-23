---
title: Province IDs and names
description: See each province's name after its ID, and find province IDs and names in your scripts that the game does not check and can crash on.
since: 2.13.0
clip: names
---

Say a script names a province the map does not have, such as `owns = 5075` when the base game has
4941 provinces. The game writes nothing about it in `error.log`, and it can crash when it reads
that province. A few names work the same way: an idea group or a policy your
[playset](../reference/glossary.md#playset) does not define can crash the game without a word.
Etch finds these lines for you.

## See the warnings

Open a script file, such as an event file of your mod. As you type, Etch underlines each such line
and lists it in the Problems panel (<kbd>Ctrl+Shift+M</kbd>). "What Etch checks" below lists every
kind. The warning says what is missing and what the game does with it: on `owns = 5075` it starts
with "Province 5075 is not on the map".

## See which province an ID is

After each province ID that Etch checks, such as `owns = 151` or a `151 = { … }` scope, Etch shows
the province's name in grey: "Constantinople" in the base game. You can tell which province a
line means without looking the number up. The name is the text of the localisation key
`PROV151` in your playset, in the language of `etch.language`. Hover over it to see the key and
the `.yml` file it comes from. An ID the map does not have gets no name: its warning says why.
When you save a `.yml` file, Etch reads the names again.

To turn the names off, open Settings (<kbd>Ctrl+,</kbd>), search for `etch.editor.provinceNames`
and clear its checkbox.

## Check the whole playset

To find every such line, also in files you have not opened:

1. Run **Etch: Check Province IDs and Names in the Playset** from the Command Palette
   (<kbd>Ctrl+Shift+P</kbd>). Etch checks every script file your playset loads, from the game and
   from all its mods.
2. A message says how many IDs or names it found and in which mods, and the Problems panel opens
   with every line. Click one to go to it.

The **Etch** output, in the Output panel, lists the same lines, each with the mod it comes from.
When there are none, the message says that every province ID and name is defined. Files you have
not opened keep their warnings in Problems until the next check.

This check does not list two kinds of warning in Problems: a second history file for a province,
and a tag without a history file (both under "What Etch checks" below). A big mod can have
hundreds of them, so the message gives a count for each mod and each kind instead, such as "793
files of My Mod add a second history to provinces of the game" or "1032 tags of My Mod have no
history/countries file". The **Etch** output has the same count, with the files under it. When the
check finds nothing else, the message has a **Show Output** button that opens the **Etch** output.
Open one of these files to see its warning in the editor.

If Etch cannot find the game, the check asks you to set `etch.gamePath`: see
[Where Etch finds the game](../getting-started/finding-the-game.md).

## Your playset's map

Etch checks against the map of your playset (the game, your mod and the mods it builds on), not
the base game's. A province ID is on the map when both are true:

- it is from 1 to one less than `max_provinces` in `map/default.map` (a mod's own `default.map`
  when it has one);
- `map/definition.csv` lists it. An ID that `definition.csv` does not list gets a warning too.

The names come from your playset as well: its `common/ideas`, `common/policies` and the other
files named below. When you save a map file or a file that defines names, or change
`etch.gamePath` or `etch.playset`, Etch reads the playset again and checks your open files again.

## What Etch checks

Each crash on this page was tested in the game.

### Province IDs in scripts

Etch reads the script files of `events`, `decisions`, `missions`, `common` and `history`. It also
reads those of `customizable_localization`, whose triggers the game runs when it shows a text that
uses them. In them, it checks:

- province triggers and effects: `owns`, `owns_core_province`, `province_id`, `add_core`,
  `add_permanent_claim`, `set_capital` and more, as in `owns = 5075`;
- province scopes, as in `5075 = { … }`;
- IDs such as an event's `goto`;
- `who` of `province_distance`, `node` of `trading_policy_in_node`, and the `province` of a war
  goal in `history/wars`;
- a province you pass to a scripted effect or trigger that uses it as a province. Vanilla's
  `create_colony_mission_reward = { province = 1104 }` is one: its effect scopes to `$province$`.
  Etch looks in your playset's `common/scripted_effects` and `common/scripted_triggers` to see
  which `$…$` values are used as provinces, also when one scripted effect or trigger hands the
  province on to another;
- negative IDs, such as `owns = -1`: the game reads the minus sign as written, and no province has
  such an ID;
- a `history/provinces` file whose name does not start with the ID of a province on the map, such
  as `4999 - Past.txt` on 4941 provinces, or `Uppland.txt`. The warning is on its first line: the
  game skips the file without a word.
- a mod's `history/provinces` file for a province that the game already has a file for under
  another name, such as `1 - Uppland.txt` beside the game's `1-Uppland.txt`. The warning is on its
  first line. The mod's file does not replace the game's: the game reads both into the province's
  history. To replace the game's file, give yours the same name, or replace the whole
  `history/provinces` folder with `replace_path`.

### Lists and map files

- The province lists of colonial regions and trade company regions (`provinces` in
  `common/colonial_regions` and `common/trade_companies`) and of trade nodes (`members` in
  `common/tradenodes`).
- A great project's `start`: a province that is not on the map there crashes the game when a new
  game starts.
- A religion's `holy_sites`: the game looks these provinces up, without a check, when it shows the
  religion tab of a country of that religion.
- The lists of `map/default.map`, such as `sea_starts` and `lakes`.
- A map file that `map/default.map` names and neither the game nor any mod of your playset has,
  such as `climate`, `region` or `adjacencies`: the game crashes or stops loading the map without
  it.
- A `canal_definition` in `map/default.map` whose `map/<name>_river.bmp` your playset does not
  have: the game stops loading the map without it. A canal whose picture does not fit inside the
  river map at its `x` and `y` gets a warning too: when the canal is built, the game copies the
  picture there without checking that it fits.
- The lists of the climate file and the IDs of the trade winds file: `map/climate.txt` and
  `map/trade_winds.txt`, unless `map/default.map` names other files.
- `From` and `To` of each line of `map/adjacencies.csv`, and `Through` of a `sea` link.
- Negative IDs in the continent, positions and province group files: `map/continent.txt`,
  `map/positions.txt` and `map/provincegroup.txt`, unless `map/default.map` names other files. In
  these three files, the game skips IDs past the map's last province, but not negative ones.
- A row of `map/definition.csv` whose ID is negative or at least `max_provinces`, or whose red,
  green or blue is outside 0 to 255. The game accepts both kinds of row without checking them. A
  row with such an ID crashes the game while it loads the map, when it draws the borders.
- A line of `common/technology.txt` that names a technology file, such as
  `adm_tech = "technologies/adm.txt"`, when neither the game nor any mod of your playset has that
  file. The game reads each of these files while it starts, and crashes without it.

### Country tags and country files

- A tag in `common/country_tags` whose country file, as in `SWE = "countries/Sweden.txt"`,
  neither the game nor any mod of your playset has. The game reads every tag's file while it
  starts, and crashes without it.
- A tag that an earlier line or `common/country_tags` file already defines. The game keeps the
  first, leaves the later one out and does not read its file.
- A tag that is not exactly three characters long, such as `ZZEX = "countries/Zzex.txt"`. The game
  leaves it out without a word.
- A mod's `common/country_tags` file after which the playset has no `PIR`, `NAT` or `REB`. The
  warning is at the start of the file: without these tags, the game stops before it has finished
  starting.
- A country file with no `color`, no `monarch_names`, or fewer than ten `leader_names` or
  `ship_names`. The game writes a line about each of these in `error.log`, and Etch gives a
  warning for each. Like the game, Etch skips the first two tags the game reads, which are `REB`
  and `PIR` in the base game.
- A mod's `history/countries` file for a tag that the game already has a file for under another
  name, such as `SWE - My Sweden.txt` beside `SWE - Sweden.txt`. The mod's file does not replace
  the game's: the game reads both into the country's history.
- A tag in `common/country_tags` that has no file in the `history/countries` folders of your
  playset: no file whose name starts with the tag, as `SWE - Sweden.txt` does for `SWE`. The
  warning is on the tag. The game writes that the country "is missing a history file" in
  `error.log`, and goes on without a history for it. To give the country a history, add a file
  whose name starts with its tag.

### Names of idea groups, ideas and graphical cultures

Etch checks these names against the idea groups and ideas in your playset's `common/ideas`. Here
capital letters matter, as in the game.

- `add_idea_group` and `remove_idea_group` with an idea group your playset does not define, and
  `remove_idea` with an idea it does not define. The game crashes as silently as on a missing
  province. For example, `add_idea_group = Aristocracy_ideas` gets a warning: the idea group is
  `aristocracy_ideas`.
- `has_idea` with an idea your playset does not define. The game writes "Invalid idea" in
  `error.log` but still keeps the trigger, and crashes when it shows the trigger's tooltip.
- `change_graphical_culture` with a graphical culture that your playset's
  `common/graphicalculturetype.txt` does not list. Etch ignores capital letters in this one.

### Names that crash only when their tooltip shows

For these triggers and effects, the game crashes on a missing name only when it shows their
tooltip, for example when you hover over a decision or an event option that uses them. Etch
ignores capital letters when it compares these names. It does not check them inside a
`custom_trigger_tooltip`, which shows its own text instead.

| Trigger or effect                                               | Its names come from                      |
| --------------------------------------------------------------- | ---------------------------------------- |
| `has_active_policy`                                             | `common/policies`                        |
| `enable_religion`                                               | `common/religions`                       |
| `likely_rebels`, `has_spawned_rebels`, `has_not_spawned_rebels` | `common/rebel_types`                     |
| `has_disaster_progress`'s `disaster`                            | `common/disasters`                       |
| `current_icon`                                                  | the orthodox icons of `common/religions` |
| `has_active_estate_agenda`                                      | `common/estate_agendas`                  |
| `advisor`                                                       | `common/advisortypes`                    |

### Names that crash whenever the trigger runs

These are worse: the game crashes whenever it checks the trigger. In a decision's `allow`, that is
on the first day of the game. So Etch checks them inside a `custom_trigger_tooltip` too.

| Trigger                                     | Its names come from   |
| ------------------------------------------- | --------------------- |
| `provincial_institution_progress`'s `which` | `common/institutions` |
| `num_of_religion`'s `religion`              | `common/religions`    |
| `had_active_policy`'s `policy`              | `common/policies`     |

### Script in quotes

Script inside quotes is checked too, such as the `first_effect = "…"` of vanilla's
`simple_dynamic_effect`: the game runs it in place of the scripted effect's `$first_effect$`. The
quoted text may run over several lines; Etch reads it as the game does.

## What it doesn't do

- An ID written as a tag, a scope or a variable is not checked.
- A scripted effect's `$argument$` is not checked for names, as in `add_idea_group = $group$`.
- Names you pass to a scripted effect or trigger, the values of its `$…$`, are not checked either.
  Province IDs you pass are (see above).
- `has_idea_group` is not checked: the game reports a missing idea group in `error.log` itself.
- In `change_graphical_culture`, a country tag or a scope is not checked.
- A name that crashes the game only in a tooltip is not checked inside a `custom_trigger_tooltip`.
- Etch does not check that a country file exists when its name has a letter such as `ö`, as in
  `Jötunnheim.txt`.
- Etch warns about a second history file for a province or a country only when the game has a file
  for it too. Two files from mods, for a province or country that the game has no file for, get no
  warning.
