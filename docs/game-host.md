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


