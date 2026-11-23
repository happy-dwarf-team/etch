import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { count, counted } from '../src/numbers.ts';

const src = fileURLToPath(new URL('../src/', import.meta.url));

/** The extension's TypeScript sources, as paths relative to `src`. */
function sources(dir = src): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return entry.name.endsWith('.ts') ? [path.relative(src, full).replaceAll(path.sep, '/')] : [];
  });
}

describe('numbers in messages', () => {
  it('have thousands separators (etch#648, finding P3.18)', () => {
    expect(count(7826)).toBe('7,826');
    expect(count(12)).toBe('12');
    expect(count(1_234_567)).toBe('1,234,567');
  });

  it('come with their noun, singular for one', () => {
    expect(counted(1, 'error.log line')).toBe('1 error.log line');
    expect(counted(2, 'error.log line')).toBe('2 error.log lines');
    expect(counted(0, 'character')).toBe('0 characters');
    expect(counted(7826, 'id or name', 'ids or names')).toBe('7,826 ids or names');
  });
});

describe('notifications', () => {
  it('go through notify(), except the modal dialogs (etch#648, finding P1.1)', () => {
    const direct = sources()
      .filter((file) => file !== 'notify.ts')
      .flatMap((file) => {
        const text = readFileSync(path.join(src, file), 'utf8');
        return [...text.matchAll(/\.show(?:Information|Warning|Error)Message\(/g)]
          .filter((m) => !text.slice(m.index, m.index + 400).includes('modal: true'))
          .map((m) => `${file}:${String(text.slice(0, m.index).split('\n').length)}`);
      });
    expect(direct).toEqual([]);
  });

  it('do not name a command for the user to type: they offer it as a button', () => {
    const named = sources().flatMap((file) => {
      const text = readFileSync(path.join(src, file), 'utf8');
      return [...text.matchAll(/notify\([^;]*?\(Etch: [^)]*\)/gs)].map((m) => `${file}: ${m[0]}`);
    });
    expect(named).toEqual([]);
  });
});
