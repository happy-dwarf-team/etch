# Etch

Etch previews Europa Universalis IV 1.37.5 interface mods in Visual Studio
Code while they are edited. Website:
[etch.happydwarf.dev](https://etch.happydwarf.dev/).

This is a preview release: the
[v1 specification](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/v1.md)
says what comes before 1.0.0.

## Requirements

- Windows (x64) and Visual Studio Code 1.100 or later.
- Europa Universalis IV 1.37.5 installed through Steam, or its folder in
  `etch.gamePath`. Etch draws with the game's own textures, fonts and
  localisation, and ships none of them.
- For the game host: the same game folder with build 1.37.5 exactly (the
  game host refuses any other `eu4.exe`). The extension creates the game host
  install on first use, after one confirmation; it needs no other download.

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
- The **Backend** switch chooses the offline renderer, which draws the window
  from the mod's files alone, or the game host, a private copy of the game
  that draws the window itself (**Etch: Start the Game Host**).
- With the game host, **Diff** (**Etch: Toggle the Diff View**) shows where its
  image differs from the offline renderer's: red where both draw differently,
  blue where only the offline renderer draws, yellow where only the game host
  does. It needs the preview resolution to be the game host's and the same
  playset.
- The preview resolution is the one in the game's `settings.txt`, else the
  monitor's. **Etch: Choose the Preview Resolution**, or the resolution button
  in the preview, picks the monitor's, one of the corpus resolutions (1280×720
  to 3440×1440) or any width × height (`etch.previewResolution`).
  `if_resolution` blocks follow it. UI scale is always 1.0.
- The game is found through Steam, or set `etch.gamePath`. The playset is the
  edited mod and the `dependencies` of its descriptor, or `etch.playset`.
  `etch.language` picks the localisation language.

This is a layout preview: content the game's code fills in (lists, flags,
values) is not shown. See the
[v1 specification](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/v1.md)
for what 1.0.0 contains and in what order it is built.

Etch only reads the game folder, the mods and the profile. It sends nothing
anywhere: it has no telemetry.

## The game host

The game host is a private copy of the game that draws the previewed window
itself. Its folders are links to your game folder and its top-level files are
copies, with its own profile and an overlay mod for the preview; it lives in
the extension's storage. Into the copy Etch puts the builds of
[Anvil](https://anvil.happydwarf.dev/) (the plugin loader),
[Bellows](https://anvil.happydwarf.dev/plugins/bellows/) (a faster start) and
Etch's own Anvil plugin that come in the extension, checked against their
SHA-256 before every start. Plugins of your own Anvil install do not load into
it.

- It never writes to your game folder, your profile or your mods, and never
  changes `eu4.exe`: the copy's `eu4.exe` is checked against the 1.37.5 build
  before every start.
- Its playset is the preview's, with every DLC you own on. It runs borderless
  at the monitor's resolution, UI scale 1.0, with the sound off, behind VS
  Code.
- One game host runs per machine. It stops with **Etch: Stop the Game Host**,
  when the VS Code window closes, or after 30 minutes without a game host
  preview. **Etch: Remove the Game Host Install** deletes the copy.

## More from the Happy Dwarf Team

- [Anvil](https://anvil.happydwarf.dev/): the plugin loader for EU4 that the
  game host runs on, with its plugin catalog.
- [Tongs](https://anvil.happydwarf.dev/plugins/tongs/): an Anvil plugin that
  lets scripts and agents control a running game; Etch's precision corpus is
  captured with it.
- [happydwarf.dev](https://happydwarf.dev/): all of the team's projects.

## Feedback

Report problems and ideas in the
[issue tracker](https://github.com/happy-dwarf-team/etch/issues). The
[changelog](https://github.com/happy-dwarf-team/etch/blob/main/CHANGELOG.md) lists what each release changed.

## License

MIT, see [LICENSE](https://github.com/happy-dwarf-team/etch/blob/main/LICENSE).
