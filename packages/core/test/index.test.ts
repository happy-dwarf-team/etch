import { describe, expect, it } from 'vitest';
import { SUPPORTED_GAME_VERSION, isSupportedGameVersion } from '../src/index.ts';

describe('isSupportedGameVersion', () => {
  it('accepts the supported build', () => {
    expect(isSupportedGameVersion(SUPPORTED_GAME_VERSION)).toBe(true);
    expect(isSupportedGameVersion(' v1.37.5 ')).toBe(true);
  });

  it('rejects other builds', () => {
    expect(isSupportedGameVersion('1.37.4')).toBe(false);
    expect(isSupportedGameVersion('1.37.5.1')).toBe(false);
  });
});
