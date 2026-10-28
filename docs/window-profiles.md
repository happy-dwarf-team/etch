# Window profiles

A **window profile** tells Etch what it cannot read in a window's `.gui` file: which nested
windows and widgets the game shows in each situation, and why. With a profile, Etch's preview
draws one **view** of the window, as the game would show it, instead of every widget at once.
This page is for mod authors who want a view of their own, or a profile for a window Etch does
not describe yet. The format is decided in
[ADR 0006](adr/0006-window-profiles-as-layered-jsonc-files.md); the
[v2 specification](spec/v2.md) (sections 3 and 4) says what the preview does with it.

## Where profiles come from

A window's profile is made of layers, applied in this order:

1. **Vanilla**: Etch's own profile of the window for the base game, used in every playset.
2. **Each mod of the playset**, in playset order: Etch's own profile for that mod, matched by its
   Workshop `remote_file_id`, else by the descriptor's `name`.
3. **Your mod project**: `.etch/profiles/<window>.jsonc` beside your `descriptor.mod`, for
   example `.etch/profiles/provinceview.jsonc`. It can be committed with your mod.

Each entry of a profile has a key (its id). A later layer **replaces** a whole entry by its key,
**adds** one, or **removes** one with `null`; nothing is merged deeply. Your own file can add a
rule, change a view of Etch's, or drop a rule that does not fit your mod.

Etch ships profiles (`profiles/<source>/` in the repository) for `provinceview` and for the
windows of the precision corpus, in vanilla and for Anbennar. A window without a profile is drawn
with every widget, as Etch 1.x drew it. The vanilla `provinceview` profile also names the source
of each code-filled text (the province's name, development, culture, religion, autonomy,
garrison, trade goods; the engine's income, supply and modifiers), the great projects list and the
link to `colonisationpanel`; the Anbennar playsets use it as it is.

## A small example

```jsonc
// .etch/profiles/provinceview.jsonc in a mod that adds a panel to the province view.
{
  "formatVersion": 1,
  "window": "provinceview",
  "selectors": {
    "myPanel": {
      "kind": "scripted",
      "label": "My panel",
      "values": { "closed": "Closed", "open": "Open" },
      "note": "custom_gui/my_panel.txt: FROM has the flag my_panel_open",
    },
  },
  "rules": {
    "my-panel-closed": {
      "when": { "myPanel": "closed" },
      "hide": ["provinceview/province_window/my_panel_window"],
    },
  },
  "views": {
    "my-panel": {
      "label": "My panel open",
      "set": { "owner": "yes", "tab": "province", "myPanel": "open" },
    },
  },
}
```

VS Code checks the file as you type: Etch binds a JSON Schema to `.etch/profiles/*.jsonc`, so
properties complete and wrong ones are underlined.

## The file

| Property | What it holds |
| --- | --- |
| `formatVersion` | `1`. A file with a newer version than your Etch reads is skipped with a notice. |
| `window` | The top-level window's name, as its `.gui` file writes it. |
| `checkedWith` | Optional: the game's or the mod's version the file was checked with. Another version gives a notice; the profile still applies. |
| `selectors` | What decides which view the game shows, keyed by id. |
| `groups` | Exclusive groups, keyed by id. |
| `rules` | What shows and what hides in which case, keyed by id. |
| `views` | Named views, keyed by id. |
| `content` | The source of each code-filled widget's text, keyed by widget path. |
| `repeaters` | List boxes the game's code fills, keyed by the list box's path. |
| `links` | Windows the game opens instead of this one, keyed by id. |
| `defaultView` | The view the preview opens on; the first view when no layer names one. |

Etch's own mod profiles also have `mod` (`remoteFileId`, `name`), which matches them with the
playset's mods. Your project's file needs none.

### Selectors

A selector has a `kind`, a `label`, its `values` (keyed by id, each with a label), a `default`
(the first value when not given) and an optional `note`.

| Kind | Its value comes from | Example |
| --- | --- | --- |
| `resolution` | the preview's screen size: each value gives its bounds, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` (inclusive) | `"small": { "maxHeight": 813 }` |
| `data` | one named **fact**, read from the save chosen for the preview; its values are the fact's | `"fact": "province.ownedByPlayer"` |
| `ui` | what the player clicked open, set by hand or by a view | a tab, a side panel |
| `scripted` | a mod's scripted interface, set by hand; Etch shows the `note` and never evaluates a trigger | Anbennar's aPUI windows |

The facts a `data` selector can read are the ones Etch implements; a new fact needs an Etch
release.

| Fact | Values | Meaning |
| --- | --- | --- |
| `province.ownedByPlayer` | `yes`, `no` | The province's owner is the player's country. |
| `province.owned` | `yes`, `no` | The province has an owner. |
| `province.occupied` | `yes`, `no` | Its controller is not its owner. |
| `province.constructing` | `yes`, `no` | It builds something. |
| `province.hasGreatProjects` | `yes`, `no` | It lists great projects. |
| `province.hasFort` | `yes`, `no` | Its buildings hold a fort (`fort_…`). |
| `province.isCapital` | `yes`, `no` | It is its owner's capital (the owner's `capital`). |
| `province.isTradePort` | `yes`, `no` | It is its owner's trade port (the owner's `trade_port`). |
| `province.parliamentSeat` | `seat`, `noSeat`, `none` | It has a seat in its owner's parliament (`seat_in_parliament`), has none, or the owner has no `parliament`. |
| `province.centerOfTrade` | `yes`, `no` | It is a centre of trade (`center_of_trade` above 0). |
| `province.hreIndicator` | `yes`, `no` | The game shows its Holy Roman Empire indicator (the empire exists and the province can be part of it). The map decides that, not the save; it stays at the default until you set it. |
| `owner.buildsNativeBuildings` | `yes`, `no` | The owner builds native buildings. A save does not say; it stays at the default until you set it. |

### Exclusive groups

A group names a `selector` and its `members`: a widget path for each selector value. The member
of the selector's value shows and the others are hidden. With `"none": true` a value may have no
member, and then none shows; without it every value needs a member.

```jsonc
"side": {
  "label": "Side panel",
  "selector": "side",
  "none": true,
  "members": {
    "buildings": "provinceview/buildings_window",
    "institutions": "provinceview/institutions_window",
    "history": "provinceview/history_window",
  },
},
```

### Rules

A rule applies when every condition of `when` holds (a selector and one value, or a list of
values); without `when` it always applies. Its effects:

| Effect | What it does |
| --- | --- |
| `show`, `hide` | lists of paths shown or hidden |
| `notCreated` | paths the game does not create at all in this case |
| `position` | paths the game's code moves, each to a `positionType` of the window's file |
| `frame` | paths whose sprite frame (from 1) the game's code sets |

A rule may have a `note`. Groups apply first, then the rules in layer order (a later rule wins),
then the hand toggles of the preview.

### Views

A view has a `label`, the selector values it `set`s and optional hand `toggles` (a path and
`true` for shown, `false` for hidden). A view does not set a `resolution` selector: the preview's
screen does.

### Content

The game's code fills many texts of a window (a province's name, its tax, its culture); their
`.gui` text is a placeholder. `content` gives each one a source, and the preview shows **sample
data** there (spec section 5). Each entry has one source:

| Source | Example | The text |
| --- | --- | --- |
| `save` | `{ "save": "provinces.{province}.base_tax", "format": "number" }` | the value in the save chosen in `Data ▾` |
| `loc` | `{ "loc": "PROVINCE_VIEW_TITLE" }` | the playset's localisation of the key |
| `engine` | `{ "engine": true, "generated": "number" }` | only a live snapshot knows it (income, unrest, supply) |
| `generated` | `{ "generated": "percent" }` | generated text only |

Every entry also falls through to the **generated** layer when its source has no value: text,
a number, a percentage or a date (`generated`; by default `text`, or the save value's
format) at the length chosen in `Data ▾`. A save source takes:

- `format`: `text` (as the save writes it, the default), `number` (at most two decimals,
  trailing zeros dropped, or `decimals` from 0 to 4) or `percent` (the number and `%`; the
  save's `local_autonomy=12.500` shows `12.5%`).
- `transform`: `sum` adds up several save paths (`"save": [ … ]`, a number), `localise`
  shows the localisation of the value (`culture=swedish` shows "Swedish", `owner="SWE"` shows
  "Sweden"). These are the only transforms: Etch never works a value out as the engine would.

The save paths Etch reads:

| Path | Of |
| --- | --- |
| `provinces.{province}.<key>` | the province chosen in `Data ▾` |
| `countries.{country}.<key>` | the country chosen in `Data ▾`, the save's player by default |
| `countries.{owner}.<key>` | the chosen province's owner |
| `meta.date`, `meta.player`, `meta.displayed_country_name` | the save's meta |

A province's keys: `name`, `owner`, `controller`, `previous_controller`, `trade`,
`original_culture`, `native_culture`, `culture`, `religion`, `original_religion`, `capital`,
`is_city`, `garrison`, `base_tax`, `original_tax`, `base_production`, `base_manpower`,
`likely_rebels`, `trade_goods`, `local_autonomy`, `devastation`, `center_of_trade`, `trade_power`,
`hre`, `unrest`, `nationalism`, `colonysize`, `native_size`, `native_ferocity`,
`native_hostileness`, `original_coloniser`, `missionary_progress`, `active_trade_company`, `winter`.
A country's keys: `government_rank`, `government_name`, `capital`, `original_capital`, `trade_port`,
`treasury`, `estimated_monthly_income`, `inflation`, `corruption`, `prestige`, `stability`,
`legitimacy`, `devotion`, `republican_tradition`, `meritocracy`, `horde_unity`, `army_tradition`,
`navy_tradition`, `army_professionalism`, `mercantilism`, `splendor`, `absolutism`,
`war_exhaustion`, `papal_influence`, `piety`, `innovativeness`, `great_power_score`, `manpower`,
`max_manpower`, `sailors`, `max_sailors`, `religion`, `dominant_religion`, `religious_unity`,
`primary_culture`, `dominant_culture`, `technology_group`, `unit_type`, `national_focus`,
`base_tax`, `development`, `raw_development`, `realm_development`, `num_of_cities`,
`average_unrest`, `average_autonomy`. Collections
for repeaters: a province's `buildings`, `building_builders`, `cores`, `claims`, `great_projects`,
`institutions`, `discovered_by`, `modifier`; a country's `active_idea_groups`, `owned_provinces`,
`core_provinces`, `allies`, `subjects`, `active_policy`.
Any other path is an error when the profile loads; a new one needs an Etch release
(`packages/core/src/profile/save-paths.ts`).

### Repeaters

A repeater fills a list box with entries of a `template` (a top-level definition of the
playset, such as a `windowType`): one per child of the save collection `from`, or, without a
save, `count` generated entries (3 by default). `fields` gives each text of an entry a source,
keyed by its path in the template, the template's name first. In a field, `entry` is the child:
`entry.key` its key, `entry.value` its value, `entry.<key>` a key of its block, and `entry`
alone its value, or its key when the value is `yes` (`temple=yes` gives `temple`).

```jsonc
"provinceview/**/building_list": {
  "template": "building_entry",
  "from": "provinces.{province}.buildings",
  "fields": {
    "building_entry/name": { "save": "entry", "transform": "localise" },
  },
},
```

The entries start at the list's `borderSize`, each below the last (beside it with
`horizontal`) with `spacing` between; only those that fit whole show, as the preview does not
scroll. In an `OverlappingElementsBoxType` (the core shields of `cores_box`) they go side by side,
`spacing` apart, closer when they do not fit.

The game's code puts some entries straight into a window rather than a list box: the building
slots of `general_buildings_window`, the units of `build_army_view`. A repeater on such a window
says where with `place`: the first entry at `start`, each next `step` further (the template's size
by default) and, with `columns`, a new row after that many. Each is a `positionType` of the
window's file, which the game itself reads, so every playset's file gives its own, or pixels:

```jsonc
"provinceview/buildings_window/general_buildings_window": {
  "template": "building_progress_entry",
  "count": 8,
  "place": { "start": "building_start", "step": "building_offset", "columns": "building_max_per_row" },
},
```

`Data ▾` lists the repeaters the view draws with their number of entries, which **−** and **+**
change (the save's entries first, generated ones after) and **Reset** gives back.

### Links

A link names a `window` the game opens instead of this one when every condition of `when`
holds, and an optional `label`. While it holds, the preview draws the linked window, as the game
shows it, with the label and a button that pins the linked window to edit it; `View ▾` stays this
window's, so its selectors switch back:

```jsonc
"links": {
  "uncolonised": {
    "when": { "owned": "no" },
    "window": "colonisationpanel",
    "label": "An uncolonised province opens the colonisation panel.",
  },
},
```

### Paths

Widgets are named by their path of names from the top-level window, joined by `/`, never by
position: `provinceview/province_window/queue_window`. Names are compared without regard to case.

- `*` and `?` stand for characters of one name: `provinceview/province_window/*_value`.
- `**` stands for any number of levels: `provinceview/**/close_button`.
- `[n]` picks one of siblings that share a name: `provinceview/bg[2]`.

## What Etch does by itself

For a window that has a profile, Etch derives two things the game's code does by the screen
height, so a profile need not write them:

- Of two sibling widgets `X` and `X_large` the game creates only one: below 814 px of height the
  small one, from 814 px the large one.
- The `positionType` moves of the province view: `top_section_window` to
  `top_section_position_big` from 814 px, and `history`, `strait_indicator`,
  `river_indicator_2` and `state_window` to their low-resolution positions below it.

## Checks

Each layer is checked when it loads, against the schema and the playset's files: a path that names
no widget of the window, an unknown selector, value, fact, view, `positionType`, save path or
template, a repeater on a widget that is not a list box, or a link to a window the playset lacks
is an error.
The faulty entry is skipped and the rest of the profile applies.

- Your project's file: the errors are in the Problems panel, on their lines.
- Etch's own profiles: the errors go to the Etch log, with one notice in the preview.

## In the preview

- **`View ▾`** in the preview's toolbar lists the profile's views and yours, every selector with
  where its value comes from (`auto` for the screen, `save`, `live`, `you` for a value set by hand
  or by a view, `default`), **Save as view…**, **Reset hand toggles** and **Open profile**. A data
  selector follows the save until you set it; **follow save** releases it.
- The **Widget Outline** shows the members of an exclusive group as radios under a "(one of)"
  header and an eye on every other widget. A radio or an eye set by hand is a **hand toggle**: it
  is marked "by hand" and counted in the view's label ("Own province · 1 by hand"). A widget the
  game does not create at the preview's height is struck through.
- **`Data ▾`** has the layers of sample data, upper ones winning: **By hand** (**Type a text…**
  picks any text the view draws, a list entry's too, and asks for what it shows; **Clear** takes
  them all back), the live snapshot, the save, the game and mod files, and generated text; then the
  lists the game fills, each with its number of entries. In the Widget Outline, **Type Sample
  Text…** (the pencil on a text or button) and **Clear Sample Text** do the same for one widget.
  Typed texts are kept by window across sessions.
- **Save as view…** writes the current selectors and hand toggles under a name into your
  project's `.etch/profiles/<window>.jsonc`, creating the file if needed and keeping the rest of
  it, comments included. The view is an ordinary view of the top layer.

## A profile for another mod

A profile for a mod Etch does not describe comes by pull request to `profiles/<source>/`, with
`mod` naming the mod and `checkedWith` its version. Unless the mod is in the precision corpus, Etch
checks it only when it loads (paths, names, values), not against the game's captures; say so in
the pull request. Scripted groups (a mod's `custom_window` blocks) are written by hand: Etch does
not derive them from `potential` triggers.

Etch's own profiles of the corpus windows hide what the corpus captures show hidden (drafted from
the captures). The precision corpus gates them: each corpus view records the selector values it is
captured with, and the visibility each profile predicts at those values, for every widget of the
window, must match every capture of the corpus playsets (`corpus/README.md`, the visibility gate):
a widget the profile does not name is drawn, so one the game hides fails until the profile says
when the game hides it.
