import { describe, expect, it } from 'vitest';
import {
  RUN_FILE,
  RunMarks,
  blockAtLine,
  buildScript,
  encodeScript,
  mapRunErrors,
  newRunFile,
  readCheck,
  unbalancedBraces,
} from '../src/live-game/run-script.ts';

describe('run files', () => {
  it('are named as the plugin accepts them, one token each', () => {
    const a = newRunFile();
    const b = newRunFile();
    expect(a.file).toMatch(RUN_FILE);
    expect(a.file).toBe(`etch_run_${a.token}.txt`);
    expect(a.token).not.toBe(b.token);
  });
});

describe('buildScript', () => {
  it('runs effects as they are in the player country', () => {
    const s = buildScript(
      'add_treasury = 100\r\nadd_prestige = 5\n\n',
      { kind: 'country' },
      'effect',
      't',
    );
    expect(s.text).toBe('add_treasury = 100\nadd_prestige = 5\n');
    expect(s.firstLine).toBe(1);
  });

  it('wraps effects in the province on screen', () => {
    const s = buildScript('add_base_tax = 1', { kind: 'province', province: 295 }, 'effect', 't');
    expect(s.text).toBe('295 = {\nadd_base_tax = 1\n}\n');
    expect(s.firstLine).toBe(2);
  });

  it('checks a trigger with a logged answer', () => {
    const s = buildScript('adm_tech = 5', { kind: 'country' }, 'trigger', 'abc');
    expect(s.text.split('\n')).toEqual([
      'if = {',
      'limit = {',
      'adm_tech = 5',
      '}',
      'log = "ETCH_CHECK abc TRUE"',
      '}',
      'else = {',
      'log = "ETCH_CHECK abc FALSE"',
      '}',
      '',
    ]);
    expect(s.firstLine).toBe(3);
  });

  it('checks a trigger in a province', () => {
    const s = buildScript('is_capital = yes', { kind: 'province', province: 1 }, 'trigger', 'x');
    expect(s.text.startsWith('1 = {\nif = {\nlimit = {\nis_capital = yes\n')).toBe(true);
    expect(s.text.endsWith('}\n}\n')).toBe(true);
    expect(s.firstLine).toBe(4);
  });
});

describe('readCheck', () => {
  it('finds its own answer only', () => {
    const lines = [
      '[effectimplementation.cpp:1]: EVENT [1719.3.17]:ETCH_CHECK other FALSE',
      '[effectimplementation.cpp:1]: EVENT [1719.3.17]:ETCH_CHECK mine TRUE',
    ];
    expect(readCheck(lines, 'mine')).toBe(true);
    expect(readCheck(lines, 'other')).toBe(false);
    expect(readCheck(lines, 'none')).toBeUndefined();
    expect(readCheck(['ETCH_CHECK mine TRUEISH'], 'mine')).toBeUndefined();
  });
});

describe('mapRunErrors', () => {
  it('maps a parsing error to the selection line it names', () => {
    const script = buildScript(
      'a = 1\nbad_key = 2\nb = 3',
      { kind: 'province', province: 9 },
      'effect',
      't',
    );
    const errors = mapRunErrors(
      [
        { line: 'Parsing Error. Error: Unknown effect type. Key: bad_key, near line: 3', count: 1 },
        { line: 'Something else', count: 2 },
        { line: 'Error near line: 1', count: 1 },
      ],
      script,
      3,
    );
    expect(errors.map((e) => e.selectionLine)).toEqual([1, undefined, undefined]);
    expect(errors[1]?.count).toBe(2);
  });
});

describe('blockAtLine', () => {
  const text = [
    'add_treasury = 100 # money',
    'capital_scope = {',
    '  add_base_tax = 1 # a } in a comment',
    '  name = "a { b"',
    '}',
    '',
    '# a comment',
    'open = {',
  ].join('\n');
  const lineStart = (n: number): number =>
    text
      .split('\n')
      .slice(0, n)
      .reduce((sum, line) => sum + line.length + 1, 0);
  const at = (n: number): string | undefined => {
    const b = blockAtLine(text, lineStart(n));
    return b === undefined ? undefined : text.slice(b.start, b.end);
  };

  it('takes a statement without its comment', () => {
    expect(at(0)).toBe('add_treasury = 100');
  });

  it('takes a block, skipping braces in comments and strings', () => {
    expect(at(1)).toBe(
      'capital_scope = {\n  add_base_tax = 1 # a } in a comment\n  name = "a { b"\n}',
    );
    expect(at(2)).toBe('add_base_tax = 1');
  });

  it('takes nothing on an empty line, a comment, a closing brace or an open block', () => {
    expect(at(4)).toBeUndefined();
    expect(at(5)).toBeUndefined();
    expect(at(6)).toBeUndefined();
    expect(at(7)).toBeUndefined();
  });
});

describe('unbalancedBraces', () => {
  it('passes balanced blocks, braces in comments and strings left out', () => {
    expect(unbalancedBraces('a = { b = { c = 1 } }')).toBeUndefined();
    expect(unbalancedBraces('a = { # }\n}')).toBeUndefined();
    expect(unbalancedBraces('name = "{"\nx = 1')).toBeUndefined();
  });

  it('names an open block and a stray closing brace', () => {
    expect(unbalancedBraces('capital_scope = {\nadd_base_tax = 1')).toBe('1 `{` is not closed');
    expect(unbalancedBraces('a = { b = {')).toBe('2 `{` are not closed');
    expect(unbalancedBraces('add_base_tax = 1 }')).toMatch(/closes a block/);
  });
});

describe('encodeScript', () => {
  it('writes Windows-1252 and counts what it cannot write', () => {
    const { bytes, lost } = encodeScript('name = "Łódź é €"');
    expect(lost).toBe(2); // Ł and ź; ó, é and € have bytes
    expect(bytes[bytes.length - 2]).toBe(0x80);
    expect(Array.from(bytes).includes(0xe9)).toBe(true);
  });
});

describe('RunMarks', () => {
  it('marks saves written while a Run is behind the running game', () => {
    const marks = new RunMarks();
    expect(marks.isAfterRun(100)).toBe(false);
    marks.open(1_000);
    marks.open(1_500); // still the same span
    expect(marks.openNow).toBe(true);
    expect(marks.isAfterRun(999)).toBe(false);
    expect(marks.isAfterRun(2_000)).toBe(true);
    marks.close(3_000);
    expect(marks.openNow).toBe(false);
    expect(marks.isAfterRun(3_001)).toBe(false);
    expect(marks.all).toEqual([{ from: 1_000, to: 3_000 }]);
    marks.close(4_000); // nothing open
    expect(marks.all).toHaveLength(1);
  });

  it('keeps the latest spans only', () => {
    const marks = new RunMarks();
    for (let i = 0; i < 70; i++) {
      marks.open(i * 10);
      marks.close(i * 10 + 5);
    }
    expect(marks.all).toHaveLength(64);
    expect(marks.isAfterRun(2)).toBe(false);
    expect(marks.isAfterRun(692)).toBe(true);
  });
});
