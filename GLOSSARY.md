# Etch

Etch previews Europa Universalis IV interface mods while they are edited and
checks how closely that preview matches the game.

## Previews

**Faithful preview**:
An image of a window that matches the game pixel for pixel at the same
resolution, with the same game data (save, country, province) and the same set
of mods.
_Avoid_: exact preview, WYSIWYG

**Layout preview**:
An image of a window's skeleton as the interface files define it: positions,
sizes, sprites and static text, without content the game's code fills in.
_Avoid_: draft preview, mockup

**Previewed window**:
The top-level window the preview shows: the one that contains the cursor in
the edited file, or the one the user pinned.
_Avoid_: current window, active window

**Offline renderer**:
What draws the preview from the mod's files alone, with no game running.
_Avoid_: emulator, standalone renderer, backend

**Code-filled content**:
What the game's own code puts into a window at run time: hidden or moved
widgets, list entries, values and text that depend on game data.
_Avoid_: dynamic content, runtime data

**View**:
One situation of a window as the game shows it: which of its nested windows
and widgets are visible, such as a province view of the player's own province,
of a foreign province or of a state.
_Avoid_: state (a group of provinces in the game), mode, layer

**Window profile**:
What Etch knows about one game window beyond its interface files: its views,
when the game shows each of them, and where the content of each widget the
game's code fills comes from.
_Avoid_: catalog entry, schema, binding

**Sample data**:
Stand-in values for code-filled content, such as text of a chosen length, used
so a layout preview can show a plausible window; written by hand, generated or
taken from the game.
_Avoid_: mock data, fixtures, placeholders

**Warm reload**:
Redrawing a window in the preview after one of its files changes, while the
sprites, textures and fonts it uses are already loaded.
_Avoid_: refresh, rerender

**Cold open**:
The first preview of a window, including loading the mod's sprite index and the
textures and fonts that window uses.
_Avoid_: first load, startup

## Files

**Game text**:
The characters the game reads from an interface or localisation file: the
file's bytes, as they are on disk or as the next save from the editor would
write them, read the way the game reads them (Windows-1252 for interface files,
UTF-8 for localisation).
_Avoid_: decoded text, buffer text

## The live game

**Live game**:
The game Etch starts from its private install with the edited mod's playset,
which the user plays while Etch reloads the files they save into it.
_Avoid_: game host, play mode, hot reload mode

**Planned restart**:
A restart of the live game that Etch asks the player for, from a save the live
game makes just before it, so that no play is lost; unlike the restart after a
crash, which goes back to the newest save there is.
_Avoid_: forced restart, hard reload, reboot

**Private install**:
Etch's private copy of the game, with its own user profile, in which the live
game runs; never the player's own installation or profile.
_Avoid_: game host install, game copy, sandbox

**Pinned build**:
One release of a game-side tool (Anvil, Bellows), identified by its hash, that
an Etch release carries and puts into the private install; never a newer or
locally built copy.
_Avoid_: vendored copy, bundled dependency, latest build

## Measuring precision

**Precision corpus**:
The set of game windows rendered by the offline renderer and compared with the
same windows captured from the game, which measures how faithful the offline
renderer is.
_Avoid_: golden set, test suite

**Playset**:
The ordered set of mods, each at a pinned version, loaded on top of the game.
Previews and captures are comparable only within one playset.
_Avoid_: mod list, load order

**Capture**:
One window as the game drew it, its widget tree and its pixels, at one
resolution, with one playset and one game build.
_Avoid_: screenshot, golden image

**Recipe**:
The keys and clicks that open one state of a corpus window from a known start
(the main menu, or the playset's save loaded and paused), without game calls.
_Avoid_: script, macro

**Unstable pixel**:
A pixel of a capture that was not the same in every screenshot of it, because
the game animates what is under it (the main menu's background, the map); the
comparison never uses it.
_Avoid_: noisy pixel, flicker

**Known deviation**:
A difference between the offline renderer and a capture that is accepted for
now and tracked by its own issue.
_Avoid_: exception, waiver, allowlist

## Media

**Demo mod**:
The mod Etch's media show being edited; our own files, drawn with the game's
art.
_Avoid_: sample mod, test mod, fixture

**Scene**:
One named shot (`hero`, `preview`, …) that the script captures; its id appears
in the bucket key, the file name and the media manifest.
_Avoid_: shot, clip

**Media refresh**:
Capturing Etch's media for one Etch release and publishing them: loops to the
media bucket; posters, stills and the media manifest to the Etch site.
_Avoid_: media update, re-record

## Etch 1.x

Terms of Etch 1.x, which 2.0.0 removes (ADR 0005). The v1 specification and
`docs/game-host.md` use them.

**Preview backend**:
What actually produced the image behind the one preview the editor showed: the
offline renderer or the game host.
_Avoid_: renderer (when the game is meant), engine

**Game host**:
The preview backend in which a hidden copy of the game, sitting in the main
menu, drew a renamed copy of the previewed window and reloaded it when the
mod's files changed.
_Avoid_: live game, live mode, emulator

**Game host install**:
The private install as Etch 1.x laid it out for the game host.
_Avoid_: game copy, sandbox

**Diff view**:
A way of showing the previewed window as the per-pixel difference between the
offline renderer's image and the game host's, at the same resolution and with
the same playset.
_Avoid_: comparison mode, overlay

**Overlay mod**:
Etch's own mod, loaded by the game host after the playset, that carried the
preview copies and the backdrop.
_Avoid_: temp mod, shadow mod

**Preview copy**:
A copy of an edited interface file, with its file and window names prefixed,
kept in the overlay mod so the game host could reload it without disturbing
the game's own windows.
_Avoid_: shadow file, temp file
