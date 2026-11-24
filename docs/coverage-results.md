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
| vanilla | 1280x720 | 62 | 99.4 % | 99.5 % | 81.6 % | 87.5 % | 23 | 99.8 % | 99.5 % | 100.0 % | 100.0 % | 62 | 100.0 % | 100.0 % | 3 of 62 |
| vanilla | 1920x1080 | 62 | 99.4 % | 99.6 % | 81.5 % | 87.2 % | 23 | 99.8 % | 99.5 % | 100.0 % | 100.0 % | 62 | 100.0 % | 100.0 % | 3 of 62 |
| anbennar-alone | 1280x720 | 59 | 99.6 % | 99.9 % | 88.7 % | 76.8 % | 25 | 99.7 % | 99.9 % | 99.7 % | 100.0 % | 58 | 100.0 % | 100.0 % | 3 of 59 |
| anbennar-alone | 1920x1080 | 60 | 99.6 % | 99.9 % | 88.8 % | 77.0 % | 25 | 99.8 % | 99.9 % | 100.0 % | 100.0 % | 60 | 100.0 % | 100.0 % | 3 of 60 |
| bigger-ui | 1280x720 | 62 | 99.4 % | 99.6 % | 81.5 % | 87.5 % | 23 | 99.8 % | 99.5 % | 100.0 % | 100.0 % | 62 | 100.0 % | 100.0 % | 3 of 62 |
| bigger-ui | 1920x1080 | 62 | 99.4 % | 99.6 % | 81.5 % | 87.3 % | 23 | 99.8 % | 99.6 % | 100.0 % | 100.0 % | 62 | 100.0 % | 100.0 % | 3 of 62 |
| proper-2k-ui-enhanced | 2560x1440 | 61 | 97.8 % | 99.6 % | 79.2 % | 87.5 % | 16 | 98.2 % | 99.6 % | 99.2 % | 100.0 % | 53 | 100.0 % | 100.0 % | 2 of 61 |
| anbennar | 2560x1440 | 59 | 98.7 % | 99.9 % | 86.9 % | 78.7 % | 19 | 98.9 % | 99.9 % | 99.5 % | 100.0 % | 52 | 100.0 % | 100.0 % | 2 of 59 |

"With profiles and live texts" is the same with the snapshot's texts and list rows as sample
data: what Compare with Live Game compares (spec/v3.md section 4), through the same functions.

| Playset | Resolution | With profiles and live texts: rects | With profiles and live texts: visibility |
| --- | --- | --- | --- |
| vanilla | 1280x720 | 99.8 % | 99.6 % |
| vanilla | 1920x1080 | 99.8 % | 99.6 % |
| anbennar-alone | 1280x720 | 100.0 % | 99.9 % |
| anbennar-alone | 1920x1080 | 100.0 % | 99.9 % |
| bigger-ui | 1280x720 | 99.8 % | 99.6 % |
| bigger-ui | 1920x1080 | 99.8 % | 99.6 % |
| proper-2k-ui-enhanced | 2560x1440 | 98.6 % | 99.6 % |
| anbennar | 2560x1440 | 99.3 % | 99.9 % |

Captures the survey's manifest lists but no record has: anbennar-alone 1280x720 1 (anbennar-alone-save-s55), proper-2k-ui-enhanced 2560x1440 1 (vanilla-save-s61), anbennar 2560x1440 1 (anbennar-alone-save-s16).

<!-- other countries: start -->
### The geometry fixes of 25 November 2026

Six changes to the profiles and their rules, each measured on its branch and then together on
`main` (`016919c`), under the lab's game lock, over the same captures as the section below (no
capture was taken again). The generated tables above are this run.

- **The crown land icons and the map mode buttons** (etch#672, `sprite`, `frame`): Tongs 0.37 reports
  the sprite the game draws. eu4.exe gives each crown land modifier icon `GFX_idea_unknown`, with the
  modifier's picture as its texture, where the `.gui` names `GFX_event_bg_transparency`, and gives
  `minimap_panel`'s ten custom map mode buttons the sprites of the map modes in their slots, the
  second one in its selected frame. Nine rects fewer in vanilla at each size, and every one of the
  live measure's.
- **The lobby's scenario description** (etch#673, `content` from the localisation): the description
  of the bookmark the lobby opens on, the one with `default = yes` (Anbennar has two, and the lobby
  opens on the first, Cannor). Six rects fewer in every set.
- **A rule's text** (etch#674, a new effect `text`): the localisation key the game's code writes in a
  text box in the rule's case. The ages view writes the description of the age it shows. One rect
  fewer in every set. The leader dialog for the ruler as general gets its text too, but stays one
  line short: the game's code adds a line after it.
- **Proper 2K UI Enhanced's religion background and P2KE's floating buttons** (etch#675): the mod's
  `.gui` names its own religion background, which the vanilla profile's rule replaced, and P2KE
  Patch - Anbennar puts `floating_buttons` at its `position` (x = −90), which the game draws, not at
  its `show_position`. Nine rects fewer in the P2KE playset and two in Proper 2K UI Enhanced.
- **The patriarch authority's value** (etch#676, `slider` with `valueText`): the game writes the
  authority times 100 with no decimals and a per cent sign, "100%" for Russia, two lines in its
  32 px box. One rect fewer in vanilla, Bigger UI and Proper 2K UI Enhanced.
- **Anbennar's achievement texts** (etch#677, `text`): each title and requirement is a customizable
  localisation chosen by the page flag, and the window opens on page 1. Four rects fewer at
  1920×1080 and three at 1280×720.

With the profiles, rects off on `main` against the section below (rules of `b156984`), and every
change of a view measure was a gain: no view got worse in rects or visibility, in any measure or set.

| Set | With profiles: rects off | Offline preview: rects off | Live: rects off |
| --- | --- | --- | --- |
| vanilla, 1920×1080 and 1280×720 | 6 (23) | 21 (38) | 0 (9) |
| Anbennar alone, 1920×1080 | 7 (19) | 15 (27) | 0 (1) |
| Anbennar alone, 1280×720 | 7 (18) | 14 (25) | 8 (9) |
| Bigger UI, 1920×1080 and 1280×720 | 6 (23) | 21 (38) | 0 (9) |
| Proper 2K UI Enhanced, 2560×1440 | 62 (80) | 83 (101) | 30 (40) |
| Anbennar with Proper 2K UI Enhanced and P2KE, 2560×1440 | 36 (52) | 46 (62) | 17 (20) |
| Austria, the emperor | 2 (12) | 7 (17) | 0 (9) |
| Aragon, the Pope's controller | 2 (12) | 7 (17) | 0 (9) |
| C01, a colonial nation | 1 (3) | 4 (6) | 0 (1) |

Visibility is unchanged in every set. **What is left with the profiles**, in vanilla and Bigger UI at
each size: the parliament's `enacted_modifiers_effect`, the peace view's `desc`, the institutions'
`when_embraced`, the leader dialog's `Description` (the game's added line), the rebels'
`rebelsize_desc` (the game draws the `fixedsize` box 249 px wide, its `maxWidth` is 246) and the main
menu's `version_label`, which carries the playset's checksum. In Anbennar alone: `when_embraced`,
three texts of the magic menu (customizable localisations by whether the ruler, heir, consort or
estate is a mage, and by the country's magic tradition), the estates' `agenda_effects` (the game
writes no text without an agenda, the localisation's text wraps in its 106 px) and `version_label`.
On the three countries: the colonisation panel's `region_text` and the leader dialog. All of them
but `rebelsize_desc` are heights of texts the game's code fills from the game's state (etch#604);
`rebelsize_desc` is a width the preview does not explain yet. Nothing of etch#606 is left: the pie
chart (etch#614), the patriarch marker (etch#615), the crown land icons and the map mode buttons
(etch#672) are fixed.

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
| The military tab's professionalism markers, which the game's code adds along the bar (eu4.exe 0xFAC8B0) | 30, 3 (50 in vanilla) | etch#357 (`place.along`) |
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

More rules followed: etch#381 hides the country view's tabs while the idea group choice or the new
policy window is open (vanilla and Anbennar alike), and the reorganization window's fleet half while
it reorganizes armies. On the fresh captures of Verne the offline preview then gets 33 of the 58 views
fully right at 1920×1080 and 30 of the 50 at 1280×720.

**The precision corpus as a check.** `profiles.playsets.test.ts`, which predicts every corpus
capture's visibility from the shipped profiles and runs only where the game is installed, passed
before this run and failed after it: the corpus's Verne of 1444 is an Empire member that can choose
rivals, its crown land has no effect, its speed controls show the achievements button, and P2KE
Patch - Anbennar's lobby shows the random New World button. The survey's defaults had taken the
other case. etch#383 sets those selectors for the corpus's Anbennar views, gives the patch its own
lobby rule, and withdraws etch#382 (the achievements button hidden in Anbennar), which the corpus
contradicts. The test passes again; a fix drawn from the survey needs it run before it
merges.

What is left on Verne at 1920×1080 (29 rects and 55 visibility failures offline, and 18 widgets only the game has): 33 are the province view's building slots, where Tongs
reports a built slot as hidden while the screenshot shows it drawn; 24 are the ledger's sort buttons,
which the game's code places by the columns of the page; the rest are sizes the game's code sets (the
magic menu's and the dialogs' texts, `dev_share_pie_chart`, the estates' modifier icons, the lobby's
`scenario_description`) and the map's strait and river marks.

**1280×720 from the game, and pixels.** The same day's second batch took Anbennar's 1280×720 views
from the game again: 51 views, 18 of which no run had taken at 1280×720 before (the views of the later
crawls). On them, rules of `6c175a5` against `main` with etch#378: offline preview rects 96.4 → 97.2 %
(2811 of 2890), visibility 96.3 → 98.8 % (8018 of 8114), with profiles 96.4 → 99.2 %, live visibility
99.9 → 100 % (8109 of 8109); 9 → 27 of the 51 views fully right offline. `compare --gpu` over the fresh
captures of both resolutions (rules of `1181976`): 5 of 110 pass, as the survey's views have no masks
of what the game fills (see Pixels below).

**A new crawl, in part.** The same batch crawled `anbennar-alone` from the save again with the crawler
of `main` for the 20 minutes the lock had left: 6 starts, 38 states (16 explored), against the 54
states of the survey's crawl in 19 starts. 37 of the 38 are states of the old crawl; the one new state
is the unit panel's disband confirmation (`DefaultConfirm` over `multi_unitpanel` and
`single_unitpanel`). A full crawl takes about three times as long, and the survey's manifest stays
that of the old crawl.

**The Anbennar playset at 2560×1440, from the game for the first time.** A third batch took the
survey's views in the Anbennar playset with Proper 2K UI Enhanced and P2KE Patch - Anbennar at
2560×1440 (Verne 1444): 58 of the 61 views (`menu-s8` and `s9` as above, and `save-s8`, whose
outliner options button the recipe could not click). Rules of `6c175a5` against `main`, over the 57
views that remain without `save-s52`: offline preview rects 87.5 → **98.0 %** (3612 of 3684), visibility 97.3 → 99.3 %, live visibility 99.9 → 100 %; 8 → 20 of the 57 views fully right offline. Most of the rects were one gap: Proper 2K UI
Enhanced makes `army_professionalism` 19 px high, so the military tab moves down by 19 px, not 16
(etch#384, a profile layer of its own for the mod).

### The ranking's next gaps (12 November 2026)

The gaps the run of 11 November left, taken from the top of its ranking, measured on the same
captures: the fresh Anbennar captures of 11 November (Verne 1444, `anbennar-alone` at 1920×1080 and
1280×720, the Anbennar playset with Proper 2K UI Enhanced and P2KE at 2560×1440, without `save-s52`)
and the survey's stored captures of every playset. Rules of `main` (`1ace2e2`, which gives the
figures above to the widget) against etch#393:

| Set | Offline preview: rects | Offline preview: visibility | With profiles: visibility | Views fully right |
| --- | --- | --- | --- | --- |
| Verne, 1920×1080, fresh | 99.2 → 99.2 % (3589/3618) | 99.4 → **99.7 %** (9950/9977) | 99.5 → 99.7 % | 33 → 33 of 58 |
| Verne, 1280×720, fresh | 99.3 → 99.3 % (2811/2830) | 99.3 → **99.7 %** (7976/8003) | 99.3 → 99.7 % | 30 → 30 of 50 |
| Anbennar + P2KE, 2560×1440, fresh | 98.0 → **98.5 %** (3627/3684) | 99.4 → **99.7 %** (10601/10628) | 99.4 → 99.7 % | 20 → 20 of 57 |
| Anbennar alone, 1920×1080, stored | 99.3 → 99.3 % | 99.4 → 99.7 % | 99.4 → 99.7 % | 32 → 32 of 52 |
| vanilla, 1920×1080, stored | 98.6 → **98.8 %** (3586/3628) | 99.1 → **99.3 %** (9818/9886) | 99.1 → 99.2 % | 23 → **31** of 60 |
| vanilla, 1280×720, stored | 99.0 → 99.3 % | 99.1 → 99.3 % | 99.0 → 99.2 % | 12 → **18** of 36 |
| Bigger UI, 1920×1080, stored | 98.6 → 98.9 % | 99.1 → 99.4 % | 99.1 → 99.3 % | 23 → **31** of 60 |
| Proper 2K UI Enhanced, 2560×1440, stored | 97.5 → 97.5 % | 99.4 → 99.8 % | 99.5 → 99.8 % | 0 → 0 of 9 |

No set lost a widget it had right; the live measures did not move (live visibility 100 % on every
Anbennar set). What was fixed:

- **The building slots' parts**: `building_canbuild` and `required_development` hidden in the
  generated slots, as the game shows `required_development` only on the locked slot
  (eu4.exe 0x138AFF0) and the green frame only where something can be
  built now. A great project's `progress_bar_window` is hidden until it is built up.
- **Selectors for what a click or the map decides**: the province's river and strait marks
  (`waterway`), the stability marker and value (`stability`: the stability view's daily update,
  0xF87E80, moves them by `stability_progress_threshold_move` times the stability, 16 px a point in
  the base game, 19 px in Proper 2K UI Enhanced and P2KE), the subjects tab's military focus window,
  the diplomacy view's shield glow in the base game, and new profiles of the lobby's options
  (`option_window`, one tab at a time) and the new leader's dialog (`ConfirmAndNameLeaderDialog`: the
  ruler as a general keeps their name).
- **What the game keeps or hides whatever the data**: `fort_number` stays shown, empty, without a
  fort; `goto_box`'s `goto` is off the screen in both searches; the Orthodox panel hides while its icon
  choice is open; the main menu's `ironman_icon` and the nation designer's random New World button
  are hidden; the diplomacy view's relations count fits one line; Proper 2K UI Enhanced's tab is at
  y 168, so its institutions window moves up by 168, not 140.
- **The measure**: a selector whose rules only move widgets (`stability`) cannot be told from
  visibility, so `profilePreview` takes the value that puts the moved widgets where the capture has
  them; and a widget the layout puts wholly outside the screen counts as not drawn, as Tongs counts
  the game's (P2KE's lobby parks its DLC lists at x -1320).

**A built building slot, checked in the game.** Tongs reports the slot of a built building (and of
the construction) as hidden while the game draws it, in every capture with buildings. A check on 12
November under the lab's game lock (vanilla Russia 1719, Moskva and Stanovoy, Anvil 1.20.0 and Tongs
0.33.0) found the same, and the game's own hover landed on the hidden slot's `building` button.
The province view's rebuild of its building slots (0x138EF20) shows only the free and the
locked slots' windows, so a built slot's window keeps its shown byte (`+0xC5`) at 0. Hypothesis: its
render node, which a window's hide (0x1547B00) would have hidden, still draws it. Tongs' `visible`
needs every ancestor's byte, so it reports the slot and its parts as hidden, and the live preview
hides them too. Built slots are 29 of the 68 offline visibility failures left in vanilla at
1920×1080 (Russia's provinces have many buildings) and 3 of Verne's 27; the offline preview draws
the slots and is right there.

What is left on Verne at 1920×1080 (29 rects and 27 visibility failures offline): the ledger's sort
buttons (24, the columns of the page come from the game's code), the building slots (the built slot
above, and a province's number of slots, which the save does not hold), and texts the game's code
fills (`DefaultConfirm/Description`, the lobby's `scenario_description`, Anbennar's magic menu), which
the preview cannot know offline.

A great project's buttons show only in the player's own province, which a rule could not say while
rules did not reach a repeater's entries. etch#395 lets them, and the base game's profile hides the
buttons in a foreign province: offline preview visibility on Verne at 1920×1080 99.73 → **99.77 %**
(9954 of 9977), vanilla at 1920×1080 99.31 → 99.35 %, and 4 widgets more on every other set.

The two Anbennar countries no rule of either change was drawn from, at 1920×1080, rules of `1ace2e2`
against etch#395: **Bluescale** (1472, 44 views) rects 99.18 → 99.24 %, visibility 99.29 →
**99.63 %**, 25 → 26 views fully right; **Kobildzan** (1594, 43 views) rects 95.86 → 96.01 %,
visibility 99.08 → 99.20 %, 15 → 17 views fully right. No view of either lost a widget.

**The ledger's sort buttons, read in the code.** They are now the top of what is left on Verne at
1920×1080 (12 buttons and 12 texts in one view, 72 widgets over the survey's playsets), and the
code says where they go:

- The ledger's constructor (eu4.exe 0x117BE40) gives each page its columns: the great
  powers page an unnamed column, `LEDGER_COUNTRY`, `LEDGER_GREAT_POWER_RANK`,
  `LEDGER_GREAT_POWER_SCORE`, `LEDGER_DEVELOPMENT` and `LEDGER_INSTITUTIONS_PENALTY`, with the
  weights 1, 3, 1, 1, 1, 1 and no fixed widths.
- The ledger's table update (0x118CFF0) makes the unit `(list width − fixed widths) / weights`,
  cut: 972 / 8 = 121 at 1920×1080, 229 in Proper 2K UI Enhanced at 2560×1440. A column is as wide as
  its weight times the unit (a fixed width wins, 0x117AE40), and the columns follow each other from
  0.
- Each column gets a copy of `ledger_default_button` and of `ledger_default_button_text`. A text
  column's button stands at the column's start and its text 1 px right of it; a number column's
  button at the column's right edge less the button's width less 20 px (a constant of the code), its
  text 19 px left of the column's start; the text is as wide as the column. That gives the captures'
  buttons at 0, 121, 484, 606, 727 and 848 to the pixel at 1920×1080 (button width 100) and at 0,
  229, 916, 1234, 1463 and 1692 at 2560×1440 (width 120).

etch#399 draws them: a repeater's `place.table` puts its entries as the columns of a table, with a
heading of another template beside each, and the base game's ledger profile carries the great
powers page's columns (other table pages have their own). Offline preview, rules of `main` after
etch#395 against etch#399:

| Set | Rects compared, exact | Visibility | Views fully right |
| --- | --- | --- | --- |
| Verne, 1920×1080, fresh | 3618 → 3630, 3589 → 3601 | 99.77 → **99.89 %** (9966 of 9977) | 33 → 34 of 58 |
| Verne, 1280×720, fresh | 2830 → 2842, 2811 → 2823 | 99.71 → **99.86 %** | 30 → 31 of 50 |
| Anbennar + P2KE, 2560×1440, fresh | 3684 → 3696, 3627 → 3628 | 99.78 → **99.90 %** | 20 → 20 of 57 |
| vanilla, 1920×1080, stored | 3628 → 3640, 3586 → 3598 | 99.35 → **99.47 %** | 31 → 32 of 60 |
| Bigger UI, 1920×1080, stored | 3623 → 3635, 3582 → 3594 | 99.40 → **99.53 %** | 31 → 32 of 60 |
| Anbennar alone, 1920×1080, stored | 3344 → 3356, 3332 exact | 99.75 → **99.89 %** | 32 → 33 of 52 |
| Bluescale 1472, unseen | 3157 → 3169, 3145 exact | 99.63 → **99.79 %** | 26 → 27 of 44 |
| Kobildzan 1594, unseen | 2734 → 2746, 2637 exact | 99.20 → 99.34 % | 17 → 18 of 43 |

Every button and heading is right to the pixel at 1920×1080 and 1280×720. In the Anbennar playset at
2560×1440 they are now drawn (visibility right), but 11 of the 12 stand a few pixels off: the game's
list box there is 1839 px wide against the 1863 px of Proper 2K UI Enhanced's file, so its unit is
229 and the preview's 232. Why the game's list is 24 px narrower was not read in the code.

**The settings' hidden second instance in the offline measure.** The main menu keeps two
`menu_settings` windows, one of them hidden (`menu_settings[1]` or `[2]`). etch#378 made the live
measure leave the hidden one to the capture; the offline preview still drew a window for it, so each
settings view counted it as drawn where the game hides it. The offline measure now does as the live
one: a numbered root the capture hides while another instance of it is shown gets no layout. It is
the measure's own, not the preview's; rules of `main` after etch#399 against etch#400:

| Set | Offline preview: visibility | Views fully right |
| --- | --- | --- |
| Verne, 1920×1080, fresh | 99.89 → **99.91 %** (9968 of 9977) | 34 → 35 of 58 |
| Verne, 1280×720, fresh | 99.86 → 99.89 % | 31 → 32 of 50 |
| Anbennar + P2KE, 2560×1440, fresh | 99.90 → 99.92 % | 20 → 21 of 57 |
| vanilla, 1920×1080, stored | 99.47 → 99.49 % | 32 → 33 of 60 |
| Proper 2K UI Enhanced, 2560×1440, stored | 99.76 → 99.92 % | 0 → 1 of 9 |

Rects do not move; no view gained a failure.

**Tried and dropped.** The map mode button on screen (`custom_mapmode_7` in every HUD view) is
42 × 32 in the game against 41 × 31 for the others; `GFX_mapmode_selected` is 46 × 35, so it is not
that sprite, and the rule that drew it lost a widget in Proper 2K UI Enhanced. The patriarch
authority marker (`current_patriarch_authority`, 4 views, 80 px right of its `.gui` place in Russia
1719) most likely moves with the authority's value, as the stability marker moves with stability;
the code was not read, and a share is not a few steps a selector could name.

### The measure of 22 November 2026

The rules of `main` at `438543f` (the content of 2.14.0) over the same stored captures, under the
lab's game lock, for the [v3 gate](v3-gate-status.md). The generated tables above are the run of
`main` at `a26978a` the same day, with the fixes below (etch#607–etch#615), both without the Anbennar playset with Proper 2K UI Enhanced and P2KE: the Workshop's P2KE Patch -
Anbennar changed on 15 November and no longer matches the hash `corpus/manifest.json` pins, so
`coverage` refuses it until it is pinned and captured again. No capture was taken again.

Against the rules of 12 November (after etch#400), on the fresh Anbennar captures and the two
countries held out:

| Set | Offline preview: rects | Offline preview: visibility | Live visibility | Live: views fully right |
| --- | --- | --- | --- | --- |
| Verne, 1920×1080, fresh | 99.20 % (3601/3630), same | 99.91 % (9968/9977), same | 100.00 %, same | 54 of 58, same |
| Verne, 1280×720, fresh | 99.33 % (2823/2842), same | 99.89 %, same | 100.00 %, same | 46 of 50, same |
| Bluescale 1472, unseen | 99.24 %, same | 99.79 %, same | 100.00 %, same | 41 of 44, same |
| Kobildzan 1594, unseen | 96.03 %, same | 99.34 %, same | 99.96 %, same | 39 of 43, same |

So the 198 commits between them changed no measured widget: the live snapshot's re-anchoring and
the sample data of etch#410–etch#423, etch#489 and etch#560–etch#563 leave these captures as they
were. With the profiles (measure 4, the gate's geometry), the rects left at 1920×1080 are 28 of
3312 in vanilla, 18 of 3191 in Anbennar's stored captures and 21 of 3411 on Verne.

Two live failures were the preview's own, and are fixed:

- **The ledger's headings twice** (etch#607): since etch#399 the table draws a heading beside each
  sort button, and the live match still adopted the game's headings as copies made by the code, so
  the live preview drew six headings too many. The ledger view becomes fully right from the live
  snapshot on every set that has it: Verne 54 → 55 of 58 at 1920×1080, 46 → 47 of 50 at 1280×720,
  Bluescale 41 → 42 of 44, Kobildzan 39 → 40 of 43. In the survey's stored captures, vanilla,
  Bigger UI and Anbennar at 1920×1080 each gain one view fully right (`vanilla-save-s28`,
  `anbennar-alone-save-s21`).
- **The peace view's text scrollbar** (etch#608): the game adds `standardtext_slider` beside the
  terms' description when it overflows; the preview adopted the bar but drew none of its buttons,
  the 4 live visibility failures left in vanilla at 1920×1080. With the fix, live visibility is
  100.00 % (10076 of 10076) there too.

Two offline rects are fixed too:

- **Anbennar's achievements background** (etch#610, etch#611): the preview anchored it by its own
  `CENTER`, but the game puts a window's background at the window's corner. With the profiles,
  Anbennar at 1920×1080 goes from 18 to 17 rects off.
- **The lobby's religion icon** (etch#612): without a secondary religion, eu4.exe hides
  `secondary_religion_icon` and moves `religion_icon` 18 px down. The capture is Russia's. With
  the profiles, vanilla at 1920×1080 goes from 28 to 27 rects off, and Bigger UI gains one too.

Two more follow what eu4.exe's code does with a value, each a new rule effect:

- **The estates view's development pie chart** (etch#614, `chartSize`): eu4.exe gives the chart
  32 × 32 around the same centre (`0xF28230`). One rect fewer in each estates view, in the preview,
  with the profiles and live; with the profiles Anbennar at 1920×1080 goes from 17 to 15 rects off.
- **The patriarch authority's marker** (etch#615, `slider`): the religion view hands the country's
  authority to a slider function (`0x1488BC0`) that places the marker between the two ends, and its
  value beside it. Russia's authority is 1, and the marker stands at the game's 211, 422 in the 4
  Russian religion views (vanilla and Bigger UI, both sizes). The value's text box is at the
  game's place too, but 18 px high against the game's 36: the game writes "100%", two lines in
  32 px, which the preview does not write (the heights of etch#604).

One fix is in the measure itself: in the main menu's settings views, the game holds a second
`menu_settings` and keeps it hidden. The preview measure drew it only once (etch#378), but the
measure with the profiles still drew it twice, one visibility failure in each of 10 views
(etch#613).

Each fix was measured on its branch over the survey's stored captures, against `main`: no view got
worse in any measure. `main` at `a26978a`, with all of them, measures the same as the last branch.
On the fresh Anbennar captures and the two held-out countries it is better in 19 views and worse in
none: with the profiles, Verne has 18 of 3411 rects off at 1920×1080 (21 before) and 11 of 2654 at
1280×720 (13), Bluescale 15 of 3027 (17) and Kobildzan 16 of 2520 (18).

What stays is listed by kind in [v3-gate-status.md](v3-gate-status.md): three proposed known
deviations (etch#604, the heights of texts the game's code fills; etch#605, a province's building
slots; etch#606, widgets the code sizes or moves from a value), waiting for the maintainer's
consent, and the built building slot that Tongs reports hidden (happy-dwarf-team/tongs#242).
### The survey taken again, 23 November 2026

For the [v3 gate](v3-gate-status.md), gaps 1 to 3: the survey's views taken again from the game in
the lab, under its game lock, with the capture host of etch#618 (Anvil 1.26.0 and Tongs 0.37.0
from their pinned releases), EU4 1.37.5 with the original `eu4.exe` and the survey's pinned saves.
The views are the 113 of the stored crawls (`survey-manifest` over them gives the manifest it gave
before, with Tongs 0.37.0 and the current P2KE pin). Those crawls were of 3 November, so nine views
the crawls of 10 November found are missing here; the next section puts them back. Every view is
captured at 1280×720 too, not only those whose windows have a variant there. The generated tables
above were `main`'s rules (`1392d3e`) on these captures, and are now on those of the next section;
the sections before this one are on the stored captures.

| Set | Captured | With profiles: rects off | Offline preview: visibility off | Live visibility |
| --- | --- | --- | --- | --- |
| vanilla, 1920×1080 | 60 of 61 | 23 of 3364 (24 of 3312 stored) | 42 of 10090 (49 of 9886) | 10280 of 10280 |
| vanilla, 1280×720 | 57 of 61 (36 stored) | 23 of 3360 (13 of 2568) | 45 of 10100 (46 of 7534) | 100.00 % |
| Anbennar alone, 1920×1080 | 52 of 52 | 14 of 3192 (15 of 3191) | 7 of 8907 (9 of 8892) | 100.00 % |
| Anbennar alone, 1280×720 | 45 of 52 (33 stored) | 7 of 2471 (7 of 2144) | 7 of 7272 (9 of 6589) | 100.00 % |
| Bigger UI, 1920×1080 | 60 of 61 | 23 of 3364 (23 of 3307) | 37 of 10119 (44 of 9910) | 100.00 % |
| Bigger UI, 1280×720 | 57 of 61 (36 stored) | 23 of 3344 (12 of 2562) | 41 of 10131 (46 of 7529) | 100.00 % |
| Proper 2K UI Enhanced, 2560×1440 | 59 of 61 (9 stored) | 76 of 3460 (10 of 396) | 37 of 10136 (1 of 1246) | 100.00 % |
| Anbennar with Proper 2K UI Enhanced and P2KE, 2560×1440 | 51 of 52 (not measured since 15 November) | 45 of 3086 | 7 of 8975 | 100.00 % |

On the views both runs have, the rects are the same but one: the main menu's Continue text
(`continue_container/text`, a height of a text the code fills, etch#604) is gone from vanilla's and
Anbennar's main menu, as a start from the main menu now has no save and the game hides Continue
(etch#618). The 1280×720 sets have more views, so more rects.

**The built building slots** (etch#618, tongs#238): Tongs 0.23 reported a built slot as hidden
while the game draws it, so the 29 failures of the offline preview in vanilla's province view at
1920×1080 where it drew a built slot were failures against a wrong reference. With Tongs 0.37 they
are gone, and the live snapshot has 10280 shown widgets where it had 10076. Of the 42 failures left
there, 37 are which slots the province has and which can build or be destroyed now
(`building_destroy`, `building_canbuild`, `building_progress_entry`, `required_development`), the
deviation proposed in etch#605; the others are `outliner_bottom`, the war overview's leadership
button and the peace view's text scrollbar.

**Bigger UI** was the holdout, measured once on 3 November before any fix. These figures are the
current rules on fresh captures of it, reported, not a second holdout measure.

**Not captured** (20 captures): at 1280×720 a tooltip shows under the pointer where the driver rests
it, every time, on vanilla's `vanilla-save-s4`, `s13` and `s27` (and so Bigger UI's) and Anbennar's
`s2`, `s10`, `s16`, `s19`, `s44`, `s45` and `s46`; vanilla's `vanilla-save-s69` no longer opens
`multi_unitpanel` by its recipe, at either size; in Proper 2K UI Enhanced `vanilla-save-s61` names
two policy buttons (`ambiguous`), and Anbennar's achievements button (`anbennar-alone-save-s16`) is
covered by the speed controls' `button_achievements` under P2KE. None of these was in the stored
captures either.

**How it ran.** Six batches under the lock (a trial, two captures, two retries, the comparison),
16:32 to 19:55 local time, settings back to their
baselines and the Process Lasso rule checked before and after each. A main menu view the driver
takes after one that Escape does not close failed at its first click (`single_player_button` not
visible) without a fresh start; taken again on its own, each was captured (vanilla's `menu-s8` and
`menu-s9`, in each vanilla playset). Pixels: `compare --gpu` over the 441 captures, 19 pass, reported
only, as the survey's views have no masks of what the game fills.

### Gap 5: the views not yet captured, 24 November 2026

For the [v3 gate](v3-gate-status.md), gap 5: the views of the survey no record had, and the views
that depend on the country, taken with the same host as the section before, under the lab's game
lock. The generated tables above are `main`'s rules (`b156984`) on the captures of both sections.

**The nine views the survey had lost.** The crawl states of 10 November (Anbennar's menu crawled to
the end and the confirmation dialogs, in the section of that date) were not in the crawl files of
23 November. Their views are in the survey manifest of 11 November, which captured them then, and
were put back into the crawl files from it, with their steps and roots: vanilla's abandoning an
idea group (`vanilla-save-s75`), Anbennar's disbanding a unit and disbanding from the
reorganisation (`anbennar-alone-save-s54`, `s55`), and Anbennar's lobby with its options, find box,
nation designer, country shield and the options' custom tab (`anbennar-alone-menu-s4` to `s9`). The
survey has 122 views now: 62 of vanilla and 60 of Anbennar.

**The views a tooltip covered at 1280×720.** The great powers, the Celestial Empire and Anbennar's
magic menus cover the pause banner at that size, where the driver rested the pointer, and the shot
showed a tooltip of the view's own. From a save, the driver now rests it on the bottom-right pixel,
where the game hovers the minimap's frame (etch#670). All ten views are captured, and Bigger UI's
three.

**vanilla's `s69`**, a leader's tooltip: the crawled first leader has no army in the lab's save, and
the game shows no tooltip for him. Its steps in `coverage/survey.json` scroll the leader list to the
7th Army's leader (etch#670).

| Set | Captured | With profiles: rects off | Offline preview: visibility off | Live visibility |
| --- | --- | --- | --- | --- |
| vanilla, 1920×1080 | 62 of 62 | 23 of 3421 (23 of 3364 on 23 November) | 42 of 10640 (42 of 10090) | 10835 of 10835 |
| vanilla, 1280×720 | 62 of 62 | 23 of 3417 (23 of 3360) | 45 of 10801 (45 of 10100) | 100.00 % |
| Anbennar alone, 1920×1080 | 60 of 60 | 19 of 3524 (14 of 3192) | 7 of 10271 (7 of 8907) | 100.00 % |
| Anbennar alone, 1280×720 | 59 of 60 | 18 of 3444 (7 of 2471) | 7 of 9984 (7 of 7272) | 100.00 % |
| Bigger UI, 1920×1080 | 62 of 62 | 23 of 3421 (23 of 3364) | 37 of 10669 (37 of 10119) | 100.00 % |
| Bigger UI, 1280×720 | 62 of 62 | 23 of 3401 (23 of 3344) | 41 of 10832 (41 of 10131) | 100.00 % |
| Proper 2K UI Enhanced, 2560×1440 | 61 of 62 | 80 of 3517 (76 of 3460) | 37 of 10872 (37 of 10136) | 100.00 % |
| Anbennar with Proper 2K UI Enhanced and P2KE, 2560×1440 | 59 of 60 | 52 of 3425 (45 of 3086) | 7 of 10575 (7 of 8975) | 100.00 % |

On the views both days have, every figure is the same. The new views add rects of known kinds:
the lobby's `scenario_description` (15 rects over the sets) and two texts of Anbennar's magic menu,
heights of texts the game's code fills (etch#604); at 2560×1440, with Proper 2K UI Enhanced, the
unit panel's `regiment_bg`, three icons of the ideas view and the lobby's `nation_designer_hint`.

**Anbennar's achievements at 1280×720** (`anbennar-alone-save-s16`): the window has a small variant
for heights up to 864 pixels (`achievement_indiv_small`, `achievement_window_small_bg`), which the
game shows at 1280×720. The topbar profile's `achievements` value `open`, made at 1920×1080, hid
it, so no value of the selector fitted the snapshot there and the preview kept the window closed:
91 visibility failures offline. The profile now has the screen height as a selector (`screen`, 864
pixels or less), and `open` hides each variant's widgets at the height the game hides them. The
view has no visibility failure at either size now; the window's rects at 1280×720 add three
`flavor_text` heights, a text the game's code fills (etch#604), as at 1920×1080.

**Not captured** (3 captures): Anbennar's disbanding from the reorganisation at 1280×720, as the
reorganisation window covers the unit panel's disband button at that size (both tries); in Proper
2K UI Enhanced `vanilla-save-s61` (`ambiguous`, as on 23 November), and the P2KE playset's
achievements button, covered by the speed controls' `button_achievements`. The last two are of
reported sets; the first is a view the game does not let a click open at that size.

**The views that depend on the country**, taken again as on 10 November (the same private copies
of the Russian game of 15 September 1550, the player moved to Austria, Aragon and Castile's
colonial nation `C01`), on the 51 save views of vanilla's survey at 1920×1080. Two recipes have
steps of the country's own: an uncolonised province the country has discovered (747 for Austria and
Aragon, 742 for `C01`; 574 of 10 November is terra incognita to all three, which Tongs refuses), and
the first row's unlock button of the idea groups (the others have more than one row).

| Set | Captured | Offline preview: rects | Offline preview: visibility | With profiles: rects off | Live visibility |
| --- | --- | --- | --- | --- | --- |
| Austria, the emperor | 41 of 51 | 99.3 % (2512/2529) | 99.7 % (6362/6381) | 12 of 2421 | 6426 of 6426 |
| Aragon, the Pope's controller | 41 of 51 | 99.3 % (2558/2575) | 99.4 % (5790/5823) | 12 of 2467 | 5830 of 5830 |
| C01, a colonial nation | 37 of 51 | 99.7 % (2175/2181) | 98.6 % (4892/4959) | 3 of 2087 | 4959 of 4959 |

The rects off with the profiles are of known kinds: the estates' crown land modifier icons and the
selected map mode button (etch#606), and texts the game's code fills (etch#604). The views left are
ones the country does not have: the parliament, the Celestial Empire, a war, the native policy, a
rebel faction and the Orthodox icons on all three; the naval doctrine on the emperor; the subject's
focus on the Pope's controller and the colonial nation, which also has the estates tab and two of
the military view's buttons disabled.

**How it ran.** Five batches under the lock, 00:08 to 01:51 local time: the views of the gap, the
lost views and the countries, a retry, and the comparison. Settings were back to their baselines
and the Process Lasso rule was checked before and after each. Anbennar's `menu-s8` and `menu-s9`
failed after a view that Escape does not close, as vanilla's on 23 November, and were captured each
on its own. Pixels: `compare --gpu` over the 487 captures, 22 pass, reported only.

<!-- other countries: end -->

## What differs

### vanilla

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 311 | 9 | `provinceview/province_window/tax_base_value` |
| outline: the game shows a widget the layout lacks | 284 | 12 | `minimap_panel/minimap_bg` |
| outline rect, iconType: y differ | 164 | 6 | `countrymilitaryview/icon_cost` |
| outline rect, guiButtonType: y differ | 52 | 5 | `countrymilitaryview/infantry_type_button` |
| outline rect, instantTextBoxType: h differ | 50 | 20 | `parliament_window/enacted_modifiers_effect` |
| outline rect, instantTextBoxType: x differ | 22 | 7 | `countrydiplomacyview/label_nation` |
| outline rect, windowType: y, h differ | 20 | 10 | `provinceview` |
| outline rect, iconType: w, h differ | 20 | 5 | `ages_view/picture` |
| outline rect, windowType: y differ | 19 | 9 | `menubar/WarOverviewButtonWindow` |
| outline rect, instantTextBoxType: w differ | 14 | 7 | `provinceview/province_window/warscore_value` |
| outline rect, instantTextBoxType: w, h differ | 10 | 5 | `countrydiplomacyview/num_relations_value` |
| outline rect, iconType: x differ | 10 | 5 | `countrystabilityview/stability_progress_threshold` |
| outline rect, iconType: x, y differ | 4 | 2 | `waroverview/waroverview_icon` |
| outline rect, iconType: y, w, h differ | 4 | 2 | `countryestatesview/dev_share_pie_chart` |
| live: no value of selector page fits | 4 | 2 | `menu_settings` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, instantTextBoxType: x, y differ | 2 | 1 | `waroverview/waroverview_value` |
| outline rect, instantTextBoxType: x, y, h differ | 2 | 1 | `countryreligionview/orthodox_specific_window/current_patriarch_authority_value` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |

### anbennar-alone

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 195 | 7 | `provinceview/province_window/tax_base_value` |
| outline: the game shows a widget the layout lacks | 110 | 8 | `minimap_panel/minimap_bg` |
| outline rect, iconType: y differ | 98 | 4 | `countrymilitaryview/icon_cost` |
| outline rect, instantTextBoxType: h differ | 42 | 17 | `ages_view/desc` |
| outline rect, guiButtonType: y differ | 19 | 3 | `countrymilitaryview/infantry_type_button` |
| outline rect, windowType: y differ | 16 | 6 | `menubar/WarOverviewButtonWindow` |
| outline rect, instantTextBoxType: x differ | 16 | 4 | `countrydiplomacyview/label_nation` |
| outline rect, instantTextBoxType: w differ | 12 | 6 | `provinceview/province_window/warscore_value` |
| outline rect, windowType: y, h differ | 10 | 5 | `provinceview/province_window` |
| outline rect, instantTextBoxType: w, h differ | 8 | 4 | `countryeconomyview/development_base` |
| outline rect, guiButtonType: x, y, h differ | 4 | 2 | `tributary_shield` |
| outline rect, iconType: w, h differ | 4 | 3 | `ages_view/picture` |
| outline rect, iconType: x differ | 4 | 2 | `countryreligionview/current_religion_icon` |
| outline rect, iconType: y, w, h differ | 4 | 2 | `countryestatesview/dev_share_pie_chart` |
| live: no value of selector page fits | 4 | 2 | `menu_settings` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |

### bigger-ui

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 311 | 9 | `provinceview/province_window/tax_base_value` |
| outline: the game shows a widget the layout lacks | 274 | 11 | `minimap_panel/minimap_bg` |
| outline rect, iconType: y differ | 164 | 6 | `countrymilitaryview/icon_cost` |
| outline rect, guiButtonType: y differ | 52 | 5 | `countrymilitaryview/infantry_type_button` |
| outline rect, instantTextBoxType: h differ | 50 | 20 | `parliament_window/enacted_modifiers_effect` |
| outline rect, instantTextBoxType: x differ | 22 | 7 | `countrydiplomacyview/label_nation` |
| outline rect, windowType: y, h differ | 20 | 10 | `provinceview` |
| outline rect, iconType: w, h differ | 20 | 5 | `ages_view/picture` |
| outline rect, windowType: y differ | 19 | 9 | `menubar/WarOverviewButtonWindow` |
| outline rect, instantTextBoxType: w differ | 14 | 7 | `provinceview/province_window/warscore_value` |
| outline rect, instantTextBoxType: w, h differ | 10 | 5 | `countrydiplomacyview/num_relations_value` |
| outline rect, iconType: x differ | 10 | 5 | `countrystabilityview/stability_progress_threshold` |
| outline rect, iconType: x, y differ | 4 | 2 | `waroverview/waroverview_icon` |
| outline rect, iconType: y, w, h differ | 4 | 2 | `countryestatesview/dev_share_pie_chart` |
| live: no value of selector page fits | 4 | 2 | `menu_settings` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, instantTextBoxType: x, y differ | 2 | 1 | `waroverview/waroverview_value` |
| outline rect, instantTextBoxType: x, y, h differ | 2 | 1 | `countryreligionview/orthodox_specific_window/current_patriarch_authority_value` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |

### proper-2k-ui-enhanced

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline: the game shows a widget the layout lacks | 137 | 11 | `minimap_panel/minimap_bg` |
| outline rect, instantTextBoxType: h differ | 30 | 22 | `parliament_window/enacted_modifiers_effect` |
| outline rect, iconType: w, h differ | 25 | 7 | `ages_view/picture` |
| outline rect, instantTextBoxType: w differ | 18 | 8 | `topbar/text_prestige` |
| outline rect, instantTextBoxType: y differ | 15 | 5 | `provinceview/province_window/tax_base_value` |
| outline rect, instantTextBoxType: w, h differ | 11 | 9 | `provinceview/province_window/warscore_value` |
| outline rect, instantTextBoxType: x differ | 11 | 7 | `countrydiplomacyview/label_nation` |
| outline rect, windowType: y differ | 8 | 7 | `menubar/WarOverviewButtonWindow` |
| outline rect, windowType: y, h differ | 5 | 5 | `provinceview/province_window` |
| outline rect, iconType: x differ | 5 | 5 | `countrystabilityview/stability_progress_threshold` |
| outline rect, windowType: x, y, w, h differ | 2 | 2 | `provinceview/buildings_window/great_projects_window` |
| outline rect, iconType: y, h differ | 2 | 2 | `provinceview/buildings_window/great_projects_window/great_projects_window_bg` |
| outline rect, iconType: x, y differ | 2 | 2 | `waroverview/waroverview_icon` |
| outline rect, iconType: y differ | 2 | 2 | `domesticpanel_naval_doctrine_select/domesticpanel_overlay` |
| outline rect, iconType: y, w, h differ | 2 | 2 | `countryestatesview/dev_share_pie_chart` |
| live: no value of selector page fits | 2 | 2 | `menu_settings` |
| outline rect, windowType: x, y differ | 1 | 1 | `diplomessageicons_window` |
| outline rect, instantTextBoxType: x, y differ | 1 | 1 | `waroverview/waroverview_value` |
| outline rect, instantTextBoxType: x, y, w, h differ | 1 | 1 | `countryreligionview/orthodox_specific_window/current_patriarch_authority_value` |
| outline rect, guiButtonType: y differ | 1 | 1 | `domesticpanel_naval_doctrine_select/back_button` |
| outline rect, iconType: h differ | 1 | 1 | `single_unitpanel/regiment_bg` |

### anbennar

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline: the game shows a widget the layout lacks | 55 | 8 | `minimap_panel/minimap_bg` |
| outline rect, instantTextBoxType: h differ | 18 | 17 | `speed_controls/DateText` |
| outline rect, instantTextBoxType: y differ | 13 | 4 | `provinceview/province_window/tax_base_value` |
| outline rect, instantTextBoxType: w, h differ | 11 | 9 | `provinceview/province_window/warscore_value` |
| outline rect, instantTextBoxType: x differ | 10 | 5 | `menubar/floating_buttons/floating_number_1` |
| outline rect, instantTextBoxType: w differ | 9 | 9 | `provinceview/province_window/foreign_province_window/opinion_box` |
| outline rect, windowType: y differ | 6 | 5 | `menubar/WarOverviewButtonWindow` |
| outline rect, iconType: x differ | 4 | 3 | `menubar/floating_buttons/menubar_floating_bg_1` |
| outline rect, windowType: y, h differ | 4 | 4 | `provinceview/province_window` |
| outline rect, iconType: h differ | 3 | 3 | `single_unitpanel/regiment_bg` |
| outline rect, windowType: x, y, w, h differ | 2 | 2 | `menubar/floating_buttons` |
| outline rect, guiButtonType: x differ | 2 | 1 | `menubar/floating_buttons/f_button_1` |
| outline rect, guiButtonType: x, y, h differ | 2 | 2 | `tributary_shield` |
| outline rect, iconType: w differ | 2 | 2 | `provinceview/province_terrain` |
| outline rect, iconType: y, w, h differ | 2 | 2 | `countryestatesview/dev_share_pie_chart` |
| live: no value of selector page fits | 2 | 2 | `menu_settings` |
| outline rect, windowType: x, y differ | 1 | 1 | `diplomessageicons_window` |
| outline rect, iconType: w, h differ | 1 | 1 | `ages_view/picture` |
| outline rect, iconType: y, h differ | 1 | 1 | `provinceview/buildings_window/great_projects_window/great_projects_window_bg` |
| outline rect, iconType: y differ | 1 | 1 | `country_selection_panel/lobby/right/singleplayer/religion_icon` |

## Pixels

`compare`'s per-widget result for the survey's views. The survey's views have no hand-made
masks of what the game fills (the corpus has `codeFilled`), so a text or icon the game fills
fails by its content; the rect-only column counts the widgets that fail by their rect alone.

| Playset | Views compared | Views passing | Widgets passing | Widgets failing | Rect only | Failing by kind |
| --- | --- | --- | --- | --- | --- | --- |
| vanilla | 124 | 6 | 4355 | 3243 | 596 | instantTextBoxType 1464, iconType 846, guiButtonType 596, none in the layout 284, windowType 53 |
| anbennar-alone | 119 | 6 | 4846 | 2609 | 425 | instantTextBoxType 1220, iconType 660, guiButtonType 557, none in the layout 110, windowType 60, checkboxType 2 |
| bigger-ui | 124 | 6 | 4350 | 3219 | 598 | instantTextBoxType 1460, iconType 838, guiButtonType 594, none in the layout 274, windowType 53 |
| proper-2k-ui-enhanced | 61 | 2 | 2192 | 1701 | 310 | instantTextBoxType 820, iconType 428, guiButtonType 289, none in the layout 137, windowType 27 |
| anbennar | 59 | 2 | 2273 | 1389 | 231 | instantTextBoxType 678, iconType 338, guiButtonType 297, none in the layout 55, windowType 20, checkboxType 1 |

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
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 7 |
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
| `country_selection_panel/lobby/bottom/scenario_description` | instantTextBoxType | 0,0 | 0 | 6 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 5 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-60 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `provinceview/buildings_window/great_projects_window` | windowType | 0,-10 | 2 | 1 |
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
| `country_selection_panel/mainmenu/mainmenu_panel_bottom/version_label` | instantTextBoxType | 0,0 | 0 | 1 |
| `country_selection_panel/lobby/right/singleplayer/religion_icon` | iconType | 0,-18 | 0 | 1 |

### bigger-ui

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `countrymilitaryview` | windowType | 0,-16 | 111 | 5 |
| `countrytechnologyview/institutions_window` | windowType | 0,140 | 15 | 1 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 7 |
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
| `countrymilitaryview` | windowType | 0,-19 | 125 | 5 |
| `countrytechnologyview/institutions_window` | windowType | 0,168 | 15 | 1 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 7 |
| `country_selection_panel/lobby/bottom/scenario_description` | instantTextBoxType | 0,0 | 0 | 6 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-72 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-75 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-75 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-75 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/land_forcelimit_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `countrydiplomacyview/num_relations_value` | instantTextBoxType | 0,0 | 0 | 3 |
| `countrydiplomacyview/reputation_value` | instantTextBoxType | 0,0 | 0 | 3 |
| `countrydiplomacyview/score_value` | instantTextBoxType | 0,0 | 0 | 3 |
| `countrydiplomacyview/manpower_value` | instantTextBoxType | 0,0 | 0 | 3 |
| `countryideasview/unique_ideas_start_icon_1` | iconType | 0,0 | 0 | 3 |
| `countryideasview/unique_ideas_start_icon_2` | iconType | 0,0 | 0 | 3 |
| `countryideasview/unique_ideas_bonus_icon` | iconType | 0,0 | 0 | 3 |
| `countrystabilityview/stability_progress_threshold` | iconType | -57,0 | 0 | 3 |
| `countrystabilityview/stability_value` | instantTextBoxType | -57,0 | 0 | 3 |
| `provinceview/province_window/foreign_province_window/opinion_box` | instantTextBoxType | 0,0 | 0 | 2 |
| `provinceview/buildings_window/great_projects_window` | windowType | -17,66 | 0 | 2 |
| `provinceview/buildings_window/great_projects_window/great_projects_window_bg` | iconType | 0,201 | 0 | 2 |
| `provinceview/buildings_window/great_projects_window/header_label` | instantTextBoxType | 0,201 | 0 | 2 |
| `gov_view_reform_select/reform_upgrades_next` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/war_exhaustion` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/development_base` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryreligionview/current_religion_icon` | iconType | -62,0 | 0 | 2 |
| `countryestatesview/dev_share_pie_chart` | iconType | 0,-121 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_1` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_2` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_3` | iconType | 0,0 | 0 | 2 |
| `countryestatesview/crown_land_modifier_icon_4` | iconType | 0,0 | 0 | 2 |
| `diplomessageicons_window` | windowType | 12,1236 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-132 | 0 | 1 |
| `topbar/text_prestige` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/powerprojection_topbar/text_powerprojection` | instantTextBoxType | 0,0 | 0 | 1 |
| `parliament_window/enacted_modifiers_effect` | instantTextBoxType | 0,0 | 0 | 1 |

### anbennar

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `countrymilitaryview` | windowType | 0,-19 | 121 | 3 |
| `countrytechnologyview/institutions_window` | windowType | 0,168 | 15 | 1 |
| `country_selection_panel/lobby/bottom/scenario_description` | instantTextBoxType | 0,0 | 0 | 6 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 5 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-72 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-75 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-75 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-75 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/land_forcelimit_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `provinceview/province_window/foreign_province_window/opinion_box` | instantTextBoxType | 0,0 | 0 | 3 |
| `single_unitpanel/regiment_bg` | iconType | 0,0 | 0 | 3 |
| `tributary_shield` | guiButtonType | -1104,-649 | 0 | 2 |
| `provinceview/province_terrain` | iconType | 0,0 | 0 | 2 |
| `countryeconomyview/war_exhaustion` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/development_base` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryreligionview/current_religion_icon` | iconType | -62,0 | 0 | 2 |
| `countryestatesview/dev_share_pie_chart` | iconType | 0,-121 | 0 | 2 |
| `countryestatesview/agenda_effects` | instantTextBoxType | 0,0 | 0 | 2 |
| `diplomessageicons_window` | windowType | 12,1236 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-130 | 0 | 1 |
| `menubar/floating_buttons` | windowType | -1959,-1371 | 0 | 1 |
| `menubar/floating_buttons/f_button_1` | guiButtonType | 90,0 | 0 | 1 |
| `menubar/floating_buttons/f_button_2` | guiButtonType | 90,0 | 0 | 1 |
| `menubar/floating_buttons/menubar_floating_bg_1` | iconType | 90,0 | 0 | 1 |
| `menubar/floating_buttons/menubar_floating_bg_2` | iconType | 90,0 | 0 | 1 |
| `menubar/floating_buttons/floating_number_1` | instantTextBoxType | 90,0 | 0 | 1 |
| `menubar/floating_buttons/floating_number_2` | instantTextBoxType | 90,0 | 0 | 1 |
| `speed_controls/DateText` | instantTextBoxType | 0,0 | 0 | 1 |
| `ages_view/picture` | iconType | 0,0 | 0 | 1 |
| `ages_view/desc` | instantTextBoxType | 0,0 | 0 | 1 |
| `provinceview/buildings_window/great_projects_window` | windowType | -17,66 | 0 | 1 |
| `provinceview/buildings_window/great_projects_window/great_projects_window_bg` | iconType | 0,201 | 0 | 1 |
| `provinceview/buildings_window/great_projects_window/header_label` | instantTextBoxType | 0,201 | 0 | 1 |
| `countrystabilityview/stability_value` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/magic_menu_parent/magic_menu_main/magic_menu_main_row_3/magic_menu_infamy_types` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/magic_menu_parent/magic_menu_main/magic_menu_main_row_3/magic_menu_infamy_text` | instantTextBoxType | 0,0 | 0 | 1 |

## Windows

| Playset | Windows | Views | Inside a view | Not reached |
| --- | --- | --- | --- | --- |
| vanilla | 696 | 46 | 145 | 505 |
| anbennar-alone | 813 | 43 | 109 | 661 |
| bigger-ui | 696 | 46 | 145 | 505 |
| proper-2k-ui-enhanced | 696 | 46 | 144 | 506 |
| anbennar | 814 | 43 | 112 | 659 |

A window's confidence is the share of its widgets built only of confirmed constructs.

| Playset | Not reached | Confidence 100 % | 90 % or more | 50 % or more | Below 50 % |
| --- | --- | --- | --- | --- | --- |
| vanilla | 505 | 0 | 0 | 56 | 449 |
| anbennar-alone | 661 | 46 | 46 | 250 | 411 |
| bigger-ui | 505 | 0 | 0 | 56 | 449 |
| proper-2k-ui-enhanced | 506 | 0 | 0 | 135 | 371 |
| anbennar | 659 | 158 | 161 | 463 | 196 |

## Constructs

A construct is confirmed when at least 10 widgets built with it were compared on their own and at least 95 % of them had the game's rect.

| Playset | Seen | Confirmed | All exact | Some rect differs |
| --- | --- | --- | --- | --- |
| vanilla | 100 | 49 | 50 | 50 |
| anbennar-alone | 113 | 71 | 57 | 56 |
| bigger-ui | 100 | 49 | 50 | 50 |
| proper-2k-ui-enhanced | 103 | 40 | 56 | 47 |
| anbennar | 114 | 52 | 57 | 57 |

vanilla, constructs with rects that differ (most first):

- `instantTextBoxType`: 411 of 2091 differ
- `instantTextBoxType.position`: 406 of 2076 differ
- `instantTextBoxType.maxwidth`: 406 of 2086 differ
- `instantTextBoxType.maxheight`: 406 of 2086 differ
- `instantTextBoxType.format`: 399 of 2041 differ
- `instantTextBoxType.bordersize`: 334 of 1916 differ
- `instantTextBoxType.fixedsize`: 264 of 738 differ
- `instantTextBoxType.fixedsize=yes`: 264 of 722 differ
- `instantTextBoxType.format=right`: 259 of 723 differ
- `iconType`: 204 of 1714 differ
- `iconType.position`: 199 of 1707 differ
- `iconType.scale`: 136 of 418 differ
- `iconType.hint_tag`: 104 of 428 differ
- `instantTextBoxType.format=centre`: 93 of 717 differ
- `guiButtonType`: 55 of 2225 differ
- `instantTextBoxType.orientation`: 46 of 294 differ
- `instantTextBoxType.orientation=upper_left`: 46 of 268 differ
- `windowType`: 41 of 564 differ
- `windowType.position`: 41 of 550 differ
- `windowType.size`: 39 of 540 differ
- `windowType.moveable`: 39 of 542 differ
- `guiButtonType.hint_tag`: 35 of 89 differ
- `windowType.background`: 34 of 464 differ
- `windowType.orientation`: 34 of 283 differ
- `windowType.dontrender`: 32 of 468 differ

anbennar-alone, constructs with rects that differ (most first):

- `instantTextBoxType`: 273 of 2263 differ
- `instantTextBoxType.position`: 270 of 2252 differ
- `instantTextBoxType.maxwidth`: 270 of 2258 differ
- `instantTextBoxType.maxheight`: 268 of 2258 differ
- `instantTextBoxType.format`: 261 of 2166 differ
- `instantTextBoxType.bordersize`: 224 of 2032 differ
- `instantTextBoxType.fixedsize`: 174 of 685 differ
- `instantTextBoxType.fixedsize=yes`: 174 of 669 differ
- `instantTextBoxType.format=right`: 151 of 723 differ
- `iconType`: 112 of 1844 differ
- `iconType.position`: 109 of 1839 differ
- `iconType.scale`: 72 of 314 differ
- `iconType.hint_tag`: 64 of 434 differ
- `instantTextBoxType.format=centre`: 60 of 690 differ
- `instantTextBoxType.format=left`: 34 of 503 differ
- `windowType`: 28 of 671 differ
- `windowType.position`: 28 of 636 differ
- `instantTextBoxType.orientation`: 28 of 365 differ
- `instantTextBoxType.orientation=upper_left`: 28 of 339 differ
- `windowType.size`: 26 of 625 differ
- `windowType.moveable`: 26 of 631 differ
- `guiButtonType`: 26 of 2119 differ
- `windowType.orientation`: 25 of 380 differ
- `windowType.background`: 23 of 463 differ
- `windowType.dontrender`: 21 of 463 differ

bigger-ui, constructs with rects that differ (most first):

- `instantTextBoxType`: 411 of 2084 differ
- `instantTextBoxType.position`: 406 of 2069 differ
- `instantTextBoxType.maxwidth`: 406 of 2079 differ
- `instantTextBoxType.maxheight`: 406 of 2079 differ
- `instantTextBoxType.format`: 399 of 2034 differ
- `instantTextBoxType.bordersize`: 334 of 1909 differ
- `instantTextBoxType.fixedsize`: 264 of 737 differ
- `instantTextBoxType.fixedsize=yes`: 264 of 721 differ
- `instantTextBoxType.format=right`: 259 of 722 differ
- `iconType`: 204 of 1710 differ
- `iconType.position`: 199 of 1703 differ
- `iconType.scale`: 136 of 418 differ
- `iconType.hint_tag`: 104 of 428 differ
- `instantTextBoxType.format=centre`: 93 of 713 differ
- `guiButtonType`: 55 of 2218 differ
- `instantTextBoxType.orientation`: 46 of 292 differ
- `instantTextBoxType.orientation=upper_left`: 46 of 266 differ
- `windowType`: 41 of 564 differ
- `windowType.position`: 41 of 550 differ
- `windowType.size`: 39 of 540 differ
- `windowType.moveable`: 39 of 542 differ
- `guiButtonType.hint_tag`: 35 of 89 differ
- `windowType.background`: 34 of 464 differ
- `windowType.orientation`: 34 of 283 differ
- `windowType.dontrender`: 32 of 468 differ

proper-2k-ui-enhanced, constructs with rects that differ (most first):

- `instantTextBoxType`: 87 of 892 differ
- `instantTextBoxType.position`: 87 of 887 differ
- `instantTextBoxType.maxwidth`: 86 of 891 differ
- `instantTextBoxType.maxheight`: 86 of 891 differ
- `instantTextBoxType.bordersize`: 84 of 841 differ
- `instantTextBoxType.format`: 81 of 867 differ
- `iconType`: 39 of 822 differ
- `iconType.position`: 39 of 821 differ
- `iconType.orientation`: 30 of 540 differ
- `instantTextBoxType.format=centre`: 30 of 318 differ
- `instantTextBoxType.orientation`: 30 of 133 differ
- `iconType.orientation=upper_left`: 30 of 525 differ
- `instantTextBoxType.orientation=upper_left`: 29 of 120 differ
- `iconType.scale`: 24 of 167 differ
- `instantTextBoxType.fixedsize`: 21 of 259 differ
- `instantTextBoxType.fixedsize=yes`: 21 of 251 differ
- `instantTextBoxType.format=center`: 21 of 92 differ
- `windowType`: 16 of 273 differ
- `windowType.position`: 16 of 266 differ
- `instantTextBoxType.format=right`: 16 of 211 differ
- `windowType.size`: 15 of 261 differ
- `windowType.moveable`: 15 of 262 differ
- `windowType.orientation`: 15 of 137 differ
- `instantTextBoxType.format=left`: 14 of 246 differ
- `windowType.orientation=upper_left`: 12 of 85 differ

anbennar, constructs with rects that differ (most first):

- `instantTextBoxType`: 61 of 1017 differ
- `instantTextBoxType.position`: 61 of 1014 differ
- `instantTextBoxType.maxwidth`: 60 of 1016 differ
- `instantTextBoxType.maxheight`: 59 of 1015 differ
- `instantTextBoxType.bordersize`: 56 of 923 differ
- `instantTextBoxType.format`: 55 of 969 differ
- `instantTextBoxType.format=centre`: 26 of 331 differ
- `instantTextBoxType.fixedsize`: 22 of 277 differ
- `instantTextBoxType.fixedsize=yes`: 22 of 269 differ
- `instantTextBoxType.orientation`: 20 of 185 differ
- `instantTextBoxType.orientation=upper_left`: 16 of 172 differ
- `iconType`: 14 of 844 differ
- `iconType.position`: 14 of 843 differ
- `windowType`: 13 of 292 differ
- `windowType.position`: 13 of 277 differ
- `instantTextBoxType.format=left`: 13 of 215 differ
- `windowType.orientation`: 12 of 149 differ
- `windowType.size`: 11 of 266 differ
- `windowType.moveable`: 11 of 273 differ
- `iconType.orientation`: 9 of 625 differ
- `instantTextBoxType.format=center`: 9 of 140 differ
- `windowType.orientation=upper_left`: 9 of 90 differ
- `windowType.background`: 8 of 202 differ
- `windowType.fullscreen`: 8 of 195 differ
- `windowType.animation_type`: 7 of 112 differ

## Views

### vanilla

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.7 % | 92.9 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s1 1280x720 | countrycourtview (profile), countryview (profile) | 100.0 % | 82.1 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s2 1280x720 | hre_window (profile) | 100.0 % | 89.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s3 1280x720 | parliament_window (profile) | 87.5 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s4 1280x720 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s5 1280x720 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 1280x720 | macro_build_interface (profile) | 100.0 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 1280x720 | provinceview (profile) | 94.9 % | 65.4 % | 100.0 % | 100.0 % | 100.0 % | 78 fail |
| vanilla-save-s8 1280x720 | provinceview (profile) | 92.0 % | 71.7 % | 100.0 % | 100.0 % | 100.0 % | 77 fail |
| vanilla-save-s9 1280x720 | provinceview (profile) | 94.2 % | 67.2 % | 100.0 % | 100.0 % | 100.0 % | 69 fail |
| vanilla-save-s10 1280x720 | colonisationpanel (profile) | 100.0 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s12 1280x720 | provinceview (profile) | 92.3 % | 67.2 % | 100.0 % | 100.0 % | 100.0 % | 73 fail |
| vanilla-save-s13 1280x720 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s14 1280x720 | countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s15 1280x720 | ages_view (profile) | 88.8 % | 88.8 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 1280x720 | waroverview | 90.6 % | 99.1 % | 100.0 % | 100.0 % | 100.0 % | 31 fail |
| vanilla-save-s24 1280x720 | countrygovernmentview (profile), countryview (profile) | 100.0 % | 93.4 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s25 1280x720 | countrydiplomacyview (profile), countryview (profile), hre_window (profile) | 98.1 % | 75.1 % | 100.0 % | 100.0 % | 100.0 % | 32 fail |
| vanilla-save-s26 1280x720 | celestial_window, countrydiplomacyview (profile), countryview (profile) | 97.2 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| vanilla-save-s27 1280x720 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s28 1280x720 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s31 1280x720 | countrydiplomacyview (profile), countryview (profile), great_powers | 97.1 % | 82.6 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-save-s32 1280x720 | countrydiplomacyview (profile), countryview (profile) | 96.8 % | 81.4 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s33 1280x720 | countryeconomyview (profile), countryview (profile) | 93.4 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s34 1280x720 | countrytradeview (profile), countryview (profile) | 100.0 % | 98.6 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s35 1280x720 | countrytechnologyview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s36 1280x720 | countryideasview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s37 1280x720 | countrymissionsview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1280x720 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s39 1280x720 | countrystabilityview (profile), countryview (profile) | 97.0 % | 97.7 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s40 1280x720 | countryreligionview (profile), countryview (profile) | 94.9 % | 76.1 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1280x720 | countrymilitaryview (profile), countryview (profile) | 15.9 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1280x720 | countrysubjectview (profile), countryview (profile) | 100.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s44 1280x720 | DefaultConfirm, countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s45 1280x720 | peace_view (profile) | 97.9 % | 87.4 % | 100.0 % | 100.0 % | 100.0 % | 22 fail |
| vanilla-save-s58 1280x720 | DefaultConfirm, countryeconomyview (profile), countryview (profile) | 92.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 25 fail |
| vanilla-save-s59 1280x720 | countrytechnologyview (profile), countryview (profile) | 60.0 % | 91.9 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s60 1280x720 | countryideasview (profile), countryview (profile) | 100.0 % | 97.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s61 1280x720 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s62 1280x720 | DefaultConfirm, countrystabilityview (profile), countryview (profile) | 95.9 % | 97.9 % | 100.0 % | 100.0 % | 100.0 % | 34 fail |
| vanilla-save-s63 1280x720 | countrystabilityview (profile), countryview (profile) | 96.2 % | 99.1 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s64 1280x720 | countryreligionview (profile), countryview (profile) | 97.5 % | 53.2 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s65 1280x720 | countrymilitaryview (profile), countryview (profile), domesticpanel_unit_select | 23.1 % | 93.7 % | 100.0 % | 100.0 % | 100.0 % | 112 fail |
| vanilla-save-s66 1280x720 | ConfirmAndNameLeaderDialog (profile), countrymilitaryview (profile), countryview (profile) | 19.4 % | 95.1 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s67 1280x720 | DefaultConfirm, countrymilitaryview (profile), countryview (profile) | 19.4 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s68 1280x720 | countrymilitaryview (profile), countryview (profile), domesticpanel_naval_doctrine_select (profile) | 15.4 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s69 1280x720 | multi_unitpanel, single_unitpanel (profile) | 100.0 % | 87.4 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s70 1280x720 | countrysubjectview (profile), countryview (profile) | 100.0 % | 92.7 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s75 1280x720 | DefaultConfirm, countryideasview (profile), countryview (profile) | 97.2 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-save-s11 1280x720 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 1280x720 | countryestatesview (profile), countryview (profile) | 86.1 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s74 1280x720 | DefaultConfirm, countryestatesview (profile), countryview (profile) | 86.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | 6 fail |
| vanilla-menu-s0 1280x720 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 70.5 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-menu-s3 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-menu-s4 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.7 % | 72.9 % | 100.0 % | 100.0 % | 100.0 % | 22 fail |
| vanilla-menu-s5 1280x720 | country_selection_panel (profile), goto_box (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.4 % | 72.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-menu-s6 1280x720 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-menu-s7 1280x720 | country_selection_panel (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-menu-s8 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 97.8 % | 77.1 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-menu-s9 1280x720 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.7 % | 92.7 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s1 1920x1080 | countrycourtview (profile), countryview (profile) | 100.0 % | 82.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s2 1920x1080 | hre_window (profile) | 100.0 % | 89.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s3 1920x1080 | parliament_window (profile) | 87.5 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s4 1920x1080 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s5 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 1920x1080 | macro_build_interface (profile) | 100.0 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 1920x1080 | provinceview (profile) | 95.8 % | 65.8 % | 100.0 % | 100.0 % | 100.0 % | 77 fail |
| vanilla-save-s8 1920x1080 | provinceview (profile) | 92.9 % | 72.0 % | 100.0 % | 100.0 % | 100.0 % | 76 fail |
| vanilla-save-s9 1920x1080 | provinceview (profile) | 95.2 % | 67.6 % | 100.0 % | 100.0 % | 100.0 % | 69 fail |
| vanilla-save-s10 1920x1080 | colonisationpanel (profile) | 100.0 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s12 1920x1080 | provinceview (profile) | 93.2 % | 67.6 % | 100.0 % | 100.0 % | 100.0 % | 72 fail |
| vanilla-save-s13 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s14 1920x1080 | countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s15 1920x1080 | ages_view (profile) | 88.8 % | 88.8 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 1920x1080 | waroverview | 90.6 % | 99.1 % | 100.0 % | 100.0 % | 100.0 % | 31 fail |
| vanilla-save-s24 1920x1080 | countrygovernmentview (profile), countryview (profile) | 100.0 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-save-s25 1920x1080 | countrydiplomacyview (profile), countryview (profile), hre_window (profile) | 98.1 % | 74.7 % | 100.0 % | 100.0 % | 100.0 % | 42 fail |
| vanilla-save-s26 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview (profile) | 97.2 % | 85.8 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s27 1920x1080 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s28 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s31 1920x1080 | countrydiplomacyview (profile), countryview (profile), great_powers | 97.1 % | 83.4 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s32 1920x1080 | countrydiplomacyview (profile), countryview (profile) | 96.8 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s33 1920x1080 | countryeconomyview (profile), countryview (profile) | 93.4 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s34 1920x1080 | countrytradeview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s35 1920x1080 | countrytechnologyview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s36 1920x1080 | countryideasview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s37 1920x1080 | countrymissionsview (profile), countryview (profile) | 100.0 % | 97.7 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1920x1080 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s39 1920x1080 | countrystabilityview (profile), countryview (profile) | 97.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-save-s40 1920x1080 | countryreligionview (profile), countryview (profile) | 93.2 % | 77.6 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1920x1080 | countrymilitaryview (profile), countryview (profile) | 15.1 % | 96.2 % | 100.0 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1920x1080 | countrysubjectview (profile), countryview (profile) | 100.0 % | 88.1 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s44 1920x1080 | DefaultConfirm, countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s45 1920x1080 | peace_view (profile) | 97.9 % | 87.4 % | 100.0 % | 100.0 % | 100.0 % | 22 fail |
| vanilla-save-s58 1920x1080 | DefaultConfirm, countryeconomyview (profile), countryview (profile) | 92.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s59 1920x1080 | countrytechnologyview (profile), countryview (profile) | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-save-s60 1920x1080 | countryideasview (profile), countryview (profile) | 100.0 % | 97.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s61 1920x1080 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s62 1920x1080 | DefaultConfirm, countrystabilityview (profile), countryview (profile) | 95.9 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-save-s63 1920x1080 | countrystabilityview (profile), countryview (profile) | 96.2 % | 99.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s64 1920x1080 | countryreligionview (profile), countryview (profile) | 95.1 % | 53.2 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s65 1920x1080 | countrymilitaryview (profile), countryview (profile), domesticpanel_unit_select | 22.4 % | 93.5 % | 100.0 % | 100.0 % | 100.0 % | 114 fail |
| vanilla-save-s66 1920x1080 | ConfirmAndNameLeaderDialog (profile), countrymilitaryview (profile), countryview (profile) | 18.7 % | 95.0 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s67 1920x1080 | DefaultConfirm, countrymilitaryview (profile), countryview (profile) | 18.7 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s68 1920x1080 | countrymilitaryview (profile), countryview (profile), domesticpanel_naval_doctrine_select (profile) | 14.7 % | 96.3 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s69 1920x1080 | multi_unitpanel, single_unitpanel (profile) | 100.0 % | 87.1 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s70 1920x1080 | countrysubjectview (profile), countryview (profile) | 100.0 % | 88.9 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s75 1920x1080 | DefaultConfirm, countryideasview (profile), countryview (profile) | 97.2 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s11 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 1920x1080 | countryestatesview (profile), countryview (profile) | 86.1 % | 97.4 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s74 1920x1080 | DefaultConfirm, countryestatesview (profile), countryview (profile) | 86.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-menu-s0 1920x1080 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 70.5 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-menu-s4 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.7 % | 72.9 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-menu-s5 1920x1080 | country_selection_panel (profile), goto_box (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.4 % | 72.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-menu-s6 1920x1080 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-menu-s7 1920x1080 | country_selection_panel (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-menu-s8 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 97.8 % | 77.1 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-menu-s9 1920x1080 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |

### anbennar-alone

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| anbennar-alone-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.5 % | 73.8 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s1 1280x720 | countrycourtview (profile), countryview (profile) | 100.0 % | 93.6 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s2 1280x720 | hre_window (profile) | 100.0 % | 92.2 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| anbennar-alone-save-s3 1280x720 | celestial_window, tributary_shield | 94.1 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 6 fail |
| anbennar-alone-save-s4 1280x720 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s5 1280x720 | macro_build_interface (profile) | 100.0 % | 61.2 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s6 1280x720 | provinceview (profile) | 95.9 % | 56.3 % | 100.0 % | 100.0 % | 100.0 % | 55 fail |
| anbennar-alone-save-s7 1280x720 | provinceview (profile) | 95.4 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 56 fail |
| anbennar-alone-save-s9 1280x720 | multi_unitpanel, single_unitpanel (profile) | 100.0 % | 85.5 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s10 1280x720 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s11 1280x720 | countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 100.0 % | 64.9 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s12 1280x720 | ages_view (profile) | 87.5 % | 86.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s14 1280x720 | provinceview (profile) | 92.9 % | 67.3 % | 100.0 % | 100.0 % | 100.0 % | 67 fail |
| anbennar-alone-save-s15 1280x720 | colonisationpanel (profile) | 100.0 % | 78.4 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| anbennar-alone-save-s17 1280x720 | countrygovernmentview (profile), countryview (profile) | 100.0 % | 54.4 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s18 1280x720 | countrydiplomacyview (profile), countryview (profile), hre_window (profile) | 98.4 % | 78.0 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| anbennar-alone-save-s19 1280x720 | DefaultConfirm, hre_window (profile) | 97.0 % | 92.6 % | 100.0 % | 100.0 % | 100.0 % | 6 fail |
| anbennar-alone-save-s20 1280x720 | celestial_window, countrydiplomacyview (profile), countryview (profile), tributary_shield | 97.2 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| anbennar-alone-save-s21 1280x720 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| anbennar-alone-save-s25 1280x720 | multi_unitpanel, rebel_supression_panel, single_unitpanel (profile) | 100.0 % | 86.5 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s26 1280x720 | countrydiplomacyview (profile), countryview (profile), great_powers | 98.0 % | 66.5 % | 100.0 % | 100.0 % | 100.0 % | 26 fail |
| anbennar-alone-save-s27 1280x720 | countrydiplomacyview (profile), countryview (profile) | 97.8 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| anbennar-alone-save-s28 1280x720 | countryeconomyview (profile), countryview (profile) | 93.3 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| anbennar-alone-save-s29 1280x720 | countrytradeview (profile), countryview (profile) | 100.0 % | 98.7 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s30 1280x720 | countrytechnologyview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| anbennar-alone-save-s31 1280x720 | countryideasview (profile), countryview (profile) | 100.0 % | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s32 1280x720 | countrymissionsview (profile), countryview (profile) | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s33 1280x720 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 42.8 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s34 1280x720 | countrystabilityview (profile), countryview (profile) | 100.0 % | 97.5 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-save-s35 1280x720 | countryreligionview (profile), countryview (profile) | 98.0 % | 46.8 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s36 1280x720 | countrymilitaryview (profile), countryview (profile) | 15.7 % | 93.1 % | 100.0 % | 100.0 % | 100.0 % | 116 fail |
| anbennar-alone-save-s38 1280x720 | provinceview (profile) | 94.7 % | 69.2 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| anbennar-alone-save-s40 1280x720 | DefaultConfirm, countryeconomyview (profile), countryview (profile) | 92.3 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| anbennar-alone-save-s41 1280x720 | DefaultConfirm, countrytradeview (profile), countryview (profile) | 100.0 % | 98.8 % | 100.0 % | 100.0 % | 100.0 % | 26 fail |
| anbennar-alone-save-s42 1280x720 | countrytechnologyview (profile), countryview (profile) | 58.9 % | 91.9 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-save-s43 1280x720 | countryideasview (profile), countryview (profile) | 100.0 % | 91.3 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| anbennar-alone-save-s44 1280x720 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 98.7 % | 61.0 % | 100.0 % | 100.0 % | 100.0 % | 30 fail |
| anbennar-alone-save-s45 1280x720 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 99.4 % | 62.0 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| anbennar-alone-save-s46 1280x720 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 100.0 % | 61.8 % | 100.0 % | 100.0 % | 100.0 % | 25 fail |
| anbennar-alone-save-s47 1280x720 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 40.7 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| anbennar-alone-save-s48 1280x720 | countryreligionview (profile), countryview (profile) | 97.4 % | 42.4 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| anbennar-alone-save-s49 1280x720 | countrymilitaryview (profile), countryview (profile), domesticpanel_unit_select | 22.7 % | 90.9 % | 100.0 % | 100.0 % | 100.0 % | 111 fail |
| anbennar-alone-save-s51 1280x720 | DefaultConfirm, countrymilitaryview (profile), countryview (profile) | 19.4 % | 93.5 % | 100.0 % | 100.0 % | 100.0 % | 122 fail |
| anbennar-alone-save-s54 1280x720 | DefaultConfirm, multi_unitpanel, single_unitpanel (profile) | 96.8 % | 85.9 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-save-s8 1280x720 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| anbennar-alone-save-s16 1280x720 | topbar (profile) | 97.6 % | 77.6 % | 93.9 % | 100.0 % | 100.0 % | 27 fail |
| anbennar-alone-save-s24 1280x720 | multi_unitpanel, reorg_window (profile) | 100.0 % | 99.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s37 1280x720 | countryestatesview (profile), countryview (profile) | 92.8 % | 89.7 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-save-s53 1280x720 | countryestatesview (profile), countryview (profile), estate_privileges_window | 94.1 % | 91.8 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s0 1280x720 | country_selection_panel (profile) | 96.4 % | 74.3 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 97.6 % | 61.3 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s3 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| anbennar-alone-menu-s4 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.5 % | 66.4 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| anbennar-alone-menu-s5 1280x720 | country_selection_panel (profile), goto_box (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.0 % | 64.9 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| anbennar-alone-menu-s6 1280x720 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.1 % | 64.7 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-menu-s7 1280x720 | country_selection_panel (profile) | 100.0 % | 43.8 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-menu-s8 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 97.4 % | 73.2 % | 100.0 % | 100.0 % | 100.0 % | 33 fail |
| anbennar-alone-menu-s9 1280x720 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.1 % | 64.7 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| anbennar-alone-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.5 % | 73.8 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s1 1920x1080 | countrycourtview (profile), countryview (profile) | 100.0 % | 93.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s2 1920x1080 | hre_window (profile) | 100.0 % | 91.9 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s3 1920x1080 | celestial_window, tributary_shield | 94.1 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 6 fail |
| anbennar-alone-save-s4 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s5 1920x1080 | macro_build_interface (profile) | 100.0 % | 61.2 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s6 1920x1080 | provinceview (profile) | 95.9 % | 56.6 % | 100.0 % | 100.0 % | 100.0 % | 55 fail |
| anbennar-alone-save-s7 1920x1080 | provinceview (profile) | 95.4 % | 63.1 % | 100.0 % | 100.0 % | 100.0 % | 56 fail |
| anbennar-alone-save-s9 1920x1080 | multi_unitpanel, single_unitpanel (profile) | 100.0 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s10 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s11 1920x1080 | countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 100.0 % | 68.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| anbennar-alone-save-s12 1920x1080 | ages_view (profile) | 87.5 % | 86.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s14 1920x1080 | provinceview (profile) | 93.0 % | 67.6 % | 100.0 % | 100.0 % | 100.0 % | 67 fail |
| anbennar-alone-save-s15 1920x1080 | colonisationpanel (profile) | 100.0 % | 78.4 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| anbennar-alone-save-s17 1920x1080 | countrygovernmentview (profile), countryview (profile) | 100.0 % | 52.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s18 1920x1080 | countrydiplomacyview (profile), countryview (profile), hre_window (profile) | 98.4 % | 77.5 % | 100.0 % | 100.0 % | 100.0 % | 47 fail |
| anbennar-alone-save-s19 1920x1080 | DefaultConfirm, hre_window (profile) | 97.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s20 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview (profile), tributary_shield | 97.2 % | 72.1 % | 100.0 % | 100.0 % | 100.0 % | 47 fail |
| anbennar-alone-save-s21 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| anbennar-alone-save-s25 1920x1080 | multi_unitpanel, rebel_supression_panel, single_unitpanel (profile) | 100.0 % | 86.2 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s26 1920x1080 | countrydiplomacyview (profile), countryview (profile), great_powers | 98.0 % | 66.3 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s27 1920x1080 | countrydiplomacyview (profile), countryview (profile) | 97.8 % | 62.0 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s28 1920x1080 | countryeconomyview (profile), countryview (profile) | 93.3 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s29 1920x1080 | countrytradeview (profile), countryview (profile) | 100.0 % | 98.7 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| anbennar-alone-save-s30 1920x1080 | countrytechnologyview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-save-s31 1920x1080 | countryideasview (profile), countryview (profile) | 100.0 % | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s32 1920x1080 | countrymissionsview (profile), countryview (profile) | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s33 1920x1080 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 38.4 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s34 1920x1080 | countrystabilityview (profile), countryview (profile) | 100.0 % | 97.5 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s35 1920x1080 | countryreligionview (profile), countryview (profile) | 96.0 % | 46.8 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s36 1920x1080 | countrymilitaryview (profile), countryview (profile) | 14.9 % | 93.1 % | 100.0 % | 100.0 % | 100.0 % | 116 fail |
| anbennar-alone-save-s38 1920x1080 | provinceview (profile) | 95.6 % | 69.6 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s40 1920x1080 | DefaultConfirm, countryeconomyview (profile), countryview (profile) | 92.3 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s41 1920x1080 | DefaultConfirm, countrytradeview (profile), countryview (profile) | 100.0 % | 98.8 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s42 1920x1080 | countrytechnologyview (profile), countryview (profile) | 58.9 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s43 1920x1080 | countryideasview (profile), countryview (profile) | 100.0 % | 90.6 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| anbennar-alone-save-s44 1920x1080 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 98.7 % | 58.5 % | 100.0 % | 100.0 % | 100.0 % | 37 fail |
| anbennar-alone-save-s45 1920x1080 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 99.4 % | 59.7 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| anbennar-alone-save-s46 1920x1080 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 100.0 % | 59.3 % | 100.0 % | 100.0 % | 100.0 % | 33 fail |
| anbennar-alone-save-s47 1920x1080 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 36.3 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| anbennar-alone-save-s48 1920x1080 | countryreligionview (profile), countryview (profile) | 94.8 % | 42.4 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s49 1920x1080 | countrymilitaryview (profile), countryview (profile), domesticpanel_unit_select | 22.0 % | 90.9 % | 100.0 % | 100.0 % | 100.0 % | 112 fail |
| anbennar-alone-save-s51 1920x1080 | DefaultConfirm, countrymilitaryview (profile), countryview (profile) | 18.6 % | 93.5 % | 100.0 % | 100.0 % | 100.0 % | 120 fail |
| anbennar-alone-save-s54 1920x1080 | DefaultConfirm, multi_unitpanel, single_unitpanel (profile) | 96.8 % | 85.6 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s8 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| anbennar-alone-save-s16 1920x1080 | topbar (profile) | 97.6 % | 79.9 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| anbennar-alone-save-s24 1920x1080 | multi_unitpanel, reorg_window (profile) | 100.0 % | 99.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s37 1920x1080 | countryestatesview (profile), countryview (profile) | 92.8 % | 88.6 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s53 1920x1080 | countryestatesview (profile), countryview (profile), estate_privileges_window | 94.1 % | 91.0 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-save-s55 1920x1080 | DefaultConfirm, multi_unitpanel, reorg_window (profile) | 97.9 % | 99.7 % | 100.0 % | 100.0 % | 100.0 % | 22 fail |
| anbennar-alone-menu-s0 1920x1080 | country_selection_panel (profile) | 96.4 % | 74.3 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 97.6 % | 61.3 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| anbennar-alone-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| anbennar-alone-menu-s4 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.5 % | 66.4 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| anbennar-alone-menu-s5 1920x1080 | country_selection_panel (profile), goto_box (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.0 % | 64.9 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| anbennar-alone-menu-s6 1920x1080 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.1 % | 64.7 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-menu-s7 1920x1080 | country_selection_panel (profile) | 100.0 % | 43.8 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-menu-s8 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 97.4 % | 73.2 % | 100.0 % | 100.0 % | 100.0 % | 34 fail |
| anbennar-alone-menu-s9 1920x1080 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.1 % | 64.7 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |

### bigger-ui

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.7 % | 92.9 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s1 1280x720 | countrycourtview (profile), countryview (profile) | 100.0 % | 82.1 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s2 1280x720 | hre_window (profile) | 100.0 % | 89.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s3 1280x720 | parliament_window (profile) | 83.3 % | 97.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s4 1280x720 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s5 1280x720 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 1280x720 | macro_build_interface (profile) | 100.0 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 1280x720 | provinceview (profile) | 94.9 % | 65.4 % | 100.0 % | 100.0 % | 100.0 % | 78 fail |
| vanilla-save-s8 1280x720 | provinceview (profile) | 92.0 % | 71.7 % | 100.0 % | 100.0 % | 100.0 % | 77 fail |
| vanilla-save-s9 1280x720 | provinceview (profile) | 94.2 % | 67.2 % | 100.0 % | 100.0 % | 100.0 % | 69 fail |
| vanilla-save-s10 1280x720 | colonisationpanel (profile) | 100.0 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s12 1280x720 | provinceview (profile) | 92.3 % | 67.2 % | 100.0 % | 100.0 % | 100.0 % | 73 fail |
| vanilla-save-s13 1280x720 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s14 1280x720 | countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s15 1280x720 | ages_view (profile) | 88.8 % | 88.8 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 1280x720 | waroverview | 90.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 27 fail |
| vanilla-save-s24 1280x720 | countrygovernmentview (profile), countryview (profile) | 100.0 % | 93.4 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s25 1280x720 | countrydiplomacyview (profile), countryview (profile), hre_window (profile) | 98.1 % | 75.1 % | 100.0 % | 100.0 % | 100.0 % | 32 fail |
| vanilla-save-s26 1280x720 | celestial_window, countrydiplomacyview (profile), countryview (profile) | 97.2 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| vanilla-save-s27 1280x720 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s28 1280x720 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s31 1280x720 | countrydiplomacyview (profile), countryview (profile), great_powers | 97.1 % | 82.6 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-save-s32 1280x720 | countrydiplomacyview (profile), countryview (profile) | 96.8 % | 81.4 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s33 1280x720 | countryeconomyview (profile), countryview (profile) | 93.4 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s34 1280x720 | countrytradeview (profile), countryview (profile) | 100.0 % | 98.6 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s35 1280x720 | countrytechnologyview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s36 1280x720 | countryideasview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s37 1280x720 | countrymissionsview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1280x720 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s39 1280x720 | countrystabilityview (profile), countryview (profile) | 97.0 % | 97.7 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s40 1280x720 | countryreligionview (profile), countryview (profile) | 94.9 % | 76.1 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1280x720 | countrymilitaryview (profile), countryview (profile) | 15.9 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1280x720 | countrysubjectview (profile), countryview (profile) | 100.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s44 1280x720 | DefaultConfirm, countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s45 1280x720 | peace_view (profile) | 97.2 % | 92.2 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s58 1280x720 | DefaultConfirm, countryeconomyview (profile), countryview (profile) | 92.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 25 fail |
| vanilla-save-s59 1280x720 | countrytechnologyview (profile), countryview (profile) | 60.0 % | 91.9 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s60 1280x720 | countryideasview (profile), countryview (profile) | 100.0 % | 97.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s61 1280x720 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s62 1280x720 | DefaultConfirm, countrystabilityview (profile), countryview (profile) | 95.9 % | 97.9 % | 100.0 % | 100.0 % | 100.0 % | 34 fail |
| vanilla-save-s63 1280x720 | countrystabilityview (profile), countryview (profile) | 96.2 % | 99.1 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s64 1280x720 | countryreligionview (profile), countryview (profile) | 97.5 % | 53.2 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s65 1280x720 | countrymilitaryview (profile), countryview (profile), domesticpanel_unit_select | 22.6 % | 93.7 % | 100.0 % | 100.0 % | 100.0 % | 112 fail |
| vanilla-save-s66 1280x720 | ConfirmAndNameLeaderDialog (profile), countrymilitaryview (profile), countryview (profile) | 19.4 % | 95.1 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s67 1280x720 | DefaultConfirm, countrymilitaryview (profile), countryview (profile) | 19.4 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s68 1280x720 | countrymilitaryview (profile), countryview (profile), domesticpanel_naval_doctrine_select (profile) | 15.4 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s69 1280x720 | multi_unitpanel, single_unitpanel (profile) | 100.0 % | 87.4 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s70 1280x720 | countrysubjectview (profile), countryview (profile) | 100.0 % | 92.7 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s75 1280x720 | DefaultConfirm, countryideasview (profile), countryview (profile) | 97.2 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-save-s11 1280x720 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 1280x720 | countryestatesview (profile), countryview (profile) | 86.1 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s74 1280x720 | DefaultConfirm, countryestatesview (profile), countryview (profile) | 86.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | 6 fail |
| vanilla-menu-s0 1280x720 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 70.5 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-menu-s3 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-menu-s4 1280x720 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.7 % | 72.9 % | 100.0 % | 100.0 % | 100.0 % | 22 fail |
| vanilla-menu-s5 1280x720 | country_selection_panel (profile), goto_box (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.4 % | 72.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-menu-s6 1280x720 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-menu-s7 1280x720 | country_selection_panel (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-menu-s8 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 97.8 % | 77.1 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-menu-s9 1280x720 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 93.7 % | 92.7 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s1 1920x1080 | countrycourtview (profile), countryview (profile) | 100.0 % | 82.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s2 1920x1080 | hre_window (profile) | 100.0 % | 89.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s3 1920x1080 | parliament_window (profile) | 87.5 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s4 1920x1080 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s5 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 1920x1080 | macro_build_interface (profile) | 100.0 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 1920x1080 | provinceview (profile) | 95.8 % | 65.8 % | 100.0 % | 100.0 % | 100.0 % | 77 fail |
| vanilla-save-s8 1920x1080 | provinceview (profile) | 92.9 % | 72.0 % | 100.0 % | 100.0 % | 100.0 % | 76 fail |
| vanilla-save-s9 1920x1080 | provinceview (profile) | 95.2 % | 67.6 % | 100.0 % | 100.0 % | 100.0 % | 69 fail |
| vanilla-save-s10 1920x1080 | colonisationpanel (profile) | 100.0 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s12 1920x1080 | provinceview (profile) | 93.2 % | 67.6 % | 100.0 % | 100.0 % | 100.0 % | 72 fail |
| vanilla-save-s13 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s14 1920x1080 | countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s15 1920x1080 | ages_view (profile) | 88.8 % | 88.8 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 1920x1080 | waroverview | 90.6 % | 99.2 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| vanilla-save-s24 1920x1080 | countrygovernmentview (profile), countryview (profile) | 100.0 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-save-s25 1920x1080 | countrydiplomacyview (profile), countryview (profile), hre_window (profile) | 98.1 % | 74.7 % | 100.0 % | 100.0 % | 100.0 % | 42 fail |
| vanilla-save-s26 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview (profile) | 97.2 % | 85.8 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s27 1920x1080 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s28 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s31 1920x1080 | countrydiplomacyview (profile), countryview (profile), great_powers | 97.1 % | 83.4 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s32 1920x1080 | countrydiplomacyview (profile), countryview (profile) | 96.8 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s33 1920x1080 | countryeconomyview (profile), countryview (profile) | 93.4 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s34 1920x1080 | countrytradeview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s35 1920x1080 | countrytechnologyview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s36 1920x1080 | countryideasview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s37 1920x1080 | countrymissionsview (profile), countryview (profile) | 100.0 % | 97.7 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1920x1080 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s39 1920x1080 | countrystabilityview (profile), countryview (profile) | 97.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-save-s40 1920x1080 | countryreligionview (profile), countryview (profile) | 93.2 % | 77.6 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1920x1080 | countrymilitaryview (profile), countryview (profile) | 15.1 % | 96.2 % | 100.0 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1920x1080 | countrysubjectview (profile), countryview (profile) | 100.0 % | 88.1 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s44 1920x1080 | DefaultConfirm, countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s45 1920x1080 | peace_view (profile) | 97.9 % | 92.1 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s58 1920x1080 | DefaultConfirm, countryeconomyview (profile), countryview (profile) | 92.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s59 1920x1080 | countrytechnologyview (profile), countryview (profile) | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-save-s60 1920x1080 | countryideasview (profile), countryview (profile) | 100.0 % | 97.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s61 1920x1080 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-save-s62 1920x1080 | DefaultConfirm, countrystabilityview (profile), countryview (profile) | 95.9 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-save-s63 1920x1080 | countrystabilityview (profile), countryview (profile) | 96.2 % | 99.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s64 1920x1080 | countryreligionview (profile), countryview (profile) | 95.1 % | 53.2 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s65 1920x1080 | countrymilitaryview (profile), countryview (profile), domesticpanel_unit_select | 22.4 % | 93.5 % | 100.0 % | 100.0 % | 100.0 % | 113 fail |
| vanilla-save-s66 1920x1080 | ConfirmAndNameLeaderDialog (profile), countrymilitaryview (profile), countryview (profile) | 18.7 % | 95.0 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s67 1920x1080 | DefaultConfirm, countrymilitaryview (profile), countryview (profile) | 18.7 % | 96.4 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s68 1920x1080 | countrymilitaryview (profile), countryview (profile), domesticpanel_naval_doctrine_select (profile) | 14.7 % | 96.3 % | 100.0 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s69 1920x1080 | multi_unitpanel, single_unitpanel (profile) | 100.0 % | 87.1 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s70 1920x1080 | countrysubjectview (profile), countryview (profile) | 100.0 % | 88.9 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s75 1920x1080 | DefaultConfirm, countryideasview (profile), countryview (profile) | 97.2 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s11 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 1920x1080 | countryestatesview (profile), countryview (profile) | 86.1 % | 97.4 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s74 1920x1080 | DefaultConfirm, countryestatesview (profile), countryview (profile) | 86.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-menu-s0 1920x1080 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 70.5 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-menu-s4 1920x1080 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.7 % | 72.9 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-menu-s5 1920x1080 | country_selection_panel (profile), goto_box (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.4 % | 72.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-menu-s6 1920x1080 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-menu-s7 1920x1080 | country_selection_panel (profile) | 100.0 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-menu-s8 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 97.8 % | 77.1 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-menu-s9 1920x1080 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |

### proper-2k-ui-enhanced

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla-save-s0 2560x1440 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 92.9 % | 92.5 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| vanilla-save-s1 2560x1440 | countrycourtview (profile), countryview (profile) | 100.0 % | 81.7 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s2 2560x1440 | hre_window (profile) | 100.0 % | 92.1 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s3 2560x1440 | parliament_window (profile) | 87.5 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s4 2560x1440 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s5 2560x1440 | ledger (profile) | 100.0 % | 70.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 2560x1440 | macro_build_interface (profile) | 100.0 % | 63.4 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 2560x1440 | provinceview (profile) | 95.8 % | 65.7 % | 100.0 % | 100.0 % | 100.0 % | 79 fail |
| vanilla-save-s8 2560x1440 | provinceview (profile) | 92.1 % | 71.9 % | 100.0 % | 100.0 % | 100.0 % | 77 fail |
| vanilla-save-s9 2560x1440 | provinceview (profile) | 94.3 % | 67.5 % | 100.0 % | 100.0 % | 100.0 % | 70 fail |
| vanilla-save-s10 2560x1440 | colonisationpanel (profile) | 100.0 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s12 2560x1440 | provinceview (profile) | 93.3 % | 67.5 % | 100.0 % | 100.0 % | 100.0 % | 73 fail |
| vanilla-save-s13 2560x1440 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s14 2560x1440 | countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 98.3 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s15 2560x1440 | ages_view (profile) | 89.4 % | 89.3 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 2560x1440 | waroverview | 86.6 % | 99.2 % | 100.0 % | 100.0 % | 100.0 % | 27 fail |
| vanilla-save-s24 2560x1440 | countrygovernmentview (profile), countryview (profile) | 100.0 % | 93.9 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s25 2560x1440 | countrydiplomacyview (profile), countryview (profile), hre_window (profile) | 97.7 % | 77.8 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| vanilla-save-s26 2560x1440 | celestial_window, countrydiplomacyview (profile), countryview (profile) | 93.6 % | 85.9 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s27 2560x1440 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s28 2560x1440 | ledger (profile) | 100.0 % | 43.5 % | 59.2 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s31 2560x1440 | countrydiplomacyview (profile), countryview (profile), great_powers | 93.3 % | 83.3 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s32 2560x1440 | countrydiplomacyview (profile), countryview (profile) | 92.5 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 38 fail |
| vanilla-save-s33 2560x1440 | countryeconomyview (profile), countryview (profile) | 95.6 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s34 2560x1440 | countrytradeview (profile), countryview (profile) | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s35 2560x1440 | countrytechnologyview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s36 2560x1440 | countryideasview (profile), countryview (profile) | 90.0 % | 98.5 % | 90.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s37 2560x1440 | countrymissionsview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 2560x1440 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s39 2560x1440 | countrystabilityview (profile), countryview (profile) | 97.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-save-s40 2560x1440 | countryreligionview (profile), countryview (profile) | 94.9 % | 77.6 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-save-s41 2560x1440 | countrymilitaryview (profile), countryview (profile) | 13.6 % | 96.5 % | 100.0 % | 100.0 % | 100.0 % | 135 fail |
| vanilla-save-s42 2560x1440 | countrysubjectview (profile), countryview (profile) | 100.0 % | 88.1 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s44 2560x1440 | DefaultConfirm, countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 97.0 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s45 2560x1440 | peace_view (profile) | 97.9 % | 92.0 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s58 2560x1440 | DefaultConfirm, countryeconomyview (profile), countryview (profile) | 94.3 % | 98.4 % | 98.1 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s59 2560x1440 | countrytechnologyview (profile), countryview (profile) | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s60 2560x1440 | countryideasview (profile), countryview (profile) | 83.3 % | 97.4 % | 83.3 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s62 2560x1440 | DefaultConfirm, countrystabilityview (profile), countryview (profile) | 95.9 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 20 fail |
| vanilla-save-s63 2560x1440 | countrystabilityview (profile), countryview (profile) | 96.2 % | 99.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s64 2560x1440 | countryreligionview (profile), countryview (profile) | 97.5 % | 53.2 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s65 2560x1440 | countrymilitaryview (profile), countryview (profile), domesticpanel_unit_select | 20.3 % | 93.9 % | 100.0 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s66 2560x1440 | ConfirmAndNameLeaderDialog (profile), countrymilitaryview (profile), countryview (profile) | 16.9 % | 95.3 % | 100.0 % | 100.0 % | 100.0 % | 139 fail |
| vanilla-save-s67 2560x1440 | DefaultConfirm, countrymilitaryview (profile), countryview (profile) | 16.9 % | 96.6 % | 100.0 % | 100.0 % | 100.0 % | 139 fail |
| vanilla-save-s68 2560x1440 | countrymilitaryview (profile), countryview (profile), domesticpanel_naval_doctrine_select (profile) | 13.3 % | 96.6 % | 100.0 % | 100.0 % | 100.0 % | 139 fail |
| vanilla-save-s69 2560x1440 | multi_unitpanel, single_unitpanel (profile) | 96.7 % | 91.6 % | 96.7 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s70 2560x1440 | countrysubjectview (profile), countryview (profile) | 100.0 % | 88.9 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s75 2560x1440 | DefaultConfirm, countryideasview (profile), countryview (profile) | 89.1 % | 98.5 % | 91.8 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s11 2560x1440 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 2560x1440 | countryestatesview (profile), countryview (profile) | 86.1 % | 97.4 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s74 2560x1440 | DefaultConfirm, countryestatesview (profile), countryview (profile) | 86.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-menu-s0 2560x1440 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 2560x1440 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.2 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-menu-s2 2560x1440 | CreditsWindow, country_selection_panel (profile) | 83.3 % | 33.3 % | 83.3 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-menu-s3 2560x1440 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 63.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| vanilla-menu-s4 2560x1440 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.8 % | 71.9 % | 100.0 % | 100.0 % | 100.0 % | 24 fail |
| vanilla-menu-s5 2560x1440 | country_selection_panel (profile), goto_box (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.4 % | 71.3 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-menu-s6 2560x1440 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 70.9 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-menu-s7 2560x1440 | country_selection_panel (profile) | 95.4 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s8 2560x1440 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 90.4 % | 76.2 % | 92.5 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-menu-s9 2560x1440 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 98.5 % | 70.9 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |

### anbennar

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| anbennar-alone-save-s0 2560x1440 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel (profile), outliner, speed_controls, topbar (profile) | 87.6 % | 74.4 % | 100.0 % | 100.0 % | 100.0 % | 42 fail |
| anbennar-alone-save-s1 2560x1440 | countrycourtview (profile), countryview (profile) | 100.0 % | 93.4 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s2 2560x1440 | hre_window (profile) | 100.0 % | 91.9 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s3 2560x1440 | celestial_window, tributary_shield | 94.1 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 6 fail |
| anbennar-alone-save-s4 2560x1440 | ledger (profile) | 100.0 % | 70.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s5 2560x1440 | macro_build_interface (profile) | 100.0 % | 62.0 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-save-s6 2560x1440 | provinceview (profile) | 95.9 % | 63.4 % | 100.0 % | 100.0 % | 100.0 % | 57 fail |
| anbennar-alone-save-s7 2560x1440 | provinceview (profile) | 94.5 % | 63.3 % | 100.0 % | 100.0 % | 100.0 % | 58 fail |
| anbennar-alone-save-s9 2560x1440 | multi_unitpanel, single_unitpanel (profile) | 96.0 % | 90.8 % | 96.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s10 2560x1440 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| anbennar-alone-save-s11 2560x1440 | countrygovernmentview (profile), countryview (profile), gov_view_reform_select | 100.0 % | 70.8 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s12 2560x1440 | ages_view (profile) | 88.2 % | 86.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s14 2560x1440 | provinceview (profile) | 91.3 % | 67.9 % | 99.2 % | 100.0 % | 100.0 % | 68 fail |
| anbennar-alone-save-s15 2560x1440 | colonisationpanel (profile) | 100.0 % | 78.4 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| anbennar-alone-save-s17 2560x1440 | countrygovernmentview (profile), countryview (profile) | 100.0 % | 51.6 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| anbennar-alone-save-s18 2560x1440 | countrydiplomacyview (profile), countryview (profile), hre_window (profile) | 97.6 % | 77.5 % | 100.0 % | 100.0 % | 100.0 % | 47 fail |
| anbennar-alone-save-s19 2560x1440 | DefaultConfirm, hre_window (profile) | 97.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| anbennar-alone-save-s20 2560x1440 | celestial_window, countrydiplomacyview (profile), countryview (profile), tributary_shield | 96.3 % | 72.8 % | 100.0 % | 100.0 % | 100.0 % | 46 fail |
| anbennar-alone-save-s21 2560x1440 | ledger (profile) | 100.0 % | 43.5 % | 59.2 % | 100.0 % | 100.0 % | 14 fail |
| anbennar-alone-save-s25 2560x1440 | multi_unitpanel, rebel_supression_panel, single_unitpanel (profile) | 96.9 % | 91.4 % | 96.9 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s26 2560x1440 | countrydiplomacyview (profile), countryview (profile), great_powers | 97.1 % | 66.3 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s27 2560x1440 | countrydiplomacyview (profile), countryview (profile) | 96.7 % | 62.0 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| anbennar-alone-save-s28 2560x1440 | countryeconomyview (profile), countryview (profile) | 95.5 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s29 2560x1440 | countrytradeview (profile), countryview (profile) | 100.0 % | 98.7 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| anbennar-alone-save-s30 2560x1440 | countrytechnologyview (profile), countryview (profile) | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-save-s31 2560x1440 | countryideasview (profile), countryview (profile) | 100.0 % | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s32 2560x1440 | countrymissionsview (profile), countryview (profile) | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s33 2560x1440 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 38.4 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| anbennar-alone-save-s34 2560x1440 | countrystabilityview (profile), countryview (profile) | 98.4 % | 97.5 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s35 2560x1440 | countryreligionview (profile), countryview (profile) | 98.0 % | 46.8 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s36 2560x1440 | countrymilitaryview (profile), countryview (profile) | 13.4 % | 93.7 % | 100.0 % | 100.0 % | 100.0 % | 130 fail |
| anbennar-alone-save-s38 2560x1440 | provinceview (profile) | 94.0 % | 69.5 % | 99.1 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-save-s40 2560x1440 | DefaultConfirm, countryeconomyview (profile), countryview (profile) | 94.2 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s41 2560x1440 | DefaultConfirm, countrytradeview (profile), countryview (profile) | 100.0 % | 98.8 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s42 2560x1440 | countrytechnologyview (profile), countryview (profile) | 58.9 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-save-s43 2560x1440 | countryideasview (profile), countryview (profile) | 100.0 % | 90.6 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| anbennar-alone-save-s44 2560x1440 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 98.7 % | 58.9 % | 100.0 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s45 2560x1440 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 99.4 % | 60.0 % | 100.0 % | 100.0 % | 100.0 % | 32 fail |
| anbennar-alone-save-s46 2560x1440 | countrydecisionsview (profile), countryview (profile), topbar (profile) | 99.3 % | 59.8 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| anbennar-alone-save-s47 2560x1440 | countrydecisionsview (profile), countryview (profile) | 100.0 % | 36.3 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| anbennar-alone-save-s48 2560x1440 | countryreligionview (profile), countryview (profile) | 97.4 % | 39.6 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s49 2560x1440 | countrymilitaryview (profile), countryview (profile), domesticpanel_unit_select | 20.0 % | 91.3 % | 100.0 % | 100.0 % | 100.0 % | 126 fail |
| anbennar-alone-save-s51 2560x1440 | DefaultConfirm, countrymilitaryview (profile), countryview (profile) | 16.8 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 134 fail |
| anbennar-alone-save-s54 2560x1440 | DefaultConfirm, multi_unitpanel, single_unitpanel (profile) | 93.7 % | 91.0 % | 96.8 % | 100.0 % | 100.0 % | 20 fail |
| anbennar-alone-save-s8 2560x1440 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| anbennar-alone-save-s24 2560x1440 | multi_unitpanel, reorg_window (profile) | 100.0 % | 99.7 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s37 2560x1440 | countryestatesview (profile), countryview (profile) | 92.8 % | 88.6 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s53 2560x1440 | countryestatesview (profile), countryview (profile), estate_privileges_window | 93.7 % | 90.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-save-s55 2560x1440 | DefaultConfirm, multi_unitpanel, reorg_window (profile) | 98.0 % | 99.7 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-menu-s0 2560x1440 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s1 2560x1440 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 97.6 % | 61.3 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| anbennar-alone-menu-s2 2560x1440 | CreditsWindow, country_selection_panel (profile) | 83.3 % | 33.3 % | 83.3 % | 100.0 % | 100.0 % | 3 fail |
| anbennar-alone-menu-s3 2560x1440 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile) | 100.0 % | 63.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| anbennar-alone-menu-s4 2560x1440 | country_selection_panel (profile), menu_settings (profile), menu_settings (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.5 % | 66.6 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| anbennar-alone-menu-s5 2560x1440 | country_selection_panel (profile), goto_box (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.0 % | 64.9 % | 100.0 % | 100.0 % | 100.0 % | 14 fail |
| anbennar-alone-menu-s6 2560x1440 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.1 % | 64.7 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-menu-s7 2560x1440 | country_selection_panel (profile) | 95.4 % | 42.1 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-menu-s8 2560x1440 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 97.5 % | 73.2 % | 100.0 % | 100.0 % | 100.0 % | 37 fail |
| anbennar-alone-menu-s9 2560x1440 | country_selection_panel (profile), option_window (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 98.1 % | 64.7 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |

