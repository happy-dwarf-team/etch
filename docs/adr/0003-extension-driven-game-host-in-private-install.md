# Extension-driven game host in a private game install, previewing renamed copies

The game host is a disposable game process that the extension starts, owns and
stops. It runs from a game host install (a junction copy of the game with
Anvil and Etch's plugin inside and its own user profile), sits in the main
menu with no save, and loads the playset followed by Etch's overlay mod. The
extension alone detects changes, from the editor buffer and from disk; for the
previewed window it writes a preview copy (`etch_<file>.gui` with prefixed
window names) into the overlay mod and sends one job over a per-session named
pipe: `window close`, `reload`, `window open`. Etch's plugin only executes
jobs, captures the frame in which the window is drawn, and writes the cropped
pixels to a file the webview reads itself. A `.gfx` or font change, a crash or
a hang restarts the process.

We chose this over installing Anvil in the player's Steam folder (the proxy
`version.dll` would load into every game the player starts), over swapping
`dlc_load.json` and `settings.txt` in the shared profile for each session
(fragile when VS Code or the game dies, and it blocks normal play), over a
file watcher in the plugin (only the extension knows the previewed window, the
unsaved buffer and when a change needs a restart), over reloading the real
`.gui` files (the game's HUD listener leaks windows on every reload, so later
tree reads hit freed definitions), and over showing the game's own window next
to the editor (a second view, no diff with the offline renderer, untested
windowed sizes).

## Consequences

- In v1 the game host shows a layout preview drawn by the game: windows opened
  without a controller, so no code-filled content; previews of the game's own
  live windows are left for later.
- The game host reads no widget tree; the window's rectangle comes from the
  offline renderer's layout.
- The preview resolution is the game host's start-up resolution, so changing
  it restarts the game host.
- Unverified: a separate profile through `userdir`, the console and
  `window open` in the main menu, and frame capture while the game sits behind
  VS Code. These are checked live before implementation, and a renamed copy
  must preview the same as the original file.
- The extension ships pinned builds of Anvil, `anvil-game`, Bellows and Etch's
  plugin and installs them only into the game host install; it refuses to
  start the game host when `eu4.exe` is not the pinned 1.37.5 build.
