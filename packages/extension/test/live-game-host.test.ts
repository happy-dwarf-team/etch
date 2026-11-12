import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { shellQuote } from '../src/live-game/host.ts';

const posix = process.platform === 'win32' ? describe.skip : describe;

posix('shellQuote', () => {
  // The words the shell sees must be exactly the strings that went in, whatever they contain.
  const awkward = [
    'plain',
    '/home/user/.local/state/etch',
    'with space',
    "o'brien",
    "'",
    "''",
    "a'b'c",
    '$(touch /tmp/etch-injected)',
    '`touch /tmp/etch-injected`',
    'semi; colon && amp | pipe',
    'back\\slash',
    'double"quote',
    'new\nline',
    '',
  ];

  it.each(awkward)('gives %j back unchanged', (value) => {
    const printed = execFileSync('sh', ['-c', `printf %s ${shellQuote(value)}`], {
      encoding: 'utf8',
    });
    expect(printed).toBe(value);
  });

  it('keeps several quoted words apart', () => {
    const words = ["o'brien", 'a b'];
    const script = `printf '%s\\n' ${words.map(shellQuote).join(' ')}`;
    expect(execFileSync('sh', ['-c', script], { encoding: 'utf8' })).toBe("o'brien\na b\n");
  });
});
