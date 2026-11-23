---
title: Accuracy
description: How close the preview is to the game, how that was measured, and how to check your own window.
---

Etch measures its preview against the game instead of claiming it is right. A fixed set of
screens decides whether a release can ship. A wider survey covers every screen a player can open.
**Etch: Compare with the Live Game** checks your own window.

## The screens every release must pass

Every release must pass the precision corpus: 15 screens of the game, chosen by hand. Each screen
is captured from the running game and compared with the preview widget by widget: each widget's
place and size, and its pixels. A pixel counts as the same when each of its colour channels is
within 2 of the game's, on a scale of 0 to 255. A widget passes when its place and size are exact
and at least 99 of every 100 of its pixels are the same. The parts that the game's code fills,
such as a province's name, are not compared.

The screens include the province view of your own province and of a foreign one, the HUD, the
ledger, the court and the estates. For release 2.0.0 they were captured in four
[playsets](../reference/glossary.md#playset) (sets of mods loaded together), each at the sizes it
is made for:

- the base game: 1280×720, 1366×768, 1600×900, 1680×1050, 1920×1080, 2560×1440 and 3440×1440;
- Anbennar alone: the five sizes from 1280×720 to 1920×1080;
- the base game with Proper 2K UI Enhanced: 2560×1440 and 3440×1440;
- Anbennar with Proper 2K UI Enhanced and P2KE Patch - Anbennar: 2560×1440 and 3440×1440.

Proper 2K UI Enhanced is made for screens of at least 2560×1440, so it is not measured below that
size.

On 28 October 2026, for release 2.0.0, all 224 captures that decided the release passed: 14
screens in each of the 16 pairs of playset and size above. None of them needed an exception. In
the same check, every [window profile](../reference/glossary.md#window-profile) showed and hid the
same widgets as the game in every capture of its window. A window profile is what Etch knows about
a window beyond its files: which parts the game shows together, and where its texts come from.

The fifteenth screen, the event window, was left out of that check, because the captures had no
way to open it. Since 2 November 2026 they load a save with an event open, and its 16 captures
pass too. So on these screens, at these sizes, the preview matches the game, apart from what the
game's code fills.

Sources: the
[v1 specification](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/v1.md), sections
5 and 9; the [v2 specification](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/v2.md),
sections 10, 11 and 14;
[ADR 0002](https://github.com/happy-dwarf-team/etch/blob/main/docs/adr/0002-precision-corpus-per-widget-exact-thresholds.md);
the [corpus manifest](https://github.com/happy-dwarf-team/etch/blob/main/corpus/manifest.json);
[release 2.0.0](https://github.com/happy-dwarf-team/etch/blob/main/docs/release-2.0.0.md),
"Precision"; [after v2](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/after-v2.md),
"The event window in the corpus".

## Every screen of the game

The coverage survey asks a wider question: of every screen a player can open, how much does the
preview get right? It clicks its way through the game, from a save and from the main menu, in the
base game and in Anbennar. It captures each new screen at 1920×1080, and also at 1280×720 when its
windows have a variant for that size. For each widget it checks two things: whether the preview
puts it in the game's exact place and size, and whether the preview shows or hides it as the game
does. It also measures the base game's screens with Bigger UI V1.37, a mod Etch was never
adjusted for. A release does not have to pass the survey.

In the survey's run of 12 November 2026 at 1920×1080, the preview without a running game gave
these results. A screen is fully right when every widget is in the game's place and size, and the
game shows no widget the preview lacks.

| Playset and save                       | Screens | Widgets in place        | Shown or hidden as in the game | Screens fully right |
| -------------------------------------- | ------- | ----------------------- | ------------------------------ | ------------------- |
| Base game, Russia in 1719              | 60      | 3,598 of 3,640 (98.8 %) | 99.5 %                         | 33                  |
| Anbennar, Verne in 1444                | 58      | 3,601 of 3,630 (99.2 %) | 99.9 %                         | 35                  |
| Base game with Bigger UI               | 60      | 3,594 of 3,635 (98.9 %) | 99.5 %                         | 32                  |
| Anbennar, Kobildzan in 1594, set aside | 43      | 2,637 of 2,746 (96.0 %) | 99.3 %                         | 18                  |
| Anbennar, Bluescale in 1472, set aside | 44      | 3,145 of 3,169 (99.2 %) | 99.8 %                         | 27                  |

So roughly one widget in a hundred is off, but those few are spread over many screens: in the
base game, 27 of the 60 screens are not fully right.

Etch's window profiles were written from captures like these, so a country they were not written
from is a fairer test. The survey sets two Anbennar countries aside for that, Kobildzan and
Bluescale, although a few parts of the profiles have since been written from them too. Even
there, at least 96 of every 100 widgets were in place.

Most of the widgets the preview still gets wrong depend on the running game: a province's number
of building slots, which a save does not hold, and the texts and sizes the game's code sets. Take
a [live snapshot](../reference/glossary.md#live-snapshot) of the window (see
[Snapshot and compare](../live-game/snapshot-and-compare.md)), and the preview uses the texts and
states the game showed. In the same run, the preview then showed or hid every widget of
Anbennar's screens as the game did.

Sources: the [coverage survey](https://github.com/happy-dwarf-team/etch/blob/main/docs/coverage.md);
the [coverage results](https://github.com/happy-dwarf-team/etch/blob/main/docs/coverage-results.md),
"The ranking's next gaps".

## Redraw time

After an edit, the preview drew the province view again in about a hundredth of a second: 10 to
13 ms at the median (a millisecond, ms, is a thousandth of a second). The median is the middle
time: half of the redraws were faster.

| Playset                                                   | Size      | Median redraw | 95 of every 100 redraws within |
| --------------------------------------------------------- | --------- | ------------- | ------------------------------ |
| Base game                                                 | 1920×1080 | 10.4 ms       | 12.4 ms                        |
| Base game                                                 | 3440×1440 | 10.6 ms       | 12.5 ms                        |
| Anbennar, Proper 2K UI Enhanced and P2KE Patch - Anbennar | 1920×1080 | 12.8 ms       | 15.9 ms                        |
| Anbennar, Proper 2K UI Enhanced and P2KE Patch - Anbennar | 3440×1440 | 13.1 ms       | 15.6 ms                        |

Etch's speed test fails when 95 of every 100 redraws do not finish within 50 ms. In the same run,
opening the preview on the province view took 0.28 to 0.34 s in the base game and 0.59 to 0.81 s
with the Anbennar mods. The test allows at most 1 s and 2 s.

These times were measured on 28 October 2026, before release 2.0.0, on the maintainer's PC: an
Intel Core i9-13900KF, 64 GB of memory, an NVIDIA GeForce RTX 4090, an NVMe SSD and Windows 11
Pro (build 26200), with VS Code 1.143.1 and every other extension turned off. Each time is counted
from the edit, or from the command that opens the preview, until the preview is drawn again. Your
PC may be faster or slower.

Sources: [budgets](https://github.com/happy-dwarf-team/etch/blob/main/docs/budgets.md),
"2026-10-28, the 2.0.0 trial's fixes"; the v2 specification, section 9.

## Check your own window

To see where the preview of your window differs from the game, use **Etch: Compare with the
Live Game**:

1. Start the [live game](../live-game/start-and-stop.md), Etch's own copy of EU4 that you play
   beside the editor.
2. Save your file, and open your window in the game.
3. Open the preview on the same window.
4. Run **Etch: Compare with the Live Game** from the Command Palette (<kbd>Ctrl+Shift+P</kbd>), or
   open **Data ▾** and click **Compare with Live Game** under **Live snapshot**.

The Problems panel lists every widget the preview places or shows otherwise than the game: in
another place, only in the game or only in the preview, shown by one and hidden by the other. The
command measures your window with the same steps the coverage survey uses for its screens, so the
two count differences the same way.

Most entries are places where the preview is wrong, not your mod, and Etch's team can fix them.
**Report to Etch…** on an entry opens a filled-in bug report on GitHub in your browser, for you to
send. [What Etch reads and writes](reads-and-writes.md) lists what the report contains. See
[Snapshot and compare](../live-game/snapshot-and-compare.md) for more.

Source: the coverage survey, "Measures".

## History

Etch's specifications are its design documents: they record what each version was meant to do
and how its release was measured. The
[v1 specification](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/v1.md) covers
Etch 1.x and has not changed since 1.0.0, on 26 October 2026; the
[v2 specification](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/v2.md) covers
Etch 2.x and has not changed since 2.0.0, on 1 November 2026.

## What it doesn't do

- The preview at 3840×2160 has not been compared with the game. You can pick that size, but the
  screens on which Etch's team captures the game are too small for it.

Source: the v2 specification, sections 8 and 16.
