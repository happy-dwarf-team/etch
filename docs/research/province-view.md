# What decides the province view's views and fills its widgets

Research for [etch#155](https://github.com/happy-dwarf-team/etch/issues/155), a
ticket of the map [etch#151](https://github.com/happy-dwarf-team/etch/issues/151).
Game: Europa Universalis IV 1.37.5, Steam, win64 (`eu4_rev.txt` `835bfdf8…`,
`eu4.exe` SHA-256 `9ad3efe1…d771a`). Mods as pinned in `corpus/manifest.json`:
Proper 2K UI Enhanced (Workshop 3290499798, `B411CFAE…`), P2KE Patch - Anbennar
(3777997797, `E4ABCD62…`), Anbennar (1385440355, `99DAB21E…`). Date: 2026-10-26.

Terms as in [GLOSSARY.md](../../GLOSSARY.md) and the map: a **view** is one
situation of a window as the game shows it; a **window profile** is what Etch
knows about a game window beyond its files.

## Answer in brief

- `provinceview` is one window that the game's code fills and switches. Vanilla
  and Proper 2K UI Enhanced nest 25 windows in it. P2KE Patch - Anbennar, the
  file the Anbennar playset uses, nests 50, among them 24 Anbennar `aPUI_*`
  windows (the map's figure of 37 was not reproduced). The engine decides its
  views with five selectors:
  1. **Screen height.** At a client height of 813 px or less, the game hides
     the large backgrounds and `province_terrain`. It moves four widgets to
     `*_lowres_*` `positionType`s and creates `select_building` and
     `natives_buildings_window`. Above 813 px it creates the `_large`
     variants instead. Both variants are in the `.gui` file, but only one
     exists in the game's widget tree.
  2. **Own or foreign province.** When the province's owner is the player's
     country, the game shows `provinceview_bg*` and `province_banner`. When it
     is not, it shows `provinceview_foreign_bg*` and `province_banner_foreign`,
     and inside `province_window` it hides `queue_window` and shows
     `foreign_province_window`.
  3. **Tab.** The province tab shows `province_window` and the side panels.
     The state tab shows `state_window` and closes the side panels. The game
     remembers the tab between provinces.
  4. **Side panel and click-opened sub-panels.** `buildings_window`,
     `institutions_window` and `history_window`, plus eight sub-panels of
     `province_window` (build army or navy, change culture and others), open
     on clicks. The player decides these.
  5. **Province data.** The great-projects list shows only when the province
     has a great project. The owner decides between native and normal
     buildings. An uncolonised province opens the separate
     `colonisationpanel` window (`colonisationpanel.gui`) instead of
     `province_window`.
- Anbennar adds views only through **scripted GUI**: `custom_window` blocks in
  `common/custom_gui/*.txt`, whose `potential` triggers (ROOT = the clicked
  province, FROM = the player) decide when they show. The province button bar
  depends on the country flag `province_button_UI_opened`. Each `aPUI_*` window
  shows when the player has the country flag `aPUI_<name>_flag` and the
  province passes `has_eligible_aPUI_<name>_in_province`. The windows exclude
  one another, because opening one clears the others' flags.
- Every value text, icon frame and list in the window is code-filled. The
  save holds the raw province and country data (owner, cores, culture,
  religion, base development, buildings, modifiers, flags, variables). The
  engine computes the derived values (income, supply, unrest, trade value,
  modifier totals). Etch can read statically the `.gui` and `.gfx` files, the
  localisation keys, the scripted-GUI triggers, and the resolution rule.
  Values that need the engine's computation come only from the live game.
  Under the map's no-emulator rule they stay out of scope.

## Evidence labels

- **[F]** read in the game's or mods' files (file and line of the widget's
  `name`);
- **[C]** seen in a corpus capture (Tongs widget tree,
  `corpus/captures/<playset>/<WxH>/province.json`; the own province Macedonia
  in the Russia 1719 save);
- **[S]** seen statically in `eu4.exe`: a string reference or a decompiled
  function, given as an RVA (image base `0x140000000`). Decompiled pseudo-C stays
  in the lab under `work/ghidra/decomp-provinceview/` and is not copied here;
- **[W]** stated by the game's or a mod's own modding notes
  (`common/custom_gui/example.txt`, Anbennar `common/custom_gui/00_readme.txt`);
- **[H]** hypothesis, needs a live check.

## Method

- **Files** (read only): `interface/provinceview.gui` and `.gfx` of the game,
  Proper 2K UI Enhanced, P2KE Patch - Anbennar and Anbennar. Also
  `interface/colonisationpanel.gui`, Anbennar's `common/custom_gui/`,
  `common/scripted_triggers/anb_scripted_triggers_for_province_ui.txt`,
  `common/scripted_effects/anb_scripted_effects_for_province_ui.txt` and
  localisation, and the patch's `common/custom_gui/p2kuie_amb.txt`. A
  throwaway Clausewitz tokenizer printed the window trees, the `scripted = yes`
  widgets and the `custom_*` blocks, and matched them by name.
- **Captures**: the 12 province captures in this repository, vanilla and
  Proper 2K UI Enhanced at six resolutions. All show the player's own
  province. The local corpora `work/etch44-corpus` and `work/etch55-corpus`
  have no Anbennar province capture or foreign-province capture.
- **Executable**: the lab's Ghidra project of `eu4.exe` 1.37.5 (unchanged
  hash). String cross-references gave the province-view functions, and the
  functions in RVA `0x1340000`–`0x13A0000`, plus a few outside it, were
  decompiled. No game was started.
- **Saves**: the two corpus saves' `gamestate` (both plain text in a zip). I
  counted their province keys. The saves were read, not changed.

## The window and its parts

Top level of `guiTypes` in all four files: 35 blocks. These are the
`provinceview` window, five estate state views, and about 29 templates that
the code instantiates as list entries **[F]**. The nested windows of
`provinceview` (line of the `name`):

| Nested window | Parent | vanilla | P2KE | Patch | Anbennar |
| --- | --- | ---: | ---: | ---: | ---: |
| `provinceview` | — | 284 | 284 | 328 | 327 |
| `top_section_window` | provinceview | 375 | 370 | 414 | 418 |
| `province_window` | provinceview | 561 | 564 | 608 | 604 |
| `queue_window`, `progress_bar_window` | province_window | 1132, 1239 | 1144, 1251 | 1309, 1416 | 1298, 1405 |
| `allied_objectives_list`, `change_culture_view`, `build_army_view`, `build_navy_view` | province_window | 1605–1968 | 1622–2019 | 1787–2184 | 1771–2134 |
| `foreign_province_window` | province_window | 2068 | 2120 | 2285 | 2234 |
| `client_state_selection`, `transfer_occupation_window`, `tradegoods_province_window` | province_window | 2243–2367 | 2295–2419 | 2460–2584 | 2409–2533 |
| `province_button_window_closed` (Anbennar) | province_window | — | — | 2781 | 2728 |
| `state_window` | provinceview | 2557 | 2610 | 3078 | 3020 |
| `buildings_window` | provinceview | 2845 | 2904 | 3372 | 3302 |
| `great_projects_window`, `general_buildings_window`, `province_values_window` | buildings_window | 2858–2945 | 2917–3013 | 3387–3483 | 3590–3946 |
| `select_building` / `select_building_large` | buildings_window | 3206 / 3267 | 3277 / 3339 | 3747 / 3809 | 4207 / 4268 |
| `natives_buildings_window` / `_large` (each with its own `province_values_window`) | buildings_window | 3325 / 3550 | 3399 / 3624 | 3869 / 4094 | 4326 / 4551 |
| `province_button_window_no_monument`, `…_with_monument` (Anbennar) | buildings_window | — | — | — | 3316, 3603 |
| `aPUI_parent_container` and 23 `aPUI_*` windows | buildings_window | — | — | 4325–6362 | 4777–… |
| `institutions_window` | provinceview | 3778 | 3856 | 6407 | — |
| `history_window` | provinceview | 3853 | 3931 | 6482 | — |

- Proper 2K UI Enhanced keeps vanilla's structure and names. It adds six
  widgets (`background2`, `move_button_box`, `province_hisotry_label`,
  `province_history_banner`, `provinceview_building_icon`,
  `state_provinces_label`) and drops none **[F]**.
- P2KE Patch - Anbennar is Proper 2K UI Enhanced plus Anbennar's scripted
  widgets: 220 `scripted = yes` blocks (18 windows, 150 buttons, 41 icons,
  11 text boxes), and every one of them has a `custom_*` block in Anbennar
  **[F]**. The patch drops Anbennar's two province button bars in
  `buildings_window` (`…_no_monument`, `…_with_monument`). Their
  `custom_window` blocks (Anbennar `custom_gui/provinceview.txt` lines 550,
  561) then match no widget **[F]**.
- The game keeps one variant of each small/large pair. At 1366×768 the
  buildings window holds `select_building` and `natives_buildings_window`;
  at 1920×1080 it holds `select_building_large` and
  `natives_buildings_window_large` **[C]**. The other variant is not in the
  tree at all, so drawing both, as the offline preview does today, is wrong.
- Names repeat inside the window. `province_values_window` appears three
  times in `buildings_window`, and `back_button`, `background` and
  `close_button` appear in several sub-panels **[F]**. A profile must address
  widgets by path.

## Views and what decides them

### 1. Screen height: low or high resolution [S][C]

- The test is "client height below `0x32e` (814)". It appears in the window
  setup (RVA `0x1344680`), in the background choice (`0x13470C0`), in the
  state background (`0x134DF00`) and in the two building variant pickers
  (`0x138EBE0`, `0x138ED80`) **[S]**. The captures agree: 720 and 768 px show
  `provinceview_bg`, and 900 px and taller show `provinceview_bg_large`, in
  vanilla and Proper 2K UI Enhanced **[C]**.
- At 813 px and below, setup hides `province_terrain`, `provinceview_bg_large`
  and `provinceview_foreign_bg_large`. It moves `history` to
  `top_section_lowres_history_pos`, `strait_indicator` to
  `top_section_lowres_strait_pos`, `river_indicator_2` to
  `top_section_lowres_river_icon_pos` and `state_window` to
  `state_view_lowres_pos` (`positionType`s, vanilla lines 263–278) **[S][F]**.
- Above 813 px, setup moves `top_section_window` to
  `top_section_position_big` (vanilla line 253) and hides the small
  backgrounds **[S][F]**. This explains the corpus's `codeMoved` entries for
  `top_section_window`, `history` and `river_indicator_2`.
- The state tab's background sprite (`states_view_bg`) is set to one of
  `GFX_provinceview_bg_state`, `…_bg_large_state`, `…_bg_foreign_state` and
  `…_bg_foreign_large_state` by height and ownership **[S]** (`0x134DF00`).

**Etch can decide this one fully from the preview resolution.**

### 2. Own or foreign province [S]

- `0x13470C0` (background and header update) compares the province's owner
  with the player's country. If they are equal, it shows `provinceview_bg*`
  and `province_banner` and hides the foreign pair. Otherwise it does the
  reverse. It reads the player's country from one of two fields, picked by a
  game mode that could not be identified **[S]**.
- In the same function, the edit boxes `provincename` and `capitalname` get a
  flag that is off for the player's own province and on for a foreign one.
  The likely meaning is "read only" **[H]**. A second branch looks at the
  owner's overlord-like field, which suggests that subjects behave like your
  own provinces **[H]**.
- `0x1376B40` (province window: set province) does this when the province's
  owner is not the player and neither build view is open: it hides
  `queue_window` and fills and shows `foreign_province_window` (filled by
  `0x10CC2F0`). In every other case it shows `queue_window` and hides
  `foreign_province_window` **[S]**. All other `province_window` widgets stay
  in both views. Their own visibility and enabled state are set every frame
  by `0x1373FD0`.
- The capture of the own province shows `province_banner`, `queue_window` and
  `progress_bar_window`, and hides `province_banner_foreign`,
  `provinceview_foreign_bg*` and `foreign_province_window` **[C]**.

**Etch needs the player's country and the province's owner.** Both are in a
save: `player=` in the header, and `owner=` in the province. Without a save,
the user picks the view.

### 3. Province tab and state tab [S]

- `0x1353580` (state tab) remembers whether `institutions_window` and
  `buildings_window` were open, closes both, shows `state_window`, hides
  `buildings_button` and sets a UI-wide flag. `0x1353670` (province tab) hides
  `state_window`, reopens the remembered panel and clears the flag **[S]**.
  When another province opens with the flag set, the state window is filled
  again (`0x1347A50`) **[S]**. The game remembers the state tab across
  provinces; whether the save keeps it was not checked **[H]**.
- The tabs' texts are code-filled: `province_tab_button` gets the province
  name and `states_tab_button` the area name (`0x13470C0`) **[S]**. Both read
  "Macedonia" in the capture, where province and area share the name **[C]**.
- Inside `state_window`, `stateviews_listbox` is filled with the five estate
  state views (`janissaries_state_view`, `pasha_state_view`,
  `patriarch_state_view`, `banners_state_view`, `cawa_state_view`; their
  constructors are at `0x134E420`–`0x1350460`) **[S]**. The game presumably
  adds each one only when the owner has the matching estate mechanic
  **[H]**.

### 4. Side panel: buildings, institutions, history [S][C]

- `buildings_window`, `institutions_window` and `history_window` share the
  side of the view. Opening institutions (`institution_icon`, `0x13466E0`)
  closes history. Closing institutions brings back `buildings_button` when
  the buildings window is closed (`0x1346750`). Opening a province closes
  history (`0x1347A50`) **[S]**. Whether opening buildings also closes the
  other two was not traced **[H]**.
- The captures of the own province show `buildings_window` open, with
  `general_buildings_window` and `province_values_window`, and the other two
  closed **[C]**.

### 5. Click-opened sub-panels of `province_window` [S][H]

The setup of `province_window` (`0x136C0D0`) creates and wires
`change_culture_view`, `build_army_view`, `build_navy_view`,
`client_state_selection`, `transfer_occupation_window`,
`tradegoods_province_window`, `allied_objectives_list` and
`progress_bar_window`, and the buttons that open them **[S]**. Each opens on
its button: `change_culture_button`, `build_landunit_button`/`build_merc_button`,
`build_navy_button`, `client_state_button`, `transfer_occupation_button`,
`resource_icon`, `select_allied_objective`. The button-to-panel pairs are read
from their names and the game's behaviour **[H]**. All of these sub-panels
are hidden in the captures **[C]**. A new province hides
`transfer_occupation_window` (`0x1376B40`) **[S]**.

### 6. Buildings variants and great projects [S]

- `0x1390280` (buildings window: set province) switches between the general
  buildings and the native buildings panels when a test on the owner country
  (`0x40A720`) changes. This is most likely "the owner builds native
  buildings", a native government **[H]**. `natives_buildings_window(_large)`
  then replaces `general_buildings_window` **[S][H]**.
- `great_projects_window` is shown when the great-projects list of the
  province is not empty and hidden otherwise (`0x139B480`) **[S]**. The save
  lists great projects per province (`great_projects=`, 131 provinces in the
  Russia save) **[F]**.

### 7. Uncolonised provinces: the colonisation panel [S][H]

- The province view creates its own instance of the `colonisationpanel`
  window from `colonisationpanel.gui` (setup `0x1344680`, constructor
  `0xE30460`). It updates it with the province (`0xE31930`, `0xE31A50`) and
  gives it its own terrain picture `GFX_colony_terrain_*` (`0xE37BD0`) **[S]**.
- On opening (`0x1347A50`), the game checks a province with the land flag set
  and no city or colony (a size field below 1, or a status bit). In that case
  it shows the colonisation panel window and does not show `provinceview` in
  the normal way. An owned province shows `provinceview` and closes the
  colonisation panel **[S]**. Which fields these are is a reading of the
  decompiled code **[H]**. The likely meaning is that natives and empty land
  show `colonisationpanel` (`colonist_window`, `no_colonist_window`,
  `natives_window`, `controller_window`, `economy_window`, …), while a
  colony in progress shows its colonist window **[H]**.
- A province without the land flag (sea, presumably wasteland) opens nothing
  **[H]**.

For the profile this is a **separate window in another file**, not a view of
`provinceview`. The province view's profile should point to it.

### 8. Anbennar: scripted GUI views [F][W]

The scripted-GUI notes (`common/custom_gui/example.txt` lines 42–54 in the
game; the same text in Anbennar's `00_readme.txt`) say a `custom_window` must
match a `scripted = yes` window. Its `potential` decides whether the window
is visible, and a hidden window skips the potentials of everything inside
it. In `provinceview.gui`, only descendants of `province_window`,
`buildings_window` and `state_window` work, with ROOT = the clicked province
and FROM = the country that clicks. `top_section_window` and the
`provinceview` root are not supported **[W]**.

| View (Patch layout) | Windows | Decided by (Anbennar file and line) |
| --- | --- | --- |
| Province button bar open | `province_window/province_button_window_closed` and its 30 buttons, each with its own `potential` | `custom_gui/provinceview.txt` 536: owner is FROM or FROM's subject, **and** FROM has country flag `province_button_UI_opened`; `province_button_button` (512) sets the flag and `province_button_close_button` (529) clears it |
| aPUI `<name>` open (`transmutative_path`, `gor_vazumbrog_vault`, `zena_medakas_majestic_menagerie`, `mangrove_bio_infra`, `kobold_citadel`, `gene_pillar_interaction`; `template` is debug only) | `buildings_window/aPUI_parent_container/aPUI_<name>_window` | `custom_window` potential `has_open_aPUI_in_province = { name = <name> }` (`provinceview.txt` 2786–3961, `gene_pillars_menu.txt` 203). That scripted trigger (`scripted_triggers/anb_scripted_triggers_for_province_ui.txt` 21) needs FROM to have flag `aPUI_<name>_flag`, the province to be `owned_by = FROM` and `has_eligible_aPUI_<name>_in_province` to hold (lines 29–84: debug flag; religion `transmutative_path`; province 4217 and capital and a flag; `citadel_group_main`; province 5847 and a flag; region `tagaala_mangroves_region` and a government attribute or flag; `gene_pillars` group) |
| Gene pillar sub-views | `…_unavailable_window`, `…_progress_window`, `…_setup_window`, `…_setup_window_members_<class>` (6) | `gene_pillars_menu.txt` 339–1414: province ownership plus FROM country flags such as `gene_pillars_archetype_selected_<class>` |
| Hold digging | `diggy_*` icons, texts and buttons in `province_window` | `provinceview.txt` 2–280: province flag `diggy_diggy_estimate_flag` and owner is FROM, plus modifiers and tech |
| Other province widgets | `add_parliament_forbidden`, `IW_move_capital_button`/`_blocker` | `provinceview.txt` 491, 2101, 2171 |

- The aPUI windows exclude one another: `open_aPUI_in_province`
  (`scripted_effects/anb_scripted_effects_for_province_ui.txt` 19) clears all
  aPUI flags before it sets one, and `aPUI_close_button` clears all of them
  **[F]**.
- In Anbennar's own layout, the opener buttons sit in the two bars inside
  `buildings_window`, and inactive "dummy" copies sit in the bar used when
  the buildings tab is closed. Anbennar's comments note that these dummies
  cannot open the buildings tab (`provinceview.txt` 2974) **[F]**. The patch
  instead puts the working openers in `province_button_window_closed`, under
  `province_window` **[F]**. The aPUI windows stay inside `buildings_window`,
  so they presumably show only while the buildings panel is open **[H]**.
- The flags and variables these triggers read are in the save: country and
  province `flags=` and `variables=` (`flags` on 2,059 provinces in the Verne
  1444 save) **[F]**. Some triggers call scripted triggers that need more
  data (`can_use_charkuchin_citadels`, `has_government_attribute`, region and
  province-group membership from `map/` files).

### Summary of the views

| Selector | Values | What changes | Source of the decision | Static for Etch? |
| --- | --- | --- | --- | --- |
| Resolution | height ≤ 813 / > 813 | backgrounds, terrain picture, building-panel variants, 4 moved widgets | engine rule [S][C] | yes |
| Ownership | own / foreign (subject: [H]) | backgrounds, banner, `queue_window` vs `foreign_province_window`, name boxes editable | engine, save (`player`, `owner`) | with a save or a user choice |
| Owned at all | owned / uncolonised | `provinceview` vs `colonisationpanel` window | engine, save (`owner`) [H] | with a save or a user choice |
| Tab | province / state | `province_window` + side panel vs `state_window` | player's click, remembered | user choice |
| Side panel | buildings / institutions / history / none | which of the three is shown | player's click | user choice |
| Sub-panel of `province_window` | none or one of 8 | the sub-panel | player's click | user choice |
| Owner builds native buildings | yes / no [H] | general vs native buildings panel | engine, owner country | with a save [H] |
| Great projects | some / none | `great_projects_window` | save (`great_projects`) | with a save |
| Estate state views | per estate [H] | entries of `stateviews_listbox` | engine, owner country | with a save [H] |
| Anbennar scripted windows | trigger true / false | `province_button_window_closed`, `aPUI_*`, gene pillar sub-windows | `potential` triggers over save data and mod files | the trigger text yes; its result with a save and a trigger evaluator, or a user choice |

## Code-filled widgets: what they show and where from

Paths are below `provinceview`. "Save" means a field of the province (`P`) or
the country (`C`) in a plain-text save. "Files" means the game's or mods'
files. "Engine" means a value the engine computes that no file holds.
"Static" says whether Etch can produce it without the live game.

| Widget (path) | Shows | Source | Static |
| --- | --- | --- | --- |
| `provinceview_bg*`, `provinceview_foreign_bg*`, `top_section_window/province_banner*` | which pair | resolution and ownership (views 1–2) [S] | yes / with save |
| `province_terrain` | `GFX_combat_terrain_<terrain>` sprite (`0x1347A50`) [S] | the province's terrain: `map/terrain.txt` overrides or the terrain map | hard (map files), else a user pick |
| `top_section_window/provincename`, `capitalname` (edit boxes) | province name, capital name | save P `name`, `capital`; files `history/provinces`, `common/province_names` | with save |
| `top_section_window/area_name`, `region_name` | area and region names [S] | files `map/area.txt`, `map/region.txt`, localisation | yes, given the province |
| `top_section_window/province_tab_button`, `states_tab_button` (text) | province name, area name [S] | as above | yes, given the province |
| `top_section_window/move_capital`, `move_trade_port`, `add_parliament`, `remove_parliament`, `have_*` | buttons or icons, and they shift the name boxes (`0x13470C0`) [S] | engine (capital, trade port, parliament seat; save P `seat_in_parliament`) | partly with save |
| `top_section_window/strait_indicator`, `river_indicator`, `river_indicator_2` | shown when the province has a strait, or a river by adjacency (`0x1347A50`) [S] | files `map/adjacencies.csv`, rivers | hard, else a user pick |
| `province_window/tax_base_value`, `prod_base_value`, `mp_base_value`, `development_value` | base tax, production, manpower and their sum | save P `base_tax`, `base_production`, `base_manpower` | with save |
| `province_window/*_increase_button`, `*_exploit_button`, `raze_button`, `settle_tribe_button`, `settlement_growth_checkbox` | shown or enabled per ownership, mana and rules (`0x1373FD0`) [S] | engine | no (sample or snapshot) |
| `province_window/improve_value` | development bought | save P `country_improve_count` [H] | with save [H] |
| `province_window/tax_value`, `production_value`, `total_value` | monthly income | engine | no |
| `province_window/religion`, `religion_icon` (frame), `culture` | name and icon | save P `religion`, `culture`; files `common/religions` (`icon`), localisation | with save |
| `province_window/province_religious_conversion_progress`, `bad_religion_icon` | conversion progress, wrong-religion glow | save P `missionary_progress` [H]; engine | partly |
| `province_window/cores_box` (`CoreShieldItem`, `TerritorialCoreShieldItem`, `ClaimShieldItem`, `PermanentClaimShieldItem` from `0x136F3C0`) | one shield per core or claim | save P `cores`, `territorial_core`, `claims`; flags from `gfx/flags` | with save |
| `province_window/unrest_value`, `likely_rebel_shield` | unrest, likely rebels | engine (save P `likely_rebels`) | rebels with save, unrest no |
| `province_window/local_autonomy_value` | autonomy | save P `local_autonomy` | with save |
| `province_window/hre_icon`/`hre_button`, `trade_company_*`, `client_state_button`, `trading_city_button` | frame or shown state | save P `hre`, `active_trade_company`; engine | partly |
| `province_window/sailor_value`, `manpower_value`, `supply_value`, `attrition_value`, `warscore_value`, `defensiveness_value`, `garrison_value` | military values | engine (save P `garrison` only) | no, except garrison |
| `province_window/fort_number`, `building_fort`, `no_building_fort`, `fort_maintenance_*` | fort level and sprite | save P `buildings`; files `common/buildings` | with save |
| `province_window/tradepower_value`, `tradevalue_value`, `goodsproduced_value` | trade values | save P `trade_power` (cached); the others engine | partly |
| `province_window/resource_icon` (frame), `latent_resource_icon`, `hidden_latent_resource_icon`, `resource_price_value` | trade good, latent good, price (`0x1376B40`) [S] | save P `trade_goods`, `latent_trade_goods`; price: save `trade` section and engine | icon with save; price with save |
| `province_window/tradenode_button` (text) | trade node name [S] | files `common/tradenodes`, localisation | yes, given the province |
| `province_window/trade_pie`, `trade_pie_overlay`, `trade_shield` | trade power share | engine | no |
| `province_window/occupied_by`, `occupied_by_shield`, `transfer_occupation_button` | occupier, with `PROVVIEW_OCCUPIED_BY`/`…_BY_YOU` [S] | save P `controller` ≠ `owner` | with save |
| `province_window/loot_*`, `devastation_icon`, `devastation_value` | loot and devastation [S] | save P `devastation`, `loot_remaining`; engine | with save |
| `province_window/queue_window/land_amount`, `naval_amount`; `progress_bar_window/*` | construction counts and progress | save P `*_construction`, `military_construction` | with save |
| `province_window/foreign_province_window/*` (shield, `country_name`, `government_type_icon`, `opinion_box`, attitude strip, `miltech_value`, `diplostatus_box` with `foreignviewview_diplistitem`, integrate or annex progress) | the owner country seen from the player (`0x10CC2F0`, `0x10CC160`) [S] | save C (government, tech, relations, alliances, wars, truces); opinion and attitude engine | partly with save |
| `province_window/change_culture_view/cultures`, `build_army_view`/`build_navy_view` lists | culture and unit lists (`culture_item` `0xE2ABF0`, `naval_unit` `0xE1D5D0`, `queue_entry` `0xE217B0`) [S] | files (cultures, units) and engine (costs) | entries yes, costs no |
| `state_window/*` (`state_name` from `STATE_OF`/`CAPITAL_STATE_OF`/`TERRITORY_OF`, `income_value`, `governing_capacity_value`, prosperity, `current_edict`, `edict_icon`, `provinces_listbox` with `state_province_entry`, `stateviews_listbox`) | state data (`0x1350E10`) [S] | save C `states` (prosperity, edicts); engine (income, capacity) | partly with save |
| `buildings_window/general_buildings_window/building_progress_entry` ×n, `center_of_trade_icon`/`button` | building slots (`0x13899F0`), centre of trade level | save P `buildings`, `center_of_trade`; files `common/buildings` | with save |
| `buildings_window/province_values_window/*_value`, `*_modifier` | force limits, governing cost, build allowance, cost and time modifiers | engine | no |
| `buildings_window/great_projects_window/great_projects_list` (`great_project_entry`, `0x1398C30`) | great projects and tiers | save P `great_projects`; files `common/great_projects` | with save |
| `institutions_window/institutions` (`province_institution_entry`, `0x1382CA0`), `growth_mod` | institution presence and growth | save P `institutions`; engine for growth | partly |
| `history_window/history_list` | province history | save P `history`; files `history/provinces` | with save |
| `province_modifier_item` ×n (top level, from `province_modifier_start`) | one icon per province modifier (`0x1341B70`) [S] | save P `modifier`, `triggered_modifier`; files `common/event_modifiers` | with save |
| `institution_icon` | institution spread state | engine | no |
| Anbennar `custom_text_box` (`diggy_cost_text`, `aPUI_*_title`, …) | the localisation string named like the widget [W] | localisation; `[Root.<variable>.GetValue]` reads a save variable; `[This.<key>]` is customizable localisation (needs triggers) | key yes; values with save |
| Anbennar `custom_icon`/`custom_button` frames | frame from `frame = { number trigger }` or `frame_variable` [W] | triggers or variables over save data | with save and an evaluator |

- Of the 29 templates at the top of the file, the executable refers by name
  to all but four: `unit`, `merc`, `TradeGoodsItem` and
  `province_estate_entry`. The first two are short names that the string
  listing may have missed. The last two may be unused **[S][H]**.
- What the save does not hold at all: income, supply, attrition, unrest,
  defensiveness, trade value and share, force limits, governing cost, build
  modifiers, opinion, and button enabled states. These come only from the
  live game's snapshot or from hand-written sample data. Computing them
  would be an emulator, which the map rules out.

## What Etch can read statically

- **Without a save:** the window tree and both variants, the resolution rule
  and the four `positionType` moves, which windows are click-opened panels,
  every localisation key in `text`/`buttonText` and the engine's own keys (`STATE_OF`,
  `PROVVIEW_OCCUPIED_BY`, …), names from map files once a province is chosen
  (area, region, trade node), and the full text of each scripted-GUI
  `potential` with its ROOT and FROM roles.
- **With a save** (plain text; the corpus saves are zipped text): ownership
  views, great projects, occupation, cores and claims, modifiers, buildings,
  base development, culture, religion, trade goods, construction, and the
  flags and variables that most Anbennar `potential` triggers test. Triggers
  built only from `has_country_flag`, `has_province_flag`, `owned_by`, `tag`,
  `province_id` and `is_capital` can be checked against a save without
  computing anything. Others (`religion`, `region`, `province_group`,
  `has_government_attribute`, scripted triggers that call more triggers) also
  need definitions from `common/` and `map/`.
- **Only the live game:** engine-computed values, per-frame enabled and shown
  states of buttons, opinion, and anything resolved through customizable
  localisation.

## Notes for the window profile format

1. **A view is more than visible windows.** It also picks one of each
   small/large pair (the other does not exist), moves widgets to named
   `positionType`s, and swaps a sprite (`states_view_bg`). The format needs:
   visible nested windows, created-or-absent variants, `positionType` moves,
   and per-widget sprite or frame overrides.
2. **Selectors come in four kinds.**
   - resolution predicates (`height <= 813`);
   - data predicates over the chosen save, province and player (owner is
     player, province owned, great projects present);
   - UI state chosen by the user (tab, side panel, one click-opened
     sub-panel);
   - scripted-GUI `potential` triggers (mod files, ROOT = province,
     FROM = player).
   A profile entry should say which kind it is, so the preview can follow a
   save where it can and offer a switch where it cannot.
3. **Exclusive groups.** Several groups show exactly one member, or at most
   one:
   - {`province_window` + side panel, `state_window`};
   - {`queue_window`, `foreign_province_window`};
   - {`buildings_window`, `institutions_window`, `history_window`, none};
   - the eight sub-panels of `province_window`;
   - each small/large pair;
   - the `aPUI_*` windows, because of the shared flag reset.
   Groups keep the profile small and the Widget Outline toggles consistent.
4. **Repeaters.** Code instantiates top-level templates into lists and boxes:
   - `province_modifier_item` at `province_modifier_start`;
   - core and claim shields in `cores_box`;
   - `building_progress_entry` in `general_buildings_window`;
   - `great_project_entry`, `state_province_entry`, `culture_item` and
     others.
   A profile should name the template, its container and a sample count.
   The templates themselves are not part of the view; today the preview
   would draw them where they stand.
5. **Windows from other files.** An uncolonised province opens
   `colonisationpanel` (`colonisationpanel.gui`), and edicts open
   `edicts_window`. The province view's profile should link to these as
   related windows rather than treat them as views of `provinceview`.
6. **Address by path, not name.** `province_values_window`, `back_button`,
   `background` and `close_button` repeat. Proper 2K UI Enhanced and the
   patch keep the paths of vanilla, so a vanilla profile carries over to them
   for the engine-decided views.
7. **A mod profile layers on the game profile.** The Anbennar profile only
   adds windows and selectors, all scripted. Etch could derive a first draft
   of it by itself: each `custom_window` whose name matches a scripted window
   in a supported container becomes a toggle, with its `potential` shown as
   the condition. Mutual exclusion and the flag that opens each window
   (`aPUI_<name>_flag`) can be read from the scripted effects, but not
   generically. The map's open question on deriving profiles for other big
   mods gets a concrete answer: the toggles can be derived, while their
   labels and groups need a hand-written profile.
8. **Hidden-by-default widgets.** In the own-province capture, many widgets
   that the file shows are hidden: `settle_tribe_button`, `occupied_by`,
   `tax_base_icon`, `latent_resource_icon` and others. Most depend on data
   (view 2 and the save) **[C]**. A profile that wants a faithful default
   view should list them per view. The capture's `visible` flags give that
   list directly, so a profile can start from a capture.

## Newly specifiable or out of scope

- **Newly specifiable:**
  - the resolution-dependent part of every province view (rule, variants and
    moves), with no game or save needed;
  - the own and foreign province views from a save's `player` and `owner`;
  - the Anbennar toggles from `custom_gui`;
  - "Choosing data in the preview", which needs exactly a save, a player
    country (default: the save's `player`) and a province.
- **Out of scope** (emulator): engine-computed values (income, supply, unrest,
  trade, force limits, opinion), per-frame button states, and customizable
  localisation results. These stay with sample data or the live snapshot.
  The terrain picture and the river and strait indicators need the map's
  bitmaps or adjacency files. They are better taken from a snapshot or a user
  pick than computed.

## Open questions for a live check

1. Foreign province: does every widget of `province_window` other than
   `queue_window` stay visible? Are subjects' provinces "own" for the name
   edit boxes and the background? (Capture a foreign, a subject and an
   occupied province.)
2. Uncolonised, native and colonising provinces: is `provinceview` hidden
   completely while `colonisationpanel` shows, or does its top section stay?
   (Capture one of each.)
3. Which test picks native buildings, and when do the estate state views
   appear?
4. In P2KE Patch - Anbennar, does an aPUI window show while the buildings
   panel is closed? (Anbennar's own layout suggests not.)
5. Is the remembered state tab kept in the save or only in the session?

## Sources

- Game `interface/provinceview.gui` (lines above), `interface/colonisationpanel.gui`,
  `common/custom_gui/example.txt`.
- Proper 2K UI Enhanced `interface/provinceview.gui`; P2KE Patch - Anbennar
  `interface/provinceview.gui`, `common/custom_gui/p2kuie_amb.txt`.
- Anbennar `interface/provinceview.gui`, `common/custom_gui/00_readme.txt`,
  `provinceview.txt`, `gene_pillars_menu.txt`,
  `common/scripted_triggers/anb_scripted_triggers_for_province_ui.txt`,
  `common/scripted_effects/anb_scripted_effects_for_province_ui.txt`,
  `localisation/anb_diggy_diggy_hole_l_english.yml`, `anb_charkuchin_l_english.yml`.
- This repository: `corpus/manifest.json` (window `province`),
  `corpus/captures/{vanilla,proper-2k-ui-enhanced}/*/province.json`,
  `docs/research/gui-format.md` on branch `research/gui-format`.
- Lab: Ghidra project `work/ghidra/eu4-1.37.5`. The functions cited by RVA
  are decompiled under `work/ghidra/decomp-provinceview/` (not tracked).
  Main entry points: `0x1344680` setup, `0x1347A50` set province, `0x13470C0`
  background and header, `0x1376B40` province window set province,
  `0x1373FD0` province window per-frame update, `0x1353580`/`0x1353670` state
  and province tabs, `0x1390280` buildings, `0x138EBE0`/`0x138ED80` variant
  pickers, `0x134DF00`/`0x1350E10` state window, `0x10CC2F0` foreign window,
  `0xE30460`/`0xE31A50` colonisation panel.
