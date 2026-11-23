import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile, type LaidOutWidget } from '@etch/core';
import { fitRect, windowEntries } from '../src/preview/window-list.ts';

const GUI = `guiTypes = {
  windowType = {
    name = "etch_bar"
    size = { x = 390 y = 32 }
  }
  windowType = {
    name = "etch_full"
    size = { width = 50% height = 100% }
  }
  containerWindowType = {
    size = { x = @w y = 10 }
  }
}
`;
const SCREEN = { width: 1920, height: 1080 };

/** A laid-out widget with only the rect the functions read. */
const laid = (x: number, y: number, width: number, height: number): LaidOutWidget =>
  ({ x, y, width, height }) as LaidOutWidget;

describe('the window list', () => {
  it("lists the file's windows with their sizes on the screen and their lines", () => {
    const file = readGuiFile(parseScript(GUI));
    const lineOf = (offset: number): number => GUI.slice(0, offset).split('\n').length;
    expect(windowEntries(file, SCREEN, lineOf)).toEqual([
      { index: 0, label: 'etch_bar', size: { width: 390, height: 32 }, line: 2 },
      { index: 1, label: 'etch_full', size: { width: 960, height: 1080 }, line: 6 },
      // An unknown constant gives no size; a window without a name shows its kind.
      { index: 2, label: 'containerWindowType', line: 10 },
    ]);
  });
});

describe('the rect Fit window fits', () => {
  it("is the window's own rect when it has one", () => {
    expect(fitRect([laid(100, 50, 390, 32), laid(0, 0, 2000, 2000)])).toEqual({
      x: 100,
      y: 50,
      width: 390,
      height: 32,
    });
  });

  it('is the box around its widgets for a window without a size', () => {
    const widgets = [
      laid(0, 0, 0, 0),
      laid(10, 20, 100, 30),
      laid(200, 5, 50, 0),
      laid(60, 40, 80, 60),
    ];
    expect(fitRect(widgets)).toEqual({ x: 10, y: 20, width: 130, height: 80 });
  });

  it('is nothing when nothing has a size', () => {
    expect(fitRect([])).toBeUndefined();
    expect(fitRect([laid(0, 0, 0, 0), laid(5, 5, 0, 10)])).toBeUndefined();
  });
});
