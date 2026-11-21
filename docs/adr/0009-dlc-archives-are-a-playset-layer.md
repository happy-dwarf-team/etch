# The DLC archives are a layer of the playset

**Status: proposed** (draft, 21 November 2026). Nothing below is built yet.

Etch's `GameFiles` reads the game folder and the mods. The game also reads its
DLC archives, and Etch does not. In EU4 1.37.5, `dlc/*/*.zip` and
`builtin_dlc/*/*.zip` hold 129 archives (1.8 GB). Their `interface/*.gfx`
files define 2,302 sprites that no `.gfx` file of the game folder defines.
Vanilla events name 477 pictures. 358 of them have no sprite in the game
folder's `.gfx` files, and 304 of those 358 are defined in a DLC archive,
each with its texture in an archive. So a sprite hover on a vanilla event
picture usually says "no sprite", and the preview cannot draw a window that
names a DLC's sprite.

We propose that `GameFiles` gets one more kind of layer: the archives of the
DLCs the player has on, read in place, never unpacked to disk.

- **Which DLCs.** Each `dlc/<folder>/<name>.dlc` names its `archive`. The
  player's `dlc_load.json` lists `disabled_dlcs`. Etch reads every DLC of the
  game folder that the list does not disable, and every `builtin_dlc`
  archive. It does not read ownership. Whether the game folder holds the
  archives of a DLC the player does not own is not checked.
- **Where in the order.** Between the game folder and the first mod, so a
  mod's file still wins. After-v2 gives the order as mods, then DLC, then
  the game folder. That is not yet checked in the game (see the gate). For
  vanilla the order between the archives and the game folder hardly matters:
  of the archives' files, 49 have a path the game folder also has, and 48 of
  those are identical to the game folder's (the other is
  `localisation/127_l_french.yml`). 31 paths are in two archives, such as
  shared unit meshes; Etch takes the archives in the order of their folder
  names.
- **How.** The core reads a zip's central directory once per archive and
  inflates an entry on demand (`node:zlib`'s raw inflate, no native module,
  as ADR 0001 asks). A file from an archive has no path on disk, so its
  `GameFile` names the archive and the entry, and consumers read it through
  `GameFiles.read`. Today 27 source files use `absolutePath` directly; each
  either moves to `read` or keeps archive files out.
- **What shows.** A hover names the DLC, as it names a mod today. Go to
  Definition on a sprite of an archive opens a read-only view of the `.gfx`
  entry. Find All References lists it. Rename refuses it, as it refuses the
  game's files.

## Why

The game draws from the archives, so Etch's answers differ from the game's
wherever a DLC's file is involved: event pictures, DLC unit and map assets,
DLC interface sprites. We chose reading in place over unpacking to a cache,
because unpacking 1.8 GB on first use would cost disk and time for a few
hundred files the editor ever opens. We chose the player's `dlc_load.json`
over "all archives", because a modder may test with a DLC off, and the game
reads that same list.

## Consequences

- The playset's indexes (interface, localisation, textures) take the
  archives' files. Their budgets in [docs/budgets.md](../budgets.md) are
  measured again on Anbennar with every DLC on.
- The renderer can draw a DLC's sprites, so the precision corpus may change
  for windows that name them. Each change is checked against the game, as
  ADR 0002 asks.
- Diagnostics of a missing sprite or texture in `.gui` files can then count
  the archives. A script name with no sprite still gets a hover, not a
  diagnostic, until the 54 vanilla pictures that nothing defines are
  understood.

## Gate

Before the layer is built, one live run checks that a mod wins over an
archive. A test mod redefines one DLC sprite, and the run checks which
texture the game draws. A second check is a DLC that `dlc_load.json`
disables: its sprite must not be drawn.
