import { describe, expect, it } from 'vitest';
import {
  away,
  list,
  lockMinutes,
  parseArgs,
  required,
  size,
} from '../../src/corpus/driver/cli-args.ts';
import { DEFAULT_AWAY } from '../../src/corpus/driver/view.ts';

const flags = (...argv: string[]): Map<string, string> => parseArgs(['run', ...argv]).flags;

describe('the capture driver command line', () => {
  it('reads the command and its flags, a flag without a value as true', () => {
    const parsed = parseArgs(['run', '--lab', 'C:/lab', '--all', '--monitor', '3440x1440']);
    expect(parsed.command).toBe('run');
    expect([...parsed.flags]).toEqual([
      ['lab', 'C:/lab'],
      ['all', 'true'],
      ['monitor', '3440x1440'],
    ]);
    expect(parseArgs([]).command).toBe('help');
    expect([...parseArgs(['plan', '--all']).flags]).toEqual([['all', 'true']]);
    expect(() => parseArgs(['run', 'stray'])).toThrow('Unexpected argument: stray');
    expect(() => parseArgs(['run', '--lab', 'a', 'b'])).toThrow('Unexpected argument: b');
  });

  it('splits lists without empty items', () => {
    expect(list(undefined)).toBeUndefined();
    expect(list('a, b,,c ')).toEqual(['a', 'b', 'c']);
    expect(list('')).toEqual([]);
  });

  it('reads a size as WxH', () => {
    expect(size('3440x1440', '--monitor')).toEqual({ width: 3440, height: 1440 });
    for (const bad of ['3440', '3440X1440', '3440x', 'x1440', ' 3440x1440']) {
      expect(() => size(bad, '--monitor')).toThrow('--monitor must be WxH, such as 3440x1440.');
    }
  });

  it('requires a value of a required flag', () => {
    expect(required(flags('--lab', 'C:/lab'), 'lab')).toBe('C:/lab');
    expect(() => required(flags(), 'lab')).toThrow('--lab is required.');
    expect(() => required(flags('--lab'), 'lab')).toThrow('--lab is required.');
  });

  it('takes the lock for 240 minutes by default, and only for 1 to 240', () => {
    expect(lockMinutes(flags())).toBe(240);
    expect(lockMinutes(flags('--lock-minutes', '1'))).toBe(1);
    expect(lockMinutes(flags('--lock-minutes', '240'))).toBe(240);
    for (const bad of ['0', '241', '1.5', 'abc', '-5']) {
      expect(() => lockMinutes(flags('--lock-minutes', bad))).toThrow(
        '--lock-minutes must be a whole number of minutes from 1 to 240.',
      );
    }
    // A flag without a value is no number either.
    expect(() => lockMinutes(flags('--lock-minutes'))).toThrow(/--lock-minutes must be/);
  });

  it('rests the pointer where the flags say, or at the defaults', () => {
    expect(away(flags())).toEqual(DEFAULT_AWAY);
    expect(away(flags('--away-menu', '1,0.5', '--away-save', 'ProvinceView'))).toEqual({
      'main-menu': { fraction: { x: 1, y: 0.5 } },
      save: { widget: 'ProvinceView' },
    });
    for (const bad of ['1', '1,2', '-0.1,1', 'a,b']) {
      expect(() => away(flags('--away-menu', bad))).toThrow(
        '--away-menu must be two fractions of the client area, such as 1,1.',
      );
    }
    expect(() => away(flags('--away-menu'))).toThrow(/--away-menu must be/);
    expect(() => away(flags('--away-save'))).toThrow('--away-save needs a widget pattern.');
  });
});
