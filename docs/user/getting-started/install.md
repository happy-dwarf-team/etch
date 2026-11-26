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

When Etch is installed, go on to [Your first preview](first-preview.md).

## Coloured text in script files

Script files are your mod's `.gui`, `.gfx` and `.asset` files, and the `.txt` files in the folders
`common`, `customizable_localization`, `decisions`, `events`, `history`, `map` and `missions`.
Etch adds no colours to their text. Without another extension, VS Code opens them as
**Plain Text**: it says so at the bottom right of the window, and the whole file is one colour.

Two other extensions show keywords, numbers and comments in colours of their own. You can use
either of them together with Etch:

- CWTools colours the files and checks your scripts for mistakes. It colours your mod's `.txt`
  files only when the mod is inside a folder named Europa Universalis IV: see
  [A mod in a folder of its own](#a-mod-in-a-folder-of-its-own). CWTools still works with EU4
  1.37.5, but its EU4 support gets no more updates: see
  [Etch and CWTools in the same file](#etch-and-cwtools-in-the-same-file).
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
  If you installed CWTools and your mod is not inside a folder named Europa Universalis IV, the
  file stays Plain Text even with CWTools, and Etch shows a second notification: see
  [A mod in a folder of its own](#a-mod-in-a-folder-of-its-own).
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

### A mod in a folder of its own

CWTools colours a mod's `.txt` files only when a folder in their path is named after the game,
such as `Documents/Paradox Interactive/Europa Universalis IV/mod/my_mod`. If you keep your mod
somewhere else, for example in a folder of its own for Git, its `.txt` files stay Plain Text with
CWTools installed.

There is one exception. Once CWTools runs, for example because you opened a `.gui` file first,
it colours such files too, but as script files of no particular game: the bottom right of the
window says `paradox`. CWTools then checks them with no EU4 rules, so it reports none of your
mistakes.

When you open such a file with CWTools installed, Etch shows a notification at the bottom right.
It says that CWTools leaves the file Plain Text, or checks it with no EU4 rules, and that CWTools
does better only inside a folder named Europa Universalis IV. Etch shows it at most once in each
VS Code window.

- **Colour Files in This Folder**, or **Use EU4 Rules in This Folder** for a `paradox` file, adds
  the setting `files.associations` to the folder you opened in VS Code, in its file
  `.vscode/settings.json`. VS Code creates that file if the folder has none. The setting tells VS
  Code that your mod's script files are EU4 files, so CWTools colours and checks them there too.
  If `files.associations` there already has a line for one of the patterns below, Etch keeps your
  line and adds only the missing ones.
  - The file you have open gets its colours at once.
  - If CWTools was already running, it still checks the files with no EU4 rules. Etch then shows
    a second notification with **Reload Window**. Click it, and CWTools starts again for EU4.
- If you opened no folder, or the file is not inside the folder you opened, the first button is
  **Open Folder…**. Open your mod's folder with it: when you next open a script file, the
  notification offers **Colour Files in This Folder**.
- **Learn More** opens this section of Etch's docs in your browser.
- **Don't Show Again**: Etch never shows this notification again, in any window. The notification
  that offers to install CWTools or ParadoxCode still shows.

To add the setting yourself, open the Command Palette (<kbd>Ctrl+Shift+P</kbd>), run
**Preferences: Open Workspace Settings (JSON)** and add these lines. They are the ones Etch adds.
Put them inside the outer `{ }`, with a comma after the setting before them. If the file already
has `files.associations`, add only the lines inside its braces.

```json
"files.associations": {
  "**/common/**/*.txt": "eu4",
  "**/customizable_localization/**/*.txt": "eu4",
  "**/decisions/**/*.txt": "eu4",
  "**/events/**/*.txt": "eu4",
  "**/history/**/*.txt": "eu4",
  "**/map/**/*.txt": "eu4",
  "**/missions/**/*.txt": "eu4",
  "*.gui": "eu4",
  "*.gfx": "eu4",
  "*.asset": "eu4"
}
```

Instead of the setting, you can also keep your mod in the `mod` folder in
`Documents/Paradox Interactive/Europa Universalis IV`: CWTools then colours its files without it.

### CWTools and the game folder

CWTools checks the names your mod takes from the base game, such as localisation keys. For that
it needs the game folder, which it keeps in its own setting, `cwtools.cache.eu4`. While that
setting is empty, CWTools asks you for the folder itself. Its folder dialog takes only a folder
named Europa Universalis IV.

When you open a script file that CWTools colours, and `cwtools.cache.eu4` is empty, Etch shows a
notification at the bottom right. It says that CWTools needs the game folder, and shows the
folder Etch found: the one in `etch.gamePath`, or, when that setting is empty, the one in your
Steam library (see [Where Etch finds the game](finding-the-game.md)). If Etch has found no game
folder, it shows nothing. Etch shows this notification at most once in each VS Code window.

- **Use This Folder** puts that folder into `cwtools.cache.eu4` in your user settings. CWTools
  then reads the base game by itself. The first time, that takes it a minute or two, and you can
  keep working meanwhile.
- **Learn More** opens this section of Etch's docs in your browser.
- **Don't Show Again**: Etch never shows this notification again, in any window.

### Etch and CWTools in the same file

With both extensions on, VS Code shows what each of them gives side by side: two hovers on one
name, two lists of suggestions in one list. In some places Etch leaves the answer to CWTools,
so that you do not get the same thing twice.

CWTools knows what the keys of a file mean from its EU4 rules: files that come with CWTools.
Etch reads these rules to find out what CWTools does. They cover the sprites of `spriteType` and
the sprite keys of scripts, such as an event's `picture`, and no more: the people behind CWTools
have stopped updating its EU4 support, so these rules stay as they are
([cwtools-eu4-config#452](https://github.com/cwtools/cwtools-eu4-config/pull/452)). If you load
other EU4 rules in CWTools, with its settings `cwtools.rules_folder` and `cwtools.rules_version`
set to `manual`, Etch reads those instead.
Where they cover a thing, Etch leaves it to CWTools:

- **Go to Definition.** In `events/FlavorENG.txt`, press <kbd>F12</kbd> on the sprite name after
  `picture =`: VS Code opens the `.gfx` file at that sprite. Without this, it would show a small
  window with two places, one from each extension, for you to pick from.
- **Outline.** In the Outline of a `.gfx` file, each `spriteType` sprite is listed once, by
  CWTools. Etch lists only the other kinds of sprite, such as `corneredTileSpriteType`.
- **Fonts and `.gui` files.** When CWTools' rules cover fonts, the Outline lists each font once
  too. When they cover fonts and the widgets of `.gui` files, **Go to Definition** on a font name
  in a `.gui` file comes from CWTools alone. When they cover the widgets of `.gui` files, the suggestions of widget types and keys as
  you type come from CWTools alone. Etch still suggests the sprite names and fonts after a key,
  with their pictures. The preview's warnings about
  [keys and values the game does not read](../interface-windows/problems.md#keys-and-values-the-game-does-not-read)
  then come from CWTools too. So does the warning about a sprite that no `.gfx` file defines,
  after `spriteType` or `quadTextureSprite`. CWTools does not check the `background` of a
  `listboxType` or `smoothListboxType`, so Etch still warns about a missing sprite there.

All the rest stays: Etch's hovers with the sprite's picture and the font's sample, the preview's
other warnings in the Problems panel, the hints beside localisation keys, colours, **Find All References** and
**Rename Symbol**.

To choose this, open [Settings](../reference/settings.md) and search for `etch.cwtools`:

- **auto**, the default: Etch leaves to CWTools what its rules cover, as above.
- **ignore**: Etch gives all its answers, so some of them show twice.

Etch leaves answers to CWTools only in files that CWTools reads as EU4: then the bottom right of
the window says **eu4**. If it says **Plain Text** or **paradox**, see
[A mod in a folder of its own](#a-mod-in-a-folder-of-its-own). Etch cannot hide CWTools' own
answers: its hover on a sprite stays next to CWTools' hover.

### CWTools without telemetry

On Windows, CWTools 0.10.31 shows no problems at all in an editor that runs without telemetry.
Telemetry is the usage and error data VS Code sends to Microsoft. An editor runs without it when
VS Code is started with the option `--disable-telemetry`, for example from a shortcut or a script
that adds it, and in editors built without telemetry, such as VSCodium. Your files keep their
colours, but the Problems panel stays empty, however many mistakes your scripts have. This is a
bug in CWTools, not in your mod: see
[CWTools issue #167](https://github.com/cwtools/cwtools-vscode/issues/167). On Linux and macOS,
CWTools keeps working.

The setting `telemetry.telemetryLevel` does not cause this: CWTools works with it at `off` too.

When you open a file that CWTools checks as an EU4 file in such an editor on Windows, Etch shows a
warning at the bottom right. It says that CWTools shows no problems in this editor, and links the
CWTools issue. Etch shows it at most once in each VS Code window.

- **Learn More** opens this section of Etch's docs in your browser.
- **Don't Show Again**: Etch never shows this warning again, in any window.

To get CWTools' checks back, start VS Code without `--disable-telemetry`. In VSCodium, wait for a
CWTools update that fixes the bug.

## The Get Started page

Once Etch is installed, VS Code opens **Get Started with Etch** on its Welcome page. Six steps
show the main things Etch does, each with a button that does it:

1. **Find the game**: Etch says whether it found the game. **Set the Game Folder** opens the
   setting `etch.gamePath`.
2. **Open your first preview**: **Open a .gui File…** lists your mod's `.gui` files.
3. **Find a widget in the Widget Outline**: **Show the Widget Outline** opens it in the Explorer.
4. **Fill texts with sample data**: what **Data ▾** in the preview does.
5. **Start the live game (optional)**: **Start the Live Game**.
6. **Colour your script files**: **Install CWTools** or **Install ParadoxCode** installs that
   extension. [Coloured text in script files](#coloured-text-in-script-files) says what each does.

A step ticks itself when you have done it, whether with its button or not: when Etch finds the
game, when a preview opens, when the Widget Outline shows, when you open the sample data step,
when the live game starts and when CWTools or ParadoxCode is installed and turned on. To open the
page again, run **Etch: Get Started** from the Command Palette (<kbd>Ctrl+Shift+P</kbd>).
The page starts Etch when it opens, so its steps work in a window without mod files too.

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
