import { describe, expect, it } from 'vitest';
import { parseScript } from '../src/index.ts';
import type { EntryNode, ValueNode } from '../src/index.ts';
import { rangeProblems } from './script-invariants.ts';

type Shape = string | null | Shape[] | { [key: string]: Shape };

/** A compact view of a tree: `key` for `=`, `key <op>` for other operators, `key {` for none. */
function shape(entries: readonly EntryNode[]): Shape[] {
  const value = (node: ValueNode | undefined): Shape => {
    if (!node) return null;
    if (node.kind === 'block') return shape(node.entries);
    return node.quoted ? `"${node.text}"` : node.text;
  };
  return entries.map((entry) => {
    if (entry.kind !== 'property') return value(entry);
    const op = entry.operator?.text;
    const key = op === '=' ? entry.key.text : `${entry.key.text} ${op ?? '{'}`;
    return { [key]: value(entry.value) };
  });
}

function parse(text: string) {
  const parsed = parseScript(text);
  expect(rangeProblems(text, parsed)).toEqual([]);
  return parsed;
}

function codes(text: string): string[] {
  return parse(text).diagnostics.map((d) => d.code);
}

describe('parseScript', () => {
  it('parses a window in file order with duplicate keys kept', () => {
    const text = `# A hand-written window
guiTypes = {
\twindowType = {
\t\tname = "test_window"
\t\tposition = { x = 10 y = -20 }
\t\tOrientation = UPPER_LEFT
\t\ticonType = { name = "a" spriteType = "GFX_a" }
\t\ticonType = { name = "a" spriteType = "GFX_b" } # same name again
\t}
}
`;
    const parsed = parse(text);
    expect(parsed.diagnostics).toEqual([]);
    expect(shape(parsed.entries)).toEqual([
      {
        guiTypes: [
          {
            windowType: [
              { name: '"test_window"' },
              { position: [{ x: '10' }, { y: '-20' }] },
              { Orientation: 'UPPER_LEFT' },
              { iconType: [{ name: '"a"' }, { spriteType: '"GFX_a"' }] },
              { iconType: [{ name: '"a"' }, { spriteType: '"GFX_b"' }] },
            ],
          },
        ],
      },
    ]);
  });

  it('gives every key, operator, value and block its source range', () => {
    const text = 'a = { b = "c d" }';
    const [a] = parse(text).entries;
    if (a?.kind !== 'property' || a.value?.kind !== 'block') throw new Error('expected a = { … }');
    expect([a.start, a.end]).toEqual([0, 17]);
    expect([a.key.start, a.key.end]).toEqual([0, 1]);
    expect(a.operator).toEqual({ kind: 'operator', text: '=', start: 2, end: 3 });
    expect([a.value.start, a.value.end, a.value.closed]).toEqual([4, 17, true]);
    const [b] = a.value.entries;
    if (b?.kind !== 'property') throw new Error('expected b = …');
    expect([b.start, b.end]).toEqual([6, 15]);
    expect(b.value).toEqual({ kind: 'scalar', text: 'c d', quoted: true, start: 10, end: 15 });
  });

  it('keeps bare values and anonymous blocks', () => {
    const text = 'cursor_offset = { -5 -4 }\ncolor = { 1.0 0.5 0 }\nlist = { { a = 1 } { a = 2 } }';
    expect(shape(parse(text).entries)).toEqual([
      { cursor_offset: ['-5', '-4'] },
      { color: ['1.0', '0.5', '0'] },
      { list: [[{ a: '1' }], [{ a: '2' }]] },
    ]);
  });

  it('reads `key { … }` without an operator as a property', () => {
    const parsed = parse('instantTextBoxType\n{\n  position { x = 1 }\n}');
    expect(parsed.diagnostics).toEqual([]);
    expect(shape(parsed.entries)).toEqual([
      { 'instantTextBoxType {': [{ 'position {': [{ x: '1' }] }] },
    ]);
    const [entry] = parsed.entries;
    expect(entry?.kind === 'property' && entry.operator).toBe(undefined);
  });

  it('reads every comparison operator', () => {
    const parsed = parse('a<1 b<=2 c>3 d>=4 e!=5 f==6 g?=7 h=8');
    expect(parsed.diagnostics).toEqual([]);
    expect(shape(parsed.entries)).toEqual([
      { 'a <': '1' },
      { 'b <=': '2' },
      { 'c >': '3' },
      { 'd >=': '4' },
      { 'e !=': '5' },
      { 'f ==': '6' },
      { 'g ?=': '7' },
      { h: '8' },
    ]);
  });

  it('keeps ! and ? inside words when no = follows', () => {
    expect(shape(parse('a = what?! b = !x').entries)).toEqual([{ a: 'what?!' }, { b: '!x' }]);
  });

  it('skips comments, including braces and quotes in them, but not # in strings', () => {
    const text = 'a = 1 # } { " = \r\nb = "#2" #\nc = 3#';
    const parsed = parse(text);
    expect(parsed.diagnostics).toEqual([]);
    expect(shape(parsed.entries)).toEqual([{ a: '1' }, { b: '"#2"' }, { c: '3' }]);
  });

  it('keeps backslashes in strings as written', () => {
    const text = String.raw`a = "gfx\interface\a.dds" b = "gfx\\interface\\b.dds"`;
    expect(shape(parse(text).entries)).toEqual([
      { a: String.raw`"gfx\interface\a.dds"` },
      { b: String.raw`"gfx\\interface\\b.dds"` },
    ]);
  });

  it('keeps @ constants as words', () => {
    const text = '@offset = 12\nwindowType = { position = { x = @offset y = 0 } }';
    expect(shape(parse(text).entries)).toEqual([
      { '@offset': '12' },
      { windowType: [{ position: [{ x: '@offset' }, { y: '0' }] }] },
    ]);
  });

  it('keeps Windows-1252 characters and quoted keys', () => {
    expect(shape(parse('text = "2000¤ å" "quoted key" = x').entries)).toEqual([
      { text: '"2000¤ å"' },
      { 'quoted key': 'x' },
    ]);
  });

  it('parses empty text and comment-only text to nothing', () => {
    expect(parse('')).toEqual({ entries: [], diagnostics: [] });
    expect(parse('  # only a comment\r\n\t')).toEqual({ entries: [], diagnostics: [] });
  });

  describe('recovers from syntax errors', () => {
    it('closes unclosed blocks at the end of the text', () => {
      const text = 'a = {\n  b = {\n    c = 1\n';
      const parsed = parse(text);
      expect(parsed.diagnostics).toMatchObject([
        { code: 'unclosed-block', start: 4, end: 5 },
        { code: 'unclosed-block', start: 12, end: 13 },
      ]);
      expect(shape(parsed.entries)).toEqual([{ a: [{ b: [{ c: '1' }] }] }]);
      const [a] = parsed.entries;
      if (a?.kind !== 'property' || a.value?.kind !== 'block') throw new Error('expected a block');
      expect([a.value.closed, a.value.end, a.end]).toEqual([false, text.length, text.length]);
    });

    it('ignores a } that closes no block', () => {
      const parsed = parse('a = { b = 1 } }\nc = 2');
      expect(parsed.diagnostics).toMatchObject([{ code: 'unmatched-close', start: 14, end: 15 }]);
      expect(shape(parsed.entries)).toEqual([{ a: [{ b: '1' }] }, { c: '2' }]);
    });

    it('cuts an unterminated string at the end of its line', () => {
      const text = 'a = "open\r\nb = "closed"\nc = "';
      const parsed = parse(text);
      expect(parsed.diagnostics).toMatchObject([
        { code: 'unterminated-string', start: 4, end: 9 },
        { code: 'unterminated-string', start: 28, end: 29 },
      ]);
      expect(shape(parsed.entries)).toEqual([{ a: '"open"' }, { b: '"closed"' }, { c: '""' }]);
    });

    it('reports a missing value and keeps the property', () => {
      expect(codes('a =')).toEqual(['missing-value']);
      expect(shape(parse('x = { a = }').entries)).toEqual([{ x: [{ a: null }] }]);
      const parsed = parse('a =\nb = 2');
      expect(parsed.diagnostics).toMatchObject([{ code: 'missing-value', start: 2, end: 3 }]);
      expect(shape(parsed.entries)).toEqual([{ a: null }, { b: '2' }]);
      expect(shape(parse('a = = 1').entries)).toEqual([{ a: null }, '1']);
    });

    it('ignores an operator without a key', () => {
      const parsed = parse('{ = } = 1');
      expect(parsed.diagnostics.map((d) => d.code)).toEqual(['missing-key', 'missing-key']);
      expect(shape(parsed.entries)).toEqual([[], '1']);
    });

    it('reports diagnostics in text order', () => {
      const parsed = parse('} a = { b = "x\n');
      expect(parsed.diagnostics.map((d) => [d.code, d.start])).toEqual([
        ['unmatched-close', 0],
        ['unclosed-block', 6],
        ['unterminated-string', 12],
      ]);
    });

    it('survives deep nesting without recursion', () => {
      const depth = 100_000;
      const parsed = parseScript('{'.repeat(depth));
      expect(parsed.diagnostics).toHaveLength(depth);
      expect(parsed.entries).toHaveLength(1);
    });

    it('never throws and keeps ranges consistent on random input', () => {
      // A fixed linear congruential generator, so a failure reproduces.
      let seed = 27;
      const random = (n: number): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
      };
      const pieces = [
        'a',
        'b1',
        '-2.5',
        '"s t"',
        '"',
        '=',
        '<=',
        '!=',
        '?',
        '{',
        '}',
        '#c\n',
        ' ',
        '\n',
      ];
      for (let run = 0; run < 500; run++) {
        let text = '';
        const length = random(60);
        for (let i = 0; i < length; i++) text += pieces[random(pieces.length)] ?? '';
        parse(text);
      }
    });
  });
});
