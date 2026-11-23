---
title: What Etch reads and writes
description: Which of your files Etch reads, what it writes only when you ask, what it keeps for itself, and what it never touches or sends.
---

Etch reads the game, your mods and your EU4 profile, so that it can draw and check them. It
writes into your mod only when you ask, keeps its own files in VS Code's storage for Etch, and
sends nothing anywhere.

## What Etch reads

- **The game folder**, which Etch finds through Steam's list of library folders, or which you set
  in `etch.gamePath`. Etch reads the game's interface files, textures, fonts, localisation,
  scripts and map files. It also reads `eu4.exe`, to check that it is version 1.37.5. See
  [Where Etch finds the game](../getting-started/finding-the-game.md).
- **Your mods**: the mod you edit and the other mods of its
  [playset](../reference/glossary.md#playset), the mods loaded with yours. These are the mods its
  descriptor names under `dependencies`, or the ones you list in `etch.playset`. Etch finds them
  in the Steam Workshop folder and in your profile's `mod` folder.
- **Your EU4 profile**, usually `Documents/Paradox Interactive/Europa Universalis IV`, or the
  folder the game's `userdir.txt` names:
  - `settings.txt`, for the preview's default resolution, and to warn you when your UI scale is
    not 1.0;
  - `save games`, when you pick a save for [sample data](../interface-windows/sample-data.md) or to
    start the [live game](../reference/glossary.md#live-game) from (Etch's own copy of EU4 that
    you play beside the editor);
  - `logs`, where **Etch: Show the Latest Script Profile** looks for the newest script profile;
  - `mod`, for the descriptors of your mods.

At every start, the [live game](../live-game/start-and-stop.md) copies your `settings.txt` and
`pdx_settings.txt` into its own folder, and the save you chose, if any. It plays with those
copies, never with your own files. The live game is EU4 itself, so Steam counts it as your EU4
session, as when you play.

## What Etch writes into your mod

Etch writes into your mod's folder only when you ask it to:

- **Save as View…** in **View ▾** writes the [view](../reference/glossary.md#view) you set up, one
  way the game shows the window, into `.etch/profiles/<window>.jsonc`, beside your
  `descriptor.mod`. The view holds your choices in **View ▾** and the widgets you showed or hid by
  hand. You can keep that file with your mod's other files. See
  [Views and window profiles](../interface-windows/views.md).
- **Save as view** on an entry of **Etch: Compare with the Live Game** writes into the same file a
  view that hides what the game hid. See
  [Snapshot and compare](../live-game/snapshot-and-compare.md).
- **Etch: Add Scripted Selectors to the Window Profile** finds the widgets of the previewed window
  (the window the preview shows) that have a `potential` in `common/custom_gui`. For each, it adds
  a choice to **View ▾**, shown or hidden, and writes it into the same file. See
  [Views and window profiles](../interface-windows/views.md).
- **Override in my mod**, or **Etch: Override in My Mod**, copies the file the playset uses, byte
  for byte, to the same path in your mod, and opens the copy. When your mod already has that
  file, nothing is copied. See [Pick mode](../live-game/pick-mode.md).
- **Rename Symbol** (<kbd>F2</kbd>) on a sprite name changes that name in your mod's `.gfx` file
  and in your mod's `.gui` and script files that use it. Files that were not open are changed
  and left unsaved, so nothing is written until you save them. See
  [Hovers and links](../textures-and-meshes/hovers-and-links.md#rename-a-sprite).
- **A colour you pick** in the colour picker of a `.gfx` file's font colour replaces the colour's
  numbers in that file, in the same form: three numbers in braces, or `0x` and eight digits. See
  [Hovers and links](../textures-and-meshes/hovers-and-links.md#font-colours-in-gfx-files).

Two more requests change a file through VS Code:

- **Etch: Choose the Preview Resolution**, or the resolution button in the preview, saves your
  choice in the `etch.previewResolution` setting. It goes into your workspace's settings when the
  setting is already there, and into your user settings otherwise. See
  [Zoom and resolution](../interface-windows/zoom-and-resolution.md).
- **Save with Encoding…** on an encoding warning opens VS Code's own **Save with Encoding**. Your
  file is saved only when you pick an encoding there. The other fixes, **Reopen as Windows 1252**
  and **Reopen as UTF-8 with BOM**, only open the file again. See
  [Encoding](../scripts/encoding.md).

## What Etch keeps in its own storage

VS Code gives each extension storage of its own, outside your mods. Etch keeps there:

- **The [private install](../live-game/private-install.md)**, the copy of the game that the live
  game runs from. It holds:
  - links to your game folder, which point at the game's files instead of copying them;
  - copies of the files at the top of the game folder;
  - its own EU4 profile and saves;
  - the parts that come with Etch: Anvil, which loads plugins into the game; Bellows, which makes
    the game start faster; Tongs, which reads the game's widgets for pick mode and live
    snapshots; and Etch's own plugin, which reloads the files you save into the game and carries
    out pick mode, live snapshots and Run selection.

  Etch checks those parts before every start. **Etch: Remove the Private Install** deletes it all.
- **The script profile page**, a Markdown file that Etch writes again each time you run **Etch:
  Show the Latest Script Profile**. See [Script profile](../scripts/script-profile.md).
- **Live snapshots**: what the live game showed in a window. Etch keeps the latest one for each
  window and playset. They stay in the storage VS Code keeps for your workspace: never in your
  mod's folder, and never shared. See [Snapshot and compare](../live-game/snapshot-and-compare.md).
- **The pictures beside the line numbers**, when you turn on `etch.editor.spriteThumbnails`:
  one small PNG picture for each texture they show. Etch makes a texture's picture again when the
  texture changes. See
  [Hovers and links](../textures-and-meshes/hovers-and-links.md#see-sprites-beside-the-line-numbers).
- **A few small choices**, such as the sample texts you type (**Type a Text…** in **Data ▾**,
  **Type Sample Text…** in the Widget Outline), your monitor's resolution, and that you confirmed
  the live game's first start.

## Report to Etch

When **Etch: Compare with the Live Game** lists a widget the preview draws otherwise than the game,
you can report it to Etch's team:

1. In the Problems panel, click the entry. Then press <kbd>Ctrl+.</kbd>, or click the light bulb,
   and choose **Report to Etch…**.
2. Etch shows what it will put in the report. Click **Open in Browser**.
3. Your browser opens a filled-in bug report (an "issue") on Etch's GitHub page. Add how to open
   the window in the game, if you can, and send it yourself. Nothing is posted until you do.

The report holds:

- a title with the kind of difference and the widget's name;
- the widget's path: its name and the names of the windows it sits in;
- the kind of difference, such as another place, or a widget that only one of them shows;
- the widget's place and size in the game and in the preview;
- whether the game and the preview show or hide it;
- whether the window has a window profile;
- the resolution;
- the versions of Etch, Anvil and Tongs.

No file or text of your mod goes in it.

## No game files in Etch

The extension contains no game files. It draws with the textures, fonts and localisation of the
game you installed, and needs that game to work. See
[Install and requirements](../getting-started/install.md).

## What it doesn't do

- Etch never writes to your game folder, your EU4 profile or your mods, except for the requests
  above. It never changes `eu4.exe`.
- Removing the private install removes only Etch's own files: Etch deletes the links themselves,
  not the game files they point to. Nothing in your game folder is touched.
- Run selection, which runs the script you select in the live game, changes only the game running
  in the live game, never your saves.
- Etch sends nothing anywhere. It has no telemetry: it collects nothing about how you use it.
  **Report to Etch…** only opens a filled-in bug report in your browser, for you to send.
- When the live game crashes, Etch closes the game's crash reporter (`CrashReporter.exe`) without
  sending its report.
