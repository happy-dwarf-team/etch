import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { InterfaceIndex, parseScript, readGfxFile } from '@etch/core';
import { GameFiles } from '@etch/core/playset';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collapseErrorLog, textureDrawnMissing } from '../src/live-game/error-log.ts';
import { planReload, visibleReloads, type ReloadPlan } from '../src/live-game/policy.ts';

let temp: string;
let files: GameFiles;

async function add(root: string, entries: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(entries)) {
    const file = join(root, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
}

const gfx = readGfxFile(
  parseScript(
    'spriteTypes = {\n' +
      '\tspriteType = { name = "GFX_a" texturefile = "gfx//interface//topbar_UL.tga" }\n' +
      '\tspriteType = { name = "GFX_b" texturefile = "gfx/interface/topbar_UL.dds" }\n' +
      '}\n',
  ),
);

const plan = (file: string, drawnMissing = false): Promise<ReloadPlan> =>
  planReload({
    file,
    files,
    index: () => Promise.resolve(InterfaceIndex.of([{ path: 'interface/a.gfx', file: gfx }], [])),
    drawnMissing: () => Promise.resolve(drawnMissing),
  });

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'etch-policy-'));
  const window = (name: string) => `guiTypes = { windowType = { name = "${name}" } }\n`;
  await add(join(temp, 'game'), {
    'interface/provinceview.gui': window('provinceview'),
    'interface/topbar.gui': window('topbar'),
  });
  await add(join(temp, 'mine'), {
    'interface/provinceview.gui': window('provinceview'),
    'interface/countrydiplomacyview.gui': window('diplomacy'),
    'interface/topbar.gui': window('topbar'),
    'interface/speed_controls.gui': window('speed_controls'),
    'interface/countryview.gui': window('countryview'),
    'interface/ledger.gui': window('ledger'),
    'interface/twice.gui':
      'guiTypes = { windowType = { name = "reform" } windowType = { name = "Reform" } }\n',
    'interface/mine.gfx': 'spriteTypes = {}\n',
    'interface/overridden.gui': window('overridden'),
    'gfx/interface/topbar_UL.dds': 'DDS',
    'gfx/fonts/vic_18.fnt': 'font',
    'common/custom_gui/x.txt': 'x',
    'common/scripted_guis/x.txt': 'x',
    'events/x.txt': 'x',
    'localisation/mine_l_english.yml': 'l_english:\n',
    'README.md': '# mine',
  });
  await add(join(temp, 'later'), { 'interface/overridden.gui': window('overridden') });
  files = new GameFiles([
    { name: 'game', root: join(temp, 'game'), replacePaths: [] },
    { name: 'Mine', root: join(temp, 'mine'), replacePaths: [] },
    { name: 'Later Mod', root: join(temp, 'later'), replacePaths: [] },
  ]);
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

const mine = (path: string) => join(temp, 'mine', ...path.split('/'));

describe('planReload', () => {
  it('reloads the province view and keeps it closed when it was', async () => {
    expect(await plan(mine('interface/provinceview.gui'))).toEqual({
      kind: 'reload',
      path: 'interface/provinceview.gui',
      request: {
        lines: ['reload provinceview.gui'],
        check: ['interface/provinceview.gui'],
        close: [],
        keepHidden: ['provinceview'],
      },
      rebuild: 'panel',
      thenVisible: false,
      texture: false,
    });
  });

  it('counts a HUD file as a HUD rebuild, and closes an on-demand window first', async () => {
    const hud = await plan(mine('interface/topbar.gui'));
    expect(hud).toMatchObject({ kind: 'reload', rebuild: 'hud' });
    expect(await plan(mine('interface/countrydiplomacyview.gui'))).toMatchObject({
      kind: 'reload',
      request: { close: ['DeclareWarDialog'] },
      rebuild: 'panel',
    });
    expect(await plan(mine('interface/ledger.gui'))).toMatchObject({ rebuild: 'panel' });
  });

  it('rebuilds the speed controls through the top bar (H6)', async () => {
    expect(await plan(mine('interface/speed_controls.gui'))).toMatchObject({
      kind: 'reload',
      request: {
        lines: ['reload speed_controls.gui', 'reload topbar.gui'],
        check: ['interface/speed_controls.gui'],
      },
      rebuild: 'hud',
    });
  });

  it('asks for a planned restart where a reload cannot show the change', async () => {
    for (const path of [
      'interface/countryview.gui',
      'interface/twice.gui',
      'interface/mine.gfx',
      'gfx/fonts/vic_18.fnt',
      'common/custom_gui/x.txt',
      'common/scripted_guis/x.txt',
      'events/x.txt',
    ]) {
      expect(await plan(mine(path))).toMatchObject({ kind: 'restart', path });
    }
    expect(await plan(mine('interface/twice.gui'))).toMatchObject({
      reason: 'Reform is written twice at the top level, and the game keeps its first definition',
    });
  });

  it('reloads a texture by every spelling, unless it was drawn missing (H9)', async () => {
    expect(await plan(mine('gfx/interface/topbar_UL.dds'))).toMatchObject({
      kind: 'reload',
      request: {
        lines: [
          'reloadtexture gfx//interface//topbar_UL.tga',
          'reloadtexture gfx/interface/topbar_UL.dds',
        ],
      },
      texture: true,
    });
    expect(await plan(mine('gfx/interface/topbar_UL.dds'), true)).toMatchObject({
      kind: 'restart',
    });
  });

  it('reloads localisation, then the listened files on screen', async () => {
    expect(await plan(mine('localisation/mine_l_english.yml'))).toMatchObject({
      kind: 'reload',
      request: { lines: ['reloadloc'] },
      thenVisible: true,
    });
    expect(
      visibleReloads([
        'interface/topbar.gui',
        'interface\\provinceview.gui',
        'interface/topbar.gui',
        'interface/countryview.gui',
        'interface/speed_controls.gui',
        'gfx/not-a-gui.gfx',
      ]),
    ).toEqual({
      lines: ['reload topbar.gui', 'reload provinceview.gui'],
      check: ['interface/topbar.gui', 'interface/provinceview.gui'],
      keepHidden: ['provinceview'],
    });
    expect(visibleReloads([])).toBeUndefined();
  });

  it('reloads nothing for a file another mod overrides, or one the game does not read', async () => {
    expect(await plan(mine('interface/overridden.gui'))).toEqual({
      kind: 'none',
      path: 'interface/overridden.gui',
      why: 'overridden',
      reason: 'Later Mod has its own interface/overridden.gui, which the game reads instead',
    });
    expect(await plan(mine('README.md'))).toMatchObject({ kind: 'none', why: 'ignored' });
    expect(await plan(join(temp, 'elsewhere', 'x.gui'))).toMatchObject({
      kind: 'none',
      why: 'ignored',
    });
  });
});

describe('collapseErrorLog', () => {
  it("collapses repeats and leaves out the game's own binding lines", () => {
    expect(
      collapseErrorLog([
        "[11:02:03][gui.cpp:1]: Missing Button 'close_button' in window 'provinceview'",
        "[11:02:03][gui.cpp:2]: Missing Icon 'remove_parliament'",
        '[11:02:03][texture.cpp:9]: Error initialising texture gfx/interface/new.dds',
        '[11:02:04][texture.cpp:9]: Error initialising texture gfx/interface/new.dds',
        '[11:02:04][gui.cpp:3]: Could not find sprite type [GFX_x]',
      ]),
    ).toEqual([
      {
        line: '[11:02:03][texture.cpp:9]: Error initialising texture gfx/interface/new.dds',
        count: 2,
      },
      { line: '[11:02:04][gui.cpp:3]: Could not find sprite type [GFX_x]', count: 1 },
    ]);
  });

  it('finds a texture the game drew while it was missing', async () => {
    const log = join(temp, 'error.log');
    await writeFile(
      log,
      '[11:02:03][texture.cpp:9]: Error initialising texture gfx/interface/New_Icon.dds\n',
    );
    expect(await textureDrawnMissing(log, 'gfx/interface/new_icon.dds')).toBe(true);
    expect(await textureDrawnMissing(log, 'gfx/interface/other.dds')).toBe(false);
    expect(await textureDrawnMissing(join(temp, 'none.log'), 'gfx/interface/new_icon.dds')).toBe(
      false,
    );
  });
});
