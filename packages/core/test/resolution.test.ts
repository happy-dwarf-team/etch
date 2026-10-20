import { describe, expect, it } from 'vitest';
import {
  CORPUS_RESOLUTIONS,
  FALLBACK_SCREEN,
  choosePreviewResolution,
  formatResolution,
  parseResolution,
  resolutionSetting,
} from '../src/index.ts';

describe('parseResolution', () => {
  it('reads default, native and sizes', () => {
    expect(parseResolution('default')).toEqual({ kind: 'default' });
    expect(parseResolution('')).toEqual({ kind: 'default' });
    expect(parseResolution(' Native ')).toEqual({ kind: 'native' });
    expect(parseResolution('1920x1080')).toEqual({
      kind: 'size',
      screen: { width: 1920, height: 1080 },
    });
    expect(parseResolution('3440 × 1440')).toEqual({
      kind: 'size',
      screen: { width: 3440, height: 1440 },
    });
    expect(parseResolution('1280*720')).toEqual({
      kind: 'size',
      screen: { width: 1280, height: 720 },
    });
  });

  it('refuses anything else', () => {
    for (const bad of [
      '1920',
      '1920x',
      'x1080',
      '1920x1080.5',
      '-1x5',
      '8x8',
      '20000x1080',
      'big',
    ]) {
      expect(parseResolution(bad), bad).toBeUndefined();
    }
  });

  it('round-trips through the setting', () => {
    for (const screen of CORPUS_RESOLUTIONS) {
      const choice = { kind: 'size', screen } as const;
      expect(parseResolution(resolutionSetting(choice))).toEqual(choice);
    }
    expect(resolutionSetting({ kind: 'native' })).toBe('native');
    expect(resolutionSetting({ kind: 'default' })).toBe('default');
  });

  it('lists the six corpus resolutions', () => {
    expect(CORPUS_RESOLUTIONS.map(formatResolution)).toEqual([
      '1280×720',
      '1366×768',
      '1600×900',
      '1680×1050',
      '1920×1080',
      '3440×1440',
    ]);
  });
});

describe('choosePreviewResolution', () => {
  const player = { width: 1600, height: 900 };
  const native = { width: 2560, height: 1440 };

  it('takes the player resolution by default, else the native one', () => {
    expect(choosePreviewResolution({ kind: 'default' }, { player, native })).toEqual({
      screen: player,
      source: 'settings.txt',
    });
    expect(choosePreviewResolution({ kind: 'default' }, { native })).toEqual({
      screen: native,
      source: 'native',
    });
  });

  it('falls back until the monitor is known', () => {
    expect(choosePreviewResolution({ kind: 'default' }, {})).toEqual({
      screen: FALLBACK_SCREEN,
      source: 'fallback',
    });
    expect(choosePreviewResolution({ kind: 'native' }, { player })).toEqual({
      screen: FALLBACK_SCREEN,
      source: 'fallback',
    });
  });

  it('takes a chosen size or the native resolution over the player one', () => {
    const screen = { width: 1366, height: 768 };
    expect(choosePreviewResolution({ kind: 'size', screen }, { player, native })).toEqual({
      screen,
      source: 'setting',
    });
    expect(choosePreviewResolution({ kind: 'native' }, { player, native })).toEqual({
      screen: native,
      source: 'native',
    });
  });
});
