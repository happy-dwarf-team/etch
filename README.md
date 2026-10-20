# Etch

Etch is a planned tool for Europa Universalis IV interface mods: edit a `.gui`
or `.gfx` file and see the window as the game draws it, within moments, without
restarting the game.

Status: planning. The way to a v1 specification is charted as a wayfinder map
in this repository's issues (label `wayfinder:map`). There is no code yet.

## Direction so far

- The editor is a Visual Studio Code extension: preview, widget outline,
  diagnostics and jump from a widget to its source line.
- Two preview backends behind one preview: an offline renderer that needs no
  game, and the running game as host for previews that depend on game data.
- Precision is measured against the game, not claimed.
- Target: EU4 1.37.5 (Steam, win64) on Windows.

See [GLOSSARY.md](GLOSSARY.md) for the terms used in the issues.

## License

MIT, see [LICENSE](LICENSE).
