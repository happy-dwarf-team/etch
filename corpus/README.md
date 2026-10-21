# Precision corpus

The text side of the precision corpus of
[ADR 0002](../docs/adr/0002-precision-corpus-per-widget-exact-thresholds.md):
what is captured, with what, and what the game reported. The screenshots never
enter Git; they live in a local corpus folder (below). Decisions come from
[etch#10](https://github.com/happy-dwarf-team/etch/issues/10); the format is
[etch#41](https://github.com/happy-dwarf-team/etch/issues/41). The capture
driver ([etch#42](https://github.com/happy-dwarf-team/etch/issues/42)) writes
capture records, the comparison
([etch#43](https://github.com/happy-dwarf-team/etch/issues/43)) reads them.

```
corpus/
  manifest.json                              what the corpus captures, written by hand
  captures/<playset>/<WxH>/<view>.json       one capture record per capture, written by the driver
```

`@etch/core/corpus` reads and checks both (`parseCorpusManifest`,
`parseCaptureRecord`, `captureProblems`), and `pnpm test:unit` checks every
committed file. With `ETCH_GAME_PATH` set, a local test also checks that the
manifest's files, roots and click targets exist in the installed game.

## The manifest

`manifest.json` is JSON. Unknown fields are errors. Ids are lowercase words
joined by `-`, because they become file names.

| Field | What it holds |
| --- | --- |
| `formatVersion` | `1` |
| `game` | `version` and `exeSha256` (uppercase) of the build every capture comes from: 1.37.5 |
| `tongs` | `version` of the Tongs release every capture is taken with. 0.14.1 is the first release that reads no false stale widgets on a fresh start (tongs#61, tongs#63) |
| `uiScale` | `1`: no other `game_ui_scale` is checked |
| `resolutions` | `width`, `height`, `confirmed` and `evidence` per size. Only confirmed sizes gate a release; [etch#18](https://github.com/happy-dwarf-team/etch/issues/18) confirms the ones below the lab's 3440×1440 monitor |
| `codeFilledKinds` | `.gui` widget kinds whose content the game always fills (lists, grids, overlapping elements), masked in every view |
| `notCovered` | widget kinds (`widgetKind`) and shaders (`shader`) that the offline renderer draws but the corpus does not measure, each with a `reason`. Parts of a not-covered kind (`background`, `slider`, …) are listed too |
| `playsets` | below |
| `windows` | below |
| `knownDeviations` | below |

### Playsets

| Field | What it holds |
| --- | --- |
| `id`, `title` | |
| `gate` | `release`: must pass for a release; `report`: reported, blocks nothing |
| `save` | `file` (in the profile's `save games`), `sha256`, `description`. Required for a release playset |
| `mods` | load order, a later mod winning: `name` (the descriptor's), `workshopId`, `sha256`, `note` |
| `disabledDlcs` | `dlc_load.json`'s `disabled_dlcs` while capturing; empty means every owned DLC |
| `windows` | ids of the corpus windows captured with this playset |
| `note` | |

A mod is pinned by its **content hash**, because Workshop descriptors carry
versions such as `v1.37.*.*` that do not change when the mod updates. The
hash (`hashModFolder`) is the uppercase SHA-256 of one line per file under the
mod folder, `<file SHA-256> <path>\n`, with `/`-separated paths relative to
the folder, sorted by UTF-16 code units. A release playset pins every mod; the
report playsets of M4 are pinned when M4 captures them.

### Windows, views and recipes

A **window** is one of the corpus windows of etch#10 (`id`, `title`, the
game-relative `.gui` `files` its views show, and `why` it is in the corpus).
A window has one or more **views**: one state of the window that one recipe
opens and one capture records, such as the main menu and the lobby of
`frontend.gui`. View ids are unique across the manifest.

| View field | What it holds |
| --- | --- |
| `id`, `title`, `note` | |
| `recipe` | how to open it, below |
| `roots` | Tongs selectors of the widgets whose trees the capture reads, `ui tree ROOT all` |
| `codeFilled` | widget patterns of what the game's code fills or hides in this view. The comparison masks these widgets, and every pixel under their game rect, as ADR 0002 says. The lists start from the window's sample data and are completed with the first captures (etch#44) |

A **recipe** is the Tongs input that opens a view from a known start state:

- `from`: `main-menu` (a fresh start, at the main menu, no save loaded) or
  `save` (the playset's save loaded and paused);
- `steps`: in order, `{ "key": "f1" }` (Tongs `key`, its key names) or
  `{ "click": "menu//menu_options_button" }` (Tongs `ui click`, a widget
  pattern);
- `verified`: whether the steps and roots were seen to work in the game;
- `evidence`: where, or what is still unknown.

A verified recipe names its roots. Unverified recipes may leave steps or roots
empty: the driver (etch#42) verifies each one live, fills in what is missing
and sets `verified`. A view that needs a step the format does not have yet
(the province view opens with a click on the map) waits for the driver to add
that step kind.

The driver brings the game back to the recipe's start state before each view,
moves the pointer away after the last step (no hover frame or tooltip), and
takes no capture after a `reload` (etch#14). No step is a game call.

### Known deviations

An accepted difference between the offline renderer and the game, tracked by
its own issue. Each entry needs the maintainer's consent before a release
(ADR 0002), so the manifest starts with none; recording one is a decision of
[etch#44](https://github.com/happy-dwarf-team/etch/issues/44), not of the format.

| Field | What it holds |
| --- | --- |
| `id` | |
| `widgets` | a widget pattern of the paths it covers |
| `kinds` | only widgets of these `.gui` kinds, as the offline renderer's model reads them (optional) |
| `views`, `playsets`, `resolutions` | where it applies (optional; all when left out); resolutions as `3440x1440` |
| `difference` | what differs |
| `issue` | the GitHub issue that tracks it |
| `consent` | a link to the maintainer's consent |

For example, the `buttonText` placement of etch#9, if the maintainer agrees to
it in etch#44, would read:

```json
{
  "id": "button-text-one-pixel-lower",
  "widgets": "//*",
  "kinds": ["guiButtonType"],
  "difference": "The game draws a button's text 1 px lower and slightly blurred.",
  "issue": "https://github.com/happy-dwarf-team/etch/issues/<its issue>",
  "consent": "https://github.com/happy-dwarf-team/etch/issues/44#issuecomment-<id>"
}
```

A widget a deviation covers is still compared and reported, as a deviation
instead of a failure.

## Widget paths and patterns

Paths are Tongs' widget paths: `.gui` names from a top-level window down,
joined by `/`, with `[n]` where siblings share a name and a bare `[n]` for a
widget without a usable name (`outliner/entries[2]`, `menubar/[3]`).

Patterns (in `roots`, `codeFilled`, click steps and deviations) are the part
of Tongs' selector syntax that names widgets: steps joined by `/`, `//` for
any depth (`menu//menu_options_button`, `//DateText`), names ignoring case with
`*` and `?`, and an optional `[n]`. A step without `[n]` matches every sibling
of that name. A pattern starts at a top-level window unless it starts with
`//`. Tongs' filters (`[type=…]`, `[text=…]`) are not allowed: they depend on
the game's state and language.

## Capture records

One file per capture at `captures/<playset>/<WxH>/<view>.json`:

| Field | What it holds |
| --- | --- |
| `formatVersion` | `1` |
| `playset`, `resolution`, `view` | which capture it is; also its path |
| `takenAt` | ISO 8601 in UTC |
| `game.exeSha256`, `tongs.version` | what it was taken with |
| `save.sha256` | the save loaded, when the recipe starts from one |
| `mods` | the playset's mods in load order, each `name` and its content hash at capture time |
| `disabledDlcs` | as the playset |
| `recipe` | the recipe as it was run; it must be verified |
| `window` | Tongs' `window`: client `width`, `height` and `dpi` |
| `screenshot` | `sha256`, `width`, `height` of the screenshot; a capture is accepted only when two shots were identical, so there is one hash |
| `widgets` | the trees of the view's roots |

Each widget is Tongs' `ui tree … all` answer without `click_point` (the centre
of `rect`): `path`, `name` (case kept; empty for an unnamed widget), `type`
(Tongs' coarse kind: `window`, `button`, `icon`, `text`, `listbox`,
`checkbox`, `editbox`, `other`), `visible`, `rect` (`x`, `y`, `w`, `h` in
client pixels; sizes come from the `.gui`, tongs#50), and `text`, `enabled`,
`checked`, `children` where they apply. Hidden widgets are kept. A record
never has a stale widget (the tree was read after a reload) or
`children_count` (a tree cut by `depth=`).

`captureProblems(manifest, record)` says when a record no longer fits the
manifest. A capture is retaken when the EXE hash, the Tongs version, the save,
a mod's hash, the disabled DLCs or the view's recipe changes, and when the
client area is not the resolution, the DPI is not 96 (the only one checked),
or the tree does not match the view's roots.

## The local corpus folder

Screenshots (3–7.5 MB of Paradox art each) stay outside Git, in the folder
named by the environment variable `ETCH_CORPUS_PATH`. It must be an absolute
path outside the repository (`localCorpusFolder` refuses anything else), and
it mirrors the capture records:

```
<ETCH_CORPUS_PATH>/
  captures/<playset>/<WxH>/<view>.png        the screenshot whose hash the record holds
```

Tools that derive files from captures (renders, diffs, reports of etch#43)
put them in other top-level folders of the same local corpus folder. Nothing
in it is committed; a private bucket waits for the headless CI decision
(spec section 14).
