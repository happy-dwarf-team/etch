# How far the v3 gate is (22 November 2026)

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

| Measure | Target | Measured on `main`, 22 November | Met |
| --- | --- | --- | --- |
| Live texts, profiled windows | 100 % | 100.0 % on every playset and resolution | yes |
| Live visibility | 100 % | 100.0 % on every set but vanilla at 1920×1080: 99.96 % (9900 of 9904), the 4 buttons of `peace_view`'s text scrollbar; with etch#608, 100.00 % (10076 of 10076) | with etch#608 |
| Geometry offline, with the profiles | 100 % | vanilla 1920×1080 99.15 % (28 of 3312 rects off), vanilla 1280×720 99.42 % (15), Anbennar 1920×1080 99.44 % (18), Anbennar 1280×720 99.63 % (8), Verne 1920×1080 99.38 % (21), Verne 1280×720 99.51 % (13). With etch#611–etch#615, measured on their branches: vanilla 1920×1080 99.28 % (24), vanilla 1280×720 99.49 % (13), Anbennar 1920×1080 99.53 % (15), Anbennar 1280×720 99.67 % (7); Verne not measured again | no |
| Known deviations with an issue and consent | every difference | three proposed, etch#604, etch#605, etch#606; consent not given | no |

The geometry row reads "the outline offline" of section 3 as the outline with the profiles'
rules (measure 4 of [coverage.md](coverage.md)), as the results do for profiled windows. Read
literally as measure 1 (the outline without any profile, 81–88 % of rects), the gate cannot be
met: the profiles exist because positions depend on the game's state. The maintainer should
confirm the reading before the gate run.

What the geometry left on `main` is, by kind (vanilla and Verne at 1920×1080):

- **Heights of texts the game's code fills** (the confirmation dialogs, the lobby's scenario
  description, the main menu's version and continue texts, the ages view, institutions, parliament,
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
| 1 | **Captures with the current Tongs and Anvil**: the figures above are `main`'s rules on captures of 3 and 11 November (Tongs 0.23 and 0.26.1). The gate run needs captures taken with the pinned Tongs, at 1920×1080 and 1280×720, vanilla and Anbennar, on a new capture host. A current Tongs also reports sprites, which could turn some of etch#606 into fixes. | measurement | 1–2 sessions, 2–3 lock batches |
| 2 | **P2KE Patch - Anbennar changed on 15 November**: pin its new hash in `corpus/manifest.json` and capture the playset at 2560×1440 again; its ledger columns were 24 px off before (the game's list is narrower than its file). | pin, lock batch | 1 session, 1 lock batch |
| 3 | **Built building slots**: Tongs reports a built slot as hidden while the game draws it, so live visibility is 100 % against a wrong reference (29 vanilla failures offline). happy-dwarf-team/tongs#242; then a Tongs release, a pin in Etch, and captures taken again. | bug in Tongs | 2–3 sessions, plus Tongs' release cadence |
| 4 | **The maintainer's consent** to the proposed deviations etch#604, etch#605, etch#606, or a fix for any of them. | decision | the maintainer's time |
| 5 | **Views of profiled windows not yet captured**: the country views on the emperor, the Pope's controller and a colonial nation (14, 14 and 17 views whose Russian recipes fail), the country shield behind Anbennar's lobby, and the 1280×720 captures the manifest lists without a record (vanilla 25, Anbennar 19). Section 3 lets the other countries' views into the gate once their window has a profile, and most of theirs have one (a reading for the maintainer to confirm). | recipes, lock batches | 2–3 sessions, 2–3 lock batches |
| 6 | **The release**: the media refresh, `Release-As: 3.0.0`, the website and the copies of `docs/team-touchpoints.md` (eu4-engine-lab#109). | release | 1–2 sessions |

Total: about 8–12 sessions and 5–7 lock batches, with one Tongs release in the middle.

## Is 3.0.0 the next release after 2.14.0?

No. With at most one release per repository every three days, the release after 2.14.0 can go out
about three days later, and the gate needs more than that: captures with the current Tongs (1), a
Tongs fix and release (3) and the maintainer's consent (4) are on the critical path, and the lock is
shared with the other projects' batches. A realistic target is the second release after 2.14.0, if
1, 2 and 3 start at once.

Open question for the maintainer, before 1: which views count as "of a profiled window" when a view
has profiled and unprofiled roots (18 of vanilla's 56, 15 of Anbennar's 49): the whole view, or only
its profiled roots.
