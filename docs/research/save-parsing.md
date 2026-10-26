# Research: can Etch read EU4 saves in TypeScript fast enough, and which saves can it read?

Ticket: [etch#154](https://github.com/happy-dwarf-team/etch/issues/154) (map:
[etch#151](https://github.com/happy-dwarf-team/etch/issues/151)). Done on 2026-10-26.

Frame from the map: a chosen save is one layer of **sample data**; v2 reads plain text and
compressed saves, and ironman saves only if a lawful source of their tokens exists; Etch
never computes values the way the engine does; v1 chose TypeScript throughout, without
Wasm and native Node modules ([ADR 0001](../adr/0001-typescript-renderer-host-layout-webgl2-webview.md),
[etch#8](https://github.com/happy-dwarf-team/etch/issues/8)).

Labels: **verified** (read in a file, a source repository or a registry on the date
above, or measured here), **hypothesis** (plausible, not checked).

## Method

- **Saves:** ten distinct saves of the maintainer (eleven files; one ironman file is a copy of another), EU4 1.37.5 Steam win64, copied read only into a
  scratch folder before anything read them; the originals, the game and the mods were not
  touched and the game was not started. The set covers the Anbennar playsets (1444 and two
  late games near 1590), vanilla with Proper 2K UI Enhanced (1466 and 1719, single player
  and multiplayer, compressed and an uncompressed autosave) and one ironman save (1.37.4).
  The corpus save of the Anbennar playset (Anbennar, Proper 2K UI Enhanced, P2KE Patch -
  Anbennar, Verne 1444.11.11) is among them. No save or extract is in this repository.
- **Measurement:** [`save-parsing-bench.mjs`](save-parsing-bench.mjs), run with Node
  24.21.0 (type stripping, `--expose-gc`) straight on Etch's `packages/core` sources at
  `origin/main` 345166b (release 1.0.1): `parseScript` from `script/parse.ts` and
  `decodeWindows1252` from `windows-1252.ts`. Machine: Intel Core i9-13900KF, 64 GB RAM,
  Windows 11; Node's default heap limit there is 4.5 GB. Each save was run three times in one
  batch under the lab's game lock (no game running); the tables give the median. Times are
  wall clock of one thread; the save was in the OS file cache.
- **Web sources:** the projects' own repositories (`gh api`), npm and crates.io registries,
  docs.rs, the pdx.tools write-up of the format, Paradox's user agreement. Read on
  2026-10-26; versions and dates are in the tables.

## Short answer

- **Formats (verified).** Every 1.37.5 save is an `.eu4` file in one of three forms:
  a zip archive of `meta`, `gamestate` and `ai` whose entries start `EU4txt` (a normal save
  with `compress_saves=yes`), the same text unzipped in one file starting `EU4txt` (an
  autosave with `compress_autosave=no`), or a zip whose entries start `EU4bin` (ironman).
  Plain text is Windows-1252 Clausewitz script; binary uses 16-bit key tokens.
- **Sizes (verified).** The Anbennar playset in 1444: 8.7–9.0 MB on disk, 94–109 MB of
  gamestate text, 1870 countries, 7038 provinces. Anbennar near 1590: 15–17 MB on disk,
  99–112 MB of text. Vanilla 1719: 9.0 MB zipped, 62 MB of text (and 62 MB on disk as an
  uncompressed autosave). Zipped text saves inflate 6.5–12 times.
- **Ironman: not lawfully readable by Etch (verified premises, hypothesis on the law).**
  Paradox publishes no token table. The maintainer of the only maintained open parser that
  reads ironman (eu4save, now in the rakaly/jomini monorepo) writes that "the token resolver
  can't be distributed, per PDS counsel", and earlier that the list "must not be shared"
  and he may not say how it is derived. Etch cannot ship a table, cannot fetch one, and
  must not derive one from `eu4.exe`. A user can melt an ironman save into a text save with
  a third-party tool (Rakaly CLI, pdx.tools); Etch then reads the melted save as any other.
- **Speed (measured).** Building Etch's full syntax tree of a whole save is the wrong
  approach: 3.3–3.6 s and 2.2–2.3 GB of heap for an Anbennar save (9.1–9.4 million nodes).
  Reading only what a window needs is fast: one pass over the inflated bytes that finds
  every country and province block takes 0.57–0.64 s for Anbennar (0.38 s for vanilla 1719),
  after which one country and one province are decoded and parsed with `parseScript` in
  5–30 ms. Inflating the zip with `node:zlib` takes 0.09–0.13 s.
- **Parser (recommendation).** Etch's own TypeScript parser, with a save front end: inflate
  `gamestate`, index top-level, country and province blocks by byte range in one pass,
  decode and parse only the slices a view asks for. No `jomini` npm (Wasm, plain text only,
  so it would bring nothing Etch cannot do), no eu4save (Rust; ironman part unusable), no
  pdx-tools code (AGPL-3.0). `parseScript` parsed every measured save with zero diagnostics.

## Save formats of EU4 1.37.5

All verified on the copies, by magic bytes, zip entries and `meta`. Sizes in MB (10^6 bytes).
Every text save reports `savegame_version` 1.37.5.0 ("Inca"); the ironman save 1.37.4.0.

| Save (playset, date) | Container | Encoding | File | `gamestate` | Countries | Provinces |
|---|---|---|---|---|---|---|
| Anbennar + P2KE + P2KE Patch - Anbennar, 1444.11.11 (the corpus save) | zip | `EU4txt` | 9.0 | 109.0 | 1870 | 7038 |
| Anbennar + Anbennar - Proper 2K UI (+ P2KE), 1444.11.11 | zip | `EU4txt` | 7.7 | 93.6 | | |
| Anbennar large playset (24 mods), 1444.11.11 (two saves) | zip | `EU4txt` | 8.7 | 105.7–105.8 | | |
| Anbennar large playset, 1582.9.23 | zip | `EU4txt` | 16.7 | 111.7 | 1681 | 7038 |
| Anbennar playset, 1594.2.27 | zip | `EU4txt` | 15.2 | 99.2 | 1681 | 7038 |
| Vanilla + P2KE, 1466.3.19 | zip | `EU4txt` | 5.8 | 44.4 | 1380 | 4941 |
| Vanilla + P2KE + submods, multiplayer, 1719.3.17 | zip | `EU4txt` | 9.0 | 61.8 | 1380 | 4941 |
| Same game, multiplayer autosave, 1719.1.1 | none | `EU4txt` | 62.1 | 62.1 | 1380 | 4941 |
| Vanilla ironman, 1.37.4 | zip | `EU4bin` | 5.7 | 45.2 | n/a | n/a |

- **Zip entries (verified):** `gamestate` (all but 0.2 MB of the text), `meta` (2–4 KB:
  date, player tag, displayed country name, `savegame_version`, DLCs, `mods_enabled_names`
  with each mod's display name and `.mod` file), `ai` (0.1–0.2 MB). Deflate only.
- **Uncompressed saves (verified):** the player's `settings.txt` has `compress_saves=yes`
  and `compress_autosave=no`; all of his manual saves are zips and all autosaves
  (`autosave`, `old_autosave`, `older_autosave`, `mp_autosave` …) are one plain text file
  of about 62 MB that starts with `EU4txt` and holds meta and gamestate in one. Whether
  these are the game's defaults was not checked (hypothesis: they are).
- **Multiplayer saves** are the same format as single-player ones (`multi_player=yes` in
  meta).
- **Binary (verified on the ironman save):** after `EU4bin`, a stream of little-endian
  16-bit ids: `0x0001` is `=`, `0x0003` `{`, `0x0004` `}`, `0x000C` a 32-bit integer,
  `0x000F` a length-prefixed string, and every key is another 16-bit id. Values are in the
  clear (`"Armenia.eu4"`, `"ARM"`, `"Great Armenia"`, `"1.37.4.0"`, DLC names), keys are
  not: without the id-to-name table a reader sees `0x2a38 = "ARM"` and cannot tell it is the
  player. Where a text save writes the date, this one has the 32-bit integer 56821728
  (hypothesis: the date in an integer encoding). The layout matches jomini's description of binary
  data ("tokens, which are 16 bit integers that uniquely identify strings").
- **Personal data (verified):** the gamestate starts with `players_countries`, which holds
  the player's profile name next to the tag. Etch needs only the tag (also in meta as
  `player`).
- **Syntax (verified for these saves):** `=` is the only operator; keys such as `-1`
  (provinces) and dates appear; no comments. Etch's `parseScript` reported zero diagnostics
  on all six text gamestates it parsed in full. The pdx.tools write-up of the format
  ([A Tour of PDS Clausewitz Syntax](https://pdx.tools/blog/a-tour-of-pds-clausewitz-syntax),
  2020, updated 2021) lists quirks a save reader must expect: `\"` and `\\` escapes and
  line breaks inside quoted strings, Windows-1252 text, `{}` meaning an empty array or
  object, arrays followed by key-value pairs in one block, nesting several hundred levels
  deep in modded saves, and duplicate keys (common in EU4 saves). `parseScript` keeps
  duplicates and handles depth and mixed blocks; it does not process escapes and ends a
  quoted string at the end of its line (made for interface files, etch#15). None of the
  three gamestates searched (Anbennar 1444 and 1582, vanilla 1719) contains `\"`
  (hypothesis: a player-typed name with a quote would produce one).

### What a province block holds, and what it does not

Keys of one owned province (Moscow, vanilla 1466; verified): `name`, `owner`, `controller`,
`previous_controller`, `institutions`, `cores`, `trade`, `original_culture`, `culture`,
`religion`, `original_religion`, `capital`, `is_city`, `garrison`, `base_tax`,
`original_tax`, `base_production`, `base_manpower`, `likely_rebels`, `trade_goods`,
`local_autonomy`, `buildings`, `building_builders`, `great_projects`, `history`,
`discovered_by`, `modifier`, `trade_power`, `center_of_trade` and a few more. One block is
3.9 KB of text; a country block 0.1–0.7 MB.

Values the province view shows that are derived at run time (tax income, unrest, supply
limit, total development as the game rounds it, modifier totals) are not stored as such
(hypothesis from the key list: no such keys were seen). Under the map's rule they come from
the other layers (written or generated values, the live game's snapshot), never from Etch
recomputing them.

## Ironman saves: is there a lawful source of tokens?

| Source | What it says | Status |
|---|---|---|
| eu4save README in [rakaly/jomini `crates/eu4save`](https://github.com/rakaly/jomini/tree/master/crates/eu4save) (the [rakaly/eu4save](https://github.com/rakaly/eu4save) repository was archived on 2026-09-12 and points there) | "Ironman saves are supported, but not by default, as the token resolver can't be distributed, per PDS counsel." | verified |
| [eu4save 0.1.4 on docs.rs](https://docs.rs/crate/eu4save/0.1.4) (2020-08-21) | "PDS has declared that in order to comply with EU4's terms of use, the list of tokens must not be shared." The author is "restricted from divulging how the list of tokens can be derived." Tokens are read from a file named by `EU4_IRONMAN_TOKENS`. | verified |
| [pdx-tools README](https://github.com/pdx-tools/pdx-tools) (AGPL-3.0) | "By default, ironman and binary files will be unparsable. If you are in possession of a binary token file, you can unlock processing binary saves by placing the token file under the assets directory." | verified |
| [librakaly](https://github.com/rakaly/librakaly) v0.12.8 (2026-10-02), [Rakaly CLI](https://github.com/rakaly/cli) v0.8.22 (2026-10-13), MIT | librakaly's README: built with token files named by the same environment variables (`EU4_IRONMAN_TOKENS` …), released as native libraries. Rakaly CLI's README: melts binary saves into text, as a downloadable executable. So the tokens travel inside compiled binaries, not as a table. | verified (READMEs); that the CLI is built the same way, and how Paradox views the compiled form: hypothesis / unknown |
| [Paradox user agreement](https://legal.paradoxplaza.com/eula) (last updated 2026-01-21) | No clause on reverse engineering in the agreement itself; UGC and mods are welcome for non-commercial use. | verified; it does not grant anything about tokens |
| Paradox | No published token list, no API, no in-game "save as text" for an ironman game was found. | not found (absence, not proof) |

Verdict: **ironman saves stay out of v2.** No source exists that Etch could lawfully
redistribute or fetch, and the one first-hand account of Paradox's position (through the
eu4save maintainer) forbids sharing the list and its derivation. Deriving ids from
`eu4.exe` would be exactly that derivation, and the lab's reverse engineering is not a
licence to ship it. Reading through librakaly would add a native module (excluded by ADR
0001) and only move the question to another binary.

What Etch can do (recommendation): recognise `EU4bin` from the first bytes of the file or
of its `gamestate` entry and say plainly that ironman saves are not read, and that a text
save of the same game (a non-ironman save, or a save the user melts with a tool of their
choice) works. Etch does not name, bundle, download or run a melter.

## Existing parsers

| Project | Licence | Version, date | Language, delivery | Reads | Speed (their claim) | Fit for Etch |
|---|---|---|---|---|---|---|
| [jomini (npm)](https://github.com/nickbabcock/jomini) | MIT | 0.10.0, 2026-03-13; 1.0 MB unpacked | Rust compiled to Wasm, JS wrapper | **Plain text only** ("read and write **plaintext** save and game files") | "Parse at over 200 MB/s"; building JS objects is "95-99%" of the time; querying `/countries/TAG/prestige` instead of the whole object: "40x faster (6.3s vs 0.16s)" | Excluded by ADR 0001 (Wasm). Brings nothing for ironman. Its query-by-path design confirms the slice approach below. |
| [jomini (crate)](https://github.com/rakaly/jomini) | MIT | 0.37.2, 2026-10-15 | Rust | Text and binary; binary needs a caller-supplied token resolver | "over 1 GB/s" | Not TypeScript. Text side matches what Etch already does. |
| eu4save (now `crates/eu4save` in rakaly/jomini) | MIT | crates.io 0.8.2, 2022-10-25; developed in the monorepo since | Rust | Text, zip and ironman with `EnvTokens` | — | Typed EU4 save model and a `Query` API that computes values such as income breakdowns: the emulator side Etch rejects. Not TypeScript. |
| [pdx-tools](https://github.com/pdx-tools/pdx-tools) | **AGPL-3.0** | active, 2026-10-23 | Rust/Wasm + TypeScript web app | All, binary with private token files | — | Licence excludes copying into MIT Etch; read for ideas only. |
| [librakaly](https://github.com/rakaly/librakaly), [Rakaly CLI](https://github.com/rakaly/cli) | MIT | 0.12.8 / 0.8.22, 2026-10 | Native C ABI library / executable | Melts binary to text | — | Native module: excluded. A user-side tool. |
| [eu4-parser (npm)](https://github.com/carsten-siemens/eu4-parser) | MIT | 0.1.4, 2025-10-30; 0 stars | JavaScript | Text, zip and uncompressed; whole save into one object | — | Whole-object approach Etch measured as too heavy; no reason to depend on it. |
| [@sean_kenny/eu4-text-file-to-json-parser-js](https://github.com/SeanKennyNF/eu4-text-file-to-json-parser-js) | none stated | 0.1.16, 2025-04-19 | TypeScript | Text to JSON | — | No licence: cannot be used. |

The [prior-art research](https://github.com/happy-dwarf-team/etch/blob/research/prior-art/docs/research/prior-art.md)
(etch#4) already put pdx-tools under "read for ideas", and Etch's own `parseScript`
already exists, is MIT and is tested against the game's interface files.

## How fast is Etch's own parser on a save?

Medians of three runs (ms; heap in MB is the growth after a forced GC). "Full" decodes the
whole gamestate to one string with `decodeWindows1252` and builds the tree with
`parseScript`. "Index" is one pass over the inflated bytes that records the byte range of
every top-level block and of every child of `countries` and `provinces` (no tree, no
strings except block keys). "Slice" decodes and parses the player's country block and one
province block.

| Save | `gamestate` MB | Inflate | Index | Slice (country + province) | Full decode | Full parse | Nodes | Heap |
|---|---|---|---|---|---|---|---|---|
| Anbennar corpus, 1444 | 109.0 | 87 | 570 | 5 (0.1 MB) | 1793 | 1465 | 9.12 M | +2188 |
| Anbennar, 1582 | 111.7 | 128 | 641 | 10 (0.2 MB) | 1828 | 1683 | 9.44 M | +2314 |
| Anbennar, 1594 | 99.2 | 117 | 587 | 16 (0.4 MB) | 1627 | 1574 | 9.23 M | +2159 |
| Vanilla MP, 1719 | 61.8 | 71 | 381 | 28 (0.7 MB) | 1007 | 787 | 6.47 M | +1389 |
| Vanilla MP autosave, 1719 (no zip; read 17 ms) | 62.1 | 0 | 388 | 29 (0.7 MB) | 1018 | 760 | 6.48 M | +1398 |
| Vanilla, 1466 | 44.4 | 48 | 268 | 6 (0.1 MB) | 740 | 534 | 4.78 M | +992 |
| Ironman, 1.37.4 | 45.2 | 49 | — | — | — | — | — | — |

Run-to-run spread was within 5% except full parse (up to 25%, garbage collection).
Reading the file from cache took 2–5 ms for zips.

Findings (verified by the measurement):

- **A full tree is too big for a sample-data layer.** 2.2–2.3 GB of heap for an Anbennar
  save is half of Node's default limit on this machine and would sit in VS Code's
  extension host next to everything else; 3.3–3.6 s before any value is known.
- **Decoding is half of the full cost.** `decodeWindows1252` builds the string 8 KB at a
  time through `String.fromCharCode` (0.7–1.8 s). Node's built-in
  `TextDecoder('windows-1252')` decodes the same Anbennar gamestate in 100–112 ms and the
  vanilla one in 58–68 ms (three runs each, separate script, same lock). The WHATWG
  windows-1252 table keeps the five undefined bytes as C1 controls, as Etch's decoder does
  (hypothesis from the Encoding Standard, not compared byte for byte here). Slices are small
  enough that the decoder does not matter for them.
- **The index pass is the real cost of a save, and it is paid once per save.** 0.57–0.64 s
  for the Anbennar saves (160–190 MB/s, in line with jomini's 200 MB/s claim for its Wasm
  build), 0.27–0.39 s for vanilla. It needs the inflated bytes (about 110 MB) and a map of
  about 9,000 ranges; nothing else.
- **A window's data is cheap after that.** One country plus one province: 5–30 ms,
  4,800–41,000 nodes, the time growing with the country's size (Russia 1719 is the largest
  measured, 0.7 MB). Switching to another province is one more slice of a few KB.

Hypotheses (not measured): a worker thread keeps the index pass off the extension host's
event loop; caching the index by path, size and modification time makes re-opening the
same save cost only the inflate and the slices; streaming the index while inflating
(zlib chunks) would bring the first values before the whole save is read.

## What CWTools' EU4 rules teach

[cwtools-eu4-config](https://github.com/cwtools/cwtools-eu4-config) (MIT, last commit
a85622d, 2026-04-15), read without depending on it:

- **Nothing about saves (verified).** The rule files cover game folders (`common/`,
  `history/`, `events/`, `missions/`, `map/`, `interface/sprites.cwt` …); there is no rule
  for `.eu4` files.
- **Scopes and localisation commands (verified).** `scopes.cwt` lists the scopes (Country,
  Province, Trade Node, Monarch, Heir, Consort, Rebel Faction …); `localisation.cwt` maps
  each localisation command to the scope it reads (`GetAreaName = province`,
  `GetAdjective = country`, `GetDip = monarch`, 79 lines). For sample data this is a ready
  vocabulary of which scope a text needs, close to what the save's `countries.TAG` and
  `provinces.-ID` blocks are.
- **History rules (verified).** `history/history_consolidated.cwt` describes province
  history (`owner`, `controller`, `base_tax`, `trade_goods` …) and country history; the
  save's province blocks use the same key names for the current state. Etch may borrow
  these names as a checklist; the save itself stays the source.

## Recommendation

- **Saves v2 reads:** text saves only, both forms: zipped (`gamestate` and `meta` entries
  with `EU4txt`) and uncompressed (one `EU4txt` file, autosaves). Single player and
  multiplayer alike. Any 1.37.5 save of any playset; the `meta` block's
  `mods_enabled_names` lets Etch warn when a save's playset differs from the edited mod's.
- **Not read:** binary saves (`EU4bin`, ironman). Detected and explained, not attempted.
- **Parser:** Etch's own, in TypeScript, as a save front end over `parseScript`:
  1. read the file; inflate `gamestate` (and `meta`) with `node:zlib` (part of Node, not a
     native module) when it is a zip;
  2. index once: one byte pass recording the ranges of top-level blocks and of each child
     of `countries` and `provinces` (0.27–0.64 s on the measured saves);
  3. decode and parse only the blocks a view needs (5–30 ms for a country and a
     province), keeping them as Etch's ordinary syntax tree;
  4. accept `\"`, `\\` and line breaks inside quoted strings in the save tokenizer (the
     interface tokenizer can stay as it is).
- **Never** build the whole save as a tree or a JS object, never compute derived values,
  never keep `players_countries` (the player's profile name) in anything Etch writes.

## Newly specifiable

- **Budgets for v2 (map):** save parse time can now be stated against measured numbers,
  for example "index a 112 MB Anbennar save within 1 s and a view's slices within 50 ms on
  the maintainer's machine, off the cold-open path". The cold open stays within its 1 s
  budget because the save layer arrives after the first paint.
- **Choosing data in the preview (map):** the index yields the lists a picker needs at no
  extra cost: every country tag (1380–1870) and province id (4941–7038) in the save, the
  player's tag and the date (from `meta`). Names come from the save's `name` keys and the
  playset's localisation.
- **Sample data layer for a save:** a view asks for blocks by path (`countries.TAG`,
  `provinces.-ID`, top-level keys such as `date`); values are taken as written in the
  save. Whatever a window shows that the save lacks falls through to the other layers.
- **The playset check:** `meta` names the save's mods, so a mismatch with the edited
  mod's playset can be a warning, not a failure.

## Out of scope

- **Ironman saves** (and any binary save) in v2, with the reasons above. Revisit only if
  Paradox publishes a token list or grants a licence for one.
- **Melting**, converting saves to JSON, writing saves.
- **A typed EU4 save model** like eu4save's (thousands of fields, follows each patch): Etch
  reads keys as written, view by view.
- **Computing** income, development totals, modifiers or anything else the engine derives.
