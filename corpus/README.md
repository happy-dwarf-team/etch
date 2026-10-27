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
| `resolutions` | `width`, `height`, `confirmed` and `evidence` per size. Only confirmed sizes gate a release. [etch#18](https://github.com/happy-dwarf-team/etch/issues/18) confirmed the six of v1: 3440×1440 is the lab's monitor, borderless; the smaller sizes are windowed client areas (below). M10 added 2560×1440 (a windowed client area too, confirmed by its captures) and 3840×2160, which no window of the lab can hold (its desktop is 6000×1440, a window at most 6020×1460): it stays unconfirmed (etch#163) |
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
| `save` | `file` (in the profile's `save games`), `sha256`, `description`, and `confirm`, a widget pattern the driver clicks when it shows while the save loads: Anbennar asks to confirm an achievements warning first (`DefaultConfirm/AgreeButton`, etch#55). Required for a release playset |
| `mods` | load order, a later mod winning: `name` (the descriptor's), `workshopId`, `sha256`, `note` |
| `disabledDlcs` | `dlc_load.json`'s `disabled_dlcs` while capturing; empty means every owned DLC |
| `resolutions` | optional: the resolutions this playset is captured at (`2560x1440`); every corpus resolution when left out. Proper 2K UI Enhanced is made for screens of at least 2560×1440, so its playsets are captured there and above, and below 2560×1440 the corpus takes vanilla and Anbennar alone (M10) |
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
| `codeFilled` | widget patterns of what the game's code fills or hides in this view. The comparison masks these widgets, and every pixel under their game rect, as ADR 0002 says. The lists were completed from the captures of etch#44 |
| `codeMoved` | optional widget patterns of what the game's code moves away from where its `.gui` puts it: a dialog the game opens beside the panel that asked for it, a section the game moves on a taller screen. The comparison draws each such widget and everything inside it where the game shows it, and compares it there (etch#44) |
| `selectors` | optional values of the window profiles' selectors the view is captured with, by selector id (`"owner": "yes"`), where a profile has a choice the screen does not make; `resolution` selectors come from the capture's size. Each profiled root's profile is evaluated with them for the visibility gate (below, ADR 0006). An id a root's profile does not have is left out for that root |
| `data` | optional: what of the playset's save the view shows, `province` by id and `country` by tag (the save's player when left out), for the report of the profiles' `save` texts against the capture's (below) |
| `byPlayset` | optional, by playset id: what differs in that playset, its own `recipe`, `selectors` (replacing the view's values of those ids), `data` and `note`. The Anbennar playsets' save has no ship in construction, so their province views open another way (spec v2 section 11) |

A **recipe** is the Tongs input that opens a view from a known start state:

- `from`: `main-menu` (a fresh start, at the main menu, no save loaded) or
  `save` (the playset's save loaded and paused);
- `steps`: in order, `{ "key": "f1" }` (Tongs `key`, its key names),
  `{ "click": "menu//menu_options_button" }` (Tongs `ui click`, a widget
  pattern), `{ "text": "Verne" }` (Tongs `text` into the focused field, such
  as the Goto box's that `f` opens), `{ "point": { "x": 0.5, "y": 0.5 } }`
  (Tongs `click` at a point of the client area, as fractions of its width and
  height, for what has no widget, such as a province on the map),
  `{ "map": { "x": -0.65, "y": -0.1 } }` (a click at a point of the map, given
  as its distance from the client area's centre in client heights) or
  `{ "wheel": { "x": 0.5, "y": 0, "steps": 3 } }` (the mouse wheel at such a
  point; positive steps zoom in);
- `verified`: whether the steps and roots were seen to work in the game;
- `evidence`: where, or what is still unknown.

A verified recipe names its roots. Unverified recipes may leave steps or roots
empty: the driver (etch#42) verifies each one live, fills in what is missing
and sets `verified`. The province view
opens with a `point` step on the map.

A `map` point is the same place of the map at every corpus resolution: the map's
camera keeps its height in view, so a distance in client heights from the
centre (where the Goto box or an outliner entry puts the camera) lands on the
same province at 1280×720 and at 3440×1440 (checked by hand in M10: the same
provinces under the same points at both sizes). A `point` scales with the
width instead, so at another aspect ratio it lands elsewhere. The Anbennar
playsets' province views use `map` points.

The maintainer's Anbennar save opens with three events over the middle of the
screen; below 1440 pixels the tallest one's option lies under the client area,
where no click reaches it. The corpus therefore uses a copy of that save made
in the lab's private copy (M10): loaded at 2560×1440, its events answered as a
player would (`verne.100` and `lilac_wars.1` with their one option,
`anb_settings.1` with Start game) and saved again through the Esc menu as
`Verne1444_11_11_corpus.eu4`, pinned by its hash. The maintainer's file is not
changed, no event covers a view, and nothing is masked for one.

Each resolution is a fresh start of the game, with the size in the
capturing profile's `pdx_settings.txt` (etch#18). After its first start in a
profile the game reads the size from that file, not from `settings.txt`, and
writes it back into `settings.txt`:

- below the monitor's size: `Graphics` → `windowed_resolution` = `"WxH"` and
  `display_mode` = `"windowed"` give exactly that client area;
- the monitor's size: `display_mode` = `"borderless_fullscreen"`, which always
  fills the monitor whatever the resolution says.

`settings.txt` gets the same `graphics.size` and `borderless`. Exclusive full
screen (`"fullscreen"`) is not used, because it changes the monitor's mode.

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
| `screenshot` | `sha256`, `width`, `height` of the screenshot (the first shot), `shots` (how many the driver took, at least 2) and `unstable` (`pixels` and the `sha256` of the unstable mask) when not every shot was identical |
| `widgets` | the trees of the view's roots |

Each widget is Tongs' `ui tree … all` answer without `click_point` (the centre
of `rect`): `path`, `name` (case kept; empty for an unnamed widget), `type`
(Tongs' coarse kind: `window`, `button`, `icon`, `text`, `listbox`,
`checkbox`, `editbox`, `other`), `visible`, `rect` (`x`, `y`, `w`, `h` in
client pixels; sizes come from the `.gui`, tongs#50, and can be negative: the
vanilla `foreign_province_window` is `y=-100`, an empty rect), and `text`, `enabled`,
`checked`, `children` where they apply. Hidden widgets are kept. A record
never has a stale widget (the tree was read after a reload) or
`children_count` (a tree cut by `depth=`).

Two shots of the same view are not always identical: the main menu's
background is animated (etch#18), and so is the FPS counter in the top-right
corner. The driver therefore records which pixels changed instead of
requiring identical shots. When the first two shots differ it takes two more,
and every pixel that differs between the first shot and any later one is
**unstable**. The unstable mask is an 8-bit greyscale PNG of the screenshot's
size next to it in the local corpus folder (255 unstable, 0 stable). The
comparison (etch#43) compares no unstable pixel: unstable pixels are left
out like masked ones, and a widget with more than 5 % of its pixels
unstable is an unstable capture, not a pass (etch#44). A record without
`unstable` had identical shots.

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
  captures/<playset>/<WxH>/<view>.png            the screenshot whose hash the record holds
  captures/<playset>/<WxH>/<view>.unstable.png   its unstable mask, when it has unstable pixels
  runs/<run id>/                                 the capture driver's report and logs of a run
```

Tools that derive files from captures (renders, diffs, reports of etch#43)
put them in other top-level folders of the same local corpus folder. Nothing
in it is committed; a private bucket waits for the headless CI decision
(spec section 14).

## The capture driver

`packages/core/src/corpus/driver/` takes the captures (etch#42). It runs only
in the EU4 engine lab, because it starts and closes the game with the lab's
`scripts/lib/LabProcess.psm1` and follows the lab's procedure (its
`AGENTS.md`). It needs Node 22.18 or newer, PowerShell 7, the game and a lab
whose game lock passes to child processes through `EU4LAB_GAME_LOCK_TOKEN`
(an older lab refuses the run's first start: the run's own lock looks like
another session's).

1. **Capture host install**, once: a junction copy of the Steam game with the
   Anvil and Tongs releases. Download `anvil-windows-x64.zip` and
   `tongs-windows-x64.zip` of the pinned releases (Tongs: the manifest's
   version), each with its `SHA256SUMS.txt` in the same folder, then:

   ```powershell
   packages/core/src/corpus/driver/game.ps1 -Action Prepare -Lab <lab> -HostDir <host> `
     -AnvilZip <anvil zip> -TongsZip <tongs zip>
   ```

   Prepare checks both archives against their sums, turns Tongs on with
   `input = true` and `game_calls = false`, turns `anvil-overlay` off (its
   notifications would be in the screenshots), and writes `host.json` with
   every hash. Nothing goes into the Steam folder.

2. **A run**, with `ETCH_CORPUS_PATH` set:

   ```powershell
   node packages/core/src/corpus/driver/cli.ts plan --playset vanilla
   node packages/core/src/corpus/driver/cli.ts run --lab <lab> --host <host> `
     --monitor 3440x1440 --settings-baseline <settings.txt> [--records <folder>] `
     [--playset a,b] [--resolution 1920x1080,…] [--view a,b] [--all] [--lock-minutes 240]
   ```

   Without filters a run takes every capture a release needs (`--all` adds the
   report playsets). `--settings-baseline` is the `settings.txt` a new
   playset profile starts from (UI scale 1). Records go into this folder, or
   into `--records` for a trial run whose records are not to be committed.

**The run holds the lab's game lock** from before its first start to its end,
so no other session of the lab or of Etch starts a game between this run's
games (each start, close and mouse call is its own `game.ps1` process). It
takes the lock with `game.ps1 -Action Lock`, held by the driver's Node process
for at most `--lock-minutes` (240, the lab's longest), and sets
`EU4LAB_GAME_LOCK_TOKEN` to its token, which every `game.ps1` it starts
inherits; the lab's `Start-LabGame` leaves it out of the game's environment.
The run gives the lock back at its end, after a failure and on Ctrl+C; when
Node is killed, the lab treats the lock as free once the process is gone.
When another session holds the lock, the run stops before anything starts,
with that session's name: wait for it or ask the user. A run started under a
batch's lock (`Invoke-WithLabGameLock`, or `EU4LAB_GAME_LOCK_TOKEN` set to the
token of `Enter-LabGameLock`) keeps that lock and leaves releasing it to the
batch. No session starts once the lock has expired: the run stops with the
captures it has.

What a run does:

- **One playset profile** per playset in `<host>/profiles/<playset>/profile`
  (`-userdir`): descriptors with absolute paths to the pinned Workshop
  items, `dlc_load.json`, and a copy of the playset's save. Every mod's
  content hash and the save's hash are checked against the manifest before
  and after each start. The player's own profile, saves and mods are only
  read; a run stops when the player's profile changed.
- **A fresh start for each playset, resolution and start state**: one for the
  views opened from the main menu and one for those opened from the save
  (`continue=<save>`, which goes before `-userdir=`: the game takes the rest of
  the command line as the profile's path). Before each start: the Process Lasso rule, the hashes
  of both `eu4.exe` and of the host install, and no game running. The copy
  starts suspended with the mask 1–7 and is ready when Tongs answers from that
  process, `system.log` says `Running application`, the save is loaded and
  paused, and a frame has passed. A save that has not loaded 2 minutes after
  `Running application` fails the session; the save's `confirm` button is
  clicked as soon as it shows, and the 2 minutes count from that click.
- **Settings**: the size goes into named variants of the profile's named
  baselines (`settings-1920x1080-windowed.txt`, `pdx-settings-…`), as above.
  After each start the variants are compared with what the game left (only
  `refreshRate` and `graceful_exit` may change) and the baselines are put
  back.
- **Each view**: Escape, one press at a time, until the visible top-level
  windows are those of the start state (map icons and tooltips left out); the
  recipe's steps; Tongs' pointer to its resting place, which is the
  bottom-right client pixel in the main menu (`--away-menu x,y`, as
  fractions) and the pause banner over a save (`--away-save <pattern>`), off
  the map's scrolling edges and tooltips; the
  trees of the roots read with `ui tree ROOT all`; the shots; the trees and
  the window read again, which must not have changed. The game must still be
  the started process, with no game call made, and from the save still
  paused. The record must pass `parseCaptureRecord` and `captureProblems`
  before it is written. No step is a game call and no `reload` is sent.
- **Closing**: only after the PID, image path and creation time are verified
  again, with any game the process restarted itself. A run stops when a game
  could not be closed, the settings are not back to their baselines, or the
  save, a mod or the player's profile changed. A game left running after an
  interrupted run is closed with `game.ps1 -Action Stop -Record
  <run>/<session>/game.json`.
- A view whose recipe was not verified in the manifest and worked gets a
  record whose recipe says so; set `verified` and the evidence in the
  manifest by hand. When a view loses the start state (Escape cannot close
  what it opened), the session ends and a fresh start takes the remaining
  views.

**The mouse is locked while a game runs.** The game scrolls the map towards
the real mouse cursor when it is outside the game's window, even without
focus, and the interface sees the real cursor again as soon as it moves. So
the driver places the cursor itself: as soon as a game is ready it moves the
cursor onto Tongs' resting point (at least 100 pixels inside the client area)
and confines it to that one pixel with `ClipCursor` (`game.ps1 -Action Pin`).
Moving the mouse then does nothing, and the cursor does not need to be put
anywhere by hand. Each session releases the mouse when its game closes, on
every path; Ctrl+C releases it too.

To take the mouse back during a run, press **Ctrl+Alt+Del** (then Esc) or
**Win+L**; bringing another window to the front (Alt+Tab, the Windows key)
does the same. Windows clears the clip, the driver notices it before the next
view or after the current one's shots, closes the game as always and waits
for a file named `resume` in the run folder (30 minutes, then the run stops).
Creating it starts the session again with the views not yet captured; such a
session does not count towards the fresh starts allowed, and the view it gave
back is not counted as failed. The clip outlives the
driver: if it ended without releasing the mouse, press Ctrl+Alt+Del, or run
`game.ps1 -Action Release -Lab <lab> -HostDir <host>`.

From a save the driver also checks before each view and after its shots that
the cursor is inside the client area and has not moved; when it is not, the
view fails before anything is written and a fresh start takes it again.

`--hold <minutes>` keeps each game open after its views until a file named
`release` appears in the session's run folder, for working out recipes by hand
with Tongs; the mouse is released while the game is held, and closing and the
settings are handled as always.

## The comparison

`@etch/compare` (`packages/compare`) compares the corpus as ADR 0002 says
([etch#43](https://github.com/happy-dwarf-team/etch/issues/43)). For each
capture the manifest wants, it lays out the windows of the view's roots with
`core` in Node, draws them with the preview's own `renderer` bundle in
headless Chromium, and compares the render with the screenshot widget by
widget. It runs on the maintainer's machine, read only:

```powershell
$env:ETCH_CORPUS_PATH = 'D:\etch-corpus'                    # the local corpus folder
$env:ETCH_GAME_PATH = '...\Europa Universalis IV'           # optional; else found through Steam
pnpm --filter @etch/compare compare                         # every capture
pnpm --filter @etch/compare compare --playset vanilla --view main-menu --resolution 1920x1080
pnpm --filter @etch/compare compare --gpu --saves 'D:\etch-saves'   # with the save texts' report
```

Filters take several values separated by commas. `--gpu` draws with ANGLE on
Direct3D 11, as VS Code's webview does; by default it draws with SwiftShader,
which gives the same pixels on every machine. Each report names the renderer.
The exit code is 1 when a capture of a release playset at a confirmed
resolution fails or cannot be compared.

The release gate is the run with `--gpu`, the webview's renderer: with it
both release playsets of v1 passed (etch#44). In M10, with the province views,
the Anbennar playsets gating and the matrix of 2560×1440 and above for Proper
2K UI Enhanced, 208 of the 224 gating captures pass; what fails is listed in
[docs/release-2.0.0.md](../docs/release-2.0.0.md).
SwiftShader rounds the linear
filtering of scaled sprites differently: with it a few scaled icons of the
diplomacy view, the declare war dialog and the province view fall to 94–99 %
(130 of the 156 gating captures pass).

Before it renders, it checks that `eu4.exe` and each pinned mod (by Workshop
item, else by name) are the manifest's. A capture is not compared when it has
no record or screenshot, when `captureProblems` asks for a recapture, or when
the screenshot's hash is not the record's. Text is English, the language of
the captures.

How a view is compared (`planCapture` and `compareCapture` in
`@etch/core/corpus`):

- **Matching.** The first step of each root's path names a top-level window
  of the playset; a root the game's code creates, which no file defines (the
  lobby's bookmark shields), is taken when the view names it code-filled. Below it, the capture's children pair with the layout's by
  name, ignoring case, in order among siblings of the same name; unnamed
  children pair in order among the unnamed ones.
- **Moved widgets.** A widget a `codeMoved` pattern names is drawn, with
  everything inside it, moved by the difference between the game's rect and
  the layout's; its report says how far (`moved`).
- **What is drawn.** The roots' widgets in paint order, without code-filled
  widgets the game did not create (only the layout has them: alternative
  sub-windows the code never opens) and without the widgets the
  capture reports hidden (`visible` false): the game's code hides them, so they
  are code-filled content that the capture itself records.
- **A widget's pixels** are those where its own draws (sprite and glyph rects)
  are the topmost in the render, so each pixel counts for one widget only.
- **Masks.** Pixels the render does not cover fully (alpha below 255); and
  code-filled content: the game's rects of the widgets the view's `codeFilled`
  patterns or the manifest's `codeFilledKinds` name and of everything inside
  them, and the render's draws of those widgets. A game rect 0 or 1 pixel
  wide and taller than that, which Tongs gives shields, is masked as a square. A widget the capture reports
  disabled (`enabled` false) or checked (`checked` true) is code-filled too:
  the game's code set that state, and the offline renderer draws the `.gui`'s
  (etch#44: the Esc menu's AI settings, greyed out in the game).
- **Unstable pixels.** A pixel that would be compared but is in the
  capture's unstable mask (it changed between the shots) is left out. When
  more than 5 % of a widget's pixels are unstable, it fails: the capture
  shows something the game animates there. The mask's hash must be the
  record's, like the screenshot's.
- **A widget passes** when its rect rounds to the game's rect (a window's
  position only: a window draws nothing itself, and Tongs' window sizes may
  not be the drawn panel) and at least
  99 % of its compared pixels are within ±2 in red, green and blue (the
  screenshot's alpha is ignored). The difference of a pixel is its largest
  channel difference.
- **Statuses.** `pass`; `fail`; `deviation` (a failure a known deviation
  covers); `code-filled`; `hidden`; `not-covered` (a `notCovered` kind or
  shader: compared, gates nothing); `absent` (a widget only one side has that
  draws nothing: a layout widget without draws, or a game widget of zero
  or negative size). A widget only the game shows, or only the render draws, fails.
- **The visibility gate** (ADR 0006, spec v2 section 14). For each root
  that Etch's own window profiles (`profiles/`, vanilla then the playset's
  mods) describe, the profile is checked as the extension checks it and
  evaluated at the view's `selectors` in the playset and the capture's size.
  Every path the profile names (in its rules and its groups) that the capture
  has must be drawn exactly when the game showed it (itself and its parents
  visible). A mismatch, or a profile that does not load cleanly, is a problem
  of the capture and fails it; the report lists them, and `visibility` in the
  capture's report has each root's count.
- **Save texts** (reported, not gated, spec v2 section 14). With `--saves
  <folder>` naming a folder that holds the playsets' pinned saves (checked by
  hash), a view with `data` also has the texts its profiled roots fill from
  `save` sources, for that province and country, compared with the texts the
  capture shows (`saveTexts` in the capture's report, and the window report).
- **A capture passes** when no widget fails, every root was found and the
  visibility gate holds. Totals (share within ±2, mean difference) cover the
  widgets that gate and gate nothing themselves.

Results go to the local corpus folder:

```
<ETCH_CORPUS_PATH>/
  renders/captures/<playset>/<WxH>/<view>.png   the offline renderer's image (transparent where nothing is drawn)
  diffs/captures/<playset>/<WxH>/<view>.png     red where a pixel differs, blue where masked, green where equal
  reports/captures/<playset>/<WxH>/<view>.json  every widget's status, rects and pixel counts
  reports/<window>.md                           one page per corpus window
  reports/README.md                             the summary and whether the layout preview meets its target
```
