# Etch

Etch previews Europa Universalis IV 1.37.5 interface mods in Visual Studio
Code while they are edited, and runs the game itself beside the editor, each
saved file reloaded into the game's own window. Website:
[etch.happydwarf.dev](https://etch.happydwarf.dev/).

## Requirements

- Windows (x64) and Visual Studio Code 1.100 or later.
- Europa Universalis IV 1.37.5 installed through Steam, or its folder in
  `etch.gamePath`. Etch draws with the game's own textures, fonts and
  localisation, and ships none of them.
- For the live game: the same game folder with build 1.37.5 exactly (the live
  game refuses any other `eu4.exe`). The extension creates its private install
  on first use, after one confirmation; it needs no other download.

## Preview

Open a `.gui` file and run **Etch: Open Preview**, or click the preview button
in the editor title. The preview opens beside the editor and shows the
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
- Of a `_large` pair the preview draws only the variant the game creates at the
  preview's height, and the province view's sections move where the game's code
  moves them.

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
  save.
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

## Etch 1.x

Etch 2.0.0 replaced 1.x's game host and its diff view with the live game. To
keep them, install 1.0.x: in the Extensions view, **Install Specific
Version…** on Etch, then 1.0.x, and turn off automatic updates for it. 1.0.x
gets bug fixes only until 2.0.0 and none after.

Etch only reads the game folder, the mods and the profile, and writes into the
mod's project only on request (**Save as view…**, **Override in my mod**). It
sends nothing anywhere: it has no telemetry.

## More from the Happy Dwarf Team

- [Anvil](https://anvil.happydwarf.dev/): the plugin loader for EU4 that the
  live game runs on, with its plugin catalog.
- [Tongs](https://anvil.happydwarf.dev/plugins/tongs/): an Anvil plugin that
  lets scripts and agents control a running game; Etch's precision corpus is
  captured with it, and the live game reads the widget tree through it.
- [happydwarf.dev](https://happydwarf.dev/): all of the team's projects.

## Feedback

Report problems and ideas in the
[issue tracker](https://github.com/happy-dwarf-team/etch/issues). The
[changelog](https://github.com/happy-dwarf-team/etch/blob/main/CHANGELOG.md) lists what each release changed.

## License

MIT, see [LICENSE](https://github.com/happy-dwarf-team/etch/blob/main/LICENSE).
