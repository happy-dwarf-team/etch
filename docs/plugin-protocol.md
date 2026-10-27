# The live game's session pipe

Etch's Anvil plugin (`plugin/`) is the live game's end of a private pipe; the
extension is the other end (ADR 0005; in Etch 1.x the game host's, ADR 0003). This page is the contract between them:
the extension's client (etch#49) and the plugin are written against it, and a
change to it changes `kProtocolVersion` in
[`plugin/src/protocol.hpp`](../plugin/src/protocol.hpp) when an older peer
would misread it. The extension and the plugin ship together in one VSIX
(ADR 0004), so a peer of another version is refused, not negotiated with.

Protocol version: **2**, the live game's (v2 specification sections 6 and 7):
the handshake, the ping, the jobs the plugin runs on the game's main thread
(`reload`, `save` and `confirm`), pick mode (`pick_mode`, `snapshot`) and the
plugin's pushes (`pick`, `snapshot`, `pick_mode`). Protocol 1 was Etch 1.x's game host: its preview
job (`job`, etch#50) and frame capture are gone (ADR 0005), and a `job` now
gets `unknown_type`; their description is in this page's history on
`release/1.x`.

## Finding the pipe

- For every start of the live game the extension draws a fresh **session id**: 128
  random bits as 32 lowercase hex digits (`[0-9a-f]{32}`).
- It starts `eu4.exe` with the environment variable `ETCH_HOST_SESSION` set to
  that id.
- The plugin serves `\\.\pipe\etch-host-<id>`. The pipe is up within about a
  second of the process start (the plugin loads in Anvil's main phase, after
  Tongs, on which it depends), long before the game is ready.
- A game that ends through **Exit to Main Menu** starts itself again as a
  child process with the same command line and environment (live check H6),
  so the child's plugin serves the same pipe name for the same session id.
  The extension tells the two apart by `pid` and `process_start_ms`.
- Without `ETCH_HOST_SESSION` the plugin logs that it is idle and opens no
  pipe. With a value that is not a session id it logs a warning and stays idle
  too. In both cases the game runs as if the plugin were not there.
- The pipe accepts local clients of the Windows user the game runs as (and
  `SYSTEM`) only. It has one instance, claimed first, so no other process can
  serve the name and a second client gets `ERROR_PIPE_BUSY` while one is
  connected. When the client disconnects, the plugin waits for the next one,
  which starts again with the handshake.

## Framing

- Byte stream, UTF-8. Each message is one JSON object (RFC 8259) on one line,
  ended by `\n`; a `\r` before it is ignored.
- A request line is at most 65,536 bytes without its `\n`. A longer one is
  answered with `line_too_long`, and the plugin then disconnects.
- Every request has `id`, a whole number from 0 to 2^53 − 1 chosen by the
  client, and `type`, a string. Unknown members are ignored, so a later
  version can add optional members without a new protocol version.
- Every request gets exactly one answer with the same `id`. The client must
  match answers by `id`: from protocol 1 on, an answer may come after the
  answer to a later request (in 1.x a ping during a preview job was answered
  at once).
- An answer has `"ok": true` and the type's members, or `"ok": false`, an
  `error` code and a human-readable `message`. When the request had no usable
  `id`, the answer's `id` is `null`.

## Handshake: `hello`

The first request on a connection. Any other type before it gets
`handshake_required`.

```json
{"id":1,"type":"hello","protocol":2}
```

```json
{"id":1,"ok":true,"protocol":2,"plugin":"2.0.0","session":"<id>","pid":12345,"process_start_ms":1761400000123,"ready":false,"frame":0,"tree":true}
```

| Member             | Meaning                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `protocol`         | the plugin's protocol version, equal to the client's                                      |
| `plugin`           | the plugin's version (`plugin/plugin.toml`, the same as the extension's)                  |
| `session`          | the session id the pipe is named after                                                    |
| `pid`              | the game process's id                                                                     |
| `process_start_ms` | its creation time in Unix milliseconds                                                    |
| `ready`            | `anvil-game.ready` was published: the main menu is up                                     |
| `frame`            | the game's frame counter (`anvil-game`'s `frame_number`), 0 before the first frame        |
| `tree`             | Tongs' `tongs.ui` service was found, so `reload` checks the stale windows                 |

The extension compares `pid` and `process_start_ms` with the process it
started before it trusts the pipe (etch#49 checks PID, path and creation time).

A different `protocol` gets `protocol_mismatch` with the plugin's `protocol`
and `plugin` members, and the plugin disconnects. A second `hello` on the same
connection gets `already_greeted`.

## Ping: `ping`

```json
{"id":2,"type":"ping"}
```

```json
{"id":2,"ok":true,"ready":true,"frame":4711,"responding":true,"busy":false,"pick":false,"game_session":{"ironman":false,"multiplayer":false,"number":1}}
```

| Member         | Meaning                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `ready`        | as in `hello`                                                                                               |
| `frame`        | as in `hello`; it stands still while a save loads (the whole load is one frame of the main loop) or saves  |
| `responding`   | the game's window takes messages (`IsHungAppWindow` is false); true while no window is found yet           |
| `busy`         | a `reload` or `save` waits for or runs on the main thread                                                   |
| `pick`         | pick mode is on                                                                                             |
| `game_session` | the game session as `anvil-game` last published it, `null` in the main menu: `ironman`, `multiplayer`, `number` (1 for the first since the start) |

The pipe thread answers without waiting for the game's main thread, so a ping
is answered while the game hangs. The extension's watchdog (etch#51) treats a
missing answer as a dead plugin, and a `frame` that stops advancing as a hung
game only while the window stops responding too, or after 5 minutes: a save
loading from the menu or through `-continue` keeps the window responding, and
the plugin's own save is `busy` (spec section 6). The live game is ready when
`ready` is true after a successful handshake.

## Jobs

`reload` and `save` run on the game's main thread, after an outer frame
(`anvil-game`'s `run_on_main_thread`), one at a time. The request is answered
once the main thread ran the job, through the overlapped pipe; pings are
answered meanwhile. A job is refused at once with:

| `error`          | When                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `not_ready`      | the game is not ready yet                                                                |
| `busy`           | another job waits or runs                                                                |
| `not_available`  | the game session is ironman (`reload does not work in ironman`) or multiplayer (`reload is not available in multiplayer`); checked again on the main thread. Etch never goes around the console's own refusal |
| `console_broken` | a console call faulted earlier in this process                                           |
| `no_main_thread` | `anvil-game` did not take the work                                                       |

A job that ran answers `ok: false` with `console_fault` when a console call
raised a structured exception (the game's state is then unknown; later jobs get
`console_broken`, and the extension restarts the game), or `no_console` when the
game's console manager does not exist yet.

### `reload`

```json
{"id":3,"type":"reload","lines":["reload provinceview.gui"],"check":["interface/provinceview.gui"],"close":[],"keep_hidden":["provinceview"]}
```

| Member        | Meaning                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `lines`       | 1–64 console lines, each `reload <name>.gui`, `reloadloc` or `reloadtexture <texture>`; anything else, among them `reload guianim`, `reload texture` and `reload assets` (H10), is `bad_request` |
| `check`       | game paths of the saved files; the top-level windows built from them are checked for stale ones     |
| `close`       | top-level windows closed with a posted Escape before the lines, when visible (an on-demand window such as `DeclareWarDialog`); the lines then wait a few frames for the key |
| `keep_hidden` | top-level windows closed again with a posted Escape after the lines, when they were hidden before and are visible now (a rebuild opens the province view, H2); the extension sends none for now (see below) |

In one job the plugin reads the top-level windows through `tongs.ui` (hidden
and stale ones too), closes the `close` windows, runs the lines (4 frames later
when it pressed a key, so that the game takes it first), closes the
`keep_hidden` windows the lines showed, and reads the windows again.

The game's console cannot close these windows: `window close` closes only
windows `window open` opened, and answered an empty failure for the province
view (live). Mouse clicks do not work either: the game's interface takes the
pointer from the real cursor (`GetCursorPos`, pick mode checks), which Etch
never moves. So the plugin posts Escape, down and up a frame apart, which closes
the topmost panel as the player's key would. In the live runs it closed nothing
while Tongs' lab input was on and event windows were open, while Tongs' own
Escape closed the province view; it is checked again before the extension
relies on it. A window
built from a `check` file before the lines whose widget id is still there
after them was not rebuilt: it is **stale** (H3). The check compares ids only;
it never trusts a liveness read of the definitions, whose memory the game
reuses.

```json
{"id":3,"ok":true,"lines":[{"line":"reload provinceview.gui","success":true,"text":"...","ms":58.9}],"closed":[],"hidden_again":["provinceview"],"tree":true,"checked":2835,"stale":[{"name":"culture_item","visible":false}],"visible":[{"name":"provinceview","file":"interface/provinceview.gui"}],"roots":{"before":3158,"after":3159},"queued_ms":12.4,"run_ms":71.2}
```

| Member              | Meaning                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| `lines`             | each line run: the line, the console's success byte, its answer text, its time    |
| `closed`            | the `close` windows that were visible and were closed                             |
| `hidden_again`      | the `keep_hidden` windows closed again                                            |
| `tree`              | the windows were read; without `tongs.ui` it is false and the next three are left out |
| `checked`           | top-level windows built from the `check` files before the lines                   |
| `stale`             | those not rebuilt, with their name and whether they are visible now               |
| `visible`           | the visible top-level windows after the job, with `name` and `file` (the game path of their definition's file): which listened files a localisation change should reload |
| `roots`             | the number of top-level windows before and after: what rebuilds leak              |
| `queued_ms`, `run_ms` | from the request to the main thread, and on it                                  |

Without `tongs.ui` every `close` window gets a console `window close` and
nothing is closed again.

### `save`

```json
{"id":4,"type":"save"}
```

```json
{"id":4,"ok":true,"success":true,"text":"Autosave command started!","ms":0.01,"queued_ms":2.6}
```

Saves the loaded game through the game's console command `autosave`, which
writes `save games/autosave.eu4` (and moves the earlier ones to
`old_autosave.eu4` and `older_autosave.eu4`) after the answer, also while the
game is paused: 0.6 s for the vanilla corpus save (62 MB of text), 0.9 s for
the Anbennar save (111 MB), live. The extension waits until the file has
changed and settled. `savegame`, which the console describes as "Creates an
savefile.", answers success and writes nothing (live). Outside a game session
it is `not_in_game`. `success` and `text` are the console's.

In one live run a game with stale windows on screen (left by a reload of
`core.gui` and `mapicons.gui`) deadlocked in `autosave`: the main thread waited
while the window kept taking messages, and no file was written. The extension
gives a save 30 s before it closes the game anyway.

## Writing from another thread

The pipe is opened for overlapped I/O, so that an answer can be written from
another thread while the pipe thread waits for the next request: the answers
to `reload`, `save` and `snapshot` are written that way, and so are the
plugin's pushes (Pick mode, below).

### `confirm`

```json
{"id":5,"type":"confirm","path":"DefaultConfirm/AgreeButton"}
```

```json
{"id":5,"ok":true,"found":true,"pressed":true,"queued_ms":16.4}
```

Answers a prompt with Enter when its button is on screen, for a start from a
save without the player: Anbennar's achievements prompt shows before a save
loads (live check H7). `path` is `DefaultConfirm/AgreeButton`, the only button
it answers; anything else is `bad_request`. On the main thread the plugin finds
a visible widget of that path through `tongs.ui` and posts Enter (down, and up
a frame later) to the game's window, which takes the dialog's default button:
the prompt closed after the first Enter in every live start. A posted mouse
click did not work (the game reads the real cursor). `found` is false while the prompt is not shown; without `tongs.ui` the
job answers `no_tree`. Unlike `reload` and `save` it is not refused in ironman
or multiplayer: the prompt comes before the game session.

## Pick mode

Pick mode (v2 specification section 7, [pick-mode-checks.md](pick-mode-checks.md))
lives in the plugin: the hotkey, the outline and label, the stack under the
pointer and the swallowed click. Etch turns it on and off, gives it the hotkey
and the names of the mods for the label, and takes picks and snapshots. It
needs `tongs.ui`; without it `pick_mode` and `snapshot` answer `no_tree`.

### `pick_mode`

```json
{"id":6,"type":"pick_mode","on":true,"key":"Ctrl+Shift+E","sources":{"interface/provinceview.gui":"P2KE Patch - Anbennar"},"editor":{"pid":4321,"title":"my-mod"},"front":true}
```

```json
{"id":6,"ok":true,"on":true,"key":"Ctrl+Shift+E","front":true}
```

Every member is optional, so one request can set the key alone.

| Member    | Meaning |
| --------- | ------- |
| `on`      | turn pick mode on (`true`) or off (`false`); `null` or absent leaves it. On needs a ready game (`not_ready`) |
| `key`     | the hotkey: Ctrl or Alt with a letter, a digit or F1–F24 (`Ctrl+Shift+E`, `Alt+F9`). It replaces the plugin's setting `pick_mode_key` until the game ends; anything else is `bad_request` |
| `sources` | the playset's interface files that a mod supplies, by game path, with the mod's name: what the label names (`<mod> › interface/<file>.gui:<line>`); a path not listed is the game's (`EU4`). It replaces the earlier list |
| `editor`  | VS Code's window, which the game brings forward after a pick: the process (`pid`, VS Code's main process, which owns its windows) and a fragment of its title (the workspace's name) |
| `front`   | bring the game's window to the front (**Etch: Toggle Pick Mode**). VS Code is the foreground process then, so the plugin's `SetForegroundWindow` may be refused under Windows' foreground lock; it then sends an Alt key from its own process and tries again. The answer's `front` says whether the game came to the front |

The answer gives the state after the request: `on` and `key`.

### What pick mode does in the game

- **Hotkey:** the plugin subclasses the game window's procedure when the game is
  ready. A key-down of the hotkey's key, not a repeat, with exactly its
  modifiers toggles pick mode and is swallowed, with its repeats, its
  character and its key-up. The modifiers count as held when `GetKeyState`
  says so or when the plugin saw their key messages (the pick mode checks
  tracked them from messages; which of the two matched is logged). Esc is
  never touched.
- **Mouse:** in pick mode every button message (down, up, double click, all
  five buttons) and both wheels are dropped, and every other mouse message is
  passed on with the `MK_*` button bits of its `wParam` cleared (H6). A left
  button down is the pick; the wheel steps through the stack. `eu4.exe`'s
  imports of `GetAsyncKeyState` and `GetKeyState` read the mouse buttons as up.
- **Every frame**, on the main thread, the plugin reads the hovered widget and
  its parents (`tongs.ui` `hovered` without paths) and hands the outline and
  label to its `IDirect3DDevice9::Present` hook: the widget outlined (red when
  stale), its top-level window dashed, the label beside the pointer (name,
  kind, size, `<mod> › <file>:<line>`, the path shortened, the place in the
  stack) and the badge "Etch pick — <key> to leave".
- **The stack:** on the first wheel turn over a widget the plugin reads the
  visible tree once: the hovered widget, then every other visible widget whose
  rectangle holds the pointer, smallest first, without top-level windows that
  cover the screen (`menubar`, `floating_buttons`, H5).
- **A click:** on the next frame the plugin reads the whole tree with hidden
  and stale widgets (paths, files, lines), takes the widget the stack points
  at, calls `AllowSetForegroundWindow(ASFW_ANY)`, brings VS Code's window
  forward (`editor`; the game is the foreground process at the click), and
  pushes `pick`, then `snapshot` of the widget's top-level window. A click with
  nothing under the pointer opens nothing. Pick mode stays on.
- The plugin logs each pick and, on leaving pick mode, the hovered read's
  median, p90 and maximum, the picks, how the hotkey was matched and how often
  the game polled a mouse button.

### `snapshot`

```json
{"id":7,"type":"snapshot","window":"provinceview"}
```

```json
{"id":7,"ok":true,"queued_ms":11.2,"window":"provinceview","file":"interface/provinceview.gui","screen":{"width":3440,"height":1440},"widgets":[{"path":"provinceview","type":"window","visible":true,"enabled":true,"checked":false,"text":null,"rect":[1200,180,620,980]}],"stale":0,"read_ms":7.1}
```

The live snapshot of a top-level window (etch#170): every widget of the
visible top-level window of that name, hidden ones too, in one `tongs.ui` read
on the main thread.

| Member      | Meaning |
| ----------- | ------- |
| `window`, `file` | the window's name and the game path of its definition's file |
| `screen`    | the game window's client size, which the preview's `resolution` selector takes |
| `widgets`   | each widget's `path` (Tongs' widget path from the window; list rows by position, `…/listbox/row[2]`), `type`, `visible`, `enabled`, `checked`, `text` (`null` for a widget without text) and `rect` (`[x, y, width, height]` in client pixels) |
| `stale`     | the stale widgets inside the window, left out |
| `read_ms`, `queued_ms` | the read on the main thread, and from the request to it |

`not_open` when no visible top-level window has that name, `stale` when the
one on screen is stale (no snapshot is taken of it).

### Pushes

The plugin writes these lines to the greeted client on its own; they have no
`id`, and an `event` member instead. A client that has not greeted gets none.

```json
{"event":"pick","seq":3,"window":"provinceview","screen":{"width":3440,"height":1440},"chain":[{"name":"tax_base_increase_button","type":"button","path":"provinceview/province_window/tax_base_increase_button","file":"interface/provinceview.gui","line":596,"rect":[1290,610,30,30],"visible":true,"stale":false}],"stack":{"index":0,"size":3},"front":true,"timing":{"click_to_frame_ms":9.4,"read_ms":15.2}}
```

| `event`     | When, and its members |
| ----------- | --------------------- |
| `pick`      | a click in pick mode: `seq` (from 1 in the process), `window` (the top-level window), `screen`, `chain` (the picked widget, then its parents up to its top-level window, each with `name`, `type`, `path`, `file` (`null` when stale or unknown), `line` (the 1-based line of the `{` that opens it, H2; 0 when unknown, as with a Tongs without `definition_line`), `rect`, `visible` and `stale`), `stack` (the picked widget's place among those under the pointer), `front` (VS Code's window was brought forward) and `timing` |
| `snapshot`  | right after a `pick`, with its `seq`: the members of a `snapshot` answer, or `"error":"stale"` when the window is stale |
| `pick_mode` | pick mode turned on or off, by the hotkey or by a `pick_mode` request: `on` |

## Error codes

| `error`              | When                                                          | Disconnects |
| -------------------- | ------------------------------------------------------------- | ----------- |
| `bad_json`           | the line is not one JSON value                                | no          |
| `bad_request`        | not an object, or `id`, `type` or a member has the wrong type | no          |
| `handshake_required` | a request other than `hello` before the handshake             | no          |
| `already_greeted`    | a second `hello` on the connection                            | no          |
| `protocol_mismatch`  | `hello` with another protocol version                         | yes         |
| `unknown_type`       | a `type` this version does not know                           | no          |
| `not_ready`, `busy`, `not_available`, `console_broken`, `no_main_thread`, `not_in_game` | a job refused (above) | no |
| `console_fault`, `no_console`, `no_tree` | a job that ran and failed (above)         | no          |
| `not_open`, `stale`  | a `snapshot` of a window that is not on screen, or is stale   | no          |
| `line_too_long`      | a line over 65,536 bytes                                      | yes         |
