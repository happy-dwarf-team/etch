# Coverage survey results

Shares are of widgets summed over the views (docs/coverage.md, "Measures"); a view is
"full" when every compared rect is exact and the game shows nothing the layout lacks, and from
the live snapshot also when every visibility agrees.

| Playset | Resolution | Views | Outline rects | Outline visibility | Full (outline) | Live rects | Live visibility | Full (live) | Live texts | Texts, profiled windows | Pixel pass |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla | 1280x720 | 36 | 74.5 % | 88.1 % | 10 | 97.9 % | 99.9 % | 18 | 99.6 % | 100.0 % | 2 of 36 |
| vanilla | 1920x1080 | 53 | 75.6 % | 88.6 % | 16 | 98.0 % | 99.9 % | 30 | 99.6 % | 99.3 % | 5 of 53 |
| anbennar-alone | 1280x720 | 33 | 80.4 % | 76.9 % | 11 | 98.4 % | 99.9 % | 17 | 99.8 % | 100.0 % | 2 of 33 |
| anbennar-alone | 1920x1080 | 51 | 85.4 % | 74.9 % | 19 | 98.7 % | 99.9 % | 32 | 99.6 % | 99.3 % | 5 of 51 |
| bigger-ui | 1280x720 | 36 | 74.5 % | 88.1 % | 10 | 97.9 % | 99.9 % | 18 | 99.6 % | 100.0 % | 2 of 36 |
| bigger-ui | 1920x1080 | 53 | 75.6 % | 88.7 % | 16 | 98.0 % | 99.9 % | 31 | 99.6 % | 99.3 % | 5 of 53 |

Captures the survey's manifest lists but no record has: vanilla 1280x720 18, vanilla 1920x1080 1, anbennar-alone 1280x720 18, bigger-ui 1280x720 18, bigger-ui 1920x1080 1. At 1280×720 only the views whose windows have a variant there are captured.

## What differs

### vanilla

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 312 | 10 | `provinceview/province_window/tax_base_value` |
| outline rect, iconType: y differ | 162 | 5 | `countrymilitaryview/icon_cost` |
| outline: the game shows a widget the layout lacks | 109 | 12 | `minimap_panel/minimap_bg` |
| outline rect, guiButtonType: y differ | 54 | 7 | `countrymilitaryview/infantry_type_button` |
| outline rect, instantTextBoxType: h differ | 46 | 21 | `provinceview/province_window/warscore_value` |
| outline rect, iconType: w, h differ | 28 | 12 | `provinceview/province_window/trade_pie` |
| outline rect, guiButtonType: x, y differ | 26 | 5 | `provinceview/top_section_window/history` |
| outline rect, windowType: y differ | 24 | 12 | `menubar/WarOverviewButtonWindow` |
| outline rect, windowType: y, h differ | 22 | 12 | `provinceview` |
| outline rect, instantTextBoxType: x differ | 22 | 7 | `countrydiplomacyview/label_nation` |
| live text not taken (no profile) | 12 | 3 | `countrystabilityview/[46]` |
| outline rect, iconType: x differ | 10 | 5 | `countrystabilityview/stability_progress_threshold` |
| outline rect, iconType: x, y differ | 8 | 6 | `provinceview/top_section_window/strait_indicator` |
| live: no value of selector fort fits | 6 | 3 | `provinceview` |
| live: no value of selector page fits | 6 | 3 | `country_selection_panel` |
| outline rect, iconType: x, y, h differ | 6 | 1 | `shield_thin_glow[1]` |
| live text not taken (profiled) | 5 | 1 | `ledger/ledger_sort_buttons/ledger_default_button_text[2]` |
| live: the game shows it, not drawn (no profile) | 4 | 1 | `peace_view/standardtext_slider/listboxSliderButton` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, instantTextBoxType: x, y, h differ | 2 | 1 | `countryreligionview/orthodox_specific_window/current_patriarch_authority_value` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| outline rect, instantTextBoxType: w differ | 2 | 1 | `countrystabilityview/cv_governmentrebels_handlerebels/rebelsize_desc` |
| outline rect, iconType: y, w, h differ | 2 | 1 | `countryestatesview/dev_share_pie_chart` |
| live: drawn, the game hides it (no profile) | 2 | 1 | `menu_settings[1]` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |
| outline rect, instantTextBoxType: x, y differ | 1 | 1 | `waroverview/waroverview_value` |

### anbennar-alone

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 196 | 8 | `provinceview/province_window/tax_base_value` |
| outline rect, iconType: y differ | 96 | 3 | `countrymilitaryview/icon_cost` |
| outline: the game shows a widget the layout lacks | 84 | 8 | `minimap_panel/minimap_bg` |
| outline rect, instantTextBoxType: h differ | 36 | 16 | `provinceview/province_window/warscore_value` |
| outline rect, guiButtonType: y differ | 23 | 7 | `countrymilitaryview/infantry_type_button` |
| outline rect, windowType: y differ | 20 | 9 | `menubar/WarOverviewButtonWindow` |
| outline rect, guiButtonType: x, y differ | 20 | 5 | `provinceview/top_section_window/history` |
| outline rect, iconType: w, h differ | 18 | 10 | `provinceview/province_window/trade_pie` |
| outline rect, instantTextBoxType: x differ | 16 | 4 | `countrydiplomacyview/label_nation` |
| outline rect, windowType: y, h differ | 10 | 5 | `provinceview/province_window` |
| outline rect, iconType: x, y differ | 5 | 4 | `provinceview/top_section_window/strait_indicator` |
| live text not taken (profiled) | 5 | 1 | `ledger/ledger_sort_buttons/ledger_default_button_text[2]` |
| live text not taken (no profile) | 4 | 1 | `countrystabilityview/[46]` |
| outline rect, iconType: x differ | 4 | 2 | `countryreligionview/current_religion_icon` |
| outline rect, iconType: x, y, h differ | 4 | 1 | `shield_thin_glow[1]` |
| live: no value of selector page fits | 4 | 2 | `country_selection_panel` |
| outline rect, guiButtonType: x, y, h differ | 3 | 2 | `tributary_shield` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, instantTextBoxType: w differ | 2 | 1 | `countryreligionview/full_unity` |
| live: no value of selector owner fits | 2 | 1 | `provinceview` |
| live: no value of selector tab fits | 2 | 1 | `provinceview` |
| live: no value of selector subPanel fits | 2 | 1 | `provinceview` |
| live: no value of selector hre fits | 2 | 1 | `provinceview` |
| live: no value of selector tradePort fits | 2 | 1 | `provinceview` |
| live: no value of selector buttonBar fits | 2 | 1 | `provinceview` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| outline rect, iconType: y, w, h differ | 2 | 1 | `countryestatesview/dev_share_pie_chart` |
| live: drawn, the game hides it (no profile) | 2 | 1 | `menu_settings[1]` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |
| outline rect, guiButtonType: x, y, w, h differ | 1 | 1 | `topbar/achievements_root_window/achievement_window_bg` |

### bigger-ui

| Class | Widgets | Views | Example |
| --- | --- | --- | --- |
| outline rect, instantTextBoxType: y differ | 312 | 10 | `provinceview/province_window/tax_base_value` |
| outline rect, iconType: y differ | 162 | 5 | `countrymilitaryview/icon_cost` |
| outline: the game shows a widget the layout lacks | 104 | 11 | `minimap_panel/minimap_bg` |
| outline rect, guiButtonType: y differ | 54 | 7 | `countrymilitaryview/infantry_type_button` |
| outline rect, instantTextBoxType: h differ | 44 | 21 | `provinceview/province_window/warscore_value` |
| outline rect, iconType: w, h differ | 28 | 12 | `provinceview/province_window/trade_pie` |
| outline rect, guiButtonType: x, y differ | 26 | 5 | `provinceview/top_section_window/history` |
| outline rect, windowType: y differ | 24 | 12 | `menubar/WarOverviewButtonWindow` |
| outline rect, windowType: y, h differ | 22 | 12 | `provinceview` |
| outline rect, instantTextBoxType: x differ | 22 | 7 | `countrydiplomacyview/label_nation` |
| live text not taken (no profile) | 12 | 3 | `countrystabilityview/[46]` |
| outline rect, iconType: x differ | 10 | 5 | `countrystabilityview/stability_progress_threshold` |
| outline rect, iconType: x, y differ | 8 | 6 | `provinceview/top_section_window/strait_indicator` |
| live: no value of selector fort fits | 6 | 3 | `provinceview` |
| outline rect, iconType: x, y, h differ | 6 | 1 | `shield_thin_glow[1]` |
| live text not taken (profiled) | 5 | 1 | `ledger/ledger_sort_buttons/ledger_default_button_text[2]` |
| live: no value of selector page fits | 4 | 2 | `country_selection_panel` |
| outline rect, windowType: x, y differ | 2 | 1 | `diplomessageicons_window` |
| outline rect, guiButtonType: w, h differ | 2 | 1 | `minimap_panel/custom_mapmode_7` |
| outline rect, instantTextBoxType: x, y, h differ | 2 | 1 | `countryreligionview/orthodox_specific_window/current_patriarch_authority_value` |
| outline rect, iconType: placed outside the screen | 2 | 1 | `countrytechnologyview/institutions_window/country_progress` |
| outline rect, instantTextBoxType: w differ | 2 | 1 | `countrystabilityview/cv_governmentrebels_handlerebels/rebelsize_desc` |
| outline rect, iconType: y, w, h differ | 2 | 1 | `countryestatesview/dev_share_pie_chart` |
| live: drawn, the game hides it (no profile) | 2 | 1 | `menu_settings[1]` |
| outline rect, guiButtonType: placed outside the screen | 1 | 1 | `countrytechnologyview/institutions_window/back_button` |
| outline rect, instantTextBoxType: x, y differ | 1 | 1 | `waroverview/waroverview_value` |

## Pixels

`compare`'s per-widget result for the survey's views. The survey's views have no hand-made
masks of what the game fills (the corpus has `codeFilled`), so a text or icon the game fills
fails by its content; the rect-only column counts the widgets that fail by their rect alone.

| Playset | Views compared | Views passing | Widgets passing | Widgets failing | Rect only | Failing by kind |
| --- | --- | --- | --- | --- | --- | --- |
| vanilla | 89 | 7 | 3206 | 2868 | 665 | instantTextBoxType 1343, iconType 826, guiButtonType 520, none in the layout 109, windowType 60, editBoxType 8, checkboxType 2 |
| anbennar-alone | 84 | 7 | 3389 | 2324 | 477 | instantTextBoxType 1078, iconType 659, guiButtonType 444, none in the layout 84, windowType 49, editBoxType 8, checkboxType 2 |
| bigger-ui | 89 | 7 | 3203 | 2854 | 665 | instantTextBoxType 1341, iconType 823, guiButtonType 516, none in the layout 104, windowType 60, editBoxType 8, checkboxType 2 |

## Where rects start to differ

Each row is a widget whose outline rect is off while its parent is not off by the same
amount; the widgets inside it that only move with it are counted, not listed. At the largest
captured resolution only: below it a window taller than the screen takes the bounds of its
children in Tongs, so its own rect is not compared and every child would count as an origin.

### vanilla

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `countrymilitaryview` | windowType | 0,-16 | 111 | 5 |
| `provinceview/top_section_window` | windowType | 0,89 | 12 | 4 |
| `countrytechnologyview/institutions_window` | windowType | 0,140 | 15 | 1 |
| `countrysubjectview/country_subjects_info` | windowType | 0,-328 | 11 | 2 |
| `countrysubjectview/subject_military_focus_window` | windowType | 0,-328 | 7 | 1 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 5 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-60 | 0 | 4 |
| `provinceview/province_window/trade_pie` | iconType | 0,0 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `provinceview/buildings_window/great_projects_window` | windowType | 0,-10 | 2 | 2 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/num_relations_value` | instantTextBoxType | 0,0 | 0 | 3 |
| `countrystabilityview/stability_progress_threshold` | iconType | -48,0 | 0 | 3 |
| `countrystabilityview/governing_capacity_icon` | iconType | 0,0 | 0 | 3 |
| `countrystabilityview/stability_value` | instantTextBoxType | -48,0 | 0 | 3 |
| `countryeconomyview/incomes_total` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/war_exhaustion` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/development_base` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryreligionview/religionpanel_bg_top` | iconType | 0,0 | 0 | 2 |
| `countryreligionview/current_religion_icon` | iconType | -62,0 | 0 | 2 |
| `diplomessageicons_window` | windowType | 10,910 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-110 | 0 | 1 |
| `minimap_panel/custom_mapmode_7` | guiButtonType | 0,0 | 0 | 1 |
| `parliament_window/enacted_modifiers_effect` | instantTextBoxType | 0,0 | 0 | 1 |
| `colonisationpanel/natives_window/aggressiveness_label` | instantTextBoxType | 0,0 | 0 | 1 |
| `ages_view/picture` | iconType | 0,0 | 0 | 1 |
| `ages_view/desc` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_icon` | iconType | -206,4 | 0 | 1 |
| `waroverview/waroverview_value` | instantTextBoxType | -7,-1 | 0 | 1 |
| `waroverview/ourcav` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/ourtroops_lost` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/ourtroops_attrit` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/enemytroops_lost` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/enemytroops_attrit` | instantTextBoxType | 0,0 | 0 | 1 |
| `countrygovernmentview/cultures_window/accepted_culture_slots` | instantTextBoxType | 0,-330 | 0 | 1 |

### anbennar-alone

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `countrymilitaryview` | windowType | 0,-16 | 107 | 3 |
| `countrytechnologyview/institutions_window` | windowType | 0,140 | 15 | 1 |
| `provinceview/top_section_window` | windowType | 0,89 | 11 | 4 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-60 | 0 | 4 |
| `provinceview/province_window/trade_pie` | iconType | 0,0 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `countrydiplomacyview/button_view_player_country` | guiButtonType | 0,-304 | 0 | 4 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `provinceview/buildings_window/great_projects_window` | windowType | 0,-10 | 2 | 1 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 3 |
| `tributary_shield` | guiButtonType | -987,-306 | 0 | 2 |
| `countryeconomyview/incomes_total` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/war_exhaustion` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/development_base` | instantTextBoxType | 0,0 | 0 | 2 |
| `countrytradeview/trade_income_from_trade_pie` | iconType | 0,0 | 0 | 2 |
| `countryreligionview/religionpanel_bg_top` | iconType | 0,0 | 0 | 2 |
| `countryreligionview/current_religion_icon` | iconType | -62,0 | 0 | 2 |
| `diplomessageicons_window` | windowType | 10,910 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-110 | 0 | 1 |
| `minimap_panel/custom_mapmode_7` | guiButtonType | 0,0 | 0 | 1 |
| `ages_view/picture` | iconType | 0,0 | 0 | 1 |
| `ages_view/desc` | instantTextBoxType | 0,0 | 0 | 1 |
| `colonisationpanel/natives_window/aggressiveness_label` | instantTextBoxType | 0,0 | 0 | 1 |
| `countrygovernmentview/cultures_window/accepted_culture_slots` | instantTextBoxType | 0,-330 | 0 | 1 |
| `countrystabilityview/governing_capacity_icon` | iconType | 0,0 | 0 | 1 |
| `countryreligionview/full_unity` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/magic_menu_parent/magic_menu_main/magic_menu_main_row_3/magic_menu_infamy_types` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/magic_menu_parent/magic_menu_main/magic_menu_main_row_3/magic_menu_infamy_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/magic_menu_parent/magic_menu_spellbook_window/magic_menu_change_spellbook_window/magic_menu_button_custom_magic_lists_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_indiv/achievement_column_1/achievement_indiv_r1_c1/achievement_r1_c1_flavor_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_indiv/achievement_column_1/achievement_indiv_r4_c1/achievement_r4_c1_flavor_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_indiv/achievement_column_1/achievement_indiv_r8_c1/achievement_r8_c1_flavor_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_indiv/achievement_column_2/achievement_indiv_r1_c2/achievement_r1_c2_flavor_text` | instantTextBoxType | 0,0 | 0 | 1 |
| `topbar/achievements_root_window/achievement_window_bg` | guiButtonType | 596,401 | 0 | 1 |
| `countryestatesview/dev_share_pie_chart` | iconType | 0,-96 | 0 | 1 |

### bigger-ui

| Widget | Kind | Layout − game (x, y) | Moved with it | Views |
| --- | --- | --- | --- | --- |
| `countrymilitaryview` | windowType | 0,-16 | 111 | 5 |
| `provinceview/top_section_window` | windowType | 0,89 | 12 | 4 |
| `countrytechnologyview/institutions_window` | windowType | 0,140 | 15 | 1 |
| `countrysubjectview/country_subjects_info` | windowType | 0,-328 | 11 | 2 |
| `countrysubjectview/subject_military_focus_window` | windowType | 0,-328 | 7 | 1 |
| `DefaultConfirm/Description` | instantTextBoxType | 0,0 | 0 | 5 |
| `menubar/message_window_container` | windowType | 0,-30 | 3 | 1 |
| `provinceview/province_window` | windowType | 0,-60 | 0 | 4 |
| `provinceview/province_window/trade_pie` | iconType | 0,0 | 0 | 4 |
| `provinceview/province_window/tax_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/prod_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/mp_base_value` | instantTextBoxType | 0,-62 | 0 | 4 |
| `provinceview/province_window/warscore_value` | instantTextBoxType | 0,0 | 0 | 4 |
| `provinceview/buildings_window/great_projects_window` | windowType | 0,-10 | 2 | 2 |
| `countrydiplomacyview/label_nation` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/label_fog` | instantTextBoxType | 20,0 | 0 | 4 |
| `countrydiplomacyview/num_relations_value` | instantTextBoxType | 0,0 | 0 | 3 |
| `countrystabilityview/stability_progress_threshold` | iconType | -48,0 | 0 | 3 |
| `countrystabilityview/governing_capacity_icon` | iconType | 0,0 | 0 | 3 |
| `countrystabilityview/stability_value` | instantTextBoxType | -48,0 | 0 | 3 |
| `countryeconomyview/incomes_total` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/war_exhaustion` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryeconomyview/development_base` | instantTextBoxType | 0,0 | 0 | 2 |
| `countryreligionview/religionpanel_bg_top` | iconType | 0,0 | 0 | 2 |
| `countryreligionview/current_religion_icon` | iconType | -62,0 | 0 | 2 |
| `diplomessageicons_window` | windowType | 10,910 | 0 | 1 |
| `menubar/WarOverviewButtonWindow` | windowType | 0,-110 | 0 | 1 |
| `minimap_panel/custom_mapmode_7` | guiButtonType | 0,0 | 0 | 1 |
| `parliament_window/enacted_modifiers_effect` | instantTextBoxType | 0,0 | 0 | 1 |
| `colonisationpanel/natives_window/aggressiveness_label` | instantTextBoxType | 0,0 | 0 | 1 |
| `ages_view/picture` | iconType | 0,0 | 0 | 1 |
| `ages_view/desc` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_icon` | iconType | -206,48 | 0 | 1 |
| `waroverview/waroverview_value` | instantTextBoxType | -7,45 | 0 | 1 |
| `waroverview/ourcav` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/ourtroops_lost` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/ourtroops_attrit` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/enemytroops_lost` | instantTextBoxType | 0,0 | 0 | 1 |
| `waroverview/waroverview_losses/enemytroops_attrit` | instantTextBoxType | 0,0 | 0 | 1 |
| `countrygovernmentview/cultures_window/accepted_culture_slots` | instantTextBoxType | 0,-330 | 0 | 1 |

## Windows

| Playset | Windows | Views | Inside a view | Not reached |
| --- | --- | --- | --- | --- |
| vanilla | 696 | 42 | 141 | 513 |
| anbennar-alone | 813 | 40 | 106 | 667 |
| bigger-ui | 696 | 42 | 141 | 513 |

A window's confidence is the share of its widgets built only of confirmed constructs.

| Playset | Not reached | Confidence 100 % | 90 % or more | 50 % or more | Below 50 % |
| --- | --- | --- | --- | --- | --- |
| vanilla | 513 | 0 | 0 | 2 | 511 |
| anbennar-alone | 667 | 0 | 0 | 75 | 592 |
| bigger-ui | 513 | 0 | 0 | 2 | 511 |

## Constructs

A construct is confirmed when at least 10 widgets built with it were compared on their own and at least 95 % of them had the game's rect.

| Playset | Seen | Confirmed | All exact | Some rect differs |
| --- | --- | --- | --- | --- |
| vanilla | 98 | 38 | 45 | 53 |
| anbennar-alone | 111 | 37 | 54 | 57 |
| bigger-ui | 98 | 40 | 47 | 51 |

vanilla, constructs with rects that differ (most first):

- `instantTextBoxType`: 385 of 1716 differ
- `instantTextBoxType.format`: 383 of 1683 differ
- `instantTextBoxType.position`: 380 of 1701 differ
- `instantTextBoxType.maxwidth`: 380 of 1711 differ
- `instantTextBoxType.maxheight`: 380 of 1711 differ
- `instantTextBoxType.bordersize`: 305 of 1558 differ
- `instantTextBoxType.fixedsize`: 266 of 665 differ
- `instantTextBoxType.fixedsize=yes`: 266 of 649 differ
- `instantTextBoxType.format=right`: 252 of 642 differ
- `iconType`: 218 of 1391 differ
- `iconType.position`: 213 of 1384 differ
- `iconType.scale`: 134 of 359 differ
- `iconType.hint_tag`: 104 of 401 differ
- `instantTextBoxType.format=centre`: 84 of 513 differ
- `guiButtonType`: 83 of 1555 differ
- `guiButtonType.position`: 52 of 1500 differ
- `windowType`: 48 of 387 differ
- `windowType.position`: 48 of 380 differ
- `windowType.size`: 44 of 362 differ
- `windowType.moveable`: 44 of 364 differ
- `windowType.background`: 41 of 298 differ
- `windowType.dontrender`: 39 of 303 differ
- `windowType.horizontalborder`: 39 of 303 differ
- `windowType.orientation`: 38 of 200 differ
- `guiButtonType.hint_tag`: 35 of 82 differ

anbennar-alone, constructs with rects that differ (most first):

- `instantTextBoxType`: 250 of 1762 differ
- `instantTextBoxType.format`: 248 of 1687 differ
- `instantTextBoxType.position`: 247 of 1752 differ
- `instantTextBoxType.maxwidth`: 247 of 1758 differ
- `instantTextBoxType.maxheight`: 246 of 1758 differ
- `instantTextBoxType.bordersize`: 200 of 1570 differ
- `instantTextBoxType.fixedsize`: 174 of 614 differ
- `instantTextBoxType.fixedsize=yes`: 174 of 598 differ
- `instantTextBoxType.format=right`: 149 of 621 differ
- `iconType`: 131 of 1408 differ
- `iconType.position`: 128 of 1403 differ
- `iconType.scale`: 74 of 279 differ
- `iconType.hint_tag`: 64 of 371 differ
- `instantTextBoxType.format=centre`: 53 of 467 differ
- `guiButtonType`: 50 of 1429 differ
- `instantTextBoxType.format=left`: 33 of 415 differ
- `windowType`: 32 of 427 differ
- `windowType.position`: 32 of 404 differ
- `guiButtonType.position`: 32 of 1392 differ
- `windowType.size`: 30 of 394 differ
- `windowType.moveable`: 30 of 396 differ
- `windowType.orientation`: 29 of 247 differ
- `windowType.background`: 27 of 285 differ
- `windowType.dontrender`: 25 of 286 differ
- `windowType.horizontalborder`: 25 of 286 differ

bigger-ui, constructs with rects that differ (most first):

- `instantTextBoxType`: 383 of 1714 differ
- `instantTextBoxType.format`: 381 of 1681 differ
- `instantTextBoxType.position`: 378 of 1699 differ
- `instantTextBoxType.maxwidth`: 378 of 1709 differ
- `instantTextBoxType.maxheight`: 378 of 1709 differ
- `instantTextBoxType.bordersize`: 305 of 1558 differ
- `instantTextBoxType.fixedsize`: 264 of 663 differ
- `instantTextBoxType.fixedsize=yes`: 264 of 647 differ
- `instantTextBoxType.format=right`: 252 of 642 differ
- `iconType`: 218 of 1389 differ
- `iconType.position`: 213 of 1382 differ
- `iconType.scale`: 134 of 359 differ
- `iconType.hint_tag`: 104 of 401 differ
- `instantTextBoxType.format=centre`: 84 of 513 differ
- `guiButtonType`: 83 of 1549 differ
- `guiButtonType.position`: 52 of 1494 differ
- `windowType`: 48 of 385 differ
- `windowType.position`: 48 of 378 differ
- `windowType.size`: 44 of 362 differ
- `windowType.moveable`: 44 of 364 differ
- `windowType.background`: 41 of 298 differ
- `windowType.dontrender`: 39 of 303 differ
- `windowType.horizontalborder`: 39 of 303 differ
- `windowType.orientation`: 38 of 200 differ
- `guiButtonType.hint_tag`: 35 of 82 differ

## Views

### vanilla

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel, outliner, speed_controls, topbar (profile) | 93.7 % | 92.0 % | 99.1 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s7 1280x720 | provinceview (profile) | 91.5 % | 67.1 % | 99.2 % | 100.0 % | 100.0 % | 70 fail |
| vanilla-save-s8 1280x720 | provinceview (profile) | 89.3 % | 69.6 % | 99.1 % | 100.0 % | 100.0 % | 76 fail |
| vanilla-save-s9 1280x720 | provinceview (profile) | 91.4 % | 64.5 % | 99.0 % | 100.0 % | 100.0 % | 72 fail |
| vanilla-save-s12 1280x720 | provinceview (profile) | 89.8 % | 67.0 % | 99.2 % | 100.0 % | 100.0 % | 76 fail |
| vanilla-save-s14 1280x720 | countrygovernmentview, countryview, gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s15 1280x720 | ages_view | 88.8 % | 88.8 % | 94.4 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s24 1280x720 | countrygovernmentview, countryview | 100.0 % | 93.4 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s25 1280x720 | countrydiplomacyview (profile), countryview, hre_window | 98.1 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 32 fail |
| vanilla-save-s26 1280x720 | celestial_window, countrydiplomacyview (profile), countryview | 97.2 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| vanilla-save-s31 1280x720 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 82.6 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-save-s32 1280x720 | countrydiplomacyview (profile), countryview | 96.8 % | 81.4 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s34 1280x720 | countrytradeview, countryview | 98.4 % | 98.6 % | 98.4 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-save-s35 1280x720 | countrytechnologyview, countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s37 1280x720 | countrymissionsview, countryview | 100.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1280x720 | countrydecisionsview, countryview | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s39 1280x720 | countrystabilityview, countryview | 95.5 % | 96.6 % | 98.5 % | 100.0 % | 94.4 % | 19 fail |
| vanilla-save-s40 1280x720 | countryreligionview, countryview | 94.9 % | 75.3 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1280x720 | countrymilitaryview, countryview | 15.9 % | 96.4 % | 96.3 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1280x720 | countrysubjectview, countryview | 100.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s44 1280x720 | DefaultConfirm, countrygovernmentview, countryview, gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s59 1280x720 | countrytechnologyview, countryview | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s61 1280x720 | countrydecisionsview, countryview | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s62 1280x720 | DefaultConfirm, countrystabilityview, countryview | 94.5 % | 96.9 % | 98.6 % | 100.0 % | 95.0 % | 36 fail |
| vanilla-save-s63 1280x720 | countrystabilityview, countryview | 95.0 % | 97.3 % | 96.2 % | 100.0 % | 95.8 % | 10 fail |
| vanilla-save-s64 1280x720 | countryreligionview, countryview | 97.5 % | 52.1 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s65 1280x720 | countrymilitaryview, countryview, domesticpanel_unit_select | 23.1 % | 93.7 % | 96.5 % | 100.0 % | 100.0 % | 112 fail |
| vanilla-save-s66 1280x720 | ConfirmAndNameLeaderDialog, countrymilitaryview, countryview | 19.4 % | 95.1 % | 96.5 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s67 1280x720 | DefaultConfirm, countrymilitaryview, countryview | 19.4 % | 96.5 % | 96.5 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s68 1280x720 | countrymilitaryview, countryview, domesticpanel_naval_doctrine_select | 15.4 % | 96.5 % | 96.4 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s70 1280x720 | countrysubjectview, countryview | 100.0 % | 92.7 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s43 1280x720 | countryestatesview (profile), countryview | 86.1 % | 97.6 % | 86.1 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s0 1280x720 | country_selection_panel (profile) | 92.8 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 73.6 % | 69.0 % | 78.9 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-menu-s3 1280x720 | country_selection_panel (profile), menu_settings, menu_settings | 100.0 % | 62.2 % | 100.0 % | 97.7 % | 100.0 % | 7 fail |
| vanilla-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel, outliner, speed_controls, topbar (profile) | 93.7 % | 91.7 % | 99.1 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s1 1920x1080 | countrycourtview (profile), countryview | 100.0 % | 82.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s2 1920x1080 | hre_window | 100.0 % | 89.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s3 1920x1080 | parliament_window | 87.5 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s4 1920x1080 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s5 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 1920x1080 | macro_build_interface (profile) | 100.0 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 1920x1080 | provinceview (profile) | 84.1 % | 67.5 % | 99.2 % | 100.0 % | 100.0 % | 83 fail |
| vanilla-save-s8 1920x1080 | provinceview (profile) | 81.5 % | 70.0 % | 99.1 % | 100.0 % | 100.0 % | 86 fail |
| vanilla-save-s9 1920x1080 | provinceview (profile) | 83.9 % | 64.9 % | 99.0 % | 100.0 % | 100.0 % | 81 fail |
| vanilla-save-s10 1920x1080 | colonisationpanel | 97.2 % | 82.3 % | 97.2 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s12 1920x1080 | provinceview (profile) | 82.3 % | 67.5 % | 99.2 % | 100.0 % | 100.0 % | 89 fail |
| vanilla-save-s13 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s14 1920x1080 | countrygovernmentview, countryview, gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s15 1920x1080 | ages_view | 88.8 % | 88.8 % | 94.4 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 1920x1080 | waroverview | 90.6 % | 99.1 % | 100.0 % | 100.0 % | 100.0 % | 31 fail |
| vanilla-save-s24 1920x1080 | countrygovernmentview, countryview | 98.0 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s25 1920x1080 | countrydiplomacyview (profile), countryview, hre_window | 97.2 % | 74.7 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s26 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview | 97.2 % | 85.8 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s27 1920x1080 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s28 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 76.9 % | 100.0 % | 90.7 % | 13 fail |
| vanilla-save-s31 1920x1080 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 83.4 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s32 1920x1080 | countrydiplomacyview (profile), countryview | 96.8 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s33 1920x1080 | countryeconomyview, countryview | 93.4 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s34 1920x1080 | countrytradeview, countryview | 98.4 % | 98.5 % | 98.4 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s35 1920x1080 | countrytechnologyview, countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s36 1920x1080 | countryideasview, countryview | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s37 1920x1080 | countrymissionsview, countryview | 100.0 % | 97.7 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1920x1080 | countrydecisionsview, countryview | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s39 1920x1080 | countrystabilityview, countryview | 95.5 % | 96.7 % | 98.5 % | 100.0 % | 95.8 % | 18 fail |
| vanilla-save-s40 1920x1080 | countryreligionview, countryview | 93.2 % | 76.9 % | 98.3 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1920x1080 | countrymilitaryview, countryview | 15.1 % | 96.2 % | 96.3 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1920x1080 | countrysubjectview, countryview | 71.4 % | 88.1 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s44 1920x1080 | DefaultConfirm, countrygovernmentview, countryview, gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s45 1920x1080 | peace_view | 97.9 % | 87.4 % | 98.0 % | 97.0 % | 100.0 % | 22 fail |
| vanilla-save-s58 1920x1080 | DefaultConfirm, countryeconomyview, countryview | 92.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s59 1920x1080 | countrytechnologyview, countryview | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-save-s60 1920x1080 | countryideasview, countryview | 100.0 % | 96.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s61 1920x1080 | countrydecisionsview, countryview | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s62 1920x1080 | DefaultConfirm, countrystabilityview, countryview | 94.5 % | 97.0 % | 98.6 % | 100.0 % | 96.1 % | 22 fail |
| vanilla-save-s63 1920x1080 | countrystabilityview, countryview | 93.7 % | 97.2 % | 96.2 % | 100.0 % | 96.9 % | 11 fail |
| vanilla-save-s64 1920x1080 | countryreligionview, countryview | 95.1 % | 52.1 % | 97.5 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s65 1920x1080 | countrymilitaryview, countryview, domesticpanel_unit_select | 22.4 % | 93.5 % | 96.5 % | 100.0 % | 100.0 % | 114 fail |
| vanilla-save-s66 1920x1080 | ConfirmAndNameLeaderDialog, countrymilitaryview, countryview | 18.7 % | 95.0 % | 96.5 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s67 1920x1080 | DefaultConfirm, countrymilitaryview, countryview | 18.7 % | 96.4 % | 96.5 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s68 1920x1080 | countrymilitaryview, countryview, domesticpanel_naval_doctrine_select | 14.7 % | 96.3 % | 96.4 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s70 1920x1080 | countrysubjectview, countryview | 60.0 % | 88.9 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-save-s11 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 1920x1080 | countryestatesview (profile), countryview | 86.1 % | 97.4 % | 86.1 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-menu-s0 1920x1080 | country_selection_panel (profile) | 92.8 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 73.6 % | 69.0 % | 78.9 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings, menu_settings | 100.0 % | 62.2 % | 100.0 % | 97.7 % | 100.0 % | 7 fail |

### anbennar-alone

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| anbennar-alone-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel, outliner, speed_controls, topbar (profile) | 93.5 % | 70.3 % | 99.1 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s6 1280x720 | provinceview (profile) | 92.6 % | 54.5 % | 99.2 % | 100.0 % | 100.0 % | 73 fail |
| anbennar-alone-save-s7 1280x720 | provinceview (profile) | 92.6 % | 60.5 % | 99.1 % | 100.0 % | 100.0 % | 74 fail |
| anbennar-alone-save-s9 1280x720 | multi_unitpanel, single_unitpanel | 100.0 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s11 1280x720 | countrygovernmentview, countryview, gov_view_reform_select | 100.0 % | 63.1 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s12 1280x720 | ages_view | 87.5 % | 86.0 % | 93.7 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s14 1280x720 | provinceview (profile) | 90.3 % | 65.5 % | 99.1 % | 100.0 % | 100.0 % | 84 fail |
| anbennar-alone-save-s17 1280x720 | countrygovernmentview, countryview | 100.0 % | 52.0 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s18 1280x720 | countrydiplomacyview (profile), countryview, hre_window | 98.4 % | 78.0 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| anbennar-alone-save-s20 1280x720 | celestial_window, countrydiplomacyview (profile), countryview, tributary_shield | 97.2 % | 72.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| anbennar-alone-save-s25 1280x720 | multi_unitpanel, rebel_supression_panel, single_unitpanel | 100.0 % | 86.2 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s26 1280x720 | countrydiplomacyview (profile), countryview, great_powers | 98.0 % | 66.5 % | 100.0 % | 100.0 % | 100.0 % | 26 fail |
| anbennar-alone-save-s27 1280x720 | countrydiplomacyview (profile), countryview | 97.8 % | 62.2 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| anbennar-alone-save-s29 1280x720 | countrytradeview, countryview | 98.4 % | 98.7 % | 98.4 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s30 1280x720 | countrytechnologyview, countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| anbennar-alone-save-s32 1280x720 | countrymissionsview, countryview | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s33 1280x720 | countrydecisionsview, countryview | 100.0 % | 36.2 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s34 1280x720 | countrystabilityview, countryview | 98.4 % | 96.2 % | 98.4 % | 100.0 % | 91.6 % | 21 fail |
| anbennar-alone-save-s35 1280x720 | countryreligionview, countryview | 96.0 % | 46.0 % | 98.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s36 1280x720 | countrymilitaryview, countryview | 15.7 % | 93.1 % | 96.2 % | 100.0 % | 100.0 % | 116 fail |
| anbennar-alone-save-s38 1280x720 | provinceview (profile) | 71.0 % | 67.0 % | 99.1 % | 100.0 % | 100.0 % | 32 fail |
| anbennar-alone-save-s41 1280x720 | DefaultConfirm, countrytradeview, countryview | 98.6 % | 98.8 % | 98.6 % | 100.0 % | 100.0 % | 27 fail |
| anbennar-alone-save-s42 1280x720 | countrytechnologyview, countryview | 58.9 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-save-s47 1280x720 | countrydecisionsview, countryview | 100.0 % | 34.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s48 1280x720 | countryreligionview, countryview | 97.4 % | 41.6 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| anbennar-alone-save-s49 1280x720 | countrymilitaryview, countryview, domesticpanel_unit_select | 22.7 % | 90.9 % | 96.4 % | 100.0 % | 100.0 % | 111 fail |
| anbennar-alone-save-s51 1280x720 | DefaultConfirm, countrymilitaryview, countryview | 19.4 % | 93.5 % | 96.4 % | 100.0 % | 100.0 % | 122 fail |
| anbennar-alone-save-s24 1280x720 | multi_unitpanel, reorg_window | 100.0 % | 99.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s37 1280x720 | countryestatesview (profile), countryview | 92.8 % | 89.7 % | 96.4 % | 100.0 % | 100.0 % | 1 fail |
| anbennar-alone-menu-s0 1280x720 | country_selection_panel (profile) | 93.9 % | 77.2 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 73.8 % | 57.5 % | 80.9 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s3 1280x720 | country_selection_panel (profile), menu_settings, menu_settings | 100.0 % | 62.2 % | 100.0 % | 97.7 % | 100.0 % | 7 fail |
| anbennar-alone-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel, outliner, speed_controls, topbar (profile) | 93.5 % | 70.3 % | 99.1 % | 100.0 % | 100.0 % | 41 fail |
| anbennar-alone-save-s1 1920x1080 | countrycourtview (profile), countryview | 100.0 % | 93.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s2 1920x1080 | hre_window | 100.0 % | 91.9 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s3 1920x1080 | celestial_window, tributary_shield | 94.1 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 6 fail |
| anbennar-alone-save-s4 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s5 1920x1080 | macro_build_interface (profile) | 100.0 % | 61.2 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s6 1920x1080 | provinceview (profile) | 85.4 % | 54.8 % | 99.2 % | 100.0 % | 100.0 % | 85 fail |
| anbennar-alone-save-s7 1920x1080 | provinceview (profile) | 84.5 % | 60.9 % | 99.1 % | 100.0 % | 100.0 % | 84 fail |
| anbennar-alone-save-s9 1920x1080 | multi_unitpanel, single_unitpanel | 100.0 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s10 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s11 1920x1080 | countrygovernmentview, countryview, gov_view_reform_select | 100.0 % | 68.0 % | 100.0 % | 100.0 % | 100.0 % | 7 fail |
| anbennar-alone-save-s12 1920x1080 | ages_view | 87.5 % | 86.0 % | 93.7 % | 100.0 % | 100.0 % | 4 fail |
| anbennar-alone-save-s14 1920x1080 | provinceview (profile) | 81.7 % | 65.8 % | 99.1 % | 100.0 % | 100.0 % | 93 fail |
| anbennar-alone-save-s15 1920x1080 | colonisationpanel | 97.1 % | 78.4 % | 97.1 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s17 1920x1080 | countrygovernmentview, countryview | 97.8 % | 52.0 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| anbennar-alone-save-s18 1920x1080 | countrydiplomacyview (profile), countryview, hre_window | 97.6 % | 77.5 % | 100.0 % | 100.0 % | 100.0 % | 48 fail |
| anbennar-alone-save-s19 1920x1080 | DefaultConfirm, hre_window | 97.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s20 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview, tributary_shield | 96.3 % | 72.1 % | 100.0 % | 100.0 % | 100.0 % | 49 fail |
| anbennar-alone-save-s21 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 76.9 % | 100.0 % | 90.7 % | 13 fail |
| anbennar-alone-save-s25 1920x1080 | multi_unitpanel, rebel_supression_panel, single_unitpanel | 100.0 % | 86.2 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s26 1920x1080 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 66.3 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| anbennar-alone-save-s27 1920x1080 | countrydiplomacyview (profile), countryview | 96.7 % | 62.0 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| anbennar-alone-save-s28 1920x1080 | countryeconomyview, countryview | 93.3 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| anbennar-alone-save-s29 1920x1080 | countrytradeview, countryview | 98.4 % | 98.7 % | 98.4 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-save-s30 1920x1080 | countrytechnologyview, countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-save-s31 1920x1080 | countryideasview, countryview | 100.0 % | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s32 1920x1080 | countrymissionsview, countryview | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s33 1920x1080 | countrydecisionsview, countryview | 100.0 % | 36.2 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| anbennar-alone-save-s34 1920x1080 | countrystabilityview, countryview | 98.4 % | 96.2 % | 98.4 % | 100.0 % | 91.6 % | 20 fail |
| anbennar-alone-save-s35 1920x1080 | countryreligionview, countryview | 94.0 % | 46.0 % | 96.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s36 1920x1080 | countrymilitaryview, countryview | 14.9 % | 93.1 % | 96.2 % | 100.0 % | 100.0 % | 116 fail |
| anbennar-alone-save-s38 1920x1080 | provinceview (profile) | 84.3 % | 67.5 % | 99.1 % | 100.0 % | 100.0 % | 26 fail |
| anbennar-alone-save-s40 1920x1080 | DefaultConfirm, countryeconomyview, countryview | 92.3 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s41 1920x1080 | DefaultConfirm, countrytradeview, countryview | 98.6 % | 98.8 % | 98.6 % | 100.0 % | 100.0 % | 19 fail |
| anbennar-alone-save-s42 1920x1080 | countrytechnologyview, countryview | 58.9 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| anbennar-alone-save-s43 1920x1080 | countryideasview, countryview | 100.0 % | 88.3 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s44 1920x1080 | countrydecisionsview, countryview, topbar (profile) | 98.7 % | 56.2 % | 100.0 % | 100.0 % | 100.0 % | 37 fail |
| anbennar-alone-save-s45 1920x1080 | countrydecisionsview, countryview, topbar (profile) | 99.4 % | 57.6 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| anbennar-alone-save-s46 1920x1080 | countrydecisionsview, countryview, topbar (profile) | 100.0 % | 57.1 % | 100.0 % | 100.0 % | 100.0 % | 33 fail |
| anbennar-alone-save-s47 1920x1080 | countrydecisionsview, countryview | 100.0 % | 34.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| anbennar-alone-save-s48 1920x1080 | countryreligionview, countryview | 94.8 % | 41.6 % | 97.4 % | 100.0 % | 100.0 % | 16 fail |
| anbennar-alone-save-s49 1920x1080 | countrymilitaryview, countryview, domesticpanel_unit_select | 22.0 % | 90.9 % | 96.4 % | 100.0 % | 100.0 % | 112 fail |
| anbennar-alone-save-s51 1920x1080 | DefaultConfirm, countrymilitaryview, countryview | 18.6 % | 93.5 % | 96.4 % | 100.0 % | 100.0 % | 120 fail |
| anbennar-alone-save-s8 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| anbennar-alone-save-s16 1920x1080 | topbar (profile) | 97.0 % | 55.0 % | 100.0 % | 100.0 % | 100.0 % | 31 fail |
| anbennar-alone-save-s24 1920x1080 | multi_unitpanel, reorg_window | 100.0 % | 99.6 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| anbennar-alone-save-s37 1920x1080 | countryestatesview (profile), countryview | 92.8 % | 88.6 % | 96.4 % | 100.0 % | 100.0 % | 3 fail |
| anbennar-alone-menu-s0 1920x1080 | country_selection_panel (profile) | 93.9 % | 77.2 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| anbennar-alone-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow | 73.8 % | 57.5 % | 80.9 % | 100.0 % | 100.0 % | 15 fail |
| anbennar-alone-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| anbennar-alone-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings, menu_settings | 100.0 % | 62.2 % | 100.0 % | 97.7 % | 100.0 % | 7 fail |

### bigger-ui

| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |
| --- | --- | --- | --- | --- | --- | --- | --- |
| vanilla-save-s0 1280x720 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel, outliner, speed_controls, topbar (profile) | 93.7 % | 92.0 % | 99.1 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s7 1280x720 | provinceview (profile) | 91.5 % | 67.1 % | 99.2 % | 100.0 % | 100.0 % | 70 fail |
| vanilla-save-s8 1280x720 | provinceview (profile) | 89.3 % | 69.6 % | 99.1 % | 100.0 % | 100.0 % | 76 fail |
| vanilla-save-s9 1280x720 | provinceview (profile) | 91.4 % | 64.5 % | 99.0 % | 100.0 % | 100.0 % | 72 fail |
| vanilla-save-s12 1280x720 | provinceview (profile) | 89.8 % | 67.0 % | 99.2 % | 100.0 % | 100.0 % | 76 fail |
| vanilla-save-s14 1280x720 | countrygovernmentview, countryview, gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s15 1280x720 | ages_view | 88.8 % | 88.8 % | 94.4 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s24 1280x720 | countrygovernmentview, countryview | 100.0 % | 93.4 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s25 1280x720 | countrydiplomacyview (profile), countryview, hre_window | 98.1 % | 75.0 % | 100.0 % | 100.0 % | 100.0 % | 32 fail |
| vanilla-save-s26 1280x720 | celestial_window, countrydiplomacyview (profile), countryview | 97.2 % | 85.2 % | 100.0 % | 100.0 % | 100.0 % | 44 fail |
| vanilla-save-s31 1280x720 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 82.6 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-save-s32 1280x720 | countrydiplomacyview (profile), countryview | 96.8 % | 81.4 % | 100.0 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s34 1280x720 | countrytradeview, countryview | 98.4 % | 98.6 % | 98.4 % | 100.0 % | 100.0 % | 16 fail |
| vanilla-save-s35 1280x720 | countrytechnologyview, countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s37 1280x720 | countrymissionsview, countryview | 100.0 % | 97.8 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1280x720 | countrydecisionsview, countryview | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s39 1280x720 | countrystabilityview, countryview | 95.5 % | 96.6 % | 98.5 % | 100.0 % | 94.4 % | 19 fail |
| vanilla-save-s40 1280x720 | countryreligionview, countryview | 94.9 % | 75.3 % | 100.0 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1280x720 | countrymilitaryview, countryview | 15.9 % | 96.4 % | 96.3 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1280x720 | countrysubjectview, countryview | 100.0 % | 92.3 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s44 1280x720 | DefaultConfirm, countrygovernmentview, countryview, gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s59 1280x720 | countrytechnologyview, countryview | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-save-s61 1280x720 | countrydecisionsview, countryview | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s62 1280x720 | DefaultConfirm, countrystabilityview, countryview | 94.5 % | 96.9 % | 98.6 % | 100.0 % | 95.0 % | 36 fail |
| vanilla-save-s63 1280x720 | countrystabilityview, countryview | 95.0 % | 97.3 % | 96.2 % | 100.0 % | 95.8 % | 10 fail |
| vanilla-save-s64 1280x720 | countryreligionview, countryview | 97.5 % | 51.0 % | 100.0 % | 100.0 % | 100.0 % | 10 fail |
| vanilla-save-s65 1280x720 | countrymilitaryview, countryview, domesticpanel_unit_select | 22.6 % | 93.2 % | 96.4 % | 100.0 % | 100.0 % | 112 fail |
| vanilla-save-s66 1280x720 | ConfirmAndNameLeaderDialog, countrymilitaryview, countryview | 19.4 % | 95.1 % | 96.5 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s67 1280x720 | DefaultConfirm, countrymilitaryview, countryview | 19.4 % | 96.5 % | 96.5 % | 100.0 % | 100.0 % | 127 fail |
| vanilla-save-s68 1280x720 | countrymilitaryview, countryview, domesticpanel_naval_doctrine_select | 15.4 % | 96.5 % | 96.4 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s70 1280x720 | countrysubjectview, countryview | 100.0 % | 92.7 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s43 1280x720 | countryestatesview (profile), countryview | 86.1 % | 97.6 % | 86.1 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-menu-s0 1280x720 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 1280x720 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 73.6 % | 69.0 % | 78.9 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-menu-s2 1280x720 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 0 fail |
| vanilla-menu-s3 1280x720 | country_selection_panel (profile), menu_settings, menu_settings | 100.0 % | 62.2 % | 100.0 % | 97.7 % | 100.0 % | 7 fail |
| vanilla-save-s0 1920x1080 | diplomessageicons_window, menubar (profile), message_icons, minimap_panel, outliner, speed_controls, topbar (profile) | 93.7 % | 91.7 % | 99.1 % | 100.0 % | 100.0 % | 40 fail |
| vanilla-save-s1 1920x1080 | countrycourtview (profile), countryview | 100.0 % | 82.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s2 1920x1080 | hre_window | 100.0 % | 89.1 % | 100.0 % | 100.0 % | 100.0 % | 3 fail |
| vanilla-save-s3 1920x1080 | parliament_window | 87.5 % | 96.7 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s4 1920x1080 | celestial_window | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 4 fail |
| vanilla-save-s5 1920x1080 | ledger (profile) | 100.0 % | 68.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s6 1920x1080 | macro_build_interface (profile) | 100.0 % | 62.7 % | 100.0 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s7 1920x1080 | provinceview (profile) | 84.1 % | 67.5 % | 99.2 % | 100.0 % | 100.0 % | 83 fail |
| vanilla-save-s8 1920x1080 | provinceview (profile) | 81.5 % | 70.0 % | 99.1 % | 100.0 % | 100.0 % | 86 fail |
| vanilla-save-s9 1920x1080 | provinceview (profile) | 83.9 % | 64.9 % | 99.0 % | 100.0 % | 100.0 % | 81 fail |
| vanilla-save-s10 1920x1080 | colonisationpanel | 97.2 % | 82.3 % | 97.2 % | 100.0 % | 100.0 % | 14 fail |
| vanilla-save-s12 1920x1080 | provinceview (profile) | 82.3 % | 67.5 % | 99.2 % | 100.0 % | 100.0 % | 89 fail |
| vanilla-save-s13 1920x1080 | great_powers | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s14 1920x1080 | countrygovernmentview, countryview, gov_view_reform_select | 100.0 % | 93.8 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s15 1920x1080 | ages_view | 88.8 % | 88.8 % | 94.4 % | 100.0 % | 100.0 % | 5 fail |
| vanilla-save-s16 1920x1080 | waroverview | 90.6 % | 99.2 % | 100.0 % | 100.0 % | 100.0 % | 29 fail |
| vanilla-save-s24 1920x1080 | countrygovernmentview, countryview | 98.0 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s25 1920x1080 | countrydiplomacyview (profile), countryview, hre_window | 97.2 % | 74.7 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s26 1920x1080 | celestial_window, countrydiplomacyview (profile), countryview | 97.2 % | 85.8 % | 100.0 % | 100.0 % | 100.0 % | 43 fail |
| vanilla-save-s27 1920x1080 | DefaultConfirm, celestial_window | 95.6 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 11 fail |
| vanilla-save-s28 1920x1080 | ledger (profile) | 100.0 % | 42.1 % | 76.9 % | 100.0 % | 90.7 % | 13 fail |
| vanilla-save-s31 1920x1080 | countrydiplomacyview (profile), countryview, great_powers | 97.1 % | 83.4 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s32 1920x1080 | countrydiplomacyview (profile), countryview | 96.8 % | 82.3 % | 100.0 % | 100.0 % | 100.0 % | 39 fail |
| vanilla-save-s33 1920x1080 | countryeconomyview, countryview | 93.4 % | 98.1 % | 100.0 % | 100.0 % | 100.0 % | 13 fail |
| vanilla-save-s34 1920x1080 | countrytradeview, countryview | 98.4 % | 98.5 % | 98.4 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s35 1920x1080 | countrytechnologyview, countryview | 100.0 % | 97.6 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-save-s36 1920x1080 | countryideasview, countryview | 100.0 % | 98.5 % | 100.0 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-save-s37 1920x1080 | countrymissionsview, countryview | 100.0 % | 97.7 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s38 1920x1080 | countrydecisionsview, countryview | 100.0 % | 98.0 % | 100.0 % | 100.0 % | 100.0 % | 8 fail |
| vanilla-save-s39 1920x1080 | countrystabilityview, countryview | 95.5 % | 96.7 % | 98.5 % | 100.0 % | 95.8 % | 18 fail |
| vanilla-save-s40 1920x1080 | countryreligionview, countryview | 93.2 % | 76.9 % | 98.3 % | 100.0 % | 100.0 % | 21 fail |
| vanilla-save-s41 1920x1080 | countrymilitaryview, countryview | 15.1 % | 96.2 % | 96.3 % | 100.0 % | 100.0 % | 121 fail |
| vanilla-save-s42 1920x1080 | countrysubjectview, countryview | 71.4 % | 88.1 % | 100.0 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s44 1920x1080 | DefaultConfirm, countrygovernmentview, countryview, gov_view_reform_select | 98.5 % | 94.0 % | 100.0 % | 100.0 % | 100.0 % | 12 fail |
| vanilla-save-s45 1920x1080 | peace_view | 97.9 % | 92.1 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s58 1920x1080 | DefaultConfirm, countryeconomyview, countryview | 92.4 % | 98.4 % | 100.0 % | 100.0 % | 100.0 % | 17 fail |
| vanilla-save-s59 1920x1080 | countrytechnologyview, countryview | 60.0 % | 95.2 % | 100.0 % | 100.0 % | 100.0 % | 18 fail |
| vanilla-save-s60 1920x1080 | countryideasview, countryview | 100.0 % | 96.9 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s61 1920x1080 | countrydecisionsview, countryview | 100.0 % | 91.4 % | 100.0 % | 100.0 % | 100.0 % | pass |
| vanilla-save-s62 1920x1080 | DefaultConfirm, countrystabilityview, countryview | 94.5 % | 97.0 % | 98.6 % | 100.0 % | 96.1 % | 22 fail |
| vanilla-save-s63 1920x1080 | countrystabilityview, countryview | 93.7 % | 97.2 % | 96.2 % | 100.0 % | 96.9 % | 11 fail |
| vanilla-save-s64 1920x1080 | countryreligionview, countryview | 95.1 % | 52.1 % | 97.5 % | 100.0 % | 100.0 % | 15 fail |
| vanilla-save-s65 1920x1080 | countrymilitaryview, countryview, domesticpanel_unit_select | 22.4 % | 93.5 % | 96.5 % | 100.0 % | 100.0 % | 113 fail |
| vanilla-save-s66 1920x1080 | ConfirmAndNameLeaderDialog, countrymilitaryview, countryview | 18.7 % | 95.0 % | 96.5 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s67 1920x1080 | DefaultConfirm, countrymilitaryview, countryview | 18.7 % | 96.4 % | 96.5 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s68 1920x1080 | countrymilitaryview, countryview, domesticpanel_naval_doctrine_select | 14.7 % | 96.3 % | 96.4 % | 100.0 % | 100.0 % | 125 fail |
| vanilla-save-s70 1920x1080 | countrysubjectview, countryview | 60.0 % | 88.9 % | 100.0 % | 100.0 % | 100.0 % | 23 fail |
| vanilla-save-s11 1920x1080 | outliner_configuration | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-save-s43 1920x1080 | countryestatesview (profile), countryview | 86.1 % | 97.4 % | 86.1 % | 100.0 % | 100.0 % | 9 fail |
| vanilla-menu-s0 1920x1080 | country_selection_panel (profile) | 95.6 % | 71.4 % | 100.0 % | 100.0 % | 100.0 % | 2 fail |
| vanilla-menu-s1 1920x1080 | country_selection_panel (profile), shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield, shield_thin_glow, shield_thin_glow, shield_thin_glow | 73.6 % | 69.0 % | 78.9 % | 100.0 % | 100.0 % | 19 fail |
| vanilla-menu-s2 1920x1080 | CreditsWindow, country_selection_panel (profile) | 100.0 % | 29.4 % | 100.0 % | 100.0 % | 100.0 % | 1 fail |
| vanilla-menu-s3 1920x1080 | country_selection_panel (profile), menu_settings, menu_settings | 100.0 % | 62.2 % | 100.0 % | 97.7 % | 100.0 % | 7 fail |

