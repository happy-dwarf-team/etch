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

**Code-filled content**:
What the game's own code puts into a window at run time: hidden or moved
widgets, list entries, values and text that depend on game data.
_Avoid_: dynamic content, runtime data

**Sample data**:
Hand-written stand-in values for code-filled content, used so a layout preview
can show a plausible window.
_Avoid_: mock data, fixtures

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

## Backends

**Preview backend**:
What actually produces the image behind the one preview the editor shows.
_Avoid_: renderer (when the game is meant), engine

**Offline renderer**:
The preview backend that draws windows from the mod's files alone, with no game
running.
_Avoid_: emulator, standalone renderer

**Game host**:
The preview backend in which a running copy of the game draws the window and
reloads it when the mod's files change.
_Avoid_: live mode, emulator

**Game host install**:
Etch's private copy of the game, with its own user profile, in which the game
host runs; never the player's own installation or profile.
_Avoid_: game copy, sandbox

**Overlay mod**:
Etch's own mod, loaded by the game host after the playset, that carries the
versions of interface files being previewed.
_Avoid_: temp mod, shadow mod

**Preview copy**:
A copy of an edited interface file, with its file and window names prefixed,
kept in the overlay mod so the game host can reload it without disturbing the
game's own windows.
_Avoid_: shadow file, temp file

**Precision corpus**:
The set of game windows rendered by the offline renderer and compared with the
same windows captured from the game, which measures how faithful the offline
renderer is.
_Avoid_: golden set, test suite

## Measuring precision

**Playset**:
The ordered set of mods, each at a pinned version, loaded on top of the game.
Previews and captures are comparable only within one playset.
_Avoid_: mod list, load order

**Capture**:
One window as the game drew it, its widget tree and its pixels, at one
resolution, with one playset and one game build.
_Avoid_: screenshot, golden image

**Known deviation**:
A difference between the offline renderer and a capture that is accepted for
now and tracked by its own issue.
_Avoid_: exception, waiver, allowlist
