# The game host's session pipe

Etch's Anvil plugin (`plugin/`) is the game host's end of a private pipe; the
extension is the other end (ADR 0003). This page is the contract between them:
the extension's client (etch#49) and the plugin are written against it, and a
change to it changes `kProtocolVersion` in
[`plugin/src/protocol.hpp`](../plugin/src/protocol.hpp) when an older peer
would misread it. The extension and the plugin ship together in one VSIX
(ADR 0004), so a peer of another version is refused, not negotiated with.

Protocol version: **1**. It has the handshake, the ping and the preview job
(etch#50), which came as a new request type without a new version.

## Finding the pipe

- For every game host start the extension draws a fresh **session id**: 128
  random bits as 32 lowercase hex digits (`[0-9a-f]{32}`).
- It starts `eu4.exe` with the environment variable `ETCH_HOST_SESSION` set to
  that id.
- The plugin serves `\\.\pipe\etch-host-<id>`. The pipe is up a fraction of a
  second after the process starts (the plugin loads in Anvil's early phase),
  long before the game is ready.
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
  answer to a later request (a ping during a preview job is answered at once).
- An answer has `"ok": true` and the type's members, or `"ok": false`, an
  `error` code and a human-readable `message`. When the request had no usable
  `id`, the answer's `id` is `null`.

## Handshake: `hello`

The first request on a connection. Any other type before it gets
`handshake_required`.

```json
{"id":1,"type":"hello","protocol":1}
```

```json
{"id":1,"ok":true,"protocol":1,"plugin":"0.3.0","session":"<id>","pid":12345,"process_start_ms":1761400000123,"ready":false,"frame":0}
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
{"id":2,"ok":true,"ready":true,"frame":4711}
```

The pipe thread answers without waiting for the game's main thread, so a ping
is answered while the game hangs. The extension's watchdog (etch#51) treats a
missing answer as a dead plugin and a `frame` that stops advancing between
pings as a hung game. The game host is ready when `ready` is true after a
successful handshake.

## Preview job: `job`

One preview job of spec section 4: the extension has written both preview
copies into the overlay mod, and the plugin shows them and captures them.

```json
{"id":3,"type":"job","reload":["etch_goto.gui","etchw_goto.gui"],"textures":["gfx//interface//goto_bg.tga"],"localisation":false,"black":"etch_goto_box_backdrop","white":"etchw_goto_box_backdrop","crop":{"x":165,"y":215,"width":333,"height":454},"output":"C:\\Users\\me\\AppData\\Roaming\\Code\\User\\globalStorage\\happy-dwarf-team.etch\\captures\\job-3.tga"}
```

| Member         | Meaning                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `reload`       | the copies' file names, for `reload`; 1 to 64                                                        |
| `textures`     | optional: `texturefile` values as the `.gfx` writes them, for `reloadtexture` (textures saved to disk) |
| `localisation` | optional: `true` adds `reloadloc` (a localisation file was saved)                                    |
| `black`        | the wrapper window of the copy over black, for `window open`                                         |
| `white`        | the wrapper window of the copy over white                                                            |
| `crop`         | the screen rectangle to capture, from the offline renderer's layout; sides from 1 to 16,384          |
| `settle_ms`    | optional: capture no earlier than this many milliseconds after each wrapper opens, for a window with a show animation; 0 to 5,000 |
| `output`       | where the image goes: an absolute path ending in `.tga`                                              |

The job runs in steps, each where the game allows it:

1. **Main thread, after the next frame** (`anvil-game`'s `run_on_main_thread`):
   `window close` of the wrapper the last job left open (a reload of an open
   window's file crashes the game, etch#22), `reload` of each copy,
   `reloadtexture` of each texture, `reloadloc` when asked, then
   `window open <black>`. The plugin calls the game's console dispatcher
   itself, as Tongs does, because the main menu has the console but no game
   session (etch#21).
2. **The next `IDirect3DDevice9::Present`** (the first one `settle_ms` after
   the open): a `StretchRect` of the crop,
   clamped to the back buffer, into a render target of its size and a readback
   of only that. No full-frame readback.
3. **Main thread**: `window open <white>`, which also closes the black wrapper
   (the console keeps one window open).
4. **The next Present**: the same crop over white.
5. **A worker thread**: straight colour and alpha from the two crops (etch#22):
   over black B = c·a, over white W = c·a + 255·(1 − a), so per pixel
   a = 255 − (W − B), averaged over the three channels and rounded, and
   c = B · 255 / a, rounded. It writes them to `output` as an uncompressed
   32-bit TGA, rows top first, which the webview draws like any texture.

The answer comes when the job ends, usually after the answers to later pings:

```json
{"id":3,"ok":true,"output":"C:\\Users\\me\\...\\captures\\job-3.tga","crop":{"x":165,"y":215,"width":333,"height":454},"frames":{"black":5120,"white":5121},"ms":{"queued":3.1,"commands":18.4,"black":6.2,"white":6.9,"recover":0.4,"write":0.3,"total":38.2},"commands":[{"line":"reload etch_goto.gui","success":true,"text":"etch_goto.gui reloaded!","ms":7.9}]}
```

| Member     | Meaning                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `output`   | the image's path, as asked                                                                                 |
| `crop`     | the rectangle captured: the request's, clamped to the back buffer; the image's size                        |
| `frames`   | the frame counter when each crop was taken                                                                 |
| `ms`       | waiting for the main thread, step 1's console calls, each capture (from its window opening), the recovery, the file, and the whole job |
| `commands` | every console line the job ran, with the dispatcher's success byte, its answer and its time                |

A failed job answers `"ok": false` with its `error`, `message`, `ms` and
`commands`. A `reloadtexture` or `reloadloc` the game refuses does not fail
the job; its answer is in `commands`. One job runs at a time.

The pipe is opened for overlapped I/O, so that a job's answer is written from
a worker thread while the pipe thread waits for the next request.

## Error codes

| `error`              | When                                                          | Disconnects |
| -------------------- | ------------------------------------------------------------- | ----------- |
| `bad_json`           | the line is not one JSON value                                | no          |
| `bad_request`        | not an object, or `id`, `type` or a member has the wrong type | no          |
| `handshake_required` | a request other than `hello` before the handshake             | no          |
| `already_greeted`    | a second `hello` on the connection                            | no          |
| `protocol_mismatch`  | `hello` with another protocol version                         | yes         |
| `unknown_type`       | a `type` this version does not know                           | no          |
| `line_too_long`      | a line over 65,536 bytes                                      | yes         |

A `job` can also get these:

| `error`               | When                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `not_ready`           | before `anvil-game.ready`, or the main thread takes no work                                |
| `no_capture`          | the game's Direct3D 9 device was not hooked (see `anvil.log`)                              |
| `busy`                | another job runs (one Etch stopped waiting for)                                            |
| `console_unavailable` | the game's console manager is not set up                                                   |
| `reload_failed`       | the game refused a `reload`; the message has its answer                                    |
| `open_failed`         | the game refused a `window open`                                                           |
| `capture_timeout`     | no Present drew the opened wrapper within 10 frames after it was due                       |
| `capture_failed`      | the crop lies outside the back buffer, the back buffer is not 32-bit, or the copy failed   |
| `write_failed`        | the image cannot be written                                                                |
| `game_fault`          | a console call raised a structured exception; the plugin refuses every later job, and the game host must be restarted |
