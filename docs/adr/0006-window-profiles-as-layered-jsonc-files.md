# Window profiles are layered JSONC files, one per window and source

A window profile is a JSON-with-comments file (`.jsonc`) checked by a JSON
Schema that the extension ships, one file per top-level window and per source:
`profiles/vanilla/provinceview.jsonc` and `profiles/anbennar/provinceview.jsonc`
in the Etch repository and its VSIX, and `.etch/profiles/provinceview.jsonc` in
the mod's own project, beside its `descriptor.mod`. A file starts with
`formatVersion: 1`. It holds selectors (each with a kind: resolution, data, ui
or scripted), exclusive groups, rules (`when` some selectors have some values,
then `show`, `hide`, `notCreated`, `position` or `frame`), named views, `links`
to windows the game opens instead, and the source of each code-filled widget's
content (`save`, `loc`, `engine` or `generated`, with only `sum` and
`localise` as transforms). Widgets are addressed by their path of names from
the top-level window, with `*` and `**` allowed, never by position. A data
selector reads one named fact that Etch implements (such as whether the player
owns the province); Etch never evaluates a scripted trigger. The v2 map
(etch#151) holds the reasoning: the window profile ticket, etch#160.

Layers apply in a fixed order: vanilla, then a source for each mod of the
playset in playset order (matched by its Workshop `remote_file_id`, or by the
descriptor's name for a local copy), then the mod project's file. Every entry
has a key (an `id`, or a widget path), and a later layer replaces the whole
entry with the same key, adds a new one, or removes one with `null`; nothing
is merged deeply. "Save as view" in the preview writes a view into the mod
project's file, so the user's own views are ordinary views of the top layer
and can be committed.

We chose JSONC over the game's own script syntax, which mod authors know and
Etch already parses, because a JSON Schema gives completion and errors in VS
Code at no cost, and the files sit beside `corpus/manifest.json` and the
extension's settings. We chose a closed set of rule effects and named facts
over an expression language, and hand-written scripted selectors over
evaluating `potential` triggers from the save, because both alternatives start
the engine emulator rejected in v1. We chose files in the mod's project over
workspace settings for its own views and overrides, because they travel with
the mod and its team.

## Consequences

- The profile format is a contract with mod authors: a breaking change raises
  `formatVersion`, and a file with a newer version than Etch reads is skipped
  with a notice.
- Every layer is checked when it loads, against the schema and the playset's
  files: a path missing from the window, an unknown selector or value, or a
  `save` source outside the known facts and paths is an error (in Problems,
  with its line, for the mod project's file); the faulty entry is skipped and
  the rest of the profile applies.
- Etch's own profiles are gated by the precision corpus: each capture of a
  profiled window records its view's selector values, and the visibility the
  profile predicts for every widget of the window must match the capture's
  (until the 2.0.0 trial, only for the paths it names); texts
  from `save` sources are compared with the capture's texts as a report.
- A profile records the mod version it was checked with; another version
  gives a notice and the profile still applies.
- A new data fact needs an Etch release; a mod's profile can use only the
  facts and save paths Etch knows.
- In v2 Etch derives only what the offline renderer already reads (the
  `_large` pairs and `positionType` moves); scripted groups and their labels
  are hand-written, as in Anbennar's profile.
