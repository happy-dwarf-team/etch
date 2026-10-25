# The game host

The game host (spec section 4, ADR 0003) is a disposable game process that the
extension starts, owns and stops. It runs from Etch's private copy of the game,
the **game host install**, never from the player's own game folder or profile.
The extension creates the install on first use, after one confirmation, and
**Etch: Remove the Game Host Install** removes it.
`packages/extension/src/game-host/install.ts` implements the install (etch#48),
`process.ts` and `host.ts` the process (etch#49).

## Layout

It lives in the extension's global storage, under `game-host/`:

| Path | What it holds |
| --- | --- |
| `etch-game-host.json` | the record that marks the folder as Etch's install and names the game folder it copies; written first and removed last |
| `game/` | the junction copy: every folder of the game folder is a junction to it, every top-level file a copy; it is the game host's working directory |
| `game/version.dll`, `game/anvil/` | the pinned builds of Anvil, `anvil-game`, Bellows and Etch's plugin, from the VSIX's `game/` (pins/README.md) |
| `profile/` | the private profile, passed as `-userdir=<profile>/` |
| `overlay/` | Etch's overlay mod: `descriptor.mod`, the backdrop's `interface/etch_backdrop.gfx` and textures, and the preview copies while the game host runs |

The copy leaves out the launcher installer (`launcher-installer-*.msi`),
`console_history.txt`, and `version.dll` and `anvil/` if the player has Anvil
in the game folder: the install takes Anvil only from the VSIX. Its
`userdir.txt` is empty, so that `-userdir` alone names the profile.

## Before every start

`prepareInstall` brings the install up to date and refuses to go on when it
cannot be trusted:

1. It hashes the game folder's `eu4.exe` and refuses any build but the one
   `game/manifest.json` pins (1.37.5, SHA-256 `9AD3EFE1…D771A`), before it
   creates or changes anything.
2. It points every junction at the current game folder (`etch.gamePath` may
   have changed), drops junctions to folders the game no longer has, and copies
   again every top-level file whose size or modification time differs from the
   original's. Files the game writes into its folder at run time stay.
3. It hashes every pinned file in the install. A missing or changed one is
   copied again from the VSIX, after the VSIX's own copy is checked against
   the manifest; a damaged VSIX is refused. Anything in `anvil/plugins/` that
   the manifest does not list is removed, so no other plugin loads into the
   game host. `anvil/anvil.log` and `anvil/data/`, which Anvil and its plugins
   write, stay.
4. It hashes the install's `eu4.exe` again: it must be the pinned build.
5. It writes the overlay mod's descriptor and backdrop files and deletes the
   preview copies (`interface/etch_*.gui`, `interface/etchw_*.gui`).
6. It writes the private profile: one descriptor per playset mod in
   `mod/mod-NNN.mod`, then `mod/overlay.mod`, and `dlc_load.json` with them in
   that order and no DLC disabled, so every DLC the player owns is on.
7. It writes `settings.txt` and `pdx_settings.txt` whole: borderless at the
   monitor's native resolution, UI scale 1.0, `etch.language`, the sound off,
   and otherwise the lab's verified graphics settings. After its first start the
   game takes the display mode and size from `pdx_settings.txt` (etch#18).

A playset mod's descriptor is its own (the profile's `.mod` or the mod
folder's `descriptor.mod`) with `path` and `archive` replaced by the mod's
absolute folder, so its name, `dependencies` and `replace_path` stay; a mod
without one gets its name and folder.

## Removal

Removal deletes the install folder entry by entry. A junction is removed as a
link, never followed, so nothing in the game folder is touched; the unit tests
check that the game folder is unchanged after creation, every start and
removal. A folder without the record is left alone, and so is a storage
folder that already holds anything else when the install would be created.

## What the install never does

- It writes only inside the install folder. The game folder, the player's
  profile and the mods are read: the copy's files, the descriptors and the
  junction targets.
- It never changes `eu4.exe`: the install's `eu4.exe` is a byte-for-byte copy
  that is checked against the pin before every start.

## The process

The preview starts the game host at its first switch to the game host backend
(or **Etch: Start the Game Host**); **Etch: Stop the Game Host** stops it, and
so does closing the VS Code window and 30 minutes without a game host preview
(switching the preview back to the offline renderer, or closing it, starts that
timer).

1. **Lock.** One game host per machine: `game-host.lock` in the global storage
   names the owning extension host (its PID, image path and creation time), the
   session id and, once started, the game process. A lock whose owner still
   runs means another window has the game host. A lock whose owner is gone
   names an orphan: its game is closed after its identity is checked, then the
   lock is taken. Each window looks for an orphan when Etch activates.
2. **Start.** `eu4.exe` of the install starts with the install as working
   directory, `-userdir=<profile>/`, `ETCH_HOST_SESSION` set to a fresh session
   id and Steam's `SteamAppId` and `SteamGameId`. Its PID, image path and
   creation time are read at once and must be the install's `eu4.exe`.
3. **Handshake.** The extension connects to the session pipe and sends
   `hello` (docs/plugin-protocol.md); the answer's `pid` and `process_start_ms`
   must be the process it started, to the millisecond. It then pings every
   250 ms until `ready` (`anvil-game.ready`).
4. **Behind VS Code.** The game's window takes the foreground when it appears;
   while the game starts, every 250 ms it is sent to the bottom of the Z order
   without being activated, the foreground goes back to the window that had it,
   and a minimised window is restored without activation. The game host is
   never minimised: minimised it draws at about 8 fps (etch#21).
5. **Stop.** The game is closed only through a handle on which its PID, image
   path and creation time were checked again, so a reused PID is never closed.
   A `CrashReporter.exe` the game started (its parent PID, created after the
   game, from the install or the game folder) is closed the same way, so no
   report is sent. The lock is released.

The game is started as a child of the extension host, so Windows ends it with
the extension host: when VS Code crashes, the game goes too, and the lock it
leaves behind is cleared by the next window. Node has no Win32 bindings and
Etch ships no native code besides the plugin, so one Windows PowerShell
process (`windows.ts`) compiles a small C# class once and answers the identity,
stop, crash reporter and window requests; it ends after a minute without
requests.

## Preview jobs

While the preview shows the game host and it is ready (etch#50,
`game-host/jobs.ts`, the plugin's `job.cpp`):

1. **Layout at the game host's screen.** The preview lays the window out at
   the game host's resolution (the monitor's), so that the crop and the copy's
   wrapper fit its back buffer; a note says so when the chosen preview
   resolution differs.
2. **The copies.** Each change of the previewed window's text (the unsaved
   buffer), a texture saved to disk that the playset reads, or a saved
   localisation file makes a job. The extension writes both preview copies
   (`etch_<file>.gui`, `etchw_<file>.gui`) into the overlay mod's `interface/`
   folder; their diagnostics go to the Problems panel, and a window the game
   host cannot show gets a notice instead of a job.
3. **The job.** One `job` request over the pipe (docs/plugin-protocol.md) names
   both files, both wrappers, the textures to `reloadtexture` (the
   `texturefile` values as the `.gfx` files write them), whether to
   `reloadloc`, the crop (every laid-out widget, in whole pixels, clamped to
   the screen) and the image's path in `<global storage>/captures/`. One job
   runs at a time; changes that come meanwhile merge into one more, the latest
   copy winning and the textures and `reloadloc` adding up.
4. **The image.** The plugin answers when the TGA of straight RGBA is written.
   The webview draws it at the crop's place like any texture, over the same
   neutral background as the offline renderer, and keeps it until the next
   one; hover, outline and navigation keep using the extension's layout. The
   captures folder keeps the last two images and is emptied at every start.

A job that fails (a `reload` or `window open` the game refuses, a capture that
does not come) shows its reason as a notice and in the output channel, with
every console line it ran; the last image stays.

## Diagnostics from the game

What the game itself says about a job goes to the Problems panel, on the
edited file (spec section 10, etch#52; `game-host/error-log.ts`, core's
`game-host/diagnostics.ts`):

- **`error.log`.** The game writes `<profile>/logs/error.log` a line at a
  time. When the game host gets ready, the extension skips what the start
  wrote; each job then reads the whole lines added while it ran
  (`game-error-log`). Lines written between two jobs go to the output channel
  only. A line that names a preview copy and a line
  (`file: interface/etch_goto.gui line: 12`, `near line: 12`) is put on the
  original's line it comes from, through the copy writer's spans, and its
  message names the original's path and line. The copies' names lose their
  `etch_` or `etchw_` prefix, the wrapper is called the window's backdrop, and
  what both copies report is reported once. `Could not find sprite type
  [GFX_x]` (the game draws the magenta placeholder) goes on every value of the
  window that names the sprite, unless the model already reports that sprite
  missing there. Any other line goes on the window's name. A parse error is an
  Error, the rest Warnings.
- **Console answers** (`game-console-answer`): a `reload` that is refused or
  does not answer "reloaded" (an Error), a `reloadtexture` that answers "Reload
  failed", a `reloadloc` that does not reload, and a refused `window open`, on
  the window's name. A `window close` of a wrapper that is not open is
  expected and not reported.
- **The game's own window** (`game-original-differs`, a Warning, H6 of
  etch#16): when a later mod of the playset has a file at the edited file's
  path, which the game reads instead, or when an earlier file in load order
  defines the window's name, whose definition the game keeps. The game host
  still shows the edited text, through the preview copy.
- **The FPS counter** (`fps-counter-corner`, a Warning, etch#22): a crop that
  reaches the top-right 60 × 20 pixels of the screen, where the game draws a
  green FPS counter over every window. The corner was measured at 3440×1440
  only; its size at other resolutions is assumed the same.

The game's report belongs to the text the job was made from: it shows while
the preview shows the game host and that text, and the next job replaces it.

In two live runs (etch#52, 2026-10-25, the machine and builds of etch#50, the
test mod's `countrydiplomacyview.gui` with two icons of one name and a sprite
no `.gfx` defines), every line was in `error.log` by the job's answer. The
`reload` of each copy wrote `Guitype 'etch_probe_icon' already exists in
windowtype 'etch_countrydiplomacyview'. file:
interface/etch_countrydiplomacyview.gui line: 43`, which became one Warning on
line 31 of the original, the second icon. Each `window open` wrote `Could not
find sprite type [GFX_etch_probe_missing]` twice, all left out because the
model reports the sprite missing. `reloadtexture` answered "Reload failed" and
showed as a Warning.

What the live runs of etch#50 found:

- **Show animation.** `window open` creates a window at its `position`; the
  game animates it to `show_position` only for its own windows. Nested in the
  wrapper, `countrydiplomacyview` stayed at x = −600, off the screen, also
  after 384 ms. The preview copy therefore gives the wrapped window's
  `position` the value of its `show_position`, where the offline renderer lays
  it out, and the window then draws in the first Present after the open.
- **`eu3dialogtype`.** Nested in the wrapper, `GiftDiplomacyDialog` draws
  nothing anywhere on the screen; opened on its own it draws. Until the wrapper
  handles dialogs the preview shows a notice for them instead of a job.
- **`reloadtexture`** answers "Reload failed" in the main menu at once
  (under 0.01 ms) for `gfx//interface//country_diplomacy_view_bg_top.dds` and
  every other spelling tried (single slashes, backslashes, `.tga`, the absolute
  path), and the window keeps the old pixels. The job still runs it and reports
  the answer.
- **`reloadloc`** answers "Localisation reloaded!" and takes about 200 ms.

## The preview copy draws the original

H1 of etch#16, checked live in etch#119: the preview copy, wrapped and
captured over black and white, gives the pixels the game draws for the
original window. `packages/extension/test/game-host-h1.ts` runs the check
(`ETCH_GAME_HOST_CHECK=h1` beside `ETCH_GAME_HOST_PATH`, `pnpm --filter etch
test`).

**How.** Three vanilla windows that `window open` draws on the screen by
themselves, at their `position` and without a `show_position` (so the copy's
`show_position` rule moves nothing):

| Window | File | What it covers |
| --- | --- | --- |
| `goto_box` | `goto.gui` | a plain window with a list box and an edit box |
| `ages_view` | `ages_view.gui` | `if_resolution`, `CENTER` orientation |
| `console_wnd` | `core.gui` | the same-file `scrollbartype` (`console_list`), the one reference the copy rewrites; mostly translucent |

A test mod holds the three files as the game has them and a `frontend.gui`
whose `mainmenu` gets the overlay mod's black or white backdrop sprite as its
first child, because the main menu's map moves under every window. For each
window the plugin's `job` request captures the whole 3440×1440 screen four
times: the main menu alone (a 1 × 1 window that draws nothing), the original
by its own name (opened twice, so a pixel that changed between the two frames
gets an alpha below 255), the preview copy through `runJob` as the preview
sends it, and the main menu again. The copy's straight RGBA laid over the menu
must give the original's pixels. Left out: the FPS counter's corner, and
pixels that changed within a capture or, outside the copy, between the two
menu captures.

**Result** (2026-10-25, EU4 1.37.5 `9AD3EFE1…D771A`, Anvil 1.3.0, Bellows
0.9.0, plugin of `main`, vanilla, 3440×1440). The copy's pixels laid over the
menu differ from the original's by at most 1 per channel on every compared
pixel, with no pixel of the screen left out:

| Window | Pixels the copy draws (opaque / translucent) | Over the black backdrop | Over the white backdrop |
| --- | --- | --- | --- |
| `goto_box` | 99,255 / 5,845 | 5 pixels off by 1 | 17 pixels off by 1 |
| `ages_view` | 430,661 / 21,708 | equal | 392 pixels off by 1 |
| `console_wnd` | 2,304 / 191,630 | equal | equal |

The black column is the test as committed (run 4 of etch#119). The white
column is run 3, whose test still left out every pixel the menu changed after
the window closed, which hid all of `goto_box` (see below); the numbers are
the committed rule applied to its images afterwards. Runs 1 and 2 found the
moving menu and the fading-in menu.

None of the four rules of etch#16 changes a pixel: prefixed names, the
rewritten `scrollbartype`, the wrapper and the dual capture give the
original's window. The image of the preview's own path (`runJob`, captured in
the first Present) equals one captured 300 ms after the open in every run.
The original reloaded by its own `reload` equals the one the game loaded at
startup (`ages_view` in both colours, `goto_box` over white), as etch#16 read
from the code; over black, the reloaded `goto_box` drew the translucent shadow
of its top and bottom edges darker (408 pixels, up to 61), as if a second
`goto_box` lay under it.

What the runs also showed:

- **The main menu moves.** The map behind it pans and shimmers, the tip at
  the bottom changes, and for the first seconds after `ready` the whole menu
  fades in. A capture of the original over the plain menu therefore cannot be
  compared with one of the menu alone; only opaque pixels can (0 differing
  pixels for `goto_box` and `console_wnd`, 21 off by 1 for `ages_view`, in
  the first run).
- **`ages_view` varies by 1.** Some of its opaque pixels differ by 1 between
  two opens: copy against original 21, 126 and 0 pixels in runs 1, 3 and 4,
  and the original against itself reloaded 5 in run 1. Why is not known.
- **A closed `goto_box` lingers.** After `window close goto_box` the next
  capture of the menu alone, about 300 ms later, still showed the whole
  window (runs 3 and 4), and later captures showed the caret of its edit box
  blinking at (201, 208), over any window (run 2). A lingering instance under
  a new one would explain the darker shadow of the reloaded `goto_box`; this
  is not verified. It cannot reach the check: the original is captured before
  the first `goto_box` opens, the copy's opaque backdrop hides what lies
  under the wrapper, and `goto_box` comes last.

Not checked: other resolutions and the other `if_resolution` branch (H2 of
etch#16), modded playsets, windows with a `show_position`, whose original the
console leaves at `position` (etch#50), and `eu3dialogtype` (etch#118).

## Restart and watchdog

The game host restarts by itself (etch#51, `game-host/watchdog.ts` and
`host.ts`):

| Cause | Seen by |
| --- | --- |
| A `.gfx` or `.fnt` file the playset reads is saved, created or deleted | the preview's file watcher; the game reads sprite types and fonts only when it starts |
| The resolution, the playset or `etch.language` changed | the preview, which hands the game host its request at every change |
| The game ended by itself | the process's exit |
| The game hangs | a ping every second: no answer for 10 s (a dead plugin or a stuck pipe), or a frame counter that stood still for 10 s (the pipe thread answers while the main thread is stuck) |
| A console call faulted | a job's `game_fault`: the plugin refuses every later job (docs/plugin-protocol.md) |
| The game ended, or did not get ready in time, while it started | the start |

A restart waits 300 ms, closes the game after its PID, path and creation
time are checked, as at a stop, and starts it again with the preview's latest
playset and display. Changes that come until the old game is closed join that
restart; a change that comes while the new game starts makes one more restart
after it, since the new game may have read the file already. The editor
buffer of a `.gfx` file reaches the offline renderer at once; the game host
reads the file once it is saved.

Meanwhile the preview lays the window out at the screen the game host
restarts at and keeps its last image, greyed out and marked as stale, until
the new game draws the next one; textures and localisation saved meanwhile are
not reloaded, since the new game reads them anyway. The captures folder is
emptied only at a manual start, and job numbers go on across restarts, so no
new image takes the name of the one on screen.

A dead process, a hang, a console fault and a start that ends or hangs are
**crashes**. The third crash within 5 minutes stops the game host: the
preview's notice and the output channel give the last cause, the file the
game host was last given (the previewed `.gui` or the file that restarted it)
and the last ten lines of the private profile's `logs/error.log`. It stays
stopped until a manual start (**Etch: Start the Game Host**, or a switch of
the preview to it), which forgets the earlier crashes.

Measured live (etch#51, 2026-10-25, the machine and builds of the table
below, the extension's test suite with `ETCH_GAME_HOST_PATH`, run 3 of 3):

| Step | Result |
| --- | --- |
| A `.gfx` file created, then saved again 100 ms later | one restart; ready 18.5 s and the next image 18.9 s after the first save; the last image stayed, stale, meanwhile |
| The same file deleted | one restart |
| The game ended from outside | a crash, restarted at once |
| Its main thread suspended | a hang after 11.0 s ("the frame counter stayed at 87 for 10 s": the plugin's pipe thread kept answering), the game closed and restarted |
| The game ended again | the third crash: stopped, with the edited file and the end of `error.log`; no restart in the next 5 s |
| A switch to the game host | a manual start, ready |

The seven starts of that run got ready in 14.2–17.2 s. Run 2 saw the same
restart (ready 16.5 s); its test then waited for an image of a dialog, for
which the game host runs no job, and the test was fixed.

## Measured

On the maintainer's machine (EU4 1.37.5 `9AD3EFE1…D771A`, Anvil 1.3.0,
Bellows 0.9.0, 3440×1440, no mods, a new private profile each time; etch#49,
2026-10-25):

| Run | Pipe up | Window found | Ready | Sent behind | Frames in 3 s behind VS Code | Stopped |
| --- | --- | --- | --- | --- | --- | --- |
| VS Code, preview switch | 0.23 s | 1.3 s | 17.8 s | once, stayed behind | 486 | after the idle time, verified |
| Owner killed | 0.22 s | 1.3 s | 18.7 s | once, stayed behind | | with its owner; the orphaned lock cleared |

Both games ran borderless at 3440×1440, never minimised; `system.log` had
`Running application` and `error.log` only the news banner's two lines. The
player's profile and the Steam folder were unchanged, and no `eu4.exe` or
`CrashReporter.exe` ran afterwards.

Preview jobs (etch#50, 2026-10-25, the same machine and builds, vanilla plus a
test mod with a copy of `countrydiplomacyview.gui`; the extension's test suite
with `ETCH_GAME_HOST_PATH`, runs 6–9). The window's crop is 3440×1310, so each
image is an 18 MB TGA:

| | Job (extension) | Change to drawn image |
| --- | --- | --- |
| First image after ready | 196–226 ms | 334–377 ms |
| 10 warm edits per run, median | 175–195 ms | 295–300 ms |
| 10 warm edits per run, p95 | 187–208 ms | 343–366 ms |
| `GiftDiplomacyDialog` (573×580, drew nothing) | 72–75 ms | 98–105 ms |
| Saved localisation (`reloadloc`) | 390–412 ms | 500–533 ms |

Inside a warm job of `countrydiplomacyview` (plugin times): console calls
105–125 ms, of which each `reload` of the 148 KB copy about 8 ms and the first
`window open` of the black wrapper about 80 ms (the white one about 9 ms);
black capture about 24 ms and white 15 ms from the open to the copied crop,
recovery 10–13 ms, the file 7–9 ms. The rest of the time to the drawn image
is the webview loading the TGA and painting. The 150 ms target of spec
section 7 is missed for this large window; the small crop of a dialog took
half of it.

All nine game host runs of etch#50 got ready in 13.1–18.3 s, were closed
after their PID, path and creation time were checked, and left the player's
profile and the Steam folder unchanged.


