---
title: Install and requirements
description: What you need to run Etch, how to install it, how to get coloured text in script files, how to see your version and where to ask for help.
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

## Coloured text in script files

Script files are your mod's `.gui`, `.gfx` and `.asset` files, and the `.txt` files in the folders
`common`, `customizable_localization`, `decisions`, `events`, `history`, `map` and `missions`.
Etch adds no colours to their text. Without another extension, VS Code opens them as
**Plain Text**: it says so at the bottom right of the window, and the whole file is one colour.

Two other extensions show keywords, numbers and comments in colours of their own. You can use
either of them together with Etch:

- CWTools colours the files and checks your scripts for mistakes.
- ParadoxCode colours the files, checks them and adds its own hovers. It is only on the VS Code
  Marketplace, not on Open VSX, the extension store some other editors use.

To install one, open the Extensions view (<kbd>Ctrl+Shift+X</kbd>), search for its name and click
**Install**.

### The notification

If neither extension is installed and turned on, Etch shows a notification at the bottom right
when you open a script file. It says that script files open as Plain Text, and it has three
buttons. Etch shows it at most once in each VS Code window.

- **Install CWTools** or **Install ParadoxCode** installs that extension, as **Install** in the
  Extensions view does. If the file is still Plain Text afterwards, close it and open it again.
- In an editor that gets its extensions from Open VSX, ParadoxCode cannot be installed: a message
  says so. Install CWTools from the Extensions view instead.
- **Don't Show Again**: Etch never shows the notification again, in any window, even after you
  restart VS Code. You can still install either extension yourself.
- If you close it with **×**, Etch shows it again the next time you start VS Code, or in another
  VS Code window.

If the notification disappears before you choose, click the bell at the bottom right of the
window to see it again.

Etch does not show it when the VS Code setting `extensions.ignoreRecommendations` is on. That
setting also turns off VS Code's own suggestions of extensions.

When Etch is installed, go on to [Your first preview](first-preview.md).

## The Get Started page

Once Etch is installed, VS Code opens **Get Started with Etch** on its Welcome page. Five steps
show the main things Etch does, each with a button that does it:

1. **Find the game**: Etch says whether it found the game. **Set the Game Folder** opens the
   setting `etch.gamePath`.
2. **Open your first preview**: **Open a .gui File…** lists your mod's `.gui` files.
3. **Find a widget in the Widget Outline**: **Show the Widget Outline** opens it in the Explorer.
4. **Fill texts with sample data**: what **Data ▾** in the preview does.
5. **Start the live game (optional)**: **Start the Live Game**.

A step ticks itself when you have done it, whether with its button or not: when Etch finds the
game, when a preview opens, when the Widget Outline shows, when you open the sample data step and
when the live game starts. To open the page again, run **Etch: Get Started** from the Command
Palette (<kbd>Ctrl+Shift+P</kbd>).

## Free and private

- Etch is free, under the
  [MIT licence](https://github.com/happy-dwarf-team/etch/blob/main/LICENSE).
- It sends nothing anywhere. **Report to Etch…**, a quick fix in the Problems panel, only opens a
  filled-in bug report on GitHub in your browser, and you send it yourself.
- It only reads your game folder, your mods and your EU4 profile, the folder where the game keeps
  your settings, saves and mods (usually `Documents/Paradox Interactive/Europa Universalis IV`).
  It writes into your mod only when you ask, for example when you save a
  [view](../reference/glossary.md#view) of a window with **Save as View…**. See
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
