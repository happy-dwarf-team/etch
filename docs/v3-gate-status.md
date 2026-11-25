# How far the v3 gate is (24 November 2026)

Since 24 November 2026 the gate holds back no release: v3's work ships in 2.x releases, and the
gate measures how far `main` is from v3's target ([v3 specification](spec/v3.md), section 7).

The distance from `main` to the gate of the [v3 specification](spec/v3.md), section 3,
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
section "The survey taken again, 23 November 2026" has the rest. These captures replace the fresh
Anbennar captures of Verne (11 November), but not all of their views: the crawls behind them were
of 3 November, which lack nine views the crawls of 10 November found (see the update below).

**Update, 24 November 2026.** Gap 5 is closed as far as the game lets it be. The nine lost views
are back in the survey, the views at 1280×720 a tooltip covered and vanilla's `s69` are captured,
and the views that depend on the country are taken again with the same host: 487 of the 490
captures the survey's manifest now lists, and 119 views on the three countries. The figures below
and the generated tables of [coverage-results.md](coverage-results.md) are `main`'s rules
(`b156984`) on these captures; that page's section "Gap 5: the views not yet captured,
24 November 2026" has the rest.

**Update, 24 November 2026.** Six fixes to the profiles take the geometry with the profiles from 23
to 6 rects off in vanilla at each size, and from 19 and 18 to 7 in Anbennar (etch#672 to etch#677:
the sprites Tongs 0.37 reports, the lobby's description, a rule's `text`, the patriarch authority's
value, Anbennar's achievement texts, and two of Proper 2K UI Enhanced's and P2KE's). Three more
(etch#684 to etch#686: the pie chart, the ledger's columns and the national idea icons) take
Proper 2K UI Enhanced from 80 to 33 and the P2KE playset from 52 to 23. Three after them (etch#693,
etch#694 and etch#696: a rule's `size` for the minimap, the naval doctrine choice and the great
projects box) take Proper 2K UI Enhanced to 23 and the P2KE playset to 19, and leave the gated sets
as they were. Three texts of etch#604 (the leader dialog, `agenda_effects` and the main menu's
`version_label`, a rule's `text` with `suffix` and `literal`) take the gated sets from 6 and 7 to 4,
Proper 2K UI Enhanced to 21 and the P2KE playset to 16. Six more (the peace offer, the parliament's
enacted issue, the institutions' bonus and three of Anbennar's magic menu, a `text` of parts with
`vars`) take vanilla and Bigger UI to 1, Anbennar alone to 0, Proper 2K UI Enhanced to 18 and the
P2KE playset to 12. The rebels' size (`REBELSIZE`) takes vanilla and Bigger UI to 0 and Proper 2K
UI Enhanced to 17. No capture was taken again. The figures below and the generated tables of
[coverage-results.md](coverage-results.md) are `main`'s rules (`c34df38` and the texts of etch#604) on the captures of 23 and
24 November; that page's section "The geometry fixes of 24 November 2026" has the rest. Nothing of
etch#606's kind is left: the minimap was the last (etch#693).

## What the gate asks

Section 3 gates three measures, and only for the views of a profiled window:

1. **Geometry:** 100 % of the compared rects exact, offline.
2. **Visibility from the live snapshot:** 100 %.
3. **Live snapshot texts** of profiled windows: 100 %.

Every remaining difference must be a bug or a known deviation with an issue and the maintainer's
consent (as ADR 0002), never a tolerance. Pixels, the holdout (Bigger UI) and windows not
reached are reported, not gated. Section 7 adds the media refresh as a step of the release.

The survey has 62 views of vanilla and 60 of Anbennar (`coverage/inventory.json`); 57 and 57 of
them have at least one profiled root, 38 and 35 only profiled roots.

## Where `main` stands

| Measure | Target | Measured with `main`'s rules of `c34df38` and the texts of etch#604, captures of 23 and 24 November | Met |
| --- | --- | --- | --- |
| Live texts, profiled windows | 100 % | 100.0 % on every playset and resolution, and on the three countries | yes |
| Live visibility | 100 % | 100.00 % on every set of the survey (vanilla at 1920×1080: 10835 of 10835, with the built building slots Tongs 0.23 reported hidden) and on the three countries | yes |
| Geometry offline, with the profiles | 100 % | vanilla 1920×1080 100 % (0 of 3421 rects off, 62 views), vanilla 1280×720 100 % (0 of 3417, 62 views), Anbennar 1920×1080 100 % (0 of 3524, 60 views), Anbennar 1280×720 100 % (0 of 3444, 59 views). On 24 November, rules of `b156984`: 23, 23, 19 and 18 | no |
| Known deviations with an issue and consent | every difference | proposed: etch#604 (heights of texts the game's code fills), etch#605 (building slots); consent not given. etch#606 is closed as fixed | no |

The geometry row reads "the outline offline" of section 3 as the outline with the profiles'
rules (measure 4 of [coverage.md](coverage.md)), as the results do for profiled windows. Read
literally as measure 1 (the outline without any profile, 81–88 % of rects), the gate cannot be
met: the profiles exist because positions depend on the game's state. The maintainer should
confirm the reading before the gate run.

What the geometry left on `main` is, by kind (vanilla and Anbennar at 1920×1080). The 24 November
fixes are in the list:

- **Heights of texts the game's code fills**: the most rects, all heights only. Proposed as a known
  deviation, etch#604. Left in vanilla, Anbennar and the countries: none; in Proper 2K UI Enhanced
  and the P2KE playset, two texts of two lines in the game (`nation_designer_hint`, Anbennar's
  `magic_advancement_current_subject`). Fixed on 24 November: the lobby's scenario description (etch#673), the ages view's
  description (etch#674), the patriarch authority's value (etch#676) and Anbennar's achievement
  texts (etch#677); after them the leader dialog for the ruler as general (the game adds a line
  break after the text), the estates' `agenda_effects` (empty without an agenda) and the main menu's
  `version_label` (the game's version and the playset's checksum), and then the peace offer, the parliament's enacted issue, the institutions' bonus, three texts of Anbennar's magic menu and the rebels' size (`rebelsize_desc`, whose 249 px the game's font gives the text, not a size the code sets); on 25 November the institutions' bonus from the save's institutions, the colonisation panel's `region_text`, and the numbers of the top bar and the diplomacy view from the save through the game's own formatters.
- **Widgets the game's code sizes or moves from a value**: all fixed. The development pie chart
  (etch#614, `chartSize`), the patriarch authority marker (etch#615, `slider`) and its value
  (etch#676), the estates' crown land modifier icons, which the game draws with `GFX_idea_unknown`
  and the modifier's picture, and the map mode buttons, with the sprites of their map modes
  (etch#672), and, off only in Proper 2K UI Enhanced, the minimap, which eu4.exe sizes to the
  `positionType` `minimap_size` (etch#693). Proposed as etch#606, closed as fixed.
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
| 4 | **The maintainer's consent** to the proposed deviations etch#604 and etch#605, or a fix for any of them, which no release waits for; etch#604 has no widget left in vanilla, Anbennar and the countries, only two texts of two lines in Proper 2K UI Enhanced and the P2KE playset, and etch#606 is closed as fixed (etch#672, etch#676, etch#693). | decision | the maintainer's time |
| 5 | **Views of profiled windows not yet captured**: done on 24 November, with the same host. The 1280×720 views a tooltip covered are captured (the driver rests the pointer on the minimap when a view covers the pause banner, etch#670), vanilla's `s69` scrolls the leader list to a leader with an army, and the country shield behind Anbennar's lobby (`anbennar-alone-menu-s8`) is captured with the other eight views the survey had lost. The countries: 41 views on the emperor, 41 on the Pope's controller and 37 on a colonial nation, with no live visibility failure and the rects off of known kinds (etch#604, etch#606); the 10, 10 and 14 left are views the country does not have (no parliament, Celestial Empire, war, rebels or Orthodox icons, the native policy and buttons it has disabled). Left: Anbennar's disband from the reorganisation at 1280×720, which the game does not let a click open there (the reorganisation covers the disband button), and in reported sets P2K's `s61` and the P2KE playset's achievements button. Section 3 lets the other countries' views into the gate once their window has a profile (a reading for the maintainer to confirm). | recipes, lock batches | done |
| 6 | **The release**: none of its own. The media refresh, the website and the copies of `docs/team-touchpoints.md` go out with a 2.x release, the one that reaches the gate or an earlier one (spec/v3.md section 7; eu4-engine-lab#109 asked for 3.0.0). | release | with a 2.x release |

Left: the maintainer's time for 4, and the media refresh with a 2.x release (6).

## The release after 2.14.0

2.15.0, from the release pull request release-please keeps open. Nothing since 2.14.0 breaks, so
the version stays 2.x; the gate holds back no release (spec/v3.md section 7), and the maintainer
decides when to release it.

Open question for the maintainer, before the gate run: which views count as "of a profiled window" when a view
has profiled and unprofiled roots (19 of vanilla's 57, 22 of Anbennar's 57): the whole view, or only
its profiled roots.
