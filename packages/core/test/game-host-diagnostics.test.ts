import { describe, expect, it } from 'vitest';
import {
  InterfaceIndex,
  cropReachesFpsCounter,
  fpsCounterDiagnostics,
  gameHostDiagnostics,
  originalOffset,
  originalWindowDiagnostics,
  parseScript,
  readGuiFile,
  writePreviewCopy,
  type GameHostDiagnosticsRequest,
  type ModelDiagnostic,
  type PreviewCopyFile,
} from '../src/index.ts';

const screen = { width: 1920, height: 1080 };

const source = [
  'default_clicksound = "click"',
  'guiTypes = {',
  '\twindowType = {',
  '\t\tname = "goto_box"',
  '\t\tposition = { x = -600 y = 215 }',
  '\t\tshow_position = { x = 165 y = 215 }',
  '\t\ticonType = {',
  '\t\t\tname = "goto_bg"',
  '\t\t\tspriteType = "GFX_goto_bg"',
  '\t\t}',
  '\t\tguiButtonType = {',
  '\t\t\tname = "goto_ok"',
  '\t\t\tspriteType = "GFX_goto_bg"',
  '\t\t\tif_resolution = { min_width = 1900 spriteType = "GFX_nope" }',
  '\t\t}',
  '\t}',
  '\ttextBoxType = { name = "goto_tip" }',
  '}',
  '',
].join('\r\n');

const copy = writePreviewCopy({
  path: 'interface/goto.gui',
  text: source,
  window: 'goto_box',
  screen,
});
const copies = copy.files as readonly [PreviewCopyFile, PreviewCopyFile];
const file = readGuiFile(parseScript(source));
const window = (() => {
  const first = file.definitions[0];
  if (first === undefined) throw new Error('no window');
  return first;
})();

/** The 1-based line of a copy that holds `text` for the `n`th time. */
function copyLine(copyFile: PreviewCopyFile, text: string, n = 1): number {
  let seen = 0;
  const lines = copyFile.text.split('\n');
  const at = lines.findIndex((line) => line.includes(text) && ++seen === n);
  if (at < 0) throw new Error(`no ${text}`);
  return at + 1;
}

const at = (text: string, n = 1): { start: number; end: number } => {
  let start = -1;
  for (let i = 0; i < n; i++) start = source.indexOf(text, start + 1);
  return { start, end: start + text.length };
};

function report(over: Partial<GameHostDiagnosticsRequest>): ModelDiagnostic[] {
  return gameHostDiagnostics({
    text: source,
    path: 'interface/goto.gui',
    window,
    copies,
    errorLog: [],
    commands: [],
    offline: [],
    ...over,
  });
}

describe('originalOffset', () => {
  it('maps every kept character of a copy to the same character of the original', () => {
    for (const c of copies) {
      for (let i = 0; i < c.spans.length; i++) {
        const span = c.spans[i];
        const end = c.spans[i + 1]?.copy ?? c.text.length;
        if (span === undefined || span.inserted) continue;
        for (let offset = span.copy; offset < end; offset++) {
          expect(source[originalOffset(c, offset)]).toBe(c.text[offset]);
        }
      }
    }
  });

  it('maps what the writer added to where it went in', () => {
    const [black] = copies;
    const wrapper = black.text.indexOf('etch_goto_box_backdrop');
    expect(originalOffset(black, wrapper)).toBe(window.node.start);
    const prefix = black.text.indexOf('etch_goto_tip');
    expect(originalOffset(black, prefix)).toBe(source.indexOf('goto_tip'));
  });
});

describe('gameHostDiagnostics', () => {
  it('puts a line of a copy on the original line, once for both copies', () => {
    const lines = copies.map(
      (c) =>
        `[windowtype.cpp:809]: Guitype 'goto_bg' already exists in windowtype '${c.window}'.  ` +
        `file: interface/${c.fileName} line: ${String(copyLine(c, 'GFX_goto_bg'))}`,
    );
    expect(report({ errorLog: lines })).toEqual([
      {
        severity: 'warning',
        code: 'game-error-log',
        ...at('spriteType = "GFX_goto_bg"'),
        message:
          "error.log: Guitype 'goto_bg' already exists in windowtype 'goto_box'.  " +
          'file: interface/goto.gui line: 9',
      },
    ]);
  });

  it('reports a parse error of a copy as an error, with the original line in the message', () => {
    const [black] = copies;
    const line = copyLine(black, 'goto_ok');
    const [found] = report({
      errorLog: [
        `[persistent.cpp:88]: Parsing Error. File: "interface/${black.fileName}", Error: Unexpected token: x, near line: ${String(line)}`,
      ],
    });
    expect(found).toMatchObject({ severity: 'error', ...at('name = "goto_ok"') });
    expect(found?.message).toContain('File: "interface/goto.gui"');
  });

  it('puts a missing sprite on every widget of the window that uses it', () => {
    const line =
      '[graphics.cpp:1177]: Failed to create gui object. Could not find sprite type [GFX_goto_bg]';
    const found = report({ errorLog: [line, line, line] });
    expect(found.map((d) => d.start)).toEqual([
      source.indexOf('"GFX_goto_bg"'),
      source.lastIndexOf('"GFX_goto_bg"'),
    ]);
    expect(found[0]?.message).toBe(
      'error.log: Failed to create gui object. Could not find sprite type [GFX_goto_bg]',
    );
  });

  it('leaves out a missing sprite the model already reports there', () => {
    const value = at('"GFX_nope"');
    const offline: ModelDiagnostic[] = [
      {
        severity: 'warning',
        code: 'missing-sprite',
        ...value,
        message: 'Sprite GFX_nope is not in the playset.',
      },
    ];
    const line =
      '[graphics.cpp:1177]: Failed to create gui object. Could not find sprite type [GFX_nope]';
    expect(report({ errorLog: [line], offline })).toEqual([]);
    expect(report({ errorLog: [line] })).toMatchObject([value]);
  });

  it('puts a line that names no copy on the window name, with the copy names written back', () => {
    expect(
      report({ errorLog: ['[gui.cpp:367]: Failed to create window "etchw_goto_box_backdrop"'] }),
    ).toEqual([
      {
        severity: 'warning',
        code: 'game-error-log',
        ...at('"goto_box"'),
        message: `error.log: Failed to create window "goto_box's backdrop"`,
      },
    ]);
  });

  it('reports the console lines the game refused', () => {
    const found = report({
      commands: [
        { line: 'window close etchw_goto_box_backdrop', success: false, text: 'No window' },
        { line: 'reload etch_goto.gui', success: true, text: 'etch_goto.gui reloaded!' },
        { line: 'reload etchw_goto.gui', success: false, text: 'Failed to reload the file' },
        { line: 'reloadtexture gfx//interface//goto.dds', success: true, text: 'Reload failed' },
        { line: 'reloadloc', success: true, text: 'Localisation reloaded!' },
        { line: 'window open etch_goto_box_backdrop', success: false, text: 'Window not found' },
      ],
    });
    expect(found.map((d) => [d.code, d.severity, d.message])).toEqual([
      [
        'game-console-answer',
        'error',
        'The game did not reload the preview copy of interface/goto.gui; it answered "Failed to reload the file".',
      ],
      [
        'game-console-answer',
        'warning',
        'The game did not reload the texture gfx//interface//goto.dds; it answered "Reload failed", ' +
          'so the game host draws the texture as it was when the game host started.',
      ],
      [
        'game-console-answer',
        'error',
        `The game did not open the preview copy of goto_box's backdrop; it answered "Window not found".`,
      ],
    ]);
    expect(found.every((d) => d.start === at('"goto_box"').start)).toBe(true);
  });
});

describe('originalWindowDiagnostics', () => {
  const gui = (text: string) => readGuiFile(parseScript(text));
  const other = gui('guiTypes = {\n\twindowType = { name = "GOTO_box" }\n}\n');

  it('warns when a later mod has its own file at the path (H6)', () => {
    const index = InterfaceIndex.of([], [{ path: 'interface/goto.gui', file }]);
    const [found] = originalWindowDiagnostics({
      path: 'interface/goto.gui',
      wins: false,
      window,
      index,
    });
    expect(found).toMatchObject({
      code: 'game-original-differs',
      severity: 'warning',
      ...at('"goto_box"'),
    });
    expect(found?.message).toContain('A later mod of the playset has its own interface/goto.gui');
  });

  it('warns when an earlier file defines the name, and not when this file is the first', () => {
    const index = InterfaceIndex.of(
      [],
      [
        { path: 'interface/goto.gui', file },
        { path: 'interface/a_goto.gui', file: other },
      ],
    );
    const [found] = originalWindowDiagnostics({
      path: 'interface/goto.gui',
      wins: true,
      window,
      index,
    });
    expect(found?.message).toContain('interface/a_goto.gui defines GOTO_box earlier in load order');
    expect(
      originalWindowDiagnostics({
        path: 'interface/goto.gui',
        wins: true,
        window,
        index: InterfaceIndex.of([], [{ path: 'interface/goto.gui', file }]),
      }),
    ).toEqual([]);
  });
});

describe('the FPS counter corner', () => {
  it('is the top-right 60×20 pixels of the screen', () => {
    expect(cropReachesFpsCounter({ x: 1800, y: 0, width: 61, height: 20 }, screen)).toBe(true);
    expect(cropReachesFpsCounter({ x: 1800, y: 0, width: 60, height: 20 }, screen)).toBe(false);
    expect(cropReachesFpsCounter({ x: 1800, y: 20, width: 120, height: 20 }, screen)).toBe(false);
    expect(
      fpsCounterDiagnostics(window, { x: 0, y: 0, width: 1920, height: 1080 }, screen),
    ).toMatchObject([{ code: 'fps-counter-corner', severity: 'warning', ...at('"goto_box"') }]);
  });
});
