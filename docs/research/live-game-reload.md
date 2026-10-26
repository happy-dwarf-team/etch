# Research: how can the live game reload a mod's window in a loaded game and show it with its data?

Ticket: happy-dwarf-team/etch#152 (map: #151). Static reading only: the game was
not started, and no file of the game, its saves, mods, the player's profile or
the Process Lasso rule was changed. Build: `eu4.exe` 1.37.5 Steam win64,
SHA-256 `9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A`; the
installed EXE and the lab's analysed copy had that hash. Addresses are RVAs
relative to the image base `0x140000000`.

Methods, named for each claim:

- **decomp**: Ghidra 12.1.4 decompiler on a private copy of the EU4 engine
  lab's Ghidra project (the lab's own project was locked by another reader, so
  it was copied and opened from the copy; the lab's project and EXE were not
  changed). The pseudo-C is not reproduced here.
- **xrefs**: Ghidra references to an address or a string.
- **bytes**: vtable slots read from the program.
- **files**: the vanilla and Workshop `.gui` and `custom_gui` files (read only).
- **v1**: earlier Etch research and prototypes, cited by ticket. Their claims
  were checked statically or live there, as each says; they are repeated here
  only where the live game depends on them.

Earlier work reused (cited as "#n"):
[#2](https://github.com/happy-dwarf-team/etch/issues/2) (branch
`research/interface-reload`, `docs/research/interface-reload.md`: the reload
command and its listeners),
[#6](https://github.com/happy-dwarf-team/etch/issues/6) (branch
`prototype/game-reload`: live reloads in a loaded game),
[#14](https://github.com/happy-dwarf-team/etch/issues/14) (branch
`research/stale-definitions`: stale widgets, leaks, the run-1 crash),
[#16](https://github.com/happy-dwarf-team/etch/issues/16) (branch
`research/preview-copy`), [#21](https://github.com/happy-dwarf-team/etch/issues/21),
[#22](https://github.com/happy-dwarf-team/etch/issues/22),
[#117](https://github.com/happy-dwarf-team/etch/issues/117),
[#118](https://github.com/happy-dwarf-team/etch/issues/118),
[#126](https://github.com/happy-dwarf-team/etch/issues/126) and
`docs/game-host.md`.

## Short answer

The live game can reload the **real** file (`reload provinceview.gui`, not a
renamed preview copy) and the change shows in the game's own window with its
data, **for files the game itself listens to**. The game rebuilds a window on
`reload <file>` only when an object registered under that file path; it then
destroys the window, builds it again from the new definitions and binds it to
the same controller, which still holds its data. The province view is such a
window: its controller keeps the province it shows, rebuilds `provinceview`,
binds every child again (own and foreign province, buildings, state view, the
Anbennar `aPUI_*` windows nested in it), restores its open sub-panels and
refills itself from the same province. The country view tabs, the ledger, the
settings menu, the event window and the HUD files registered by the in-game
idler (`topbar.gui`, `outliner.gui`, `menubar.gui`, `macrobuildinterface*.gui`)
rebuild the same way.

Three things limit it:

- **Files with no listener** leave their live windows on freed definitions
  until something builds them again. Among the corpus files these are
  `countryview.gui` (the country view's frame) and `speed_controls.gui`; also
  windows that code builds on demand from a listened file, such as an open
  `DeclareWarDialog` (in `countrydiplomacyview.gui`). Such windows are what
  crashed before (#22: a reload of an open window that nothing rebuilt).
- **Rebuilds leak.** The in-game idler's HUD rebuild leaks four windows and
  the outliner rows on every reload of its 13 files (#14), and every panel
  rebuild shows the window, even if it was closed (by reading; live check H2).
  Repeated reloads while playing are safe as long as nothing reads or hovers a
  leaked or stale window, which a player cannot promise; the live game needs a
  reload count after which it restarts.
- **Not reloadable in a running game:** `.gfx` (sprite types), fonts, the
  `common/` files of custom GUI (`custom_gui`, `scripted_guis`), a file with a
  top-level name written twice, and resolution or UI scale. These need a
  restart, and a restart can bring the player back with the game's own
  `-continue=<save>` (verified in the lab) and the province reopened through
  the game's own province-selection function (by reading; live check H8).

## Verified statically

### The reload path (from #2 and #14)

1. `reload <file>.gui` (console handler `0xE58C10` → `0x14E1D20` →
   `0x14E1140`) reads the file through the game's file system (PhysFS, so the
   playset's winning copy of that path), parses it into the GUI manager's type
   registry, **deletes** each old top-level definition of the same name, and
   then calls slot `+0x10` of every listener registered under that file path in
   the reload registry (singleton `0x242BF58`) (#2 claims 2–10, #14 claim 3).
   After a successful reload it also rebuilds the hints window (#2 claim 2).
2. Listeners register in two ways (#2 claims 5–6, #14 claim 13): with a literal
   path (`0x14E0D90`; for example the in-game idler `0x803270` for 13 HUD
   files), or through the self-registering base `0x14E1F60`, keyed by the
   source file of the window's definition (`type+0x30`). The second covers
   about 55 classes (54 functions call `0x14E1F60`, xrefs).
3. A window that no listener rebuilds keeps its widgets, whose definition
   pointer (`+0xB0`) now points at freed memory (#2 claim 10, #14 claims 6–11).
   Nothing on the per-frame update, layout or drawing path reads it; the name
   slot, the tooltip fallback of buttons and check boxes and an
   `instantTextBoxType`'s definition text do (#14 claim 9).
4. The console dispatcher refuses these commands in ironman and multiplayer
   games (#2 claim 1, the Tongs console research). Etch's plugin calls that
   dispatcher (`plugin/src/console.cpp`), so the live game's reloads need a
   single-player, non-ironman game.

### Who rebuilds the corpus windows in a loaded game

| File | Listener (how found) | What a reload does |
| --- | --- | --- |
| `provinceview.gui` | province view, constructor `0x1343200` on the panel base `0x1054610` (xrefs, decomp) | rebuilds `provinceview`, keeps its province; see below |
| `countrycourtview.gui`, `countrydiplomacyview.gui`, `countryestatesview.gui` (and the other 11 tabs) | panel base `0x1054610`, handler `0x10548B0` (#14 claim 14) | rebuilds the tab; live in #6, the diplomacy tab followed the reload, showed itself and was empty until the next update |
| `topbar.gui`, `outliner.gui`, `menubar.gui` (Esc menu `menu`), `macrobuildinterface.gui`, `macrobuildinterface_override.gui` and 8 more | in-game idler `0x803270`, handler `0x82B470` (#2 claim 5, #14 claim 12) | hand-written HUD rebuild; leaks (see "Repeated reloads"); live in #6, 54–91 ms |
| `ledger.gui` | ledger, constructor `0x117BE40` calls `0x14E1F60`; vtable `0x1D653C0`, slot `+0x10` = `0x118A8E0` (xrefs, bytes, decomp) | rebuilds the ledger (`0x118A960`) and keeps its visibility |
| `settings.gui` (`menu_settings_ingame`) | constructor `0x10E83C0` on the self-registering base `0x10DDEB0`; vtable `0x1D5B790`, slot `+0x10` = `0x10DF560` (bytes, decomp) | rebuilds the window and shows it again only if it was visible |
| `eventwindow.gui` | event window `0x10B9A50` (#2 claim 6) | rebuilds; handler not read |
| `countryview.gui` | **none**: `countryview` is built by name in `RestoreDeviceObjects` (`0x81AF10`) into idler `+0x16F0`; no listener for the file (decomp, xrefs) | the frame stays on freed definitions until the next `RestoreDeviceObjects` (a save load, #2 claim 22) |
| `speed_controls.gui` | **none**: `speed_controls` is built by name in the topbar controller's bind `0x1431A80`, which only the idler's HUD rebuild calls (decomp, #14 claim 12) | stays stale until a reload of any idler file rebuilds it |
| `countrydiplomacyview.gui`: `DeclareWarDialog` | **none** for the dialog: built on demand by `0xF0ACD0` through the dialog base `0xEDEF60`; vtable `0x1D3BDB8` slot `+0x10` is not a reload handler (xrefs, bytes) | an open dialog stays on freed definitions; the next one opened uses the new file |
| `frontend.gui` | frontend `0x10D23C0` (#2 claim 5) | main menu only; not part of a loaded game |

Vanilla file names; in the Anbennar playset the same files are overridden by
the mods, and the reload reads the winning copy (#126, live search order).

### The province view

5. **One controller, built once per game session.** `RestoreDeviceObjects`
   (`0x81AF10`) calls `0x139BDF0` on the province holder at idler `+0x1220`,
   which allocates the province view (`0x1343200`) and keeps it at holder
   `+0x10`, next to the small province view (decomp).
6. **It listens for its file.** `0x1343200` calls the panel base `0x1054610`
   with `provinceview`, which looks the definition up and registers under its
   `type+0x30`, builds the window by name and hides it (decomp). The province
   view's vtable is `0x1D79470`; its reload slot `+0x10` is `0x1345F40`, its
   bind slot `+0x58` is `0x1344680` (bytes).
7. **What the reload handler `0x1345F40` does** (decomp), in order:
   - marks itself as reloading (`+0x9A8`), closes a popup it holds (`+0x26B8`),
     clears the `modifiers` list, and closes the institution window if open;
   - records whether the history window (`+0x2E8`) and two sub-windows of the
     province window controller (`+0x9C8` with `+0x1BA8` and `+0x1CF8`) are
     visible;
   - calls the panel base's rebuild `0x10548B0` with no country view refresh:
     destroy the window (slot `0x130`), build it again by its own name, set its
     override name, bind `close_button`, then the bind slot `0x1344680`, then
     the panel's show slot `0x1054840`;
   - passes the province it showed (`+0x958`) back to the game's own
     province-selection function `0x139C830` on its holder (`+0x26D8`);
   - reopens the history window and the province window's sub-windows that
     were visible.
8. **The province survives.** The province object pointer lives in the
   controller at `+0x958`, which the rebuild does not touch; the refill
   `0x13470C0` (slot `+0x48`, called by the show slot) returns at once when it
   is null and otherwise takes owner, area, region, names, capital and buttons
   from that province, choosing the own or foreign background
   (`provinceview_bg`, `provinceview_foreign_bg`, `_large`) from its owner
   (decomp).
9. **Every child is bound again.** `0x1344680` finds the sub-windows by name in
   the new window (`province_window`, `buildings_window`, `history_window`,
   `colonisationpanel`, the state view's buttons and sort buttons, the
   `strait_indicator`, `river_indicator`, `provincename`, `capitalname` and
   more) and re-binds their callbacks. It deletes the old history and
   colonisation panel objects (`+0x2E8`, `+0x2F0`) before it creates new ones
   (decomp), so these do not leak. Nested windows of the file, own and
   foreign province alike, and the Anbennar `aPUI_*` windows (nested in
   `provinceview`, files), are rebuilt with it.
10. **Other windows of the same file are not rebuilt by it.** `provinceview.gui`
    has 55 top-level definitions in vanilla, Proper 2K UI Enhanced, the patch
    and Anbennar alike (files). Besides `provinceview` they are list rows
    (`province_modifier_item`, `CoreShieldItem`, `unit`, building and state
    entries), position markers (`*_position`) and windows other code builds:
    `ClientStateSetup` (`0x1363D40`), `CustomizeColony` and
    `ConfirmCreateClientState` (`0xE2BAA0`), `edicts_window` (`0x13BC9F0`),
    `provinceview_client_state` (`0x13653D0`) (xrefs). List rows look their
    type up by name when built (#14 claim 18), so rows built after the reload
    use the new file.

### What crashed before

11. **#22, run 1:** a `reload` of the file of a window opened by `window open`
    (no listener) while it was open killed the game with an access violation.
    Etch v1 therefore always closed the window before reloading its file
    (`docs/plugin-protocol.md`, job step 1).
12. **#6, run 1:** a crash 3 s after `reload topbar.gui`, in a Tongs tree read,
    not in the game. #14 found it was a pure virtual call: Tongs called the
    name slot of a widget whose definition, freed by the reload, had been
    reused by a destroyed widget; the game's pure-call handler wrote the dump.
    The widget belonged to windows the HUD rebuild leaks (claim 13). The game
    on its own (drawing, hovering, clicking, a month at speed 5) did not crash
    in either run of #6.
13. **Repeated reloads leak** (#14 claims 16–17): each run of the idler's HUD
    rebuild creates `alerts_parent`, `hotkey_assign_parent` and the in-game
    load and save menus again without destroying the old ones, and leaves the
    outliner's header rows alive with no owner; the leaked save and load menus
    stay registered as listeners. The next reload of their files makes the
    leaked windows stale.
14. **Tongs reads around stale widgets now.** Since Tongs 0.14.0 the tree read
    collects the live definitions from the type registry and calls the name
    slot only for widgets whose definition is live; others are marked
    `stale`, left out of `ui find` unless asked, and refused by `ui click`
    (`tongs/src/game_ui.cpp`, `docs/commands.md`). Etch's plugin guards its
    console calls with `__try`, which catches access violations
    (`plugin/src/console.cpp`) but not a pure call, which is not an exception
    (#14 claim 26).

### Textures, localisation, sprites, fonts and custom GUI

15. **`reloadtexture <name>`** reloads a texture the game holds, in place,
    looked up by its `texturefile` spelling exactly (#2 claim 16, #117). In a
    loaded game it showed the new pixels at once (live in #6, 357–362 ms for a
    927 × 160 texture). A texture no live window uses is not held: the command
    answers "Reload failed", and the next window built loads the file anew
    (#117, live in the main menu).
16. **`reloadloc`** re-reads the current language's localisation and calls the
    registered callbacks (#2 claim 17); "Localisation reloaded!" in about
    200 ms (game-host.md, live). Widgets copy a static `text` at construction
    (#14 claim 7), so a static key changes on screen only when its window is
    built again (live in #126: the saved localisation changed 381 pixels of a
    window the job reopened).
17. **No reload for `.gfx`**: `reload x.gfx` answers "Failed to reload the
    file", and a new sprite type draws as the magenta placeholder (#2 claim 18,
    live in #6). Sprite types are read in the startup GUI phase `0x202850`.
18. **No reload for `common/`**: the reload command takes a `.gui` file, the
    two Lua pattern files (`common/defines.lua`, `map/random/tweaks.lua`),
    `loc`, or a registered key (`particle`, `texture`, `guianim`, `assets`,
    `defines`) (#2 claims 4–5). Anbennar binds its province view buttons and
    icons through `common/custom_gui/provinceview.txt` (138 entries, files);
    a change there has no reload path that was found.
19. **A top-level name written twice in one file is a double free on reload**
    (#16, `0x14ECE90`). Anbennar's `countryreformview.gui` has one
    (`gov_view_reform_level_entry_4`, also in every P2K Anbennar variant), so a
    reload of the real file is unsafe; the v1 preview copy avoided it by
    writing the name once.
20. **Resolution, display mode and UI scale** ask for a restart (#2 claim 20);
    `if_resolution` is chosen when a file is parsed (#16).

### Restart and return

21. **`-continue=<save>`** loads `save games/<save>` without the main menu, and
    `-continuelastsave` looks up the newest save (`0x8757E0` → `0x5D1670`,
    lab `docs/static-analysis.md`). Verified live in the lab: the Russia save
    by `-continue=mp_Russia1719_03_17.eu4`, and a session continued with
    `continue=autosave.eu4` (lab `docs/anvil-gameplay.md`).
22. **The game's own way to show a province** is `0x139C830(holder,
    province)`: it stores the province, updates the map selection and calls
    the province view's `0x1347A50(view, province, 1)`. Ten functions call it
    (among them `0x133C700`, `0xE31A50`, `0xFF6350`, and the province view's
    own reload handler) (xrefs, decomp). The holder is idler `+0x1220`
    (claim 5).
23. **Etch v1's restart machinery** (watchdog, crash count, identity checks,
    `CrashReporter.exe` closing) is in `docs/game-host.md`, "Restart and
    watchdog"; a start took 13–20 s to the main menu in vanilla and 36–40 s
    with the Anbennar playset.

## Hypotheses (need a live check)

- **H1: reloading the real `provinceview.gui` in a loaded game shows the
  change in the open province view with the same province**, own and foreign,
  in vanilla and the Anbennar playset, without a crash (claims 6–9; #6 saw the
  same for the diplomacy tab).
- **H2: a panel rebuild shows the panel, even if it was closed.** The panel
  base's rebuild ends with its show slot (`0x1054840`, which calls the window's
  slot `+0x40`), and the constructor hides the window with slot `+0x48`; #6
  saw the diplomacy tab show itself. For the province view this would open it
  on the last province shown, or empty when none was shown yet (the refill
  returns early).
- **H3: rows and windows of `provinceview.gui` built outside the rebuild go
  stale.** Rows of the province view's other lists (cores, units, buildings,
  states) may survive the rebuild like the outliner rows (#14 claim 17);
  `ClientStateSetup`, `CustomizeColony`, `edicts_window` and
  `provinceview_client_state` keep freed definitions if they exist at the
  reload. Count stale roots after N reloads.
- **H4: hovering a stale button or check box can crash the game** (#14 H4):
  the tooltip fallback copies a string from the freed definition. Not worth
  provoking; treat it as the rule that visible stale windows must not stay.
- **H5: custom GUI elements come back with a rebuilt window.** Anbennar's
  `custom_gui` buttons and icons are matched by widget name; whether they are
  attached at widget construction (and so survive a rebuild) was not traced.
- **H6: a save load rebuilds what no listener rebuilds.** Loading a save calls
  `RestoreDeviceObjects` (`0x5D0580` → `0x81AF10`), which builds the country
  view, its tabs and the province view from the registry in memory, so a
  reloaded `countryview.gui` would show after an in-process save load, without
  a process restart. Whether leaving the loaded game frees the leaked windows
  is #14 H6.
- **H7: `-continue` works with the private profile's `-userdir`** and skips
  Anbennar's "achievements" confirmation that the corpus driver clicks before a
  load (etch#55).
- **H8: the province can be reopened after a restart** by calling
  `0x139C830` on the main thread with the province of the same id; the
  province-by-id lookup was not identified.
- **H9: a texture or `.gui` file created after start is seen under Bellows'
  negative file cache.** #21 saw a new `.gui` load with Bellows' listing
  caches on; the lab's `negative` policy (Bellows 0.10) caches "not found"
  answers, and was checked only during startup.
- **H10: the `assets`, `texture`, `particle` and `guianim` reload targets**
  (`0x14C02B0`, `0x14D8F10`) do not reload sprite types. Their handlers
  (`0x14BFCA0`, `0x14BFCE0`, `0x14D6DF0`, `0x14D7270`, `0x14D78F0`) were looked
  at without being identified.

## Live checks to run

In the game host install, the lab's procedure, the Russia save (vanilla) and
the Anbennar save `Verne1444_11_11_test.eu4`; Tongs for state and tree reads
(it now skips stale widgets):

1. **Province view, own and foreign** (H1, H2): open a province, save a
   change of `provinceview.gui` (a moved label, a new text), `reload
   provinceview.gui`; capture the window, compare the province name before and
   after, time the reload. Repeat with the view closed (H2) and with the
   Anbennar playset's patch file.
2. **Stale roots** (H3): after 1, 5 and 20 reloads of `provinceview.gui`,
   count `ui find * stale`; open the other province view sub-panels between
   reloads.
3. **No-listener files**: reload `countryview.gui` and `speed_controls.gui`
   with their windows visible; list the visible stale roots; then load a save
   in the same process (H6) and check that the change shows.
4. **HUD leaks**: 10 reloads of `topbar.gui`; count stale and leaked roots,
   check that `reload ingamesavemenu.gui` shows N + 1 save menus (#14 H5).
5. **Custom GUI** (H5): in the Anbennar playset, a rebuilt province view
   still shows a `custom_gui` button of `provinceview.txt` with its trigger.
6. **Textures and localisation in a loaded game**: `reloadtexture` of a
   texture of the open province view; `reloadloc` followed by the province
   view's reload, against `reloadloc` alone.
7. **Restart and return** (H7, H8): start with `-userdir` and
   `-continue=autosave.eu4` in both playsets, time it to the loaded game, then
   reopen the province recorded before the stop.

## Recommendation for the live game

- **Reload the real file, not a copy.** On a saved `.gui` file the plugin runs
  `reload <path>` on the main thread, then reads which of the file's windows
  went stale: before the reload, collect the live roots built from the file's
  top-level definitions (their `+0xB0` is live and its `type+0x30` is the
  path); after it, those still alive are stale (the Tongs reader shows how to
  read this without touching freed memory).
- **Decide per file before reloading**, from what the game registers (the
  reload registry `0x242BF58` can be walked for the path) and a short table of
  known exceptions:
  - a listened file whose windows are rebuilt (the province view, the tabs,
    the ledger, settings, the event window): reload;
  - a listened file with an on-demand window open (`DeclareWarDialog`): close
    that window through the game first, or reload and ask the user to reopen
    it;
  - a file with no listener and a visible window (`countryview.gui`,
    `speed_controls.gui`): reload, then rebuild by a save load in the same
    process if H6 holds, else restart;
  - a file with a top-level name written twice, a `.gfx` or font file, a
    `common/custom_gui` or `scripted_guis` file, or a resolution change:
    restart, and say why.
- **Count rebuild leaks** (idler files, and panels if H3 shows leaked rows)
  and restart after a limit, preferably at a save the live game makes itself
  before a planned restart, so a planned restart costs no play; a crash
  restarts at the last autosave, as the map settles.
- **Restore the view after a restart:** record the open window and province
  (the province view's `+0x958` and its sub-panels) at each reload; after
  `-continue` reaches the loaded game, reopen them through `0x139C830`.
- **Textures:** `reloadtexture` with every spelling the `.gfx` files use; a
  "Reload failed" for a texture no window holds is not an error.
  **Localisation:** `reloadloc`, then reload the `.gui` files of the windows on
  screen that listen, so static keys change too.
- **Never read or hover a stale or leaked window** from Etch's side (the
  plugin and pick mode): use Tongs' live-definition check.

## What this makes specifiable, and what it leaves out

- Newly specifiable: the reload policy per file kind (reload, reload and
  reopen, reload and save load, restart), the stale-root check after each
  reload, the leak count that triggers a restart, and the restore of the open
  province after a restart. The budget "save to the game's window showing the
  change" can be stated per kind: a listened panel is one main-thread job
  (#6: 6–22 ms per reload, 54–91 ms for HUD files), a restart is 15–40 s plus
  the save load.
- Pick mode and snapshots can rely on the province view's controller holding
  the province across reloads (`+0x958`), and must use Tongs' stale-safe tree
  read.
- Out of scope for the live game, by the code: live reload of `.gfx`, fonts,
  `common/custom_gui` and `scripted_guis`, UI scale and resolution; ironman
  and multiplayer games (the console refuses them).

## Sources

- `eu4.exe` 1.37.5 (hash above), the lab's Ghidra project (read from a copy)
  and scripts (`eu4-engine-lab/scripts/ghidra/`).
- Etch: `docs/game-host.md`, `docs/plugin-protocol.md`,
  `plugin/src/console.cpp`, `corpus/manifest.json`, `GLOSSARY.md`; branches
  `research/interface-reload`, `research/stale-definitions`,
  `research/preview-copy`, `prototype/game-reload`; tickets #2, #6, #14, #16,
  #21, #22, #117, #118, #126.
- Tongs (`eu4-engine-lab/tongs`, 0.16.0): `src/game_ui.cpp`,
  `docs/commands.md`; branch `research/console-commands`.
- EU4 engine lab: `docs/static-analysis.md` (command line, `-continue`),
  `docs/anvil-gameplay.md` (`continue=autosave.eu4`).
- Game and Workshop files (read only): vanilla `interface/*.gui`;
  `interface/provinceview.gui` of Proper 2K UI Enhanced (3290499798),
  P2KE Patch - Anbennar (3777997797) and Anbennar (1385440355);
  Anbennar's `common/custom_gui/provinceview.txt`.
