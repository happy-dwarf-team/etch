import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathKey, samePath } from '../../src/playset/locate.ts';

describe('pathKey', () => {
  it('compares paths without regard to case, separators or a trailing separator', () => {
    const dir = resolve('Games', 'EU4');
    expect(pathKey(`${dir}${sep}${sep}`)).toBe(pathKey(dir));
    expect(pathKey(dir)).toBe(dir.replaceAll('\\', '/').toLowerCase());
    expect(samePath(`${dir}/`, dir.toUpperCase())).toBe(true);
  });

  it('runs in time linear in a long run of separators', () => {
    // resolve() collapses the run already; the trim no longer relies on it, as /\/+$/ did
    // (quadratic in a run that does not end the path, CodeQL js/polynomial-redos).
    const started = performance.now();
    expect(pathKey(`a${'/'.repeat(100_000)}b`)).toBe(
      resolve('a', 'b').replaceAll('\\', '/').toLowerCase(),
    );
    expect(performance.now() - started).toBeLessThan(250);
  });
});
