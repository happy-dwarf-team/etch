# Etch

Etch previews Europa Universalis IV 1.37.5 interface mods in Visual Studio
Code while they are edited, and runs the game itself beside the editor, each
saved file reloaded into the game's own window. Website:
[etch.happydwarf.dev](https://etch.happydwarf.dev/).

## Requirements

- Windows (x64) and Visual Studio Code 1.100 or later.
- Europa Universalis IV 1.37.5 installed through Steam, or its folder in
  `etch.gamePath` (a GOG game too, for the preview). Etch draws with the game's
  own textures, fonts and localisation, and ships none of them.
- For the live game: the same game folder with the Steam build 1.37.5 exactly
  (the live game refuses any other `eu4.exe`). The extension creates its private install
  on first use, after one confirmation; it needs no other download.

## Preview

Open your mod's folder, open a `.gui` file and run **Etch: Open Preview** from the
Command Palette (Ctrl+Shift+P), or click the preview button in the editor title. The preview opens beside the editor and shows the
**previewed window**: the top-level window that holds the cursor. It follows
the unsaved editor buffer on every change, including changes to the mod's
`.gfx` and localisation files, and the model's diagnostics (missing sprites,
fonts and textures, duplicate names and more) appear in the Problems panel.

- **Pin** keeps the preview on one window while other files are edited
  (**Etch: Pin or Unpin the Previewed Window**).
- The **Widget Outline** in the Explorer lists the previewed window's widgets.
  Clicking a widget in the preview reveals its source, hovering shows its path
  and rect, and the widget at the cursor is outlined in the preview.
- The preview resolution is the one in the game's `settings.txt`, else the
  monitor's. **Etch: Choose the Preview Resolution**, or the resolution button
  in the preview, picks the monitor's, one of the corpus resolutions (1280×720
  to 3840×2160; 3840×2160 is not yet measured against the game) or any width × height (`etch.previewResolution`).
  `if_resolution` blocks follow it. UI scale is always 1.0.
- **Zoom** changes only how big the preview is shown, never the resolution the
  window is laid out at. The preview opens fitted into the panel (never above
  100 %); **Ctrl+mouse wheel**, **Ctrl+=** and **Ctrl+-**, or the **−** and
  **+** buttons, zoom around the cursor, **Ctrl+0** goes to 100 % and
  **Ctrl+Shift+0** back to fit, as does a click on the zoom level. 100 % is
  one pixel of the screen per pixel of the monitor, as the game shows it, and
  above it only whole steps (200 % to 800 %) are offered, so pixels stay sharp.
  The mouse wheel or a drag pans a zoomed screen; picking, hover and the Widget
  Outline's highlight follow the zoom, and a highlighted widget outside the
  panel is brought into view. The preview keeps its zoom across a window reload.
- The game is found through Steam, or set `etch.gamePath`. The playset is the
  edited mod and the `dependencies` of its descriptor, or `etch.playset`.
  `etch.language` picks the localisation language.

### Views

A window with a **window profile** is drawn in one **view**, as the game would
show it, instead of every widget at once: the province view as an own or a
foreign province, with its province or state tab, one side panel and one
sub-panel. Etch ships profiles for `provinceview` and the windows of its
precision corpus, for the base game and for Anbennar.

- **View ▾** in the preview lists the profile's views and every selector with
  where its value comes from; the Widget Outline shows a window's alternatives
  as radios and an eye on every other widget. A radio or an eye set by hand is
  marked "by hand" and counted in the view's label.
- **Save as view…** writes the selectors and hand toggles into the mod's
  `.etch/profiles/<window>.jsonc`, which can be committed with the mod. A mod can
  write its own profile there; VS Code checks it as you type.
- **Etch: Add Scripted Selectors to the Window Profile** starts that file for a
  mod's scripted interface: each widget of the previewed window that
  `common/custom_gui` gives a `potential` becomes a selector, shown or hidden,
  set in **View ▾**, with the `potential` quoted in its note and, for a
  widget's own selector, its tooltip text in the label. Etch does not evaluate the trigger, but
  reads a few shapes: `always = yes` needs no selector and `always = no` always
  hides, widgets with the same `potential` share one selector, and widgets
  that test one `religion`, `tag`, `government`… against different values
  share one with a value each.
- Of a `_large` pair the preview draws only the variant the game creates at the
  preview's height, and the province view's sections move where the game's code
  moves them.
- A government mechanic's window (`gui` in `common/government_mechanics`) is
  drawn where the game puts it, among the mechanic's rows in the government
  view, so its negative positions land where they do in the game.

How to write a profile:
[docs/window-profiles.md](https://github.com/happy-dwarf-team/etch/blob/main/docs/window-profiles.md).

### Sample data

Texts the game's code fills (a province's name, its development, culture,
religion, a list of great projects) show **sample data** where the profile
names their source. **Data ▾** shows the layers, the upper winning: a live
snapshot, a save (a country and a province of it), the game's and the mod's
files, and generated text of a chosen length. Etch reads text saves itself,
zipped or plain; ironman and other binary saves are not readable. A value the
save does not hold, which the engine works out (income, modifiers), comes from
a live snapshot or is generated: Etch never computes one.

## The live game

**Etch: Start the Live Game**, or the preview's **Live game** button, starts a
private copy of the game with the edited mod's playset. You play it; each file
you **save** is reloaded into the game's own window, with its real data.

- The first start asks for confirmation. The live game takes your
  `settings.txt` and `pdx_settings.txt` at every start (changes in it do not
  persist), copies a save you choose, and counts as your EU4 session for
  Steam: Steam does not start your own game beside it. **Etch: Stop the Live
  Game** saves and stops it, as does closing the VS Code window.
- A quick pick offers **Continue** (the newest private save), **Main menu** or
  one of your saves; ironman saves are greyed out. **Etch: Open the Live Game's
  Saves Folder** opens its saves.
- Panels the game rebuilds (the province view, the country view's tabs, the
  ledger, settings, the event window, the HUD) are reloaded in place.
  Localisation and textures are reloaded too. A file nothing rebuilds
  (`countryview.gui`, `.gfx` files, fonts, `core.gui`, scripted GUIs) asks for a
  **planned restart**: Etch saves, starts the game again and continues the save,
  only after you click **Restart now**. A crash restarts the game at the newest
  save. After either restart the province view comes back on the province you
  had open, unless you opened something else first.
- New `error.log` lines go to the Problems panel on the edited file. A saved
  file whose copy in another mod of the playset wins is not reloaded, and Etch
  names that mod.
- Reloading does not work in ironman or multiplayer games.

The private install lives in the extension's storage: links to your game
folder, copies of its top-level files, its own profile and saves, and the
builds of [Anvil](https://anvil.happydwarf.dev/) (the plugin loader),
[Bellows](https://anvil.happydwarf.dev/plugins/bellows/) (a faster start),
[Tongs](https://anvil.happydwarf.dev/plugins/tongs/) (the widget tree) and
Etch's own Anvil plugin that come in the extension, checked against their
SHA-256 before every start. It never writes to your game folder, your profile
or your mods, and never changes `eu4.exe`. **Etch: Remove the Private Install**
deletes it.

### Pick mode

In the live game, **Ctrl+Shift+E** (`etch.liveGame.pickModeKey`) or **Etch:
Toggle Pick Mode** turns on pick mode: the widget under the pointer is outlined
with its name, kind, size and file, the wheel steps through the
widgets under the pointer, and a click opens its definition in VS Code, without
the game taking the click. A file of the base game or another mod
opens read-only; **Override in my mod** (also **Etch: Override in My Mod**)
copies it to the same path in your mod and opens the copy. A pick also pins the
preview on the picked window and takes a **live snapshot** of it: the texts,
visibility and states the game shows, which the preview uses as its upper data
layer. **Etch: Snapshot from the Live Game** takes one of the previewed window
when the game has it open.

**Etch: Compare with Live Game** (also in `Data ▾`) compares the previewed
window's offline preview with what the live game shows and lists in Problems
every widget the preview places or shows otherwise than the game. Most of them
are the preview's to fix: **Report to Etch** on an entry opens a new Etch issue
with its fields (the widget's path, both rectangles, the versions), which you
send yourself; no file or text of your mod goes in it. For a window Etch has no
profile of, **Save as view** keeps what the game hid as a view of your mod's
own profile.

### Run selection

In a script file of the playset, select an effect or a trigger and run it in
the live game (also from the editor's context menu while the game runs):

- **Etch: Run Selection in the Live Game** runs the effects in your country.
- **Etch: Run Selection in the Province on Screen** runs them in the province
  you have open in the game.
- **Etch: Check Selection as Trigger in the Live Game** says whether the
  trigger is true, in your country or the province on screen.

With nothing selected, the statement on the cursor's line runs, with its
block. The game's `error.log` lines from the run go to the Problems panel on
the selection. A trigger the game cannot read counts as true: Etch then shows
its error beside the answer. Run changes only the live game's private copy,
never your own saves, and does not work in ironman or multiplayer games.
**Continue** says when the newest private save was written after a Run.

## Script profile

Anvil's script profiler (Anvil 1.22 or newer, the **Script profiler** window in
the Anvil panel) times your events', decisions' and other owners' triggers and
effects in your own game and writes a CSV to the game's `logs` folder.
**Etch: Show Latest Script Profile** opens the newest one: how long the span
was, then the triggers and the effects, each with its longest rows (calls,
total, mean and the longest single run, `max`). A span that a load, the menu or
quitting ended early is marked interrupted. Blocks whose owner the profiler
cannot tell are one row, as in its window; the CSV splits them by where the
game runs them. With Anvil 1.22's scripted triggers and church aspects, the
page also lists every scripted trigger by its name, between the triggers and
the effects; that time is part of the triggers too. Each name links to where
it is written (an event, a decision, a mission, an `on_action`, a casus belli,
a triggered modifier, a church aspect or a scripted trigger), at the block the
row measured, such as an option's `ai_chance`: in the playset of your
workspace, or the game folder without one, so a profile from another playset
may not find every name. The page is a Markdown file in Etch's storage folder,
written again each time it opens. While a profile is shown, the script files show its
numbers too: a line above each measured event, option, decision and other
owner gives its triggers' and effects' time and calls (a scripted trigger's
from all its uses), and opens the profile. **Etch: Hide the Script Profile in
Script Files** takes them away.

## Province IDs and names

A script that names a province the map does not have, such as `owns = 5075`
or `5075 = { … }` on the 4941 provinces of EU4 1.37.5, gets no line in the
game's `error.log`, and the game may crash when it reads that province. Etch
warns about such ids in the script files you open (events, decisions,
missions, `common` and `history`): the province triggers and effects (`owns`,
`owns_core_province`, `province_id`, `add_core`, `add_permanent_claim`,
`set_capital` and more), province scopes, ids such as an event's `goto`, and
`who` of `province_distance` and `node` of `trading_policy_in_node`. A
negative id such as `owns = -1` is flagged too: the game keeps the sign.
The map is your playset's: `max_provinces` of `map/default.map`, a mod's when
it has its own, and the provinces its `map/definition.csv` lists. An id written
as a tag, a scope or a variable is not checked.

A few effects crash the game the same silent way on a name the playset does
not define: `add_idea_group` and `remove_idea_group` on an idea group, and
`remove_idea` on an idea. Etch warns about such a name against the idea
groups and ideas of your playset's `common/ideas`; names are case-sensitive,
as in the game. A scripted effect's `$argument$` is not checked, nor is
`has_idea_group`, which the game reports in `error.log`. `has_idea` is: the
game logs "Invalid idea" for it, but keeps the missing idea and crashes when
its tooltip is shown.

For some triggers and effects the game crashes on a missing name only when it
builds their tooltip, for example when you hover over a decision or an event
option that uses them. Etch warns about their names too, ignoring case and
skipping them inside a `custom_trigger_tooltip`, which shows its own text:
`has_active_policy` (`common/policies`), `enable_religion` (`common/religions`), `likely_rebels`
(`common/rebel_types`), `has_disaster_progress`'s `disaster`
(`common/disasters`), `current_icon` (the orthodox icons of
`common/religions`), `has_spawned_rebels` and `has_not_spawned_rebels`
(`common/rebel_types`) and `has_active_estate_agenda`
(`common/estate_agendas`).

`provincial_institution_progress`'s `which` (`common/institutions`),
`num_of_religion`'s `religion` (`common/religions`) and `had_active_policy`'s
`policy` (`common/policies`) are worse: the game crashes whenever the trigger
is evaluated, for a decision's `allow` on the first day of the game, so Etch
checks them inside a `custom_trigger_tooltip` too.

Every one of these crashes was tried in the game.

Script passed in a string is checked too, such as the `first_effect = "…"` of
vanilla's `simple_dynamic_effect`, which the game runs in place of the
scripted effect's `$first_effect$`. A quoted string may run over several
lines, as the game reads it.

**Etch: Check Province IDs and Names in the Playset** checks every script file
the playset loads, from all its mods, and lists the lines in the Problems
panel, so you can find which mod has one.

## Encoding

The game reads interface files and the script files of `common`, `events`,
`decisions`, `missions` and `history` as Windows-1252, and localisation as
UTF-8 with BOM. Where the next save would make the game read other characters
than the editor shows, such as a leader's name `é` saved as UTF-8, which the
game shows as `Ã©`, Etch warns and offers to reopen the file in the encoding
the game expects. A script file's comments are skipped: the game does not read
them.

## Textures

VS Code cannot open `.dds` and `.tga` files; with Etch they open in the
**Etch Texture Preview**, which reads them with the same code the preview
draws with. It lists the size, the format (DXT1, DXT3, DXT5, BGRA8 and the
other DDS layouts, with or without the DX10 header; TGA at 16, 24 or 32 bits,
raw, run-length or colour-mapped), the mip levels and whether the alpha is
used, and shows the image over a checkerboard. A DXT image whose size is not a
multiple of 4 says the size the game draws it at: its whole 4 × 4 blocks.

- **RGBA**, **RGB** and **A** show the colour with its alpha, the colour
  alone, or the alpha as grey.
- **Mip** picks a level of a DDS file's mip chain, down to 1 × 1.
- **Fit** shrinks a large texture into the panel (never above 100 %), **1:1**
  shows one texel per screen pixel, **−** and **+** or Ctrl+mouse wheel zoom.
- The texel under the mouse and its RGBA values show at the bottom.
- When the file changes on disk, for example a new export from your image
  editor, the preview shows it at once.

A file Etch cannot read names its format or defect instead, such as a DDS cube
map or a BC7 texture. To open a texture as text or with another viewer, use
**Reopen Editor With…**.

In `.gfx` and `.asset` files, a texture, mesh or animation path is a link
(Ctrl+click) to the file your playset loads: the mod's file over the game's,
and a `.tga` path that exists only as `.dds` to the `.dds`, as the game does.
Hovering a texture path shows the texture with its size and format and says
where it comes from; a path the playset does not have says so. A bare file
name (`texture_diffuse = "tower_diffuse.dds"` in a `pdxmesh`, an animation's
`file = "eagle_idle.anim"` in an `.asset` file) is looked up beside the mesh
or the `.asset` file, where vanilla keeps them.

## Etch 1.x

Etch 2.0.0 replaced 1.x's game host and its diff view with the live game. To
keep them, install 1.0.x: in the Extensions view, **Install Specific
Version…** on Etch, then 1.0.x, and turn off automatic updates for it. 1.0.x
gets bug fixes only until 2.0.0 and none after.

Etch only reads the game folder, the mods and the profile, and writes into the
mod's project only on request (**Save as view…**, **Override in my mod**). It
sends nothing anywhere: it has no telemetry, and **Report to Etch** only opens
a filled-in issue in your browser for you to send.

## More from the Happy Dwarf Team

- [Anvil](https://anvil.happydwarf.dev/): the plugin loader for EU4 that the
  live game runs on, with its plugin catalog.
- [Tongs](https://anvil.happydwarf.dev/plugins/tongs/): an Anvil plugin that
  lets scripts and agents control a running game; Etch's precision corpus is
  captured with it, and the live game reads the widget tree through it.
- [happydwarf.dev](https://happydwarf.dev/): all of the team's projects.

## Feedback

Report problems and ideas in the
[issue tracker](https://github.com/happy-dwarf-team/etch/issues). The first line of the
**Etch** output names the version and the build (`Etch 2.0.0 (abc1234) for EU4 1.37.5`); put
it in the report. When an installed VSIX replaces the extension's files without a reload,
Etch warns that the window still runs the old build and offers **Reload Window**. The
[changelog](https://github.com/happy-dwarf-team/etch/blob/main/CHANGELOG.md) lists what each release changed.

Questions, or not sure it is a bug? Ask in `#help-and-bugs` (Etch tag) or `#modding` on the team's
[Discord server](https://discord.happydwarf.dev/); what the team confirms there is tracked in the
issue tracker.

## License

MIT, see [LICENSE](https://github.com/happy-dwarf-team/etch/blob/main/LICENSE).
