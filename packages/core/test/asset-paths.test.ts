import { describe, expect, it } from 'vitest';
import { assetKind, assetReferences, parseScript } from '../src/index.ts';

const references = (text: string) =>
  assetReferences(parseScript(text)).map(({ kind, written, candidates, folder, node }) => ({
    kind,
    written,
    candidates,
    folder,
    text: text.slice(node.start, node.end),
  }));

describe('assetReferences', () => {
  it('finds textures in spriteTypes, game-relative, the .dds of a .tga path first', () => {
    const text = `spriteTypes = {
	spriteType = {
		name = "GFX_a"
		texturefile = "gfx//interface//a.tga"
		effectFile = "gfx/FX/buttonstate.lua"
	}
	maskedShieldType = { name = "GFX_b" textureFile1 = gfx\\interface\\b.dds }
}`;
    expect(references(text)).toEqual([
      {
        kind: 'texture',
        written: 'gfx//interface//a.tga',
        candidates: ['gfx/interface/a.dds', 'gfx/interface/a.tga'],
        folder: 'game',
        text: '"gfx//interface//a.tga"',
      },
      {
        kind: 'texture',
        written: 'gfx\\interface\\b.dds',
        candidates: ['gfx/interface/b.dds'],
        folder: 'game',
        text: 'gfx\\interface\\b.dds',
      },
    ]);
  });

  it('puts a pdxmesh’s bare texture names in its mesh’s folder', () => {
    const text = `objectTypes = {
	pdxmesh = {
		name = "hub_mesh"
		file = "gfx/models/Mapitems/hub.mesh"
		meshsettings = {
			texture_diffuse = "hub_diffuse.dds"
			shader_file = "gfx/FX/pdxmesh.shader"
		}
		animation = { id = "idle" type = "hub_idle" }
	}
}`;
    expect(references(text)).toEqual([
      expect.objectContaining({ kind: 'mesh', candidates: ['gfx/models/Mapitems/hub.mesh'] }),
      expect.objectContaining({
        kind: 'texture',
        candidates: ['gfx/models/Mapitems/hub_diffuse.dds'],
        folder: 'game',
      }),
    ]);
  });

  it('keeps any other bare name in the naming file’s folder', () => {
    const text = `animation = {
	name = "AO_Eagle"
	file = "eagle_idle.anim"
}`;
    expect(references(text)).toEqual([
      {
        kind: 'animation',
        written: 'eagle_idle.anim',
        candidates: ['eagle_idle.anim'],
        folder: 'document',
        text: '"eagle_idle.anim"',
      },
    ]);
  });

  it('skips values that are not asset paths', () => {
    expect(references('a = "x.txt"\nb = 3\nc = ".dds"\nd = { e = "" f = "gfx/.tga" }')).toEqual([]);
  });
});

describe('assetKind', () => {
  it('reads the extension, ignoring case', () => {
    expect(assetKind('a.DDS')).toBe('texture');
    expect(assetKind('a.Tga')).toBe('texture');
    expect(assetKind('a.mesh')).toBe('mesh');
    expect(assetKind('a.anim')).toBe('animation');
    expect(assetKind('a.gfx')).toBeUndefined();
    expect(assetKind('dds')).toBeUndefined();
    expect(assetKind('.dds')).toBeUndefined();
  });
});
