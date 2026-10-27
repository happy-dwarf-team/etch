# Release 2.0.0: where each criterion stands

The release criteria of [v2 specification section 14](spec/v2.md#14-release-criteria-for-200),
checked at the end of M10 (2026-10-27). What only the maintainer can do (the
trial, consent to a deviation, the release itself) is marked as waiting on
them; this page records, it decides nothing. The candidate VSIX is the
`windows` CI job's artifact `etch-<commit>` of the newest commit of `main`
(release-please's version stays 1.0.1 until the release pull request is
merged with `Release-As: 2.0.0`).

## Precision

The gate of ADR 0002 for the three playsets at the six corpus resolutions,
the province views included (`compare --gpu`, ANGLE on Direct3D 11): **233 of
252 gating captures pass**. Vanilla and Proper 2K UI Enhanced pass 78 of 84
each, the Anbennar playset 77 of 84. What fails:

| Captures | What differs | Waits on |
| --- | --- | --- |
| `province-foreign` in vanilla at all six sizes, in Proper 2K UI Enhanced and the Anbennar playset at 1680×1050 to 3440×1440 | `foreign_province_window/button_diploaction` ("Diplomacy"): 92–95 % of its pixels within ±2, the anti-aliased edges of a button's text fainter in the game, as in etch#96 | the maintainer: a new known deviation like the `button-text-edges-*` ones needs consent |
| `province-foreign` in Proper 2K UI Enhanced and the Anbennar playset at 1280×720 to 1600×900, and two top bar backgrounds up to 1920×1080 | the game draws the foreign province's view over the top bar where they overlap, the own province's under it ([etch#210](https://github.com/happy-dwarf-team/etch/issues/210)) | etch#210 |
| `diplomacy-dialog` in the Anbennar playset at 1366×768 | `DeclareWarDialog/enemies_total_amount_icon`: 5 of its 464 pixels (98.9 %), the tip of the scaled icon at the screen's bottom edge; stable over two captures | the maintainer: a known deviation, or a fix |

No view is left out of the Anbennar gate: every corpus window has a working
recipe in it (the event window gates in no playset, etch#97).

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
- **Lines in pick mode:** the pinned Tongs 0.17.0 has no `definition_line`; the
  M9 checks used a lab build of Tongs' `main`. Until a Tongs release with it is
  pinned, a pick opens the file without the line.

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

## Questions for the maintainer

1. Consent to a known deviation for `provinceview/province_window/foreign_province_window/button_diploaction`
   (button text edges, etch#96) in the three playsets?
2. Consent to a known deviation for `DeclareWarDialog/enemies_total_amount_icon`
   in the Anbennar playset at 1366×768 (5 pixels), or wait for a fix?
3. `coverMargin: 32` masks 32 pixels around the Anbennar save's event windows,
   past the rects Tongs reads: acceptable?
4. etch#210 (the province view over the top bar in the foreign view at small
   sizes): fix before 2.0.0, or release with those captures failing?
5. A Tongs release with `definition_line` and its pin in Etch before 2.0.0, so
   that a pick opens the line?
