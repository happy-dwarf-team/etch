# How far the v3 gate is (22 November 2026)

The distance from `main` (`f8d3f4e`, the content of 2.14.0) to the 3.0.0 gate of the
[v3 specification](spec/v3.md), section 3. No new measurement was made for this page: the game
lock was taken by other work. The figures are the last ones recorded: the generated tables of 11
November and the hand-written ones of 12 November in
[coverage-results.md](coverage-results.md). Since then 198 commits landed, most of them editor
features and checks, but some touch what the gate measures: the live snapshot draws what the
game's code set and re-anchors its rects (etch#560, etch#562, etch#563), and sample data and
scripted selectors changed (etch#489, etch#410–etch#423). So the figures are an estimate, not a
measurement of `main`.

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

| Measure | Target | Last recorded | Met |
| --- | --- | --- | --- |
| Live texts, profiled windows | 100 % | 100.0 % on every playset and resolution (11 Nov) | yes |
| Live visibility | 100 % | Anbennar 100.0 % on every set; vanilla 1920×1080 99.9 % (9 widgets), 1280×720 100.0 % (11–12 Nov) | almost |
| Geometry offline, with the profiles | 100 % | Verne 1920×1080 99.2 % (29 rects left), Verne 1280×720 99.3 % (19), vanilla 1920×1080 98.8 % (42), Anbennar with Proper 2K UI Enhanced and P2KE at 2560×1440 98.5 % (68) (12 Nov) | no |
| Known deviations with an issue and consent | every difference | none recorded for the survey | no |

The geometry row reads "the outline offline" of section 3 as the outline with the profiles'
rules (measure 4 of [coverage.md](coverage.md)), as the results do for profiled windows. Read
literally as measure 1 (the outline without any profile, 81–88 % of rects), the gate cannot be
met: the profiles exist because positions depend on the game's state. The maintainer should
confirm the reading before the gate run.

## What is missing, with a rough estimate

Estimates are in agent sessions of about half a day each, and in game lock batches of about an
hour. They are guesses from the pace of 10–12 November, not plans.

| # | Gap | Kind | Estimate |
| --- | --- | --- | --- |
| 1 | **A fresh survey of `main`**: the generated tables are from 11 November; the gate needs one run of `coverage` over captures taken with the current Tongs and Anvil, at 1920×1080 and 1280×720, vanilla and Anbennar. | measurement | 1 session, 2–3 lock batches |
| 2 | **Built building slots**: Tongs reports a built slot as hidden while the game draws it (`RebuildAllBuildingEntries`, 12 November), so live visibility is 100 % against a wrong reference. Needs a Tongs fix (visibility from the render node), a Tongs release, a pin in Etch, and the captures taken again. No Tongs issue exists yet. | bug in Tongs | 2–3 sessions, plus Tongs' release cadence |
| 3 | **Vanilla's live visibility** at 1920×1080: `peace_view`'s slider button (4), the settings' `page` selector (3), the religion view's `religionPanel` (2). | profiles | 1 session |
| 4 | **Geometry the profiles can fix**: the ledger's columns in Proper 2K UI Enhanced (the game's list is 24 px narrower than its file, 11 rects), the patriarch authority marker, which most likely moves with its value (4 views), the estates' modifier icons (32 or 38 px against 48), `dev_share_pie_chart`, `custom_mapmode_7` (42 × 32). Most need the game's code read first. | profiles, code reading | 3–5 sessions |
| 5 | **Geometry the preview cannot know offline**: sizes of texts the game's code fills (`DefaultConfirm`'s `Description`, the lobby's `scenario_description`, Anbennar's magic menu) and a province's number of building slots, which the save does not hold. These become known deviations, each with an issue. | issues | 1 session |
| 6 | **The maintainer's consent** to the list of known deviations (5, and whatever 1 finds). | decision | the maintainer's time |
| 7 | **Views of profiled windows not yet captured**: the country views on the emperor, the Pope's controller and a colonial nation (14, 14 and 17 views whose Russian recipes fail), the country shield behind Anbennar's lobby, and the 1280×720 captures the manifest lists without a record (vanilla 25, Anbennar 19). Section 3 lets the other countries' views into the gate once their window has a profile, and most of theirs have one (a reading for the maintainer to confirm). | recipes, lock batches | 2–3 sessions, 2–3 lock batches |
| 8 | **The release**: the media refresh, `Release-As: 3.0.0`, the website and the copies of `docs/team-touchpoints.md` (eu4-engine-lab#109). | release | 1–2 sessions |

Total: about 11–17 sessions and 5–7 lock batches, with one Tongs release in the middle.

## Is 3.0.0 the next release after 2.14.0?

No. With at most one release per repository every three days, the release after 2.14.0 can go out
about three days later, and the gate needs more work than that: a fresh survey (1), a Tongs fix and
release (2) and the maintainer's consent (6) are on the critical path, and the lock is shared with
the other projects' batches. A realistic target is the second or third release after 2.14.0, if the
work starts with 1 and 2 at once. Until then, the releases between can carry the profile fixes of 3
and 4, which help users whether or not the gate holds.

Open question for the maintainer, before 1: which views count as "of a profiled window" when a view
has profiled and unprofiled roots (18 of vanilla's 56, 15 of Anbennar's 49): the whole view, or only
its profiled roots.
