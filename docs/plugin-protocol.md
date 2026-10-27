# The live game's session pipe

Etch's Anvil plugin (`plugin/`) is the live game's end of a private pipe; the
extension is the other end (ADR 0005; in Etch 1.x the game host's, ADR 0003). This page is the contract between them:
the extension's client (etch#49) and the plugin are written against it, and a
change to it changes `kProtocolVersion` in
[`plugin/src/protocol.hpp`](../plugin/src/protocol.hpp) when an older peer
would misread it. The extension and the plugin ship together in one VSIX
(ADR 0004), so a peer of another version is refused, not negotiated with.

Protocol version: **2**, the live game's (v2 specification section 6): the
handshake, the ping, and the two jobs the plugin runs on the game's main
thread, `reload` and `save`. Protocol 1 was Etch 1.x's game host: its preview
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
{"id":2,"ok":true,"ready":true,"frame":4711,"responding":true,"busy":false,"game_session":{"ironman":false,"multiplayer":false,"number":1}}
```

| Member         | Meaning                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `ready`        | as in `hello`                                                                                               |
| `frame`        | as in `hello`; it stands still while a save loads (the whole load is one frame of the main loop) or saves  |
| `responding`   | the game's window takes messages (`IsHungAppWindow` is false); true while no window is found yet           |
| `busy`         | a `reload` or `save` waits for or runs on the main thread                                                   |
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
| `close`       | top-level windows closed through the game (`window close`) before the lines, when visible (an on-demand window such as `DeclareWarDialog`) |
| `keep_hidden` | top-level windows closed again after the lines when they were hidden before and are visible now (a rebuild opens the province view, H2) |

In one job the plugin reads the top-level windows through `tongs.ui` (hidden
and stale ones too), closes the `close` windows, runs the lines, closes the
`keep_hidden` windows the lines showed, and reads the windows again. A window
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

Without `tongs.ui` every `close` window gets a `window close` (closing a
window that is not open does nothing) and nothing is closed again.

### `save`

```json
{"id":4,"type":"save","name":"etch-restart"}
```

```json
{"id":4,"ok":true,"success":true,"text":"...","ms":812.5,"queued_ms":16.1}
```

Saves the loaded game through the game's console, `savegame <name>`, into the
profile's `save games/`. `name` is 1–64 letters, digits, `_` or `-`, without
`.eu4`; anything else is `bad_request`. Outside a game session it is
`not_in_game`. `success` and `text` are the console's; `ms` is the save on the
main thread.

## Writing from another thread

The pipe is opened for overlapped I/O, so that an answer can be written from
another thread while the pipe thread waits for the next request: the answers
to `reload` and `save` are written that way, and pick mode's pushes will be
(v2 specification section 7).

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
| `console_fault`, `no_console` | a job that ran and failed (above)                    | no          |
| `line_too_long`      | a line over 65,536 bytes                                      | yes         |
