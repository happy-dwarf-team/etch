import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { describeBuild, readStamp, sameBuild, type BuildStamp } from '../src/build-stamp.ts';

const stamp: BuildStamp = {
  version: '1.0.1',
  commit: 'abc1234',
  builtAt: '2026-10-31T21:00:00.000Z',
};

describe('build stamp', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'etch-build-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the stamp build.mts writes', async () => {
    const file = join(dir, 'build.json');
    await writeFile(file, `${JSON.stringify(stamp, undefined, 2)}\n`);
    expect(await readStamp(file)).toEqual(stamp);
  });

  it('has no stamp for a missing, broken or partial file', async () => {
    expect(await readStamp(join(dir, 'build.json'))).toBeUndefined();
    await writeFile(join(dir, 'broken.json'), '{');
    expect(await readStamp(join(dir, 'broken.json'))).toBeUndefined();
    await writeFile(join(dir, 'partial.json'), JSON.stringify({ version: '1.0.1' }));
    expect(await readStamp(join(dir, 'partial.json'))).toBeUndefined();
  });

  it('tells two builds of one version and commit apart by their time', () => {
    expect(sameBuild(stamp, { ...stamp })).toBe(true);
    expect(sameBuild(stamp, { ...stamp, builtAt: '2026-10-31T21:00:26.000Z' })).toBe(false);
    expect(sameBuild(stamp, { ...stamp, commit: 'def5678' })).toBe(false);
    expect(sameBuild(stamp, undefined)).toBe(false);
  });

  it('names a build by its version and commit', () => {
    expect(describeBuild(stamp)).toBe('1.0.1 (abc1234)');
  });
});
