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
reads, spec section 17), 92/126 ms in the Anbennar playset; a HUD file's reload
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
- **Reopening the province after a restart (H8):** not built; the recorded
  workaround is that Etch says the view was not reopened (live-game.md).
- **VS Code coming forward under Windows' default foreground lock:** holds
  (M9, [pick-mode-checks.md](pick-mode-checks.md)).
- **Real mouse and keyboard in pick mode:** not checked (no hand at the
  machine, `SendInput` refused to the agent); the recorded workaround is the
  posted messages a window procedure subclass sees, with the `MK_*` bits
  cleared and the key-state imports replaced (M9).
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

Checking a profile matched every path pattern against every widget path anew
on each reload; with the new rules that pushed the Anbennar playset's warm
reload of `provinceview` to a p95 of 68.6 ms. Each window's paths are now split
once: p95 12.4–12.5 ms in vanilla and 15.6–15.9 ms in the Anbennar playset
(1920×1080 and 3440×1440, 120 edits; M10: 26.3 and 47.8 ms), cold opens
277–344 ms and 589–811 ms.

The new candidate is the `windows` job's artifact of the newest commit of
`main`. The trial continues on it: the rest of `provinceview`,
the live game (reload, pick, snapshot) and the views of P2KE Patch - Anbennar.

## CI

The required checks of ADR 0004 (`windows` with the plugin, `conventional-title`)
are green on `main`; the last M10 pull requests merged with them green.

## Release

The README and the store README describe the live game and say how to stay on
1.0.x (#209). Not done, as they come with the release: the Etch site's
description of the live game (`etch-website`), freezing this specification and
`after-v2.md`.

## Answered by the maintainer (M10)

- Test the playsets with Proper 2K UI Enhanced at 2560×1440 and above, and
  vanilla and Anbennar alone below: done (the matrix above).
- Fix rather than mask the Anbennar save's events, and drop the 32-pixel
  margin: done, through the answered copy of the save.
- The 5 pixels of the declare war dialog's icon: gone in the new matrix.
- The button text edges (etch#96): fixed rather than recorded (#215);
  `button_diploaction` passes, and no consent is needed.
- Tongs with `definition_line`: released as 0.18.0 and pinned (#214).
