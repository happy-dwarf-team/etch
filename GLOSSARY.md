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

**Precision corpus**:
The set of game windows rendered by the offline renderer and compared with the
same windows captured from the game, which measures how faithful the offline
renderer is.
_Avoid_: golden set, test suite
