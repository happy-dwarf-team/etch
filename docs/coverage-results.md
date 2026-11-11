# Coverage survey results

Shares are of widgets summed over the views (docs/coverage.md, "Measures"). "Offline preview" is
what a mod author sees without a game: each window with its profile where it has one, else as
the outline. A view is
"full" when every compared rect is exact and the game shows nothing the layout lacks, and from
the live snapshot also when every visibility agrees. "With profiles" is the outline offline
with the profiles' rules, their selectors set to what the game showed, over the windows that
have a profile.

| Playset | Resolution | Views | Offline preview: rects | Offline preview: visibility | Outline rects | Outline visibility | Full (outline) | With profiles: rects | With profiles: visibility | Live rects | Live visibility | Full (live) | Live texts | Texts, profiled windows | Pixel pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla | 1280x720 | 36 | 98.9 % | 99.0 % | 75.7 % | 88.2 % | 11 | 98.9 % | 98.9 % | 99.7 % | 100.0 % | 34 | 100.0 % | 100.0 % | 1 of 36 |
| vanilla | 1920x1080 | 60 | 98.5 % | 99.0 % | 81.2 % | 87.1 % | 22 | 98.6 % | 98.9 % | 99.6 % | 99.9 % | 56 | 100.0 % | 100.0 % | 3 of 60 |
| anbennar-alone | 1280x720 | 33 | 99.5 % | 99.3 % | 82.7 % | 77.2 % | 14 | 99.5 % | 99.3 % | 99.9 % | 100.0 % | 31 | 100.0 % | 100.0 % | 1 of 33 |
| anbennar-alone | 1920x1080 | 52 | 99.2 % | 99.3 % | 87.6 % | 75.4 % | 24 | 99.3 % | 99.3 % | 99.9 % | 100.0 % | 49 | 100.0 % | 100.0 % | 3 of 52 |
| bigger-ui | 1280x720 | 36 | 98.9 % | 99.0 % | 75.7 % | 88.2 % | 11 | 98.9 % | 98.9 % | 99.7 % | 100.0 % | 34 | 100.0 % | 100.0 % | 1 of 36 |
| bigger-ui | 1920x1080 | 60 | 98.6 % | 99.1 % | 81.2 % | 87.2 % | 22 | 98.7 % | 99.0 % | 99.6 % | 100.0 % | 57 | 100.0 % | 100.0 % | 3 of 60 |
| proper-2k-ui-enhanced | 2560x1440 | 9 | 97.4 % | 99.3 % | 96.6 % | 76.2 % | 1 | 97.3 % | 99.4 % | 99.7 % | 100.0 % | 8 | 100.0 % | 100.0 % | 0 of 9 |

"With profiles and live texts" is the same with the snapshot's texts and list rows as sample
data: what Compare with Live Game compares (spec/v3.md section 4), through the same functions.

| Playset | Resolution | With profiles and live texts: rects | With profiles and live texts: visibility |
| --- | --- | --- | --- |
| vanilla | 1280x720 | 99.3 % | 99.0 % |
| vanilla | 1920x1080 | 99.2 % | 99.0 % |
| anbennar-alone | 1280x720 | 99.8 % | 99.3 % |
| anbennar-alone | 1920x1080 | 99.8 % | 99.3 % |
| bigger-ui | 1280x720 | 99.3 % | 99.0 % |
| bigger-ui | 1920x1080 | 99.2 % | 99.1 % |
| proper-2k-ui-enhanced | 2560x1440 | 99.7 % | 99.4 % |

Captures the survey's manifest lists but no record has: vanilla 1280x720 25, vanilla 1920x1080 1, anbennar-alone 1280x720 19, bigger-ui 1280x720 25, bigger-ui 1920x1080 1, proper-2k-ui-enhanced 2560x1440 52, anbennar 2560x1440 52. At 1280×720 only the views whose windows have a variant there are captured.

<!-- other countries: start -->
## Other countries: data the rules were not made from

The run of 4 November 2026 (etch#258, [docs/coverage.md](coverage.md), "Other countries"): the
same views in three other game states, EU4 1.37.5, 1920×1080, on `d6468ae`. Every figure in the
first table comes from before any rule was changed for this run. "Same views" is the first run
over the views the second run captured too, so the two rows compare the same recipes; the views
of the main menu are not in it. The first run's figures for all its views are in the table above.

| Set | Views | Offline preview: rects | Offline preview: visibility | With profiles: rects | With profiles: visibility | Outline rects | Outline visibility | Live rects | Live visibility | Live texts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla, first run, same views (Russia, 1719) | 38 | 98.2 % | 98.2 % | 98.4 % | 97.9 % | 78.0 % | 89.0 % | 98.3 % | 100.0 % | 99.5 % |
| **France, 1550, unseen** | 39 | **98.3 %** | **94.2 %** | 98.7 % | 93.9 % | 78.5 % | 86.5 % | 98.3 % | 100.0 % | 99.4 % |
| vanilla, first run, same views (Russia, 1719) | 43 | 96.7 % | 97.9 % | 98.8 % | 97.9 % | 75.0 % | 88.8 % | 98.4 % | 100.0 % | 99.6 % |
| **Ottomans, 1550, unseen** | 44 | **96.6 %** | **94.4 %** | 99.1 % | 94.2 % | 75.1 % | 85.5 % | 98.3 % | 100.0 % | 99.5 % |
| Anbennar alone, first run, same views (Verne, 1444) | 43 | 96.1 % | 96.5 % | 99.0 % | 96.3 % | 82.4 % | 78.1 % | 98.6 % | 100.0 % | 99.6 % |
| **Kobildzan, 1594, unseen** | 43 | **95.5 %** | **94.8 %** | 98.9 % | 94.0 % | 81.4 % | 82.3 % | 98.2 % | 99.9 % | 99.7 % |

**What holds:** the rects. Positions and sizes do not depend on the country much: offline 98.3
against 98.2 % in vanilla, 95.5 against 96.1 % in Anbennar, where the estates' rows take most of
the difference. The live preview holds on every measure.

**What does not:** the visibility rules, 4.0 points lower on France, 3.5 on the Ottomans and 1.7
on Kobildzan. On
France 5.7 % of the widgets disagree against 1.8 % on the same views of Russia (367 of 6,435, 124
of 7,084), on Kobildzan 5.1 % against 3.5 % (475 of 9,266, 257 of 7,394). The figures of 97.9 and
96.8 % measured on the rules' own captures were optimistic by about that much.

What failed on France, by window (widgets over views, first run in brackets):

| Window | Failed | Why |
| --- | --- | --- |
| `countrydiplomacyview` | 153 (0) | One path: `other-country` hid `countryshield_glow`, France's view of Russia shows it, so no value of `country` fitted and 76 widgets of each of two views followed |
| `single_unitpanel` | 44 (0) | A window with no vanilla profile, in a view the first run did not capture: not a rule that failed |
| `provinceview` | 38 (56) | No worse than the first run |
| `countryreligionview` | 26 (1) | Only the orthodox panel could show |
| `countrymilitaryview` | 26 (26) | The same as the first run |
| `countrygovernmentview` | 24 (9) | The government mechanics and the revolution bar were always drawn |
| `ledger` | 12 (12) | The same as the first run |

On Kobildzan most of the new failures are `countryreligionview` (138, first run 1: the
religion's own lists, 121 rows of `province_listbox`, and `jewish_specific_window`) and
`countrycourtview` (28, first run 0: an elected ruler's court, drawn as a monarch's).

Not captured: 13 of 52 views on France, 8 of 52 on the Ottomans, 6 of 49 on Kobildzan, because the country lacks them or the
game refused the click. The parliament, the Celestial Empire's three views, the two views of a
war, the orthodox icons, a policy, a rebel faction, an idea group, the ruler as general, an
undiscovered province, the estates' close button on France; the HRE's leave button, three of the magic
menus, the deity and a privilege on Kobildzan. Those views' rules were not tested. One France
view (`vanilla-save-s69`) the first run lacks, so the unseen row has one view more.

### After the fixes: no longer unseen

etch#310 changed the rules that failed on France. **France's figures below say that the fixes do
what they were made to, not how far the rules carry.** The Ottomans and Kobildzan were not used
for them: the Ottomans were captured after the fixes, so they are the test of those.

| Set | Offline preview: rects | Offline preview: visibility | With profiles: visibility |
| --- | --- | --- | --- |
| France, 1550 (rules fixed on it) | 98.3 → 98.4 % | 94.2 → 97.3 % | 93.9 → 97.8 % |
| Ottomans, 1550 (not used for the fixes) | 96.6 → 96.7 % | 94.4 → **97.0 %** | 94.2 → 97.6 % |
| Kobildzan, 1594 (not used for the fixes) | 95.5 % | 94.8 → 94.9 % | 94.0 → 94.1 % |
| vanilla, first run, all views | 96.1 % | 97.9 % | 98.1 % |
| Anbennar alone, first run, all views | 96.6 % | 96.8 % | 96.7 % |

The first run does not move, so the fixes cost nothing on Russia and Verne. **The fixes carry to
another country of the base game:** the Ottomans gain 2.6 points on rules never fitted to them,
376 failures down to 196, and every selector finds a value. A selector still takes the value that
fits the game, so this says the rules can describe that country, as an author who sets `View ▾`
would see it. Kobildzan barely moves: what was fixed from France does not reach Anbennar, whose
profiles have their own rules. On `main`
with etch#308 and etch#309 too, France is 98.4 and 97.4 %, Kobildzan 95.6 and 94.9 %.

**The moves with no setter in the code** (etch#253) hold on both unseen sets:
`institutions_window` −140, `great_projects_window` +10 and `current_religion_icon` +62 have no
position difference in either. What the code sets is the same in every state seen:
`religionpanel_bg_top` is 569 × 590 and `dev_share_pie_chart` 32 × 32 on Russia, Verne, France and
Kobildzan, so a rule can say so (etch#256). `stability_value` and `stability_progress_threshold`
are 48 px right of the layout on both sets, as on Russia and not on Verne.

Not measured in that run: the other planned sets (Muscovy 1466 and Bluescale 1472 follow below; Ming,
Venice, Arg-Ordstun 1582), 1280×720, pixels (`compare --gpu` over this run), and Anbennar with its
usual mods: Kobildzan's save was played with more mods than the playset loads.

### The run of 6 November 2026: on the game again, and two more countries

etch#320 took the live preview to 99.5 % of rects on stored captures only. This run takes the same
views from the running game: EU4 1.37.5 (`9AD3EFE1…`), 1920×1080, under the lab's game lock. Each
figure below says what it was measured on. The tables above are older and keep their own commits.

**The stored captures hold.** The game gives the same figures as the captures it was asked to
replace, on one commit of the rules:

| Set | Views taken again | Offline preview: rects | Offline preview: visibility | Live rects | Live visibility |
| --- | --- | --- | --- | --- | --- |
| vanilla (Russia, 1719) | 61 of 62 | 96.2 % (3515/3651) | 97.9 % (9742/9944) | 99.5 % (3690/3706) | 99.9 % (9953/9959) |
| Anbennar alone (Verne, 1444) | 53 of 53 | 96.6 % (3248/3360) | 96.8 % (8695/8979) | 99.6 % (3422/3433) | 99.9 % (8875/8876) |

Identical to the widget on both sets. Of the first 59 views of vanilla, 54 have widget trees equal to
the byte; the other five differ by a list's order, a row's pixel or two, or a value, which changes
no result. `vanilla-save-s69` is the one view left: its recipe does not open the view on Russia, and
the stored set lacks it too. 108 views were taken on the survey's host, with Tongs 0.23.0, and 39
again or for the first time on Anvil 1.12.0 and Tongs 0.26.1, which change no figure either.

**Two countries the rules were not made from**, on `main` (`8f2e87b`), Anvil 1.12.0, Tongs 0.26.1:

| Set | Views | Offline preview: rects | Offline preview: visibility | With profiles: rects | With profiles: visibility | Outline rects | Outline visibility | Live rects | Live visibility | Live texts |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla, stored, same views (Russia, 1719) | 40 | 96.4 % | 97.7 % | 98.4 % | 97.6 % | 77.0 % | 88.3 % | 99.3 % | 100.0 % | 99.6 % |
| **Muscovy, 1466, unseen** | 41 | **96.2 %** | **95.9 %** | 98.8 % | 96.3 % | 77.4 % | 83.3 % | 99.3 % | 100.0 % | 99.5 % |
| Anbennar alone, stored, same views (Verne, 1444) | 44 | 98.9 % | 97.0 % | 99.0 % | 96.6 % | 86.9 % | 75.8 % | 99.8 % | 100.0 % | 99.6 % |
| **Bluescale, 1472, unseen** | 44 | **98.8 %** | **96.4 %** | 99.0 % | 95.8 % | 86.6 % | 73.5 % | 99.7 % | 100.0 % | 99.6 % |

The result of etch#258 again, smaller: rects hold (96.2 against 96.4 %, 98.8 against 98.9 %), the
live preview holds, and the visibility rules lose 1.8 points on Muscovy and 0.6 on Bluescale. The
rule fixes of etch#310 did carry: France lost 4.0 points on the same measure. Live visibility has
no failure on either set, 12,893 widgets.

Not captured: 11 of 52 views on Muscovy, 5 of 49 on Bluescale. Muscovy lacks the parliament, the
Celestial Empire and a war, among others; on Bluescale the game refused an undiscovered province,
the HRE's leave button, the deity, and two estate views. Those views' rules were not tested.
Bluescale's save was played with more mods than the playset loads.

**What the run fixed.** Three things, so the figures after them are no longer unseen:

- A window whose rect in the snapshot differs from its definition keeps its children's positions
  from the snapshot now (`livePosition`, the live preview). Live rects on the stored captures:
  vanilla 3,689 → 3,690 of 3,706, Anbennar alone 3,417 → 3,422 of 3,433.
- `countrycourtview` and `countryestatesview` got selectors for what Muscovy has and Russia lacks:
  a consort, the consort's crown, the heir's claim, an agenda, and the crown land's effect.
- `single_unitpanel` has a profile, with a selector for an army or a fleet. It was the second
  largest failure on France, 44 widgets.

| Set | Offline preview: rects | Offline preview: visibility | With profiles: visibility | Live rects |
| --- | --- | --- | --- | --- |
| Muscovy, 1466 (rules fixed on it) | 96.2 → 96.3 % | 95.9 → 97.2 % | 96.3 → 97.1 % | 99.3 → 99.4 % |
| Bluescale, 1472 (one rule fixed on it) | 98.8 % | 96.4 % | 95.8 % | 99.7 % |
| France, 1550 | 98.5 % | 98.1 % | 97.9 % | 99.4 % |
| Ottomans, 1550 | 96.7 % | 97.7 % | 97.7 % | 99.6 % |
| Kobildzan, 1594 | 95.6 % | 95.0 % | 94.2 % | 99.2 % |
| vanilla, stored, all views | 96.2 % | 97.9 % | 98.0 % | 99.5 % |
| Anbennar alone, stored, all views | 96.6 % | 96.8 % | 96.7 % | 99.6 % |

No view of 268 lost a widget, apart from `single_unitpanel` on Muscovy, a window that had no
profile to be measured before. Bluescale is where the first draft failed: it has a consort and no
crown, so a rule tying the two left the selector with no value; they are two selectors now. On
8 of the 85 views of the two countries a selector still finds no value and its default is drawn:
`unit` on 3, `construction`, `fort`, `religionPanel`, `crownLand` on one each, and six of the
province view's on one view of Bluescale.

The 13 rects left on Muscovy are sizes the game's code sets: `custom_mapmode_7`, `ages_view/picture`,
`religionpanel_bg_top`, `dev_share_pie_chart`, `onsiegewon_desc`, `estate_icon` and the
`modifier_icon_*`. The preview keeps drawing them at their definition's size on purpose: taking the
size from the snapshot would only zero the measure.

Not measured: 1280×720, pixels (`compare --gpu` over this run), Ming, Venice and Arg-Ordstun.

### Anbennar's profiles on a country of its own (10 November 2026)

The v3 draft (spec/v3.md section 8) takes up Anbennar's own countries: after etch#310 Kobildzan
stayed at 94.9 %, its religion's own lists and an elected ruler's court the largest classes left.
The religion and court profiles of Anbennar now have selectors for what differs between
Anbennar's countries: the base game's religion panel an Anbennar religion takes (none for most,
the jewish one for Kobildzan's aspects), the personal deity, the province list with its sort
buttons, full unity, the deity selection screen, and an elective succession (the election's
notice, no heir); with no consort the consort's banner, name and traits are hidden too. The rules
were fitted on Kobildzan's captures only. Bluescale is the test: one rule of the court was fixed on
it before (the consort's crown), none of these. On the stored captures, 1920×1080, rules of
`main` (`e293a4e`) against this change, selectors set to what the game showed:

| Set | Offline preview: visibility | With profiles: visibility | Religion and court views: failures |
| --- | --- | --- | --- |
| Kobildzan, 1594 (rules fitted on it) | 95.1 → 96.7 % (8849/9305 → 8886/9186) | 94.3 → 96.3 % | 156 → 0 |
| **Bluescale, 1472 (not used for these rules)** | **96.5 → 96.6 %** (7222/7486 → 7233/7486) | 95.9 → 96.1 % | 12 → 1 |
| Anbennar alone, stored, all views (Verne, 1444) | 96.9 → 96.9 % (8520/8797 → 8524/8797) | 96.7 → 96.7 % | 11 → 7 |

Rects do not move (95.6, 98.9 and 96.7 %). **The fixes carry to Bluescale on the two views:** its
religion view had the jewish panel and the deity wrong and has no failure left; the one left in
its court is `monarch_heir_crown_icon`, which Anbennar's profile hides and Bluescale's heir shows.
Verne loses nothing; the seven left are the deity selection view's own missionary widgets. What
is left on Kobildzan is not of these two windows: the province view (135, as on Verne and
Bluescale), the military tab (29), the diplomacy view (25), the estates' rows (16) and the top
bar (16).

### Views that depend on the country (10 November 2026)

The v3 draft's survey takes the views a country of another kind sees: the emperor, the Pope's
controller and a colonial nation. Each is a copy of the Russian game of 15 September 1550 with the
player moved, as France and the Ottomans above: Austria, the emperor, Aragon, which controls the
Curia, and the colonial nation `C01` of Castile. The player is moved in the save rather than by the console's `tag`, so the capture
makes no game call. EU4 1.37.5 (`9AD3EFE1…`), 1920×1080, Tongs 0.26.1 (France was taken with
0.23.0, which changes no figure, as above), rules of `main` (`573f140`). France is the reference:
the same game and date, a country of the usual kind. On the 33 views all four have:

| Set | Views | Offline preview: rects | Offline preview: visibility | With profiles: visibility | Live rects | Live visibility |
| --- | --- | --- | --- | --- | --- | --- |
| France, 1550 (reference) | 33 | 99.1 % (1966/1984) | 98.2 % (5743/5848) | 98.0 % | 99.9 % | 100.0 % |
| **Austria, the emperor** | 33 | **99.1 %** (1969/1987) | **98.2 %** (5440/5542) | 97.9 % | 99.9 % | 100.0 % |
| **Aragon, the Pope's controller** | 33 | **99.0 %** (1941/1960) | **97.5 %** (4749/4872) | 97.0 % | 99.8 % | 100.0 % |
| **C01, a colonial nation** | 33 | **99.1 %** (1898/1916) | **96.7 %** (4303/4451) | 96.0 % | 99.8 % | 100.0 % |

Rects hold and live visibility has no failure on any of the three. The visibility rules hold on
the emperor and lose 0.7 points on the Pope's controller and 1.5 on the colonial nation. The
religion view of the Pope's controller, with the Curia's controls, has no failure France does not
have. What each country fails where France does not:

- **The emperor's HRE view:** `hre_window/join_button` is drawn, and the game hides it from the
  emperor; in the diplomacy view, the rivals' and enemies' labels. Nothing else on 37 views.

- **The court without an heir** (both): the heir's banner, traits and values, `abdicate_ruler_button`,
  `disinherit_button` and `extend_regency_button` are drawn, and the game hides them. Vanilla's
  court profile has no selector for a country without an heir; Anbennar's has one for an elective
  court.
- **The province view's fort** (both, the capital's province): `building_fort`, the maintenance
  checkboxes and their icons, and `fort_number`'s place; the colonial nation's capital has no fort.
- **A colonial nation's own windows:** the subject view's eight sort buttons with no subject to
  sort, the religion view's province list with its sort buttons and full unity (Anbennar's
  religion profile has selectors for both, vanilla's has none), the national ideas' progress (a
  colonial nation has no national ideas of its own), and the golden age banner of the ages view.

Not captured: 14 views on the emperor and on the Pope's controller, 17 on the colonial nation.
The recipes written for Russia fail on all three (the parliament, the Celestial Empire, the
Orthodox icons, an undiscovered province, a war, the native policy, a rebel faction, an estate's
row). The subject's focus is disabled on the Pope's controller and the colonial nation, the naval
doctrine on the emperor, and the colonial nation also has the estates tab and two of the military
view's buttons disabled (`button_makerulergeneral`, `mothball_all`).
The views those recipes open were not tested on these countries.

### Anbennar's menu to the end, and confirmation dialogs (10 November 2026)

The rest of the v3 draft's survey, after etch#352. Anbennar's single-player lobby was taken while
the main menu still faded out, so its steps never led to it again and nothing behind it was
crawled; the crawler now reads a new view until it holds. A crawl of Anbennar's main menu afresh
(19 starts) found 10 views where it found 4, the same set as vanilla's: the lobby, its game
options, find box, options and their custom tab, the nation designer, and a country's shield.
The survey's `dialogs` let the crawler open the confirmation of an idea group's abandon and a
unit's disband, never confirmed. Taken under the lab's game lock, EU4 1.37.5 (`9AD3EFE1…`),
Tongs 0.23.0, 1920×1080, measured on `main` (`4922d56`):

| View | Offline preview: rects | Offline preview: visibility | Outline visibility | With profiles: visibility | Live visibility |
| --- | --- | --- | --- | --- | --- |
| Anbennar, the lobby | 39/42 | 104/106 | 61/106 | 94/96 | 107/107 |
| Anbennar, the lobby's game options | 65/68 | 130/137 | 87/137 | 94/96 | 137/138 |
| Anbennar, the lobby's find box | 47/50 | 114/117 | 71/117 | 94/96 | 118/118 |
| Anbennar, the lobby's options | 50/53 | 118/122 | 75/122 | 94/96 | 123/123 |
| Anbennar, the nation designer | 22/22 | 56/57 | 22/57 | 56/57 | 57/57 |
| vanilla, abandoning an idea group (`DefaultConfirm`) | 36/37 | 207/208 | 205/208 | 182/183 | 208/208 |
| Anbennar, disbanding a unit (`DefaultConfirm`) | 31/32 | 311/313 | 268/313 | 276/278 | 314/314 |
| Anbennar, disbanding from the reorganisation (`DefaultConfirm`) | 48/49 | 338/339 | 338/339 | — | 340/340 |

What the lobby's views fail is the lobby's own: the rects of `scenario_description` and the two
`shield_thin_glow`, and `datewidget` and `random_new_world_button`, which the preview draws and
the game hides; behind it, the settings' audio and controls tabs, the find box's `goto`, and
the options' multiplayer and custom setup tabs, drawn and hidden by the game the same way. The
confirmation fails only its `Description`'s rect, a text the game's code sizes, on all three; the
rest is the unit panel's (`enable_rebel_button_glow`, `mission_icon`, `reorg_window/naval_window`).
No click of these changed the game, and their `AgreeButton` was never clicked. Not captured: the
country shield behind the lobby, whose recipe failed after the view before it.

### Anbennar taken again, and its gaps closed (11 November 2026)

The survey's Anbennar views taken again from the game with Etch 2.7.0 (`main`, `6c175a5`), ranked by
what the offline preview gets wrong, and the largest gaps closed. EU4 1.37.5 (`9AD3EFE1…`), Anvil 1.12.0,
Tongs 0.26.1, 1920×1080, under the lab's game lock, from the manifest of the crawls of 10 November (61
views of `anbennar-alone`). **The game gives the stored captures again:** on the rules of `6c175a5` the
fresh captures and the stored ones agree to the widget on every measure (3511/3634 rects and 9796/10094
visibility offline, 59 views at 1920×1080). The manifest's other two views, the lobby's country shield
and its options' custom tab (`anbennar-alone-menu-s8`, `s9`), did not come back by their recipe in this
run either: the main menu's `single_player_button` was not shown when the recipe clicked it.

Verne, 1444, the fresh captures, rules of `6c175a5` against `main` after the fixes below:

| Measure | Before | After |
| --- | --- | --- |
| Offline preview: rects | 96.6 % (3511/3634) | **96.9 %** (3578/3689) |
| Offline preview: visibility | 97.0 % (9796/10094) | **99.0 %** (9990/10090) |
| With profiles: rects | 98.8 % (2579/2609) | 99.1 % (2750/2774) |
| With profiles: visibility | 96.9 % (7799/8047) | **99.2 %** (8119/8181) |
| Live rects, live visibility | 99.7 %, 99.9 % | unchanged |
| Views the offline preview gets fully right | 10 of 59 | 25 of 59 |

The same rules on the stored captures, and on the two Anbennar countries no rule of this run was made
from:

| Set | Offline preview: visibility | With profiles: visibility | Offline preview: rects |
| --- | --- | --- | --- |
| Anbennar alone, 1280×720, stored, 33 views | 96.6 → 99.1 % | 96.1 → 99.1 % | 99.0 → 99.3 % |
| vanilla, 1920×1080, stored, 52 views | 97.9 → 98.7 % | 97.9 → 98.9 % | 96.6 → 96.9 % |
| vanilla, 1280×720, stored, 32 views | 98.1 → 99.0 % | 97.7 → 98.9 % | 98.8 → 98.9 % |
| **Bluescale, 1472, unseen** | 96.6 → **98.8 %** | 96.0 → 98.7 % | 98.8 → 99.2 % |
| **Kobildzan, 1594, unseen** | 96.7 → **98.5 %** | 96.3 → 98.5 % | 95.5 → 95.9 % |

No view of any set lost a widget. The two unseen countries are the test of the fixes: the rules carry to
them as they do to Verne. Most fixes are rules of the base game's profiles, which the same views of
vanilla failed too.

What was fixed, largest first (widgets of Verne's views at 1920×1080 that each fix corrects):

| Gap | Widgets, views | Fix |
| --- | --- | --- |
| The province view's state tab: the game keeps `province_window` shown under `state_window`, so no value of `tab` fitted and every selector fell back | 181, 1 | etch#355 |
| Anbennar's scripted military buttons, the unit type choice, a country without an heir, an Empire member, a mage ruler, the top bar's unused icons | 43, 12 | etch#356 |
| The military tab's professionalism markers, which the game's code adds along the bar (`CProfessionalismMarker`, 0xFAC8B0) | 30, 3 (50 in vanilla) | etch#357 (`place.along`) |
| Sub-screens a click opens: a new policy, an idea group's choice, the reform choice, the religion view's selection screens, the institutions, rebel handling, the loan list, the map mode list | 29, 15 | etch#359, etch#361, etch#367 |
| Main menu settings pages, Anbennar's lobby date and random New World, the unit panel's rebel suppression | 21, 8 | etch#360, etch#364, etch#365 |
| Texts the game fits to one line: the fort's level and the military technology (`integer`), the economy tab's totals | 13, 6 | etch#362, etch#363 |
| A `positionType` inside a window laid out as a widget (`naval_mission_window_position`) | listed apart, 3 | etch#366 |

What is left, Verne 1920×1080, offline preview (111 rects and 100 visibility failures):

- **The province view's building slots** (about 50 widgets in 4 views): Tongs reports the slots that
  hold a building as hidden while the screenshot shows the building drawn there, and the free and locked
  slots differ by province. What Tongs reads for a built slot needs a check in the game first; until then
  the preview draws every slot.
- **`anbennar-alone-save-s52`** (80 widgets): after the estates tab is closed, Tongs still reports its
  estate rows as shown top-level windows, and the screenshot shows none of them. The view measures that
  report, not the preview.
- **The ledger's sort buttons** (24 in one view): the game's code places one per column of the page, at
  the columns' widths; the live preview takes them from the snapshot.
- **Sizes the game's code sets** (`religionpanel_bg_top`, `dev_share_pie_chart`, `custom_mapmode_7`,
  `ages_view/picture`, `DefaultConfirm/Description`, the lobby's `scenario_description`, the magic menu's
  and achievements' texts), and the strait and river marks, which the map decides.

The 1280×720 figures above are of the stored captures; the game's own 1280×720 views and pixels follow
below.

**After that section** the same run took ten more fixes. Four are rules that no view of Verne fails
and the unseen countries do: etch#369 (the estates' crown land and agenda in Anbennar), etch#370 (an
elective heir, rivals and the shield glow in the diplomacy view), etch#371 (the top bar's other
legitimacies and the player's shield glow), and the empty lists of etch#373's trade tab. Five fix views
of Verne too: etch#372 (the rest of the state tab), etch#373 (the trade tab's merchant choice), etch#374
(a rule's `sprite`, for the religion view's background), etch#375 (the ages view's picture) and etch#376
(the lobby's shield glows on their shields). etch#377 is the measure's own: the live texts of the copies
the game's code makes from other definitions (the ledger's sort buttons), which the live preview draws
and the measure missed. **The estates, diplomacy, top bar and trade tab views of Bluescale and Kobildzan
are no longer unseen after them**; the other fixes were not drawn from them. Rules of `main` with
etch#377, before against after both passes:

| Set | Offline preview: rects | Offline preview: visibility | With profiles: visibility | Live rects |
| --- | --- | --- | --- | --- |
| Verne, 1920×1080, fresh | 96.6 → **97.2 %** (3511 → 3589 of 3689) | 97.0 → **99.1 %** (9796 → 10004 of 10090) | 96.9 → 99.3 % | 99.7 → 99.7 % (3696 → 3699 of 3707) |
| Verne, 1280×720, stored | 99.0 → 99.5 % | 96.6 → 99.3 % | 96.1 → 99.3 % | 99.8 → 99.9 % |
| vanilla, 1920×1080, stored | 96.6 → 97.0 % | 97.9 → 98.7 % | 97.9 → 98.9 % | 99.5 → 99.6 % |
| Bluescale, 1472 | 98.8 → 99.1 % | 96.6 → 99.2 % | 96.0 → 99.1 % | 99.7 → 99.8 % |
| Kobildzan, 1594 | 95.5 → 95.8 % | 96.7 → 99.0 % | 96.3 → 99.1 % | 99.2 → 99.3 % |

The live texts in profiled windows reach 100 % on every set (Verne 1982 → 1989 of 1989), a measure of
the 3.0.0 gate (spec/v3.md section 3). On the fresh captures of Verne the offline preview gets 30 of the
59 views fully right, from 10, and the live preview 53, from 50. Live visibility reaches 100 % (10032 of
10032) with etch#378's measure fix: the two widgets it missed were the hidden second instance of the
main menu's settings, which the measure paired with the shown one's layout.

After both passes, 71 of the 100 rects and 27 of the 86 visibility failures left on Verne at
1920×1080 were `anbennar-alone-save-s52`'s estate rows, which are not a view: after the estates view's
close button, Tongs still lists its rows as shown top-level windows, and the game draws none of them.
etch#379 leaves such a state out of the survey's manifest (roots that are all numbered copies), which
drops `anbennar-alone-save-s52` and vanilla's `save-s73`. Offline preview rects, before → after it:
Verne 1920×1080 fresh 97.2 → **99.1 %** (3589 of 3618), Verne 1280×720 fresh 97.2 → **99.3 %** (2811
of 2830), Kobildzan 95.8 → **98.9 %**, vanilla 1920×1080 on the survey 97.2 → 98.5 %; visibility gains
0.2 to 0.4 points on the same sets.

What is left on Verne at 1920×1080 (29 rects and 59 visibility failures offline, and 18 widgets only
the game has): 33 are the province view's building slots, where Tongs reports a built slot as hidden while the screenshot shows
it drawn; 24 are the ledger's sort buttons, which the game's code places by the columns of the page;
the rest are sizes the game's code sets (the magic menu's and the dialogs' texts, `dev_share_pie_chart`,
the estates' modifier icons, the lobby's `scenario_description`) and the map's strait and river marks.

**1280×720 from the game, and pixels.** The same day's second batch took Anbennar's 1280×720 views
from the game again: 51 views, 18 of which no run had taken at 1280×720 before (the views of the later
crawls). On them, rules of `6c175a5` against `main` with etch#378: offline preview rects 96.4 → 97.2 %
(2811 of 2890), visibility 96.3 → 98.8 % (8018 of 8114), with profiles 96.4 → 99.2 %, live visibility
99.9 → 100 % (8109 of 8109); 9 → 27 of the 51 views fully right offline. `compare --gpu` over the fresh
captures of both resolutions (rules of `1181976`): 5 of 110 pass, as the survey's views have no masks
of what the game fills (see Pixels below).
<!-- other countries: end -->

## What differs

### vanilla

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 311 | 9 | `provinceview/province_window/tax_base_value` |
| outline rect, iconType: y differ | 163 | 6 | `countrymilitaryview/icon_cost` |
| outline: the game shows a widget the layout lacks | 109 | 12 | `minimap_panel/minimap_bg` |
| outline rect, guiButtonType: y differ | 52 | 5 | `countrymilitaryview/infantry_type_button` |
| outline rect, instantTextBoxType: h differ | 33 | 19 | `ages_view/desc` |
| outline rect, instantTextBoxType: x differ | 22 | 7 | `countrydiplomacyview/label_nation` |
| outline rect, windowType: y, h differ | 20 | 10 | `provinceview` |
| outline rect, windowType: y differ | 19 | 9 | `menubar/WarOverviewButtonWindow` |
| outline rect, iconType: w, h differ | 16 | 5 | `ages_view/picture` |
| outline rect, instantTextBoxType: w differ | 12 | 7 | `provinceview/province_window/warscore_value` |
| outline rect, iconType: x differ | 10 | 5 | `countrystabilityview/stability_progress_threshold` |
| outline rect, instantTextBoxType: w, h differ | 8 | 5 | `countrydiplomacyview/num_relations_value` |
| live: the game shows it, not drawn (profiled) | 4 | 1 | `peace_view/standardtext_slider/listboxSliderButton` |
| outline rect, iconType: x, y differ | 3 | 2 | `countryreligionview/orthodox_specific_window/current_patriarch_authority` |
| outline rect, iconType: y, w, h differ | 3 | 2 | `countryestatesview/dev_share_pie_chart` |
| live: no value of selector page fits | 3 | 2 | `menu_settings` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, instantTextBoxType: x, y, h differ | 2 | 1 | `countryreligionview/orthodox_specific_window/current_patriarch_authority_value` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| live: no value of selector religionPanel fits | 2 | 1 | `countryreligionview` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |
| outline rect, instantTextBoxType: x, y differ | 1 | 1 | `waroverview/waroverview_value` |

### anbennar-alone

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 195 | 7 | `provinceview/province_window/tax_base_value` |
| outline rect, iconType: y differ | 96 | 3 | `countrymilitaryview/icon_cost` |
| outline: the game shows a widget the layout lacks | 84 | 8 | `minimap_panel/minimap_bg` |
| outline rect, instantTextBoxType: h differ | 21 | 10 | `ages_view/desc` |
| outline rect, guiButtonType: y differ | 19 | 3 | `countrymilitaryview/infantry_type_button` |
| outline rect, windowType: y differ | 16 | 6 | `menubar/WarOverviewButtonWindow` |
| outline rect, instantTextBoxType: x differ | 16 | 4 | `countrydiplomacyview/label_nation` |
| outline rect, windowType: y, h differ | 10 | 5 | `provinceview/province_window` |
| outline rect, instantTextBoxType: w differ | 10 | 6 | `provinceview/province_window/warscore_value` |
| outline rect, instantTextBoxType: w, h differ | 5 | 4 | `countryestatesview/agenda_effects` |
| outline rect, iconType: w, h differ | 4 | 3 | `ages_view/picture` |
| outline rect, iconType: x differ | 4 | 2 | `countryreligionview/current_religion_icon` |
| outline rect, guiButtonType: x, y, h differ | 3 | 2 | `tributary_shield` |
| outline rect, iconType: y, w, h differ | 3 | 2 | `countryestatesview/dev_share_pie_chart` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| live: no value of selector page fits | 2 | 1 | `menu_settings` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |
| outline rect, guiButtonType: x, y, w, h differ | 1 | 1 | `topbar/achievements_root_window/achievement_window_bg` |

### bigger-ui

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 311 | 9 | `provinceview/province_window/tax_base_value` |
| outline rect, iconType: y differ | 163 | 6 | `countrymilitaryview/icon_cost` |
| outline: the game shows a widget the layout lacks | 104 | 11 | `minimap_panel/minimap_bg` |
| outline rect, guiButtonType: y differ | 52 | 5 | `countrymilitaryview/infantry_type_button` |
| outline rect, instantTextBoxType: h differ | 31 | 19 | `ages_view/desc` |
| outline rect, instantTextBoxType: x differ | 22 | 7 | `countrydiplomacyview/label_nation` |
| outline rect, windowType: y, h differ | 20 | 10 | `provinceview` |
| outline rect, windowType: y differ | 19 | 9 | `menubar/WarOverviewButtonWindow` |
| outline rect, iconType: w, h differ | 16 | 5 | `ages_view/picture` |
| outline rect, instantTextBoxType: w differ | 12 | 7 | `provinceview/province_window/warscore_value` |
| outline rect, iconType: x differ | 10 | 5 | `countrystabilityview/stability_progress_threshold` |
| outline rect, instantTextBoxType: w, h differ | 8 | 5 | `countrydiplomacyview/num_relations_value` |
| outline rect, iconType: x, y differ | 3 | 2 | `countryreligionview/orthodox_specific_window/current_patriarch_authority` |
| outline rect, iconType: y, w, h differ | 3 | 2 | `countryestatesview/dev_share_pie_chart` |
| live: no value of selector page fits | 3 | 2 | `menu_settings` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, instantTextBoxType: x, y, h differ | 2 | 1 | `countryreligionview/orthodox_specific_window/current_patriarch_authority_value` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| live: no value of selector religionPanel fits | 2 | 1 | `countryreligionview` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |
| outline rect, instantTextBoxType: x, y differ | 1 | 1 | `waroverview/waroverview_value` |

### proper-2k-ui-enhanced

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: h differ | 7 | 6 | `country_selection_panel/mainmenu/mainmenu_panel_bottom/version_label` |
| outline rect, instantTextBoxType: w differ | 3 | 2 | `topbar/text_prestige` |
| outline: the game shows a widget the layout lacks | 3 | 1 | `minimap_panel/minimap_bg` |
| outline rect, windowType: y differ | 2 | 1 | `menubar/WarOverviewButtonWindow` |
| live: no value of selector page fits | 2 | 2 | `menu_settings` |
| outline rect, windowType: x, y differ | 1 | 1 | `diplomessageicons_window` |

## Pixels

`compare`'s per-widget result for the survey's views. The survey's views have no hand-made
masks of what the game fills (the corpus has `codeFilled`), so a text or icon the game fills
fails by its content; the rect-only column counts the widgets that fail by their rect alone.

| Playset | Views compared | Views passing | Widgets passing | Widgets failing | Rect only | Failing by kind |
| --- | --- | --- | --- | --- | --- | --- |
| vanilla | 96 | 4 | 3581 | 2776 | 600 | instantTextBoxType 1330, iconType 761, guiButtonType 523, none in the layout 109, windowType 53 |
| anbennar-alone | 85 | 4 | 3483 | 2144 | 412 | instantTextBoxType 1054, iconType 570, guiButtonType 390, none in the layout 84, windowType 44, checkboxType 2 |
| bigger-ui | 96 | 4 | 3578 | 2762 | 600 | instantTextBoxType 1328, iconType 758, guiButtonType 519, none in the layout 104, windowType 53 |
| proper-2k-ui-enhanced | 9 | 0 | 327 | 148 | 20 | guiButtonType 78, instantTextBoxType 32, iconType 31, windowType 4, none in the layout 3 |

## Where rects start to differ

Each row is a widget whose outline rect is off while its parent is not off by the same
amount; the widgets inside it that only move with it are counted, not listed. At the largest
captured resolution only: below it a window taller than the screen takes the bounds of its
children in Tongs, so its own rect is not compared and every child would count as an origin.

### vanilla

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `countrymilitaryview` | windowType | 0,-16 | 111 | 5 |
| `countrytechnologyview/institutions_window` | windowType | 0,140 | 15 | 1 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 6 |
| `country_selection_panel/lobby/bottom/scenario_description` | instantTextBoxType | 0,0 | 0 | 6 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-60 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `provinceview/buildings_window/great_projects_window` | windowType | 0,-10 | 2 | 2 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/num_relations_value` | instantTextBoxType | 0,0 | 0 | 3 |
| `countrystabilityview/stability_progress_threshold` | iconType | -48,0 | 0 | 3 |
| `countrystabilityview/stability_value` | instantTextBoxType | -48,0 | 0 | 3 |
| `countryeconomyview/incomes_total` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/war_exhaustion` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/development_base` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryreligionview/religionpanel_bg_top` | iconType | 0,0 | 0 | 2 |
| `countryreligionview/current_religion_icon` | iconType | -62,0 | 0 | 2 |
| `countryestatesview/dev_share_pie_chart` | iconType | 0,-96 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_1` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_2` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_3` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_4` | iconType | 0,0 | 0 | 2 |
| `diplomessageicons_window` | windowType | 10,910 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-110 | 0 | 1 |
| `minimap_panel/custom_mapmode_7` | guiButtonType | 0,0 | 0 | 1 |
| `parliament_window/enacted_modifiers_effect` | instantTextBoxType | 0,0 | 0 | 1 |
| `ages_view/picture` | iconType | 0,0 | 0 | 1 |
| `ages_view/desc` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_icon` | iconType | -206,4 | 0 | 1 |
| `waroverview/waroverview_value` | instantTextBoxType | -7,-1 | 0 | 1 |
| `waroverview/ourcav` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/ourtroops_lost` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/ourtroops_attrit` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/enemytroops_lost` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/enemytroops_attrit` | instantTextBoxType | 0,0 | 0 | 1 |
| `countryreligionview/orthodox_specific_window/current_patriarch_authority` | iconType | -80,3 | 0 | 1 |

### anbennar-alone

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `countrymilitaryview` | windowType | 0,-16 | 107 | 3 |
| `countrytechnologyview/institutions_window` | windowType | 0,140 | 15 | 1 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-60 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `provinceview/buildings_window/great_projects_window` | windowType | 0,-10 | 2 | 1 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 3 |
| `tributary_shield` | guiButtonType | -987,-306 | 0 | 2 |
| `countryeconomyview/incomes_total` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/war_exhaustion` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/development_base` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryreligionview/religionpanel_bg_top` | iconType | 0,0 | 0 | 2 |
| `countryreligionview/current_religion_icon` | iconType | -62,0 | 0 | 2 |
| `countryestatesview/dev_share_pie_chart` | iconType | 0,-96 | 0 | 2 |
| `countryestatesview/agenda_effects` | instantTextBoxType | 0,0 | 0 | 2 |
| `diplomessageicons_window` | windowType | 10,910 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-110 | 0 | 1 |
| `minimap_panel/custom_mapmode_7` | guiButtonType | 0,0 | 0 | 1 |
| `ages_view/picture` | iconType | 0,0 | 0 | 1 |
| `ages_view/desc` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/magic_menu_parent/magic_menu_main/magic_menu_main_row_3/magic_menu_infamy_types` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/magic_menu_parent/magic_menu_main/magic_menu_main_row_3/magic_menu_infamy_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/magic_menu_parent/magic_menu_spellbook_window/magic_menu_change_spellbook_window/magic_menu_button_custom_magic_lists_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_indiv/achievement_column_1/achievement_indiv_r1_c1/achievement_r1_c1_flavor_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_indiv/achievement_column_1/achievement_indiv_r4_c1/achievement_r4_c1_flavor_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_indiv/achievement_column_1/achievement_indiv_r8_c1/achievement_r8_c1_flavor_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_indiv/achievement_column_2/achievement_indiv_r1_c2/achievement_r1_c2_flavor_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_window_bg` | guiButtonType | 596,401 | 0 | 1 |
| `country_selection_panel/mainmenu/mainmenu_panel_bottom/version_label` | instantTextBoxType | 0,0 | 0 | 1 |
| `country_selection_panel/mainmenu/mainmenu_panel_bottom/continue_container/text` | instantTextBoxType | 0,0 | 0 | 1 |
| `country_selection_panel/lobby/bottom/scenario_description` | instantTextBoxType | 0,0 | 0 | 1 |

### bigger-ui

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `countrymilitaryview` | windowType | 0,-16 | 111 | 5 |
| `countrytechnologyview/institutions_window` | windowType | 0,140 | 15 | 1 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 6 |
| `country_selection_panel/lobby/bottom/scenario_description` | instantTextBoxType | 0,0 | 0 | 6 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-60 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `provinceview/buildings_window/great_projects_window` | windowType | 0,-10 | 2 | 2 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/num_relations_value` | instantTextBoxType | 0,0 | 0 | 3 |
| `countrystabilityview/stability_progress_threshold` | iconType | -48,0 | 0 | 3 |
| `countrystabilityview/stability_value` | instantTextBoxType | -48,0 | 0 | 3 |
| `countryeconomyview/incomes_total` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/war_exhaustion` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/development_base` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryreligionview/religionpanel_bg_top` | iconType | 0,0 | 0 | 2 |
| `countryreligionview/current_religion_icon` | iconType | -62,0 | 0 | 2 |
| `countryestatesview/dev_share_pie_chart` | iconType | 0,-96 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_1` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_2` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_3` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_4` | iconType | 0,0 | 0 | 2 |
| `diplomessageicons_window` | windowType | 10,910 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-110 | 0 | 1 |
| `minimap_panel/custom_mapmode_7` | guiButtonType | 0,0 | 0 | 1 |
| `parliament_window/enacted_modifiers_effect` | instantTextBoxType | 0,0 | 0 | 1 |
| `ages_view/picture` | iconType | 0,0 | 0 | 1 |
| `ages_view/desc` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_icon` | iconType | -206,48 | 0 | 1 |
| `waroverview/waroverview_value` | instantTextBoxType | -7,45 | 0 | 1 |
| `waroverview/ourcav` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/ourtroops_lost` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/ourtroops_attrit` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/enemytroops_lost` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/enemytroops_attrit` | instantTextBoxType | 0,0 | 0 | 1 |
| `countryreligionview/orthodox_specific_window/current_patriarch_authority` | iconType | -80,3 | 0 | 1 |

### proper-2k-ui-enhanced

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `country_selection_panel/lobby/bottom/scenario_description` | instantTextBoxType | 0,0 | 0 | 4 |
| `diplomessageicons_window` | windowType | 12,1236 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-132 | 0 | 1 |
| `topbar/text_prestige` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/powerprojection_topbar/text_powerprojection` | instantTextBoxType | 0,0 | 0 | 1 |
| `country_selection_panel/mainmenu/mainmenu_panel_bottom/version_label` | instantTextBoxType | 0,0 | 0 | 1 |
| `country_selection_panel/mainmenu/mainmenu_panel_bottom/continue_container/text` | instantTextBoxType | 0,0 | 0 | 1 |
| `CreditsWindow/title` | instantTextBoxType | 0,0 | 0 | 1 |
| `country_selection_panel/lobby/top/nation_designer_hint` | instantTextBoxType | 0,0 | 0 | 1 |

## Windows

| Playset | Windows | Views | Inside a view | Not reached |
| --- | --- | --- | --- | --- |
| vanilla | 696 | 44 | 143 | 509 |
| anbennar-alone | 813 | 41 | 107 | 665 |
| bigger-ui | 696 | 44 | 143 | 509 |
| proper-2k-ui-enhanced | 696 | 12 | 20 | 664 |

A window's confidence is the share of its widgets built only of confirmed constructs.

| Playset | Not reached | Confidence 100 % | 90 % or more | 50 % or more | Below 50 % |
| --- | --- | --- | --- | --- | --- |
| vanilla | 509 | 0 | 0 | 56 | 453 |
| anbennar-alone | 665 | 0 | 0 | 81 | 584 |
| bigger-ui | 509 | 0 | 0 | 56 | 453 |
| proper-2k-ui-enhanced | 664 | 86 | 87 | 360 | 304 |

## Constructs

A construct is confirmed when at least 10 widgets built with it were compared on their own and at least 95 % of them had the game's rect.

| Playset | Seen | Confirmed | All exact | Some rect differs |
| --- | --- | --- | --- | --- |
| vanilla | 98 | 46 | 46 | 52 |
| anbennar-alone | 111 | 42 | 54 | 57 |
| bigger-ui | 98 | 48 | 48 | 50 |
| proper-2k-ui-enhanced | 75 | 27 | 41 | 34 |

vanilla, constructs with rects that differ (most first):

- `instantTextBoxType`: 389 of 1820 differ
- `instantTextBoxType.position`: 384 of 1805 differ
- `instantTextBoxType.maxwidth`: 384 of 1815 differ
- `instantTextBoxType.maxheight`: 384 of 1815 differ
- `instantTextBoxType.format`: 382 of 1781 differ
- `instantTextBoxType.bordersize`: 310 of 1655 differ
- `instantTextBoxType.fixedsize`: 266 of 693 differ
- `instantTextBoxType.fixedsize=yes`: 266 of 677 differ
- `instantTextBoxType.format=right`: 252 of 658 differ
- `iconType`: 197 of 1482 differ
- `iconType.position`: 192 of 1475 differ
- `iconType.scale`: 132 of 371 differ
- `iconType.hint_tag`: 104 of 401 differ
- `instantTextBoxType.format=centre`: 85 of 583 differ
- `guiButtonType`: 55 of 1795 differ
- `windowType`: 41 of 453 differ
- `windowType.position`: 41 of 445 differ
- `windowType.size`: 39 of 428 differ
- `windowType.moveable`: 39 of 430 differ
- `guiButtonType.hint_tag`: 35 of 82 differ
- `windowType.background`: 34 of 363 differ
- `windowType.orientation`: 34 of 232 differ
- `instantTextBoxType.orientation`: 34 of 228 differ
- `instantTextBoxType.orientation=upper_left`: 34 of 208 differ
- `windowType.dontrender`: 32 of 366 differ

anbennar-alone, constructs with rects that differ (most first):

- `instantTextBoxType`: 247 of 1785 differ
- `instantTextBoxType.format`: 245 of 1710 differ
- `instantTextBoxType.position`: 244 of 1775 differ
- `instantTextBoxType.maxwidth`: 244 of 1781 differ
- `instantTextBoxType.maxheight`: 243 of 1781 differ
- `instantTextBoxType.bordersize`: 198 of 1593 differ
- `instantTextBoxType.fixedsize`: 174 of 614 differ
- `instantTextBoxType.fixedsize=yes`: 174 of 598 differ
- `instantTextBoxType.format=right`: 149 of 631 differ
- `iconType`: 109 of 1433 differ
- `iconType.position`: 106 of 1428 differ
- `iconType.scale`: 72 of 280 differ
- `iconType.hint_tag`: 64 of 371 differ
- `instantTextBoxType.format=centre`: 53 of 473 differ
- `instantTextBoxType.format=left`: 31 of 422 differ
- `windowType`: 28 of 432 differ
- `windowType.position`: 28 of 409 differ
- `windowType.size`: 26 of 399 differ
- `windowType.moveable`: 26 of 401 differ
- `guiButtonType`: 26 of 1469 differ
- `windowType.orientation`: 25 of 250 differ
- `windowType.background`: 23 of 288 differ
- `windowType.dontrender`: 21 of 290 differ
- `windowType.horizontalborder`: 21 of 290 differ
- `windowType.verticalborder`: 18 of 281 differ

bigger-ui, constructs with rects that differ (most first):

- `instantTextBoxType`: 387 of 1818 differ
- `instantTextBoxType.position`: 382 of 1803 differ
- `instantTextBoxType.maxwidth`: 382 of 1813 differ
- `instantTextBoxType.maxheight`: 382 of 1813 differ
- `instantTextBoxType.format`: 380 of 1779 differ
- `instantTextBoxType.bordersize`: 310 of 1655 differ
- `instantTextBoxType.fixedsize`: 264 of 691 differ
- `instantTextBoxType.fixedsize=yes`: 264 of 675 differ
- `instantTextBoxType.format=right`: 252 of 658 differ
- `iconType`: 197 of 1480 differ
- `iconType.position`: 192 of 1473 differ
- `iconType.scale`: 132 of 371 differ
- `iconType.hint_tag`: 104 of 401 differ
- `instantTextBoxType.format=centre`: 85 of 583 differ
- `guiButtonType`: 55 of 1789 differ
- `windowType`: 41 of 451 differ
- `windowType.position`: 41 of 443 differ
- `windowType.size`: 39 of 428 differ
- `windowType.moveable`: 39 of 430 differ
- `guiButtonType.hint_tag`: 35 of 82 differ
- `windowType.background`: 34 of 363 differ
- `windowType.orientation`: 34 of 232 differ
- `instantTextBoxType.orientation`: 34 of 228 differ
- `instantTextBoxType.orientation=upper_left`: 34 of 208 differ
- `windowType.dontrender`: 32 of 366 differ

proper-2k-ui-enhanced, constructs with rects that differ (most first):

- `instantTextBoxType`: 10 of 86 differ
- `instantTextBoxType.position`: 10 of 86 differ
- `instantTextBoxType.maxwidth`: 9 of 85 differ
- `instantTextBoxType.maxheight`: 9 of 85 differ
- `instantTextBoxType.bordersize`: 7 of 80 differ
- `instantTextBoxType.format`: 6 of 80 differ
- `instantTextBoxType.orientation`: 6 of 48 differ
- `instantTextBoxType.orientation=upper_left`: 5 of 37 differ
- `windowType`: 3 of 77 differ
- `windowType.background`: 3 of 73 differ
- `windowType.position`: 3 of 74 differ
- `windowType.animation_type`: 3 of 29 differ
- `windowType.animation_time`: 3 of 29 differ
- `windowType.size`: 3 of 73 differ
- `windowType.orientation`: 3 of 42 differ
- `windowType.show_position`: 2 of 28 differ
- `windowType.hide_position`: 2 of 28 differ
- `windowType.moveable`: 2 of 73 differ
- `windowType.dontrender`: 2 of 71 differ
- `windowType.horizontalborder`: 2 of 71 differ
- `windowType.verticalborder`: 2 of 71 differ
- `windowType.fullscreen`: 2 of 72 differ
- `windowType.orientation=lower_right`: 2 of 4 differ
- `instantTextBoxType.format=centre`: 2 of 58 differ
- `instantTextBoxType.format=right`: 2 of 9 differ

## Views

### vanilla

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.7 % | 92.0 % | 99.1 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s7 1280x720 | provinceview (profile) | 94.9 % | 68.0 % | 100.0 % | 100.0 % | 100.0 % | 49 fail |
| vanilla-save-s8 1280x720 | provinceview (profile) | 92.0 % | 70.4 % | 100.0 % | 100.0 % | 100.0 % | 58 fail |
| vanilla-save-s9 1280x720 | provinceview (profile) | 94.2 % | 65.4 % | 100.0 % | 100.0 % | 100.0 % | 52 fail |
| vanilla-save-s12 1280x720 | provinceview (profile) | 92.3 % | 67.9 % | 100.0 % | 100.0 % | 100.0 % | 56 fail |
| vanilla-save-s14 1280x720 | countrygovernmentview (profile), countryview, gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s15 1280x720 | ages_view (profile) | 88.8 % | 88.8 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s24 1280x720 | countrygovernmentview (profile), countryview | 100.0 % | 93.4 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s25 1280x720 | countrydiplomacyview (profile), countryview, hre_window (profile) | 98.1 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 32 fail |
| vanilla-save-s26 1280x720 | celestial_window, countrydiplomacyview (profile), countryview | 97.2 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| vanilla-save-s31 1280x720 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 82.6 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-save-s32 1280x720 | countrydiplomacyview (profile), countryview | 96.8 % | 81.4 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s34 1280x720 | countrytradeview (profile), countryview | 100.0 % | 98.6 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s35 1280x720 | countrytechnologyview (profile), countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s37 1280x720 | countrymissionsview (profile), countryview | 100.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1280x720 | countrydecisionsview (profile), countryview | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s39 1280x720 | countrystabilityview (profile), countryview | 97.0 % | 96.6 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s40 1280x720 | countryreligionview (profile), countryview | 94.9 % | 75.3 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1280x720 | countrymilitaryview (profile), countryview | 15.9 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1280x720 | countrysubjectview (profile), countryview | 100.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s44 1280x720 | DefaultConfirm, countrygovernmentview (profile), countryview, gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s59 1280x720 | countrytechnologyview (profile), countryview | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s61 1280x720 | countrydecisionsview (profile), countryview | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s62 1280x720 | DefaultConfirm, countrystabilityview (profile), countryview | 95.9 % | 96.9 % | 100.0 % | 100.0 % | 100.0 % | 36 fail |
| vanilla-save-s63 1280x720 | countrystabilityview (profile), countryview | 96.2 % | 97.3 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s64 1280x720 | countryreligionview (profile), countryview | 97.5 % | 52.1 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s65 1280x720 | countrymilitaryview (profile), countryview, domesticpanel_unit_select | 23.1 % | 93.7 % | 100.0 % | 100.0 % | 100.0 % | 112 fail |
| vanilla-save-s66 1280x720 | ConfirmAndNameLeaderDialog, countrymilitaryview (profile), countryview | 19.4 % | 95.1 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s67 1280x720 | DefaultConfirm, countrymilitaryview (profile), countryview | 19.4 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s68 1280x720 | countrymilitaryview (profile), countryview, domesticpanel_naval_doctrine_select (profile) | 15.4 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s70 1280x720 | countrysubjectview (profile), countryview | 100.0 % | 92.7 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s43 1280x720 | countryestatesview (profile), countryview | 86.1 % | 97.6 % | 86.1 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s0 1280x720 | country_selection_panel (profile) | 92.8 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 69.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-menu-s3 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.7 % | 91.7 % | 99.1 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s1 1920x1080 | countrycourtview (profile), countryview | 100.0 % | 82.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s2 1920x1080 | hre_window (profile) | 100.0 % | 89.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s3 1920x1080 | parliament_window (profile) | 87.5 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s4 1920x1080 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s5 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 1920x1080 | macro_build_interface (profile) | 100.0 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 1920x1080 | provinceview (profile) | 95.8 % | 68.4 % | 100.0 % | 100.0 % | 100.0 % | 49 fail |
| vanilla-save-s8 1920x1080 | provinceview (profile) | 92.9 % | 70.9 % | 100.0 % | 100.0 % | 100.0 % | 58 fail |
| vanilla-save-s9 1920x1080 | provinceview (profile) | 95.2 % | 65.8 % | 100.0 % | 100.0 % | 100.0 % | 52 fail |
| vanilla-save-s10 1920x1080 | colonisationpanel (profile) | 100.0 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s12 1920x1080 | provinceview (profile) | 93.2 % | 68.3 % | 100.0 % | 100.0 % | 100.0 % | 56 fail |
| vanilla-save-s13 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s14 1920x1080 | countrygovernmentview (profile), countryview, gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s15 1920x1080 | ages_view (profile) | 88.8 % | 88.8 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 1920x1080 | waroverview | 90.6 % | 99.1 % | 100.0 % | 100.0 % | 100.0 % | 31 fail |
| vanilla-save-s24 1920x1080 | countrygovernmentview (profile), countryview | 100.0 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-save-s25 1920x1080 | countrydiplomacyview (profile), countryview, hre_window (profile) | 98.1 % | 74.7 % | 100.0 % | 100.0 % | 100.0 % | 42 fail |
| vanilla-save-s26 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview | 97.2 % | 85.8 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s27 1920x1080 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s28 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s31 1920x1080 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 83.4 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s32 1920x1080 | countrydiplomacyview (profile), countryview | 96.8 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s33 1920x1080 | countryeconomyview (profile), countryview | 93.4 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s34 1920x1080 | countrytradeview (profile), countryview | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s35 1920x1080 | countrytechnologyview (profile), countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s36 1920x1080 | countryideasview (profile), countryview | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s37 1920x1080 | countrymissionsview (profile), countryview | 100.0 % | 97.7 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1920x1080 | countrydecisionsview (profile), countryview | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s39 1920x1080 | countrystabilityview (profile), countryview | 97.0 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-save-s40 1920x1080 | countryreligionview (profile), countryview | 93.2 % | 76.9 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1920x1080 | countrymilitaryview (profile), countryview | 15.1 % | 96.2 % | 100.0 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1920x1080 | countrysubjectview (profile), countryview | 100.0 % | 88.1 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s44 1920x1080 | DefaultConfirm, countrygovernmentview (profile), countryview, gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s45 1920x1080 | peace_view (profile) | 97.9 % | 87.4 % | 100.0 % | 97.0 % | 100.0 % | 22 fail |
| vanilla-save-s58 1920x1080 | DefaultConfirm, countryeconomyview (profile), countryview | 92.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s59 1920x1080 | countrytechnologyview (profile), countryview | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-save-s60 1920x1080 | countryideasview (profile), countryview | 100.0 % | 96.9 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s61 1920x1080 | countrydecisionsview (profile), countryview | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s62 1920x1080 | DefaultConfirm, countrystabilityview (profile), countryview | 95.9 % | 97.0 % | 100.0 % | 100.0 % | 100.0 % | 22 fail |
| vanilla-save-s63 1920x1080 | countrystabilityview (profile), countryview | 96.2 % | 97.2 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s64 1920x1080 | countryreligionview (profile), countryview | 95.1 % | 52.1 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s65 1920x1080 | countrymilitaryview (profile), countryview, domesticpanel_unit_select | 22.4 % | 93.5 % | 100.0 % | 100.0 % | 100.0 % | 114 fail |
| vanilla-save-s66 1920x1080 | ConfirmAndNameLeaderDialog, countrymilitaryview (profile), countryview | 18.7 % | 95.0 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s67 1920x1080 | DefaultConfirm, countrymilitaryview (profile), countryview | 18.7 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s68 1920x1080 | countrymilitaryview (profile), countryview, domesticpanel_naval_doctrine_select (profile) | 14.7 % | 96.3 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s70 1920x1080 | countrysubjectview (profile), countryview | 100.0 % | 88.9 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s11 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 1920x1080 | countryestatesview (profile), countryview | 86.1 % | 97.4 % | 86.1 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s74 1920x1080 | DefaultConfirm, countryestatesview (profile), countryview | 86.0 % | 97.6 % | 88.3 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-menu-s0 1920x1080 | country_selection_panel (profile) | 92.8 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 69.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-menu-s4 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.7 % | 71.7 % | 100.0 % | 100.0 % | 100.0 % | 26 fail |
| vanilla-menu-s5 1920x1080 | country_selection_panel (profile), goto_box, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.4 % | 70.6 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-menu-s6 1920x1080 | country_selection_panel (profile), option_window, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 70.9 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-menu-s7 1920x1080 | country_selection_panel (profile) | 100.0 % | 38.5 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-menu-s8 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 97.8 % | 76.0 % | 100.0 % | 100.0 % | 100.0 % | 42 fail |
| vanilla-menu-s9 1920x1080 | country_selection_panel (profile), option_window, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 70.9 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |

### anbennar-alone

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| anbennar-alone-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.5 % | 70.3 % | 99.1 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s6 1280x720 | provinceview (profile) | 95.9 % | 55.2 % | 100.0 % | 100.0 % | 100.0 % | 52 fail |
| anbennar-alone-save-s7 1280x720 | provinceview (profile) | 95.4 % | 61.3 % | 100.0 % | 100.0 % | 100.0 % | 54 fail |
| anbennar-alone-save-s9 1280x720 | multi_unitpanel, single_unitpanel (profile) | 100.0 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s11 1280x720 | countrygovernmentview (profile), countryview, gov_view_reform_select | 100.0 % | 63.1 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s12 1280x720 | ages_view (profile) | 87.5 % | 86.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s14 1280x720 | provinceview (profile) | 92.9 % | 66.2 % | 100.0 % | 100.0 % | 100.0 % | 65 fail |
| anbennar-alone-save-s17 1280x720 | countrygovernmentview (profile), countryview | 100.0 % | 52.0 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s18 1280x720 | countrydiplomacyview (profile), countryview, hre_window (profile) | 98.4 % | 78.0 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| anbennar-alone-save-s20 1280x720 | celestial_window, countrydiplomacyview (profile), countryview, tributary_shield | 97.2 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| anbennar-alone-save-s25 1280x720 | multi_unitpanel, rebel_supression_panel, single_unitpanel (profile) | 100.0 % | 86.2 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s26 1280x720 | countrydiplomacyview (profile), countryview, great_powers | 98.0 % | 66.5 % | 100.0 % | 100.0 % | 100.0 % | 26 fail |
| anbennar-alone-save-s27 1280x720 | countrydiplomacyview (profile), countryview | 97.8 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| anbennar-alone-save-s29 1280x720 | countrytradeview (profile), countryview | 100.0 % | 98.7 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s30 1280x720 | countrytechnologyview (profile), countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| anbennar-alone-save-s32 1280x720 | countrymissionsview (profile), countryview | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s33 1280x720 | countrydecisionsview (profile), countryview | 100.0 % | 38.4 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s34 1280x720 | countrystabilityview (profile), countryview | 100.0 % | 96.2 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| anbennar-alone-save-s35 1280x720 | countryreligionview (profile), countryview | 98.0 % | 46.0 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s36 1280x720 | countrymilitaryview (profile), countryview | 15.7 % | 93.1 % | 100.0 % | 100.0 % | 100.0 % | 116 fail |
| anbennar-alone-save-s38 1280x720 | provinceview (profile) | 94.7 % | 67.9 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| anbennar-alone-save-s41 1280x720 | DefaultConfirm, countrytradeview (profile), countryview | 100.0 % | 98.8 % | 100.0 % | 100.0 % | 100.0 % | 26 fail |
| anbennar-alone-save-s42 1280x720 | countrytechnologyview (profile), countryview | 58.9 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-save-s47 1280x720 | countrydecisionsview (profile), countryview | 100.0 % | 36.3 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| anbennar-alone-save-s48 1280x720 | countryreligionview (profile), countryview | 97.4 % | 41.6 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| anbennar-alone-save-s49 1280x720 | countrymilitaryview (profile), countryview, domesticpanel_unit_select | 22.7 % | 90.9 % | 100.0 % | 100.0 % | 100.0 % | 111 fail |
| anbennar-alone-save-s51 1280x720 | DefaultConfirm, countrymilitaryview (profile), countryview | 19.4 % | 93.5 % | 100.0 % | 100.0 % | 100.0 % | 122 fail |
| anbennar-alone-save-s24 1280x720 | multi_unitpanel, reorg_window | 100.0 % | 99.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s37 1280x720 | countryestatesview (profile), countryview | 92.8 % | 89.7 % | 96.4 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s0 1280x720 | country_selection_panel (profile) | 93.9 % | 77.2 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 97.6 % | 57.5 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| anbennar-alone-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s3 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| anbennar-alone-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.5 % | 70.3 % | 99.1 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s1 1920x1080 | countrycourtview (profile), countryview | 100.0 % | 93.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s2 1920x1080 | hre_window (profile) | 100.0 % | 91.9 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s3 1920x1080 | celestial_window, tributary_shield | 94.1 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 6 fail |
| anbennar-alone-save-s4 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s5 1920x1080 | macro_build_interface (profile) | 100.0 % | 61.2 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s6 1920x1080 | provinceview (profile) | 95.9 % | 55.5 % | 100.0 % | 100.0 % | 100.0 % | 52 fail |
| anbennar-alone-save-s7 1920x1080 | provinceview (profile) | 95.4 % | 61.7 % | 100.0 % | 100.0 % | 100.0 % | 54 fail |
| anbennar-alone-save-s9 1920x1080 | multi_unitpanel, single_unitpanel (profile) | 100.0 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s10 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s11 1920x1080 | countrygovernmentview (profile), countryview, gov_view_reform_select | 100.0 % | 68.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| anbennar-alone-save-s12 1920x1080 | ages_view (profile) | 87.5 % | 86.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s14 1920x1080 | provinceview (profile) | 93.0 % | 66.5 % | 100.0 % | 100.0 % | 100.0 % | 65 fail |
| anbennar-alone-save-s15 1920x1080 | colonisationpanel (profile) | 100.0 % | 78.4 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| anbennar-alone-save-s17 1920x1080 | countrygovernmentview (profile), countryview | 100.0 % | 52.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s18 1920x1080 | countrydiplomacyview (profile), countryview, hre_window (profile) | 98.4 % | 77.5 % | 100.0 % | 100.0 % | 100.0 % | 47 fail |
| anbennar-alone-save-s19 1920x1080 | DefaultConfirm, hre_window (profile) | 97.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s20 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview, tributary_shield | 97.2 % | 72.1 % | 100.0 % | 100.0 % | 100.0 % | 47 fail |
| anbennar-alone-save-s21 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| anbennar-alone-save-s25 1920x1080 | multi_unitpanel, rebel_supression_panel, single_unitpanel (profile) | 100.0 % | 86.2 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s26 1920x1080 | countrydiplomacyview (profile), countryview, great_powers | 98.0 % | 66.3 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s27 1920x1080 | countrydiplomacyview (profile), countryview | 97.8 % | 62.0 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s28 1920x1080 | countryeconomyview (profile), countryview | 93.3 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s29 1920x1080 | countrytradeview (profile), countryview | 100.0 % | 98.7 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| anbennar-alone-save-s30 1920x1080 | countrytechnologyview (profile), countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-save-s31 1920x1080 | countryideasview (profile), countryview | 100.0 % | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s32 1920x1080 | countrymissionsview (profile), countryview | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s33 1920x1080 | countrydecisionsview (profile), countryview | 100.0 % | 38.4 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s34 1920x1080 | countrystabilityview (profile), countryview | 100.0 % | 96.2 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| anbennar-alone-save-s35 1920x1080 | countryreligionview (profile), countryview | 96.0 % | 46.0 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s36 1920x1080 | countrymilitaryview (profile), countryview | 14.9 % | 93.1 % | 100.0 % | 100.0 % | 100.0 % | 116 fail |
| anbennar-alone-save-s38 1920x1080 | provinceview (profile) | 95.6 % | 68.3 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s40 1920x1080 | DefaultConfirm, countryeconomyview (profile), countryview | 92.3 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s41 1920x1080 | DefaultConfirm, countrytradeview (profile), countryview | 100.0 % | 98.8 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s42 1920x1080 | countrytechnologyview (profile), countryview | 58.9 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s43 1920x1080 | countryideasview (profile), countryview | 100.0 % | 88.3 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| anbennar-alone-save-s44 1920x1080 | countrydecisionsview (profile), countryview, topbar (profile) | 98.7 % | 57.5 % | 100.0 % | 100.0 % | 100.0 % | 37 fail |
| anbennar-alone-save-s45 1920x1080 | countrydecisionsview (profile), countryview, topbar (profile) | 99.4 % | 58.8 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| anbennar-alone-save-s46 1920x1080 | countrydecisionsview (profile), countryview, topbar (profile) | 100.0 % | 58.4 % | 100.0 % | 100.0 % | 100.0 % | 33 fail |
| anbennar-alone-save-s47 1920x1080 | countrydecisionsview (profile), countryview | 100.0 % | 36.3 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| anbennar-alone-save-s48 1920x1080 | countryreligionview (profile), countryview | 94.8 % | 41.6 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s49 1920x1080 | countrymilitaryview (profile), countryview, domesticpanel_unit_select | 22.0 % | 90.9 % | 100.0 % | 100.0 % | 100.0 % | 112 fail |
| anbennar-alone-save-s51 1920x1080 | DefaultConfirm, countrymilitaryview (profile), countryview | 18.6 % | 93.5 % | 100.0 % | 100.0 % | 100.0 % | 120 fail |
| anbennar-alone-save-s8 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| anbennar-alone-save-s16 1920x1080 | topbar (profile) | 97.0 % | 55.0 % | 100.0 % | 100.0 % | 100.0 % | 31 fail |
| anbennar-alone-save-s24 1920x1080 | multi_unitpanel, reorg_window | 100.0 % | 99.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s37 1920x1080 | countryestatesview (profile), countryview | 92.8 % | 88.6 % | 96.4 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s53 1920x1080 | countryestatesview (profile), countryview, estate_privileges_window | 94.1 % | 91.0 % | 97.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-menu-s0 1920x1080 | country_selection_panel (profile) | 93.9 % | 77.2 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 97.6 % | 57.5 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |

### bigger-ui

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.7 % | 92.0 % | 99.1 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s7 1280x720 | provinceview (profile) | 94.9 % | 68.0 % | 100.0 % | 100.0 % | 100.0 % | 49 fail |
| vanilla-save-s8 1280x720 | provinceview (profile) | 92.0 % | 70.4 % | 100.0 % | 100.0 % | 100.0 % | 58 fail |
| vanilla-save-s9 1280x720 | provinceview (profile) | 94.2 % | 65.4 % | 100.0 % | 100.0 % | 100.0 % | 52 fail |
| vanilla-save-s12 1280x720 | provinceview (profile) | 92.3 % | 67.9 % | 100.0 % | 100.0 % | 100.0 % | 56 fail |
| vanilla-save-s14 1280x720 | countrygovernmentview (profile), countryview, gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s15 1280x720 | ages_view (profile) | 88.8 % | 88.8 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s24 1280x720 | countrygovernmentview (profile), countryview | 100.0 % | 93.4 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s25 1280x720 | countrydiplomacyview (profile), countryview, hre_window (profile) | 98.1 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 32 fail |
| vanilla-save-s26 1280x720 | celestial_window, countrydiplomacyview (profile), countryview | 97.2 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| vanilla-save-s31 1280x720 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 82.6 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-save-s32 1280x720 | countrydiplomacyview (profile), countryview | 96.8 % | 81.4 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s34 1280x720 | countrytradeview (profile), countryview | 100.0 % | 98.6 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s35 1280x720 | countrytechnologyview (profile), countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s37 1280x720 | countrymissionsview (profile), countryview | 100.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1280x720 | countrydecisionsview (profile), countryview | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s39 1280x720 | countrystabilityview (profile), countryview | 97.0 % | 96.6 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s40 1280x720 | countryreligionview (profile), countryview | 94.9 % | 75.3 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1280x720 | countrymilitaryview (profile), countryview | 15.9 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1280x720 | countrysubjectview (profile), countryview | 100.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s44 1280x720 | DefaultConfirm, countrygovernmentview (profile), countryview, gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s59 1280x720 | countrytechnologyview (profile), countryview | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s61 1280x720 | countrydecisionsview (profile), countryview | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s62 1280x720 | DefaultConfirm, countrystabilityview (profile), countryview | 95.9 % | 96.9 % | 100.0 % | 100.0 % | 100.0 % | 36 fail |
| vanilla-save-s63 1280x720 | countrystabilityview (profile), countryview | 96.2 % | 97.3 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s64 1280x720 | countryreligionview (profile), countryview | 97.5 % | 51.0 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s65 1280x720 | countrymilitaryview (profile), countryview, domesticpanel_unit_select | 22.6 % | 93.2 % | 100.0 % | 100.0 % | 100.0 % | 112 fail |
| vanilla-save-s66 1280x720 | ConfirmAndNameLeaderDialog, countrymilitaryview (profile), countryview | 19.4 % | 95.1 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s67 1280x720 | DefaultConfirm, countrymilitaryview (profile), countryview | 19.4 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s68 1280x720 | countrymilitaryview (profile), countryview, domesticpanel_naval_doctrine_select (profile) | 15.4 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s70 1280x720 | countrysubjectview (profile), countryview | 100.0 % | 92.7 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s43 1280x720 | countryestatesview (profile), countryview | 86.1 % | 97.6 % | 86.1 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s0 1280x720 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 69.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-menu-s3 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.7 % | 91.7 % | 99.1 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s1 1920x1080 | countrycourtview (profile), countryview | 100.0 % | 82.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s2 1920x1080 | hre_window (profile) | 100.0 % | 89.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s3 1920x1080 | parliament_window (profile) | 87.5 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s4 1920x1080 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s5 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 1920x1080 | macro_build_interface (profile) | 100.0 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 1920x1080 | provinceview (profile) | 95.8 % | 68.4 % | 100.0 % | 100.0 % | 100.0 % | 49 fail |
| vanilla-save-s8 1920x1080 | provinceview (profile) | 92.9 % | 70.9 % | 100.0 % | 100.0 % | 100.0 % | 58 fail |
| vanilla-save-s9 1920x1080 | provinceview (profile) | 95.2 % | 65.8 % | 100.0 % | 100.0 % | 100.0 % | 52 fail |
| vanilla-save-s10 1920x1080 | colonisationpanel (profile) | 100.0 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s12 1920x1080 | provinceview (profile) | 93.2 % | 68.3 % | 100.0 % | 100.0 % | 100.0 % | 56 fail |
| vanilla-save-s13 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s14 1920x1080 | countrygovernmentview (profile), countryview, gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s15 1920x1080 | ages_view (profile) | 88.8 % | 88.8 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 1920x1080 | waroverview | 90.6 % | 99.2 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| vanilla-save-s24 1920x1080 | countrygovernmentview (profile), countryview | 100.0 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-save-s25 1920x1080 | countrydiplomacyview (profile), countryview, hre_window (profile) | 98.1 % | 74.7 % | 100.0 % | 100.0 % | 100.0 % | 42 fail |
| vanilla-save-s26 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview | 97.2 % | 85.8 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s27 1920x1080 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s28 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s31 1920x1080 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 83.4 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s32 1920x1080 | countrydiplomacyview (profile), countryview | 96.8 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s33 1920x1080 | countryeconomyview (profile), countryview | 93.4 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s34 1920x1080 | countrytradeview (profile), countryview | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s35 1920x1080 | countrytechnologyview (profile), countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s36 1920x1080 | countryideasview (profile), countryview | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s37 1920x1080 | countrymissionsview (profile), countryview | 100.0 % | 97.7 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1920x1080 | countrydecisionsview (profile), countryview | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s39 1920x1080 | countrystabilityview (profile), countryview | 97.0 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-save-s40 1920x1080 | countryreligionview (profile), countryview | 93.2 % | 76.9 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1920x1080 | countrymilitaryview (profile), countryview | 15.1 % | 96.2 % | 100.0 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1920x1080 | countrysubjectview (profile), countryview | 100.0 % | 88.1 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s44 1920x1080 | DefaultConfirm, countrygovernmentview (profile), countryview, gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s45 1920x1080 | peace_view (profile) | 97.9 % | 92.1 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s58 1920x1080 | DefaultConfirm, countryeconomyview (profile), countryview | 92.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s59 1920x1080 | countrytechnologyview (profile), countryview | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-save-s60 1920x1080 | countryideasview (profile), countryview | 100.0 % | 96.9 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s61 1920x1080 | countrydecisionsview (profile), countryview | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s62 1920x1080 | DefaultConfirm, countrystabilityview (profile), countryview | 95.9 % | 97.0 % | 100.0 % | 100.0 % | 100.0 % | 22 fail |
| vanilla-save-s63 1920x1080 | countrystabilityview (profile), countryview | 96.2 % | 97.2 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s64 1920x1080 | countryreligionview (profile), countryview | 95.1 % | 52.1 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s65 1920x1080 | countrymilitaryview (profile), countryview, domesticpanel_unit_select | 22.4 % | 93.5 % | 100.0 % | 100.0 % | 100.0 % | 113 fail |
| vanilla-save-s66 1920x1080 | ConfirmAndNameLeaderDialog, countrymilitaryview (profile), countryview | 18.7 % | 95.0 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s67 1920x1080 | DefaultConfirm, countrymilitaryview (profile), countryview | 18.7 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s68 1920x1080 | countrymilitaryview (profile), countryview, domesticpanel_naval_doctrine_select (profile) | 14.7 % | 96.3 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s70 1920x1080 | countrysubjectview (profile), countryview | 100.0 % | 88.9 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s11 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 1920x1080 | countryestatesview (profile), countryview | 86.1 % | 97.4 % | 86.1 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s74 1920x1080 | DefaultConfirm, countryestatesview (profile), countryview | 86.0 % | 97.6 % | 88.3 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-menu-s0 1920x1080 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 69.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-menu-s4 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.7 % | 71.7 % | 100.0 % | 100.0 % | 100.0 % | 26 fail |
| vanilla-menu-s5 1920x1080 | country_selection_panel (profile), goto_box, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.4 % | 70.6 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-menu-s6 1920x1080 | country_selection_panel (profile), option_window, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 70.9 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-menu-s7 1920x1080 | country_selection_panel (profile) | 100.0 % | 38.5 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-menu-s8 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 97.8 % | 76.0 % | 100.0 % | 100.0 % | 100.0 % | 42 fail |
| vanilla-menu-s9 1920x1080 | country_selection_panel (profile), option_window, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 70.9 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |

### proper-2k-ui-enhanced

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla-save-s0 2560x1440 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 92.9 % | 91.5 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| vanilla-menu-s0 2560x1440 | country_selection_panel (profile) | 92.8 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s1 2560x1440 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 67.4 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-menu-s2 2560x1440 | CreditsWindow, country_selection_panel (profile) | 83.3 % | 33.3 % | 83.3 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-menu-s3 2560x1440 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 63.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-menu-s4 2560x1440 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.8 % | 70.7 % | 100.0 % | 100.0 % | 100.0 % | 27 fail |
| vanilla-menu-s5 2560x1440 | country_selection_panel (profile), goto_box, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.4 % | 69.2 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-menu-s6 2560x1440 | country_selection_panel (profile), option_window, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 69.5 % | 100.0 % | 100.0 % | 100.0 % | 22 fail |
| vanilla-menu-s7 2560x1440 | country_selection_panel (profile) | 95.4 % | 38.5 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |

