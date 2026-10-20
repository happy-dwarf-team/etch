# Research: can EU4 1.37.5 reload its interface while it runs?

Ticket: happy-dwarf-team/etch#2 (map: #1). Static analysis only. The game was
not started, and no file of the game, its saves or mods was changed. Build:
`eu4.exe` 1.37.5 Steam win64, SHA-256
`9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A`. The hash of
the installed EXE and of the lab's analysed copy was the same before and after
the work. All addresses are RVAs relative to the image base `0x140000000`.

Methods, named for each claim:

- **decomp**: Ghidra 12.1.4 decompiler on the lab's existing project
  (`eu4-engine-lab`, `docs/static-analysis.md`), read locally. The pseudo-C is
  not reproduced here.
- **disasm**: Ghidra listing of the instructions at that RVA.
- **xrefs**: Ghidra references to an address (code and data).
- **bytes**: values read straight from the EXE file: the console table,
  vtables and strings.
- **files**: game files under the Steam install and the user's
  `settings.txt` (read only).

Earlier work reused here: the lab's GUI notes (`eu4-engine-lab`,
`docs/reverse-engineering.md`, "Konsola, klatka i drzewo GUI") and the Tongs
console research (happy-dwarf-team/tongs, branch `research/console-commands`,
`docs/research/console-commands.md`). That research covers the command table
at `0x1FC23E0`, the dispatcher `0x1721320` and its gates.

## Short answer

Yes, in part. The game ships a working, release-enabled reload path for
`.gui` files: the console command `reload <file>.gui`. It re-parses that one
file into the GUI manager's type registry, replaces definitions with the same
name and **deletes the old ones**. It then notifies every object that
registered itself as a listener for that file path, and those listeners
destroy their windows and create them again from the new definitions. Many
windows register this way: the in-game HUD, the event window, the hints window,
the frontend and options menus, and about 60 window classes that use a common
self-registering base. Windows that do not register keep their old widgets.
After a reload, the definition pointer those widgets hold points at freed
memory. The country view tabs are such a case, and `reloadinterface` exists to
recreate exactly them. `.gfx` sprite definitions have no reload path. Textures
(`reloadtexture`) and localisation (`reloadloc`) have their own commands. The
`filewatcher` toggle and the `-filewatcher` option set a flag that no code
reads, so there is no automatic file watching. Changing resolution, display
mode or multisampling in the options menu asks for a restart and does not
rebuild the interface live.

## Verified statically

### Reload commands in the console table

1. **The reload-related commands are release-enabled**, except `filewatcher`
   (bytes: record byte `+0x00`, name `+0x08`, help `+0x30`, handler `+0x38` of
   the table at `0x1FC23E0`, same layout as the Tongs research):

   | # | Command | Release | Handler | Help text |
   |---:|---|:-:|---|---|
   | 16 | `window` (`wnd`) | yes | `0xE584C0` | Opens or closes the specified window |
   | 18 | `reload` | yes | `0xE58C10` | Reloads the gui or lua file |
   | 20 | `reloadinterface` | yes | `0xE590D0` | Reloads the entire interface |
   | 22 | `reloadtexture` | yes | `0xE59B70` | Reloads the specified texture |
   | 23 | `reloadloc` | yes | `0xE5A000` | Reloads the localisation |
   | 198 | `filewatcher` | **no** (developer gate) | `0xE85590` | Toggles filewatcher |
   | 201 | `debug_nogui` | yes | `0xE859E0` | Toggles GUI on/off |
   | 253 | `guibounds` | yes | `0xE52480` | Toggles GUI bounds debug |

   The multiplayer/ironman gate from the Tongs research (manager byte `+0x19`)
   still applies: in ironman or multiplayer games none of these run.

### `reload <file>`: the reload registry

2. **The handler** `0xE58C10` (decomp) answers `Please specify the file name`
   without an argument. Otherwise it calls `0x14E1D20(tokens)`. On success it
   answers `<file> reloaded!` and then calls slot `+0x10` of the interface
   hints singleton (`0x2340088`, built by `0x1156B90`). On failure it answers
   `Failed to reload the file`.
3. **`0x14E1D20` → `0x14E16E0`** (decomp) works on the reload registry, a
   singleton at `0x242BF58` (created on first use by `0x14E0D40`/`0x14E2180`):
   - with one argument it calls `0x14E1140(registry, name)`;
   - with more arguments it looks up the first one as a named target and calls
     slot `+0x8` of each listener with the rest. If none matches it answers
     `No such reload target that takes arguments: '<name>'`.
4. **`0x14E1140(registry, name)`** (decomp; string `.gui` built inline as the
   constant `0x6975672E`, prefix `interface/` at `0x1D8D1A8` (bytes)):
   1. If the name contains `.gui`, backslashes become `/`. The file system
      object `0x23494A0` is asked whether the file exists (slot `+0x30`, the
      exists call the lab already knew). If it does not, `interface/` is
      prepended and the check repeats. When the file exists,
      `0x14EB7D0(GUI manager 0x23494F0, path)` re-parses it.
   2. Otherwise each pattern handler in the vector at `registry+0x10` (entries
      of `0x30` bytes: pattern string, context, function) whose pattern occurs
      in the name is called. The only registration function, `0x14E1E40`, is
      called from the defines loader `0x48C940` (`common/defines.lua`) and from
      `0x8907A0` (`map/random/tweaks.lua`) (xrefs, strings). So the
      non-`.gui` branch is the "lua file" part of the help text.
   3. If nothing handled it and the name is `loc`, `localization`, `text` or
      `localize` (bytes at `0x1D8D1A4`, `0x1CB78D8`), it runs the localisation
      reload `0x14B4A20` (same as `reloadloc`).
   4. Finally it looks the (normalised) name up in the registry's tree of
      listeners and calls slot `+0x10` of every listener registered under it.
5. **Listeners register by file path.** `0x14E0D90(name, listener)` adds a
   listener to the list for `name`, and `0x14E0FA0` removes one. `0x14E0FA0`
   is called from about 85 places, mostly window destructors (xrefs). Direct
   registrations with literal keys (decomp, bytes):
   - in-game idler constructor `0x803270`: listener at idler `+0x3D0`
     (secondary vtable `0x1CB88B8`) for `interface/main.gui`, `topbar.gui`,
     `menubar.gui`, `macrobuildinterface.gui`,
     `macrobuildinterface_override.gui`, `papacy.gui`, `great_powers.gui`,
     `parliament.gui`, `mapmode_more.gui`, `more_interface.gui`,
     `unitpanel.gui`, `outliner.gui`, `core.gui` (all under `interface/`);
   - frontend `0x10D23C0`: `interface/frontend.gui`, `interface/options.gui`;
   - interface hints `0x1156B90`: `interface/hints.gui`; message filters
     `0x1238A10`: `interface/msg_filters.gui`; naval missions `0x142E250`:
     `interface/navalmissions.gui`; nudge `0x1250D80`: `interface/nudge.gui`;
   - graphics engine `0x14D8F10`: targets `particle`, `texture` and `guianim`
     (with arguments); `0x14C02B0`: `assets`; `0x1FE8F0`: `defines`.
6. **A self-registering base.** `0x14E1F60(obj, name)` stores `name` in the
   object (vtable `0x1D8D208`) and registers the object under it. Its
   destructor `0x14E1FD0` unregisters it. It is called from 60 constructors
   (xrefs). Event window (`0x10B9A50`), trade wind window (`0x1223EE0`),
   nation designer save menu (`0x125B4D0`) and the small province view, top
   right panel and tablet outliner (`0x143C550`, `0x1438220`, `0x143AF30`,
   with `interface/small_provinceview.gui`, `interface/topright_panel.gui`,
   `interface/tablet_outliner.gui`) are among them. The event window passes
   the string at `+0x30` of the definition it finds by name in the GUI
   manager's type registry (decomp of `0x10B9A50`; see H2).
7. **What a listener does on reload.** Two were read:
   - interface hints, slot `+0x10` = `0x1156500` (bytes, vtable `0x1D60DE0`;
     decomp). It destroys its old window (widget slot `+0x130`) and creates
     `hints_minimized` again through the GUI manager's create-by-name slot
     `+0x48` (`0x14E9030`). Then it re-binds the `hint_maximize` and
     `hint_questionmark` button callbacks.
   - in-game idler, slot `+0x10` of `0x1CB88B8` = `0x82B470` (bytes; decomp).
     It destroys and recreates the outliner, `message_window_container`,
     `messagelog_window`, `menubar`, `floating_buttons`,
     `WarOverviewButtonWindow`, `chat_window`, `diplomessageicons_window`,
     `alerts_parent`, `hotkey_assign_parent`, `macro_build_interface`,
     `message_icons` and `status_message_window`, re-binding their buttons.
     It is a hand-written rebuild of the HUD, not a generic one.

### What the GUI manager does with a reloaded file

8. **`0x14EB7D0(manager, path)`** (decomp): sets manager byte `+0x228`
   ("reloading"), opens the file through the engine reader `0x170DD70` (the
   PhysFS-backed file system, so mod overrides apply), parses it with manager
   slot `+0x18` (`0x17068B0`, the generic script reader), runs `0x14EAAA0`,
   then clears `+0x228`. `0x14EAAA0` is also called once at startup from the
   GUI loading phase `0x202850` (`Loading GUI <`, `LOADING_GUI_DEF`) (xrefs).
   It walks the type tree and resolves four named entries (likely sounds,
   `0x1416A32D0`).
9. **Key `0x7E` (`guiTypes`) goes to `0x14ECE90`** (manager slot `+0x20` =
   `0x14EA9F0`, decomp), which copies `+0x228` into the type registry's flag
   (manager `+0x100`, registry `+0x38`) for the parse. For each parsed type
   `0x14ECE90` asks the registry (manager `+0xC8`, vtable `0x1D8DC00`) for an
   existing type with the same name (slot `+0x8`):
   - flag clear (startup): it reports `Already Defined Key: <name>` and keeps
     the first definition;
   - flag set (reload): it **calls the old type object's deleting destructor**
     (`(*vtable[0])(old, 1)`) and inserts the new one.
   The registry's insert (`0x14EC950` → `0x14ED760`) is a case-insensitive
   ternary tree that overwrites the slot for an existing name.
10. **So a reload frees the definitions that live widgets point at.** The lab
    knows that every widget keeps its `.gui` definition at `+0xB0` and reads
    its name from `type+0x10` (lab `docs/reverse-engineering.md`). Any widget
    built from a type that the reload replaced still holds the old pointer.
    Listeners avoid this by destroying and recreating their windows (claim 7).
    Nothing else walks the GUI manager's widget vector (`mgr+0x110`) to fix
    pointers: neither `0x14EB7D0` nor `0x14E1140` touches it (decomp).

### `reloadinterface` rebuilds only the country view tabs

11. **`0xE590D0`** (decomp, disasm `0xE591CA`–`0xE591DD`) loads
    `*(root 0x233FE78 + 0x1E00)` and, if it is non-null, calls `0x81ECF0` on
    it **directly, not through a vtable**. It then answers
    `Interface reloaded.` It reads no file.
12. **`0x81ECF0`** (decomp; vtable slot of the in-game idler at `0x1CB8830`)
    deletes the 14 objects in the vector at `+0x1110` and constructs 14 new
    ones, then sets `+0x1108 = 2`. The constructors and the window each one
    names (strings): `0xEB2BF0` `countryeconomyview`, `0x1014620`
    `countrytechnologyview`, `0xED0A10` `countrycourtview`, `0xF32D60`
    `countrygovernmentview`, `0xEF7B20` `countrydiplomacyview`, `0x101F200`
    `countrytradeview`, `0xFE4330` `countryreligionview`, `0xFC2620`
    `countrymissionsview`, `0xFCA750` `countrydecisionsview`, `0xFA6270`
    `countryideasview`, `0xF842A0` `countrystabilityview`, `0xFAE240`
    `countrymilitaryview`, `0xF4EDD0` `countrysubjectview`, `0xF247D0`
    `countryestatesview`. None of these constructors calls `0x14E1F60` or
    `0x14E0D90` directly (xrefs), so the panels do not themselves listen for
    reloads. Sub-objects they create were not checked. The same function
    is called from `RestoreDeviceObjects` (`0x81AF10`) and from
    `resetandreloadmissions` (`0xE96800`).
13. **The help text "Reloads the entire interface" overstates it.** Fan
    references repeat that it reloads the whole UI from disk
    ([eu4commands.com](https://eu4commands.com/command/reloadinterface)). The
    code recreates the 14 country view panels from the definitions already in
    memory.
14. **In the main menu** `root+0x1E00` holds a frontend object of another class
    (lab, live, 19.10.2026). The handler still calls the in-game idler's
    `0x81ECF0` on it (claim 11).

### `window open|close <name>`

15. **`0xE584C0`** (decomp): `open <name>` destroys the window it opened
    before (global `0x2458F58`, widget slot `+0x130`) and creates a new one
    with GUI manager slot `+0x48` (`0x14E9030`: find type by name, build the
    widget, attach it to the manager). It answers `Window opened` or
    `Couldn't find such window name.`. `close` destroys it (`Window closed`).
    No controller is attached, so the window shows only what its `.gui` file
    defines. The window is not a reload listener.

### Textures, localisation, sprites

16. **`reloadtexture <name>`** (`0xE59B70`, decomp) gets the texture handler
    through slot `+0x70` of `root+0x1E00`, looks the texture up (`0x16C40B0`)
    and reloads it in place with `0x16C4220`
    (`clausewitz/pdx_gfx/texturehandler.cpp`, `Missing texture file:`). It
    answers `<name> reloaded` or `Reload failed`. The texture object stays
    the same, so sprites that use it keep their handle.
17. **`reloadloc`** (`0xE5A000` → `0x14B4A20`, decomp) re-reads the
    localisation for the current language (`0x14B4740`, language string under
    `0x2357B20`). It then calls each callback in the vector at `0x2358790`
    (entries of `0x30` bytes). It answers `Localisation reloaded!` or
    `Failed to reload Localisation!`.
18. **No `.gfx` reload was found.** The `.gui` branch accepts only names
    containing `.gui`. The pattern handlers are the two Lua files, and no
    registered key names a `.gfx` file or `spriteTypes` (claims 4–6). `.gfx`
    files are read in the startup phase `0x202850` (`Loading .gfx files <`).

### File watching

19. **The file-watcher flag is dead in this build.** Byte `0x233FF57` (in
    `.bss`, so 0 by default; bytes: section table) is written by the startup
    options `-filewatcher` (1) and `-nofilewatcher` (0) in `0x1563F20`, which
    application init calls at `0x876B7D`. The developer-gated console command
    `filewatcher` (`0xE85590`, `Filewatching ON.`/`OFF.`) toggles it too. Ghidra
    finds no other reference to `0x233FF57` (xrefs over `0x233FF40`–`0x233FF60`).
    The EXE contains none of the strings `ReadDirectoryChanges` or
    `ChangeNotification`, in ASCII or UTF-16 (bytes).

### Resolution, display mode and UI scale

20. **Apply in the video options** (`0x10E1100`, decomp) writes the settings.
    If display mode, resolution, refresh rate, multisampling or one more
    graphics value changed, it opens `DefaultInfoDialog` with `RESTART_REQ` /
    `RESTART_REQ_DESC`. In the English localisation those read "Restart
    Required" / "You must restart the game for these changes to take effect."
    (files: `localisation/EU4_l_english.yml`). This path does not rebuild the
    interface live.
21. **The GUI scale option exists and is experimental.** `SM_GUI_SCALE` ("GUI
    Scale (TEST)") and `GUI_SCALE_TOOLTIP` ("This feature is in an
    experimental state and might have issues if not set to x1.0.") are used by
    the video settings list `0x10E84F0` and its tooltip `0x10E8CD0` (xrefs,
    files: `localisation/EU4_l_english.yml`,
    `localisation/emperor_l_english.yml`). The setting is stored as
    `game_ui_scale` in the `graphics` block of `settings.txt` (files).
22. **`RestoreDeviceObjects` is the full rebuild, and it runs on idler entry.**
    `0x81AF10` (`ingameidler.cpp`, `Start RestoreDeviceObjects`) is slot 6 of
    the in-game idler vtable `0x1CB8460`; the frontend's is `0x10D5BC0`
    (vtable `0x1D5A8C8`, slot 6). It builds the country view, its tabs, the
    alerts and the status windows, and calls `0x81ECF0`. The frame function
    `0x14C25A0` (decomp) calls it when it switches idlers. The old idler gets
    slots `+0x50`, `+0x38` and is deleted. The new one gets slots `+0x48`,
    `+0x28`, `+0x30` (Restore) and `+0x40`. Save loading (`0x5D0580`) also
    calls `0x81AF10` directly (xrefs). Whether it re-reads `.gui` files is not
    shown; it builds windows from the registry already in memory.

## Hypotheses (need a live check)

- **H1: the reload loop works as read.** In a single-player non-ironman game,
  `reload interface/<file>.gui` (or `reload <file>.gui`) answers `... reloaded!`.
  A window registered for that file shows the new layout without a restart.
  `window open <name>` after a reload shows the new layout of any top-level
  type. A mod's override of the file is what gets read, because the reader
  goes through PhysFS.
- **H2: definition `+0x30` is the source file path.** The registration keys
  are file paths (claim 5), and the self-registering windows pass that string,
  so `+0x30` is most likely the path of the file the type came from. Its writer
  was not found.
- **H3: stale widgets are use-after-free, not just stale.** A window that does
  not listen, such as an open country view tab, a `window open` window, or a
  popup built by code, keeps its definition pointer (`+0xB0`) after its file
  is reloaded. Whether the game reads `+0xB0` after construction (on resize,
  tooltips, list row creation) is unknown. If it does, a crash or garbage is
  possible. Tongs' `ui tree` reads `type+0x10` through `+0xB0` and would read
  freed memory for such widgets.
- **H4: list rows and children built later use the new definitions.** List
  boxes create row widgets on scroll (lab). If a row type is looked up by name
  when needed, rows created after a reload use the new type. If the parent
  window cached a type pointer, they use freed memory.
- **H5: `reloadinterface` in the main menu is unsafe.** It calls an in-game
  idler method on the frontend object (claim 14). Expect corruption or a crash.
  Use it only in a loaded game.
- **H6: a new file in a mod directory can be reloaded.** PhysFS's directory
  archiver opens files on demand. A `.gui` file that did not exist at startup
  should still load. Its types are new names, so nothing is freed.
- **H7: `reloadloc` does not refresh static text in open windows.** Static
  `text = "KEY"` in a `.gui` file is resolved when the widget is created. Only
  the callbacks at `0x2358790` react, and their registrations were not found.
- **H8: GUI scale and window size.** Changing `game_ui_scale` may rebuild
  through the same `Invalidate`/`Restore` pair or may need a restart. Neither
  was traced; resizing the borderless window was not traced either.

## Unknowns

- What the arg-form targets `particle`, `texture` and `guianim` do with their
  arguments (`0x14D8F10` listeners, vtables `0x1D8D050`, `0x1D8D068`,
  `0x1D8D080`, `0x1D8D100`).
- How many window classes build their widgets without the self-registering
  base, so that they never react to reloads. Only the 14 country view tabs and
  `window open` windows are confirmed.
- Whether controllers keep raw child widget pointers (from `slot +0x68` find
  by name) across a reload of their own file. The listeners read recreate the
  window and look the children up again.
- The cost of a reload. Parsing one file is likely milliseconds, but the
  in-game idler rebuild (claim 7) and the start-up cost of the GUI phase were
  not measured.
- Whether `-debug` or `debug_mode` changes any of this. Neither appeared in
  the reload code that was read.

## Consequences for Etch

- **The game host can use the game's own reload path.** The cycle is: file
  saved, then `window close`, `reload <file>.gui`, `window open <name>`.
  It runs through the console dispatcher `0x1721320`, which Tongs can already
  call. This gives a layout preview *inside the game* without any patching.
  For windows the game builds with code-filled content, a listener rebuild
  only happens for files the game registered (claims 5–7). Other windows have
  to be closed and reopened through their game action.
- **The reload prototype (#6) should test the cases separately:** the
  `window open` cycle (H1); a registered HUD file such as
  `interface/topbar.gui` or `outliner.gui`; a self-registering window such as
  the event window; a non-listener (an open country view tab followed by
  `reloadinterface`); and a reload while such a window stays open, to probe
  H3 under a debugger or with Tongs reads. It should also measure the time
  from command to frame.
- **`.gfx` changes (new or changed `spriteType`) need a restart.** A changed
  image file can use `reloadtexture`. Localisation can use `reloadloc`, but
  open windows probably need to be recreated (H7).
- **No automatic file watching exists**, so the extension must send the
  commands itself.
- **Resolution changes are restart-only**, so the "Resolutions and UI scale"
  question on the map is a launch-time setting for the game host, not a live
  switch.

## Sources

- `eu4.exe` 1.37.5, SHA-256 above, analysed with the lab's Ghidra project and
  scripts (`eu4-engine-lab`, `scripts/ghidra/decompile.py`, `xrefs.py`,
  `disasm.py`).
- Lab notes: `eu4-engine-lab`, `docs/reverse-engineering.md` (GUI manager,
  widget layout, `root+0x1E00`), `docs/static-analysis.md`.
- Tongs research: happy-dwarf-team/tongs, branch `research/console-commands`,
  `docs/research/console-commands.md` (command table, dispatcher, gates).
- Game files (read only): `localisation/EU4_l_english.yml` (`SM_GUI_SCALE`,
  `RESTART_REQ`, `RESTART_REQ_DESC`), `localisation/emperor_l_english.yml`
  (`GUI_SCALE_TOOLTIP`), the user's `settings.txt` (`game_ui_scale`).
- Paradox-hosted community wiki, [Console commands](https://eu4.paradoxwikis.com/Console_commands):
  lists `reload`, `reloadinterface`, `reloadloc`, `reloadtexture`, `reloadfx`
  and `window` with the same help texts. It does not list `filewatcher`, and
  its list was last verified for 1.30. No official Paradox documentation on
  reloading the interface was found.
- Fan reference [eu4commands.com/command/reloadinterface](https://eu4commands.com/command/reloadinterface)
  (secondary; its "reloads the whole UI from disk" is contradicted by claims
  11–13).
