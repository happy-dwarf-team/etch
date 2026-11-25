---
title: Sample data
description: Fill the texts the game's code writes with stand-ins, a save of yours or the live game, and choose which wins.
clip: data
---

Many texts of a window are written by the game's code, not by the `.gui` file: a province's name,
its development, culture and religion, a list of great projects. The base game's
`provinceview.gui`, for example, leaves the text of `provincename` empty. The preview fills such
texts with **sample data**, so that you see how long names and big numbers fit.

Sample data needs a [window profile](../reference/glossary.md#window-profile), Etch's notes on a
window, which say where each of its texts comes from. A window without a profile shows no sample
data, unless you took a [live snapshot](../reference/glossary.md#live-snapshot) of it: a copy of
what the [live game](../reference/glossary.md#live-game), EU4 running beside the editor, showed in
that window.

## The layers

Click **Data ▾** in the toolbar. The button says where the data comes from now, such as
"Data: generated, typical ▾". A dialog lists the **layers** of sample data, the upper ones
winning: a text takes its value from the highest layer that has one. Each layer shows how many
texts it fills.

| Layer | What it fills |
| --- | --- |
| **By hand** | texts you typed, over every other layer |
| **Live snapshot** | what the live game showed in this window |
| **Save** | a save of yours, and a country and a province of it |
| **Game and mod files** | localisation and names from the game and the mods; always on |
| **Generated** | made-up text of the length you choose |

A layer is on when it has data. Only **Live snapshot** has a box you can untick, to see the
window without it.

The menu stays open while you click in it. Click elsewhere or press <kbd>Esc</kbd> to close it.

## Read a save

1. In **Data ▾**, under **Save**, click **Choose a Save…**.
2. Pick a save from the list: your game's saves and the live game's, newest first. Or choose
   **Choose a save file…** at the end of the list to pick any `.eu4` file. The list marks an
   ironman save "ironman, not readable".
3. The preview takes its texts from the save, with the save's player as your country and the
   player's capital as the province. The **Data ▾** button then names the province and the save's
   date.

Numbers from the save are written as the game writes them in that box: the top bar shows
"+100" prestige and "2534k" manpower, the diplomacy view "2M" men in the armies.

With a save, the province view's building slots are the ones the game shows for that province:
the building under construction, the built buildings, the free slots and one locked slot with the
development the next slot needs. Etch works them out as the game does, from the save and your
playset's files: the province's development, terrain, buildings and modifiers, and its owner's
ideas and privileges. The green frame shows where your country could build now, and the destroy
button on your own buildings. A few slot bonuses that depend on conditions, such as a monument's
tier, are left out.

A save also sets the selectors that follow the game's data. For example, the technology view's
institutions window shows the first institution your country has not embraced, as the game does.
See [Views](views.md).

Once a save is read, under **Save**:

- **Country…** chooses which country of the save counts as the player. That decides which
  provinces count as your own and which as foreign. The save's player is marked "the save's
  player".
- **Province…** chooses any province of the save, own or foreign.
- **Other Save…** chooses another save, and **Drop** stops using the save.

When the save was made with other mods than your
[playset](../getting-started/finding-the-game.md), the mods loaded with yours, a warning says
which. When your playset does not have a value of the save, the preview takes that text from the
layers below instead.

Etch reads the same save again the next time you open the preview in that folder.

## Choose the length of made-up text

Where no layer above has a value, the **Generated** layer makes one up. Under **Generated**, click
**short**, **typical**, **long** or **overflow**. **typical** is the default. A name and a number,
for example:

| Length | Name | Number |
| --- | --- | --- |
| short | Ab | 7 |
| typical | Northmarch | 12.3 |
| long | The Grand Duchy of the Western Marches | -1234.56 |
| overflow | The Most Serene Grand Duchy of … the Lands Beyond the Sea | 123456789.01 |

Use **long** and **overflow** to see whether your text boxes hold long texts.

## Type a text yourself

1. Under **By hand**, click **Type a Text…**.
2. Choose which text of the window to fill, then type what it should show and press
   <kbd>Enter</kbd>. The preview shows it at once.

The typed text wins over every other layer. **Clear** takes back every text typed for the window
at once and closes the dialog. A notice above the window says how many it cleared, with **Undo**
to type them again; it goes at your next change of what the preview shows, or with its **×**.
Typing a text, a pick you cancel and **Compare with the Live Game** keep it. A text you typed after the
**Clear**, from the [Widget Outline](widget-outline.md), stays as you typed it.
You can also type a text from the [Widget Outline](widget-outline.md). Etch keeps typed texts for
each window, also after you close VS Code.

## The lists the game fills

Some windows hold lists the game fills with entries, such as the great projects of a province.
Under **Lists the game fills**, each list shows its number of entries, and where that number comes
from: the save, the live snapshot, or generated. Click **−** or **+** to draw one entry fewer or
more. **Reset** goes back to the save's or the profile's number.

## What it doesn't do

- Etch never works out a value the game's engine computes, such as income or a modifier. Such a
  value comes from the live snapshot, or is made up. A few numbers the game only adds up from the
  save are taken from it, as the game adds them up: a country's score and the men in its armies.
- It cannot read ironman saves or other binary saves: it reads only saves written as text,
  compressed or not. Choose a save of a game that is not ironman.
- It never tests a trigger to decide what a window shows. A window profile picks no save, country
  or province: you choose them in **Data ▾**.
- A window without a profile and without a live snapshot has no **Data ▾**.
