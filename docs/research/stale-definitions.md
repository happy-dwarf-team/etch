# Research: which widgets keep freed definitions after a reload, and can the game host read the widget tree afterwards?

Ticket: happy-dwarf-team/etch#14 (map: #1). Follows up hypotheses H3 and H4
of [Can EU4 1.37.5 reload its interface while it runs?](https://github.com/happy-dwarf-team/etch/issues/2)
(branch `research/interface-reload`, `docs/research/interface-reload.md`,
cited below as "reload research") and the crash in run 1 of the prototype for
[Can a running game reload a changed window through an Anvil plugin without crashing?](https://github.com/happy-dwarf-team/etch/issues/6)
(branch `prototype/game-reload`, `prototypes/game-reload/README.md`).

Static analysis and a post-mortem of the crash dump only. The game was not
started, and no file of the game, its saves or mods was changed. Build:
`eu4.exe` 1.37.5 Steam win64, SHA-256
`9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A`. The hash of
the installed EXE and of the lab's analysed copy was the same before and after
the work. All `eu4.exe` addresses are RVAs relative to the image base
`0x140000000`; `tongs.dll` addresses are RVAs of the Tongs 0.12.0 build used
in the prototype (PE timestamp `0x6AD755C4`, the one in the dump's module
list).

Methods, named for each claim:

- **decomp**: Ghidra 12.1.4 decompiler on the lab's existing project
  (`eu4-engine-lab`, `docs/static-analysis.md`), read locally. Functions that
  Ghidra had not defined were created in a transaction that was rolled back,
  so the project is unchanged. The pseudo-C is not reproduced here.
- **disasm**: Ghidra listing (for `tongs.dll`: `objdump -d`).
- **xrefs**: Ghidra references to an address.
- **bytes**: values read from the EXE file (vtables, strings, exports).
- **scan**: a script over every slot of a vtable, or over every instruction
  of an address range, looking for one operand pattern; it finds what the
  pattern matches and can miss indirect accesses.
- **dump**: the minidump of crash `eu4_20261020_140128`, read with a small
  pure-Python parser (stream directory, thread, module, memory, memory-info,
  thread-info and thread-name lists). The dump was not sent anywhere.
- **source**: Tongs source at tag 0.12.0 (`src/game_ui.cpp`,
  `src/game_ui.hpp`, `src/game_memory.cpp`, `src/ui_tree.hpp`).
- **files**: vanilla `.gui` files and the prototype's `probe.jsonl` of run 1.

Terms. *Definition* or *type*: the object a `.gui` entry is parsed into
(`windowType`, `instantTextBoxType`, ...). *Widget*: the object built from a
definition; *registry pointer*: the widget pointer held in the GUI manager's
widget vector `mgr+0x110` (for windows the full object starts `0x30` before
it). *Type registry*: the name → definition tree at `mgr+0xC8`, manager
singleton `0x23494F0`. *Root*: a widget with no holder in Tongs' tree.

## Short answer

A reload leaves stale widgets in four places. First, windows that nobody
rebuilds. Second, and largely new, windows the game **leaks** when it
rebuilds something: the in-game idler's reload listener creates
`alerts_parent` and `hotkey_assign_parent` (both from `topbar.gui`) and the
in-game load and save menus again without destroying the old ones. It also
deletes the outliner controller without deleting its row objects, so the rows'
windows (`outliner_header_entry` and the other entries of `outliner.gui`)
stay alive with no owner. Every reload of any idler-registered file (13 HUD
files, among them `topbar.gui` and `outliner.gui`) adds one more set. The
leaked windows keep a pointer to the definitions of the next reload of their
file. Third, rows created before a reload: list rows look their type up by
name when they are built, not later. Fourth, whatever a non-listening
controller built.

The crash in run 1 was not an access violation. Tongs' tree read called the
name slot `0xA0` of an `instantTextBoxType` widget. That slot is a two-line
thunk that jumps through the widget's definition (`+0xB0`) to the
definition's virtual `+0x40`. The freed block's vtable had `_purecall` there.
`_purecall` calls the game's pure-call handler `0x1654AC0`, which writes the
crash dump and ends the process. Tongs' `__try` blocks catch only access
violations, and a pure call is not an exception at all. The widget was the
text of a top-level window with one icon and one text, the first of a run of
at least 11 identical roots registered right after a leaked in-game save menu.
That pattern matches the 25 outliner header rows leaked by the next outliner
rebuild; it does not prove it.

The game itself reads the definition after construction in only a few places
the scan found: the name getter, the tooltip text getters of buttons and check
boxes (fallback to the `.gui` tooltip when code set none), the definition's
text key of an `instantTextBoxType`, and the warning path of a failed
child lookup. None of them is part of the per-frame update or drawing. They
run for a widget the pointer rests on or that code asks about, and the leaked
windows are neither, so the game did not crash in either run.

A tree reader can skip stale widgets without touching freed memory:
collect the values of the type registry (a ternary search tree of plain
pointers) and call the name slot only on roots whose `+0xB0` is in that set.
Take every other widget's name from its parent window's own child containers,
which the window filled with copies at construction. The name is the only
field Tongs derives from the definition. Recreating the stale windows first
is not possible for the leaked ones, because nothing owns them any more.

For the Etch game host the safest loop is to preview a **renamed copy** of the
edited file: write `interface/etch_<file>.gui` with prefixed top-level names,
`window close` → `reload etch_<file>.gui` → `window open etch_<name>`. That
file has no listener, so the HUD is not rebuilt and nothing leaks, and the
only widgets built from freed definitions are the one `window open` window,
which the cycle closes first. Reloading the real HUD files should be rare and
followed by no tree reads of old roots.

## Verified statically

### Definitions, the registry and the widget vector

1. **A definition object starts with a common base** (decomp of the type
   factory `0x14EAC80`, manager sub-object `mgr+0x10`, vtable `0x1D8DD10`
   slot `+0x10`; base constructor `0x15A4000`, base vtable `0x1D998D8`). The
   factory allocates the class for the keyword's token id, then copies the
   reader's current stream name into `type+0x30`, stores the token id at
   `type+0x08` and one more reader value at `type+0xA0`. The name is a
   `std::string` at `type+0x10`. So `+0x30` is the source file of the
   definition (this settles H2 of the reload research statically; claim 14
   adds the live evidence).
2. **The base `GetName` is `type+0x40` = `0x9A920`, "return `this+0x10`"**
   (bytes, disasm). The base destructor `0x15A40D0` resets the four strings at
   `+0x80`, `+0x50`, `+0x30` and `+0x10` to empty (decomp of `0x15A40D0` and
   of the string reset `0x95660`). The base vtable has `_purecall` at `+0x48`
   and `+0x50`, not at `+0x40` (bytes).
3. **A reload deletes each old top-level definition while the file is still
   being parsed** (decomp of `0x14ECE90`). For every parsed top-level entry it
   looks the name up in the type registry (slot `+0x8`) and, with the reload
   flag set, calls the old object's deleting destructor at once. The new
   objects are collected in a local table and inserted only after the whole
   file was read (registry slots `+0x18` begin, `+0x30` insert per entry,
   `+0x20` end). Nested definitions (children of a window) are owned by their
   top-level definition and go with it; only top-level names are in the
   registry.
4. **The type registry is a case-insensitive ternary search tree of plain
   pointers** (decomp of `0x14ED760`, `0x14EC950`, `0x14EC750`,
   `0x14EC9F0`; vtable `0x1D8DC00`). Root pointer at `registry+0x08`, insert
   count at `+0x14`, batch flag at `+0x10`, a pending list at `+0x20`–`+0x30`
   used only between begin and end, the reload flag at `+0x38` (reload
   research claim 9). A node is `0x28` bytes: `+0x00` value (definition
   pointer or 0), `+0x08` lower-cased character, `+0x10` lower, `+0x18`
   higher, `+0x20` next character. The keys live in the nodes, so walking the
   tree and collecting the values reads no definition.
5. **Window definitions hold their nested definitions in a named map at
   `type+0xE8`** (decomp of `0x155E2E0`, used by the window constructor to
   build children). If a name is not there, it is looked up in the
   definition named by the string at `type+0x138`. The same map class
   (vtable `0x1D8DC00`) is used.
6. **Every widget keeps its definition at `+0xB0` and the GUI manager at
   `+0xB8`** (decomp of the widget base constructor `0x1552750`, called by 17
   widget constructors; base vtable `0x1D91810`). `instantTextBoxType`
   widgets keep a second copy of the definition pointer at `+0xD0` (decomp of
   the constructor `0x1529D20`). Window full objects keep it again at full
   `+0x178` (decomp of `0x1543F80`). The base widget vtable `0x1D91810` has
   `_purecall` at `+0x40` and `+0x48` (bytes).
7. **Widgets copy what they draw at construction.** The `instantTextBoxType`
   factory `0x15E7600` passes about 15 definition fields (font, borders,
   format, max size, text) as constructor arguments, and the widget's position,
   size, show and text slots forward to its render node at `+0x118` (decomp of
   the slots `0xD8`, `0xE0`, `0xE8`, `0x88`, `0x90` of `0x1D8FD10`).
8. **The widget vector is in registration order.** The manager's slot `+0x98`
   (`0x14EB360`) appends a widget to `mgr+0x110` (decomp). Children register
   while their window is being constructed and the window registers after its
   constructor returns (`0x14E9030` create by name, decomp), so a window
   follows its children. The sweep `0x14E9FA0` deletes widgets marked dead
   (`+0xC4`) with their slot `+0x38` and keeps the order of the rest (decomp).

### Who reads the definition after construction

9. **A scan of every vtable slot of the 17 widget classes Tongs knows plus the
   widget base** (`0x1D929D0`, `0x1D57510`, `0x1DA4090`, `0x1D58218`,
   `0x1D9A340`, `0x1D954B0`, `0x1DA2940`, `0x1D585C8`, `0x1D96D00`,
   `0x1D8FD10`, `0x1D99230`, `0x1D91358`, `0x1D8FFC8`, `0x1D90FD8`,
   `0x1D96578`, `0x1D97EF0`, `0x1D93748`, `0x1DA4910`, `0x1D91810`) and of
   their direct callees finds these reads of `this+0xB0` (scan, decomp):
   - **Name, slot `0xA0`.** For icons, buttons, texts, edit and check boxes,
     lists, scroll bars and the base it is `0xFBF480`: load `+0xB0`, jump to
     the definition's virtual `+0x40` (disasm). For `windowType`
     (`0x154AD60`) and `containerWindowType` (`0x16366A0`) a widget-owned
     override name is returned when it is set (window: string at registry
     pointer `+0xA28`; container: string at `+0x5F8`), otherwise the same
     jump.
   - **Tooltip text, slots `0x198` and `0x1A0`.** `0x15AEEA0`/`0x15AEF30`
     (in the `guiButtonType` and `buttonType` vtables and three more) and
     `0x152D940`/`0x152D9D0` (in the `checkboxType` vtable and two more)
     first ask the code-set tooltip (`0x1560190` on the widget's own data)
     and, when that is empty, copy the string at definition `+0x220` or
     `+0x240`. The icon hover path `0x1593C80` checks `+0xB0` for null and
     then calls slot `0x198`. In `windowType` and `instantTextBoxType` these
     slots are a stub that returns an empty string (`0x129420`).
   - **Definition text, `instantTextBoxType` slot `0x250`** (`0x152B870`):
     takes the string at definition `+0x108` through the copy at `+0xD0`,
     localises it and sets it as the widget's text.
   - No position, size, show, hide, destroy or input slot of these classes
     reads it.
10. **Failed child lookups read the parent's definition.** The window's
    find-by-name slots (`0x1C0` sub-window `0x15481A0`; the button, check
    box and other variants around `0x1548610`) compare names the window
    stored itself and, only when nothing matches, log a warning such as
    `Warning: Attempt to access nonexistent subwindow` with the window's name
    from its definition (full object `+0xE0` or `+0x178`, virtual `+0x40`)
    (decomp).
11. **The per-frame top-level update does not touch definitions.** The sweep
    calls slot `+0x240` on the top-level list `mgr+0x170`; that slot is `ret`
    (`0x955A0`) in the `windowType` and `instantTextBoxType` widget vtables
    (bytes, disasm). Drawing goes through render nodes (claim 7). Render-node
    classes themselves were not scanned.

### Listeners: what each rebuilds

12. **The in-game idler's listener `0x82B470` is one hand-written HUD
    rebuild, the same for all 13 files it is registered for** (decomp;
    registrations in the reload research claim 5). Offsets below are idler
    offsets; the listener sits at idler `+0x3D0` and uses the GUI manager at
    idler `+0x58`. In order it:
    - deletes the outliner controller at `+0x1418` (`0x81DC30`) and builds a
      new one (`0x128C770`, then the 25 header rows, `0x12905F0`), unless the
      byte `0x233FF4F` is set;
    - destroys and re-creates `menubar` (`+0x1178`) and takes
      `messagelog_window`, `floating_buttons`, `WarOverviewButtonWindow` and
      `chat_window` from it again; replaces the message log object and the
      object at `+0x2448`;
    - destroys and re-creates `diplomessageicons_window` (`+0x1410`) and
      re-binds the message filter buttons;
    - tears down the topbar controller at `+0x12D8` (`0x14318C0`: the alerts
      it shows, `speed_controls`, the timeline object), rebuilds its window
      holder (`0x149AD60`: hide and destroy the old `topbar`, create a new one
      by name, restore its visibility) and re-binds `speed_controls`,
      `timeline_controls`, `pause_window` and `pause_window_auto`
      (`0x1431A80`);
    - creates `alerts_parent` (`+0x10D0`) and `hotkey_assign_parent`
      (`+0x10D8`) by name (claim 16);
    - calls the reload slot `+0x10` of the objects at `+0x10F0` and `+0x10E8`;
    - deletes and re-creates `macro_build_interface` (`+0x1100`) and
      `message_icons` (`+0x16E8`), refreshes the object at `+0x5BA0`, and
      deletes and re-creates the objects at `+0x1298`, `+0x12A0` and
      `+0x12C0`;
    - destroys the in-game menu (`+0x12F0`, `0x833320`) and runs `0x8318F0`,
      which builds the in-game menu, load menu (`+0x12F8`) and save menu
      (`+0x1300`) (claim 16);
    - deletes and re-creates the AI preferences window object (`+0x1450`,
      `playeraiprefs`) and `status_message_window` (`+0x1148`, visibility
      kept).
    It rebuilds no window of `papacy.gui`, `great_powers.gui`,
    `parliament.gui`, `mapmode_more.gui`, `more_interface.gui`,
    `unitpanel.gui` or `core.gui`; those depend on their own classes
    (claim 13). No vanilla `interface/main.gui` exists (files).
13. **About 60 classes use the self-registering base `0x14E1F60`, almost all
    keyed by their definition's file.** The common pattern is: look the
    window's type up by name in the registry, pass `type+0x30` to
    `0x14E1F60`, which copies it as the key (decomp of `0x14E1F60` and of the
    call sites, xrefs). The base slot `+0x10` is `_purecall` (bytes,
    vtable `0x1D8D208`), so each class brings its own reload handler.
    Handlers read (decomp of 15 of them): destroy the owned window (slot
    `0x130`), create it again by name, re-bind its buttons, and then either
    keep the old visibility, hide it, or **show it unconditionally**. The
    classes found by their window names include the event window, `goto_box`,
    the in-game load and save menus, the country view panels, the hints
    window, `minimap_panel`, `musicminicontroller_window`,
    `musicplayer_window`, `timeline_controls`, `parliament_window`,
    `playeraiprefs`, `peace_view`, `siege`, `waroverview`, the unit panels,
    the trade map icons and route arrows, `trade_wind_window`,
    `estate_privileges_window`, `blessings_window`, `natives_window`, the
    colonisation panel, `new_age_popup`, `ages_view`, `hre_window`,
    `dlc_browser`, the nation designer, the frontend lobby and chat (xrefs,
    strings).
14. **The country view panels do listen, through a shared base**, which
    corrects claim 12 of the reload research. All 14 tab constructors called
    by `0x81ECF0` (and `0x1343200`) call the panel base `0x1054610` (xrefs),
    which registers under the panel window's `type+0x30`. Its handler
    (`0x1054A10` → `0x10548B0`) destroys the window, takes its name through
    the window's name slot, creates it by name again, refreshes the panel
    and the country view, and calls the panel's slot `+0x18` (decomp). The
    base sets the window's override name at construction (full-window slot
    `0x258` = `0x154AD90` assigns the string at full `+0xA58`, which is
    registry pointer `+0xA28`; disasm), so the name read uses widget-owned
    memory. The
    prototype saw the diplomacy tab follow `reload countrydiplomacyview.gui`,
    lose its code-filled content and show itself. That is this handler, and
    it shows that `type+0x30` is the path the reload command matches.
15. **`goto_box` instances rebuild and show themselves.** The class
    `0x11427B0` is built by the idler constructor, `0x1108700` and
    `0x1256720` (xrefs) and registers under `goto_box`'s file. Its handler
    (`0x1144B30`) rebuilds the window (`0x1144B90`: destroy, create, hide),
    then shows it and focuses `goto_edit` (decomp). This is why the hidden
    instances were visible after the prototype's `goto.gui` reloads.

### Leaks: windows nobody owns

16. **The idler listener leaks four windows per run** (decomp, scan of all
    accesses to the fields in `0x7F0000`–`0x840000`):
    - `alerts_parent` and `hotkey_assign_parent` are stored over the old
      pointers at idler `+0x10D0`/`+0x10D8` without destroying the old
      windows. Only the idler's other device slot `0x81E8F0` (vtable
      `0x1CB8460` slot 7, next to `RestoreDeviceObjects` in slot 6) destroys
      them.
    - `0x8318F0` overwrites the load menu (`+0x12F8`) and save menu
      (`+0x1300`) objects without deleting the old ones. These objects are
      also listeners (class `0x1172790`, keyed by `ingameloadmenu.gui` and
      `ingamesavemenu.gui`, handler `0x1172DC0`: destroy, rebuild, **show**),
      and they stay registered.
17. **The outliner controller's teardown leaks every row.** `0x81DC30`, used
    by `RestoreDeviceObjects`, the device slot `0x81E8F0` and the listener,
    frees the 26 category lists with `0x128CCE0`, which frees only the list
    nodes. The refill `0x12905F0` instead calls each row's deleting
    destructor (decomp of all three). A row (`0x12AD8F0` for headers, base
    `0x152DF80`) owns a top-level window created by name and destroys it only
    in its own destructor (`0x152E030`, decomp). When the outliner window and
    its list box are destroyed, the list box only flags its items as
    detached (`0x1531750` → item slot `+0x20` = `0x1533260`). So each teardown
    leaves the header rows (25, from 25 calls to `0x12AD8F0`) and any other
    entries alive in the widget vector with no holder.

### List rows

18. **List rows look their type up by name when they are built** (decomp of
    the row base `0x152DF80`, 244 call sites by xrefs). The base asks the type
    registry for the row's window name; if the definition's token id at
    `type+0x08` is `0x264` it uses manager slot `+0x58`, otherwise create by
    name (`+0x48`). No cached definition pointer is kept. Rows built after a
    reload use the new definitions; rows built before keep their old
    `+0xB0` until their owner deletes them. This answers H4 of the reload
    research for this base class; list classes outside it were not checked.

### `topbar.gui` in particular

19. **The file has three top-level definitions: `topbar`, `alerts_parent`,
    `hotkey_assign_parent`** (files). `hotkey_assign_parent` holds an icon
    and an `instantTextBoxType`; `alerts_parent` has no children in the file.
    The nested windows (`powerprojection_topbar`, `liberty_desire_topbar`,
    `pause_window`) are children of `topbar` and are rebuilt with it.
20. **No other code creates these three.** The bytes `topbar\0` occur once
    (`0x1D83FFC`) and are read only by the topbar controller constructor
    `0x1431020`; no instruction carries `topb` as an immediate; the strings
    `alerts_parent` and `hotkey_assign_parent` are referenced only from
    `RestoreDeviceObjects` and the listener (bytes, scan, xrefs). Text built
    from a table at run time would not show up in these searches.
21. **So after `reload topbar.gui` the stale `topbar.gui` widgets are exactly
    the leaked ones** (claims 12, 16, 20): the `alerts_parent` and
    `hotkey_assign_parent` windows built by `RestoreDeviceObjects` and by every
    earlier idler listener run (in run 1: one after loading and one per
    `outliner.gui` reload, six of each), with their icon and text. The topbar
    and everything the listener re-creates are new.

### The crash of run 1

22. **The dump was written by the game's pure-call handler on the main thread,
    without an exception record** (dump). It has no exception stream; the
    thread-info list marks the main thread (start `0x1A337C8`, the CRT entry)
    as the writing thread; memory is the module images, the thread stacks and
    small ranges around pointers found on stacks. The stack, from the
    innermost Tongs frame outwards: Tongs `0x1E321` (inside `CallName`,
    after `call rax`), `0x1E430` (`Describe`), `0x1F26E` (`Reader::Read`),
    `0x1FCD6`, `0x393B4`, `0x31132`, `0x1CC04`, then `anvil_game.dll` and the
    game's frame. Above `0x1E321`: `eu4.exe` `0x1A35138`, then the handler
    `0x1654AC0` → `0x1650580`/`0x1654250` and the dump writer (dbghelp,
    dbgcore). `exception.txt` lists the same frames as exports plus offsets:
    `PHYSFS_writeULE64 + 168856` = `0x1A35138`, `anvil_plugin_load + 36497` =
    Tongs `0x1E321` (bytes: export tables).
23. **`0x1A35124` is `_purecall`.** It loads the handler from `0x233CBF0`
    (`0x1A35118`), calls it if set, then aborts (`0x1A47044`);
    `0x1A35140` is `_set_purecall_handler` (disasm). `0x1654C00` installs
    `0x1654AC0`, which passes `Pure Virtual Function Call` (`0x1DA6368`) to
    the crash writer `0x1654250` (xrefs, bytes, disasm).
24. **The call came from Tongs' name read of an `instantTextBoxType` widget**
    (dump, source, disasm). In `Describe`'s frame the widget vtable read by
    `Slot()` is `0x1D8FD10` (`instantTextBoxType`) and the slot function is
    `0xFBF480`, slot `0xA0` (claim 9): it loads `+0xB0` and jumps to the
    definition's `+0x40`. A tail jump leaves Tongs' `CallName` as the caller
    of `_purecall`, as on the stack. So the block `+0xB0` pointed at had a
    vtable whose `+0x40` is `_purecall`. A destroyed definition left in place
    does not have one (claim 2); a destroyed widget does (claim 6).
25. **Which widget it was** (dump). Tongs' `entries_` vector holds 17 623 live
    widgets; the crashing one is index 9431 (`{pointer, kind, parent}`
    entries, parent index set before `Describe`). The captured part of the
    vector shows:
    - 9418–9430: five texts, four buttons, an icon, an edit box and a check
      box, then the window `menu_save` (`ingamesavemenu.gui`; names read from
      Tongs' already-filled `UiWidget` records: `game_name`, `menu_save`).
      This matches that file's children.
    - 9431–9463 and on: repeated `{instantTextBoxType, iconType, windowType}`
      triples, each window a root (no holder, no parent render node). 9431 is
      the text of the first.
    The widget's and the definition's memory is not in the dump, so their
    names and contents cannot be read.
26. **Tongs could not have caught it** (source). `CallName` and `CallPair`
    catch only `EXCEPTION_ACCESS_VIOLATION`; `Slot()` checks that the slot
    function lies in `eu4.exe` code, not where it jumps. A pure call is a
    normal call into the game's handler, not an exception. `eu4.exe` imports
    `SetUnhandledExceptionFilter` but not `AddVectoredExceptionHandler`
    (bytes), so access violations inside Tongs' guards still reach them.
27. **The run-1 timeline** (files: `probe.jsonl`, dump time). A full tree read
    (`ui find topbar/brown_bg all`) at 12:01:25.105 UTC succeeded. It walked
    every widget, including all windows leaked by the five earlier
    `outliner.gui` reloads. `reload topbar.gui` ran at 12:01:25.572, then
    hover moves, then the same read at 12:01:28.655 crashed (dump at
    14:01:28 local).

### What Tongs reads

28. **The name is the only field Tongs takes from the definition** (source).
    Type comes from the widget vtable, visibility from `+0xC5`, rect from the
    position and size slots (render node), text, button state and check state
    from widget fields, children from the window's own containers, list
    items and scroll-bar parts. Only `Describe` calls slot `0xA0`.

## Hypotheses (need a live check)

- **H1: the crashing widget was `entry_text` of a leaked outliner header
  row.** Evidence: `outliner_header_entry` is a `windowType` with exactly an
  icon and an `instantTextBoxType` (files); the outliner rebuild creates 25
  of them in a row (claim 17); in the listener the outliner is rebuilt first
  and the save menu last, so the first widgets that survive after one run's
  save menu are the next run's header rows (claims 12, 16, 17); being roots
  fits rows whose list box is gone. 18 other vanilla windows have the same
  two children, among them `hotkey_assign_parent`, but those are not created
  25 at a time. *Check:* in a fresh session, `reload outliner.gui` twice
  and then read only roots (no name calls) and their child kinds; count
  windows with `{icon, text}` children whose `+0xB0` is not in the type
  registry. Expect 25 per earlier outliner teardown.
- **H2: the freed block was reused and then held a destroyed GUI object.**
  The full read 3 s earlier passed the same widget without a crash
  (claim 27), and a destroyed definition alone returns an empty name
  (claim 2). Between the reads, the topbar rebuild destroyed hundreds of
  widgets, and a destroyed widget leaves the base vtable `0x1D91810` with
  `_purecall` at `+0x40` (claim 6). Which object it was cannot be told from
  the dump.
- **H3: stale reads are mostly silent.** Expect four outcomes for a name read
  through a freed definition: an empty name (block untouched since the
  delete), a wrong name (block reused by another definition), an access
  violation that Tongs catches (pointer garbage), or this crash (block holding
  a destroyed object with a pure `+0x40`). *Check:* after the H1 setup, a
  Tongs tree read with a build that logs, per root, whether `+0xB0` is in the
  registry and what name came back.
- **H4: the game crashes on hover of a stale button or check box.** The
  tooltip getters (claim 9) copy a `std::string` from the freed definition
  when no code tooltip is set. A reused block can give a pointer and size that
  fault or read garbage. Leaked windows are probably hidden or covered, which
  is why the prototype's hovers did not hit one. *Check:* not worth running;
  treat it as a rule for the host instead (never put the virtual cursor over
  an old root).
- **H5: `reload ingamesavemenu.gui` after N idler-file reloads shows N+1 save
  menus.** Every leaked save menu object is still a listener whose handler
  shows its window (claim 16).
- **H6: leaked windows live until the in-game idler is left.** Only the
  idler's device slot `0x81E8F0`, `RestoreDeviceObjects` and the idler's
  destruction were seen to touch these fields; whether leaving to the main
  menu deletes the unowned windows was not traced.
- **H7: the ternary-tree check is safe across reloads.** Reading values from
  `registry+0x08` reads only tree nodes, which a reload overwrites in place
  (`0x14ED760`) but does not free. Between the per-entry deletes and the
  final insert (claim 3) the tree holds pointers to deleted objects, but that
  happens inside the console command on the main thread, so a main-thread
  reader never sees it.

## Unknowns

- Which windows of `papacy.gui`, `great_powers.gui`, `mapmode_more.gui`,
  `more_interface.gui` and `core.gui` exist at run time and whether their
  classes self-register; the idler listener does not rebuild them.
- What the reload handlers of the remaining ~45 self-registering classes do
  (15 were read), and which of them leave old windows or cached children.
- Controllers that cache child pointers of a window another listener rebuilt
  would hold freed *widgets*, not just freed definitions. The idler listener
  re-binds what it rebuilds; other controllers were not surveyed.
- Who calls `instantTextBoxType` slot `0x250` (definition text); possibly the
  localisation reload callbacks (H7 of the reload research).
- Render-node classes were not scanned for references back to definitions.
- The token id `0x264` (claim 18) was not mapped to a keyword.

## Consequences for Etch

- **Preview a renamed copy, not the live HUD file.** The game host writes the
  edited file as `interface/etch_<file>.gui` with every top-level name
  prefixed (`etch_topbar`, ...), then runs `window close etch_<name>` →
  `reload etch_<file>.gui` → `window open etch_<name>` in one main-thread
  job. A file that did not exist at startup reloads (prototype). No game class
  registered under its path (claim 13), so no listener fires except the hints
  rebuild that follows every reload (reload research claim 2). The first
  reload frees nothing; later ones free only the previous `etch_` definitions,
  whose single `window open` window was just closed. The `window open`
  window has no controller, so this is a layout preview with no code-filled
  content, which is what the prototype showed anyway.
- **Treat reloads of the real files as expensive and leaky.** A reload of any
  of the 13 idler-registered files rebuilds the HUD (55–90 ms, prototype) and
  leaks `alerts_parent`, `hotkey_assign_parent`, a load menu, a save menu and
  the outliner rows (claims 16–17); the next reload of their files turns them
  stale. The leaks grow with every reload and stay until the session ends
  (H6). A long editing session against live HUD files should restart the game
  host now and then.
- **Never read old roots after a reload.** The host knows when it reloads. It
  should either take its tree reads only from the window it just opened (found
  as the root whose `+0xB0` equals the registry value for its name, both
  plain pointers), or use a reader that skips stale roots (next item). It
  must not move the virtual cursor over a root built before a reload (H4).
- **What a Tongs change would look like** (recommendation only; Tongs was not
  changed):
  - Build a set of live definitions once per read: walk the type registry tree
    at `mgr+0xC8` (`+0x08` root, nodes `{value, char, lower, higher, next}`)
    and collect the non-null values. No definition is dereferenced.
  - Stop calling slot `0xA0` for children. Take each child's name from the
    holder that adopts it: the window's vector pairs `{pointers, names}`, its
    named maps (entry `{value, std::string name at +0x08}`) and its
    sub-window list (`{std::string name, window*}`). These strings belong to
    the window, so they are readable while the window is.
  - For a root, use the window's override name (`+0xA28`, container `+0x5F8`)
    when it is set. Otherwise call slot `0xA0` only if `+0xB0` is in the live
    set; else report the root and its subtree as `stale` with no name.
  - Do the same for widgets adopted through the render-node fallback.
  - Report `stale` in `ui tree` and exclude stale widgets from `ui find` and
    `ui click` unless asked.
  This is memory-safe: a pointer in the set points at a live definition. It
  can still give a wrong root name in one case: when a later definition of the
  same reload was allocated at the freed address (claim 3 deletes before it
  parses the next entry). The host can rule that out by remembering, before
  the reload, which roots were built from the file's old top-level
  definitions (their `+0xB0` values are live then) and treating those roots as
  stale afterwards whatever their pointer now matches.
- **Recreating stale windows first is not a general fix.** `reloadinterface`
  rebuilds only the country view panels, which listen anyway (claim 14);
  `window close`/`open` reaches only the command's own window; the leaked
  windows have no owner to ask.

## Sources

- `eu4.exe` 1.37.5, SHA-256 above, analysed with the lab's Ghidra project and
  scripts (`eu4-engine-lab`, `scripts/ghidra/decompile.py`, `disasm.py`,
  `xrefs.py`, `string_xrefs.py`) and throwaway scripts for slot scans,
  immediate scans and rolled-back function creation.
- Crash `eu4_20261020_140128` (`minidump.dmp`, `exception.txt`, `meta.yml`,
  `logs/`) in the game's `crashes` folder, read locally.
- Tongs 0.12.0 (`eu4-engine-lab/tongs`, tag commit `12976a5`): `src/game_ui.cpp`,
  `src/game_ui.hpp`, `src/game_memory.cpp`, `src/ui_tree.hpp`; the matching
  `tongs.dll` from the lab's prototype build.
- Reload research: happy-dwarf-team/etch, branch `research/interface-reload`,
  `docs/research/interface-reload.md` (claims and H2–H4 followed up here).
- Prototype: happy-dwarf-team/etch, branch `prototype/game-reload`,
  `prototypes/game-reload/README.md` and `probe.mjs`, with run 1's
  `probe.jsonl` in the lab's `work/` folder.
- Lab notes: `eu4-engine-lab`, `docs/reverse-engineering.md` ("Konsola,
  klatka i drzewo GUI": widget layout, child containers, `mgr+0x110`),
  `docs/static-analysis.md`.
- Game files (read only): `interface/topbar.gui`, `interface/outliner.gui`,
  `interface/ingamesavemenu.gui` and the other vanilla `.gui` files.
