# Etch

Etch is a planned tool for Europa Universalis IV interface mods: edit a `.gui`
or `.gfx` file and see the window as the game draws it, within moments, without
restarting the game.

Status: specified, not yet built. The [v1 specification](docs/spec/v1.md)
says what 1.0.0 contains and in what order it is built; the decisions behind
it are in [docs/adr](docs/adr) and in the wayfinder map in this repository's
issues (label `wayfinder:map`). There is no code yet.

## v1 in brief

- The editor is a Visual Studio Code extension: preview, widget outline,
  diagnostics and jump from a widget to its source line.
- Two preview backends behind one preview: an offline renderer that needs no
  game, and a private copy of the running game that draws the window itself.
- Precision is measured against the game, not claimed.
- Target: EU4 1.37.5 (Steam, win64) on Windows.

See [GLOSSARY.md](GLOSSARY.md) for the terms used in the issues.

## License

MIT, see [LICENSE](LICENSE).
