# The game checks script files: its own parser's errors go to Problems

**Status: accepted** (22 November 2026; proposed as a draft for v3 on 21
November 2026). Both parts are built for 2.14.0: part 1 in etch#570 (with
etch#582), part 2, after the vanilla gate run, in etch#579 (with etch#588).
The third part H4 asked about is not built (see the gate).

Etch reports the game's own verdict on a mod's script files, the `.txt` files
of `events/`, `decisions/`, `missions/` and `common/`, and its `.yml`
localisation. It writes no rules of its own: what the game reports is
what Etch shows. There are two parts, both in the live game (ADR 0005):

1. **The start report.** At each start of the live game (the first one, a
   planned restart, a restart after a crash) Etch reads the `error.log` lines
   the game wrote before it took input. Each line that names a file of the mod
   project goes to Problems on that file, with the source "Etch game start".
   A line that gives the file's line (`file: … line: N`, `File: "…" … near
   line: N`) goes on that line. A line that names only a key (`Unknown
   province-modifier in a trigger <key>`) goes on the first occurrence of the
   key in the mod's files, or into the summary when there is none. Lines of
   other mods of the playset and of the game are counted in the summary and
   are not shown as problems. Repeats are collapsed as for reloads. The next
   start replaces the report.
2. **Check File in the Live Game.** On request, and optionally on save, Etch
   reads the file's trigger and effect blocks with its own parser (the one
   with source ranges): `trigger`, `potential`, `allow`, `limit`,
   `immediate`, `after`, `option`, `effect` and their kin, chosen by the
   file's folder as the script profile's CodeLenses already are. It wraps
   them so that nothing runs. A trigger block becomes `if = { limit = {
   always = no <trigger> } }`; an effect block becomes `if = { limit = {
   always = no } <effects> }`. Then it runs the wrapped file through the
   plugin's existing `run` job ([plugin-protocol.md](../plugin-protocol.md)).
   The `error.log` lines of the run go to Problems on the file, with the
   source "Etch game check". A line's `near line: N` is mapped back through
   the wrapper to the line it came from, as Run selection already does for
   its one wrapper. A check never changes the game and is not a Run mark.

Lines without a file are common at start. In a player profile with an
Anbennar playset, 61 lines held 2 with a file and a line
(`windowtype.cpp:809`, `persistent.cpp:88`), and 8 that named only a
modifier (`triggerimplementation.cpp:17071`), all from one key. This is the
reason for the key search in part 1.

We chose the game's own parser over writing rules of our own, embedding
CWTools or calling foch:

- **Rules of our own** would repeat CWTools' work since 2018 and would still
  only approximate the game.
- **CWTools** is MIT, but its library needs the .NET runtime, which ADR 0001
  (TypeScript only, no native modules) keeps out of the VSIX. Its EU4 rules
  had their last substantive merge on 15 April 2026.
- **foch** is AGPL-3.0, which ADR 0004 keeps out of the VSIX.

The game is the only checker that is right for 1.37.5 by definition, and
Etch already starts it, owns the `run` job and reads `error.log`
([live-game.md](../live-game.md), "`error.log`"). The v2 principle "No
language server" stands: this is a source of diagnostics, not a server.

## What the game reports, and what it does not

Verified (Run selection's live run of 12 November 2026, vanilla and
Anbennar, [live-game.md](../live-game.md)):

- An unknown effect writes `Unknown effect type. Key: …, near line: N`.
- An unknown trigger writes `Unknown trigger type. Key: …, near line: N`
  and counts as true.
- `add_treasury = lots` and a block that does not close write nothing. Etch
  refuses the second before the game sees it, as Run selection does, and
  reports it itself as a syntax error.

So a check finds unknown keys and what the game's parser refuses. It does not
find wrong values, wrong scopes or missing localisation. CWTools stays the tool
for those, and both may report the same unknown key under their own sources.

Hypotheses, to be checked by the gate:

- **H1:** the game parses the effects of an `if` whose `limit` is false and
  logs their unknown keys. They are logged when the run file is read, not
  when its effects run.
- **H2:** a trigger after `always = no` in a `limit` is parsed and logged even
  though it is not evaluated.
- **H3:** a block run in the player's country scope logs the same parse errors
  as in its own scope (a province trigger in a country `limit`), or it
  logs none of the scope's own errors. Either way it adds no false ones.
- **H4:** `validateevents` and `verify_loc`, named on the EU4 wiki's console
  page (last checked for 1.28 and 1.30), exist in 1.37.5 and write lines worth
  a third part. Today the plugin refuses every console line except
  `reload`, `reloadloc`, `reloadtexture` and `run`, so this would need a
  plugin change of its own.

## Consequences

- Both parts need the live game. A headless check (v2's "Not in v2") stays
  later.
- Part 1 needs no plugin change. It reads lines the game writes today, at a
  moment the live game already detects (ready: the native marker and
  `Running application`).
- Part 2 reuses the `run` job and its refusals: ironman, multiplayer, the main
  menu, one job at a time behind reloads. If H1 fails, part 2 is not built,
  and the start report, after a planned restart, is the way to check a script
  file.
- An event's keys outside trigger and effect blocks (`id`, `title`,
  `picture`, `is_triggered_only`) are not checked by part 2. Part 1 reports
  them when the game does.
- The core gets the parsers of both line shapes and the wrapper's line map,
  with unit tests from real lines. The extension gets the command, the
  setting for checking on save (off by default) and the two Problems
  sources.

## Gate

One live run under the EU4 engine lab's procedure, before part 2 is built.
It needs a vanilla save and an Anbennar save, and a test mod with deliberate
errors: an unknown effect, an unknown trigger, an unknown modifier, a wrong
value type, a province trigger in a country file, and a localisation key with
a character Windows-1252 lacks. The run records which errors the start report
shows and which a check shows, and on which line. It settles H1–H4 and goes
into [live-game.md](../live-game.md) as Run selection's run did.

**Gate run, 21 November 2026, vanilla**
([live-game.md](../live-game.md#the-script-check-the-gate-run-adr-0007)):

- **H1 holds.** A false `if`'s unknown effect and unknown modifier name are
  logged with their line, and nothing in it runs. Part 2 can be built as
  written.
- **H2 holds for unknown trigger keys.** It does not hold for an unknown
  modifier name in a trigger.
- **H3: no scope errors, and no false ones.** A check finds wrong scopes no
  more than the start report does.
- **H4 is not tested in this run** (see "H4" below).
- **The start report** placed all five of the test mod's lines once etch#570
  split the game's multi-line parsing errors.

**Anbennar run, 21 November 2026**, after part 2 was built
([live-game.md](../live-game.md#check-file-in-the-live-game-adr-0007-part-2)):
Anbennar, P2KE and its patch, with the test mod as the edited mod, on the
Verne 1444.11.11 save.

- **The start report** placed the test mod's lines as on vanilla; the
  playset's other 10,877 lines name no file of the edited mod.
- **Check File** placed the test files' errors on the same lines as on
  vanilla, and found nothing in 557 blocks of four of Anbennar's own files:
  no false error on a large mod's script.
- **A glued line:** the game once wrote a message without its line end, so the
  next one went on in the same line. etch#582 splits such lines.

**H4, 21 November 2026** (vanilla, the Russia 1719 save; the console lines
sent through the lab's Tongs, not through Etch's plugin):

- **Both commands exist** in 1.37.5. The game's `help` describes
  `validateevents` as "Validates all events without triggering it" and
  `verify_loc` as "Verifies the localization keys".
- **`validateevents`** answered in 8 ms with no text and wrote 9 lines:
  `Undefined event target: …` and its tooltip for three targets, and three
  `Trigger condition set on the wrong scope`. None names a file, an event id
  or a line.
- **`verify_loc`** wrote 23,553 lines, one per key: `l_spanish: <key>
  missing`, for Spanish only, naming no file.
- **So no third part for now.** Neither command says where the problem is
  written. `verify_loc` reports translations that a mod does not ship, rather
  than errors. The start report and Check File already place every line that
  names a file or a key the mod writes.
