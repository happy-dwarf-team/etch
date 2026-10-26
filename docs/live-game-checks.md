# Live checks of the live game's reload policy

What the real game did with the reloads and restarts that the live game's
policy (etch#157) relies on: the live checks H1–H10 of the reload research
(etch#152, branch `research/live-game-reload`) and H11, run for etch#166 on
2026-10-26. Each section gives the result and what it changes in the policy.
H11 is still open.

## How it was run

- **Build.** `eu4.exe` 1.37.5 Steam win64, SHA-256
  `9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A`, checked
  for the game folder's file and the copy before every start.
- **Install.** A private junction copy of the game, built by the corpus
  driver's `game.ps1 -Action Prepare` with Anvil 1.5.2, Tongs 0.16.0 (`input`
  and `game_calls` on) and Bellows 0.10.0 added. Etch's plugin was not loaded:
  every reload went through Tongs' `console`, which calls the same console
  dispatcher. Bellows' `attr_cache` was on in the first two vanilla sessions
  and off in the Anbennar session and the H9 control.
- **Profiles.** Private profiles copied from the corpus profiles, not the
  player's, with 3440×1440 borderless and UI scale 1. Each playset had a last
  overlay mod holding a copy of the winning `interface/provinceview.gui` (the
  game's in vanilla, P2KE Patch - Anbennar's in the Anbennar playset) and, in
  vanilla, `countryview.gui`, `speed_controls.gui` and `topbar.gui`. Before
  each reload a marker text (`ETCH166 R<n>`) was written into the copy's
  window, so each reload showed a change of its own.
- **Saves.** Vanilla: the corpus save `mp_Russia1719_03_17.eu4` (SHA-256
  `2A4CAF30…F56F6A`) and saves made from it in the run. Anbennar
  (Anbennar, Proper 2K UI Enhanced, P2KE Patch - Anbennar):
  `Verne1444_11_11_test.eu4` (`57CB4550…704AA0`).
- **Procedure.** The EU4 engine lab's procedure: its game lock for the
  batch, the Process Lasso rule `eu4.exe,0,1-7`, a suspended start with the
  mask `0xFE`, the main thread on CPU 4 and 6 workers in both pools (Tongs
  `threads`), and closing only after the PID, image path and creation time
  were checked again. The settings were put back to the baselines after each
  session; only `graceful_exit` differed.
- **Times.** `queued + run` is Tongs' wait for the next frame plus the
  console call on the main thread. The client's own times include about
  150 ms of process start per call of the measuring script, which Etch does
  not pay, so they are left out of the budgets.

## Results

### H1: the province view follows a reload of its real file

Holds. After `reload provinceview.gui` with the view open, the view showed
the new marker, the same province with its data, the same background (own or
foreign) and the buildings sub-window it had open: vanilla on an own province
(Maikop) and a foreign one (Plovdiv), Anbennar on an own province
(Heartspier) and a foreign one (Khenahap). 26 reloads in all (21 vanilla,
5 Anbennar), no crash. The game writes `Missing Button 'close_button' in
window 'provinceview'` and `Missing Icon 'remove_parliament'` to `error.log` on
each vanilla reload: the rebuild binds widgets the vanilla file does not have.

**Policy:** unchanged; `provinceview.gui` is a listened file and is reloaded.
The two `error.log` lines must not become diagnostics of the user's file
(they come from the game's binding code, also with the unchanged file).

### H2: a rebuild shows a closed view

Holds. With the view closed after it had shown Plovdiv, the reload opened it
again on Plovdiv, with its buildings sub-window. Before any province was
shown, the reload set the view visible but left it at its hide position, off
screen, so nothing was drawn.

**Policy:** the plugin records whether the province view was visible before
the reload and closes it again through the game when it was not, so saving a
file does not open a window over the player's map.

### H3: rows and windows of the file go stale or leak

Holds, with two kinds of leftovers:

- **Rows built from the file outside the rebuild go stale and stay.** In the
  vanilla session that had opened two provinces, 2,834 hidden top-level roots
  built from `provinceview.gui` definitions (2,363 of them read as
  `culture_item` before the first reload) went stale at the first reload.
  Their number did not grow: 3,158 roots after 3 reloads, 3,175 after 20.
  None was visible. In the Anbennar session, which built no such rows, no
  root went stale in 5 reloads.
- **Each reload leaks one hidden `colonisationpanel` root** (vanilla and
  Anbennar), and private memory grew by about 0.6 MB per reload (4,107 MB at
  reload 5, 4,119 MB at reload 20).

**A stale check by definition liveness is not sound.** Tongs marks a widget
stale when its definition pointer is not among the live definitions. After
later reloads the same 2,363 roots read as live again under other names
(`native_building_entry`), and the count of stale roots read 471, then 2,363,
then 471 again: the freed definitions' memory is reused by the new ones.

**Policy:** the stale-root check after a reload compares the root widgets
collected before the reload (built from the file's top-level definitions)
with those still alive after it, by widget pointer, as the research
recommends; it does not trust a definition-liveness read alone. Hidden stale
rows do not hold further reloads; a visible one does. Panel reloads leak too
little to need their own limit within the 20 tested; count them and treat 20
panel rebuilds as the tested range until longer runs exist.

### HUD leaks and the leak limit

Ten `reload topbar.gui` in vanilla, after a save load: each reload added about
40 top-level roots (326 before, 707 after 10), one more in-game save menu and
load menu (`menu_save`, `menu_load`: 1 → 11), 15 more outliner header rows
(30 → 180), about 2 stale roots (21 after 10) and about 1 MB of private
memory. No stale root was visible and the game did not crash. A
`reload ingamesavemenu.gui` with the 11 leaked save menus left their number at
11 and did not crash.

**Policy:** the working limit of 10 HUD rebuilds stays: it is the tested
range, nothing visible went stale within it, and the cost per rebuild is
small but grows without bound.

### H4: hovering a stale widget

Not provoked, as the research advised. The rule stays: a visible stale window
holds reloads until a restart.

### H5: Anbennar's custom GUI after a rebuild

Holds. In the Anbennar playset the province view's row of `custom_gui`
buttons looked the same before and after the reload, and the one widget named
in Anbennar's `common/custom_gui/provinceview.txt` that was visible on that
province (`province_window/province_button_button`) was there after it.

**Policy:** unchanged; custom GUI of a rebuilt window needs no restart. A
change of the `common/custom_gui` file itself still does.

### H6: an in-process save load does not rebuild the files without a listener

Does not hold. With the country view open, `reload countryview.gui` and
`reload speed_controls.gui` left both windows stale and visible (the old
definitions drawn, the marker missing), as the research said. A save made in
the same game and loaded through the Esc menu (2.4 s to `in_game`) did not
rebuild either: both roots were still stale afterwards and `speed_controls`
was still visible. The first `reload topbar.gui` after it rebuilt
`speed_controls` from the new definitions.

**Policy:**

- `speed_controls.gui`: reload, then reload a HUD file the in-game idler
  listens to (`topbar.gui`), which rebuilds it and counts as a HUD rebuild.
- `countryview.gui`: planned restart. The "save and load in the same
  process" step leaves the table.

Seen on the way: the in-game load asks "Are you sure you wish to load
savegame … and abort your current game?", and a Load with no save selected
asks about an "Old Savegame" with an empty name and then loads nothing.
**Exit to Main Menu** leads to the end-of-game screen, whose only button
(**Quit**) ends the process, and the game then starts itself again as a child
process with the same command line (`continue=<save>`, `-userdir`). The live
game must treat such a child as its own game (adopt or close it after the
identity checks), not as a crash and a second game.

### H7: `-continue` with the private profile

Holds for the start, not for Anbennar's prompt. Every start of this run used
`continue=<save>` before `-userdir=<private profile>/`:

- Vanilla: in the loaded game 18.3–20.0 s after the process started
  (3 starts, the corpus save and saves made in the run).
- Anbennar: the achievements confirmation ("Anbennar achievements can be
  earned while not in Ironman…") still shows, 90.7 s after the start; the
  game was loaded 4.3 s after confirming it, 102.6 s after the start. This
  was the first Anbennar start of the day; earlier starts to the main menu
  took 36–40 s (docs/game-host.md). After the load the Anbennar settings event
  (`anb_settings.1`, regions and achievements) and the start events of the
  save open as for any new game.

**Policy:** a restart in the Anbennar playset answers the achievements prompt
(`DefaultConfirm/AgreeButton`, as the corpus driver does) and leaves the
events to the player; the progress shown in VS Code counts the prompt. No time
target, as settled.

### H8: reopening the province after a restart

Not checked. Tongs cannot call the province-selection function `0x139C830`;
this needs the live game's own plugin code. After a restart the province view
opened by a map click on a province, and the game's own Goto box (minimap
`button_goto`, **Go to home capital** or a province name) moves the camera
there, but where a map click lands depends on the camera, which the game
scrolls towards the real cursor when it is outside the window.

**Policy:** unchanged (best effort, then the map with a notice); the reopen
through `0x139C830` is checked when the plugin has it.

### H9: files created after the start

- **A `.gui` file created after the start is seen.** With `attr_cache` on, a
  new `interface/etch166_new.gui`: `window open` failed before the reload,
  `reload etch166_new.gui` loaded it and `window open` showed it.
- **A texture created after the start is not seen when its sprite was drawn
  missing before.** A sprite type whose texture file did not exist when a
  window first drew it kept failing after the file was created: `error.log`
  got about 220 lines per second (`Error initialising texture …`) while the
  window was open, `reloadtexture` answered "Reload failed", and closing,
  reloading and opening the window again did not help. The same happened with
  `attr_cache` off, so the game's texture handler keeps the failure, not
  Bellows: Bellows' `attr_cache`, `verifypath_listing` and `exists_index` stop
  at the game's readiness (their source, and the same result with the cache
  off).

**Policy:**

- Bellows' negative file cache may stay on for the playset's mod folders: it
  is off after the start, and nothing seen after the start depends on it.
- A texture that a sprite type names and that was missing when the game first
  drew it needs a planned restart, with that reason. The `error.log` lines it
  causes come every frame; the error log reader must collapse repeats.

### H10: the `texture`, `particle`, `guianim` and `assets` reload targets

In a loaded vanilla game, one call each:

| Target | Answer | Main thread |
| --- | --- | --- |
| `reload texture` | "texture reloaded!" | 1,278 ms (a 1.3 s freeze) |
| `reload particle` | "particle reloaded!" | 84 ms |
| `reload guianim` | "guianim reloaded!" | 442 ms, then the game **crashed** on the next frame: an access violation in `d3d9.dll` on the main thread, about 0.1 s after the answer |
| `reload assets` | not run: sent after `guianim`, it waited for a main thread that never came back | — |

Whether `assets` reloads sprite types was not established.

**Policy:** Etch never sends `reload guianim` and does not use `reload
texture` (it reloads every texture at once; `reloadtexture <file>` stays the
way to change one). `reload assets` is not used until it is checked on its
own; a `.gfx` change stays a planned restart.

### H11: beside the player's own game

Open. The lab's launcher refuses to start a game while any `eu4.exe` runs, so
the check would start the private copy first and the player's game from Steam
beside it; it waits for a free lab and the player.

**Policy:** unchanged until checked: Etch does not start the live game while
the player's game runs, and warns when the player starts theirs later.

## Budgets: saved file to the changed frame

Main-thread cost of the reload (`queued + run`), per kind:

| Kind | Reloads | Median | p95 | Max | Target |
| --- | --- | --- | --- | --- | --- |
| `provinceview.gui`, vanilla | 17 | 59 ms | 119 ms | 119 ms | 100 ms |
| `provinceview.gui`, Anbennar | 5 | 29 ms | 66 ms | 66 ms | 100 ms |
| `topbar.gui` (HUD), vanilla | 10 | 57 ms | 109 ms | 109 ms | 200 ms |

The next frame of the main loop came about 23 ms after the answer. The
vanilla province view misses the 100 ms p95 target by itself: 4 of its 17
reloads took 94–119 ms, the others 49–66 ms. The time from the file's save to
the call (the extension's watcher and the pipe) adds to this and was not
measured, because Etch's plugin was not used.

**Policy:** the HUD target holds. The listened-reload target is met by the
median, not the p95, on the vanilla province view; measure it again with the
live game's plugin, from the save in VS Code to the frame, before tightening
or raising it.
