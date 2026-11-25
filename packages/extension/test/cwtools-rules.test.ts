import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCoverage, rulesFolder, spriteKindsOf, typesFonts } from '../src/cwtools-rules.ts';

/** `interface/sprites.cwt` of cwtools-eu4-config master at a85622d: one kind on the type. */
const MASTER_SPRITES = [
  'types = {',
  '\t## type_key_filter = spriteType',
  '\ttype[sprite] = { #these are links that start with the GFX_ prefix in vanilla',
  '\t\tname_field = "name"',
  '\t\tpath = "game/interface"',
  '\t\tskip_root_key = spriteTypes',
  '\t}',
  '}',
].join('\r\n');

/** The form of cwtools-eu4-config#447: a list on the type, one kind per subtype. */
const SUBTYPE_SPRITES = [
  'types = {',
  '\t## type_key_filter = { spriteType corneredTileSpriteType }',
  '\ttype[sprite] = {',
  '\t\tname_field = "name"',
  '\t\t## type_key_filter = spriteType',
  '\t\tsubtype[normal] = {}',
  '\t\t## type_key_filter = corneredTileSpriteType',
  '\t\tsubtype[cornered_tile] = {}',
  '\t}',
  '}',
].join('\r\n');

const FONTS = [
  'types = {',
  '\t## type_key_filter = bitmapfont',
  '\ttype[font] = {',
  '\t}',
  '}',
].join('\r\n');

describe("CWTools' rules", () => {
  it('give the sprite kinds of the type or of its subtypes', () => {
    expect([...spriteKindsOf(MASTER_SPRITES)]).toEqual(['spriteType']);
    expect([...spriteKindsOf(SUBTYPE_SPRITES)].sort()).toEqual([
      'corneredTileSpriteType',
      'spriteType',
    ]);
    expect(spriteKindsOf('types = {\n\t## type_key_filter = spriteType\n}').size).toBe(0);
  });

  it('type fonts only with a font type on bitmapfont', () => {
    expect(typesFonts(FONTS)).toBe(true);
    expect(typesFonts('## type_key_filter = pdxmesh\r\n\ttype[pdxmesh] = {')).toBe(false);
  });

  it('are the manual folder only with rules_version manual', () => {
    expect(rulesFolder('C:/ext', { rulesVersion: 'manual', rulesFolder: ' D:/rules ' })).toBe(
      'D:/rules',
    );
    expect(rulesFolder('C:/ext', { rulesVersion: 'manual', rulesFolder: '' })).toBeUndefined();
    expect(rulesFolder('C:/ext', { rulesVersion: 'stable', rulesFolder: 'D:/rules' })).toBe(
      join('C:/ext', '.cwtools', 'eu4'),
    );
  });

  describe('in a folder', () => {
    let folder: string | undefined;
    afterEach(async () => {
      if (folder !== undefined) await rm(folder, { recursive: true, force: true });
    });

    it('cover what their interface files type, and nothing when they are missing', async () => {
      folder = await mkdtemp(join(tmpdir(), 'etch-cwtools-'));
      expect(await readCoverage(folder)).toEqual({
        spriteKinds: new Set(),
        fonts: false,
        gui: false,
        scriptFolders: new Set(),
      });
      await mkdir(join(folder, 'interface'));
      await writeFile(join(folder, 'interface', 'sprites.cwt'), SUBTYPE_SPRITES);
      await writeFile(join(folder, 'interface', 'gfx_objects.cwt'), FONTS);
      await writeFile(
        join(folder, 'interface', 'gui_types.cwt'),
        'types = {\n\ttype[gui_window] = {\n\t}\n}',
      );
      const coverage = await readCoverage(folder);
      expect([...coverage.spriteKinds].sort()).toEqual(['corneredTileSpriteType', 'spriteType']);
      expect(coverage.fonts).toBe(true);
      expect(coverage.gui).toBe(true);
      expect(coverage.scriptFolders.size).toBe(0);
    });

    it('cover a script folder only when they type every sprite key of it', async () => {
      folder = await mkdtemp(join(tmpdir(), 'etch-cwtools-'));
      await mkdir(join(folder, 'events'));
      await mkdir(join(folder, 'common'));
      await writeFile(
        join(folder, 'events', 'events.cwt'),
        'event = {\r\n\t\tpicture = <sprite>\r\n}',
      );
      // master writes both keys as scalars; cwtools-eu4-config#446 types them, here only one
      await writeFile(
        join(folder, 'common', 'governments_and_reforms.cwt'),
        'alert_icon_gfx = <sprite>\n\t\t\ticon = scalar # TODO: make it a GFX\n',
      );
      await writeFile(join(folder, 'common', 'estates.cwt'), '\ticon = <sprite>\n');
      const coverage = await readCoverage(folder);
      expect([...coverage.scriptFolders].sort()).toEqual(['common/estate_privileges', 'events']);
    });
  });
});
