# The live game's session pipe

Etch's Anvil plugin (`plugin/`) is the live game's end of a private pipe; the
extension is the other end (ADR 0005; in Etch 1.x the game host's, ADR 0003). This page is the contract between them:
the extension's client (etch#49) and the plugin are written against it, and a
change to it changes `kProtocolVersion` in
[`plugin/src/protocol.hpp`](../plugin/src/protocol.hpp) when an older peer
would misread it. The extension and the plugin ship together in one VSIX
(ADR 0004), so a peer of another version is refused, not negotiated with.

Protocol version: **1**. It has the handshake and the ping. Etch 1.x's
preview job (`job`, etch#50) and its frame capture are gone (ADR 0005): a `job`
now gets `unknown_type`. Their description is in this page's history on
`release/1.x`. The protocol goes to version 2 with the live game's first
request (v2 specification section 6).

## Finding the pipe

- For every start of the live game the extension draws a fresh **session id**: 128
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
  answer to a later request (in 1.x a ping during a preview job was answered
  at once).
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
pings as a hung game. The live game is ready when `ready` is true after a
successful handshake.

## Writing from another thread

The pipe is opened for overlapped I/O, so that an answer can be written from
another thread while the pipe thread waits for the next request: 1.x's preview
job answered that way, and the live game's pushes will (v2 specification
section 6).

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
