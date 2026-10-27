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
ANGLE on Direct3D 11, 2026-10-27): **208 of 224 gating captures pass**.

Since the maintainer's answers in M10 the matrix is: vanilla at every
corpus resolution; Proper 2K UI Enhanced alone, and the Anbennar playset with
it and the P2KE patch, at 2560×1440 and above (the mod is made for screens of
at least 2560×1440); Anbennar alone below 2560×1440. 2560×1440 is a new
confirmed resolution; 3840×2160 is in the corpus but unconfirmed, because no
window of the lab holds a 2160-pixel client area (two monitors, a 6000×1440
desktop), so it gates nothing (etch#163).

| Playset | 1280×720 | 1366×768 | 1600×900 | 1680×1050 | 1920×1080 | 2560×1440 | 3440×1440 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vanilla | 13/14 | 13/14 | 13/14 | 13/14 | 13/14 | 13/14 | 13/14 |
| Proper 2K UI Enhanced | – | – | – | – | – | 13/14 | 13/14 |
| Anbennar + Proper 2K UI Enhanced + P2KE Patch - Anbennar | – | – | – | – | – | 13/14 | 13/14 |
| Anbennar alone | 13/14 | 13/14 | 13/14 | 13/14 | 13/14 | – | – |

The one view that fails everywhere is `province-foreign`, and only in
`provinceview/province_window/foreign_province_window/button_diploaction`
("Diplomacy"): 92–95 % of its pixels within ±2, the anti-aliased edges of a
button's text fainter in the game than in the offline renderer, as in etch#96,
which is being worked on.

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
| Warm reload, p95 | 10.3–26.3 ms | 18.5–47.8 ms | 50 ms |
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

Waits on the maintainer: editing `provinceview` in P2KE Patch - Anbennar and in
vanilla on the candidate VSIX, through the live game (reload, pick, snapshot)
and through the preview's views and sample data, recorded here with its notes.

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
- The button text edges (etch#96): with a separate session.
- Tongs with `definition_line`: released as 0.18.0 and pinned (#214).
