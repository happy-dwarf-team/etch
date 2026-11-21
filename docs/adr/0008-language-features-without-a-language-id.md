# Language features for interface files and script references, without a language id

**Status: proposed** (draft for v3, 21 November 2026). Nothing below is built
yet.

Etch adds editor features to `.gui` and `.gfx` files, and to the places in
script and localisation files where they name what Etch already reads:
sprites, textures, localisation keys. It registers them with file-pattern
selectors, as its sprite and asset links do today (`GUI_SELECTOR`,
`SPRITE_SCRIPT_SELECTOR`, `ASSET_SELECTOR`). It contributes no language id,
no grammar and no language server. The features come from the core's
existing indexes of the playset (the interface, the localisation, the
textures), so they agree with the preview.

## Interface files (`.gui`, `.gfx`)

No other tool covers these. CWTools and ParadoxCode bind both extensions to
the `eu4` language id but check no `.gui` structure for EU4 (etch#4).
CWTools' EU4 rules hold only `interface/sprites.cwt` (591 bytes) and two
files of sprite packs.

- **Completion:** widget types; the attributes a widget type takes and
  their known values (`orientation`, `positionType`, `format`), from the
  model the parser builds; sprite names from the playset's `.gfx`, with the
  thumbnail the sprite hover already draws; font names from the playset's
  fonts.
- **References and rename:** find every use of a sprite (in `.gui` and in
  the script folders of `SPRITE_SCRIPT_SELECTOR`); rename a `spriteType` in
  the mod's `.gfx` together with its uses in the mod's files, never in
  another mod's or the game's files.
- **Symbols:** document symbols for a window's widget tree, so the
  breadcrumbs and Go to Symbol follow the Widget Outline.
- **Colours:** swatches and a picker for colour values, where the model
  knows that a field is a colour.

## Script and localisation references

These ideas come from Paradox Chronicle (formerly Paradox Language Support),
the IntelliJ plugin. It has them on PSI rather than LSP and does not run in
VS Code, and its README says its EU4 rules may be incomplete or out of date.
Etch takes only the features its own indexes can answer:

- **Localisation inlay hints:** a key that the playset's localisation
  defines gets its text as an inlay hint, in the plain form of profile labels
  (no icons, colour codes, variables or scripted text, cut at 60
  characters). This covers `text` and `tooltip` in `.gui`, and `title`,
  `desc`, `name` and `custom_tooltip` in the script folders where those are
  keys. The language comes from a setting, English by default. The hover
  shows the whole text, and Go to Definition opens the `.yml` line.
- **Images in more scripts:** the sprite hover of events, missions and
  estate privileges reaches more folders whose keys name a sprite or a
  texture, each listed in the specification when added. Each such line can
  show an optional gutter thumbnail.
- **No script diagnostics:** a missing key in a script gets no problem from
  these features. Checking script files is CWTools' job, and the game's
  (ADR 0007). The diagnostics of `.gui` and `.gfx` files stay as they are.

## Why

We chose file-pattern selectors over a language id of our own, as v1 and
etch#4 did, because VS Code merges the providers of several extensions on
one document whatever its language id. Etch then works beside CWTools'
`eu4` mode without a conflict over who owns the file. We chose providers
in the extension host over a language server because the indexes already
live there, beside the preview. The core stays free of `vscode`, so a later
headless mode or server can reuse the same queries. We left out a grammar
and a formatter. A TextMate grammar would compete with CWTools' and
ParadoxCode's for the same files. A formatter for Paradox script would
rewrite whole files of other people's mods on its first use, and its gain
would be small next to that risk.

## Consequences

- CWTools' completion and hover may appear next to Etch's in `eu4` mode.
  Each feature group has its own setting (`etch.language.completion`,
  `etch.language.inlayHints`, `etch.language.rename`), on by default, so a
  user can turn off the one that duplicates.
- Inlay hints and completion get budgets in [docs/budgets.md](../budgets.md)
  before they ship, measured on Anbennar, the largest corpus playset. They
  wait for the playset's indexes and never block typing.
- Rename writes only into the mod project's files, and like any VS Code
  rename it shows the edits before applying them. It joins Save as view,
  Override in my mod and Add Scripted Selectors as the places where Etch
  writes into the mod on request.
- A new script folder for images or localisation hints is a small,
  table-driven change in the extension, listed in the specification when
  added.
