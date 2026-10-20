import { describe, expect, it } from 'vitest';
import {
  InterfaceIndex,
  builtInSaveEncoding,
  decodeGameText,
  encodeForSave,
  mapGameText,
  laidOutIndexOf,
  laidOutPath,
  layoutWindow,
  parseScript,
  readGuiFile,
  widgetAt,
  widgetHoverText,
  widgetLabel,
  type SaveEncoding,
  type WindowLayout,
} from '../src/index.ts';

function encoding(id: string): SaveEncoding {
  const found = builtInSaveEncoding(id);
  if (!found) throw new Error(`no built-in encoding ${id}`);
  return found;
}

/** The game text the next save of `text` gives. */
function gameText(text: string, id: string): string {
  return decodeGameText(encodeForSave(text, encoding(id)), 'interface').text;
}

describe('mapGameText', () => {
  it('maps every offset to itself when the game reads what the editor shows', () => {
    const text = 'name = "Ünïcode" # é\n';
    const offsets = mapGameText(text, 'interface', encoding('windows1252'));
    expect(offsets?.text).toBe(text);
    expect(offsets?.toGame(17)).toBe(17);
    expect(offsets?.toEditor(17)).toBe(17);
    expect(mapGameText('a = b', 'interface', encoding('utf8'))?.toGame(3)).toBe(3);
  });

  it('shifts offsets after a run the game reads as more characters', () => {
    // UTF-8: é is two bytes, which the game reads as Ã©; ü€ is five bytes.
    const text = '# é\nwindowType = { name = "ü€" }\nx';
    const game = gameText(text, 'utf8');
    expect(game).toBe('# Ã©\nwindowType = { name = "Ã¼â‚¬" }\nx');
    const offsets = mapGameText(text, 'interface', encoding('utf8'));
    if (!offsets) throw new Error('no offsets');
    expect(offsets.text).toBe(game);
    for (const token of ['windowType', 'name', '" }', 'x']) {
      const editor = text.lastIndexOf(token);
      const mapped = offsets.toGame(editor);
      expect(game.slice(mapped, mapped + token.length)).toBe(token);
      expect(offsets.toEditor(mapped)).toBe(editor);
    }
    // Before the first run nothing moves; inside a run, both map to its start.
    expect(offsets.toGame(1)).toBe(1);
    expect(offsets.toEditor(3)).toBe(2);
    expect(offsets.toEditor(4)).toBe(3);
    expect(offsets.toGame(text.length)).toBe(game.length);
  });

  it('ignores a byte order mark, which neither text holds', () => {
    const text = 'é = x';
    const offsets = mapGameText(text, 'interface', encoding('utf8bom'));
    expect(offsets?.toGame(4)).toBe(5);
    expect(offsets?.text).toBe(gameText(text, 'utf8bom'));
    expect(offsets?.text.slice(5)).toBe('x');
  });

  it('has no map for UTF-16, which the game cannot read', () => {
    expect(mapGameText('a', 'interface', encoding('utf16le'))).toBeUndefined();
  });
});

const GUI = `guiTypes = {
  windowType = {
    name = "outer" position = { x = 10 y = 20 } size = { x = 300 y = 200 }
    windowType = {
      name = "inner" position = { x = 50 y = 40 } size = { x = 100 y = 80 }
      windowType = { position = { x = 10 y = 10 } size = { x = 20 y = 20 } }
    }
    windowType = { name = "late" position = { x = 120 y = 90 } size = { x = 40 y = 40 } }
  }
}`;

function layOut(): WindowLayout {
  const file = readGuiFile(parseScript(GUI));
  const window = file.definitions[0];
  if (window === undefined) throw new Error('no window');
  return layoutWindow(window, {
    file,
    index: InterfaceIndex.of([], [{ path: 'interface/test.gui', file }]),
    exists: () => false,
    assets: { textureSize: () => undefined, font: () => undefined },
    screen: { width: 800, height: 600 },
  });
}

describe('navigation over a layout', () => {
  const layout = layOut();
  const names = layout.widgets.map((entry) => widgetLabel(entry.widget));

  it('labels a widget by its name, or by its kind without one', () => {
    expect(names).toEqual(['outer', 'inner', '<windowType>', 'late']);
  });

  it('finds the widget drawn on top at a point, edges excluded on the right and bottom', () => {
    expect(names[widgetAt(layout.widgets, 75, 75)]).toBe('<windowType>');
    expect(names[widgetAt(layout.widgets, 61, 61)]).toBe('inner');
    // `late` overlaps `inner` and is painted after it.
    expect(names[widgetAt(layout.widgets, 135, 115)]).toBe('late');
    expect(names[widgetAt(layout.widgets, 10, 20)]).toBe('outer');
    expect(widgetAt(layout.widgets, 310, 100)).toBe(-1);
    expect(widgetAt(layout.widgets, 9, 100)).toBe(-1);
  });

  it('gives the path from the window and the rect for hover', () => {
    expect(laidOutPath(layout.widgets, 2).map((entry) => widgetLabel(entry.widget))).toEqual([
      'outer',
      'inner',
      '<windowType>',
    ]);
    expect(widgetHoverText(layout.widgets, 2)).toBe(
      'outer › inner › <windowType>\nwindowType at 70, 70, 20 × 20',
    );
    expect(widgetHoverText(layout.widgets, -1)).toBe('');
  });

  it('finds a laid-out widget by its source offset', () => {
    const late = layout.widgets[3];
    expect(late && laidOutIndexOf(layout.widgets, late.widget.node.start)).toBe(3);
    expect(laidOutIndexOf(layout.widgets, 0)).toBe(-1);
  });
});
