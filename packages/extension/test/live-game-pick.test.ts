import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { InterfaceIndex, parseScript, readGfxFile } from '@etch/core';
import { GameFiles } from '@etch/core/playset';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  gamePathOf,
  interfaceSources,
  overrideInMod,
  resolvePick,
  spriteLocation,
  type PickSources,
  type PickTarget,
} from '../src/live-game/pick.ts';
import { pickKey } from '../src/live-game/install.ts';
import { readEvent, type PickEvent, type PickedWidget } from '../src/live-game/pipe.ts';

let temp: string;
let game: string;
let library: string;
let mine: string;
let later: string;
let files: GameFiles;
const buffers = new Map<string, string>();

async function add(root: string, entries: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(entries)) {
    const file = join(root, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
}

// Line 1 `guiTypes = {`; the window's `{` on 3 (keyword on 2); the button's `{` on 5; the text's on 9.
const PANEL = [
  'guiTypes = {',
  '\twindowType =',
  '\t{',
  '\t\tname = "panel"',
  '\t\tguiButtonType = {',
  '\t\t\tname = "tax_button"',
  '\t\t\tspriteType = "GFX_tax"',
  '\t\t}',
  '\t\tinstantTextBoxType = {',
  '\t\t\tname = "culture"',
  '\t\t}',
  '\t\tlistboxType = {',
  '\t\t\tname = "rows"',
  '\t\t}',
  '\t}',
  '}',
  '',
].join('\n');

// The template the list box's rows come from, in another file.
const CORE = [
  'guiTypes = {',
  '\twindowType = {',
  '\t\tname = "row"',
  '\t\ticonType = {',
  '\t\t\tname = "row_icon"',
  '\t\t}',
  '\t}',
  '}',
  '',
].join('\n');

const widget = (
  name: string,
  file: string | undefined,
  line: number,
  more: Partial<PickedWidget> = {},
): PickedWidget => ({
  name,
  type: 'other',
  path: name,
  file,
  line,
  rect: [0, 0, 10, 10],
  visible: true,
  stale: false,
  ...more,
});

const pick = (chain: PickedWidget[]): PickEvent => ({
  seq: 1,
  window: chain.at(-1)?.name ?? '',
  screen: { width: 1920, height: 1080 },
  chain,
  stack: { index: 0, size: 1 },
  front: true,
  timing: { clickUnixMs: 0, clickToFrameMs: 0, readMs: 0 },
});

const sources = (): PickSources => ({
  files,
  editedRoot: mine,
  text: async (path) =>
    buffers.get(path) ??
    (await readFile(path).then(
      (b) => b.toString('latin1'),
      () => undefined,
    )),
});

const resolved = async (chain: PickedWidget[]): Promise<PickTarget> => {
  const target = await resolvePick(pick(chain), sources());
  if (typeof target === 'string') throw new Error(target);
  return target;
};

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'etch-pick-'));
  game = join(temp, 'game');
  library = join(temp, 'library');
  mine = join(temp, 'mine');
  later = join(temp, 'later');
  await add(game, {
    'interface/panel.gui': PANEL,
    'interface/core.gui': CORE,
    'interface/topbar.gui': PANEL,
  });
  await add(library, { 'interface/topbar.gui': PANEL });
  await add(mine, { 'interface/mine.gui': PANEL, 'descriptor.mod': 'name="Mine"\n' });
  await add(later, { 'interface/core.gui': CORE });
  files = new GameFiles([
    { name: 'game', root: game, replacePaths: [] },
    { name: 'Library', root: library, replacePaths: [] },
    { name: 'Mine', root: mine, replacePaths: [] },
    { name: 'Later', root: later, replacePaths: [] },
  ]);
  buffers.clear();
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

describe('resolvePick', () => {
  it('opens the widget whose opening brace is on the reported line (H2)', async () => {
    const target = await resolved([
      widget('tax_button', 'interface/panel.gui', 5),
      widget('panel', 'interface/panel.gui', 3),
    ]);
    expect(target.open).toMatchObject({
      path: 'interface/panel.gui',
      layer: 'game',
      line: 4,
      readOnly: true,
    });
    expect(target.match).toBe('line');
    expect(target.template).toBeUndefined();
    expect(target.sprite).toBe('GFX_tax');
  });

  it('accepts a window whose keyword is on the line before its brace', async () => {
    const target = await resolved([widget('panel', 'interface/panel.gui', 3)]);
    expect(target.open.line).toBe(2);
    expect(target.match).toBe('line');
  });

  it('walks the names when the buffer changed since the game read the file', async () => {
    const edited = join(mine, 'interface', 'mine.gui');
    buffers.set(edited, `# a new comment\n# and another\n${PANEL}`);
    const target = await resolved([
      widget('culture', 'interface/mine.gui', 9),
      widget('panel', 'interface/mine.gui', 3),
    ]);
    expect(target.match).toBe('names');
    expect(target.open).toMatchObject({ line: 10, readOnly: false, layer: 'Mine' });
  });

  it('opens the referencing widget of a template first, with the template beside it (H3)', async () => {
    const target = await resolved([
      widget('row_icon', 'interface/core.gui', 4),
      widget('row', 'interface/core.gui', 2),
      widget('rows', 'interface/panel.gui', 12),
      widget('panel', 'interface/panel.gui', 3),
    ]);
    expect(target.open).toMatchObject({ path: 'interface/panel.gui', line: 11, name: 'rows' });
    // core.gui's winning copy is the later mod's.
    expect(target.template).toMatchObject({ path: 'interface/core.gui', layer: 'Later', line: 3 });
  });

  it('opens a stale widget by its names in the nearest file of its chain', async () => {
    const target = await resolved([
      widget('culture', undefined, 0, { stale: true }),
      widget('panel', 'interface/panel.gui', 3),
    ]);
    expect(target.match).toBe('names');
    expect(target.open.line).toBe(8);
  });

  it('opens the file at the reported line when the widget is not in it', async () => {
    const target = await resolved([widget('gone', 'interface/panel.gui', 14)]);
    expect(target.match).toBe('file');
    expect(target.open.line).toBe(13);
  });

  it('opens nothing without a widget or a file', async () => {
    expect(await resolvePick(pick([]), sources())).toBe('no-widget');
    expect(await resolvePick(pick([widget('x', undefined, 0)]), sources())).toBe('no-file');
    expect(await resolvePick(pick([widget('x', 'interface/none.gui', 1)]), sources())).toBe(
      'no-file',
    );
  });

  it('finds a sprite in the .gfx index', async () => {
    await add(game, {
      'interface/a.gfx': 'spriteTypes = {\n\tspriteType = {\n\t\tname = "GFX_tax"\n\t}\n}\n',
    });
    const gfx = readGfxFile(
      parseScript(await readFile(join(game, 'interface', 'a.gfx'), 'latin1')),
    );
    const index = InterfaceIndex.of([{ path: 'interface/a.gfx', file: gfx }], []);
    expect(await spriteLocation('gfx_tax', index, sources())).toMatchObject({
      path: 'interface/a.gfx',
      line: 1,
      readOnly: true,
    });
    expect(await spriteLocation('GFX_none', index, sources())).toBeUndefined();
  });
});

describe('overrideInMod', () => {
  it('copies the winning file byte for byte into the edited mod', async () => {
    const result = await overrideInMod('interface/topbar.gui', files, mine);
    expect(result).toMatchObject({ kind: 'copied', laterMod: undefined });
    const copy = join(mine, 'interface', 'topbar.gui');
    expect(await readFile(copy, 'latin1')).toBe(
      await readFile(join(library, 'interface', 'topbar.gui'), 'latin1'),
    );
  });

  it('warns, and still copies, when a later mod has the same file', async () => {
    const result = await overrideInMod('interface/core.gui', files, mine);
    expect(result).toMatchObject({ kind: 'copied', laterMod: 'Later' });
  });

  it('copies nothing when the mod has the file already, or without an edited mod', async () => {
    expect(await overrideInMod('interface/mine.gui', files, mine)).toMatchObject({
      kind: 'exists',
    });
    expect(await overrideInMod('interface/panel.gui', files, undefined)).toMatchObject({
      kind: 'refused',
    });
    expect(await overrideInMod('interface/none.gui', files, mine)).toMatchObject({
      kind: 'refused',
    });
  });
});

describe('playset paths', () => {
  it('names the game path of a file and the mods the label names', async () => {
    expect(gamePathOf(join(library, 'interface', 'topbar.gui'), files)).toBe(
      'interface/topbar.gui',
    );
    expect(gamePathOf(join(temp, 'elsewhere.gui'), files)).toBeUndefined();
    expect(await interfaceSources(files)).toEqual({
      'interface/core.gui': 'Later',
      'interface/mine.gui': 'Mine',
      'interface/topbar.gui': 'Library',
    });
  });
});

describe('pick mode key', () => {
  it('takes the plugin spelling of a key with Ctrl or Alt', () => {
    expect(pickKey('ctrl + shift + e')).toBe('Ctrl+Shift+E');
    expect(pickKey('Alt+F9')).toBe('Alt+F9');
    expect(pickKey('Shift+Ctrl+5')).toBe('Ctrl+Shift+5');
    expect(pickKey('Shift+E')).toBeUndefined();
    expect(pickKey('Ctrl+Ctrl+E')).toBeUndefined();
    expect(pickKey('Ctrl+Space')).toBeUndefined();
    expect(pickKey('E')).toBeUndefined();
  });
});

describe('readEvent', () => {
  it('reads the plugin pushes', () => {
    const picked = readEvent({
      event: 'pick',
      seq: 2,
      window: 'panel',
      screen: { width: 3440, height: 1440 },
      chain: [
        {
          name: 'tax_button',
          type: 'button',
          path: 'panel/tax_button',
          file: 'interface/panel.gui',
          line: 5,
          rect: [1, 2, 3, 4],
          visible: true,
          stale: false,
        },
      ],
      stack: { index: 1, size: 3 },
      front: true,
      timing: { click_unix_ms: 1761542400123, click_to_frame_ms: 9.4, read_ms: 15.2 },
    });
    expect(picked).toMatchObject({
      kind: 'pick',
      pick: {
        seq: 2,
        chain: [{ name: 'tax_button', line: 5, rect: [1, 2, 3, 4] }],
        timing: { clickUnixMs: 1761542400123 },
      },
    });
    expect(readEvent({ event: 'pick_mode', on: true })).toEqual({ kind: 'pickMode', on: true });
    expect(readEvent({ event: 'snapshot', seq: 2, error: 'stale' })).toMatchObject({
      kind: 'snapshot',
      error: 'stale',
      snapshot: undefined,
    });
    const snapshot = readEvent({
      event: 'snapshot',
      seq: 2,
      window: 'panel',
      file: 'interface/panel.gui',
      screen: { width: 1920, height: 1080 },
      widgets: [
        {
          path: 'panel/culture',
          type: 'text',
          visible: true,
          enabled: true,
          checked: false,
          text: 'Svea',
          rect: [0, 0, 5, 5],
        },
      ],
      stale: 1,
      read_ms: 6.5,
    });
    expect(snapshot).toMatchObject({
      kind: 'snapshot',
      snapshot: { stale: 1, widgets: [{ text: 'Svea' }] },
    });
    expect(readEvent({ event: 'unknown' })).toBeUndefined();
  });
});
