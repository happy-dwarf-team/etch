# etch-pick-probe

A throwaway Anvil plugin for the live checks of pick mode
([Run the live checks for pick mode](https://github.com/happy-dwarf-team/etch/issues/171)).
It lives on `prototype/pick-mode-probe` only: never merged, never shipped. Etch's own
plugin implements pick mode from the specification.

What it does (all of it logged to a JSONL file):

- `Ctrl+Shift+E` in the game window toggles pick mode (window procedure subclass);
  Esc is not touched.
- In pick mode it drops mouse button and wheel messages and raw mouse input, and
  `eu4.exe`'s `GetAsyncKeyState`/`GetKeyState` read the mouse buttons as up.
- Each frame in pick mode it reads the hovered widget and its ancestors through
  Tongs' `tongs.ui` service (Tongs 0.17.0 or later), with the definition's game path
  and the line at definition `+0xA0`.
- A left click is handled on the next frame: the hovered chain with paths, every
  visible widget whose rect holds the click point, then `AllowSetForegroundWindow`
  and `code -g file:line`, and a thread that logs when VS Code takes the foreground
  and when its title names the file.

Build with the Anvil SDK unpacked:

```
cmake -S pick-probe -B pick-probe/build -G "Visual Studio 17 2022" -A x64 -DAnvilPlugin_DIR=<sdk>/cmake
cmake --build pick-probe/build --config Release
```

Settings: `probe.txt` next to the DLL, `key=value` per line, read again when it
changes: `log`, `root` (repeatable, first root holding the game path wins), `code`
(path to `code.cmd`), `open`, `allow_foreground`, `swallow_mouse`, `swallow_key`
(`1` or `0`).
