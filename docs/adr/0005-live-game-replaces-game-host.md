# The live game replaces the game host; 2.0.0 drops the second backend and the diff view

Etch 2.0.0 has one preview, the offline renderer. The game host (a hidden copy
of the game in the main menu that draws a renamed copy of the previewed
window), the preview's backend switch and the diff view leave the product,
together with the preview copies, the overlay mod, the plugin's `job` request
and its frame capture, and the checks built on them: H1, the game host's
corpus and budget runs, `compare --game-host` and the game host half of the
playset check. Their place is taken by the live game: Etch starts its private
copy of the game with the edited mod's playset, the user plays it, and a saved
file is reloaded into the game's own window, with its real data (the v2 map,
etch#151).

We chose this over keeping the game host beside the live game, because on the
Anbennar playset it was of little use to a mod author: in the main menu no
game code runs, so nested windows the code hides draw over the rest (1 of 11
corpus views matched the captures, against 11 of 11 for the offline renderer),
and keeping it would mean two game processes, two protocols and a diff view
that mostly shows the main menu's missing code. We kept what is not tied to
the main menu: the private install (the junction copy, the pinned `eu4.exe`
and builds, the allow-list of plugins, removal that never follows a
junction), the process's lock, identity checks and stop, the session pipe's
`hello` and `ping`, the watchdog, and reading the game's `error.log` into the
Problems panel. This partly supersedes ADR 0003: reloading the real `.gui`
files and showing the game's own window, rejected there, are what the live
game does.

## Consequences

- The game host is removed on `main` as the first step of v2; fixes for 1.x
  come from a `release/1.x` branch cut at `v1.0.1` until 2.0.0 is released,
  and none after. Users who want the game host stay on 1.0.x.
- 2.0.0 removes a 1.x game host install on its first activation, through the
  same removal, and says so once; the live game asks for its own confirmation
  at its first start, because it runs in the foreground, takes the player's
  `settings.txt` and copies their saves.
- `game-original-differs` stays and matters more: when a later mod has a file
  at the edited file's path, saving it changes nothing in the live game.
- The plugin's protocol goes to version 2 with the live game's first request.
- `docs/game-host.md` stays as the record of 1.x; the v2 specification names
  the sections that still hold. The README, the extension's store page and the
  Etch site change with the 2.0.0 release, not before.
