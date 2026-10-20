# PROTOTYPE: private game host install (etch#21), throwaway, never merged

Question ([etch#21](https://github.com/happy-dwarf-team/etch/issues/21)): can a
private junction copy of EU4 1.37.5 run as the game host of ADR 0003, with its
own user profile, Anvil only in the copy, sitting in the main menu with no
save, previewing a window through the console and capturing the frame it is
drawn in while the game is unfocused? How long does the start take?

## What is here

- `host.ps1 -Action Prepare` builds the game host install under
  `<lab>/work/etch21-host`:
  - `game/`: every folder is a junction to the Steam folder, and every
    top-level file is a copy (not the launcher installer). It also holds
    Anvil's `version.dll` and `anvil/plugins/{anvil-game, bellows, tongs,
    etch-capture-proto}`.
  - `profile/`: the private user profile, made of the lab's baseline
    `settings.txt`, `dlc_load.json` with all DLC on and two descriptors with
    absolute `path=`.
  - `overlay/`: Etch's overlay mod, empty at every start.
- `host.ps1 -Action Run` runs one verified session under the lab's
  procedure. It checks the Lasso rule and the hashes of the original and copied
  `eu4.exe`, and refuses to start when anything Anvil-related is in the Steam
  folder. It starts the game with `Start-LabGame` (suspended, mask 1-7, working
  directory = the copy), polls the plugin's pipe for readiness, and closes the
  game only through `Stop-VerifiedSession`. Any `CrashReporter.exe` child
  would be closed only after its own identity check. Before and after the
  run it snapshots the player's profile (size and modification time of every
  file except caches) and diffs it.
- `etch-capture/` is an early Anvil plugin that stands in for the capture half
  of Etch's plugin.
  - It hooks `Direct3DCreate9(Ex)` → `CreateDevice(Ex)` → `Present`,
    `IDirect3DSwapChain9::Present` and `EndScene` (counted only), the way
    `anvil-overlay` does.
  - Its pipe is `\\.\pipe\etch-proto`. `ping` reports readiness times, frames,
    Presents per frame, focus and iconic state. `capture full|crop X Y W H
    PATH` copies the back buffer at the next Present and writes a 32-bit BMP.
  - `full` reads back the whole back buffer (resolved from MSAA) and copies
    out the rectangle.
  - `crop` first `StretchRect`s the rectangle into a small render target and
    reads back only that.
- `tongs-main-menu.patch` is a throwaway patch to Tongs 0.12.0 (API 2,
  `ba1cc96`) that runs console calls without a loaded game. It stands in for
  the job half of Etch's plugin. `build.ps1` builds Anvil (v1.2.0), Bellows,
  the patched Tongs and `etch-capture` into `<lab>/work/etch21-build`.
- `probe.mjs <phase> <runDir>` drives both pipes and logs every request and
  answer to `probe.jsonl`. It also writes preview copies into the overlay mod.
  - `newfile`: a `.gui` file created while the game runs.
  - `topbar`: P2KE's `topbar.gui` with prefixed top-level names.
  - `cycle`: 10 × edit → close → reload → open → crop.
  - `capture`: 20 timed captures.
- `to-png.ps1` converts captures for viewing.

## Runs (2026-10-20)

All runs used EU4 1.37.5, SHA-256 `9AD3EFE1…D771A` (original and copy), at
3440×1440 borderless, UI scale 1.0, `multi_sampling=8`. The playset was
Proper 2K UI Enhanced (Workshop folder, absolute path) plus the overlay mod.
The plugins were Anvil 1.2.0 with anvil-game, Bellows (defaults: `ram_prefetch`
on, `attr_cache` off), patched Tongs and etch-capture. The process mask was
1-7, with the Process Lasso rule `eu4.exe,0,1-7` untouched.

| Run | Profile chosen by | Profile state | Pipe up | Game ready (anvil-game) | Closed |
| --- | --- | --- | --- | --- | --- |
| run1 | `userdir.txt` in the copy | empty (first start) | 0.19 s | 21.5 s | verified, after `stop.txt` |
| run2 | `-userdir=<path>/` (empty `userdir.txt`) | warm | 0.09 s | 12.8 s | verified, by the 30 min guard |
| run3 | `-userdir=<path>/` | warm | 0.09 s | 14.5 s | verified, after `stop.txt` |

Times are from process creation. Run 1's console calls were refused by the
first version of the patch, so it only measured capture. All three runs
ended with no restarted game, no `CrashReporter.exe`, the player's profile
unchanged (no file added, removed or rewritten, logs included), and the Steam
folder without `version.dll` or `anvil/`. The private `settings.txt` gained
only `graceful_exit=no`.

## Results

- **Own profile: yes, both ways.**
  - `eu4.exe` from the copy wrote `settings.txt`, `logs/`, `dlc_signature`,
    `gameplaysettings.txt`, `pdx_settings.txt`, `messagetypes_custom.txt`,
    `pops_filestorage.index` and the `cache/` and `gfx/` folders into the
    private profile only.
  - Statically, `0x8757E0` reads the `userdir` option, then `0x1714B40`, the
    only code that references `userdir.txt`. The Steam install ships an empty
    `userdir.txt`. A path with a trailing `/` works in both forms.
  - Which form wins when both are set was not run.
- **Mods from outside the profile: yes.**
  - A descriptor in the private `mod/` folder with an absolute `path=` to the
    Workshop folder loads P2KE: `error.log` reports P2KE's own
    `countrydecisionsview.gui` line 715, which is a different line in vanilla.
  - The overlay mod in the lab folder loads the same way.
  - A `.gui` file created in the overlay mod after start loads through
    `reload` with Bellows' listing caches on. Before the reload, `window
    open` answers `Couldn't find such window name.`
- **Anvil only in the copy: yes.** The proxy loads from the copy's folder with
  the copy as working directory.
- **Main menu: yes for the game, no for unpatched Tongs.**
  - In the main menu `root+session` holds an object of another class (not the
    game session's vtable), and Tongs refuses every console call
    (`console_unavailable: session object has an unexpected vtable`).
  - The game's console manager exists there (388 commands, developer lock 1,
    mode lock 0).
  - With the gate removed:
    - `reload etch_probe.gui` takes 8 ms on the main thread, `window open`
      1 ms;
    - `reload etch_topbar.gui` (P2KE's topbar, top-level names prefixed:
      `topbar`, `alerts_parent`, `hotkey_assign_parent`) takes 9 ms;
    - `window open etch_topbar` takes 17 ms and draws the bare topbar over
      the menu.
  - Under the transparent parts of a previewed window the main menu shows
    through (logo, the menu's map).
- **Frame capture: yes, unfocused and minimised.**
  - Present path: exactly one device `Present` per main-loop frame (13,523 of
    13,523 frames in run 2). The swap chain's `Present` was never called, and
    there were about 6 `EndScene`s per frame. The back buffer is
    `A8R8G8B8` with 8× MSAA.
  - The capture taken at the first Present after a `window close` → `reload`
    → `window open` job shows the edited window at its new position in
    10 of 10 cycles (the job ran after frame N, the copy was taken in the
    Present of frame N+1).
  - Cost on the Present thread for a 300×120 or 340×160 window (medians, max):

    | Path | Present thread | Of which readback stall (LockRect) | BMP write (pipe thread) |
    | --- | --- | --- | --- |
    | `crop` (StretchRect, read back the crop) | 1.5–1.9 ms (2.9) | 0.7–1.0 ms | 0.6 ms |
    | `full` (resolve + read back 3440×1440) | 9.3–10.0 ms (10.7) | 9.2–9.9 ms | 0.6 ms |
    | whole frame 3440×1440 | 14.6–17.3 ms | | 5.4–9.2 ms |

  - Unfocused, behind another window (runs 1 and 2, `foreground=false`): the
    game draws at about 160 fps, with the same costs.
  - Minimised (run 3, `ShowWindow(SW_MINIMIZE)`, `IsIconic` true): the game
    still renders the full 3440×1440 back buffer and the window is in the
    capture. It drops to about 8 fps, though: each main-thread call waited
    about 130 ms, and one crop capture cost 19 ms on the Present thread (one
    sample).
- **Cycle as a client sees it:** three separate pipe calls for close, reload
  and open take 21–31 ms round trip, plus 6.5–8.7 ms for the capture call. One
  job in Etch's plugin would save two frame waits.
- **Start-up with Bellows:** the plugin's pipe is up 0.1–0.2 s after process
  creation (early plugin). The game is ready (`anvil-game.ready`; each
  run's `system.log` also has `Running application`) after 21.5 s on the first start with an
  empty profile and after 12.8 and 14.5 s on later starts.

## What this says for the spec

- The game host install of ADR 0003 works as designed: a junction copy with
  Anvil inside, started with `-userdir=<private profile>/`, with descriptors
  that point at the player's mods and the overlay mod by absolute path.
- Etch's plugin must call the console dispatcher itself, without Tongs'
  in-game gate: the main menu has no game session but does have the console.
- Capture in `IDirect3DDevice9::Present`, with the crop rectangle first
  `StretchRect`ed into a small render target. That costs about 2 ms of one
  frame, against about 10 ms for a full read-back at 3440×1440 with MSAA.
- Keep the game unminimised (behind VS Code): minimised it renders at about
  8 fps, so a job and its capture wait about 130 ms per frame.
- Readiness for the extension is `anvil-game.ready`, about 13–15 s with a warm
  profile. The first start of a new profile costs about 21 s.
- Open: the background under a previewed window is the main menu, not a
  neutral backdrop.
