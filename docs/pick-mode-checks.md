# Live checks of pick mode

What the real game did with the reads, input handling and editor hand-off that
pick mode (etch#158) relies on: the hypotheses H1–H9 of the pick mode research
(etch#153, branch `research/pick-mode`), the default hotkey, a pick after a
reload, and the time from a click to the file in VS Code. Run for etch#171 on
2026-10-27. Each section gives the result and what it changes in the design.

## How it was run

- **Build.** `eu4.exe` 1.37.5 Steam win64, SHA-256
  `9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A`, checked
  for the game folder's file and the copy before every start and after the
  last one.
- **Install.** A private junction copy of the game, built by the corpus
  driver's `game.ps1 -Action Prepare` with Anvil 1.5.2 and Tongs 0.17.0
  (`input` and `game_calls` on), plus a throwaway probe plugin,
  `etch-pick-probe` (branch `prototype/pick-mode-probe`, never merged). The
  probe does what the research recommends for Etch's plugin: it subclasses the
  game window, toggles pick mode on `Ctrl+Shift+E`, drops mouse buttons and the
  wheel in pick mode, replaces `eu4.exe`'s `GetAsyncKeyState`/`GetKeyState`,
  reads the hovered widget and its ancestors every frame through Tongs'
  `tongs.ui` service with the definition's game path and its line
  (definition `+0xA0`), and on a click calls `AllowSetForegroundWindow` and
  `code -g <file>:<line>`. It logs every step with timestamps. Etch's own
  plugin was not loaded.
- **Profile.** A private vanilla profile copied from the one of the reload
  checks ([live-game-checks.md](live-game-checks.md)), not the player's:
  3440×1440 borderless, UI scale 1; one start in exclusive fullscreen. Its only
  mod held `interface/zz_etch171_speed.gui`: the game's `speed_controls.gui`
  after 40 comment lines, so the same names are defined twice, 40 lines apart.
- **Save.** `Russia1719_04_05.eu4` (vanilla, not ironman), made from the
  corpus save during the reload checks. The exclusive fullscreen start went to
  the main menu.
- **Procedure.** The EU4 engine lab's procedure: its game lock for the batch,
  the Process Lasso rule `eu4.exe,0,1-7`, a suspended start with the mask
  `0xFE`, the main thread on CPU 4 and 6 workers in both pools, and closing
  only after the PID, image path and creation time were checked again. Four
  starts (the probe got two fixes between them, below). The settings were put
  back to the baseline afterwards; only `refreshRate` and `graceful_exit`
  differed.
- **Input.** Injected input did not reach anything in this session: `SendInput`
  of mouse moves left the cursor where it was, and keys and clicks sent that way
  never reached the game. Keys and mouse buttons were therefore posted as window
  messages to the game window (`PostMessage`), with the real cursor put on the
  point first (`SetCursorPos`), because the GUI reads the pointer with
  `GetCursorPos`. This is the path a window procedure subclass sees. It is not
  hardware input: posted messages do not change the thread's key state, and
  no raw input is generated. Each section says where this matters.
- **Reading the game's own view.** `guibounds` through Tongs' `console`,
  screenshots through Tongs.

## Results

### H1: `guibounds` draws the rectangle

Holds. With `guibounds` on, the game outlines the hovered widget in red and
prints its label 32 px right of the pointer. Near the right edge of the screen
(speed controls, outliner) the label is cut off by the edge.

**Design:** unchanged; `guibounds` stays a reference view, not the product.

### H2: the line base of `+0xA0`

The line is 1-based and is the line of the **`{` that opens the widget's
block**, not of the keyword or of `name`. `guibounds` and the probe's read of
`+0xA0` agree wherever both were seen.

| Widget | Reported | The file |
| --- | --- | --- |
| `speed_controls/button_speedup` | `speed_controls.gui:86` | `guiButtonType = {` on 86, `name` on 87 |
| `speed_controls` | `speed_controls.gui:2` | `windowType = {` on 2 |
| `tax_base_increase_button` | `provinceview.gui:596` | `guiButtonType =` on 595, `{` on 596, `name` on 597 |
| `provinceview` | `provinceview.gui:283` | `windowType =` on 282, `{` on 283 |
| `culture` (text) | `provinceview.gui:1117` | `instantTextBoxType = {` on 1117 |
| `outliner_unit_entry` | `outliner.gui:617` | `windowType =` on 616, `{` on 617 |
| `minimap_pic` | `menubar.gui:2136` | `iconType =` on 2135, `{` on 2136 |

**Design:** the extension accepts a widget whose opening brace is on the
reported line (its keyword may be on the line before) when it checks the line
against its model; the name-walk fallback stays for a buffer changed since the
last reload.

### H3: nested definitions carry their own file and line

Holds. Every widget of the hovered chain has its own file and line: buttons and
texts nested in `province_window` (`provinceview.gui:560`) inside
`provinceview`; an outliner row (`outliner_standard`, `outliner.gui:628`, in
the row window `outliner_unit_entry:617`, in `outliner_list:38`); the
outliner's scroll bar parts from `core.gui` (`listboxTrackButton:170` in
`standardlistbox_slider:147`) under `outliner_list`; and the minimap picture
`minimap_pic` from `menubar.gui:2136` inside `minimap_panel`
(`minimappanel.gui:3`).

**Design:** two-sided answers (the template and the referencing widget) are
needed for icon and button templates from another file too, not only for
scroll bars and list rows: a chain whose files change between a widget and its
parent marks such a place.

### H4: code-built definitions have an empty path

Not seen. No hovered widget had an empty definition path in 62 hover changes
and 19 clicks. Over the map, the map tooltip and the open console the game
reports no hovered widget at all.

**Design:** a click with nothing hovered opens nothing; the label says there is
no widget under the pointer.

### H5: passive text boxes as the hovered widget

Partly. A text box over a background is the hovered widget: the province
view's `culture` and the top bar's `text_powerprojection`. A text inside a
button is not; the button is (`outliner_standard` over its `entry_text` and
`info_text`; `single_player_button` over `single_player_button_text` in the
main menu). The visible widgets whose rectangle holds the point also include
windows that cover the whole screen everywhere: `menubar` (`menubar.gui:1399`)
and `floating_buttons` (`menubar.gui:1778`) in a game, `country_selection_panel`
and `mainmenu` in the main menu.

**Design:** the wheel's stack under the pointer stays: it is the way to a
button's own text. It leaves out, or puts last, top-level windows that cover
the whole screen.

### H6: swallowing the whole click

Does not hold as specified; holds with one addition.

- **Dropping the button messages is not enough.** SDL 2.0.4 compares the
  `MK_*` button bits in the `wParam` of `WM_MOUSEMOVE` with its own button
  state and makes the press or release it missed. In pick mode, with every
  button and wheel message dropped, a `WM_MOUSEMOVE` carrying `MK_LBUTTON` and
  then one without it over the speed-up button raised the speed from 2 to 3,
  and three drags over the map opened the country view and closed the province
  view. With a real mouse, every move while a button is held carries these
  bits, so a slightly moving click would reach the game.
- **With the bits cleared, nothing reached the game.** With the probe also
  clearing the `MK_*` bits of each `WM_MOUSEMOVE` in pick mode, left, double,
  right and middle clicks on the speed-up button and on a province, left,
  middle and right drags over the map and three wheel steps changed nothing:
  the same speed, no window opened or closed, the same camera and zoom (the
  screenshots differed only by animation). Control: the same click with pick
  mode off raised the speed.
- **No other route was used.** The replaced `GetAsyncKeyState`/`GetKeyState`
  were asked for a mouse button 0 times while pick mode was on, and the game
  registers no raw input devices (`GetRegisteredRawInputDevices` empty at the
  first frame, in the loaded game and in pick mode), so `WM_INPUT` plays no
  part.
- **Not checked:** a real hand on a real mouse (see Input above).

**Design:** in pick mode the plugin drops the button messages (down, up,
double click, all buttons) and the wheel, **and clears the `MK_*` bits of every
mouse message it passes on** (`WM_MOUSEMOVE` above all); it keeps the
key-state replacement as a guard. Hover keeps working, since the GUI reads the
pointer with `GetCursorPos`.

### H7: the window procedure's thread

Holds. In all four starts the game window was created by the main thread
(`GetWindowThreadProcessId` equals `anvil-game`'s `main_thread_id`) and the
window procedure ran on it. Reading on the next frame event is cheap:

- the click reached the next frame event after 4–16 ms;
- the hovered chain with paths (`tongs.ui` `hovered` with `TONGS_UI_PATHS`,
  the whole tree) took 5 ms in the main menu and 13–19 ms in a game;
- the per-frame hover without paths took a median of 0.08 ms (p90 0.25 ms,
  62 changes of the hovered widget); the slowest, 15 ms over the minimap, was a
  climb that fell back to the whole tree, and the first read after a start
  about 4 ms (collecting the live definitions).

**Design:** unchanged: record the click in the window procedure, read on the
next frame. The paths are read once per click, not per frame.

### H8: VS Code taking the foreground

Holds on the lab machine; not established for a default Windows setup. In
borderless (six picks) and exclusive fullscreen (three picks, main menu) VS
Code was in front 484–512 ms after the click. In exclusive fullscreen the game
was not minimised, came back to the front when asked, logged no device loss,
and could be picked again. But the lab machine's `ForegroundLockTimeout` is 0,
so Windows applies no foreground lock there: VS Code also came to the front
without `AllowSetForegroundWindow` (two picks). With the Windows default
(200 000 ms) the lock applies, and the game's call, which returned TRUE as the
foreground process, is what should let VS Code come forward; that was not
checked.

**Design:** unchanged: the plugin calls `AllowSetForegroundWindow` (for the
extension host's process, or `ASFW_ANY`) before it signals the pick. The check
under the default lock timeout is left for the live game's own plugin.

### H9: the label's texture file and sprite type

The label's "Texture File" shows the sprite type name (for example
`GFX_development_button_tax`) and "Sprite Type" the widget's own name
(`tax_base_increase_button`, `culture`). So the definition's virtual `+0x68`
is the sprite name and `+0x40` the name; neither gives a texture file.

**Design:** unchanged; sprites are resolved through Etch's `.gfx` index.

### The default hotkey `Ctrl+Shift+E`

With the probe set to pass the hotkey on, the game did nothing on
`Ctrl+Shift+E` on the map, in the ledger and in the main menu (screenshots
differed only by animation). The control, a plain `e`, switched to the trade
map mode: `e` is the shortcut of `mapmode_trade` (`minimappanel.gui`,
`frontend.gui`), and the game keeps modifiers apart (`Shift+A` and `Shift+G`
are separate shortcuts). With the province view open the check did not run
(the view was not on screen when the hotkey was sent). Swallowed, the hotkey
turned pick mode on and off in each of these places.

Posted key messages do not change `GetKeyState`, so the probe also tracked
Ctrl and Shift from the key messages it saw; with a real keyboard
`GetKeyState` alone should do, which was not checked.

Esc in pick mode passed through: it closed the open windows first (the country
view, the Go to box), as without pick mode, and then opened the game menu.

**Design:** `Ctrl+Shift+E` stays the default; the plugin swallows it and Esc is
untouched.

### A pick after a reload of a name another file also defines

Holds. At start `speed_controls.gui` kept `speed_controls` (the game logged
`Already Defined` for `zz_etch171_speed.gui`), and the speed-up button reported
`speed_controls.gui:86`. After `reload zz_etch171_speed.gui` and
`reload topbar.gui` (which rebuilds `speed_controls`, see the reload checks'
H6) it reported `zz_etch171_speed.gui:126` and its window `:42`: 40 lines
later, in the reloaded file.

**Design:** unchanged; the game's answer names the copy it uses.

### Hovering a stale widget

Not provoked, as the reload checks advised (H4 there). The probe read with
`TONGS_UI_STALE` and never called a widget's name slot; Tongs' cheap
`hovered` reads names without calling it.

## Budget: click to the file in VS Code

From the click (the window procedure) to VS Code's title naming the opened
file, nine picks: 493–656 ms, median 538 ms. Of this, 20–50 ms is in the game
(the next frame, the whole-tree read with paths, starting the process); VS Code
was in front after a median of 498 ms. The probe opened the file with VS Code's
command line (`code -g`), which starts a process for each pick; the live game
signals the extension over its pipe instead, which was not measured.

**Design:** no target is set from this; measure it again with the extension's
own path, from the click to the editor showing the line.

## What carries over to Etch's plugin

- The probe read everything through Tongs' `tongs.ui` service (Tongs 0.17.0),
  which the live game does not load (etch#157 loads Etch's plugin and
  Bellows). Etch's plugin needs the same reads: the hovered widget and its
  ancestors without calling a stale name slot, the definition's game path and
  `+0xA0`.
- The window procedure has to clear the `MK_*` bits (H6); the rest of the
  input handling is as the research recommends.
