import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findDefinition, parseScript, readGuiFile } from '../../src/index.ts';
import {
  GameFiles,
  PlaysetAssets,
  PlaysetInterface,
  layOutPreview,
} from '../../src/playset/index.ts';
import { addFiles, makeTree, removeTree, snapshotTree } from './fixture.ts';

const TINY = readFileSync(new URL('../fixtures/tiny.fnt', import.meta.url), 'utf8');

/** A DDS file of the given size: the header only, which is all layout reads. */
function ddsHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(128);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x20534444, true);
  view.setUint32(4, 124, true);
  view.setUint32(12, height, true);
  view.setUint32(16, width, true);
  return bytes;
}

const GUI = `guiTypes = { windowType = { name = "w" position = { x = 5 y = 5 }
  iconType = { name = "i" spriteType = "GFX_icon" }
  iconType = { name = "broken" spriteType = "GFX_broken" }
  instantTextBoxType = { name = "t" font = "tiny" text = "KEY" maxWidth = 50 position = { x = 0 y = 20 } }
} }`;

describe('PlaysetAssets and layOutPreview', () => {
  let game: string;
  let before: Map<string, string>;

  beforeAll(async () => {
    game = await makeTree({
      'interface/core.gfx':
        'spriteTypes = {\n' +
        '  spriteType = { name = "GFX_icon" textureFile = "gfx/interface/icon.tga" }\n' +
        '  spriteType = { name = "GFX_broken" textureFile = "gfx/interface/broken.dds" }\n' +
        '}\n' +
        'bitmapfonts = { bitmapfont = { name = "tiny" path = "gfx/fonts/tiny" } }',
      'interface/window.gui': GUI,
      'gfx/interface/icon.dds': ddsHeader(24, 12),
      'gfx/interface/broken.dds': 'not a texture',
      'gfx/fonts/tiny.fnt': TINY,
      'gfx/fonts/tiny.dds': ddsHeader(64, 64),
    });
    before = await snapshotTree(game);
  });

  afterAll(async () => {
    await removeTree(game);
  });

  it('loads the texture sizes and fonts a window needs, then lays it out', async () => {
    const playset = await PlaysetInterface.load(
      new GameFiles([{ name: 'game', root: game, replacePaths: [] }]),
    );
    const assets = new PlaysetAssets(playset);
    const file = readGuiFile(parseScript(GUI));
    const window = findDefinition(file, 'w');
    if (window === undefined) throw new Error('no window');
    const screen = { width: 640, height: 480 };
    const layout = await layOutPreview(playset, assets, file, window, {
      screen,
      localise: (text) => (text === 'KEY' ? 'ab' : text),
    });
    expect(layout.unloaded).toEqual([]);
    expect(layout.drawList.textures).toEqual(['gfx/interface/icon.dds', 'gfx/fonts/tiny.dds']);
    expect(layout.drawList.draws.map((d) => d.kind)).toEqual(['sprite', 'text']);
    expect(layout.drawList.draws[0]).toMatchObject({ x: 5, y: 5, width: 24, height: 12 });
    expect(layout.diagnostics.map((d) => d.code)).toEqual(['unreadable-file']);
    expect(assets.textureSize('gfx//interface//icon.dds')).toEqual({ width: 24, height: 12 });
    expect(assets.font('gfx/fonts/tiny.fnt')).toMatchObject({ lineHeight: 10 });
    // Loading reads the playset and never writes to it.
    expect(await snapshotTree(game)).toEqual(before);

    // A texture saved to disk is read again only after it is forgotten.
    await addFiles(game, { 'gfx/interface/icon.dds': ddsHeader(30, 10) });
    expect(await assets.load(['gfx/interface/icon.dds'])).toBe(0);
    assets.forget('gfx/interface/icon.dds');
    const again = await layOutPreview(playset, assets, file, window, { screen });
    expect(again.drawList.draws[0]).toMatchObject({ width: 30, height: 10 });
  });
});
