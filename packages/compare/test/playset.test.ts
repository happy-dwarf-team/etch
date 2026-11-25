/// <reference types="node" />
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashModFolder, type CorpusManifest, type CorpusPlayset } from '@etch/core/corpus';
import type { LiveSnapshot } from '@etch/core/profile';
import type { DiscoveryEnvironment } from '@etch/core/playset';
import { CorpusPlaysetFiles, writtenTextsShown } from '../src/playset.ts';

const EXE = 'not really eu4.exe';
const EXE_SHA256 = createHash('sha256').update(EXE).digest('hex').toUpperCase();
const GAME = 'lib/steamapps/common/Europa Universalis IV';
const WORKSHOP = 'lib/steamapps/workshop/content/236850';

const GUI = `guiTypes = {
	windowType = {
		name = "test_window"
		position = { x = 10 y = 20 }
		size = { x = 300 y = 200 }
		orientation = "UPPER_LEFT"
		instantTextBoxType = {
			name = "title"
			position = { x = 5 y = 5 }
			font = "vic_18"
			maxWidth = 100
			maxHeight = 20
			text = "TEST_TITLE"
		}
	}
	positionType = { name = "test_anchor" position = { x = 1 y = 1 } }
}
`;

async function addFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

function manifest(exeSha256 = EXE_SHA256): CorpusManifest {
  return { game: { version: '1.37.5', exeSha256 } } as unknown as CorpusManifest;
}

/** What the game showed of test_window: the window, and its title at `titleX`. */
function snapshot(titleX: number, title = 'Live title'): LiveSnapshot {
  return {
    formatVersion: 1,
    window: 'test_window',
    takenAt: '2026-11-18T06:00:00Z',
    screen: { width: 1920, height: 1080 },
    stale: 0,
    widgets: [
      {
        path: 'test_window',
        type: 'window',
        visible: true,
        enabled: true,
        checked: false,
        text: undefined,
        rect: [10, 20, 300, 200],
      },
      {
        path: 'test_window/title',
        type: 'instanttextbox',
        visible: true,
        enabled: true,
        checked: false,
        text: title,
        rect: [titleX, 25, 100, 20],
      },
    ],
  } as unknown as LiveSnapshot;
}

/** A profile whose `shift` selector only moves the title, 20 pixels to the right at `yes`. */
const SHIFT_PROFILE = JSON.stringify({
  formatVersion: 1,
  window: 'test_window',
  checkedWith: '1.37.5',
  selectors: {
    shift: {
      kind: 'ui',
      label: 'Shift',
      values: { no: 'In place', yes: 'Shifted' },
      default: 'no',
      note: 'A test.',
    },
  },
  rules: {
    shifted: {
      note: 'A test.',
      when: { shift: 'yes' },
      offset: { 'test_window/title': { x: 20 } },
    },
  },
});

/** A profile whose `word` selector only writes the title's text. */
const WORD_PROFILE = JSON.stringify({
  formatVersion: 1,
  window: 'test_window',
  checkedWith: '1.37.5',
  selectors: {
    word: {
      kind: 'ui',
      label: 'Word',
      values: { first: 'First', second: 'Second' },
      default: 'first',
      note: 'A test.',
    },
  },
  rules: {
    first: {
      note: 'A test.',
      when: { word: 'first' },
      text: { 'test_window/title': { literal: 'One' } },
    },
    second: {
      note: 'A test.',
      when: { word: 'second' },
      text: { 'test_window/title': [{ literal: '§YTwo§!' }, { key: 'TEST_TITLE', suffix: '!' }] },
    },
  },
});

function playset(mods: CorpusPlayset['mods'] = []): CorpusPlayset {
  return {
    id: 'test',
    title: 'Test',
    gate: 'report',
    mods,
    disabledDlcs: [],
    windows: [],
  };
}

describe('CorpusPlaysetFiles', () => {
  let root: string;
  let game: string;
  let environment: DiscoveryEnvironment;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'etch-compare-playset-'));
    game = join(root, ...GAME.split('/'));
    await addFiles(root, {
      [`${GAME}/eu4.exe`]: EXE,
      [`${GAME}/interface/test.gui`]: GUI,
      [`${GAME}/interface/test.gfx`]:
        'spriteTypes = { spriteType = { name = "GFX_test" texturefile = "gfx/interface/test.dds" } }\n',
      [`${GAME}/gfx/interface/test.dds`]: 'not really a texture',
      [`${GAME}/localisation/test_l_english.yml`]: '﻿l_english:\n TEST_TITLE:0 "A title"\n',
      [`${WORKSHOP}/111/descriptor.mod`]: 'name="Pinned"\nsupported_version="1.37.*"\n',
      [`${WORKSHOP}/111/interface/test.gui`]: GUI.replace('x = 300', 'x = 400'),
    });
    environment = {
      readRegistryValue: () => Promise.resolve(undefined),
      env: { USERPROFILE: join(root, 'home') },
      homedir: join(root, 'home'),
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const open = (
    p: CorpusPlayset = playset(),
    m: CorpusManifest = manifest(),
  ): Promise<CorpusPlaysetFiles> => CorpusPlaysetFiles.open(m, p, { gamePath: game, environment });

  it('reads the game alone and lays out its windows', async () => {
    const files = await open();
    expect(files.id).toBe('test');
    expect(files.topLevel()).toEqual([
      { kind: 'windowType', name: 'test_window', file: 'interface/test.gui' },
      { kind: 'positionType', name: 'test_anchor', file: 'interface/test.gui' },
    ]);
    expect(files.definition('test_window')?.name).toBe('test_window');
    expect(files.definition('no_such_window')).toBeUndefined();
    expect(files.localise('TEST_TITLE')).toBe('A title');
    expect(files.localise('NO_SUCH_KEY')).toBeUndefined();
    expect(files.fileOf('gfx/interface/test.dds')).toBe(join(game, 'gfx', 'interface', 'test.dds'));
    expect(files.fileOf('gfx/interface/missing.dds')).toBeUndefined();

    const plan = await files.window('test_window', { width: 1920, height: 1080 });
    const window = plan?.layout.widgets.find((w) => w.parent === -1);
    expect(window).toMatchObject({ x: 10, y: 20, width: 300, height: 200 });
    expect(await files.window('no_such_window', { width: 1920, height: 1080 })).toBeUndefined();
    // The game's code sets some windows' size; the view's `codeSized` replaces the .gui's.
    const sized = await files.window(
      'test_window',
      { width: 1920, height: 1080 },
      {
        width: 500,
        height: 100,
      },
    );
    expect(sized?.layout.widgets.find((w) => w.parent === -1)).toMatchObject({
      width: 500,
      height: 100,
    });
  });

  it('takes a mod by its Workshop item and checks it against its pinned hash', async () => {
    const folder = join(root, ...WORKSHOP.split('/'), '111');
    const sha256 = await hashModFolder(folder);
    const files = await open(playset([{ name: 'Pinned', workshopId: '111', sha256 }]));
    const plan = await files.window('test_window', { width: 1920, height: 1080 });
    expect(plan?.layout.widgets.find((w) => w.parent === -1)?.width).toBe(400);

    await expect(
      open(playset([{ name: 'Pinned', workshopId: '111', sha256: '0'.repeat(64) }])),
    ).rejects.toThrow('The mod "Pinned" is not the version the playset "test" pins.');
  });

  it('refuses a playset whose mods it cannot all find', async () => {
    await expect(open(playset([{ name: 'Not Installed', workshopId: '999' }]))).rejects.toThrow(
      /Found 0 of the 1 mods of the playset "test"|Not Installed/,
    );
  });

  it('refuses a game build other than the one the manifest pins', async () => {
    await expect(open(playset(), manifest('A'.repeat(64)))).rejects.toThrow();
  });

  it('refuses when no game is given and Steam has none', async () => {
    await expect(CorpusPlaysetFiles.open(manifest(), playset(), { environment })).rejects.toThrow(
      'EU4 was not found in Steam; set ETCH_GAME_PATH to the game folder.',
    );
  });

  it('has no profile of a window without one, nor of a window the playset lacks', async () => {
    const files = await open();
    const profiles = join(root, 'profiles');
    expect(await files.profile(profiles, 'test_window')).toBeUndefined();
    expect(await files.profile(profiles, 'no_such_window')).toBeUndefined();
  });

  it("reads Etch's profile of a window, the vanilla layer first, and checks it", async () => {
    const profiles = join(root, 'profiles');
    await addFiles(profiles, {
      'vanilla/test_window.jsonc': JSON.stringify({
        formatVersion: 1,
        window: 'test_window',
        checkedWith: '1.37.5',
        rules: { 'no-title': { note: 'A test.', hide: ['test_window/title'] } },
      }),
      'vanilla/broken.jsonc': '{ not json',
      'vanilla/readme.txt': 'not a profile',
      'other/unrelated.jsonc': JSON.stringify({
        formatVersion: 1,
        window: 'unrelated_window',
        checkedWith: '1.37.5',
        rules: {},
      }),
    });
    const files = await open();
    const loaded = await files.profile(profiles, 'TEST_WINDOW');
    expect(loaded?.window.name).toBe('test_window');
    expect(loaded?.problems).toEqual([]);
    expect(loaded?.profile.rules.map((r) => r.id)).toEqual(['no-title']);

    await addFiles(profiles, {
      'vanilla/test_window.jsonc': JSON.stringify({
        formatVersion: 1,
        window: 'test_window',
        checkedWith: '1.37.5',
        rules: { 'no-title': { note: 'A test.', hide: ['test_window/no_such_widget'] } },
      }),
    });
    const again = await (await open()).profile(profiles, 'test_window');
    expect(again?.problems.length).toBeGreaterThan(0);
  });

  it('lays out a window from a live snapshot, with and without a profile', async () => {
    const files = await open();
    const screen = { width: 1920, height: 1080 };
    const plain = await files.livePreview('test_window', screen, snapshot(15), undefined);
    expect(plain?.unknownSelectors).toEqual([]);
    expect(plain?.texts).toBeDefined();
    expect(plain?.window.layout.widgets.find((w) => w.parent === -1)).toMatchObject({
      x: 10,
      y: 20,
    });
    expect(
      await files.livePreview('no_such_window', screen, snapshot(15), undefined),
    ).toBeUndefined();

    const profiles = join(root, 'profiles');
    await addFiles(profiles, { 'vanilla/test_window.jsonc': SHIFT_PROFILE });
    const loaded = await files.profile(profiles, 'test_window');
    expect(loaded?.problems).toEqual([]);
    const live = await files.livePreview('test_window', screen, snapshot(35), loaded, {
      width: 320,
      height: 210,
    });
    expect(live?.unknownSelectors).toEqual([]);
    expect(live?.window.layout.widgets.find((w) => w.parent === -1)).toMatchObject({
      width: 320,
      height: 210,
    });
  });

  it('sets a selector that only moves widgets to the value that puts them where the game has them', async () => {
    const files = await open();
    const screen = { width: 1920, height: 1080 };
    const profiles = join(root, 'profiles');
    await addFiles(profiles, { 'vanilla/test_window.jsonc': SHIFT_PROFILE });
    const loaded = await files.profile(profiles, 'test_window');
    if (loaded === undefined) throw new Error('no profile');
    const titleX = async (gameX: number): Promise<number | undefined> => {
      const plan = await files.profilePreview('test_window', screen, snapshot(gameX), loaded);
      return plan?.layout.widgets.find((w) => w.widget.name === 'title')?.x;
    };
    expect(await titleX(35)).toBe(35);
    expect(await titleX(15)).toBe(15);
    // Neither value fits: the default.
    expect(await titleX(500)).toBe(15);
    expect(
      await files.profilePreview('no_such_window', screen, snapshot(15), loaded),
    ).toBeUndefined();
  });

  it("tells apart a selector's values whose texts give the same rects by the game's text", async () => {
    const files = await open();
    const profiles = join(root, 'profiles');
    await addFiles(profiles, { 'vanilla/test_window.jsonc': WORD_PROFILE });
    const loaded = await files.profile(profiles, 'test_window');
    if (loaded === undefined) throw new Error('no profile');
    const localise = (key: string): string | undefined =>
      key === 'TEST_TITLE' ? 'Title' : undefined;
    const shown = (word: string | undefined, text: string): number =>
      writtenTextsShown(
        loaded.profile,
        word === undefined ? {} : { word },
        snapshot(15, text),
        localise,
      );
    // Colour codes are left out of both, and a selector left out is at its default.
    expect(shown('second', 'TwoTitle!')).toBe(1);
    expect(shown('second', '§GTwo§!Title!')).toBe(1);
    expect(shown('first', 'TwoTitle!')).toBe(0);
    expect(shown(undefined, 'One')).toBe(1);
    expect(shown('second', 'One')).toBe(0);
  });

  it('lays out the offline preview of Compare with Live Game, with and without a profile', async () => {
    const files = await open();
    const screen = { width: 1920, height: 1080 };
    const outline = await files.offlinePreview('test_window', screen, snapshot(15), undefined);
    expect(outline?.layout.widgets.find((w) => w.parent === -1)).toMatchObject({ x: 10, y: 20 });
    expect(
      await files.offlinePreview('no_such_window', screen, snapshot(15), undefined),
    ).toBeUndefined();
    const profiles = join(root, 'profiles');
    await addFiles(profiles, { 'vanilla/test_window.jsonc': SHIFT_PROFILE });
    const loaded = await files.profile(profiles, 'test_window');
    const profiled = await files.offlinePreview('test_window', screen, snapshot(35), loaded, {
      width: 330,
      height: 200,
    });
    expect(profiled?.layout.widgets.find((w) => w.parent === -1)?.width).toBe(330);
  });
});
