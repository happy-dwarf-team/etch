# The game host install

The game host (spec section 4, ADR 0003) runs from Etch's private copy of the
game, the **game host install**, never from the player's own game folder or
profile. The extension creates it on first use, after one confirmation, and
**Etch: Remove the Game Host Install** removes it.
`packages/extension/src/game-host/install.ts` implements it (etch#48).

## Layout

It lives in the extension's global storage, under `game-host/`:

| Path | What it holds |
| --- | --- |
| `etch-game-host.json` | the record that marks the folder as Etch's install and names the game folder it copies; written first and removed last |
| `game/` | the junction copy: every folder of the game folder is a junction to it, every top-level file a copy; it is the game host's working directory |
| `game/version.dll`, `game/anvil/` | the pinned builds of Anvil, `anvil-game`, Bellows and Etch's plugin, from the VSIX's `game/` (pins/README.md) |
| `profile/` | the private profile, passed as `-userdir=<profile>/` |
| `overlay/` | Etch's overlay mod: `descriptor.mod`, the backdrop's `interface/etch_backdrop.gfx` and textures, and the preview copies while the game host runs |

The copy leaves out the launcher installer (`launcher-installer-*.msi`),
`console_history.txt`, and `version.dll` and `anvil/` if the player has Anvil
in the game folder: the install takes Anvil only from the VSIX. Its
`userdir.txt` is empty, so that `-userdir` alone names the profile.

## Before every start

`prepareInstall` brings the install up to date and refuses to go on when it
cannot be trusted:

1. It hashes the game folder's `eu4.exe` and refuses any build but the one
   `game/manifest.json` pins (1.37.5, SHA-256 `9AD3EFE1…D771A`), before it
   creates or changes anything.
2. It points every junction at the current game folder (`etch.gamePath` may
   have changed), drops junctions to folders the game no longer has, and copies
   again every top-level file whose size or modification time differs from the
   original's. Files the game writes into its folder at run time stay.
3. It hashes every pinned file in the install. A missing or changed one is
   copied again from the VSIX, after the VSIX's own copy is checked against
   the manifest; a damaged VSIX is refused. Anything in `anvil/plugins/` that
   the manifest does not list is removed, so no other plugin loads into the
   game host. `anvil/anvil.log` and `anvil/data/`, which Anvil and its plugins
   write, stay.
4. It hashes the install's `eu4.exe` again: it must be the pinned build.
5. It writes the overlay mod's descriptor and backdrop files and deletes the
   preview copies (`interface/etch_*.gui`, `interface/etchw_*.gui`).
6. It writes the private profile: one descriptor per playset mod in
   `mod/mod-NNN.mod`, then `mod/overlay.mod`, and `dlc_load.json` with them in
   that order and no DLC disabled, so every DLC the player owns is on.

A playset mod's descriptor is its own (the profile's `.mod` or the mod
folder's `descriptor.mod`) with `path` and `archive` replaced by the mod's
absolute folder, so its name, `dependencies` and `replace_path` stay; a mod
without one gets its name and folder.

## Removal

Removal deletes the install folder entry by entry. A junction is removed as a
link, never followed, so nothing in the game folder is touched; the unit tests
check that the game folder is unchanged after creation, every start and
removal. A folder without the record is left alone, and so is a storage
folder that already holds anything else when the install would be created.

## What the install never does

- It writes only inside the install folder. The game folder, the player's
  profile and the mods are read: the copy's files, the descriptors and the
  junction targets.
- It never changes `eu4.exe`: the install's `eu4.exe` is a byte-for-byte copy
  that is checked against the pin before every start.
