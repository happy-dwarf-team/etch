# After v2

Etch 2.0.0 is the scope of the [v2 specification](v2.md), frozen at that
release on 1 November 2026. This file is the living list of what it left (and,
briefly, what was settled since): the
work v2 put out of scope (its section 16), what the 2.0.0 trial found but did
not fix ([docs/release-2.0.0.md](../release-2.0.0.md), "The trial" and "Live
game"), the open issues and the open points, those of v2's section 17 and those
of the offline renderer that [after-v1.md](after-v1.md), the record of 1.x,
kept until 2.0.0. When implementation learns something that changes an entry, a
pull request changes it here, until the next version gets its own
specification.

## Not in v2

From section 16 of the v2 specification, with v1's entries that v2 did not take.
Split on 9 November 2026 (eu4-engine-lab#17, Q7; the v3 draft, [v3.md](v3.md)
section 8): **in v3** the profiles for more windows and for Anbennar's own
countries; **later** the profile skeleton, the headless mode for CI and more in a
live snapshot; **not planned** a UI scale other than 1.0, editing in the preview,
ironman saves, faithful offline rendering and checking 3840×2160; the media
refresh goes out with a 2.x release (v3.md section 7).

- **Editing in the preview** (drag, an attribute panel writing back to `.gui`).
- **Headless mode for CI:** diagnostics and precision checks without VS Code.
  `core` stays free of `vscode` so the mode remains possible.
- **Faithful offline rendering:** sprite, frame, font and colour per widget
  from the game (about 1–2 weeks of reverse engineering), only if pixel diffs
  prove too weak to diagnose corpus failures.
- **UI scale other than 1.0.**
- **Ironman and other binary saves**, melting or writing saves: only if
  Paradox publishes or licenses a token table.
- **Deriving scripted groups** of a profile from `custom_window` and
  `potential` beyond what "Done since 2.0.0" lists below: exclusive groups that
  a mod's effects make (flags set one at a time, nested `potential`s).
- **Profiles for more windows and other big mods** (Dwarven Knowledge and
  others), and captures of the state tab, `colonisationpanel` and Anbennar's
  `aPUI_*` windows.
- **More in a live snapshot:** code-set sprites and frames (below), tooltips
  (with a new snapshot `formatVersion` once `tongs.ui` reads them), and
  exporting a snapshot.
- Checking the **3840×2160** preview resolution against the game on a machine
  with a 4K screen. It is in the corpus and the preview but unconfirmed, as no
  window of the lab holds a 2160-pixel client area; it gates nothing and the
  preview marks it as not measured against the game. Its `if_resolution` band
  and size step are those of 3440×1440 in every corpus playset (etch#163).
- **A media refresh** showing the live game and a popular view, made with
  Etch's own demo mod: a release step after v2.

## Left open by the 2.0.0 trial

- **Code-set sprites and frames.** The game's code sets the terrain picture,
  the shields' flags, the trade goods, the frame of a building under
  construction and the locked slot; a live snapshot had only the fields of
  `tongs.ui` version 1, so the preview drawn from it differed there (v2
  section 7, "Not in v2"). Seen in both trial runs against the game, on
  `cffbf88` and `c2cf182`. A snapshot now carries the sprite, frame and flag,
  and the texture files, rebels and pie charts too ("Code-set sprites, frames
  and flags from a snapshot" below); left: the flags the game makes, building
  slots the snapshot calls hidden and the sprites of widgets from other
  definitions.

## Done since 2.0.0

- **Area and region names in sample data.** A profile's `content` takes a `map`
  source, `area` or `region`: the chosen province's area, or its area's region,
  from the playset's map files (the area and region files the winning
  `map/default.map` names), localised, in the `files` layer of `Data ▾`. The
  map is read once per session. The vanilla province view shows them in
  `area_name`, `region_name` and the state tab (`states_tab_button`), the
  province's name on its own tab (`province_tab_button`, from the save) and
  the trade node's name on `tradenode_button` (the save's `trade`, localised),
  as every province view of the corpus shows them in the game. The state
  window's `state_name` stays generated: no capture shows it.

- **Scripted selectors from `common/custom_gui` (a profile skeleton).**
  **Etch: Add Scripted Selectors to the Window Profile** reads the playset's
  `common/custom_gui` and, for each widget of the previewed window (below its
  top) that a `custom_…` entry with a `potential` names, adds to the mod
  project's `.etch/profiles/<window>.jsonc` a `scripted` selector (its id the
  widget's name, `shown` or `hidden`, the file, the entry's type and the
  `potential` on one line in its note) and a rule `<id>-hidden` that hides every
  widget of that name. The file is created when needed; ids it already has are
  kept as written, so a second run adds only new widgets. A name scripted twice
  takes the later file's entry. Etch still evaluates no trigger, and an entry
  without a `potential` (shown whenever its window is) gets no selector.

  The command also reads two simple kinds of `potential`:
  - **Constant.** `always = yes` gets nothing; `always = no` gets a rule
    `<id>-never` that always hides the widget.
  - **One test.** A `potential` that is only a test of a single-valued trigger
    (`tag`, `religion`, `government`, …), against a value that is not a scope,
    joins the window's other tests of that trigger into one selector,
    `scripted-<trigger>`. The selector has a value per tested value plus
    `other`, and a rule per value. This happens when the window tests the
    trigger against two or more values.

  Widgets with the same `potential` (compared with spaces and comments
  normalised) share one selector, named after the first of them, and one rule
  that hides them all.

  In Anbennar this leaves `countrygovernmentview` 104 selectors instead of 173,
  since 67 of its scripted widgets are `always = yes`.
  `countryreligionview`'s panels for ten religions become one selector. With shared
  `potential`s, `countryreligionview` has 56 selectors instead of 88 (the Noukahi pilgrimage
  panels share three), `countrydiplomacyview` 45 instead of 86 (40 subject buttons share one), and
  `provinceview` 141 instead of 170.

  **Labels from localisation.** A selector's label is the widget's name, followed by the
  playset's text of the entry's `tooltip` in plain form: no icons, colour codes, variables or
  scripted text, cut at 60 characters. A group's values are labelled with the localised names of
  the tested values (religions, tags, cultures). A key with no text, such as Anbennar's
  placeholder `localisation_key`, leaves the name alone.

- **The latest script profile (lab#166).** **Etch: Show Latest Script Profile**
  reads the newest `logs/script_profile_*.csv` that Anvil's
  `anvil-script-profiler` (lab#158, Anvil 1.22) wrote, in the player's game
  profile or the live game's private one, and shows it as a Markdown preview:
  the span, an `interrupted` status, and the longest rows of the triggers and
  the effects with calls, total, mean and `max`. Columns are found by the
  header's names, so a later format's new columns are left out with a note.
  The rows without an owner are summed into one, as the profiler's window does.
  The profiler's v1.1 (lab#165, Anvil 1.22) adds church aspect and scripted
  trigger owners and a third list, scripted triggers by name, which the page
  shows between the triggers and the effects when the file has it.
  Each name links to where its owner is written, at the block the row measured
  (an event's `trigger`, an option's `ai_chance`, a decision's `allow`), in the
  playset of the first workspace folder, or the game folder without one: events
  by their `id`, decisions and missions by their key inside their group, the
  rest by their top-level key, in the owner's folder and its subfolders. A key
  defined more than once links to the first in file order and says how many
  more there are. A file is parsed only when its text may define a wanted name:
  the 90 rows of an Anbennar profile take about 0.8 s, 88 of them found (the
  other two have no owner). The other way round, once a profile is shown, a
  CodeLens above each block it measured in a `.txt` file (the owner's kind from
  the file's folder, as above) sums its rows by list, triggers apart from
  effects since an effect's time includes its `limit`s, a scripted trigger from
  the list of its uses; an event's lens includes its options, and each measured
  option has one of its own. The lens opens the profile; **Etch: Hide the Script
  Profile in Script Files** removes the lenses. Not in it: starting a
  measurement from Etch.

- **Run selection (lab#156).** The selected script, or the statement on the
  cursor's line, runs in the live game through the plugin's new `run` job and
  the game's console `run`: effects in the player's country or the province on
  screen, or the selection checked as a trigger whose answer comes from
  `game.log`. The run's `error.log` lines go to Problems on the selection. The
  plugin refuses it in ironman and multiplayer; the first Run of a game session
  says that only the private copy changes, and **Continue** marks a save written
  after a Run. Decision (lab#65): Etch's own plugin and pipe, not Tongs, and
  `affects_gameplay` stays `false`. The gate on unreadable triggers passed: the
  run leaves `Unknown trigger type` in `error.log`, shown beside a TRUE. A block
  that does not close runs without any error, so Etch refuses unbalanced braces.
  docs/live-game.md, "Run selection" and its live run.

- **Province ids the map does not have (anvil#426).** EU4 1.37.5 takes the
  province id of `owns = 5075` without a range check and writes nothing to
  `error.log`; `owns` reads past the province table, which crashed the game
  when Bellows' allocator left that memory reserved (EU4 engine lab, 16
  November 2026). Etch warns (`province-id-out-of-range`) about an id of 0 or
  of at least `max_provinces` of the playset's winning `map/default.map`, and
  (`province-id-not-defined`) about one below it that the definition file it
  names (`definitions`, `definition.csv` by default) does not list. It reads
  the `.txt` files under `common` (but `province_names`), `events`,
  `decisions`, `missions` and `history`: the integer values of the keys in
  `PROVINCE_ID_KEYS` (36 triggers, effects and properties such as `owns`,
  `add_core`, `goto`, `home_province`; 30 that vanilla uses with integers
  only of its provinces, checked over 7811 files, and six that only mods give
  integers: `owns_or_subject_of`, the name that replaced `owns_or_vassal_of`
  in 1.20 and the one mods use 2256 times, `is_state_core`,
  `is_territorial_core`, `subject_owns`, `add_territorial_core` and
  `undiscover_province`, whose classes index the province table the same
  unchecked way) and the integer keys of
  blocks, which are province scopes except `random_list`'s weights, a
  `trigger_switch`'s values when its `on_trigger` is not one of those keys,
  the top level, and the properties of a database entry in the other `common`
  folders (an imperial incident's `0 = { … }`). `map/default.map` itself gets
  the same check of its `sea_starts`, `lakes`, `force_coastal` and
  `only_used_for_random`. Warnings come for the open documents as they are
  typed, against the playset of the first workspace folder; **Etch: Check
  Province IDs in the Playset** checks every file the playset loads and puts
  the rest in Problems, for a player looking for the mod behind a crash. Over
  vanilla, Anbennar (its own map, 7039 provinces), Extended Timeline and the
  other Workshop items on the lab's disk (66, each against its own map,
  vanilla's or Anbennar's for its submods) it warns only about one mod that
  uses provinces 5152 and 8042 on the vanilla map. Not checked: the map's own
  files (`area.txt`, `positions.txt`) and a trade node's `outgoing` paths.

  The province lists of `common/colonial_regions` and `common/trade_companies`
  (`provinces = { … }`) and of `common/tradenodes` (`members = { … }`) are
  checked since 18 November 2026: the game reads them as integers with no
  range check (it logs only an id listed twice) and indexes the province table
  with every id, for a colonial region's center point while the file is read
  and for its name, for each trade company region's provinces when the game
  starts, and for a trade node's members, whose provinces it writes the node
  into (EU4 engine lab, the code that reads the colonial regions and the trade
  nodes).
  Vanilla lists 3290 ids in the regions and 3369 in the trade nodes, all on its
  map; a trade node's `location` was already checked.

  A `history/provinces` file's province comes from its name: the game takes
  it with `atoi` (`123 - Name.txt` is 123, a name without a leading number 0)
  and reads only the files of provinces from 1 to `max_provinces - 1`,
  skipping the others without a line in `error.log` (EU4 engine lab,
  18 November 2026). Etch warns about such a file
  (`province-history-not-read`, an empty range at the file's start). Vanilla's
  3923 files all give provinces of its map. Of the 68 Workshop items on the
  lab's disk, one total conversion has 47 files for provinces 4952 to 4998 on
  its map of `max_provinces = 4952`, which the game never reads.

  A static reading of the game's trigger and effect code (EU4 engine lab,
  `docs/script-unchecked-indexes.md`, 16 November 2026) found the cause: the
  game has a checked province accessor that logs an out-of-range id, but the
  triggers and effects index the province table directly, after reading the
  value with `atoi`, which keeps a sign. Etch therefore also flags a negative
  id (`owns = -1`; a `-1 = { … }` key stays unchecked, its parsing not being
  known) and the two block members the game reads as province ids:
  `province_distance`'s `who` (the game logs only ids below 1) and
  `trading_policy_in_node`'s `node` (ids below 2 silently mean the scope's
  province). Vanilla and the 66 Workshop items have no negative value on these
  keys, and the members add no warning over them.

  A war goal's `province` (`war_goal = { type = take_claim casus_belli =
  cb_claim province = 518 }` in `history/wars`, and in saves) is a third such
  member (EU4 engine lab, 18 November 2026): the game reads it with `atoi`
  and keeps it, and the war goal's name, description and controller index
  the province table with it, checking only that it is not negative. Vanilla
  gives it 233 ids and the 68 Workshop items on the lab's disk 416, all on
  their maps, so it adds no warning there.

  A province id can also reach the game through a scripted effect's or
  trigger's argument: vanilla's `create_colony_mission_reward = { province =
  1104 }` runs `$province$ = { … }` with the text of the call in its place,
  which is the same unchecked scope. `loadProvinceIds` now reads the playset's
  `common/scripted_effects` and `common/scripted_triggers` and keeps, for each
  definition, the arguments its body uses where a province id goes (a province
  scope's key, the value of a key in `PROVINCE_ID_KEYS` or `PROVINCE_ID_MEMBERS`,
  or an argument of that kind of another call it passes them to, followed
  through chains); the call's integer value of such an argument is checked like
  `owns = 151`. Vanilla has 38 such definitions; the arguments that are
  countries or scopes cost nothing, as only an integer at the call is checked.
  Over vanilla the check reads 125 more ids (`province` and `give_claims`' `id`),
  all on the map; over Anbennar, whose 210 definitions take
  such arguments (`$order$ = { … }` in its racial interface, `capital_id`,
  `node_id`), 916 more, also all on its map. None of the 68 Workshop items on
  the lab's disk, each on the game alone, gains a warning.

  The checks (province ids and the names below) also read
  `customizable_localization`: its `defined_text` entries hold triggers the
  game evaluates when it shows a text that names them, such as vanilla's
  `owns = 310` and `province_id = 400`. Vanilla's six files give 14 more ids
  and two scopes, all on the map; the 13 Workshop items on the lab's disk with
  such files give 223 ids and 382 scopes, and none of the 68 items gains a
  warning.

- **Names that crash the game (anvil#426 follow-up).** EU4 1.37.5 looks up
  the idea group of `add_idea_group` and `remove_idea_group` once, when it
  reads the file, and keeps the result without a check; the effect, run or
  shown in a tooltip, then calls into a null pointer. In the lab's game
  (17 November 2026, Russia 1719 save, a test event fired from the console)
  `add_idea_group = maritime_ideas` ran, `add_idea_group` and
  `remove_idea_group` with an undefined group crashed with an access
  violation at address 0, and `error.log` had no line for either, while
  `has_idea_group` with the same name logged `Invalid idea group for
  idea_group trigger`. `remove_idea` keeps an unknown idea the same way (read
  in the game's code, not run); `add_idea` falls back to a null idea and is
  safe. Etch warns (`unknown-idea-group`, `unknown-idea`) about a value of
  these effects that the top-level blocks of the playset's winning
  `common/ideas` files, or their ideas, do not name, compared
  case-sensitively as the game's lookup does (a hash of the bytes and a
  `memcmp`, read in its code, not tried in the game); a value with `$` (a scripted
  effect's argument) is skipped. The warnings share the province id check's
  files, live diagnostics and playset command, renamed **Etch: Check
  Province IDs and Names in the Playset**. Over vanilla (555 idea groups,
  3788 ideas; no file uses the three effects) and the 67 Workshop items on
  the lab's disk (25 uses, 21 of them in Anbennar) it warns about nothing.
  The same reading found tooltip-only crashes on unknown names of
  `has_active_policy`, `had_active_policy`, `enable_religion`,
  `likely_rebels`, `has_disaster_progress`, `current_icon` and
  `num_of_religion`; the next item checks them.

- **Names whose tooltip crashes the game.** A reading of the game's trigger
  and effect code (EU4 engine lab, 17 November 2026) found more keys that
  keep an unknown name's lookup unchecked: their check after loading looks the
  name up again but logs nothing, and the validation passes ignore what it
  returns. Where their run was read, it only compares or checks the
  pointer, but building their tooltip or description reads through it: `has_active_policy` and
  `had_active_policy`'s `policy` (`common/policies`), `enable_religion` and
  `num_of_religion`'s `religion` (the religions of `common/religions`: the
  blocks of a religion group that set `icon`), `likely_rebels`
  (`common/rebel_types`), `has_disaster_progress`'s `disaster`
  (`common/disasters`) and `current_icon` (the `orthodox_icons` of those
  religions). Etch warns about these names too (`unknown-policy`,
  `unknown-religion`, `unknown-rebel-type`, `unknown-disaster`,
  `unknown-icon`), each kind only when the playset has files in its folder;
  `num_of_religion`'s `religion` may be a scope (`ROOT`, `FROM`, a tag),
  which is skipped. The tooltip path was read in the code, not run in the
  game, and whether these lookups are case-sensitive was not read, so these
  names are compared ignoring case. Inside a `custom_trigger_tooltip`, which
  shows its own text instead of its triggers', they are not checked. Over
  vanilla (203 policies, 28 religions, 5 icons, 50 rebel types, 55
  disasters) it warns about nothing. Over the 67 Workshop items on the lab's
  disk, each with the game and Anbennar for its submods, the only names it
  would flag are in Anbennar's `has_orthodox_religious_icon_trigger` (and a
  submod's copy of it), which still names the five vanilla icons that
  Anbennar's religions no longer define; that trigger sits in a
  `custom_trigger_tooltip`, so it is skipped. It flags one name: an event
  option of Challenger's Flavour Bonanza Mod (438503893) has
  `enable_religion = hussitism`, while the mod's religion is `hussite`.

- **More names the game keeps unchecked.** A second reading (EU4 engine lab,
  17 November 2026) traced each trigger keyword through the EXE's token
  table to the class the game builds for it, and found four more keys with
  the same unchecked lookup. `has_spawned_rebels` and
  `has_not_spawned_rebels` share `likely_rebels`' reading
  (`common/rebel_types`), and `has_active_estate_agenda`
  (`common/estate_agendas`) only compares the pointer when it runs: their
  tooltips read through it (`unknown-rebel-type`, `unknown-estate-agenda`).
  `provincial_institution_progress = { which = … }` (`common/institutions`)
  reads through the missing institution whenever it is evaluated in a
  province scope, so its warning (`unknown-institution`) also applies inside
  a `custom_trigger_tooltip`. All four were read in the code, not run in the
  game. The same reading found the estate privilege, age, opinion, casus
  belli, reform, mission, edict and modifier keys safe (they log or check),
  and `has_idea` logs "Invalid idea" but keeps the null pointer, so its
  tooltip likely crashes after the log line; Etch leaves it out, as the log
  names it. Over vanilla (8 institutions, 322 estate agendas) the
  new keys warn about nothing. Over the Workshop items on the lab's disk they
  find two real mistakes: Anbennar replaces `common/rebel_types` without
  `lollard_rebels` but its `estate_lowercastes_crush_religious_revolts`
  agenda still tests `has_spawned_rebels = lollard_rebels` (its `can_select`,
  which the game evaluates but likely never shows as a tooltip), and
  3379313816 comments out the `estate_jains_build_trade_building_in_y` agenda
  but keeps vanilla's scripted trigger that names it.

- **The name crashes tried in the game.** The EU4 engine lab tried one key of
  each kind in a running EU4 1.37.5 on 17 November 2026 (a test mod on the
  Russia save of 17 March 1719, Anvil with Tongs; `docs/script-unchecked-indexes.md`
  in the lab has the crash addresses). Each country decision held one unknown
  name in `allow`, which the decisions view evaluates while it shows the
  decision, and a hover over the decision's tooltip built it. Every key tried
  crashed the game with nothing in `error.log`: `has_active_policy`,
  `likely_rebels`, `has_disaster_progress`'s `disaster`, `current_icon` and
  `has_active_estate_agenda` on the hover, after the view had shown whether
  `allow` held without a crash; `enable_religion` on a hover over the
  event option; `add_idea_group`, `remove_idea_group` and
  `provincial_institution_progress`'s `which` when they ran. `num_of_religion`'s
  `religion` crashed on evaluation, before any hover, so it moves to the
  trigger keys and is checked inside a `custom_trigger_tooltip` too. The
  warnings of the keys tried now say the game crashes; `remove_idea`,
  `had_active_policy`, `has_spawned_rebels` and `has_not_spawned_rebels` were
  not tried, and their warnings still say they were only read in the code.

  A second run that day let the game run a day and found one more:
  `had_active_policy`'s `policy` crashed the game in
  the trigger's evaluation on the first day, in a decision's `allow`
  that no country could take (its `potential` needs a flag no country had), so
  the game evaluates such an `allow` every day. It moves to the trigger keys,
  and its warning says the game crashes. The same run confirmed that
  `num_of_religion`'s crash is in that trigger's evaluation.

  A third run (`ideagrp-r5`) ran three days with `has_spawned_rebels` and
  `has_idea` in shown decisions without a crash, then hovered each: both
  crashed the game, `has_spawned_rebels` where `likely_rebels` does
  (`eu4.exe+0xA91163`) and `has_idea` in its tooltip (`eu4.exe+0xC0EB2D`, a
  read of `0x0`), after its "Invalid idea" line in `error.log`. Etch now warns
  about `has_idea` too, naming that log line, since the line does not say the
  game will crash. `has_spawned_rebels`' warning says it was tried; only
  `remove_idea` and `has_not_spawned_rebels` stay read in the code. Over the
  68 Workshop items on the lab's disk the `has_idea` warning finds 16 names,
  all of which the game also logs as "Invalid idea": Anbennar replaces
  `common/ideas` but keeps vanilla's `00_scripted_triggers.txt`, whose
  colonial triggers name 14 vanilla ideas (`pioneer_spirit`,
  `manifest_destiny`, `AUS_outback_stations`, …), and its submods inherit
  them; Capitals Expanded (2043210489, and its continuation 3487893094) names
  `formalized_officer_corps` and `audit_checks` in a triggered modifier,
  ideas EU4 1.37.5 no longer has. Vanilla has none.

  A fourth run (`ideagrp-r6`) tried those two: `has_not_spawned_rebels` ran
  three days in a shown decision without a crash, and the hover crashed the
  game where `has_spawned_rebels` does (`eu4.exe+0xA91163`); hovering an event
  option with `remove_idea = <unknown>` crashed it in
  the effect's description (`eu4.exe+0x68E453`, a read of `0x0`). Every
  key Etch checks has now crashed the game in a test, and every warning says
  so. The effect keys' text says that running the effect or showing its
  tooltip crashes the game: the idea group effects crashed when they ran,
  `remove_idea` when its description was shown.

  A fifth run (`advtest-r1`, 18.11.2026) tried the keys a static scan of the
  game's name lookups had left: `advisor` with an unknown advisor type
  crashed on the hover over the decision's `allow` (`eu4.exe+0xC111DD`, in
  the trigger's tooltip, a read of `0x0`), and
  `change_graphical_culture` with an unknown graphical culture on the hover
  over the decision's effect (`eu4.exe+0x69139E`, in
  the effect's description). Etch checks both, the second
  against `common/graphicalculturetype.txt` and not when its value is a tag
  or a scope. `ruler_has_personality`, `heir_has_personality`,
  `consort_has_personality`, `has_institution` and `is_institution_enabled`
  with an unknown name logged nothing and showed an empty tooltip without a
  crash, so Etch leaves them out. The same change skips the members of a
  scripted effect's or trigger's call, which are its arguments: Anbennar's
  `Advisor = yes` is not an advisor type.

- **A warning for a `replace_path` the game mishandles.** A `replace_path` on a
  subfolder of a folder the game lists recursively (`interface/assets`,
  `gfx/entities`, `localisation/english`) makes EU4 1.37.5 skip the files
  directly in it: its listing gives their bare names and the loader looks for
  them at the listed folder's top (EU4 engine lab, eu4-engine-lab#56 and #59).
  `GameFiles` still shows them, so the preview differs from the game. The
  playset now warns (`replace-path-hides-files`) when that subfolder holds, in
  the mod or a later one, a file the game loads from that root (`.gfx`/`.gui`,
  `.yml`, `.txt` for events, `.asset` for `gfx`, `sound` and `music`); entries
  such as `gfx/loadingscreens` with no such file stay quiet. It fires for none
  of the 51 Workshop items on the lab's disk, Anbennar's 23 entries included.
  Whether `GameFiles` should also hide those files, as the game does, is left
  open.

- **Localisation inlay hints (ADR 0008).** A value that names a key of the
  playset's localisation in `etch.language` gets the key's text as an inlay
  hint, in the plain form of profile labels: in `.gui` files `text`,
  `tooltip`, `tooltipText` and `delayedTooltipText`; in the `.txt` files of
  `events`, `decisions`, `missions` and `common` a `title`, `desc`, `name`,
  `tooltip` or `custom_tooltip` at any depth (vanilla writes them on 6,366,
  8,212, 21,449, 2,322 and 5,766 lines there), and also `war_name`,
  `prov_desc`, `country_desc`, `elector_relation`, `demands_description`,
  `mercenary_desc_key`, `custom_ai_explanation` and `reform_tooltip`. These
  eight are the fields CWTools' EU4 rules type as `localisation` whose
  vanilla values are defined keys: 279 of 280 values, all in `common`
  (counted on 25.11.2026; `localisation-references.ts` has the counts and
  the fields left out). A value that no file defines
  gets nothing, so script `name`s that are plain words stay bare. The hint's
  tooltip has the whole text and its file; Go to Definition opens the key's
  line in the winning `.yml`. The localisation is read again after a `.yml`
  is saved; `etch.editor.localisationHints` turns the hints off.

- **Province names after province ids (etch#648, P3.14).** Each integer that
  the province id check reads as a province id (`provinceIdsIn`: the
  `PROVINCE_ID_KEYS` values, `151 = { … }` scopes, the folders' province lists
  and the playset's scripted calls' province arguments) gets the text of
  `PROV<id>` in `etch.language` as an inlay hint, in the plain form of profile
  labels, with the key and its file in the tooltip. An id the map does not
  have gets none, since its warning says why. Only the `PROV<id>` lines of the
  playset's `.yml` files are parsed (`keepLocalisationKeys`), again after a
  `.yml` is saved or the check reads the playset again;
  `etch.editor.provinceNames` turns the names off. Vanilla's script files give
  25,406 such ids, all named in English; the budget is in
  [budgets.md](../budgets.md).

- **The live game's start report (ADR 0007, part 1).** The `error.log` lines
  the game wrote while it loaded go to Problems on the edited mod's files, as
  "Etch game start": on the line or the window the game names, on the file's
  start, or, for a line that names only a key, on the first place the mod
  writes the key; lines about other mods' and the game's files are counted in
  the log
  ([live-game.md](../live-game.md), "`error.log`"). Each start replaces the
  last one's. Checked in the gate run of 21 November 2026 (vanilla):
  [live-game.md](../live-game.md), "The script check: the gate run".

- **Check File in the Live Game (ADR 0007, part 2).** The core's
  `planCheck` reads an event's, a decision's, a mission's, a scripted
  effect's or a scripted trigger's blocks with the script parser and writes
  each as `if = { limit = { always = no … } }` (triggers) or
  `if = { limit = { always = no } … }` (effects), its own lines in between and
  a map from each run-file line to its file line; an `option`'s `name`,
  `ai_chance`, `highlight` and `goto` are left out and its `trigger` is
  wrapped apart, a scripted block with `$` is skipped, a file whose braces do
  not balance is refused, and run files stay under `MAX_SCRIPT`.
  `LiveGame.checkScripts` runs them through the `run` job between reloads
  without a Run mark; `mapCheckErrors` places the new `error.log` lines by
  `near line`, else by the key the line names (`Unknown modifier-type '…'`
  too). Lines that name neither go to the output. Problems source
  "Etch game check"; `etch.liveGame.checkOnSave` (off) checks on save.

- **Completion in `.gui` files (ADR 0008).** Its keys are the table of what
  EU4 1.37.5 reads for each widget (`packages/core/src/model/gui-schema.ts`,
  as in cwtools-eu4-config#448): the widgets `guiTypes` holds, each widget's
  keys and the child widgets it creates, `if_resolution`'s bounds, and the
  fields of `position`, `size` and the other value blocks. The playset's
  files rank them and give their spelling (a key the game reads as a block
  gets `{ }`). Values: the sprite names and fonts of the `.gfx` files (a
  sprite's entry shows its hover with the thumbnail), an enum's words
  (`orientation`, the seven of a `containerWindowType`, `format`,
  `vertical_alignment`), `yes` and `no`, and for a key the game reads as text
  the playset's values when they are at most 16 words and none a number
  (`clicksound`). Nothing is offered in a comment, outside `guiTypes`, or in a
  block the game does not read there.

- **The structure check of `.gui` files.** With the preview's model
  diagnostics, from the same table: a key or child widget the game does not
  read there (`unknown-key`), a key it reads only to log that it does nothing
  (`ignored-key`, logged and ignored: `text`, `font`, `buttonText`, `buttonFont` of `iconType`,
  `size` of `instantTextBoxType`), a value of the wrong kind
  (`wrong-value-kind`), an orientation outside the anchors
  (`unknown-orientation`, which the layout no longer reports), and a fraction
  where the game reads an integer (`fraction-as-int`; a whole `1.0` is not
  reported). All are warnings. Vanilla 1.37.5 gives 29 orientations and 17
  list spacings, as CWTools does with cwtools-eu4-config#448's rules. Vanilla offers 6,829
  sprites and 47 fonts, Anbennar 15,118 sprites; the context takes about 2 ms
  on the largest files (budgets.md). `etch.editor.completion` turns it off.

- **Document symbols for interface files (ADR 0008).** A `.gui` file's widget
  tree (every top-level definition, not only the previewed window) and a
  `.gfx` file's sprites and fonts are document symbols, so the breadcrumbs,
  VS Code's Outline and Go to Symbol in Editor follow them. A widget is named
  as the Widget Outline names it (`<kind>` without a `name`); containers are
  classes, other widgets fields.

- **Sprite references and rename (ADR 0008).** On a sprite name of a `.gfx`
  definition, a `.gui` use (`spriteReferences`) or a script use
  (`scriptSpriteReferences`), Find All References lists the occurrences in the
  winning copy of every `.gfx` and `.gui` file under `interface` and every
  `.txt` file under the folders of `SPRITE_SCRIPT_FOLDERS` (`events`,
  `missions`, `common/estate_privileges` and the `common` folders below)
  (`spriteNamingFiles`), matched without regard to case as `InterfaceIndex`
  matches; an open document's text wins over the file's, and a closed file
  that writes the name is opened so that its ranges follow VS Code's
  decoding. Rename Symbol edits only the files of the workspace mod's layer
  (the edited mod) and is refused (`planSpriteRename`) when another file
  defines or names the sprite, when the mod defines none, when a mod's `.gui`
  names it through an `@constant`, or when the new name is not a bare word or
  is already a sprite. `etch.editor.rename` (window scope, on by default)
  registers both providers or none, so that with it off another extension's
  answers stand alone.

- **Font hovers and Go to Definition (ADR 0008).** On a font name of a `.gui`
  file (`font`, `buttonFont`, through an `@constant` and in `if_resolution`
  too; `guiFontReferences`) and on the `font` of an `objectTypes` entry's
  `textblock` in a `.gfx` file (vanilla's `animatedmaptext`;
  `gfxFontReferences`), the hover shows the font `InterfaceIndex.font`
  resolves (the first definition, as the preview draws), its `.gfx` file and
  layer, `path`, `color` and `border_color` with a swatch, its `.fnt` file
  (characters, line height) and texture (size, format), and a line of sample
  text drawn on the CPU from the atlas as the preview's text shader tints it,
  at 2× for lines of at most 16 pixels. Go to Definition opens the
  `bitmapfont`'s `name`, inside its quotes; in a `.gui` file it steps back
  when CWTools' rules type `bitmapfont` and check `.gui` widgets (ADR 0008,
  "Beside CWTools"). A missing font gets no hover in a
  `.gui` file (its diagnostic reports it) and a hover that says so in a `.gfx`
  file. It has no setting, as the sprite hover has none.

- **Colours in `.gfx` files (ADR 0008).** A swatch and VS Code's colour
  picker on the colours the model reads as colours: each `textcolors` entry of
  `bitmapfonts` and of a `bitmapfont` (`G = { 0 255 0 }`, 0–255 per channel,
  no alpha) and a `bitmapfont`'s `color` and `border_color` (`0xAARRGGBB`).
  A picked colour is written back in the form it had; `{ R G B }` drops the
  alpha. Other colour-like values (`objectTypes`, the 0–1 floats of entity
  files) get none: the model does not read them as colours.

- **Localisation from subfolders.** The game lists `localisation` and then
  `localisation/replace` recursively (the game's reader of localisation folders,
  0x14AE180 in the GOG build 1.37.5.2; EU4 engine lab,
  eu4-engine-lab#59), so a mod's `localisation/english/*.yml` is read; the
  preview read only the files directly in the two folders. It now reads the
  whole tree, and a file anywhere under `localisation/replace` wins as one
  directly in it does. Vanilla, the corpus's mods and the 34 Workshop items on
  the lab's disk with a `localisation` folder have no `.yml` in other
  subfolders, so their previews do not change.

- **The province view's history list has sample entries.** Its code
  (`eu4.exe` `0x133A060`) adds one
  standard list entry of `province_history_entry`, a definition of
  `provincehistory.gui`, per dated change: the year on a year's first entry,
  the month and day, and the change's description. The vanilla profile's
  repeater gives the list four generated entries, laid out as any list box's.
  Captured open on 9 November (vanilla and Anbennar alone, 1920×1080): the
  entries start at the list's top, one entry's height (46 px) apart. The list's
  `spacing = 2` is not added, nor in any other list box of the coverage survey
  (`gp_list`, `accepted_cultures_listbox`, `peace_list`, `privileges_list`…),
  so no list box adds it now. The history button opens `history_window` over
  the side panel, which stays open under it: in the profile it is a selector
  of its own, `history`, not a value of `side`.

- **An uncolonised province shows only `colonisationpanel`.** The coverage
  survey's run of 6 November clicked an uncolonised province in vanilla (Bauchi,
  1161) and in Anbennar alone (421): the game showed `colonisationpanel` and no
  widget of `provinceview`, as `0x1347A50` (etch#155) and the vanilla profile's
  link say. With the profiles, both views have every rect and every widget's
  visibility as the game's (36 and 35 rects, 51 widgets each), from a live
  snapshot and in the profiled preview without one.

- **An `OverlappingElementsBoxType` places its entries as the game does,** and
  the province modifiers have sample entries. The modifiers are not placed from
  `province_modifier_start`: `modifiers` is an `OverlappingElementsBoxType`, and
  the code at `eu4.exe` `0x163D060` places any
  such box's entries. The step is the entry's width plus `spacing`, and when
  the entries' steps are wider than the box, `(width − entry / 2) / count`, so
  they overlap; `format = right` puts the last entry at `width − entry +
  spacing` and the others to its left, `center` moves them to the middle. The
  preview read the format as `left` always and overlapped by another rule (six
  28 px flags in the diplomacy view's 173 px `box` were 29 px apart, against
  26.5 in the game). The rule matches every such box in the coverage survey's
  captures, 1 to 50 entries, in all three formats; vanilla has 82 of these
  boxes. The vanilla profiles' `provinceview` and `colonisationpanel` now give
  `modifiers` one `province_modifier_item` per modifier in the save.

- **A government mechanic's windows where the game shows them.** A window that
  `common/government_mechanics` names with `gui` has no place of its own: its
  negative positions count from its row of `specific_governments_list`, so
  alone at the top of the screen it drew nothing (Anbennar's `drakonshan_bar`,
  reported by a mod author). The preview now draws it in
  `countrygovernmentview`, among its mechanic's rows, with the list's place and
  the rows as read in `eu4.exe` and measured in the game
  ([government-mechanics.md](../government-mechanics.md)). A list also places
  its entries itself: the `position` of an entry's window no longer counts,
  which moves `diploactionentry_category` 20 px up, to where the game has it.

- **The military tab with Cradle of Civilization** (etch#254, from the coverage
  survey). With the DLC the game moves most of the tab down by the height of
  `army_professionalism` (16 px), as the `.gui`'s own comment on that window
  says and eu4.exe's code does (0xFBC0A0); the background, the close button
  and the title stay. The vanilla profile `countrymilitaryview` has a `cradle`
  selector (`game.cradleOfCivilization`, default yes) and that offset; Anbennar
  and Bigger UI keep the 16 px and take it from the vanilla layer. In the
  survey's outline with the profiles the tab's 26 views (vanilla, Anbennar
  alone, Bigger UI, both sizes) have every rect exact; the corpus, which has no
  military tab, still passes (240 of 240). Left in etch#254 and settled since:
  `activate_all`, `slacken_button` and `button_makeheirgeneral` move with the
  tab like the rest (667 and 986 at 1920×1080 in the survey's captures, the
  `.gui` place of the screen's height plus 16); no code places them. The widget
  at `this+0x668` is `domesticpanel_naval_doctrine_select`, the naval doctrine
  choice the tab opens (the military view's setup, `0xFAEDC0`), which moves
  down 16 px with the tab: its own vanilla profile does so, and the survey's
  capture of it matches. Without the DLC the same function hides
  `army_professionalism`, `CoCbackground` and `slacken_button` and shows the
  plain `background`; the profile follows it.

- **The `_not_exploitable` base values** (left open by the 2.0.0 trial). A
  capture of the province view without Cradle of Civilization (a new 1444
  game saved with the DLC off, 9 November 2026) agrees with the vanilla
  profile's `exploit: no`: the exploit buttons hidden, and the three base
  values at the y of `development_value_vertical_position_not_exploitable`.
  The same run's capture of the military tab confirmed etch#340.

- **A text box is as large as the game's font measures it** (etch#264, from
  the coverage survey). The game measures a box by one rule (`0x159E510`) and
  draws its lines by another (`0x15988E0`), so "Aggressiveness:" in a 64 px box
  is drawn whole on one line, in a rect three lines high, and "1.75M" in 30 px
  is one line in a rect of two. etch#266 broke such words between their
  characters, reading the rects as drawn lines; etch#304 measures as the font
  does and draws such a word whole, as the game does. Left open by etch#266 and
  settled since: "Aggressiveness:" (the rect, etch#304) and the rebels'
  description, `onsiegewon_desc`, one line in the game and two in the
  preview. Its code (`0xF9B290`)
  sets `REB_NO_EFFECT` first with the height left open (the text set with
  `true`), which makes that one line the box's `maxHeight`, so the rebels'
  effect after it is cut after one line with " ...", though the `.gui` gives
  room for two. A profile's content says so with `sizedBy`, and the vanilla
  `countrystabilityview` profile does: in the survey's preview from a snapshot
  no text box is a different size than in the game any more.
- **Selectors that fit a snapshot only together** (etch#257, from the
  coverage survey). `liveSelectors` chose one selector at a time against the
  others' current values, so a rule that needs two (Anbennar's `hre-foreign`:
  in the empire and foreign) fitted with neither: in a foreign province
  `owner`, `hre`, `capital`, `tradePort`, `subPanel` and `buttonBar` all came
  out unknown. The unknown ones are now tried together while their
  combinations are few. In the survey the unknown selectors of Anbennar alone
  went from 32 to 12; what is left is a view caught between the province and
  state tabs, vanilla's `fort` (`fort_number` shown empty without a fort) and
  the main menu's `page` (the continue button follows the saves).
- **Code-set sprites, frames and flags from a snapshot** (left open by the
  2.0.0 trial; seen again on the Etch website's `snapshot` loop with Etch
  2.12.0, in the province view of Kaluga in the Russia save of 1719: the
  texts matched, but the terrain picture, the religion icon, the owner's and
  the core's shields, the unrest shield, the trade node's colour, the province
  modifiers' icons (`? ? ?`) and the building slots were the `.gui`'s
  placeholders). A snapshot's buttons, icons and check boxes carry `sprite`,
  `frame` and `flag` from a Tongs whose `tongs.ui` reads them (0.37: new
  members at the end of `TongsUiWidget` within version 1, Tongs ADR 0002), and
  the preview drawn from it takes them. Read in `eu4.exe` 1.37.5, Steam and GOG:

  | What the game's code sets | The game state Tongs reads | In the preview |
  | --- | --- | --- |
  | the sprite: the terrain picture, a building's icon, the locked building slot, a province modifier's icon | the widget's render node's object type, whose name is the `.gfx` name | drawn as named when it is neither the `.gui`'s sprite nor one of its size variants, over a profile's |
  | the frame: the religion's icon, the province view's selected tab | the node's frame, which the code sets, from 1 | over the view's frame and the ticked check box's second |
  | a shield's flag: the trade node's owner, a core | the shield's country index, the country whose own tag the country database holds | `gfx/flags/<tag>.tga` in the mask, under the overlay |
  | a texture file on the sprite: a province modifier's icon, whose sprite stays `GFX_idea_unknown` | the texture file the game's code gave the render node (`texture`) | that file, whole, over the size of the sprite's own texture |
  | a shield's rebels: the likely rebels (`unrest`) | the rebel type the shield's custom value names (`rebels`) | `gfx/flags/<name>.tga` in the mask (`REB.tga` when the playset has none), under the overlay |
  | a pie chart's slices: the trade node's colour, the trade node window's power charts | the chart's slices, each a percent and a colour (`slices`) | a new `pie` draw (draw list version 3): a triangle per percent with `color.shader`, counter-clockwise from 3 o'clock, around the widget's bottom-left corner with its size as radii |

  Checked in the game on 19.11.2026 (Kaluga, as above, Tongs and Etch from
  this change): the snapshot gave `GFX_combat_terrain_woods`,
  `GFX_icon_religion_small` frame 4 (Orthodox), `RUS` on the trade and core
  shields, `GFX_hostile_attrition` for the third modifier and
  `GFX_locked_building_slot`, and the preview drawn from it showed them as the
  game did; Etch 2.12.0 drew hills, the Catholic cross, empty shields, `?` and
  a building.

  Verified in eu4.exe 1.37.5, in the masked sprite's set-up and the shield's drawing:
  the flag is drawn whole into a quad the size of the mask (`textureFile2`),
  half the difference of the overlay's and the mask's sizes in from the
  overlay's corner, and the overlay (`textureFile1`) over it; vanilla's small
  shield is a 24-pixel mask in a 32-pixel overlay. The playset's interface
  lists `gfx/flags` for it, as no interface file names the flags. A sprite the
  playset does not define, a tag without a flag file and a snapshot from an
  older Tongs draw as before.

  The texture files, the rebels and the pie charts came later, with `texture`,
  `rebels` and `slices` from Tongs (tongs#239). A texture file no interface
  file names (the game's code picks a modifier's icon from
  `gfx/interface/ideas_EU4/`) is looked up when a preview is drawn from the
  snapshot. Checked in the game on 19.11.2026 (Kaluga, as above, Tongs and
  Etch from those changes, the snapshot drawn headless by the compare
  package): the snapshot gave Kaluga's first two modifiers
  `gfx/interface/ideas_EU4/local_unrest.dds` and `winter_severe.dds`, the
  likely rebels' shield `anti_tax_rebels`, `trade_pie` one slice of 100
  percent `#a53a3aff`, and the trade node window's `income_sharing_power`
  five slices (1, 46, 1, 2 and 50 percent). The preview drawn from it showed
  the unrest and winter icons, the anti-tax rebels' red flag and the red
  disc, and the five slices where the game drew them; Etch before drew `?`,
  an empty shield and grey discs. The game drew the 32-pixel
  `winter_severe.dds` in the same 35-pixel slot as the 64-pixel
  `local_unrest.dds`, so a texture file takes the size of the sprite's own
  texture. The pie chart's direction and centre are as Tongs'
  `docs/design.md` ("Sprites and frames") records them.

  Not carried, and why:
  - **Flags the game makes**: a colonial nation's (drawn by the game's code, with
    its overlord's colours) and a custom nation's name a tag that `gfx/flags`
    has no file of, so their shields keep the overlay alone; nor the client
    state symbols of `textureFile3`.
  - **Building slots the snapshot calls hidden**: Tongs reports Kaluga's five
    buildings (`building_progress_entry[1..5]`) hidden, with the right
    sprites, while the game draws them, so the preview hides them; how the
    game shows them is a question for `tongs.ui`'s visibility.
  - **Widgets from other definitions** (etch#256) take their text and rect
    from the snapshot, not yet its sprite.
- **Widgets the game builds from other definitions, from a snapshot**
  (etch#256, from the coverage survey). A widget the snapshot shows right
  under one the window has, but which the window's `.gui` lacks, is a copy the
  game's code made of a top-level definition (`minimap_bg` and `minimap_pic`
  of `menubar.gui` in `minimap_panel`, the ledger's sort buttons, the
  professionalism markers): the preview drawn from the snapshot lays the
  definition out where the game showed it, with the game's text. In the
  survey the widgets the game shows and the preview lacks went from 109 to 4
  in vanilla, and visibility from the snapshot to 99.8 % at 1920×1080. Their
  sprites, which the code also sets, keep the definition's size (8 × 8 against
  the game's 23 × 23 for the markers), so live rects are 97.5 %: the second
  half of etch#256. The offline outline, without a snapshot, does not draw
  them.
- **The province view's building slots from a snapshot** (etch#257, from the
  coverage survey). The game keeps the slots of the province shown before,
  hidden, ahead of this one's (ten entries, the first eight hidden), and the
  preview drew the right two in the right places, but the comparison paired
  them with the hidden ones. A window's code-placed entries now pair by their
  number with the game's `[n]`, an entry's parts show as the snapshot says over
  the profile's view, and `liveMatch` finds a text or state by the game's path
  as well as the preview's. The survey's 126 visibility differences, 22 rects
  and 18 texts of the slots are gone; the corpus's province views still pass
  (`compare --gpu`, 32 of 32 compared).
- **`Data ▾` for a window without a profile** once it has a snapshot, so that
  the live layer can be turned off and every widget the `.gui` has drawn again
  (the snapshot hides what the game hid).
- **A live snapshot without a profile** (etch#255, from the coverage survey).
  A window without a profile takes the snapshot's texts, the widgets' states
  and positions, and the game's visibility (what the game hid is not drawn);
  the extension keeps and draws a snapshot of any window. With the positions
  below, the survey's preview from a snapshot went at 1920×1080 from 77.9 %
  to 98.5 % of rects in vanilla (87.5 to 98.7 % in Anbennar alone), from
  95.8 to 99.1 % visibility and from 25 to 99 % of the texts the game shows.
  A list keeps the rows of its `.gui` without a profile's repeater.
- **Positions from the snapshot at the screen's edges** (etch#253, from the
  coverage survey). Tongs clips the game's rect to the client area, so a widget
  partly off the screen (the military tab's background from x = -7) or a window
  the `.gui` puts beyond the bottom at 1280×720 (the institutions) did not
  move; the layout's rect is now clipped where the widget would stand before
  the sizes are compared. A top-level copy the game's code made (the lobby's
  `shield[10]`) is a snapshot of its definition. In the survey, live rects at
  1920×1080 rose to 97.8 % in vanilla and 98.7 % in Anbennar alone, and the
  institutions' view to 100 % at both sizes.
- **Positions from the live snapshot** (etch#253, etch#254, from the coverage
  survey). The preview drawn from a snapshot puts a widget where the game
  showed it when the game's code moved it: a widget the snapshot shows at the
  size the layout gives it, but at another place, moves there with its
  children. The survey's profiled windows went from 95 to 34 rects off at
  1920×1080 (the menu bar's message and war buttons, the diplomacy view's
  labels). Not a list's entries, and not a window that Tongs gives its
  children's bounds. The offline outline, without a snapshot, keeps the
  `.gui` positions; windows without a profile take the snapshot only with
  etch#255.
- **Positions from a snapshot of another screen size.** A snapshot's rects
  are of the game's client area, and the preview drew them as they were at
  its own resolution: from a game at 2560×1440 the province view, anchored at
  the screen's bottom, was drawn 540 px lower than in a 1440×900 preview, off
  its canvas, and none of the snapshot's values showed where the window is.
  The layout now re-anchors each rect to the preview's screen: it lays the
  window out at both sizes without the snapshot's rects and moves each rect as
  far as the widget's own place moves between them (the window's anchor, a
  full-screen window's corners, `if_resolution`, the size steps). The
  `resolution` selector still takes the game's size (v2 section 8).

- **The coverage survey and the v3 draft.** The grilling of 2 November 2026
  started the [v3 specification draft](v3.md): v3 is to be trusted for every
  view of vanilla and Anbennar, measured by the coverage survey
  ([docs/coverage.md](../coverage.md)), which crawls the game for its views and
  measures the outline, the live snapshot and the pixels of each one.

- **A long text in a `fixedsize` box,** left open by the trial: the game cuts
  it with " ..." (`East Dam ...` for the culture "East Damerian" in the
  province view of P2KE Patch - Anbennar), and the preview wrapped it over
  the religion below. The rule is read from `eu4.exe` (the font's fit
  `0x159F510`, which the text node calls only for a `fixedsize`
  `instantTextBoxType`) and the offline renderer applies it, with
  `truncate = no` (v2 section 3). It matched both game screenshots it was
  checked on and the 196 corpus captures that could be compared. Open: the
  28 `anbennar` captures were not compared, because the Workshop item of
  P2KE Patch - Anbennar changed after it was pinned; after
  [etch#236](https://github.com/happy-dwarf-team/etch/pull/236) takes them
  again and pins the new version, compare them with the cut.
- **Reopening and reselecting the province (H8).** After a planned restart
  and a crash restart the province view comes back on the province the player
  had on screen, remembered by province id with the game session it was seen
  in, when the restart continues that game; after a reload of
  `provinceview.gui` the province on screen is selected again, so that its
  name, which the game's rebuild leaves blank, comes back. Nothing is forced
  when the player selected a province or opened a view first, and Tongs
  refuses a province the player cannot see. Decision: Tongs offers its
  checked navigation to other plugins as the in-process service
  `tongs.navigation` (Tongs 0.24.0, its ADR 0004), rather than Etch's plugin
  calling the game's selection `0x139C830` itself: one copy of the addresses
  and rules Tongs read in `eu4.exe` and checked live, no game address in Etch's
  plugin, and `affects_gameplay = false` stays true, since the service makes no
  game call (opening a view that would make the player discover a capital is
  refused). The rule for the blank name was read in `eu4.exe` (`0x1345F40`,
  `0x13470C0`). docs/live-game.md, "Reopening the view" and its live run.

- **The event window in the corpus (etch#97).** The event view loads its own
  save with one event open (`flavor_rus.11` in the Russian save, `lilac_wars.1`
  in the Anbennar one), so its recipe has no step and no capture makes a game
  call, and the window gates the release playsets again. The game sizes the
  window to its text (`codeSized`: laid out at the size the game shows it). With
  `compare --gpu` (ANGLE on Direct3D 11, 2026-11-02) all 16 of its gating
  captures pass, taken with Tongs 0.14.1 (corpus/README.md).
- **A pick selects the widget's keyword.** A pick opened the file with the
  cursor at the start of the line the game reports, the `{` that opens the
  widget's block (H2). Where a block is written `iconType =` and `{` on the next
  line, as vanilla's `provinceview_building_bg`, that is a line with a lone
  brace. The pick now selects the keyword (`iconType`), as a click in the
  preview does, and **Override in my mod** opens the copy with it selected; the
  game's line still finds the widget. A widget not found in the file opens at
  the line as before.
- **Pick mode hides the game's tooltips.** v2 section 7 kept the game's hover
  and tooltips in pick mode. In the game (2026-11-19, Etch 2.12.0, EU4 1.37.5
  windowed at 1440×900) every widget of the province view's trade section has
  a tooltip, shown at once at the pointer's bottom right, where pick mode's
  label also stands (the pointer + 24 px), so the two read as one box; the
  longer ones grow over and around the label about 0.7 s later, and on
  `tradenode_button` pointed at its left end the tooltip covers the button, so
  the outline, drawn over the finished frame, seems to frame the tooltip.
  Placing the label elsewhere (above the pointer, say) would part the two boxes
  only where the game leaves its tooltip at the bottom right: the game moves a
  tooltip that does not fit the screen, and a tooltip over the widget would
  still hide what the outline frames. Decision: while pick mode is on the game
  shows no tooltip, the map's included. Hover keeps working (the game's
  highlight and the hovered widget pick mode reads), and the tooltips come back
  the frame pick mode is left. A tooltip is not a widget to pick (the game
  reports none over one) and no part of a live snapshot, so pick mode loses
  nothing it shows. The plugin hooks the call of the game's tooltip controller
  that shows the tooltip for the pointer (`0x1415390`), which only its update
  makes, once a frame (`0x1414EF0`); in pick mode it calls the controller's own
  hide (`0x1415340`) instead, as the update does when the game shows no
  tooltip. Interface code only: `affects_gameplay = false` stays true.
  Checked in the game: docs/pick-mode-checks.md, "The game's tooltips".
- **The texture preview.** `.dds` and `.tga` files open in a read-only
  custom editor, `etch.texturePreview`, which reads them with the renderer's
  DDS and TGA readers and shows one mip level on a 2D canvas: the header's
  size, format and mip count, whether the alpha is used, the RGBA, RGB and
  alpha channels, any mip level of a DDS chain, zoom and the texel under the
  mouse, shown again when the file changes on disk. Over EU4 1.37.5 every
  `.dds` and `.tga` under `gfx` (8,031 and 1,354 files) and every level of the
  1,736 DDS mip chains read (`ETCH_EU4_DIR`, `packages/renderer/test/vanilla.test.ts`).
  Asset paths in `.gfx` and `.asset` files (textures, meshes, animations)
  link to the file the playset resolves (`.tga` falling back to `.dds`), and
  a texture path's hover shows a thumbnail with its facts. A bare name in a
  `pdxmesh`'s `meshsettings` is in its mesh's folder, any other bare name in
  the naming file's folder: over EU4 1.37.5 all 7,730 asset paths of
  `interface/*.gfx` and `gfx/**/*.asset` resolve so but 30 textures vanilla
  itself lacks (`packages/core/test/asset-paths.vanilla.test.ts`). In `.gui`
  files a sprite name's hover shows the sprite the playset's `InterfaceIndex`
  resolves (the last definition), its frames, its `.gfx` file and layer and its
  texture's thumbnail (the first frame of a strip), and Go to Definition opens
  the `.gfx` file at its name. The same hover and Go to Definition work on the
  sprite names of script files: an event's `picture` (plain or conditional), a
  mission's `icon` and an estate privilege's `icon`
  (`scriptSpriteReferences`). Over EU4 1.37.5 all 4,813 mission and 426
  privilege icons resolve, and 4,729 of 6,573 event pictures
  (`packages/core/test/script-sprites.vanilla.test.ts`). ADR 0008's "Images in
  more scripts" added, on 21.11.2026, the keys of ten `common` folders whose
  every vanilla value is a sprite of the game's `.gfx` files, each at the
  depth vanilla writes it (`SCRIPT_SPRITE_KEYS`): `church_aspects` `sprite`
  (10), `federation_advancements` `gfx` (8), `government_mechanics`
  `alert_icon_gfx` (26) and a power's `icon` (63), `holy_orders` `icon` (28),
  `professionalism` `marker_sprite` (6, not `unit_sprite_start`, a prefix),
  `religions` a school's `picture` (7), `religious_conversions` `map_icon`
  (9), `subject_types` `sprite`, `diplomacy_overlord_sprite` and
  `diplomacy_subject_sprite` (73), `tradecompany_investments` `sprite` (15)
  and `trading_policies` `button_gfx` (9); all 254 resolve. In Anbennar's own
  files 797 of the same keys' 818 values are sprites of the game's or the
  mod's `.gfx` files; the other 21 name sprites that neither defines (such as
  `GFX_allclan_ability_ADM`), which the hover reports. The hover, Go to
  Definition, Find All References and Rename Symbol all follow the list. The
  optional gutter thumbnail is done too, off by default
  (`etch.editor.spriteThumbnails`): a PNG of the texture's first frame, 32
  pixels on its longest side, per line that names a sprite with a texture, at
  most 500 per editor, written once per texture file, time, size and frames to
  Etch's global storage, as VS Code draws a gutter icon only from a file. Of
  the 358 picture
  names that do not, 302 are defined only in the DLC archives (`dlc/*/*.zip`,
  `builtin_dlc`), and 56 by no `.gfx` file of the game.
  [ADR 0009](../adr/0009-dlc-archives-are-a-playset-layer.md), accepted and
  built on 23 November 2026, reads the archives of the DLCs the player has on
  as layers between the game folder and the mods (with builtin_dlc, 304 of the
  358 resolve in an archive). A script name without a sprite still gets a
  hover, not a diagnostic, until the pictures nothing defines are understood.
  Core `@etch/core/asset` reads the game's
  asset container in both encodings (binary `@@b@`, text `@@t@`): meshes
  (shapes, vertices, normals, UVs, triangles, materials, skin, skeleton with
  inverse bind matrices) and animations (per-joint sampled channels,
  frame-major samples). Over EU4 1.37.5 it reads all 476 meshes and 152
  animations (`packages/core/test/asset.vanilla.test.ts`); a mesh or animation
  path's hover gives their facts, and a mesh path's hover a 128-pixel render
  of the mesh with its diffuse textures (its most detailed level of detail
  only) (a software rasteriser in
  `@etch/core/asset`; every vanilla mesh that draws something renders, in
  `asset.vanilla.test.ts`). Etch Mesh Preview (`etch.meshPreview`)
  draws a `.mesh` with WebGL2 (diffuse, normal and specular textures through
  the playset, collision shapes hidden; the light, normal map, highlight and
  `PdxMeshColor` country colours follow the game's `pdxmesh.shader`, the
  light direction is vanilla's `LIGHT_DIRECTION`) and plays an `.anim` beside it
  with as many joints as the mesh has bones, skinned on the CPU
  (`@etch/core/asset`'s `skinningMatrices`, `skinPart`). Joints pose bones by
  index, not by name, as the game does: in EU4 1.37.5 the routine that starts an
  animation on a mesh (0x168A740 in the GOG build 1.37.5.2) refuses an animation
  whose joint count is not the mesh's bone count and otherwise writes joint k's
  pose to bone k, with the joint's
  uniform scale (its rest `s`, or the sampled one interpolated); the animation
  it keeps holds no joint names (read in the decompiled game, etch#625). Of
  vanilla's 1,579 pdxmesh × animation pairs all fit, and in 645 a joint's name
  is not its bone's: `Left_hand_node` and `Right_hand_node` of the infantry,
  posed by `attack_L_hand` and `attack_R_hand` (`rifleman_*`,
  `musketeer_02_*`, `polearm_*`), and the galleass's attack, whose skeleton
  names bones by path (`Top4|Top2`) (`entity.vanilla.test.ts`). Posing the 151
  animations vanilla's `.asset` files use on the skinned meshes beside them
  that they fit keeps 257 of the 259 pairs within 0.5–2× of their bind size;
  the two others fit by count only a mesh no pdxmesh pairs them with. The entity preview (`etch.previewEntity`,
  a CodeLens on each `entity` of an `.asset` file) resolves an entity through
  the playset's `.gfx` pdxmesh types and `.asset` files (`@etch/core/asset`
  `resolveEntity`: `clone` first, then the entity's own keys; states by name,
  `attach` groups by `name`), scales it by pdxmesh scale × entity scale, plays
  its states through the pdxmesh's animation ids, and draws each attachment on
  its parent's bone at its own scale, not multiplied by the parent's (a Russian
  line infantryman's musket in the game keeps the proportion this gives). Over
  EU4 1.37.5 all 1,523 entities resolve with no problem and all 1,411 attach
  bones are in their parent's skeleton (`entity.vanilla.test.ts`). An
  attachment that repeats an entity above it is not followed but named. A
  state's `event` blocks (209 in vanilla, `time`, `node` and `particle`:
  artillery muzzle flashes, siege smoke) start particle effects, which the
  preview draws with an approximate player (step 3 of "Particles in the
  entity preview" below); the status line names them while the state plays. An
  event's `particle` is a `pdxparticle` object type of an `interface/*.gfx`
  file (`name`, `type`, `scale`; vanilla's 11 in `interface/assets`), whose
  `type` names a `particle` block of an `.asset` file (vanilla's 9, in
  `gfx/particles`), as the game resolves it (etch#631, "Particles in the
  entity preview" below). The index reads both; the status line adds the
  block and the scale where the type's name is not the block's or it has a
  scale (`siege_cannon (artillery_cannon, scale 0.8)`). An event whose name
  is no pdxparticle type, or whose type names no block (or has no `type`),
  is a problem of the entity, after the game's `Couldn't find particle 3D
  object` and `Could not find particle effect`. Etch 2.14 looked the name
  up among the blocks and reported vanilla's `devastation_smoke_particle`
  (two states of `westerngfx_city_0` and its 32 clones) and `siege_cannon`
  as missing; all 577 particle events of vanilla's resolved states now
  resolve (`entity.vanilla.test.ts`). A mesh
  material's texture is looked up in the
  mesh's own folder, as the game does: EU4 1.37.5 has a lookup of textures by
  file name across folders, but it is switched off, and the game's
  `error.log` reports vanilla's desert forts' specular map missing from
  `gfx/models/Buildings` though `Buildings/Western` has a file of that name.
  Etch lists it under "Textures not shown" in the same way. A
  `PdxMeshTextureAtlas` part blends in its country's flag where the diffuse
  alpha marks it, sampled with the mesh's `u1` (`MeshPart.uvs1`; all 21 such
  parts of vanilla have it, `asset.vanilla.test.ts`): a tag's `gfx/flags` flag
  through the playset, or the three country colours as stripes. The game picks
  the flag out of its flag atlas (`TextureAtlasCoords`). Its game code sets
  `AtlasHalfColor` for a colonial nation: the flag is its overlord's, and the
  half where `u1`'s u is over 0.5 takes a colour the game reaches through its
  capital province (on colonial flags, the colonial region's), which also
  replaces the tertiary colour in `PdxMeshColor`. A
  Region box (a checkbox and a colour) stands in for that colour. The game
  maps a flag through the country colours (`AtlasCutoff.x < 0`) for flags it
  makes itself (revolutionary countries, custom nations and some dynamic
  tags), out of its custom flag textures; the preview's stripes stand in for
  that. A shape's level of detail is its `lod` property, as the game reads it
  (`MeshShape.lod`; a shape without one, or with a negative one, is drawn at
  every distance). The shapes' names do not count: vanilla's `HighShape` and
  `LowShape` are levels 0 and 1, and its savanna trees number `LodShape2`
  level 1. 28 vanilla meshes have levels: 17 trees in `Mapitems/Trees` with
  up to five, and 11 in `Mapitems` (`asset.vanilla.test.ts`). The preview
  draws one level, the most detailed unless the LOD box picks another, where
  it drew them all on top of each other before. The object's `loddist` gives
  each level's camera distance (a pine's `[0, 20, 50, 100, 200]`,
  `PdxMesh.lodDistances`), which the bar shows. The game squares those values
  when it loads the mesh, and each frame takes the last level whose squared
  value the squared distance from the camera to the object's origin reaches
  (the last level when not even the first is). **LOD auto** does the same with
  the preview's camera (`levelAtDistance`): the drawn space is in the game's
  units, the pdxmesh scale in the model matrix. A mesh a `mapobject_<n>` pdxmesh of the playset names is one of the
  map's trees (the tree layer places type n where `map/trees.bmp` has palette
  index n: 21 types over 17 meshes in vanilla, `entity.vanilla.test.ts`); the
  game draws those with `gfx/FX/tree.shader`, not their materials' shader, so
  the preview cuts out texels with a diffuse alpha under 0.5 and adds no
  highlight. Its tint map (`map/terrain/Tree_tint.bmp`, 16 × 16, 24-bit) is
  laid over the diffuse colour at 0.5 with the game's `GetOverlay`, sampled at
  the mesh's second UVs (every vanilla tree mesh has them, one point per crown)
  shifted along u by the tree's turn: the game turns each tree by a random
  angle and shifts by that angle over a full turn, the preview by a Turn
  slider. The BMP reader (`readBmp` in `@etch/core/asset`) takes uncompressed
  24- and 32-bit files only and is not a texture format of the renderer. The
  map's colour map at the tree's place is laid over that at 0.25: the game
  binds the colour maps (`map/terrain/colormap_<season>.dds`) of the date's map
  season and the next one and mixes them by how far through the gap between
  the two the date is, walking the four map seasons of `map/seasons.txt`
  (`winter`, `spring`, `summer`, `autumn`) as it walks the tree seasons below
  (`readMapSeasons`, `seasonAt` and `colourMapAt` in `@etch/core/asset`). A
  Ground colour box stands in for it, `#808080` by default, which leaves the
  colour as it is; a Place box takes a province ID and sets Ground from the
  colour maps at the province's position in `map/positions.txt` (the file
  `map/default.map` names, read at `((x + 0.5) / width, 1 - (y + 0.5) /
  height)` with a linear filter on the full-size level) and North from how far
  north it is. The season colour
  (`map/terrain/Tree_season.bmp`, eight columns, at the column the game's
  season value picks and the row of the tree's `u1` v, less 0.5) is added
  times a fade that is 0 in the map's southern half and 1 from nine tenths of
  its height. The season value follows the date through the eight `tree_*`
  blocks of `map/seasons.txt` (`tree_winter` to `tree_autumn2`, a start and an
  end date each, in the order of the columns): inside a block it is the
  block's index, in the gap after one it runs to the next index by the day,
  and after the last it runs from 7 towards 8, which the repeated map takes
  back to the first column (`seasonAt` in `@etch/core/asset`). A Date
  slider (1 July by default) and a North slider (0 by default, or the Place's)
  stand in for the game's date and the fade. Each tree's random height and turn are not followed. `PdxMeshAlphaBlend` parts (16 African
  buildings and, without depth writes, `Mapitems/selection.mesh`) are blended by
  their diffuse alpha after the opaque parts, as the game's blend state does,
  where the preview cut them at 0.5 before. Snow follows the game's
  `ApplySnowMesh` on `PdxMeshSnow` parts (110 of vanilla's drawn parts, all
  city buildings, ports and forts) and `ApplySnowTree` on map trees, with the
  amount the game reads from the map at the mesh's place taken from a Snow
  slider instead. Not drawn: the map's fog of war and distance fog.

## Open issues

From the first coverage survey ([v3.md](v3.md), section 5):
[etch#253](https://github.com/happy-dwarf-team/etch/issues/253) (what the
game's code moves),
[etch#254](https://github.com/happy-dwarf-team/etch/issues/254) (the military
tab),
[etch#255](https://github.com/happy-dwarf-team/etch/issues/255) (a snapshot
without a profile),
[etch#256](https://github.com/happy-dwarf-team/etch/issues/256) (widgets from
other definitions, code-set sprites),
[etch#257](https://github.com/happy-dwarf-team/etch/issues/257) (profiles
against the snapshot) and
[etch#258](https://github.com/happy-dwarf-team/etch/issues/258) (the survey's
next run), and after the first fixes
[etch#264](https://github.com/happy-dwarf-team/etch/issues/264) (text boxes
that break their lines elsewhere, in part done by etch#266). etch#255 is done;
etch#253, etch#254, etch#256 and etch#257 are done for the preview drawn from a
snapshot and stay open for the offline outline or their rest (v3.md, section
5).

## Open points

- **Other windows the game's code places.** List entries a profile does not
  name still draw alone, at the `position` of their window, which for some is
  off the screen (`reorg_entry`, `DeclareWarDialog_enemyentry`): in vanilla 14
  of 688 definitions that draw show nothing at 1920×1080, in Anbennar 24 of 805,
  before the mechanics. Each needs its host, as the mechanics have theirs.
  `countrygovernmentview` itself has no choice of mechanic in `View ▾`.
- **Particles in the entity preview**
  ([etch#631](https://github.com/happy-dwarf-team/etch/issues/631),
  research on `research/particles`, now in the team's private archive,
  22 November 2026). A state's `event = { particle = X }` names a `pdxparticle`
  object type (`name`, `type`, `scale`) of an `interface/*.gfx` file, whose
  `type` names the `particle` block of an `.asset` file; a block's
  `subsystem`s emit camera-facing quads that `gfx/FX/particle.shader` draws
  with one of three blend effects. The readers' keys, value syntax and log
  lines are known from the game's code; the per-frame maths (variation,
  curve order, forces, turbulence, sprite-sheet tiles, depth) is not.
  **Decision:** the preview does not draw particles yet, and does not draw
  them as game-faithful until that maths is read. The next steps, in order:
  1. Read particle definitions into the index: `pdxparticle` types from the
     playset's `.gfx` files, events resolved through them (which ends the
     false "no particle" problems of `devastation_smoke_particle` and
     `siege_cannon`, 67 in vanilla), and the game's two errors in their place
     (a name that is no `pdxparticle` type, a type that names no block). Done
     for the entity preview (entry above), and as warnings in the open
     `.asset` files under `gfx/` and `.gfx` files under `interface/` (on the
     event's `particle`, on the pdxparticle's `type` or, without one, its
     `name`), checked against the playset's files on disk and read again when
     an `.asset` or `.gfx` file is saved; none in vanilla 1.37.5. Also done:
     hovers on the keys of particle blocks and of `.gfx` pdxparticle types
     (what each takes and does, marked where it is Etch's reading rather than
     the game's) and on curve and force names (their definitions), and
     warnings in particle blocks: unknown keys, curve and force names the
     effect does not define, a curve `time` the game reads as `spawn` (it is
     case-sensitive), a curve `duration` of 0 or less, emitter keys of the
     other shape, a shader effect the playset's `gfx/FX/particle.shader` lacks
     (with `Trail` and `NoBillboard` as the game appends them) and a missing
     texture; none in vanilla 1.37.5 or Anbennar. User page
     `textures-and-meshes/particles.md`. The keys inside `childsystem` are
     checked as a subsystem's since step 10, and those inside `position` and
     `color` since step 16: the lab read the game's reader of both (one set
     of four slots, `x`/`r`, `y`/`g`, `z`/`b` and `w`/`alpha`/`a`, in any
     case; the last entry wins; `position` reads a fourth value and drops it;
     any other key goes to the error log as `Unexpected token`), and the game
     showed it with a test mod (`a`, `w` and `A` of 0 hid the particles,
     `x y z` tinted them, `r = 20` moved a position as `x = 20` did, and two
     unknown keys gave the two log lines, `w` none). The preview reads both
     blocks the same way, where it used to take only `x y z` and `r g b
     alpha`, and warns on the keys the game does not take
     (`unknown-particle-key`). A force's `type` is checked since step 14:
     the lab read the game's reader (it lowercases the value, sets the type
     only for a value it knows, and starts at `planar`), and the game showed
     it with a test mod (an unknown type pushed like `planar`, `point`
     followed by an unknown type stayed a point, `POINT` was a point). Step 15
     found the same reading for a subsystem's `sort` (`depth`, `distance`,
     `age`; default unsorted) and `emitter_type` (`point`, `sphere`, `box`;
     default `point`) and a curve's `op` (`mul`, `add`, `abs`; default
     `add`). The game showed `op` and `emitter_type` (a curve without `op`, or
     with only an unknown one, added; `mul` then an unknown op stayed `mul`;
     `sphere` then an unknown type stayed a sphere, an unknown type alone was
     a point, `SPHERE` a sphere); `sort` is read only. The preview reads the
     four keys the same way, where it used to take the last value, drop a
     force with an unknown type and multiply by a curve without `op`, and
     warns on each value the game skips (`particle-skipped-value`). Step 17
     read where the reader stores the emitter shape keys: each sphere key
     writes the same value as its box partner (`sphere_emitter_radius` and
     `box_emitter_x`, the yaw and `box_emitter_y`, the pitch and
     `box_emitter_z`), the last entry wins, and both shapes draw the three
     values per particle; the game's check of the other shape's keys only
     logs. The game showed it with a test mod (`box_emitter_x` in a sphere
     placed the columns where `sphere_emitter_radius` did, a later
     `box_emitter_x = 0` put them back on the site, `box_emitter_y` spread
     them as the yaw did, `sphere_emitter_radius` in a box spread them along
     x as `box_emitter_x` did, with one log line each). The preview reads the
     six keys into one set, where it kept the two apart, and its warning on
     the other shape's key names the value it sets. Step 18 checked the
     pdxparticle `scale` live, as read in step 2 (size and start speed times
     the scale, each move times it again): spheres of particles at the
     sieges, with the same life, reached 0.12 of a fixed distance at scale 1
     and speed 1 and 0.46 at scale 4 and speed 0.25, so the distance per
     speed grew with the square of the scale (0.12 against 0.116 per
     speed · scale²); the tiles grew too. The game reads the scale when it
     starts (`reload assets` kept the old one). The preview already scaled
     this way; the key's hover now says so, marked as the game's. Step 19
     checked `local_space = yes` on the map: the game simulates such a
     subsystem around the origin and hands it the effect's place and turn only
     in the shader constant `InstanceWorldMatrix`, which the base game's
     `gfx/FX/particle.shader` declares and never reads. A tall local-space
     column at the sieges drew nothing with that shader, and stood at every
     siege with a test copy whose vertex shader multiplies the position by
     the matrix. So the extension warns on each `local_space = yes` when the
     playset's `particle.shader` does not use the matrix, and the key's hover
     says so. The preview still draws such a subsystem at its node, as a
     shader that applies the matrix would; where the base game's shader puts
     it is point 14.
  2. Read the evaluators and the update in the lab's analysis (the research's
     open questions 1–5), checked live with a test mod and `reload particle`.
     Done 23 November 2026 in the lab's analysis. Read: a value is its numbers
     with its curves applied in order (add, multiply, absolute), then a uniform
     draw of ± its variation; a curve is 64 samples of a Catmull-Rom spline
     between `minValue` and `maxValue`, read linearly at its time (`spawn`,
     `system` with `repeat`, `life_abs` in seconds, `life` as a fraction);
     emission accumulates per second up to `max_amount`, bursts only when
     `duration` is below 0; the velocity direction from pitch and yaw goes
     through the emitter's and the model's rotation; forces add up as
     acceleration divided by `mass`, and the pdxparticle `scale` scales size,
     speed and travel; a sprite-sheet tile is drawn at random per particle;
     `sort` orders by depth, distance or age; particles are depth-tested but
     do not write depth. Checked in the game (Steam 1.37.5, siege smoke over
     Trier, `reload assets`; `reload particle` does not read the files again):
     the error-log lines for an unknown key (`Unexpected token`), curve
     (`Couldn't find animation`) and force (`Couldn't find particle force`),
     random tiles, `hide`, `max_amount`, bursts every
     `emission_pulse_duration` + `emission_pulse_silence` seconds, and a
     direction that turns with the model. Open: the sign of a `point` force,
     the turbulence formula, `spin` units, how a trail is drawn without its
     shader effect, and how event times follow a state's `animation_speed`.
     The warnings and hovers of step 1 now quote these log lines and mark the
     keys checked here as the game's.
  3. A `prototype/*` branch of an approximate player in the entity preview
     (billboards, the three blend modes, emission, life, velocity cone, size
     and colour curves, the forces step 2 settles), compared against a capture
     of a musket and a ship state. It ships only labelled as a stand-in, as the
     Date and Snow sliders are, and only if the comparison holds. Done 23
     November 2026 (`prototype/particle-player`, shipped in the same change):
     `@etch/core/asset` reads a `particle` block into plain data
     (`readParticleSystem`) and runs it (`ParticleEffect`) with step 2's maths;
     the entity preview starts each event's effect on its bone each time the
     state's animation passes the event's time (the root mesh's animation for
     a node that plays none, such as a musket in a soldier's hand), draws the
     quads after the meshes as the game's shader does (clip-space corners,
     sprite-sheet tile times colour, the three blends, depth tested and not
     written, each subsystem's `sort`), and replays from the state's start
     with fixed random numbers when paused on a frame. The **Particles** button
     and the status line say "approximate". Etch's guesses, listed on the
     user page: the random numbers, the turbulence field (gradient noise over
     turning gradients), a `point` force that pulls, `spin` in radians per
     second, trails drawn as sprites, child systems not run, an event time
     after the clip's end never reached, a state change clearing every
     effect, and one running effect per event while one of its subsystems
     emits forever. An event's `node` may be a mesh locator (`[locator]`,
     `p`, `q`, `pa`), read into `PdxMesh.locators`: vanilla's musket
     `muzzle` and ship `gun_01` are locators, not bones. Compared by eye
     with the game (the lab's step 2 notes): a musketeer's volley (forward
     cone from the muzzle, residue, a puff at the lock) and a carrack's
     broadside (smoke and sparks out of the side) look like the game's; the
     siege smoke over `westerngfx_city_0` rises and leans the same way but is
     darker on the preview's background, and its size next to the city is not
     compared, since how the map scales a city entity is not known.
  4. Settle step 3's guesses from the lab's analysis and a test in the game.
     Done 23 November 2026. Read and now followed: a `point` force pushes away
     from its centre for a positive amount, at the same strength at any
     distance (checked live: a point below the siege smoke lifts it into a
     tall column, a negative one keeps it low); a force's centre is its
     `position` times the scale, moved (not turned) with the node for
     `local_force`; a `vortex` uses its direction as written; turbulence is
     the game's field (256 turning gradients per turbulence force, gradient
     noise with linear weights, three shifted samples, a push of exactly the
     amount), from Etch's own random numbers; an event starts when the
     state's time passes its time, on each wrap when that time is outside the
     clip, once in a state with no clip unless `state_time` (or `loop_time`)
     loops it, each start a new copy; `trigger_once` limits it to the state's
     first round; on a state change only `keep_particle` effects stay, and
     those that would emit forever stop emitting; a trail is a strip through
     its subsystem's particles in spawn order, two vertices per particle at ±
     its size across the strip, facing the camera with `billboard`. Still
     differing, listed on the user page: the random numbers; `spin`, whose
     reading (a push along the chord of the turn) runs away at `amount = 1`
     while the game's stream bends only a little and is gone at π, so the
     preview keeps step 3's turn of `amount` radians a second (settled in
     step 5); the trail's
     look without a `Trail` shader effect, which vanilla lacks (settled in
     step 8); `childsystem`
     (not used in vanilla; settled in step 10), and `time_offset` (not used
     in vanilla; settled in step 9).
  5. Settle `spin`. Done 25 November 2026: the preview follows step 4's
     reading. Each step a particle's offset from the axis through the centre
     is turned by `amount · dt` radians (radians, not scaled; +X towards +Z
     about +Y), and the push is mass · ((turned − offset) − dt · (t · v) t) /
     (scale · dt²), t the direction of the turn at the particle. At scale 1
     with no other force the velocity always lies along the last chord, so
     the particle circles at `amount` radians a second; with a scale above 1
     (the push is divided by it, the move multiplied by it), another force or
     a start speed, the velocity it keeps across the turn carries it out in a
     spiral that speeds up, which is the runaway step 4 saw at the siege
     smoke's scale of 2. Checked in the game (Steam 1.37.5, a test mod over
     Trier, `reload assets`): particles born at rest beside a spin axis left
     along an outward spiral arm whose spacing grew along it, in the reading's
     direction, at `amount = 0.25` and much faster at 1, with and without
     friction; none stayed on a circle. So step 4's "bends only a little"
     was the start of that spiral, and step 3's steady turn is gone. Not
     measured: the spiral's rate on screen, which the camera's perspective
     and two emitters at the site kept from a number.
  6. Settle the random numbers. Done 25 November 2026, from the EU4 engine
     lab's reading of the game's code: one MSVC `rand()` sequence per effect,
     seeded from the clock when the effect starts; a draw joins two steps
     into 30 bits with the second step's 15 bits on top. The order: each
     subsystem's position x, y, z, duration, start and pulse values; then the
     turbulence fields; every frame, while a subsystem emits, its emission,
     and while it has particles, each force's amount; at a spawn of n
     particles, each value n times before the next (life, size, the
     particle's yaw and pitch, its roll, the three turn speeds, mass, red,
     green, blue, alpha), the emitter's yaw and pitch once, the velocity's
     pitch, yaw and speed, the shape's three values, and per particle two
     tile draws, the 30-bit number modulo the sheet's columns and rows, even
     for a sheet of one. A value without variation draws nothing. The preview
     now draws in that order, so only the seed differs from the game; a
     `childsystem` draws its start values before its parent, once for each
     of the parent's `max_amount` slots (step 10). Not checked: where a
     child's draws fall among its parent's every frame.
  7. Settle the copies of an event's effect. Done 25 November 2026: the game
     makes a new particle effect at every start of an event and never looks
     for or limits earlier ones (step 4's reading); an effect is removed only
     when it has finished. Checked in the game (Steam 1.37.5, a test mod
     looping the siege states of `westerngfx_city_0` every 0.5 s and making
     each copy one long-lived particle): the particles round a siege site
     went from 15 to 40 to 48 in about a minute, past 16 and still growing.
     The preview drops its limit of 16 copies per event and starts every
     copy, with one guard of its own: no new effect starts while 100,000
     particles are alive, and the status line then says so. Since etch#725
     also while 1,000 effects run, since an effect that emits forever but
     keeps almost no particle alive never finishes and adds almost nothing to
     the particle count. The same fix runs no step shorter than 1e-9 s: the
     replay's leftover to a frame is often about 1e-16 s, and the spin force,
     which divides by dt², turned its rounding noise into a throw. The
     issue's side note, a turbulence force whose amount is 0 at the moment,
     was then read in the game's code: the game skips such a force before it
     counts it towards its field, so the next turbulence force of the
     subsystem reads the skipped one's field. The preview does the same, and
     a test now holds it. A live check cannot show it, since the game seeds
     the fields from the clock.
  8. Settle a trail's look without a `Trail` shader effect, which vanilla's
     `gfx/FX/particle.shader` lacks. Done 25 November 2026, checked in the
     game (Steam 1.37.5, a test mod over Trier, `reload assets`): the band is
     one flat, opaque colour, the same with grey or red particles and with
     alpha 0 (118, 112, 124 on screen over the map), with no texture; and
     only its front faces are drawn. A straight band with `billboard = yes`
     showed whole; the same band with `billboard = no` (the trail's default),
     lying flat and seen from above, showed nothing, and only scraps where
     particles of different speeds overtook each other; a straight vertical
     one, with no width without billboard, showed nothing either. The preview
     now builds the strip in the file's space, as the game does, and draws it
     in that colour, opaque, with back faces culled as for meshes. Left: the
     scraps of an overtaking flat band do not show in the preview (in exact
     arithmetic none of its triangles turns round; the game's likely come from
     a side that passes near zero), and a mod that adds its own `…Trail`
     effect is still drawn in grey.
  9. Settle a state's `time_offset = { base variation }` (none in vanilla).
     Done 25 November 2026, from step 4's reading of the game's code: when a
     state starts, its time starts at base plus a random share of the
     variation; the animation starts there, and an event fires in the step
     whose span of the state's time holds its `time`, so one timed before the
     start waits for the next loop, or never comes in a state that does not
     loop. `trigger_once` still counts the time since the state started.
     Checked in the game (Steam 1.37.5, a test mod over the siege sites near
     Trier, the siege smoke as long-lived tiles): with `time_offset = { 1 0 }`
     on the eight states of the western city that fire it (events at 0.07-0.9
     s, no loop), a view where the unchanged states showed about eight clusters
     of tiles (58 to 77) showed none, only about ten stray tiles at one site,
     which this reading does not explain. The preview starts each state at the
     base (the variation is chance, listed on the user page), the root's
     animation and slider at its own, an attached entity at its own.
  10. Run a subsystem's `childsystem` blocks (none in vanilla). Done 25 November
      2026, from step 4's reading of the game's code: the game reads a
      `childsystem` with the subsystem's reader, nested ones too, and gives each
      of the parent's `max_amount` slots one block per child, whose time,
      duration, pulses and emission go on from one parent in the slot to the
      next; only its particles are cleared when a new parent takes the slot. Each
      frame, after the parent moves, each child runs once per live or waiting
      parent, at the parent's place with no turn, spawning along the parent's
      move from its last place to its new one, and emits only while the parent
      lives. A dead parent keeps its slot, undrawn, until its children are gone.
      The editor's hovers and warnings now read a `childsystem` as a subsystem.
      Checked in the game (Steam 1.37.5, a test mod over the siege sites near
      Trier, the siege smoke as a subsystem with a `childsystem`, `reload
      assets`): each red parent flying out of a city left a line of small blue
      children standing behind it; with one parent slot, parents that live 1 s
      and children that live 4 s, a parent showed in 4 of 12 shots 1.6 s apart,
      once every 4.9 s, so a dead parent holds its slot until its children are
      gone (without that a new one would come within 0.2 s).
      The order the game draws a parent's and a child's particles in was
      settled in step 11.
  11. Settle the order an effect's parts are drawn in. Done 25 November
      2026, from the lab's reading of the game's code: the game lists an
      effect's draws subsystem by subsystem in the file's order, each followed
      by, for each of its particles in turn, each child system's own
      particles and theirs in turn, one draw per parent; it draws the ones
      that are not trails in that order, and then the trails in that order.
      The preview did the same for sprites but drew a trail in its
      subsystem's place and a child's particles of all parents at once; now
      it follows the game. In the game (Steam 1.37.5, the lab's run
      `e631-s11`) a trail was not seen at all in an effect that drew sprites:
      a billboard band that showed whole on its own was gone with a subsystem
      of sprites listed before or after it, and drawn with a second band or
      with a second subsystem that never emits. So "trails last" cannot be
      seen in the game, and the preview draws an effect's trails only while
      none of its sprite layers holds a particle (`drawOrder`). Why the game
      loses the band is not known; the lab's guess is that it draws trails with
      no shader state of their own (step 8), so with whatever the sprites
      left; step 13 settled it and a trail with a mod's own `Trail` shader
      effect, which shows next to sprites. The order of the parents when
      their subsystem has a `sort` was settled in step 12.
  12. Settle the order of a sorted subsystem's particles and their child
      systems. Done 25 November 2026, from the lab's reading of the game's
      code: the game keeps a subsystem's live particles in one array, which
      its `sort` reorders in place, one pass a frame after the update, and
      the order stays until the next pass. A pass takes its gap from the
      list 1, 4, 1, 16, 1, 64 in turn and swaps each particle with the one a
      gap on when that one is farther (`depth`: along the view; `distance`:
      from the camera) or older (`age`), the other way with `invert`, in
      blocks of twice the gap, first from the start and then from one gap
      on; a block takes part only when it ends before the last particle, so
      the last particle (usually the newest) is never moved by the sort, and
      two particles are never sorted. The children of every parent are
      sorted too, whatever the parent's `sort`. A dead particle's place goes
      to the last live one, front to back; a dead parent goes to the front
      of those waiting for their children; a freed slot is the first handed
      out again. Child systems are drawn parent by parent in the array's
      order, so they follow the sort. The preview sorted only a subsystem's
      own quads, fully, at each draw, and drew the children in the order
      their parents came out; now `ParticleEffect.sort` runs the game's pass
      once each drawn frame and each replayed step, and the quads and the
      children follow it. Checked in the game (Steam 1.37.5, the lab's run
      `e631-s20a`, a test mod over the siege sites near Trier): six unseen
      parents rose from each siege, each with one child, a large opaque quad
      showing the whole 2 × 2 tile sheet. Unsorted, each newer quad covered
      the one before it. With `sort = "distance"` or `"depth"` on the parent
      each older quad covered the newer one, except the newest, which stayed
      on top of its neighbour. With `sort = "distance"` only on the child,
      or with `invert = yes`, the quads were as unsorted.
  13. Settle why a trail is lost next to sprites (item 11). Done 25 November
      2026, from the lab's reading of the game's code: the game sets a part's
      shader, blend and rasterizer state only when its effect has them, and a
      trail whose effect the playset's `particle.shader` lacks gets the
      engine's empty record, so its draw keeps the shaders and vertex layout
      of the effect's sprites, drawn just before, and shows nothing. A trail
      with its own effect sets that effect. Checked in the game (Steam 1.37.5,
      the lab's runs `e631-s22a` and `-s22b`, the siege sites near Trier): with
      a test `particle.shader` adding `ParticleAlphaBlendTrail` (an opaque
      cyan band), a billboard trail and a subsystem of red sprites flying the
      other way showed both, band and sprites, at every site; with the base
      game's shader the same effect showed the sprites alone. So the preview
      keeps a trail next to sprites when the playset's `particle.shader` has
      its effect (texture `shader` + `Trail`, + `NoBillboard`), still drawn
      grey. A trail without an effect drawn after one with its own effect
      takes that effect's shaders: point 15.
  14. Settle where the base game's shader draws a `local_space` subsystem
      (item 1, step 19). Done 25 November 2026, checked in the game (Steam
      1.37.5, the lab's run `e631-s23a`, the siege sites near Trier, the
      smoke's `pdxparticle` at scale 1): a `local_space` subsystem of tiles
      with `position` set to Trier's map coordinates drew one cluster of
      tiles over Trier and none at the sieges, next to a second subsystem
      without `local_space` that drew tiles at every siege. So the game reads
      the particles' local coordinates as map coordinates: with no
      `position`, around the map's south-west corner. The same subsystem
      alone in its particle drew nothing anywhere, at two heights and two
      sizes. The warning and the key's hover say both. The preview still
      draws such a subsystem at its node.
  15. Settle a trail without its effect drawn after a trail with its own
      effect (point 13). Done 25 November 2026. By the lab's reading of the
      draw loop, a missing effect sets no shaders but the default blend and
      rasterizer state, and the loop keeps the last effect it set across the
      effects it draws. Checked in the game (Steam 1.37.5, the lab's run
      `e631-s24a`, the siege sites near Trier, the test `particle.shader` of
      point 13, whose trail effect draws an opaque cyan band): a trail A with
      `ParticleAlphaBlendTrail` and a trail B with `ParticleAdditive` (no
      `ParticleAdditiveTrail`), flying opposite ways, drew one cyan band each,
      in A, B order and in B, A order, where B alone drew the grey band. With
      red sprites first, A then B drew both bands next to the sprites; B then
      A drew A's band alone. So the preview keeps a trail without its effect
      next to sprites when a trail with its own effect, holding particles,
      comes before it. In B, A order the game took A's effect from the copy
      of the effect drawn before; the preview, which does not order copies as
      the game does, still hides B there.

Small unknowns, none worth an issue yet.

### Live game and pick mode

From section 17 of the v2 specification until 2.0.0, with what the release
record left of the reload policy and two points of after-v1.md about the game's
process:

- The vanilla province view's reload misses its 150 ms target with the stale
  check's reads: 168/181 ms (median/p95) (docs/budgets.md, M8).
- The private profile keeps one `save games/` for every playset, so
  **Continue** may offer another playset's save.
- The game Exit to Main Menu starts again ran without Anvil in the M8 run, so
  the live game closes it and stops instead of adopting it.
- Real hardware input in pick mode: checked with posted messages (M9) and with
  `SendInput` (the activation click and the trial in VS Code), never with a
  hand on the mouse. VS Code coming forward under the default
  `ForegroundLockTimeout` and `Ctrl+Shift+E` with the province view on screen
  held in M9 (docs/pick-mode-checks.md).
- Whether `GetKeyState` alone tracks Ctrl and Shift with a real keyboard (the
  plugin also tracks them from key messages, which is what matched in M9).
- Esc in pick mode with a real key: a posted Escape closed nothing, with pick
  mode on or off.
- The time from the save in VS Code to the plugin's call (the watcher and the
  pipe): not measured yet.
- Panel rebuild leaks beyond 20 reloads of one file.
- Whether `reload assets` reloads sprite types; until it is checked a `.gfx`
  change is a planned restart.
- Starting the player's `eu4.exe` directly, without Steam, beside the live
  game (not tried, H11).
- Reload policy rows not run live: `DeclareWarDialog` (an on-demand window
  closed before a reload), texture reloads, ironman and multiplayer
  (docs/release-2.0.0.md, "Live game").
- Which of `-userdir` and `userdir.txt` wins when both are set; two game
  instances at once (etch#21).
- The one-off 164 hidden `hints_test` windows after the first `reload` in the
  main menu (etch#22).

### Offline renderer

From [after-v1.md](after-v1.md#open-points), which kept them from 1.0.0 until
2.0.0 (its points about the game host are not carried over: the game host left
with ADR 0005), and the one the release record left of the profiles:

- The time of the `workspace.encode` path for encodings other than UTF-8 and
  Windows-1252 (etch#15).
- What the game does with a UTF-8 BOM in a `.gui` file (etch#15).
- The default shader for sprites without `effectFile`; it starts as linear
  (ADR 0001). Read in `eu4.exe` since (2.0.0 trial): a sprite definition
  without one loads `gfx/FX/buttonstate.lua`, `buttonstate_linear.lua` at
  another UI scale (0x15DA600); the preview uses it for disabled buttons.
- Layout rules not yet checked against a capture (etch#34): a window's
  `background` names the child painted behind the others; a cornered-tile
  background, and a list's `background` sprite, stretch over their container;
  cornered tiles repeat their edges and middle; `frame` counts from 1;
  `CENTER` anchors round down; a `scale`d sprite keeps fractional pixels; an
  open window stands at `show_position`; an empty progress bar shows its second
  texture or colour; a shield without a flag shows `textureFile1`. `rotation`
  and `origo` are not applied, and `left`, `right` and
  `UPPERL_LEFT` orientations anchor upper left with a diagnostic.
- Which way `progress.shader` runs `v`: it negates `v` and samples with
  wrapping, which keeps textures upright and fills vertical bars upwards only
  if the game's quads run `v` from 1 at the top. The renderer assumes so.
- H2 of etch#16 (whether the screen size behind `if_resolution` stays the same
  when a window moves) and H6 (PhysFS precedence of later mods).
- Which value the game shows for a localisation key defined in several files:
  checked in the game on 21 November 2026 for the game and one mod
  ([live-game.md](../live-game.md#which-localisation-value-the-game-shows)).
  A file hides one at the same path in an earlier layer, `localisation/replace/`
  wins over the rest, and otherwise the first definition wins (the game's over
  the mod's, an earlier path, the first line in a file); Etch follows it since.
  Still unchecked: two replace files, two mods, and a later file against a
  subfolder whose name sorts before it. Which files the game reads, checked
  the same day ([live-game.md](../live-game.md#which-files-the-game-reads)):
  not a file without a BOM, not one without a language suffix, and nothing
  of a file from an unknown escape on (`\N` and `\T` are known); Etch follows
  it since. Still assumed: that the game reads `localisation/languages.yml`.
  Unchecked: whether an unknown escape in a file with several language
  sections ends only its own section.
- Which definition the game uses when a font name is defined twice, and whether
  it compares font and `.gui` sprite names without regard to case. Etch takes the
  first font in load order (the files of a folder sorted, then its subfolders),
  the game's rule for `.gui` names at startup (etch#16), and reports a reference
  that matches only when case is ignored (etch#33). An event's `picture` is
  compared with case (checked on 21 November 2026,
  [live-game.md](../live-game.md#which-files-the-game-reads)). A sprite takes its last
  definition, as the game shows `GFX_governing_capacity` (27 × 27 from
  `topbar.gfx`, not 64 × 64 from `countrystabilityview.gfx`) and
  `GFX_choose_rivals_bg` (570 × 508 from `countrygovernmentview.gfx`, not
  573 × 589 from `countrycourtview.gfx`) in the survey's captures (etch#256).
- Texture paths: a `.tga` path takes the `.dds` of the same name, as 584
  vanilla sprites need, and the game draws the `.dds` when both exist in one
  mod (checked on 21 November 2026; 7 vanilla paths have both); Etch follows
  it since. Unchecked: the two in different layers, and a `.dds` path that
  exists only as `.tga`. Also assumed: the last of a repeated key in one
  block counts, and `if_resolution` properties apply where the block stands
  in the file (etch#33).
- Which monitor the game takes its native resolution from when there are
  several: the preview's "native" is the monitor that shows VS Code (etch#38).
- The trade power's rounding: the game cuts the save's `trade_power` 3.19 to
  3.1 in Heroes' Rest, and a profile's one decimal rounds it to 3.2; the other
  provinces' values round and cut alike (docs/release-2.0.0.md, "Profiles").
