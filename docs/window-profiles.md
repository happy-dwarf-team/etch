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
with every widget, as Etch 1.x drew it.

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
no widget of the window, an unknown selector, value, fact, view or `positionType` is an error.
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
the captures); a local test checks that the visibility each profile predicts for the paths it
names matches every capture of the corpus playsets.
