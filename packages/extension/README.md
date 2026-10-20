# Etch

Etch previews Europa Universalis IV 1.37.5 interface mods in Visual Studio
Code while they are edited.

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
- The offline renderer draws the window from the mod's files alone; the game
  host backend comes in a later release.
- The game is found through Steam, or set `etch.gamePath`. The playset is the
  edited mod and the `dependencies` of its descriptor, or `etch.playset`.
  `etch.language` picks the localisation language.

This is a layout preview: content the game's code fills in (lists, flags,
values) is not shown. See the
[v1 specification](https://github.com/happy-dwarf-team/etch/blob/main/docs/spec/v1.md)
for what 1.0.0 contains and in what order it is built.

Etch only reads the game folder, the mods and the profile. It sends nothing
anywhere: it has no telemetry.

## License

MIT, see [LICENSE](LICENSE).
