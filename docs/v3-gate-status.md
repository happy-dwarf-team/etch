# How far the v3 gate is (23 November 2026)

The distance from `main` to the 3.0.0 gate of the [v3 specification](spec/v3.md), section 3,
measured on 22 November 2026: the rules of `main` (`438543f`, the content of 2.14.0) run under the
lab's game lock over the stored captures of the coverage survey (3 November, Tongs 0.23), the
fresh Anbennar captures of Verne (11 November, Tongs 0.26.1) and the two Anbennar countries held
out (Bluescale and Kobildzan). The generated tables of [coverage-results.md](coverage-results.md)
are from this run; its section "The measure of 22 November 2026" has the rest.

No capture was taken again for this page: the figures are `main`'s rules on the captures the
survey already has. One set could not be measured: the Workshop's P2KE Patch - Anbennar changed on
15 November and no longer matches the hash its playset pins, so the Anbennar playset with Proper 2K
UI Enhanced and P2KE at 2560×1440 is left out until it is pinned and captured again (gap 2).

**Update, 23 November 2026.** The precision corpus was taken again with Tongs 0.37.0, Anvil 1.26.0
and the new P2KE pin ([etch#618](https://github.com/happy-dwarf-team/etch/issues/618)): all 240
release captures pass with `--gpu`. The same day the coverage survey's views were taken again from
the game with the same host, at 1920×1080 and 1280×720 for vanilla, Anbennar and Bigger UI and at
2560×1440 for the two playsets with Proper 2K UI Enhanced: 441 of the 461 captures the survey's
manifest lists (gaps 1 to 3). The figures below and the generated tables of
[coverage-results.md](coverage-results.md) are `main`'s rules on these captures; that page's
section "The survey taken again, 23 November 2026" has the rest. The fresh Anbennar captures of
Verne (11 November) were of the same views from the same save, and these replace them.

## What the gate asks

Section 3 gates three measures, and only for the views of a profiled window:

1. **Geometry:** 100 % of the compared rects exact, offline.
2. **Visibility from the live snapshot:** 100 %.
3. **Live snapshot texts** of profiled windows: 100 %.

Every remaining difference must be a bug or a known deviation with an issue and the maintainer's
consent (as ADR 0002), never a tolerance. Pixels, the holdout (Bigger UI) and windows not
reached are reported, not gated. Section 7 adds the media refresh as a step of the release.

The survey has 61 views of vanilla and 52 of Anbennar (`coverage/inventory.json`); 56 and 49 of
them have at least one profiled root, 38 and 34 only profiled roots.

## Where `main` stands

| Measure | Target | Measured on `main` at `1392d3e`, captures of 23 November | Met |
| --- | --- | --- | --- |
| Live texts, profiled windows | 100 % | 100.0 % on every playset and resolution | yes |
| Live visibility | 100 % | 100.00 % on every set of the survey (vanilla at 1920×1080: 10280 of 10280, with the built building slots Tongs 0.23 reported hidden) | yes |
| Geometry offline, with the profiles | 100 % | vanilla 1920×1080 99.32 % (23 of 3364 rects off), vanilla 1280×720 99.32 % (23 of 3360, 57 views), Anbennar 1920×1080 99.56 % (14 of 3192), Anbennar 1280×720 99.72 % (7 of 2471, 45 views). On the stored captures of 22 November: 24, 13 (36 views), 15 and 7 (33 views) | no |
| Known deviations with an issue and consent | every difference | three proposed, etch#604, etch#605, etch#606; consent not given | no |

The geometry row reads "the outline offline" of section 3 as the outline with the profiles'
rules (measure 4 of [coverage.md](coverage.md)), as the results do for profiled windows. Read
literally as measure 1 (the outline without any profile, 81–88 % of rects), the gate cannot be
met: the profiles exist because positions depend on the game's state. The maintainer should
confirm the reading before the gate run.

What the geometry left on `main` is, by kind (vanilla and Anbennar at 1920×1080):

- **Heights of texts the game's code fills** (the confirmation dialogs, the lobby's scenario
  description, the main menu's version text (its Continue box is hidden since a start from the main menu has no save, etch#618, so the continue text no longer counts), the ages view, institutions, parliament,
  the peace view, Anbennar's magic menu and achievements): the most rects, all heights only. Proposed
  as a known deviation, etch#604.
- **Widgets the game's code sizes or moves from a value**: the estates' crown land modifier icons
  (the modifier's sprite) and the selected map mode button (the player's map mode in that slot).
  Proposed as a known deviation, etch#606, each still open to a fix. The development pie chart
  (etch#614, `chartSize`) and the patriarch authority marker (etch#615, `slider`) are fixed; the
  marker's value text is at its place, with the height of a text the code fills (etch#604).
- **Building slots**: how many a province has and which can build now (visibility, not rects). Proposed
  as a known deviation, etch#605.
- **Single rects**, fixed since: Anbennar's achievements background, which the preview anchored by
  its own orientation where the game puts it at the window's corner (etch#610, etch#611), and the
  lobby's `religion_icon`, which eu4.exe moves 18 px down for a country without a secondary
  religion (etch#612).
- **Outside the profiled windows**, reported, not gated: `diplomessageicons_window` (at 0, 0 in the
  game), `outliner/outliner_bottom`, the war overview, Anbennar's `tributary_shield`.

## What is missing, with a rough estimate

Estimates are in agent sessions of about half a day each, and in game lock batches of about an
hour. They are guesses, not plans.

| # | Gap | Kind | Estimate |
| --- | --- | --- | --- |
| 1 | **Captures with the current Tongs and Anvil**: done on 23 November, with Tongs 0.37.0 and Anvil 1.26.0 on the capture host of etch#618. Left for later: Tongs now reports sprites, which could turn some of etch#606 into fixes. | measurement | done |
| 2 | **P2KE Patch - Anbennar changed on 15 November**: pinned (etch#618), and the survey's set at 2560×1440 captured on 23 November, 51 of 52 views. With the profiles 98.54 % of its rects are exact (45 of 3086 off); it is a mod's playset and is reported, not gated. | lock batch | done |
| 3 | **Built building slots**: Tongs 0.23 reported a built slot as hidden while the game draws it (tongs#238). With Tongs 0.37 the 29 failures offline in vanilla at 1920×1080 where the preview drew a built slot are gone; what is left of the province view's slots is which slots can build or be destroyed now (37 of the 42 visibility failures offline there), etch#605. | measurement | done |
| 4 | **The maintainer's consent** to the proposed deviations etch#604, etch#605, etch#606, or a fix for any of them. | decision | the maintainer's time |
| 5 | **Views of profiled windows not yet captured**: the country views on the emperor, the Pope's controller and a colonial nation (14, 14 and 17 views whose Russian recipes fail), the country shield behind Anbennar's lobby, and the views the manifest lists without a record: at 1280×720 vanilla's `vanilla-save-s4`, `s13` and `s27` and Anbennar's `s2`, `s10`, `s16`, `s19`, `s44`, `s45` and `s46` (a tooltip shows under the pointer the driver rests, every time), and vanilla's `s69` (its recipe no longer opens `multi_unitpanel`). Section 3 lets the other countries' views into the gate once their window has a profile, and most of theirs have one (a reading for the maintainer to confirm). | recipes, lock batches | 2–3 sessions, 2–3 lock batches |
| 6 | **The release**: the media refresh, `Release-As: 3.0.0`, the website and the copies of `docs/team-touchpoints.md` (eu4-engine-lab#109). | release | 1–2 sessions |

Left: about 3–5 sessions and 2–3 lock batches (gaps 5 and 6), and the maintainer's time for 4.

## Is 3.0.0 the next release after 2.14.0?

No. With at most one release per repository every three days, the release after 2.14.0 can go out
about three days later, and the gate needs more than that: the captures with the current Tongs (1
to 3) are done, but the maintainer's consent (4) and the views of gap 5 are on the critical path,
and the lock is shared with the other projects' batches. A realistic target is the second release
after 2.14.0.

Open question for the maintainer, before the gate run: which views count as "of a profiled window" when a view
has profiled and unprofiled roots (18 of vanilla's 56, 15 of Anbennar's 49): the whole view, or only
its profiled roots.
