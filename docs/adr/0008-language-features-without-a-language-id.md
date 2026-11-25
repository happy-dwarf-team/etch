# Language features for interface files and script references, without a language id

**Status: accepted** (22 November 2026; proposed as a draft for v3 on 21
November 2026). All of it is built for 2.14.0: localisation inlay hints
(etch#568), completion (etch#572), symbols
(etch#573), references and rename (etch#581, etch#584), colours (etch#583),
images in more scripts (etch#585) and the gutter thumbnail (etch#587).
Amended on 25 November 2026 with "Beside CWTools": where CWTools answers the
same thing, Etch steps back.

Etch adds editor features to `.gui` and `.gfx` files, and to the places in
script and localisation files where they name what Etch already reads:
sprites, textures, localisation keys. It registers them with file-pattern
selectors, as its sprite and asset links do today (`GUI_SELECTOR`,
`SPRITE_SCRIPT_SELECTOR`, `ASSET_SELECTOR`). It contributes no language id,
no grammar and no language server. The features come from the core's
existing indexes of the playset (the interface, the localisation, the
textures), so they agree with the preview.

## Interface files (`.gui`, `.gfx`)

When this was written no other tool covered these. CWTools and ParadoxCode
bind both extensions to the `eu4` language id but check no `.gui` structure
for EU4 (etch#4). CWTools' EU4 rules held only `interface/sprites.cwt`
(591 bytes) and two files of sprite packs. Rules for every sprite kind, for
`.gui` widgets and for `bitmapfonts` are proposed upstream
(cwtools-eu4-config#447, #448, #454); "Beside CWTools" below says what Etch
does once CWTools has them.

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

## Beside CWTools

VS Code shows the answers of every extension together, and no extension can
hide another's. Run side by side on a test mod (Etch 2.14.0, CWTools 0.10.31
in its `eu4` mode, with rules that type sprites, fonts and `.gui` widgets),
every answer Etch gives alone was still there, and nothing failed. Some came
twice: a sprite's definition one line apart (CWTools the block, Etch the
`name`), so Go to Definition opened a peek instead of jumping; the `.gfx`
outline with each sprite and font twice; the keys of a `.gui` widget twice in
completion; and a second, nearly empty hover.

So Etch steps back from what CWTools answers itself in a document, and keeps
the rest:

- **When:** CWTools runs, the document has CWTools' `eu4` language, and the
  EU4 rules CWTools loads cover it. Etch reads those rules files
  (`cwtools.rules_folder` with `cwtools.rules_version` `manual`, else
  CWTools' own copy under its extension folder): the sprite kinds they type as
  `sprite`, a `font` type on `bitmapfont`, rules for `.gui` widgets, and the
  script folders whose sprite keys they type as `<sprite>`. It never reads
  CWTools' diagnostics (ADR 0007).
- **Steps back:** Go to Definition of a sprite whose kind and reference
  CWTools types; the `.gfx` symbols of those sprite kinds and of fonts; the
  keys of `.gui` completion when the rules check `.gui` widgets.
- **Keeps:** hovers (Etch's have the picture and the whole text, and CWTools'
  cannot be hidden), sprite and font names in completion (Etch knows the
  playset and shows thumbnails), the preview's problems such as
  `missing-sprite` (Etch reads the mod's dependencies, CWTools only the
  workspace and the game), `.gui` symbols, inlay hints, colours, references,
  rename and links, which CWTools does not give.
- **Setting:** `etch.cwtools`, `auto` by default; `ignore` keeps every Etch
  feature.

The coverage comes from the rules, not from CWTools' version, because the
rules change without a CWTools release. Until the upstream rules have them,
Etch keeps everything in `.gui` files and the sprite kinds other than
`spriteType`.

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

- CWTools' hover may still appear next to Etch's in `eu4` mode, and so may
  what "Beside CWTools" keeps. Each feature group has its own setting
  (`etch.editor.completion`, `etch.editor.localisationHints`,
  `etch.editor.rename`; not under `etch.language`, which is already the
  language setting), on by default, so a user can turn off the one that
  duplicates; `etch.cwtools` turns the stepping back off.
- Which rules file types which script key is a table in the extension
  (`cwtools-rules.ts`). A key the rules start to type is a line there.
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
