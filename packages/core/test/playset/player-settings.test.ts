import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parsePlayerSettings, readPlayerSettings } from '../../src/playset/index.ts';
import { makeTree, removeTree, snapshotTree } from './fixture.ts';

// The shape the game writes (1.37.5), trimmed.
const SETTINGS = `force_pow2_textures=no
language="l_english"
graphics={
	size={
		x=3440
		y=1440
	}

	min_gui={
		x=1280
		y=720
	}

	game_ui_scale=1.250
	refreshRate=144
	fullScreen=no
	borderless=yes
}
sound_fx_volume=100.000000
`;

describe('parsePlayerSettings', () => {
  it('reads the resolution and the UI scale', () => {
    expect(parsePlayerSettings(SETTINGS)).toEqual({
      screen: { width: 3440, height: 1440 },
      uiScale: 1.25,
    });
  });

  it('leaves out what is missing or not a number', () => {
    expect(parsePlayerSettings('language="l_english"\n')).toEqual({
      screen: undefined,
      uiScale: undefined,
    });
    expect(parsePlayerSettings('graphics={ size={ x=wide y=1080 } game_ui_scale=big }')).toEqual({
      screen: undefined,
      uiScale: undefined,
    });
    expect(parsePlayerSettings('graphics={ size={ x=0 y=1080 } game_ui_scale=0 }')).toEqual({
      screen: undefined,
      uiScale: undefined,
    });
  });

  it('keeps the last of a repeated key', () => {
    expect(
      parsePlayerSettings('graphics={ size={ x=1280 y=720 } size={ x=1920 y=1080 } }').screen,
    ).toEqual({ width: 1920, height: 1080 });
  });
});

describe('readPlayerSettings', () => {
  let profile: string;
  let before: Map<string, string>;

  beforeAll(async () => {
    profile = await makeTree({ 'settings.txt': SETTINGS });
    before = await snapshotTree(profile);
  });

  afterAll(async () => {
    expect(await snapshotTree(profile)).toEqual(before);
    await removeTree(profile);
  });

  it('reads settings.txt of a profile without changing it', async () => {
    expect(await readPlayerSettings(profile)).toEqual({
      screen: { width: 3440, height: 1440 },
      uiScale: 1.25,
    });
  });

  it('gives undefined without a profile or a settings.txt', async () => {
    expect(await readPlayerSettings(undefined)).toBeUndefined();
    expect(await readPlayerSettings(`${profile}/missing`)).toBeUndefined();
  });
});
