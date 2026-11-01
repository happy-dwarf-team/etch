# Release 2.0.0: where each criterion stands

The release criteria of [v2 specification section 14](spec/v2.md#14-release-criteria-for-200),
checked at the end of M10 (2026-10-27). What only the maintainer can do (the
trial, consent to a deviation, the release itself) is marked as waiting on
them; this page records, it decides nothing. The candidate VSIX is the
`windows` CI job's artifact `etch-<commit>` of the newest commit of `main`
(release-please's version stays 1.0.1 until the release pull request is
merged with `Release-As: 2.0.0`).

## Precision

The gate of ADR 0002 for the playsets of spec section 10, each at its
confirmed corpus resolutions, the province views included (`compare --gpu`,
ANGLE on Direct3D 11, 2026-10-28): **all 224 gating captures pass**, with no
known deviation left in the manifest.

Since the maintainer's answers in M10 the matrix is: vanilla at every
corpus resolution; Proper 2K UI Enhanced alone, and the Anbennar playset with
it and the P2KE patch, at 2560×1440 and above (the mod is made for screens of
at least 2560×1440); Anbennar alone below 2560×1440. 2560×1440 is a new
confirmed resolution; 3840×2160 is in the corpus but unconfirmed, because no
window of the lab holds a 2160-pixel client area (two monitors, a 6000×1440
desktop), so it gates nothing (etch#163).

| Playset | 1280×720 | 1366×768 | 1600×900 | 1680×1050 | 1920×1080 | 2560×1440 | 3440×1440 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vanilla | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 |
| Proper 2K UI Enhanced | – | – | – | – | – | 14/14 | 14/14 |
| Anbennar + Proper 2K UI Enhanced + P2KE Patch - Anbennar | – | – | – | – | – | 14/14 | 14/14 |
| Anbennar alone | 14/14 | 14/14 | 14/14 | 14/14 | 14/14 | – | – |

`provinceview/province_window/foreign_province_window/button_diploaction`
("Diplomacy"), which failed `province-foreign` everywhere at the end of M10
(92–95 % of its pixels within ±2), passes since etch#96 (#215): the game bakes
the text of a button on a `textSpriteType` into a copy of its texture, blending
alpha with the colour factors, so a glyph edge lets the window behind show
through; the renderer now does the same. The eleven `button-text-edges-*`
known deviations are gone with it.

- The Anbennar save's opening events no longer cover any view: the corpus uses
  a copy of the maintainer's save made in the lab after answering them, and
  nothing is masked for them (the mask and its 32-pixel margin are gone).
- The foreign province view drawn over the top bar
  ([etch#210](https://github.com/happy-dwarf-team/etch/issues/210)) happened
  only with Proper 2K UI Enhanced below 2560×1440, which the corpus no longer
  takes: closed.
- `DeclareWarDialog/enemies_total_amount_icon`, 5 pixels off in the Anbennar
  playset at 1366×768, no longer occurs: P2KE's dialog is captured at
  2560×1440 and above, where it passes, and Anbennar alone passes at every
  size.

No view is left out of the Anbennar gate: every corpus window has a working
recipe in both Anbennar playsets (the event window gates in no playset, etch#97).

## Profiles

For every capture of a profiled window the visibility each of Etch's profiles
predicts at the view's selector values matches the capture's, in the three
playsets (the visibility gate of the comparison, and
`profiles.playsets.test.ts`). The texts from `save` sources are reported
against the captures': in the province views every text from the save
matches but `tradepower_value` in the Anbennar playset's Heroes' Rest, where
the game cuts the save's `trade_power` 3.19 to 3.1 and the profile's one
decimal rounds it to 3.2 (the other provinces' values round and cut alike).

## Budgets

**The gated budgets hold**, vanilla and the Anbennar playset
([budgets.md](budgets.md), M10 and M7), `provinceview` in its profile's default
view included:

| Budget | Vanilla | Anbennar playset | Target |
| --- | --- | --- | --- |
| Cold open | 274–686 ms | 566–1,197 ms | 1 s, 2 s |
| Warm reload, p95 | 10.3–26.3 ms (trial fixes: 11.6–12.5) | 18.5–47.8 ms (trial fixes: 12.2–15.9) | 50 ms |
| Choosing a save, to the paint | 250–322 ms | 405–520 ms | 1 s, 2 s |
| Another province or country, p95 | 6.5–8.6 ms | 6.7–7.4 ms | 100 ms |

Reported, not gated: a listened file's reload (`provinceview.gui`) 168/181 ms
(median/p95) in vanilla, which misses its 150 ms target (the stale check's
reads, an open point of [after-v2.md](spec/after-v2.md#open-points)), 92/126 ms in the Anbennar playset; a HUD file's reload
about 195 ms against 250 ms (M8); a pick, from the click to the line in the
editor, 58–133 ms in vanilla and 32–119 ms in the Anbennar playset against
1 s (M9). Restarts take 25 s in vanilla and 48 s in the Anbennar playset (no
target).

## Live game

- **The reload policy's rows** ran with Etch's own plugin in vanilla and the
  Anbennar playset without a crash in M8 ([live-game.md](live-game.md), live
  runs): listened panels, the HUD through `topbar.gui`, `countryview.gui` as a
  planned restart, localisation, `error.log`, saves, stops, planned restarts
  and a crash restart. Not run live: `DeclareWarDialog` (an on-demand window
  closed before a reload), texture reloads, ironman and multiplayer.
- **Closing the province view after a rebuild (H2):** the plugin presses
  Escape through the game's SDL queue and undoes it when it opened the game's
  menu; checked in both playsets in M10 (#208).
- **A busy game (the 2.0.0 trial):** the trial's live game in the Anbennar
  playset was closed while it started (the 120 s ready limit) and while a new
  game started (10 s without a frame with a window not responding counted as a
  hang). Now a start has no limit while the plugin answers, a crash is a dead
  process or a plugin silent for 60 s, and a game that draws no frame for 5
  minutes is only asked about. Checked live at 2560×1440: a cold first start, a
  new game from the country selection (9.7 s without a frame, the window not
  responding), loading a save, Etch's save, the game's autosave and a manual
  save, a planned restart; none restarted the game
  ([live-game.md](live-game.md), "A busy game").
- **Which build runs (the 2.0.0 trial):** a trial ran the candidate from
  `d9241b4` although the next one had been installed: VS Code had loaded the
  extension 26 s before the new VSIX of the same version 1.0.1 replaced its
  files, and nothing said so. The first log line now names the commit
  (`Etch 1.0.1 (abc1234) for EU4 1.37.5`), and `build.mts` writes the build's
  stamp (version, commit, time) into the bundle and `dist/build.json`; when the
  file stops matching the running code (it changes, the window gets the focus
  back, a live game starts), Etch warns once per build found and offers
  **Reload Window**.
- **The click that brings the game forward (the 2.0.0 trial):** pick mode
  "worked only on the second click": after each pick VS Code is in front, and
  the plugin dropped the click that activated the game's window (the trial's
  game log: 20 picks, 21 activation clicks). That click is now a pick, taken
  once the game's hovered widget holds it. Checked live with real input
  (`SendInput`) in the Anbennar playset, Notepad standing in for VS Code: 8 of
  8 activation clicks picked the clicked widget, 12–15 ms after the click
  ([pick-mode-checks.md](pick-mode-checks.md), "The activation click").
- **Reopening the province after a restart (H8):** not built; the recorded
  workaround is that Etch says the view was not reopened (live-game.md).
- **VS Code coming forward under Windows' default foreground lock:** holds
  (M9, [pick-mode-checks.md](pick-mode-checks.md)).
- **Real mouse and keyboard in pick mode:** a hand at the machine not checked;
  M9's workaround was the posted messages a window procedure subclass sees,
  with the `MK_*` bits cleared and the key-state imports replaced. Left clicks
  through `SendInput` were checked with the activation click (above), and in
  the real VS Code of the trial below: none reached the game.
- **The hotkey with the province view on screen:** holds (M9).

## Large mods

Every window the Anbennar playset overrides opens in the offline renderer
without a crash: 979 of 979 top-level definitions of the 162 `.gui` files its
mods win, 12 of them in a profile's view (`ETCH_PLAYSET_CHECK=anbennar`,
2026-10-27, 75.7 s; #212).

## The trial

The maintainer's trial of `provinceview` in P2KE Patch - Anbennar and in vanilla
began on the candidate from `b3decc6` (2026-10-28), in the offline preview. What
it found, what the game does, and what changed:

**Views (#218).** What decides each widget was read from `eu4.exe` (the lab's
decompiled province view functions) and the mods' `custom_gui`, and checked
against the corpus captures:

- *Loot and devastation stay whatever the tab.* The game hides `loot_*`,
  `devastation_icon` and `devastation_value` while `change_culture_view`,
  `build_army_view` or `build_navy_view` is open (`0x1373FD0`); the profile now
  does too.
  Seen live in trial captures with `build_army_view` open, in vanilla
  (Macedonia, 1920×1080) and the Anbennar playset (Heroes' Rest, 2560×1440).
- *The capital's marks and actions overlap.* The top section has three slots,
  each showing one widget by the province: `move_capital` or `have_capital`
  (the owner's capital, `0x1349580`), `move_trade_port` or `have_trade_port`
  (`0x134A530`), `add_parliament`, `remove_parliament` or `have_parliament`
  (the player's parliament and the seat, `0x13497F0`), none of the actions in a
  foreign province. New facts `province.isCapital`, `province.isTradePort` and
  `province.parliamentSeat` read them from a save. Anbennar's
  `IW_move_capital_button` and `add_parliament_forbidden`, which lie over them,
  follow their `potential`s as scripted selectors.
- *Digging operations shown by default.* Every `diggy_*` widget needs the
  province flag `diggy_diggy_estimate_flag`, which `dig_deeper_capital` in the
  button bar sets; a scripted selector `digging` now opens it (closed by
  default; dig, repair, digging).
- *The sweep* found the rest of the kind in the three playsets: the fort's
  level and maintenance without a fort (`0x13728C0`), the centre of trade icon
  (new fact `province.centerOfTrade`), the own-province actions and the
  construction window in a foreign province, the integration parts of
  `foreign_province_window`, Anbennar's button bar (five slots of several
  buttons each, now exclusive groups) and its opener, and the declare war
  dialog's aggressive expansion line. P2KE Patch - Anbennar gets a profile layer
  of its own for the bars it drops.
- *The gate:* the visibility gate compared only the paths a profile names,
  which is how these passed it. It now compares every widget of a profiled
  window with the capture (a text the game shows empty is left out); every
  capture of the four corpus playsets matches (vanilla 18,221, Proper 2K UI
  Enhanced 5,264, Anbennar playset 24,058, Anbennar alone 60,740 widgets), and
  `profiles.trial.test.ts` holds each trial case in CI.

**Base development out of place (#223, then from the game's code).** The base
tax, production and manpower values were drawn 62 px (vanilla, Anbennar alone)
or 75 px (Proper 2K UI Enhanced, P2KE Patch - Anbennar) above where the game
draws them. The rule, read in `eu4.exe` (the lab's
`docs/etch-province-positions.md`): every frame `0x1373FD0` gives the three
values the `y` of `development_value_vertical_position_exploitable` and keeps
their `x` when the DLC Cradle of Civilization is active (its flag `0x233FF24`,
by the DLC table at `0x1FD4CE0`), and otherwise hides the three exploit buttons
and gives them the `y` of `…_not_exploitable`. A rule's move can take one
coordinate of a `positionType` (`"axis": "y"`); the new fact
`game.cradleOfCivilization` reads the save's `dlc_enabled`, and the vanilla
profile's `exploit` selector picks the variant. The same reading of the code
gave the province view's other `positionType`s: `building_close_button` moves
to `building_close_button_natives` (below 814 px) or `…_natives_large` while the
owner builds native buildings (`0x138DC80`, `0x1390880`), and below 814 px
`river_indicator` takes `top_section_lowres_river_icon_pos` (`0x1344680`);
the building slots and the units to recruit follow `building_*` and
`build_unit*` as #219 placed them. Laid out offline, every widget of
`provinceview` the game shows in the province captures of the four corpus
playsets is where the game draws it, within 1 px, and every text filled from
the corpus saves is the one the game shows in that widget, but the known trade
power rounding (`profiles.positions.test.ts`, local). Every corpus save has
Cradle of Civilization active; the `_not_exploitable` variant is read from the
code only, as no capture without the DLC could be taken yet (the lab's game lock
was held by other batches).

**Sample data and selectors (#219).**

- *No way to type a text by hand.* A new top layer of sample data, **By
  hand**: any text or button of the window, or a list entry's, typed from
  `Data ▾` (**Type a text…**) or the Widget Outline (**Type Sample Text…**, a
  pencil on each text), kept by window across sessions.
- *Owned/Uncolonised changes nothing.* The link's note was its only effect.
  While the link holds, the preview now draws `colonisationpanel` instead, with
  the note and its **Pin** button, and keeps the province view's `View ▾` to
  switch back.
  That the game shows the colonisation panel for land without a city is read
  from `0x1347A50` (etch#155); a live capture of an uncolonised province was
  not taken (the game window was covered and did not take the Goto key), so
  whether any of `provinceview` stays with it is still open.
- *Fort/No fort changes nothing.* It only showed the no-fort icon under the
  fort; it now swaps them and hides the fort's level and maintenance (#218).
- *Building slots and units to recruit.* A repeater's new `place` puts entries
  where the game's code does, at the `positionType`s it reads: the building
  slots at `building_start`, `building_offset` apart, `building_max_per_row`
  to a row (64 px in vanilla, 77 px in Proper 2K UI Enhanced, as in the
  captures), the units at `build_unit`, `build_unit_offset` apart. `Data ▾`
  lists every list the view draws with − and + for its number of entries.
  `provinceview` has sample entries for the building slots, the units and
  ships, the build queues, cultures, core shields, the owner's relations, the
  allies lists, state provinces, building choices, native buildings and
  institutions; not yet for the province modifiers, whose placement from
  `province_modifier_start` does not match the captures by a rule found, and
  the history list, whose entry template is in no `.gui` of the window.

**The live snapshot against the game (#228, #229).** A second trial
(2026-10-31) compared the live game's `provinceview` with the preview drawn
from Etch's live snapshot of it, on `cffbf88`, in P2KE Patch - Anbennar at
2560×1440 (Verne and Bronzewing Hall with buildings and free slots, a state's
province, Cannleigh with a fort):

- *Only the profile's texts came from the game.* The rest kept the sample
  data's. The snapshot now fills every text the game showed (#228).
- *Building slots and core shields were generated.* The game's code places
  them (`building_progress_entry[n]`, `CoreShieldItem[n]`); they are now rows
  with the number the game showed, each part shown or hidden as there, and a
  list the game showed empty has none (#228).
- *Disabled buttons drew enabled.* A disabled button now greys
  (`buttonstate`'s `disable`, the default shader `0x15DA600` gives a sprite
  without `effectFile`) and a ticked check box draws its second frame (#228).
- *Text colours.* Tongs' text drops the game's `§` colour codes, so values
  drew in the font's colour; `tongs.ui`'s new `markup` keeps them and the
  snapshot carries it (#229; Tongs 0.22.0, which has it, is pinned).
- *The base values* stood where the game draws them (Verne 5, 5, 4), as #223
  placed them.
- *Font icons and country flags* (the check of candidate `c2cf182`, with
  Tongs 0.22.0): the state tab's income drew `@A33` and `¤` literally where
  the game draws the country's flag and the gold icon. The game's text drawer
  (`0x15988E0`) reads `¤` as a font icon moving the pen 16 px (`¤1` to `¤3`:
  development, province, governing capacity) and `@TAG` as an 18 px flag; the
  preview now draws the icons and leaves the flag's room empty, as it has no
  country flags.
- *Left open:* code-set sprites and frames (the terrain picture, shield flags,
  trade goods, a building under construction, the locked slot; spec §7, "Not
  in v2"); a long text in a `fixedsize` box, which the game cuts with "…"
  (`East Dam...`) and the preview wraps, as no rule for it was found in
  `eu4.exe`; and an uncolonised province, not captured.

Checking a profile matched every path pattern against every widget path anew
on each reload; with the new rules that pushed the Anbennar playset's warm
reload of `provinceview` to a p95 of 68.6 ms. Each window's paths are now split
once: p95 12.4–12.5 ms in vanilla and 15.6–15.9 ms in the Anbennar playset
(1920×1080 and 3440×1440, 120 edits; M10: 26.3 and 47.8 ms), cold opens
277–344 ms and 589–811 ms.

**The live game in VS Code (candidate `c2cf182`, 2026-11-01).** Run for the
maintainer, at their request, along the path of their trial: the candidate's
VSIX in a VS Code profile of its own (first log line `Etch 1.0.1 (c2cf182)`),
their workspace of P2KE Patch - Anbennar on a copy of the mod, the game
borderless at 3440×1440 and VS Code beside it at 2560×1440, real input
(`SendInput`) and a screenshot before each step, under the lab's game lock.

- *Start and a new game:* the main menu was ready after 42 s; a new game
  (Verne, 1444) from the country selection loaded with the window not
  responding for about 9 s, and Etch neither closed it nor asked.
- *Reload:* moving `military_icon` in `provinceview.gui` reloaded in 210 ms
  and the game drew it moved; undoing it reloaded in 56 ms, and the file's hash
  came back.
- *Pick mode:* 8 clicks in the province view and the top bar gave 8 picks,
  each at its file and line, VS Code in front; the game's log: 8 picks, 7
  activation clicks, none waited out, 19–22 ms and 2 frames after the click.
- *Live snapshot:* text colours, building slots, core shields, button states
  and base values match the game; the code-set sprites above differ.
- *Stop:* **Etch: Stop the Live Game** saved in the private install in 1.3 s
  and closed the game.
- *Zoom and pan (#217):* with the maintainer's own mouse, dragging, the wheel,
  Ctrl with the wheel and the zoom buttons all worked (an event log read from
  the preview's frame); the trial's own drags through `SendInput` reached the
  preview with no button down, which is why they had seemed not to.
- *The province name after a reload:* the first reload with the province view
  open clears the province's name in its header (3 of 3 provinces), and the
  next reload brings it back. Etch only runs the game's `reload
  provinceview.gui` and closes or hides nothing then, so it is the game's
  reload; reselecting the province after a reload would hide it, which is the
  open point of reopening a province (H8).
- *Not checked:* a hand on the mouse in pick mode.

The same candidate, checked against the game in the Anbennar playset with the
private install its VSIX stages (`tongs 0.22.0: loaded`, no local builds):
Verne, Verne's state tab and Cannleigh with its fort match in text colours,
building slots, core shields, button states and base values, but for the font
icons and flags fixed in #233.

## CI

The required checks of ADR 0004 (`windows` with the plugin, `conventional-title`)
are green on `main`; the last M10 pull requests merged with them green.

## Release

The README and the store README describe the live game and say how to stay on
1.0.x (#209). With the release: the v2 specification was frozen and
[after-v2.md](spec/after-v2.md) took over its open points; the Etch site's
description of the live game follows in `etch-website`.

## Answered by the maintainer (M10)

- Test the playsets with Proper 2K UI Enhanced at 2560×1440 and above, and
  vanilla and Anbennar alone below: done (the matrix above).
- Fix rather than mask the Anbennar save's events, and drop the 32-pixel
  margin: done, through the answered copy of the save.
- The 5 pixels of the declare war dialog's icon: gone in the new matrix.
- The button text edges (etch#96): fixed rather than recorded (#215);
  `button_diploaction` passes, and no consent is needed.
- Tongs with `definition_line`: released as 0.18.0 and pinned (#214).
