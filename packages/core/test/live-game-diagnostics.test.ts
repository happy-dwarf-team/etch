import { describe, expect, it } from 'vitest';
import {
  InterfaceIndex,
  errorLogDiagnostics,
  originalWindowDiagnostics,
  parseScript,
  readGfxFile,
  readGuiFile,
  textureReloadNames,
  type ErrorLogRequest,
  type ModelDiagnostic,
} from '../src/index.ts';

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

const file = readGuiFile(parseScript(source));
const window = (() => {
  const first = file.definitions[0];
  if (first === undefined) throw new Error('no window');
  return first;
})();

const at = (text: string, n = 1): { start: number; end: number } => {
  let start = -1;
  for (let i = 0; i < n; i++) start = source.indexOf(text, start + 1);
  return { start, end: start + text.length };
};

function report(over: Partial<ErrorLogRequest>): ModelDiagnostic[] {
  return errorLogDiagnostics({
    text: source,
    path: 'interface/goto.gui',
    window,
    errorLog: [],
    offline: [],
    ...over,
  });
}

describe('errorLogDiagnostics', () => {
  it('puts a line that names the file on that line, once', () => {
    const line =
      "[windowtype.cpp:809]: Guitype 'goto_bg' already exists in windowtype 'goto_box'.  " +
      'file: interface/goto.gui line: 9';
    expect(report({ errorLog: [line, `[12:01:02]${line}`] })).toEqual([
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

  it('reports a parse error as an error, with backslashes in the path', () => {
    const [found] = report({
      errorLog: [
        '[persistent.cpp:88]: Parsing Error. File: "interface\\goto.gui", Error: Unexpected token: x, near line: 12',
      ],
    });
    expect(found).toMatchObject({ severity: 'error', ...at('name = "goto_ok"') });
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

  it('puts a line that names another file or no line on the window name', () => {
    expect(
      report({
        errorLog: [
          '[gui.cpp:367]: Failed to create window "goto_box"',
          '[gui.cpp:12]: Something. file: interface/other.gui line: 3',
        ],
      }),
    ).toMatchObject([
      { ...at('"goto_box"'), message: 'error.log: Failed to create window "goto_box"' },
      { ...at('"goto_box"'), message: 'error.log: Something. file: interface/other.gui line: 3' },
    ]);
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

describe('textureReloadNames', () => {
  const gfx = readGfxFile(
    parseScript(
      [
        'spriteTypes = {',
        '\tspriteType = { name = "GFX_a" texturefile = "gfx//interface//topbar_UL.tga" }',
        '\tspriteType = { name = "GFX_b" texturefile = "gfx/interface/topbar_UL.dds" }',
        '\tspriteType = { name = "GFX_c" texturefile = "gfx/interface/other.dds" }',
        '}',
      ].join('\n'),
    ),
  );
  const index = InterfaceIndex.of([{ path: 'interface/a.gfx', file: gfx }], []);

  it('gives every name as written that resolves to the saved texture, .tga falling back to .dds', () => {
    expect(textureReloadNames(index, 'gfx/interface/topbar_ul.dds')).toEqual([
      'gfx//interface//topbar_UL.tga',
      'gfx/interface/topbar_UL.dds',
    ]);
    expect(textureReloadNames(index, 'gfx\\interface\\other.dds')).toEqual([
      'gfx/interface/other.dds',
    ]);
  });

  it('falls back to the path itself', () => {
    expect(textureReloadNames(index, 'gfx/interface/unused.tga')).toEqual([
      'gfx/interface/unused.tga',
    ]);
  });
});
