---
title: Install and requirements
description: What you need to run Etch, how to install it, how to see your version and where to ask for help.
---

Etch is an extension for Visual Studio Code. You install it from an extension store. It draws
your mod's interface windows beside the editor, with the files of your own copy of Europa
Universalis IV 1.37.5.

## What you need

- Windows, 64-bit (x64).
- Visual Studio Code 1.100 or later.
- EU4 1.37.5 for the preview, Etch's drawing of a window beside the editor. Etch finds a copy
  installed through Steam by itself. For a GOG copy, or a game Etch does not find, put the game
  folder in the setting `etch.gamePath`: see [Where Etch finds the game](finding-the-game.md).
- For the [live game](../reference/glossary.md#live-game), EU4 itself started by Etch beside the
  editor: the Steam version of EU4 1.37.5, exactly. The live game does not start with any other
  `eu4.exe`.

Etch comes with no game files. It draws with your game's own textures, fonts and localisation.
The live game needs no other download either. The first time you start it, Etch asks you once to
confirm, then sets up its own copy of the game for the live game to run in, the
[private install](../live-game/private-install.md).

## Install Etch

Pick one of these:

- **VS Code Marketplace.** In VS Code, open the Extensions view (<kbd>Ctrl+Shift+X</kbd>), search
  for Etch and click **Install** on Etch by happy-dwarf-team. Its page is
  [on the Marketplace](https://marketplace.visualstudio.com/items?itemName=happy-dwarf-team.etch).
- **Open VSX.** If your editor gets its extensions from Open VSX instead of the VS Code
  Marketplace, Etch is there too:
  [Etch on Open VSX](https://open-vsx.org/extension/happy-dwarf-team/etch).
- **A terminal.** In VS Code, choose **Terminal › New Terminal**, type
  `code --install-extension happy-dwarf-team.etch` and press <kbd>Enter</kbd>.

Each release is also a `.vsix` file, the whole extension in one file, on the
[GitHub releases page](https://github.com/happy-dwarf-team/etch/releases). To install one, click
**…** at the top of the Extensions view and choose **Install from VSIX…**. If you install a newer
`.vsix` while Etch is running, Etch tells you that this VS Code window still runs the old version
and offers **Reload Window**. Click it to switch to the new one.

If you used Etch 1.x: its [game host](../reference/glossary.md#game-host), a hidden copy of the
game that drew the preview, is gone in Etch 2, and the live game takes its place. To stay on 1.x,
see [Etch 1.x](../about/etch-1x.md).

When Etch is installed, go on to [Your first preview](first-preview.md).

## Free and private

- Etch is free, under the
  [MIT licence](https://github.com/happy-dwarf-team/etch/blob/main/LICENSE).
- It sends nothing anywhere. **Report to Etch…**, a quick fix in the Problems panel, only opens a
  filled-in bug report on GitHub in your browser, and you send it yourself.
- It only reads your game folder, your mods and your EU4 profile, the folder where the game keeps
  your settings, saves and mods (usually `Documents/Paradox Interactive/Europa Universalis IV`).
  It writes into your mod only when you ask, for example when you save a
  [view](../reference/glossary.md#view) of a window with **Save as view…**. See
  [What Etch reads and writes](../about/reads-and-writes.md).

## See your version

1. Open the Output panel: **View › Output** in VS Code's menu (<kbd>Ctrl+Shift+U</kbd>).
2. Choose **Etch** in the list at the top right of the panel.
3. Read the first line. It names Etch's version, such as "Etch 2.0.0 (abc1234) for EU4 1.37.5".

Copy that whole line into every bug report. The
[changelog](https://github.com/happy-dwarf-team/etch/blob/main/CHANGELOG.md) lists what each
release changed.

## Get help

- **A question, or not sure it is a bug?** Ask in the #help-and-bugs channel (with the Etch tag)
  or in #modding on the team's [Discord server](https://discord.happydwarf.dev/).
- **A bug or an idea?** Report it on Etch's
  [GitHub issues page](https://github.com/happy-dwarf-team/etch/issues). Bugs the team confirms on
  Discord are written down there too.
