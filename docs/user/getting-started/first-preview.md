---
title: Your first preview
description: Open your mod in VS Code, preview one of its windows and watch it redraw as you type.
clip: preview
---

The preview draws a window of a `.gui` file beside the editor, close to how the game shows it. It
needs no running game. These steps copy a window of the base game into your mod and edit it.

## Before you start

- Etch is installed, and EU4 1.37.5 is installed through Steam, or its folder is set in the
  setting `etch.gamePath`: see [Install and requirements](install.md).
- You have a mod: one the game's launcher lists, or a folder with a `descriptor.mod`.

## Preview a window

1. In VS Code, choose **File › Open Folder…** and open your mod's folder, the one that holds its
   files. The Explorer lists them.
2. Copy `provinceview.gui` from the game's `interface` folder into your mod's `interface` folder.
   Make that folder if your mod has none. To open the game folder, right-click Europa Universalis
   IV in your Steam library and choose **Manage › Browse local files**. It is usually
   `steamapps/common/Europa Universalis IV` in your Steam folder.
3. Open your copy in the editor.
4. Run **Etch: Open Preview** from the Command Palette (<kbd>Ctrl+Shift+P</kbd>), or click the
   **Open Preview** button in the editor's title bar, at the top right. The preview opens beside
   the editor. Until you put the cursor in a window, it shows the file's first window,
   `janissaries_state_view`.
5. Put the cursor inside the province view: press <kbd>Ctrl+F</kbd>, search for
   `name = "provinceview"` and click on that line. The preview draws the province view. The
   toolbar at the top of the preview shows `provinceview` and the file's path.
6. Search for `name = "provincename"`, the text that shows the province's name. Change the `x` of
   its `position` from 100 to 150. As you type, the name moves to the right in the preview. The
   name is a stand-in, "Northmarch". You do not need to save.
7. Open the Problems panel (<kbd>Ctrl+Shift+M</kbd>). Etch lists there what it finds wrong in the
   file. Try it: in any `spriteType = "GFX_…"` line of the window, add a letter to the sprite's
   name. The Problems panel lists a warning for that line. It goes away when you remove the
   letter.
8. When you are done, delete your copy, unless your mod is meant to change the province view: the
   game would use your copy instead of its own.

## What you see

- **The previewed window.** The preview shows one window at a time: the window your cursor is in.
  Only windows written directly inside `guiTypes = { … }` count; a window inside another one
  shows as part of the outer one. Move the cursor into another window and the preview follows.
  When the cursor is outside every window, the preview stays on the last one it showed in that
  file. To keep it on one window, click **Pin** in the toolbar: see
  [Preview](../interface-windows/preview.md).
- **One view of the window.** The province view holds widgets for many situations, such as your
  own and a foreign province. Etch knows which ones go together, so it draws one situation, the
  "Own province" view, instead of every widget at once. Click **View ▾** in the toolbar to pick
  another, such as a foreign province: see
  [Views and window profiles](../interface-windows/views.md).
- **Sample data.** The game's code writes the province's name; the `.gui` file leaves that text
  empty. The preview shows a stand-in such as "Northmarch" there, until you choose a save in
  **Data ▾**: see [Sample data](../interface-windows/sample-data.md).
- **Your game's screen size.** The window is laid out at the screen size set in your game's
  `settings.txt` or, without one, at your monitor's, and fitted into the panel: see
  [Zoom and resolution](../interface-windows/zoom-and-resolution.md).

## Where to go next

- [Widget Outline](../interface-windows/widget-outline.md): the widgets of the previewed window as
  a tree. Click one, or a widget in the preview, to go to the line that defines it.
- [Problems](../interface-windows/problems.md): each warning Etch gives, and what to do about it.
- [Where Etch finds the game](finding-the-game.md): the game folder, the mods loaded with yours,
  and the language.
- [Start and stop the live game](../live-game/start-and-stop.md): the game itself running beside
  the editor, which reloads each file you save.
