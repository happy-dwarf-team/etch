// The checks of the corpus's JSON files, each on its own: what every check gives back and the
// problem it reports, with where it is.
import { describe, expect, it } from 'vitest';
import { Checker, ID, SHA256, field } from '../../src/corpus/check.ts';

describe('Checker', () => {
  it('reports a value that is not an object, and unknown and missing fields', () => {
    const c = new Checker();
    expect(c.object([], 'a', [])).toBeUndefined();
    expect(c.object(null, 'b', [])).toBeUndefined();
    expect(c.object({ x: 1, y: 2 }, '', ['x', 'z'], ['w'])).toEqual({ x: 1, y: 2 });
    expect(c.object({ y: 2 }, 'top', [], ['y'])).toEqual({ y: 2 });
    expect(c.problems).toEqual([
      { at: 'a', message: 'Expected an object.' },
      { at: 'b', message: 'Expected an object.' },
      { at: 'y', message: 'Unknown field "y".' },
      { at: '', message: 'Missing field "z".' },
    ]);
  });

  it('takes any keys in a map, but only an object', () => {
    const c = new Checker();
    expect(c.map({ any: 1 }, 'm')).toEqual({ any: 1 });
    expect(c.map('text', 'm')).toBeUndefined();
    expect(c.map([1], 'n')).toBeUndefined();
    expect(c.problems.map((p) => p.at)).toEqual(['m', 'n']);
  });

  it('checks every item of an array, keeping the good ones, and an empty one if asked', () => {
    const c = new Checker();
    const item = (v: unknown, at: string) => c.integer(v, at, 1);
    expect(c.array(undefined, 'list', item)).toBeUndefined();
    expect(c.array({}, 'list', item)).toBeUndefined();
    expect(c.array([], 'empty', item, true)).toEqual([]);
    expect(c.array([], 'allowed', item)).toEqual([]);
    expect(c.array([3, 0, 'x', 5], 'ids', item)).toEqual([3, 5]);
    expect(c.problems).toEqual([
      { at: 'list', message: 'Expected an array.' },
      { at: 'empty', message: 'Expected at least one item.' },
      { at: 'ids[1]', message: 'Expected at least 1.' },
      { at: 'ids[2]', message: 'Expected an integer.' },
    ]);
  });

  it('wants non-empty strings, and names the pattern a string does not match', () => {
    const c = new Checker();
    expect(c.string(undefined, 's')).toBeUndefined();
    expect(c.string('ok', 's')).toBe('ok');
    expect(c.string('  ', 'blank')).toBeUndefined();
    expect(c.string(7, 'number')).toBeUndefined();
    expect(c.string('a-b', 'id', ID, 'an id')).toBe('a-b');
    expect(c.string('A_B', 'id', ID, 'an id')).toBeUndefined();
    expect(c.string('abc', 'hash', SHA256)).toBeUndefined();
    expect(c.problems).toEqual([
      { at: 'blank', message: 'Expected a non-empty string.' },
      { at: 'number', message: 'Expected a non-empty string.' },
      { at: 'id', message: '"A_B" is not an id.' },
      { at: 'hash', message: `"abc" is not a match of ${String(SHA256)}.` },
    ]);
  });

  it('checks booleans, integers with a minimum, and a choice of strings', () => {
    const c = new Checker();
    expect(c.boolean(undefined, 'b')).toBeUndefined();
    expect(c.boolean(false, 'b')).toBe(false);
    expect(c.boolean('yes', 'b')).toBeUndefined();
    expect(c.integer(undefined, 'i')).toBeUndefined();
    expect(c.integer(-4, 'i')).toBe(-4);
    expect(c.integer(1.5, 'half')).toBeUndefined();
    expect(c.integer('2', 'text')).toBeUndefined();
    expect(c.integer(0, 'low', 1)).toBeUndefined();
    expect(c.oneOf(undefined, 'o', ['a', 'b'])).toBeUndefined();
    expect(c.oneOf('b', 'o', ['a', 'b'])).toBe('b');
    expect(c.oneOf('c', 'o', ['a', 'b'])).toBeUndefined();
    expect(c.oneOf(1, 'n', ['a'])).toBeUndefined();
    expect(c.problems).toEqual([
      { at: 'b', message: 'Expected true or false.' },
      { at: 'half', message: 'Expected an integer.' },
      { at: 'text', message: 'Expected an integer.' },
      { at: 'low', message: 'Expected at least 1.' },
      { at: 'o', message: 'Expected one of "a", "b".' },
      { at: 'n', message: 'Expected one of "a".' },
    ]);
  });

  it('reports a repeated value at each repeat after the first, and skips missing ones', () => {
    const c = new Checker();
    c.unique(['a', undefined, 'b', 'a', undefined, 'a'], (i) => `ids[${String(i)}]`, 'id');
    expect(c.problems).toEqual([
      { at: 'ids[3]', message: 'The id "a" occurs more than once.' },
      { at: 'ids[5]', message: 'The id "a" occurs more than once.' },
    ]);
  });
});

describe('field', () => {
  it('extends a path, or starts one at the root', () => {
    expect(field('', 'windows')).toBe('windows');
    expect(field('windows[2]', 'id')).toBe('windows[2].id');
  });
});

describe('patterns', () => {
  it('take uppercase SHA-256 and lowercase dashed ids', () => {
    expect(SHA256.test('A'.repeat(64))).toBe(true);
    expect(SHA256.test('a'.repeat(64))).toBe(false);
    expect(SHA256.test('A'.repeat(63))).toBe(false);
    expect(['vanilla', 'main-menu', 'a1-b2'].every((id) => ID.test(id))).toBe(true);
    expect(['', '-a', 'a-', 'a--b', 'Main'].some((id) => ID.test(id))).toBe(false);
  });
});
