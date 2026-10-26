# Research: how can the live game find the widget under the cursor and the file and line that define it?

Ticket: happy-dwarf-team/etch#153 (map: #151). Static reading only: Etch,
Tongs, Anvil and the lab's notes, plus the lab's Ghidra project on the pinned
build. The game was not started; no file of the game, its saves, mods or the
player's profile was changed. Build: `eu4.exe` 1.37.5 Steam win64, SHA-256
`9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A`; the
installed EXE and the lab's analysed copy had this hash before and after the
work. Addresses are RVAs relative to the image base `0x140000000`.

Methods, named for each claim:

- **decomp** / **disasm** / **xrefs**: Ghidra 12.1.4 on a read-only copy of
  the lab's project (`eu4-engine-lab`, `docs/static-analysis.md`). A function
  Ghidra had not defined was created in a transaction that was rolled back.
  The pseudo-C stays in the lab's ignored `work/`.
- **bytes**: values read from the EXE file (the console table at `0x1FC23E0`,
  records of `0xA0` bytes, handler at `+0x38`).
- **source**: Etch at `origin/main` (1.0.1), Tongs at `main` (0.14.x), Anvil
  at `main` (1.5.x), file and section named.
- **research**: earlier research notes, each a branch that is never merged:
  Etch `research/interface-reload` (#2), `research/game-capture` (#5),
  `research/stale-definitions` (#14), `research/preview-copy` (#16); Tongs
  `research/console-commands`; the lab's `docs/reverse-engineering.md`.
- **live (earlier)**: live checks recorded in Tongs `docs/design.md` and the
  lab's `docs/anvil-overlay-game-test.md`, not repeated here.
- **files**: vanilla and Workshop `.gui` files, read only.
- **web**: the EU4 wiki's [Console commands](https://eu4.paradoxwikis.com/Console_commands)
  page, read 2026-10-26.

## Short answer

The game already knows the answer. Every `.gui` definition records **the file
and the line it was read from**: the type factory copies the reader's stream
name to `type+0x30` and its line counter to `type+0xA0`. The game's own GUI
debug view, the release-enabled console command `guibounds`, takes the widget
under the pointer from the GUI manager (`mgr+0x130`), reads its rectangle, and
prints its name, position, size, file name, **`Line: %i`** (from `+0xA0`),
texture file and sprite type next to the cursor. So pick mode needs no
reverse mapping from a widget path to a file: the plugin reads the hovered
widget, its definition's game path and line, and the same for its ancestors,
and Etch only resolves the game path to the winning file of the playset.

- **Under the cursor:** `mgr+0x130` is the topmost widget the game hit-tests
  under the pointer each frame (verified live by Tongs; `guibounds` uses the
  same field). Its rectangle comes from slots `0xD8`/`0xE0`, its name from slot
  `0xA0`, but only when its definition is live (#14: a freed definition ends
  the process through `_purecall`). Its ancestors and their window come from
  the render-node chain (node `+0x110` parent, `+0x118` owner) or from a full
  Tongs-style tree read (6–7 ms for about 16 000 widgets).
- **Hotkey and click:** the precedent is `anvil-overlay`: subclass the game
  window's procedure, take the key there (a plain key verified live), and in
  pick mode drop the mouse messages the game would act on and make
  `GetAsyncKeyState`/`GetKeyState` read the buttons as up. The GUI takes the
  pointer position from `GetCursorPos` every frame, not from messages, so
  hover keeps working while clicks are swallowed. Esc is never touched.
- **Outline:** the Etch plugin already hooks `IDirect3DDevice9::Present` for
  its capture; it can draw the outline and label there. `guibounds` (a byte at
  `0x233FED7`) is a free reference view, but it labels with the file name
  only, and it calls slot `0xA0` on whatever is hovered, stale or not.
- **File and line in Etch:** the game path (`interface/x.gui`) goes through
  Etch's playset file system to the mod folder that wins. The line is checked
  against Etch's model (a widget starting on that line with that name);
  name-walk fallback when the buffer has changed since the last reload. A
  name defined twice is settled by the game (it reports the copy it uses,
  including the in-file duplicate whose startup winner is unpredictable, and
  the reloaded copy that replaced the startup one). Sprites have no file or
  line from the game: Etch resolves the widget's sprite name in its own
  `.gfx` index, which the live game also cannot reload.

## Verified statically

### GUI debug tools in 1.37.5

1. **The console has three GUI toggles and no picker besides `guibounds`**
   (bytes, Tongs research table):

   | # | Command | Developer gate | Handler | Effect (decomp/disasm) |
   |---:|---|:-:|---|---|
   | 199 | `debug_tooltip` | yes | `0xE85650` | toggles tooltips |
   | 201 | `debug_nogui` | no | `0xE859E0` | toggles byte `0x233FE99`; the in-game render skips the GUI and `guibounds` while it is set |
   | 205 | `debug_info` | no | `0xE85CF0` | toggles byte `+0x14E` of the object at `0x242BDE8`; what it shows was not traced |
   | 253 | `guibounds` | no | `0xE52480` | toggles byte `0x233FED7`, answers `GUI bounds are now ENABLED/DISABLED`; arguments are refused |

   The ironman and multiplayer gate of the console (Tongs research) applies to
   all of them. `debug_mode` only shows event ids and AI weights in tooltips
   (web) and does not lift the developer gate (lab notes). The wiki describes
   `guibounds` as "Allows debugging UI elements" (web). EU4 has no in-game GUI
   editor like the Jomini games (Etch prior-art research).
2. **`guibounds` labels the hovered widget with its file and line** (decomp of
   `0x6EBD10`, disasm, xrefs). The function reads the flag `0x233FED7` and is
   called from the in-game idler's render (`0x8183B0`, `ingameidler.cpp`,
   after the GUI pass, only while `debug_nogui` is off) and from the frontend
   render (`0x10D4390`), so it works in the main menu and in a game. Each
   frame it:
   - takes the hovered widget at `mgr+0x130` (GUI manager pointer
     `0x23494F0`) and the mouse position from the input object; when the
     start-up byte `0x233FF4F` is set it takes the widget through another
     input path instead (not identified);
   - reads position and size through slots `0xD8` and `0xE0`, scales them by
     a float of the renderer, and builds a closed five-point rectangle from
     them;
   - prints, three times (two black passes offset by ±1 px with font
     `vic_18_black`, then `vic_18`), 32 px right of the cursor, the text
     `"%s x: %i y: %i (width: %i, height: %i)\n%s Line: %i\nTexture File: %s\nSprite Type: %s"`
     with: the widget's name (widget slot `0xA0`), x, y, width, height, the
     string at definition `+0x30` cut after its last `/`, the int at
     definition `+0xA0`, and what the definition's virtual `+0x68` and `+0x40`
     return.

   The draw call of the rectangle itself is not visible in the decompiled
   code (H1).

### Every definition carries its file and line

3. **The type factory stores the reader's position in each definition**
   (decomp of `0x14EAC80`, the manager sub-object's slot `+0x10` from #14).
   After it builds the class for the keyword's token id, it takes the
   reader's current stream (`reader+0x28` → `+8`), copies the stream's name
   (`std::string` at stream `+0x18`) to `type+0x30`, the stream's int at `+8`
   to `type+0xA0`, and the token id to `type+0x08`. Claim 2 shows the game
   itself labels `+0xA0` as `Line`. #14 already knew `+0x30` was the source
   file and `+0xA0` "one more reader value".
4. **`type+0x30` is the game path that `reload` matches**, such as
   `interface/topbar.gui` (research #2 claim 4: `reload` normalises the name to
   `interface/<file>`; #14 claims 13–14: listeners register under `type+0x30`
   and the diplomacy tab followed `reload countrydiplomacyview.gui`). It is a
   path in the game's virtual file system, so it does not say which mod folder
   supplied the file.
5. **A reload makes new definitions from the new file** (#2, #14 claim 3; #16
   claim 7: the reload and the startup parse use the same reader). So after
   the live game reloads a saved file, the line in a rebuilt widget's
   definition is a line of the saved file.
6. **Which copy of a name wins is the game's business, and the definition
   says which one it used** (#16 claims 6–9, files):
   - at startup the first file in load order keeps a name, later ones log
     `Already Defined Key` (etch#16; `InterfaceIndex` follows it);
   - a reload deletes the registered definition and inserts the reloaded one,
     so after reloading a later file the game uses its copy, unlike at startup;
   - two definitions of one name in one file both get inserted at startup and
     the winner follows heap addresses, not file order. Anbennar's
     `countryreformview.gui` defines `gov_view_reform_level_entry_4` at lines
     798 and 1024 (files, Workshop item 1385440355); only `type+0xA0` tells
     which one a live widget came from.

### The widget under the cursor

7. **`mgr+0x130` is the topmost widget under the pointer, set every frame**
   (lab notes; Tongs `docs/design.md`, "Mouse" and "Clicking widgets"). Once
   per frame the GUI manager (`0x14E9A70`) reads the pointer through
   `0x14E5E50` (with focus `GetCursorPos` and the window rectangle), takes the
   widgets under it from the last render's hit list, sets `+0x8F` on each, and
   the hover callback `0x15528D0` writes `mgr+0x130`, called from the last to
   the first so the topmost stays. Live (Tongs 0.6.0, 0.10.0): it named the
   speed buttons under the pointer, an event window's `Background` icon over
   the top bar, and read 0 over the map and over masked shields.
8. **A widget's rectangle, name and kind** (Tongs `src/game_ui.cpp`,
   `docs/design.md` "Widget tree", verified live 2026-10-19): position slot
   `0xD8` and size slot `0xE0` in client pixels (with corrections for list
   boxes and masked shields), visibility `+0xC5`, dead `+0xC4`, definition
   `+0xB0`, kind by vtable (no RTTI), name by slot `0xA0`, which for windows
   and containers returns a widget-owned override name when one is set (#14
   claim 9; the country view tabs set one).
9. **Slot `0xA0` must not be called on a stale widget** (#14 claims 22–26;
   Tongs "Stale widgets"). For most classes it jumps through the definition;
   a freed one can hold `_purecall`, which writes a crash dump and ends the
   process, and no `__try` catches it. Tongs 0.14.0 calls it only when `+0xB0`
   is among the live definitions it collects from the type registry
   (`mgr+0xC8`) and the nested maps, and names other widgets from their
   holder's child list. The same rule covers reading `+0x30` and `+0xA0`:
   they are fields of the definition. `guibounds` follows no such rule
   (claim 2).
10. **Ancestors and the top-level window** (Tongs source and design):
    - a full tree read walks the registry (`mgr+0x110`) and each class's
      child containers, places code-held widgets under the owner of their
      render node's parent, and yields the path (`provinceview/…/x[2]`); it
      took 6–7 ms on the main thread for about 16 000 widgets (live);
    - every drawn widget has a render node holding its owner (`+0x118`) and
      parent node (`+0x110`); climbing it reaches the owners of the enclosing
      windows in a few reads, which is how Tongs places widgets nothing holds
      (live: court view's `abilities_listbox`, tooltip scroll bars);
    - list rows are separate top-level windows built by name (#14 claim 18),
      so a row's definition is its own top-level definition, often in
      another file than the list box;
    - a list box's scroll bar parts are built from the `scrollbarType`
      definition its `scrollbartype` names, almost always in `core.gui`
      (#16 claim 25: about 300 such references in vanilla; `provinceview.gui`
      line 1615 is one). Their `+0x30` is `core.gui`, not the list box's file.
11. **Reading must run on the main thread** (Tongs design, "Widget tree"): the
    GUI update deletes widgets and a reload frees definitions. Anvil's
    `anvil-game` publishes a frame event on the main thread and offers
    `run_on_main_thread` (source: `anvil_game.h`); Etch's plugin already uses
    both (source: `plugin/src/plugin.cpp`).

### Hotkey, click and drawing

12. **Key and mouse through the game window's procedure** (source:
    Anvil `plugins/anvil-overlay/src/plugin.cpp`; live: lab
    `docs/anvil-overlay-game-test.md`). `anvil-overlay` subclasses the game
    window (`SetWindowLongPtrW(GWLP_WNDPROC)`), toggles its panel on a
    key-down that matches a key setting (repeats ignored) and swallows it,
    and while its UI wants the mouse or keyboard returns 0 for those messages
    (button and key releases always pass), frees `WM_INPUT` through
    `DefWindowProcW`, and replaces `eu4.exe`'s imports of `GetAsyncKeyState`
    and `GetKeyState` so the game's own polling reads the blocked keys as up.
    Live, F11 sent as window messages opened and closed the panel; the default
    `Ctrl+Shift+F12` was checked by unit tests only.
13. **Anvil has a key setting type** (source: `anvil_plugin.h`,
    `anvil-overlay/settings.toml`): a key code is the virtual key in bits
    0–7 with `0x100` Shift, `0x200` Ctrl, `0x400` Alt; settings can change
    without a restart (`subscribe_setting`), and the player's values live in
    `anvil/data/<plugin>/settings.toml`.
14. **The GUI does not take the pointer position from messages** (lab notes,
    Tongs "Mouse"): `0x14E5E50` reads `GetCursorPos` with focus. SDL 2.0.4's
    event loop (`0x1569C70`) turns button messages into the clicks the GUI
    handles (`0x14EA3D0` hands queued events to the hovered widgets from the
    top). So swallowing button messages stops the click and leaves hover,
    tooltips and `mgr+0x130` working.
15. **Etch's plugin already sits on the device** (source:
    `plugin/src/capture.cpp`): it hooks `Direct3DCreate9(Ex)` in the early
    phase and the device's `Present`, where the frame is complete. An outline
    drawn there lies over the game's GUI and tooltips. `anvil-overlay` draws
    Dear ImGui at `EndScene`.
16. **The Etch game host install loads no other plugin** (source:
    `docs/game-host.md`, "Before every start" step 3): anything in
    `anvil/plugins/` the manifest does not list is removed, so neither Tongs
    nor `anvil-overlay` is there; pick mode belongs in Etch's own plugin.
    The plugin declares `affects_gameplay = false` (`plugin/plugin.toml`).

### Etch's side

17. **Etch models every widget with its source range** (source:
    `packages/core/src/model/gui.ts`): a `Widget` keeps the `kind = { … }`
    property node, whose range (game-text offsets) is the widget's source
    range, plus `nameNode`, children in file order and `if_resolution` blocks.
    Offsets map to lines in the game text.
18. **Etch resolves a game path to the winning file** (source:
    `playset/interface.ts`, `playset/game-files.ts`): `GameFiles` layers the
    game folder and the playset's mods, handling override by path, and gives
    each `interface/` file its absolute path in the winning layer.
19. **Etch's own name rules mirror startup only** (source:
    `model/interface-index.ts`): the first definition in load order wins for
    `.gui` names (etch#16) and, assumed, for sprites and fonts. After a live
    reload of a later file the game no longer follows this (claim 6).
20. **Widget paths are already a shared format** (source:
    `corpus/widget-path.ts`, `layout/navigation.ts`): Tongs paths with `[n]`
    and Etch's offline hit test (`widgetAt`: last in paint order whose rect
    holds the point). A path alone does not give the file: rows, templates
    and override names break a walk by names from the top-level window.
21. **`.gfx` files are not reloaded by the game** (#2): sprites in the live
    game stay as they were at start until it restarts. Code-set sprites,
    frames and fonts are not located in memory yet (#5).

## Hypotheses (need a live check)

- **H1: `guibounds` draws the rectangle.** It builds one (claim 2); the draw
  call was not identified. *Check:* `guibounds`, hover a button.
- **H2: `+0xA0` is the 1-based line of the widget's keyword.** The factory
  runs when the parser reaches a widget keyword; the counter might be 0-based
  or point at the `{` or `name` line. *Check:* `guibounds` over
  `speed_controls/button_speedup`; vanilla `speed_controls.gui` has
  `guiButtonType = {` on line 86 and its `name` on 87.
- **H3: nested definitions carry their own file and line.** Claim 3 shows the
  factory; that nested children go through it too is inferred (it builds all
  kinds and `guibounds` would be pointless otherwise). *Check:* the same
  button is nested in `speed_controls`; read `+0x30`/`+0xA0` of a list box
  row's children too.
- **H4: definitions built by code have an empty `+0x30`.** A few factory cases
  construct without the reader's context; widgets the game builds without a
  file (if any) would show nothing. *Check:* hover the minimap, the map
  tooltip, the console.
- **H5: text boxes and other passive widgets are not always the hovered
  widget.** The hit list is of "owners"; live answers were buttons and
  background icons, and masked shields give 0. A pick may land on the
  background behind the text the user points at. *Check:* hover a text over
  a background in the province view and compare `mgr+0x130` with the tree's
  widgets whose rect holds the point.
- **H6: dropping button-down and its matching button-up stops every game
  reaction**, including map clicks and drags, and the game does not poll the
  mouse buttons another way that the replaced `GetAsyncKeyState`/`GetKeyState`
  miss (raw input is registered by SDL 2.0.4 only in relative mode).
  `anvil-overlay` lets releases through; for pick mode the plugin owns the
  whole click. *Check:* in pick mode click a button, a province and drag the
  map; nothing may happen.
- **H7: the window procedure runs on the main thread** (SDL pumps messages
  from the event loop inside the frame), so a click could read the tree at
  once. Safer either way: record the click and read in the next frame event.
- **H8: VS Code can take the foreground.** The game is the foreground
  process; a plugin call to `AllowSetForegroundWindow` for the extension
  host's process before it signals the pick should let VS Code come forward.
  *Check:* pick with VS Code behind the game, borderless and exclusive
  fullscreen.
- **H9: the definition's virtual `+0x68` is the texture file and `+0x40`
  the name** as the labels say; `+0x40` is the base name getter (#14 claim 2),
  so "Sprite Type" likely repeats the name for most kinds. Not needed by the
  recommendation.

## Live checks to run

In the live game prototype (Etch's private install, lab procedures: hashes,
Process Lasso rule, game lock), a save without ironman:

1. `guibounds`; hover `speed_controls/button_speedup`, a nested province view
   widget (`provinceview` → `province_window` child), an outliner row and a
   list box scroll bar. Record name, rect, file and line against the files
   (H1–H3) and screenshot the label.
2. Plugin read of `mgr+0x130` each frame with liveness check: definition
   `+0x30`, `+0xA0`, name, kind, render-node ancestors with their own
   definitions; compare with a full tree read's path (H3–H5).
3. `reload` a saved file that defines a name an earlier file also defines,
   then hover the window: the line must point into the reloaded file
   (claim 6).
4. Pick mode with window-procedure input: hotkey with modifiers on and off,
   Esc still opens the game menu, clicks on buttons, provinces and map drags
   do nothing, the wheel does not zoom when used for stepping (H6, H7).
5. Hover a stale widget after a HUD reload with pick mode on: the plugin must
   name it from its holder or mark it stale, never call slot `0xA0`.
6. Time from click to the file open in VS Code with the game in front (H8).

## Recommendation

Read the definition's file and line from the game; do not rebuild them from
a widget path.

1. **Hotkey.** Etch's plugin subclasses the game window and toggles pick mode
   on an Anvil key setting (bound from an Etch VS Code setting written to
   `anvil/data/etch/settings.toml`). Esc is left alone. While on: button
   messages (down, its up, double click) and the wheel are dropped, and the
   mouse buttons read as up through the replaced key-state imports.
2. **Hover.** On the frame event, when `mgr+0x130` changes: check the
   widget's definition against the live set (rebuilt after each reload),
   read kind, rect, name, definition game path and line; climb the
   render-node chain for the ancestors and their definitions; the last owner
   is the top-level window. The full tree read is fast enough to do on a
   click when a `[n]` path is wanted. Optionally offer the stack of visible
   widgets whose rect holds the point, stepped with the wheel, for H5.
3. **Outline.** Draw it in the existing `Present` hook: the rect, the name,
   `file:line` and the path. `guibounds` stays a reference for checks, not
   the product: it names only the file, uses fixed fonts and calls slot
   `0xA0` on stale widgets.
4. **Click.** Send one push message over the session pipe: the picked widget
   and each ancestor with `{name, kind, path, rect, game_path, line, stale}`,
   plus the top-level window. The extension maps `game_path` to the winning
   file (`GameFiles`), checks that a widget of that name starts on that line
   in Etch's model of the file as the game last read it, opens it in the
   editor, and pins the offline preview on the enclosing top-level
   definition. If the line does not fit (the file changed after the last
   reload, or H2 says otherwise), it walks the ancestors' names inside the
   definition the game named.
5. **Two-sided answers.** When the picked definition is a template in another
   file (scroll bar parts from `core.gui`, list rows built by name), show the
   definition and the referencing widget (the nearest ancestor in the edited
   file). Sprites: from the widget's sprite property through Etch's `.gfx`
   index, labelled as Etch's resolution, since the game reports no `.gfx` file
   or line and never reloads `.gfx`.

## What this makes specifiable, and what it leaves out

- **Specifiable now:** the pick message of the session pipe (it becomes a
  two-way channel: today the plugin only answers requests); the plugin's
  input handling (hotkey setting, swallowed messages, Esc untouched); the
  outline drawn in `Present`; the extension's mapping from game path and line
  to a file, with the name-walk fallback; how the preview is pinned from a
  pick (enclosing top-level definition, ancestors as the view).
- **Needed from other tickets:** the view to pin is the set of visible nested
  windows, which a pick's ancestors only start (views captured from the live
  game); how the live game reloads saved files and keeps stale widgets safe
  decides when the live-definition set is rebuilt.
- **Out of scope / not possible:** a file and line for sprites, fonts or
  code-set content from the game (the game has none; Etch's index is the
  answer); the console route in ironman or multiplayer (the plugin's reads
  do not need the console); the game's `guibounds` as the product view.
