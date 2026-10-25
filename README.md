# Etch

[![build](https://github.com/happy-dwarf-team/etch/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/happy-dwarf-team/etch/actions/workflows/build.yml)
[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-Etch-007ACC)](https://marketplace.visualstudio.com/items?itemName=happy-dwarf-team.etch)
[![Open VSX](https://img.shields.io/open-vsx/v/happy-dwarf-team/etch?label=Open%20VSX)](https://open-vsx.org/extension/happy-dwarf-team/etch)
[![License: MIT](https://img.shields.io/github/license/happy-dwarf-team/etch)](LICENSE)

Etch is a planned tool for Europa Universalis IV interface mods: edit a `.gui`
or `.gfx` file and see the window as the game draws it, within moments, without
restarting the game.

Status: preview. Milestone M1, the offline preview, ships as 0.1.0 on the
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=happy-dwarf-team.etch)
and [Open VSX](https://open-vsx.org/extension/happy-dwarf-team/etch); the
extension's [README](packages/extension/README.md) says what it does. The
[v1 specification](docs/spec/v1.md) says what 1.0.0 contains and in what
order it is built; the decisions behind it are in [docs/adr](docs/adr) and in
the wayfinder map in this repository's issues (label `wayfinder:map`).
[CONTRIBUTING.md](CONTRIBUTING.md) says how to build and test it.

## v1 in brief

- The editor is a Visual Studio Code extension: preview, widget outline,
  diagnostics and jump from a widget to its source line.
- Two preview backends behind one preview: an offline renderer that needs no
  game, and a private copy of the running game that draws the window itself.
- Precision is measured against the game, not claimed.
- Target: EU4 1.37.5 (Steam, win64) on Windows.

See [GLOSSARY.md](GLOSSARY.md) for the terms used in the issues.

## License

MIT, see [LICENSE](LICENSE). Etch is an unofficial community project, not affiliated
with or endorsed by Paradox Interactive.
