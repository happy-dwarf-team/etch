# Etch

Etch is a Visual Studio Code extension for Europa Universalis IV 1.37.5 mods. It draws your mod's
interface windows beside the editor, and draws them again as you type. It shows your textures,
meshes, units and ships. It starts EU4 itself beside the editor, with your mod, and loads the files
you save into it. And it finds mistakes in your scripts that the game does not report.

**Docs:** [etch.happydwarf.dev/docs](https://etch.happydwarf.dev/docs/) explains every feature
and setting. Website: [etch.happydwarf.dev](https://etch.happydwarf.dev/).

## Get started

You need Windows (x64), Visual Studio Code 1.100 or later and EU4 1.37.5. Etch comes with no game
files: it draws with your game's own. It finds a Steam copy of the game by itself. For a GOG copy,
or a game it does not find, put the game folder in the setting `etch.gamePath`. The live game, EU4
itself started by Etch beside the editor, needs the Steam version of 1.37.5, exactly
([Install and requirements](https://etch.happydwarf.dev/docs/getting-started/install/)).

Then open your mod's folder in VS Code, open a `.gui` file and run **Etch: Open Preview** from the
Command Palette (<kbd>Ctrl+Shift+P</kbd>). The preview opens beside the editor:
[Your first preview](https://etch.happydwarf.dev/docs/getting-started/first-preview/).

If you used Etch 1.x: its game host, a hidden copy of the game that drew the preview, is gone in
Etch 2, and the live game takes its place. To stay on 1.0.x, see
[Etch 1.x](https://etch.happydwarf.dev/docs/about/etch-1x/).

## Interface windows

The [preview](https://etch.happydwarf.dev/docs/interface-windows/preview/) draws the window your
text cursor is in, close to how the game draws it, and draws it again as you type. While it is
open, missing sprites, fonts and textures show as warnings in the
[Problems panel](https://etch.happydwarf.dev/docs/interface-windows/problems/).

For many windows of the base game and of some mods, such as Anbennar, the preview draws one
[view](https://etch.happydwarf.dev/docs/interface-windows/views/), one situation as the game shows
it, such as your own province; **View ▾** picks another. In those windows,
[sample data](https://etch.happydwarf.dev/docs/interface-windows/sample-data/) fills the texts the
game's code writes, such as a province's name. The
[Widget Outline](https://etch.happydwarf.dev/docs/interface-windows/widget-outline/), in the
Explorer, lists the window's widgets. As you type in a `.gui` file, Etch
[suggests](https://etch.happydwarf.dev/docs/interface-windows/completion/) widget types, keys,
sprites and fonts. To jump to a widget, sprite or font by its name, press
<kbd>Ctrl+Shift+O</kbd>
([Jump to a widget by name](https://etch.happydwarf.dev/docs/interface-windows/widget-outline/#jump-to-a-widget-by-name)).

## Textures and meshes

A `.dds` or `.tga` file opens in the
[texture preview](https://etch.happydwarf.dev/docs/textures-and-meshes/texture-preview/). A
`.mesh` file opens in the
[mesh preview](https://etch.happydwarf.dev/docs/textures-and-meshes/mesh-preview/), where you
turn the model and play its animations. In an `.asset` file, click **Preview Entity** above an
`entity = { … }` to see that
[unit or ship](https://etch.happydwarf.dev/docs/textures-and-meshes/entities/). Etch draws a map
tree's mesh
[as the game draws it on the map](https://etch.happydwarf.dev/docs/textures-and-meshes/map-trees/).
Hover over the name of a texture, mesh or sprite in your files to see it, and
<kbd>Ctrl</kbd>+click the name to open the file that holds it. On a sprite name,
<kbd>Shift+F12</kbd> lists every file that uses it and <kbd>F2</kbd> renames it in your mod.
Font colours in `.gfx` files get VS Code's colour picker
([Hovers and links](https://etch.happydwarf.dev/docs/textures-and-meshes/hovers-and-links/)).

## The live game

The live game is EU4 itself, with your mod and the mods it depends on, beside the editor. Start it
with [**Etch: Start the Live Game**](https://etch.happydwarf.dev/docs/live-game/start-and-stop/)
and play as usual.

- Save the `.gui` file of a window such as the province view, a localisation file or a texture,
  and the game [loads it again](https://etch.happydwarf.dev/docs/live-game/reload-on-save/): the
  change shows in its own window. Other files, such as `.gfx` files and events, need a restart,
  which Etch does when you click **Restart now**.
- In [pick mode](https://etch.happydwarf.dev/docs/live-game/pick-mode/), which
  <kbd>Ctrl+Shift+E</kbd> turns on in the game, click a widget: VS Code opens the line that
  defines it.
- A [live snapshot](https://etch.happydwarf.dev/docs/live-game/snapshot-and-compare/) copies a
  window's texts and shown widgets from the game into the preview.
- [Run selection](https://etch.happydwarf.dev/docs/live-game/run-selection/) runs in the game the
  effect you select in the editor, or says whether a trigger is true.
- [Check File](https://etch.happydwarf.dev/docs/live-game/check-file/) lets the game read the
  triggers and effects of an event, decision or mission file without running them, and shows
  what it complains about in the Problems panel, on your lines.

## Scripts

Etch warns about
[province IDs and names](https://etch.happydwarf.dev/docs/scripts/province-ids-and-names/) that
the game does not check and can crash on, such as `owns = 5075` on a map of 4941 provinces. It
warns where the game would read other letters than you see, and offers to fix the file's
[encoding](https://etch.happydwarf.dev/docs/scripts/encoding/). After a localisation key, such
as an event's `title`, it shows the key's
[text](https://etch.happydwarf.dev/docs/scripts/localisation-texts/) in grey, and its hover
shows the whole text in the game's colours. After a province ID, such as `owns = 151`, it shows
the province's name.
Anvil, which lets EU4 load plugins, can time your triggers and effects while you play:
**Etch: Show the Latest Script Profile** opens what it measured, with links to your files
([Script profile](https://etch.happydwarf.dev/docs/scripts/script-profile/)).

## What Etch reads and writes

Etch reads your game folder, your mods and your EU4 profile, the folder where the game keeps your
settings, saves and mods. It never changes the game folder or your profile, and it writes into
your mod only when you ask, for example when you save a view. It sends nothing anywhere and
collects nothing about how you use it. **Report to Etch…**, a quick fix in the Problems panel,
only opens a filled-in bug report on GitHub in your browser, and you send it yourself. See
[What Etch reads and writes](https://etch.happydwarf.dev/docs/about/reads-and-writes/) and
[Limits](https://etch.happydwarf.dev/docs/about/limits/).

## More from the Happy Dwarf Team

- [Anvil](https://anvil.happydwarf.dev/): lets EU4 load plugins, add-ons to the game's own
  program. The live game runs on it.
- [Tongs](https://anvil.happydwarf.dev/plugins/tongs/): an Anvil plugin that lets other programs
  control a running game. Etch only reads the live game's widgets through it.
- [happydwarf.dev](https://happydwarf.dev/): all of the team's projects.

## Feedback

Report a bug or an idea on Etch's
[GitHub issues page](https://github.com/happy-dwarf-team/etch/issues). Copy into it the first
line of Etch's log (**View › Output**, then **Etch** in the list at the top right of the panel),
such as "Etch 2.0.0 (abc1234) for EU4 1.37.5": it names your version. The
[changelog](https://etch.happydwarf.dev/docs/changelog/) lists what each release changed.

A question, or not sure it is a bug? Ask in the #help-and-bugs channel (with the Etch tag) or in
#modding on the team's [Discord server](https://discord.happydwarf.dev/). Bugs the team confirms
there are written down on the GitHub issues page too.

## License

Etch is free, under the [MIT License](https://github.com/happy-dwarf-team/etch/blob/main/LICENSE).
