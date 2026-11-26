import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  folderStamp,
  guiKeysTyped,
  hasRules,
  readCoverage,
  rulesFolder,
  spriteKindsOf,
  typesFonts,
  waitForRules,
  type RulesLook,
} from '../src/cwtools-rules.ts';

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

  it('give the .gui keys they type as a sprite or a font, lowercase', () => {
    // the form of cwtools-eu4-config#448: two sprite keys typed, fonts still scalars
    const gui = [
      '\ticonType = {',
      '\t\tspriteType = <sprite>',
      '\t\tquadTextureSprite = <sprite>',
      '\t\tfont = scalar',
      '\t\t## cardinality = 0..1',
      '\t\tbuttonFont = <font>',
      '\t}',
    ].join('\r\n');
    expect([...guiKeysTyped(gui, 'sprite')]).toEqual(['spritetype', 'quadtexturesprite']);
    expect([...guiKeysTyped(gui, 'font')]).toEqual(['buttonfont']);
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
        guiSpriteKeys: new Set(),
        guiFontKeys: new Set(),
        scriptFolders: new Set(),
      });
      await mkdir(join(folder, 'interface'));
      await writeFile(join(folder, 'interface', 'sprites.cwt'), SUBTYPE_SPRITES);
      await writeFile(join(folder, 'interface', 'gfx_objects.cwt'), FONTS);
      await writeFile(
        join(folder, 'interface', 'gui_types.cwt'),
        'types = {\n\ttype[gui_window] = {\n\t}\n}\n\ticonType = {\n\t\tspriteType = <sprite>\n\t}',
      );
      const coverage = await readCoverage(folder);
      expect([...coverage.spriteKinds].sort()).toEqual(['corneredTileSpriteType', 'spriteType']);
      expect(coverage.fonts).toBe(true);
      expect(coverage.gui).toBe(true);
      expect([...coverage.guiSpriteKeys]).toEqual(['spritetype']);
      expect(coverage.guiFontKeys.size).toBe(0);
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

    it('hold rules when a .cwt file is in the folder or right under it (etch#755)', async () => {
      folder = await mkdtemp(join(tmpdir(), 'etch-cwtools-'));
      expect(await hasRules(folder)).toBe(false);
      expect(await hasRules(join(folder, 'eu4'))).toBe(false);
      // A clone that failed under a long path leaves .git and no rules.
      await mkdir(join(folder, '.git'));
      await writeFile(join(folder, '.git', 'x.cwt'), '');
      await writeFile(join(folder, 'README.md'), '');
      expect(await hasRules(folder)).toBe(false);
      await mkdir(join(folder, 'interface'));
      await writeFile(join(folder, 'interface', 'sprites.cwt'), 'types = {}');
      expect(await hasRules(folder)).toBe(true);
    });

    it('hold rules with a .cwt file at the top', async () => {
      folder = await mkdtemp(join(tmpdir(), 'etch-cwtools-'));
      await writeFile(join(folder, 'triggers.cwt'), '');
      expect(await hasRules(folder)).toBe(true);
    });

    it('change their stamp while a clone writes into the folder', async () => {
      folder = await mkdtemp(join(tmpdir(), 'etch-cwtools-'));
      expect(await folderStamp(join(folder, 'eu4'))).toBe('');
      const before = await folderStamp(folder);
      expect(await folderStamp(folder)).toBe(before);
      await mkdir(join(folder, '.git'));
      await writeFile(join(folder, '.git', 'pack.tmp'), 'x');
      const grown = await folderStamp(folder);
      expect(grown).not.toBe(before);
      await writeFile(join(folder, '.git', 'pack.tmp'), 'xyz');
      expect(await folderStamp(folder)).not.toBe(grown);
    });
  });

  describe('waited for (etch#755)', () => {
    const wait = { firstMs: 60, againMs: 30, giveUpMs: 150 };
    /** Runs `waitForRules` over the looks in order; the result and the waits it slept. */
    const run = async (
      looks: (RulesLook | undefined)[],
      cancelAt = Infinity,
    ): Promise<[string, number[]]> => {
      const slept: number[] = [];
      let next = 0;
      const verdict = await waitForRules(
        () => Promise.resolve(looks[next++]),
        (ms) => {
          slept.push(ms);
          return Promise.resolve(slept.length < cancelAt);
        },
        wait,
      );
      return [verdict, slept];
    };
    const empty = (stamp: string): RulesLook => ({ rules: false, stamp });

    it('find the folder empty once two looks in a row see it unchanged', async () => {
      expect(await run([empty('a'), empty('a')])).toEqual(['empty', [60, 30]]);
    });

    it('do not take a clone slower than the first wait for a failed one', async () => {
      const looks = [empty('a'), empty('b'), empty('c'), { rules: true, stamp: 'd' }];
      expect(await run(looks)).toEqual(['rules', [60, 30, 30, 30]]);
    });

    it('find the rules at the first look', async () => {
      expect(await run([{ rules: true, stamp: 'a' }])).toEqual(['rules', [60]]);
    });

    it('leave a folder that keeps changing undecided after the last wait', async () => {
      const looks = ['a', 'b', 'c', 'd', 'e', 'f'].map(empty);
      expect(await run(looks)).toEqual(['unknown', [60, 30, 30, 30]]);
    });

    it('stop when CWTools no longer runs, or the wait is cancelled', async () => {
      expect(await run([empty('a'), undefined])).toEqual(['unknown', [60, 30]]);
      expect(await run([empty('a'), empty('a')], 1)).toEqual(['unknown', [60]]);
      expect(await run([empty('a'), empty('a')], 2)).toEqual(['unknown', [60, 30]]);
    });
  });
});
