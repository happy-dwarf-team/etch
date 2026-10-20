# What Tongs and Anvil can capture from the game for a precision corpus

Research for [etch#5](https://github.com/happy-dwarf-team/etch/issues/5)
(map: [etch#1](https://github.com/happy-dwarf-team/etch/issues/1)). Read only:
the game was not started and no repository was changed.

Sources are the team repositories as checked out in the EU4 engine lab on
2026-10-20:

| Repository | Commit | Version |
| --- | --- | --- |
| `tongs` | `ba1cc96` (plugin API 2 migration merged) | 0.12.0 in `version.txt`, 1.0 pending |
| `anvil` | `295ee4a` | 1.0.0 |
| `bellows` | `49fbd69` (plugin API 2 migration merged) | 0.7.0 in `version.txt` |

References are `repository/path:line`. Each claim is marked as
**verified** (checked live in the game by the team, as recorded in the
source), **static** (found by static analysis of `eu4.exe`, not checked live)
or **hypothesis**. Words in bold in [GLOSSARY.md](../../GLOSSARY.md) are used
as defined there.

## Short answer

- Tongs gives, per widget: `path`, `type` (8 coarse kinds), `visible`,
  `rect` in client pixels, `click_point`, displayed `text` (without colour
  codes), `enabled` and `checked`. Positions are verified; sizes come from the
  `.gui` and may not match the drawn panel. It gives no sprite, frame, font,
  text colour, clip rectangle or draw order.
- Windows can be opened from outside today with `ui click SEL`, `key`
  (F1 opened the country view live) and `click X Y`, and captured with
  `screenshot` (whole client area, PNG, works while covered). The resolution
  is whatever the game started with (`settings.txt`, `graphics` block); it
  cannot be changed from Tongs.
- Anvil gives a dedicated plugin everything needed to run code on the main
  thread after each frame, hook game and Direct3D 9 functions, register
  services and write to its own data folder. It has **no file watching and
  no IPC**; Tongs' named pipe is the only existing channel, and Tongs
  registers no service another plugin could call.
- For the comparison data that is missing, the render node already has known
  (static) offsets for the clip rectangle, the drawn text and the draw order.
  Sprite, frame and font are not located yet.

## 1. What Tongs returns per widget today

### Fields

`ui find SEL [all] [limit=N]` and `ui tree [SEL] [depth=N] [limit=N] [all]`
are main-thread reads (`tongs/README.md:38-39`). Each widget in the answer has
(`tongs/src/ui_tree.cpp:436-446`, `tongs/docs/design.md:599-615`):

| Field | Meaning | Status |
| --- | --- | --- |
| `path` | widget path of `.gui` names, `[n]` for siblings sharing a name; resolves back to the same widget | verified: 150 random paths (`tongs/docs/design.md:680-682`) |
| `name` (tree only) | the `.gui` name, case kept | verified |
| `type` | `window`, `button`, `icon`, `text`, `listbox`, `checkbox`, `editbox`, `other`, told apart by vtable (`tongs/src/game_ui.hpp:79-109`) | verified for the classes in `tongs/docs/design.md:530-546` |
| `visible` | widget and all ancestors shown (`+0xC5`) | verified (`tongs/docs/design.md:671-673`) |
| `rect` | `x, y, w, h` in client pixels: position from vtable slot `0xD8`, size from slot `0xE0` | position verified; size from `.gui` (below) |
| `click_point` | centre of `rect` | verified |
| `text` | displayed text, Windows-1252 converted to UTF-8, colour codes `§X` dropped, icons kept as `£name` | verified (`tongs/docs/design.md:674-679`) |
| `enabled` | buttons: state `+0x124` is not 3 | verified |
| `checked` | check boxes: byte `+0x100` | verified (`tongs/docs/design.md:684-690`) |
| `children_count` | with `depth=N`, deeper levels only counted | — |

The in-memory snapshot holds the same fields plus the widget address, which
is not reported (`tongs/src/ui_tree.hpp:25-38`). Reading the whole tree
(about 16 000 live widgets) took 6–7 ms on the main thread with the game
paused (`tongs/docs/design.md:642-643`).

### Limits that matter for a comparison

- **Sizes.** Window sizes come from the `.gui` file and need not cover the
  drawn panel: `countryview` and `countrycourtview` report 1229×120; some
  shield buttons are 0 wide (`tongs/README.md:130-131`,
  `tongs/docs/design.md:658-660`; open:
  [tongs#50](https://github.com/happy-dwarf-team/tongs/issues/50)). Positions
  are right.
- **Scale.** Slot `0xD8` gives client pixels directly; the render context's
  scale floats (`ctx+0x4D8/+0x4DC`) were 1.0 in the only live check, at
  `game_ui_scale=1.000` and DPI 96 (`tongs/docs/design.md:644-645`). Other UI
  scales and DPIs are unchecked.
- **Unread children.** Overlapping elements boxes (e.g. shield lists in
  battle windows, `start_type_options`) and grid boxes: their containers were
  not found ([tongs#48](https://github.com/happy-dwarf-team/tongs/issues/48),
  `tongs/docs/design.md:692-696`).
- **List boxes** create widgets only for the rows they show and refill them
  as they scroll (`tongs/README.md:131-133`).
- **Coarse kinds.** Every class outside the table (extended scroll bars,
  drop-down boxes, the minimap, …) is `other`
  (`tongs/docs/design.md:548-549`); there is no distinction between, say, an
  `iconType` and a `buttonType` with a sprite beyond `icon` / `button`.
- **Scroll bars** have no render node; their `rect` is the bounds of their
  buttons (`tongs/docs/design.md:573-575`).
- **Map icons** come and go with the camera, so their `[n]` changes between
  reads (`tongs/docs/design.md:681-682`).

### What is missing, and what is already known about it

| Needed for comparison | Today | Known location | Status |
| --- | --- | --- | --- |
| Clip rectangle | not read | four `int16` at `node+0x128..+0x12E` of the render node, used when the flag `node+0x130` is set (picking `0x14DDA50`) | static (`tongs` branch `research/widget-tree`, `docs/research/widget-tree.md:209-214`) |
| Draw order (z-order) | not reported; tree children are in container order, roots in registry order | picking walks the render nodes at `ctx+0x298`; `0x14DEAF0` returns owners "last drawn first", so that list order is the draw order | static (same file, lines 209-216); partly verified: the newest event window is on top (`tongs/docs/design.md:770-774`) |
| Text as drawn | the widget's string (`+0x200`, `+0x170`, `+0x178`, `+0xF8`) | the setter copies the string into the render node at `node+0x1B0`; whether that is the formatted / truncated text is open | static (same file, lines 194-196, 422-424) |
| Text colour | colour codes are stripped (`tongs/docs/design.md:608`) | the raw string still has the `§X` codes; the text box's own default colour is not located | partly available: Tongs could keep the codes |
| Sprite (`spriteType` name) and frame | not read | not located. The `.gui` definition object is at widget `+0xB0` (its name at `type+0x10`) and the button's text key at `type+0x2A0`; the sprite name is probably also in the definition, the current frame in the widget or node | hypothesis |
| Font | not read | not located | unknown |
| Hover / pressed state | `mgr+0x130` (topmost widget under the pointer) is read for `ui click`; `+0x8F` is cleared per frame | verified (`tongs/docs/design.md:779-781`) | — |
| Pixels of one widget | not offered ("screenshots of single widgets" is out of scope, `tongs/docs/design.md:1550`) | crop the full screenshot by `rect` | — |

## 2. Opening windows and capturing them

### Opening

All of these exist today and need `input = true` in Tongs' settings
(`tongs/README.md:46-61`):

- **`ui click SEL`**: resolves the selector on the main thread, moves the
  virtual pointer to the centre, checks that the game hovers that widget, then
  clicks. It refuses with `not_found`, `ambiguous`, `not_visible`, `disabled`
  or `covered` instead of guessing (`tongs/README.md:135-143`,
  `tongs/docs/design.md:698-751`). Verified on the speed controls, event
  options and the main menu's save list (hardening pass).
- **`key NAME`**: F-keys, letters, Escape etc. F1 opened `countryview` and
  `countrycourtview` live (`tongs/docs/design.md:665-667`).
- **`click X Y`** on the map, e.g. a province to open the province view:
  not verified ("clicks on the map (only interface buttons were tried)",
  `tongs/docs/design.md:1571-1573`).
- **`console LINE`** with `game_calls = true` runs console commands
  (`tongs/README.md:218-257`). No console command that opens a window was
  found in the sources; console calls change game state and count as game
  calls, so they would mark a capture run.
- **Events**: `event list` / `event choose` handle event windows
  (`tongs/README.md:153-177`). Saves can be loaded from the menu purely with
  `ui click` (hardening pass, lab `docs/reverse-engineering.md:162-178`).

Opening a window by calling the game's own show function directly is not
possible today: no such address is known.

A corpus driver therefore needs, per window, a short recipe (a list of
`ui click` / `key` steps from a known state), the same save, date and
camera, the game paused, and a final `release` / `move` away from the window
so no hover frame or tooltip is captured (the virtual pointer makes the
interface see the pointer, `tongs/README.md:90-92`).

### Capturing

- **`screenshot [NAME]`**: `PrintWindow(PW_CLIENTONLY | PW_RENDERFULLCONTENT)`
  into a 32-bit DIB, falling back to a screen copy when the result is all
  black; PNG through WIC into `anvil/data/tongs/screenshots/`, newest 100 kept
  (`tongs/docs/design.md:295-299`, `tongs/src/screenshot.cpp:45-76, 164-173`).
  Verified unfocused and with the cursor on another monitor; 3440×1440 PNG,
  3–7.5 MB (`tongs/docs/design.md:313-314`).
- It runs on the pipe thread, not as a main-thread job
  (`tongs/src/plugin.cpp:76-78`, `tongs/src/protocol.cpp:1503-1511`), so it
  is **not synchronised with a frame**, and a `ui tree` read and a screenshot
  are two separate moments. With the game paused and the pointer away this is
  probably harmless (hypothesis); with animations (pulsing alerts, the date,
  map units) it is not.
- **`window`** reports the client `width`/`height`, `dpi`, `focused` and
  `minimized` (`tongs/README.md:34`, `tongs/src/game_window.cpp:44-56`), which
  is enough to reject a capture taken at the wrong size.

### Fixed resolution and UI scale

- The resolution is a start-up setting. The lab's `settings.txt` has a
  `graphics` block with `size = { x = 3440 y = 1440 }`,
  `min_gui = { x = 1280 y = 720 }`, `game_ui_scale = 1.000`,
  `fullScreen = no` and `borderless = yes` (verified by reading the file;
  private path omitted).
- No Tongs or Anvil command changes it. A corpus at several resolutions or UI
  scales needs one game start per combination with a prepared `settings.txt`,
  or the in-game options menu driven by `ui click`, whose re-layout path is the
  subject of [etch#2](https://github.com/happy-dwarf-team/etch/issues/2).
- The lab's procedure lets only `refreshRate` and `graceful_exit` differ
  between the settings baseline before and after a run (lab `AGENTS.md`,
  "Pomiary"; `scripts/anvil-play.ps1:99-100` keeps the copy). Capturing at
  other resolutions needs that procedure extended with named settings
  baselines.
- A windowed client area smaller than the monitor (e.g. 1920×1080 with
  `borderless = no`) is a hypothesis: never tried in the lab.

### Cost of a fresh start

Each resolution change or game-host restart costs a full start: 34.96 s
median to the main menu with Anvil alone and 15.40 s with Bellows 0.1.0
(12.24 s with `ram_prefetch`) on the lab's 10-mod set
(`bellows/README.md:18-30`), plus loading the save (3.5 s from the menu in
the lab, `docs/reverse-engineering.md:167`). Bellows' `attr_cache` remembers
"file not found" during start-up and has no file watcher
(`bellows/src/modules/attr_cache.cpp:13`); it is off by default, and must
stay off while Etch creates new asset files.

## 3. What Anvil offers a dedicated Etch plugin

### Host API (plugin API 2)

`anvil/include/anvil/anvil_plugin.h` (`ANVIL_API_VERSION 2`, line 28):

- `log`, `plugin_dir`, `data_dir` (writable `anvil/data/<id>/`) (lines
  114-116);
- the seven kinds of change on declared, verified `eu4.exe` symbols
  (`hook_function`, `mid_hook`, `replace_block`, `redirect_call`,
  `patch_bytes`, `swap_pointer`, `replace_import`, lines 132-155), and
  `hook_function_at` / `mid_hook_at` for addresses **outside** `eu4.exe`,
  such as Direct3D 9 vtables (lines 159-161; `anvil/docs/design.md:218`);
- `address_of` / `symbol_value` to call or read declared game code and data
  (lines 175-179);
- settings with change callbacks for `restart = false` settings (lines
  185-190);
- services (`register_service`, `get_service`) and events (`subscribe`,
  `publish`, only `<own id>.<name>`) (lines 197-205,
  `anvil/docs/design.md:272`).

### `anvil-game`

`anvil/include/anvil/anvil_game.h`, `anvil/docs/design.md:386-397`:

- `anvil-game.ready` once the main menu is up; `anvil-game.frame` after every
  outer frame of the main loop, on the main thread; `anvil-game.session`
  with ironman and multiplayer flags;
- service `anvil-game.game` v1: `ready()`, `main_thread_id()`,
  `frame_number()`, `run_on_main_thread(work, context)` (runs after the next
  outer frame, callable from any thread) and `session()`;
- frames stop while a save loads, and queued work never runs once the game
  quits, so callers must wait with a limit.

This is exactly the hook a reload needs: a watcher thread notices a changed
file and queues the rebuild with `run_on_main_thread`.

### What Anvil does not offer

- **File watching**: nothing in Anvil, Tongs or Bellows watches files
  (search for `ReadDirectoryChangesW` / `FindFirstChangeNotification` found
  nothing; Bellows says so explicitly, above). An Etch plugin would run its own
  `ReadDirectoryChangesW` thread on the mod folder.
- **IPC**: Anvil has no channel to outside processes. Tongs' named pipe
  (`\\.\pipe\tongs`, one JSON line per request, up to 8 instances, DACL for
  the game's user only, `tongs/README.md:25-28`,
  `tongs/src/pipe_server.cpp:23, 48`) is the pattern to copy. Tongs registers
  no Anvil service (no `register_service` in `tongs/src`), so another plugin
  cannot call its tree reader in-process; it would either talk to the pipe or
  reuse the MIT-licensed code.
- **Frame-synchronised pixels**: no D3D9 hook exists yet. `anvil-overlay`
  (planned for Anvil 1.1, `anvil/docs/design.md:424, 633`) will hook
  `EndScene`/`Reset` with `hook_function_at`; Anvil chains several plugins'
  hooks at one address (`anvil/docs/design.md:232-237`), so an Etch plugin
  could hook `EndScene`/`Present` alongside it and copy the back buffer
  (`GetRenderTargetData`) right after the frame whose tree it read. The game's
  OpenGL backend would not be covered (`anvil/docs/design.md:424`).
- **Plugin hot reload** is fog (`anvil/docs/design.md:605`): changing the Etch
  plugin itself needs a game restart.

### Classification

A plugin that only reads the widget tree, captures pixels and talks over a
pipe can declare `affects_gameplay = false` and keeps working in ironman.
One that rebuilds windows or calls game functions is closer to Tongs' game
calls; whether a GUI rebuild "can change the simulation's state or results"
(`anvil/docs/design.md:369`) has to be decided with
[etch#6](https://github.com/happy-dwarf-team/etch/issues/6). Every address
it uses must be declared in its `symbols.toml` and verified by Anvil before
it loads (`tongs/docs/design.md:1424-1465`).

## 4. Options

Rough effort for one agent familiar with the repositories; every option that
touches game memory also needs a live check under the lab's procedure.

| Option | What it gives | Effort | Main risk |
| --- | --- | --- | --- |
| **A. Tongs as it is, scripted** | per window: recipe of `ui click` / `key`, `ui tree WINDOW all`, `window`, `screenshot`; crop by `rect`; compare rects and pixels | 1–3 days for a driver and 10–20 window recipes | `.gui` sizes ([tongs#50](https://github.com/happy-dwarf-team/tongs/issues/50)), unread overlapping boxes ([tongs#48](https://github.com/happy-dwarf-team/tongs/issues/48)), screenshot not frame-synced, one start per resolution |
| **B. Extend Tongs' `ui` answer** | clip rect, draw order index, node text, raw text with colour codes, a `rect_drawn` from the node | 3–5 days: offsets are known statically; release PR with a live check | belongs to Tongs' scope only if it serves agents too; sprite and font still missing |
| **C. Locate sprite, frame and font** | `spriteType` name, current frame, font name per widget | 1–2 weeks of static analysis of the definition object (`+0xB0`) and render nodes, then a live check; uncertain | may need per-class layouts like the children did |
| **D. Dedicated Etch plugin** | in-process tree + render data dump to JSON, back-buffer capture synced to the same frame, own pipe for the editor, file watcher feeding `run_on_main_thread` | 2–4 weeks for a first version, reusing Tongs' tree reader; the reload itself is [etch#2](https://github.com/happy-dwarf-team/etch/issues/2) / [etch#6](https://github.com/happy-dwarf-team/etch/issues/6) | D3D9 hook and back-buffer copy are new to the team; symbols to maintain |

A plausible order: A for a first precision corpus measured on widget rects
and cropped pixels; D's skeleton (watcher, `run_on_main_thread`, pipe) as the
reload prototype; B and C folded into D once the prototype shows which fields
the comparison actually needs.

## 5. Open questions

- Whether `rect` from slots `0xD8`/`0xE0` matches what is drawn for text
  boxes and windows (render size vs layout size, H2 in the widget-tree
  research) at UI scales other than 1.0.
- Whether `PrintWindow` and the back buffer give identical pixels (gamma,
  alpha, the cursor).
- Which windows can be opened from a fixed save without game calls, and
  which need a specific game state (wars, peace deals, events).
- Whether a windowed client area of a chosen size works and is pixel-exact.
