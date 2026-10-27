# Release 2.0.0: where each criterion stands

The release criteria of [v2 specification section 14](spec/v2.md#14-release-criteria-for-200),
checked at the end of M10 (2026-10-27). What only the maintainer can do (the
trial, consent to a deviation, the release itself) is marked as waiting on
them; this page records, it decides nothing.

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

See [budgets.md](budgets.md), M10.

## Live game

See [live-game.md](live-game.md) and [pick-mode-checks.md](pick-mode-checks.md).

## Large mods

See below.

## The trial

Waits on the maintainer: editing `provinceview` in P2KE Patch - Anbennar and in
vanilla on the candidate VSIX, through the live game (reload, pick, snapshot)
and through the preview's views and sample data, recorded here with its notes.

## CI

The required checks of ADR 0004 (`windows`, `conventional-title`) are green on
`main`.

## Release

The README and the store README describe the live game and say how to stay on
1.0.x (#209). The Etch site, the specification's freeze and `after-v2.md` come
with the release.
