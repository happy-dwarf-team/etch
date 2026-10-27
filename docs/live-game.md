# The live game

The live game is EU4 itself, started by Etch from a private copy with the
edited mod's playset and played by the user; each **saved** file of the
playset is reloaded into the game's own window, with its real data. It replaces
Etch 1.x's game host (ADR 0005). What it does was decided in etch#157 and
corrected by the live checks in [live-game-checks.md](live-game-checks.md);
[section 6 of the v2 specification](spec/v2.md#6-live-game) is the
requirement. This page says how it is built. The code is in
`packages/extension/src/live-game/` and the plugin in `plugin/`.

| Module | What it does |
| --- | --- |
| `install.ts` | the private install: junction copy, pinned builds, private profile, the player's settings |
| `saves.ts` | the player's settings and saves: copy, ironman detection, the newest save |
| `process.ts` | one game process: lock, start, identity checks, handshake, adoption, stop |
| `pipe.ts` | the session pipe's client, protocol 2 ([plugin-protocol.md](plugin-protocol.md)) |
| `watchdog.ts` | the hang check, the crash limit, the restart queue |
| `policy.ts` | the reload policy: what a saved file makes the game do |
| `error-log.ts` | `error.log`: new lines, collapsed repeats, textures drawn missing |
| `live-game.ts` | `LiveGame`, the owner: start, stop, reloads, planned restarts, crashes |
| `pick.ts` | what a pick opens: the winning file, the line, templates and sprites; **Override in my mod** |
| `pick-mode.ts` | pick mode in VS Code: the toggle, the key setting, opening a pick, read-only files |
| `index.ts` | the commands, the status bar item, the save and texture watchers |
| `windows.ts` | the Win32 helper: identities, verified stops, child processes, `eu4.exe` processes |

## The private install

The private install is 1.x's game host install, renamed (its layout, checks
before every start, removal and limits are in
[game-host.md](game-host.md): Layout without `overlay/`, Before every start,
Removal, What the install never does). It lives in the extension's global
storage under `private-install/`, with the record `etch-private-install.json`.
2.0.0's first activation removes a 1.x `game-host/` install through the same
removal, with one notice, unless a 1.x window still runs its game host (the
lock file keeps its 1.x name, `game-host.lock`, so that the two exclude each
other).

It holds the pinned builds of Anvil (with `anvil-game`), Bellows, Tongs and
Etch's plugin ([pins/README.md](../pins/README.md)); their hashes are checked
before every start, and nothing else stays in `anvil/plugins/`.

- **Tongs** is loaded for its in-process service `tongs.ui` only. Before every
  start the install removes `anvil/data/tongs/settings.toml`, and the game's
  environment drops `ANVIL_TONGS_*`, so Tongs keeps its defaults: no pipe, no
  input, no game calls. Etch's plugin declares a hard dependency on it, which
  puts the plugin in Anvil's main phase.
- **Bellows'** negative file cache may stay on: it stops at the game's
  readiness, and nothing seen after the start depends on it (H9).

## Start

**Etch: Start the Live Game** (or the preview's button) starts it with the
preview's playset. A start:

1. **Is refused while the player's own game runs:** any `eu4.exe` whose image
   is the player's game folder's. The live game counts as the player's Steam
   session (H11), so the player's game must be closed first.
2. **Asks once for confirmation** (recorded in the global state): the game
   runs in the foreground, takes the player's settings at every start, plays
   copies of their saves in its own profile, writes nothing back, and counts as
   their EU4 session for Steam. When the player's autosave is off, it says that
   the live game autosaves monthly.
3. **Asks where to start:** **Continue** (the newest save of the private
   `save games/`), **Main menu**, then the player's saves, newest first. A
   chosen save is copied into the private `save games/` (a private save of the
   same name that differs is never overwritten: `-2` is added). Ironman saves
   show with a lock and the reason, and are not copied: an `EU4bin` save, or a
   text save (plain or zipped `meta`) that says `ironman=yes`.
4. **Prepares the install** and copies the player's `settings.txt` and
   `pdx_settings.txt` into the private profile, byte for byte, except that
   `autosave="NEVER"` becomes `"MONTHLY"`. Changes made in the live game do not
   last. A player without settings gets a borderless window at the monitor's
   size.
5. **Starts `eu4.exe`** from the install with `-continue=<save>` (when a save
   was chosen) and `-userdir=<private profile>/`, `ETCH_HOST_SESSION`,
   `SteamAppId` and `SteamGameId`. The lock records the game's identity; the
   plugin's `hello` must name the same PID and creation time. The game is ready
   when `anvil-game.ready` is published.
6. **In Anbennar's playset** (Workshop item `1385440355`), after a start from a
   save, answers the achievements prompt with Enter while
   `DefaultConfirm/AgreeButton` is on screen (the plugin's `confirm`, H7), until
   the save is loaded. The save's own events are left to the player.

## Stop and exits

- **Etch: Stop the Live Game**, the status bar item, or closing the VS Code
  window: a loaded game is saved first through the plugin's `save`, the game's
  own `autosave` (it writes `autosave.eu4` and keeps the two before it as
  `old_autosave.eu4` and `older_autosave.eu4`; the console's `savegame`
  writes nothing), waiting up to 30 s until the file is written. Then the
  process is closed after its PID, path and creation time are checked, with
  any crash reporter it started. In the main menu, in ironman and in
  multiplayer nothing is saved.
- **A quit from the game** (exit code 0, or an unknown code with no crash
  reporter) is a stop, not a crash.
- **Exit to Main Menu** ends the process (exit code 0), which starts itself
  again as a child with the same image (H6). The live game looks for that
  `eu4.exe` child for 10 s and adopts it when its plugin answers on the same
  session's pipe within 15 s: its identity is checked and recorded in the lock.
  In the live run the child wrote no Anvil log and served no pipe, so it runs
  without Etch's plugin: the live game then closes it after the identity checks
  and stops, saying so. Neither is a crash or a second game.
- **Etch: Open the Live Game's Saves Folder** opens the private `save games/`.

## Reload policy

`policy.ts` decides, the plugin runs one job on the main thread
([plugin-protocol.md](plugin-protocol.md), `reload`). Text files go to it when
VS Code saves them; textures when an image editor writes them into the
workspace and they stay unchanged for 300 ms.

| Saved file | What the live game does |
| --- | --- |
| not in a folder the game reads (a README, `.etch/`) | nothing |
| another mod's copy wins in the playset | nothing; a `game-original-differs` warning names the mod |
| a `.gui` file with a listener (the province view, the country view's tabs, the ledger, settings, the event window, any other) | `reload <file>`, stale check; counted as a panel rebuild |
| one of the in-game idler's 13 files (`main`, `topbar`, `menubar`, `macrobuildinterface`, `macrobuildinterface_override`, `papacy`, `great_powers`, `parliament`, `mapmode_more`, `more_interface`, `unitpanel`, `outliner`, `core`) | `reload <file>`, stale check; counted as a HUD rebuild |
| `provinceview.gui` | as a panel; when the rebuild shows the view it was closed, the plugin closes it again with Escape (H2) |
| `speed_controls.gui` | `reload`, then `reload topbar.gui`, which rebuilds it; a HUD rebuild (H6) |
| `countrydiplomacyview.gui` | an open `DeclareWarDialog` is closed through the game first; Etch asks the player to open it again |
| `countryview.gui`, `core.gui`, `.gfx`, fonts, `common/custom_gui`, `common/scripted_guis`, a `.gui` with a top-level name written twice, any other file the game reads only at start | planned restart, with the reason (`core.gui` is in the idler's list, but its templates build windows nothing rebuilds: a reload left the map's unit icons stale on screen, live) |
| `localisation/*.yml` | `reloadloc`, then `reload` of the listened panels whose windows are on screen (from the plugin's list of visible windows) and of `topbar.gui` once when a HUD file's window is: any HUD file rebuilds the whole HUD. Other visible files are not reloaded (live: `mapicons.gui` left the unit icons stale) |
| a texture | `reloadtexture` with every spelling the playset's `.gfx` files use; "Reload failed" is not an error |
| a texture created after the start that `error.log` shows was drawn missing | planned restart (H9) |

Never `reload guianim`, `reload texture` or `reload assets` (H10): the plugin
refuses every console line but `reload <name>.gui`, `reloadloc` and
`reloadtexture <texture>`. In ironman and multiplayer the plugin refuses
reloads (the console would too); Etch says so once per game session and never
goes around it.

### Stale windows and leaks

The plugin reads the top-level windows through `tongs.ui` before and after the
job, hidden and stale ones too. A window built from the saved file before the
job whose widget id is still alive after it was not rebuilt: it is **stale**
(H3). Ids only: a liveness read of the definitions is not trusted, since the
game reuses their memory. Hidden stale rows hold nothing; a **visible** stale
window asks for a planned restart.

HUD rebuilds leak about 40 top-level windows and 1 MB each: the 10th asks for a
planned restart (the tested range). Panel rebuilds leak about 0.6 MB each and
are counted; past the tested 20 the log says so, and nothing more.

### `error.log`

Before a job the new lines are skipped; 250 ms after its answer the lines the
job added go to Problems on the saved file (source "Etch live game"), through
the core's `errorLogDiagnostics`: a line naming the file's line goes on that
line, a missing sprite on the widgets that use it, anything else on the
file's first window. Repeats are collapsed with their count (a texture drawn
missing writes about 220 lines a second, H9), and the two lines the game writes
on every vanilla province view reload (`Missing Button 'close_button'`,
`Missing Icon 'remove_parliament'`) are left out. A console line the game
refused is a `game-console-answer` error.

## Planned restarts

A planned restart has a cause from the table, a visible stale window or the HUD
limit. Etch shows "Restart needed: <reason>" with **Restart now** and
**Later**; until then the live game is `stale`: reloads wait, and the status
bar item says so and restarts it on a click. Etch never restarts a played game
without the click, except after a crash.

**Restart now** saves through the plugin (`autosave.eu4`, as for a stop),
closes the game and starts it again from the newest private save, which is
that one, with VS Code's progress shown. In Anbennar's playset it answers the
achievements prompt. A game that does not write the save within 30 s is closed
anyway, and the restart continues the newest save there is.

## Crashes

The watchdog (1.x's, [game-host.md](game-host.md), "Restart and watchdog")
pings the plugin every second. A crash is:

- a dead process (an exit that is not a quit or Exit to Main Menu);
- a hang: no answer to a ping for 10 s, or a frame counter that stands still
  for 10 s **while the game's window stops taking messages** (the plugin's
  `IsHungAppWindow`), or for 5 minutes in any case. A save loading from the
  menu or through `-continue` is one frame of the main loop but keeps the
  window responding, and the plugin's own save answers pings as `busy`, so
  neither is a hang;
- a console fault in a reload;
- a start that ends or hangs.

After a crash the game starts again at the newest private save (an autosave,
the save of a stop or a planned restart, or a manual save). The third crash within 5 minutes
stops the live game and names the last cause with the end of `error.log`.

## Reopening the view

After a restart the province view is closed and the game shows the map. Etch
does not reopen the province yet: the plugin does not call the game's own
province selection (`0x139C830`, H8), which needs the province holder (the
in-game idler's `+0x1220`) and a province by id, neither of which the plugin
can reach yet. When the province view or the country view was on screen at the
last reload, Etch says after the restart that it was not reopened. This is the
recorded workaround of H8 until the plugin has it.

## Pick mode

Pick mode (spec section 7, etch#158) points at a widget in the live game and
opens the definition the game built it from. The plugin's half (the hotkey,
the swallowed click, the outline and label, the stack under the pointer) is
in [plugin-protocol.md](plugin-protocol.md), "Pick mode"; the checks it rests
on are in [pick-mode-checks.md](pick-mode-checks.md).

- **On and off.** The hotkey in the game (`etch.liveGame.pickModeKey`,
  default `Ctrl+Shift+E`), or **Etch: Toggle Pick Mode**, which also asks the
  plugin to bring the game forward. The key is written to the plugin's Anvil
  setting (`anvil/data/etch/settings.toml`) before every start and sent over
  the pipe when the setting changes while the game runs. When the game is
  ready the extension sends the key, the mod that supplies each of the
  playset's interface files (for the label) and VS Code's window: the
  extension host's parent process, VS Code's main process, which owns the
  windows, and the workspace's name, which its title holds.
- **What a pick opens** (`pick.ts`): the picked widget's game path resolved to
  the playset's winning file. In that file, as the editor has it (its buffer
  when it is open), the widget whose opening `{` is on the reported line and
  whose name matches (H2: the keyword may be on the line before); else, when
  the file changed since the game read it, the widget found by the names of
  its chain from the outermost parent in the same file; else the first widget
  of its name; else the file at the reported line. A stale widget has no file:
  it opens by its names in the nearest file of its chain.
- **Templates.** Where the chain's file changes above the picked widget (a
  list row built by name, a `core.gui` scroll bar part, an icon template from
  another file, H3), the widget that references the template opens first, and
  **Go to template** opens the picked widget's own definition.
- **Sprites.** An icon or button that names a sprite (`spriteType`,
  `quadTextureSprite`) offers **Go to sprite**, through Etch's `.gfx` index:
  the game keeps no file or line for sprites (H9).
- **Read-only.** A file outside the edited mod (vanilla, another mod) opens
  read-only for the session, with "Defined in <mod>, read-only" and
  **Override in my mod**.
- **Override in my mod** (also **Etch: Override in My Mod** on any interface
  file of the playset): copies the winning file byte for byte to the same game
  path in the edited mod's folder and opens the copy at the same line. It
  warns, and still copies, when a later mod of the playset has the same file;
  if the mod has the file already nothing is copied. A `.gui` file created
  after the start reloads like any other (H9 of the reload checks).
- **VS Code in front.** The game is the foreground process at the click, so
  the plugin calls `AllowSetForegroundWindow` and brings VS Code's window
  forward itself; the extension then shows the file at the line. Pick mode
  stays on. The log line of each pick gives the time from the click (the
  plugin's system clock) to the line shown in the editor.

## Live snapshot

A live snapshot (spec section 7, etch#170) is every widget of one top-level
window as the live game showed it, hidden ones too: path, type, `visible`,
`enabled`, `checked`, text and rectangle, the fields of `tongs.ui` version 1,
read in one `find` on the main thread (the plugin's `snapshot`,
[plugin-protocol.md](plugin-protocol.md)). The core's `profile/live.ts` holds
the format and what the preview takes from it; the extension's
`preview/live-snapshots.ts` keeps them.

- **Taken** by a pick (the plugin pushes the snapshot of the picked widget's
  top-level window right after the pick), by **Etch: Snapshot from the Live
  Game**, or by **Refresh from live game** in `Data ▾`, of the previewed
  window when the game shows it ("not on screen" otherwise). No snapshot is
  taken of a stale window; stale widgets inside one are left out and counted.
- **Format:** JSON, `formatVersion: 1`: the window, the time, the save the
  live game started from, the SHA-256 of the window's winning `.gui` file, the
  game process (PID and start time), the game window's size, the widgets and
  the stale count. A list box's rows are by position, `…/listbox/row[2]/…`: a
  window under a list box is one of its rows, numbered in the order the game
  holds them. The game date waits for `anvil-game` to offer it (spec
  section 17).
- **Kept** in the extension's workspace storage (`live-snapshots/<playset>/
  <window>.json`), the latest per top-level window and playset; a snapshot of
  another playset drops the others. Never in the mod's project, never shared
  or exported.
- **Texts:** the top layer of `Data ▾`, matched by widget path; a value whose
  widget the window no longer has falls through to the lower layers, and
  `Data ▾` counts it ("N values no longer match"). After a restart or with
  another save it is marked "older"; it never expires by time.
- **Selectors (`live`):** the `resolution` selector takes the game window's
  size; every other selector the value whose rules and groups predict exactly
  the visibility the snapshot shows for the widgets they name (the default
  when several fit; when none fits, `View ▾` names it and the selector keeps
  its other source). Two passes, so that one selector's value can follow
  another's. Etch reads no facts from the game.
- **Against the profile:** where the profile, with those selectors, still
  predicts otherwise than the game showed (a widget whose parent the game
  showed, created in the view, shown or hidden against the game), the path
  becomes a toggle "from the game": applied before the hand toggles, marked in
  the Widget Outline, counted in the `View ▾` label ("live · 2 from the game")
  and noted as "Profile differs in N paths" beside **Open profile** and
  **Save as view**. Etch writes no rules, and the differences are not
  Problems.
- **A pick** pins the preview on the picked widget's top-level window with
  its view cleared to the game's (no view, no selector set by hand, no hand
  toggles) and the live layer on. A pick is a moment: the preview does not
  follow the game afterwards.

## Live runs

Run on 2026-10-27 under the EU4 engine lab's procedure (its game lock for the
batch, `eu4.exe` 1.37.5 `9AD3EFE1…DC4D771A` and the Process Lasso rule
`eu4.exe,0,1-7` checked before and after, every process closed after its PID,
path and creation time were checked). The builds were this milestone's: Anvil
1.5.2, Bellows 0.10.0, Tongs 0.17.0 and Etch's plugin from the branch. The
extension's own modules (`install.ts`, `process.ts`, `pipe.ts`, `policy.ts`,
`saves.ts`, `error-log.ts`, `watchdog.ts`) drove the game from a Node script of
the lab, not from VS Code: the times below leave out VS Code's save event and
watcher. Tongs' pipe was switched on in the lab's copy for its state and the UI
steps (opening a province, the Esc menu); its input too, except where said.
Settings were copies of the player's (3440×1440 borderless, UI scale 1); saves
were copies of the precision corpus's (vanilla: Russia, 17 March 1719;
Anbennar playset with Proper 2K UI Enhanced and P2KE Patch - Anbennar: Verne,
11 November 1444). Nothing of the player's profile, saves or mods was written.

**Start and the plugin.** The plugin loaded in Anvil's main phase after Tongs,
found `tongs.ui` and served its pipe 218–234 ms after the process started.

| Start | Ready (main menu) | Then in the loaded game |
| --- | --- | --- |
| vanilla, `-continue=` a copied save | 13.2–18.9 s | 7.1–11.6 s |
| Anbennar, `-continue=` a copied save | 34.7–37.2 s | 8.7–11.5 s, the prompt answered by the first Enter 0.5 s after ready (Tongs' input off) |

**Reloads.** Times on the main thread (the console line, and the whole job with
the two `tongs.ui` reads), from the request to the answer, and from the
request to the next two frames plus planning, as median / p95:

| File | Reloads | Console | Job | Request to answer | Plan, answer and frames |
| --- | --- | --- | --- | --- | --- |
| `provinceview.gui` open, vanilla (about 1,300 top-level windows) | 20 | 74 / 81 ms | 122 / 140 ms | 134 / 153 ms | 168 / 181 ms |
| `provinceview.gui` open, Anbennar | 10 | 25 / 57 ms | 52 / 84 ms | 57 / 85 ms | 92 / 126 ms |
| `topbar.gui` (HUD), vanilla | 10 | 78–103 ms | 140–163 ms | 144–165 ms | about 195 ms |

The reads of the stale check cost 30–50 ms in vanilla, growing with the leaked
windows; the vanilla province view misses the 150 ms target (spec section 9,
reported), Anbennar's and the HUD's meet theirs.

- **Stale check:** after the first reload of a province view that had built
  culture rows, 969 of the 970 windows built from `provinceview.gui` stayed
  alive and hidden: stale (H3); the view itself was rebuilt. No visible stale
  window in 50 province view and 10 HUD reloads. Each province view reload left
  one more top-level window, each `topbar.gui` reload 42–45 (H3).
- `speed_controls.gui` was rebuilt through `topbar.gui`, not stale (H6);
  `countryview.gui` asked for a planned restart.
- **Localisation:** `reloadloc` took 177–200 ms; the reloads of the listened
  views on screen after it, 230 ms. Before the list was limited, its reloads of
  `core.gui` and `mapicons.gui` left the map's unit icons stale on screen.
- **`error.log`:** the vanilla province view's two binding lines came on every
  reload and were left out; nothing else came.
- **H2:** a reload opened the closed province view again; `window close
  provinceview` failed, and a posted Escape (with Tongs' input on and event
  windows open) did not close it, while Tongs' own Escape did.

**Saves, stops and restarts.**

| Step | Result |
| --- | --- |
| `save` (`autosave`) | answered in 3–12 ms; `autosave.eu4` written 0.55–0.63 s later in vanilla (62 MB), 0.87–0.93 s in Anbennar (111 MB) |
| stop | saved, then the verified process terminated |
| planned restart | vanilla 25.0 s (save 0.6 s, ready 13.7 s, loaded 10.0 s later); Anbennar 48.4 s (save 0.9 s, ready 34.8 s, prompt and load 11.5 s) |
| crash (the verified process terminated, exit code 1) | restarted at the newest save, `autosave.eu4`, loaded 24.3 s after the crash |
| a lock whose owner is gone (the script ended with its game) | the game was gone with its owner; the lock was cleared and taken |
| Exit to Main Menu | exit code 0; the child `eu4.exe` was found at once, wrote no Anvil log and served no pipe for 120 s, and was closed after its checks |
| a game with stale windows on screen | `autosave` deadlocked (the main thread waiting, the window taking messages, the frame counter standing); the watchdog would have called it a hang after 5 minutes. Closed and restarted at the newest save |

The first start found a bug, fixed before these runs: a player's save was
copied into the private profile before the install's record existed, so the
install refused its own folder.

**Not checked live:** the extension inside VS Code (the quick pick, the
notices, the status bar, the watchers and their latency), textures,
`DeclareWarDialog`, ironman and multiplayer, a hang timed by the watchdog,
reopening the view (H8).

## The province view after a rebuild (H2)

Run on 2026-10-27 for M10 with Etch's plugin from this change (Escape through
the game's SDL queue), in vanilla (Russia, 17 March 1719) and the Anbennar
playset (Verne, 11 November 1444, its three opening events on screen), through
the lab's script of the M8 runs, under the lab's game lock with the procedure
above; Tongs' input on in the lab's copy for opening and closing a province.

| Before the reload of `provinceview.gui` | Vanilla | Anbennar playset |
| --- | --- | --- |
| No province shown yet | the rebuild set the view visible; the Escape opened the game's menu, which the plugin closed again (`menu_undone`) — twice; without that undo (the first build) the menu stayed open | the same, once |
| A province shown, the view closed (by its close button, or Escape) | the view stayed closed: three reloads, one of them of an edited file | the rebuild set the view visible, the Escape opened the menu, undone; the view hidden after |
| The view open | it stayed open | it stayed open |

The Anbennar prompt was answered by the first Enter through the SDL queue
(4.8 s after ready). No crash. The reopening on the province the M8 check saw
(H2) did not come back in these runs; when the rebuild leaves the view open
on screen the same Escape closes it, as Tongs' did.

## Open points

- **The province view's reload budget:** the stale check's two reads make the
  vanilla reload miss 150 ms at p95; reading only the windows built from the
  file, or the windows before the job from the last job's read, would cut it.
- **Saves of other playsets.** The private profile has one `save games/` for
  every playset, so **Continue** may offer the newest save of another playset.
- **Reopening the view (H8)**, above.
