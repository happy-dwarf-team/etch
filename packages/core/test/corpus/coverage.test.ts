/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DRAW_LIST_VERSION, parseScript, readGuiFile } from '../../src/index.ts';
import {
  changedRoots,
  constructsOf,
  laterRow,
  parseCorpusManifest,
  readCorpusManifest,
  readSurveyConfig,
  rectOrigins,
  snapshotOf,
  surveyManifest,
  textAgreement,
  viewSignature,
  outlineGeometry,
  visibilityAgreement,
  type CapturePlan,
  type CapturedWidget,
  type CrawlFile,
  type PlannedWidget,
  type RectMismatch,
  type TreeWidget,
  type WidgetRect,
} from '../../src/corpus/index.ts';
import {
  candidateStep,
  neverClicked,
  newWindows,
  stableSignature,
} from '../../src/corpus/driver/crawl.ts';

const REPOSITORY = join(import.meta.dirname, '..', '..', '..', '..');

const tree = (
  path: string,
  type: string,
  visible: boolean,
  children: TreeWidget[] = [],
): TreeWidget => ({ path, type, visible, children });

describe('the survey crawler', () => {
  it('signs a view by its visible windows, leaving out transient windows and later rows', () => {
    const signature = viewSignature([
      tree('topbar', 'window', true, [tree('topbar/text', 'text', true)]),
      tree('countryview', 'window', true, [
        tree('countryview/tab_court', 'window', true),
        tree('countryview/hidden', 'window', false),
        tree('countryview/list[2]', 'window', true),
      ]),
      tree('tooltip', 'window', true),
      tree('navy_mapicon', 'window', true),
    ]);
    expect(signature.split('\n')).toEqual(['countryview', 'countryview/tab_court', 'topbar']);
  });

  it('takes as roots the top-level windows whose part of the signature changed', () => {
    const base = 'menubar\noutliner\ntopbar';
    expect(changedRoots('countryview\ncountryview/tab\nmenubar\noutliner\ntopbar', base)).toEqual([
      'countryview',
    ]);
    expect(changedRoots('menubar\noutliner\noutliner/expanded\ntopbar', base)).toEqual([
      'outliner',
    ]);
    expect(changedRoots(base, '')).toEqual(['menubar', 'outliner', 'topbar']);
  });

  it('clicks only the first row of a list', () => {
    expect(laterRow('list/entry[1]/button')).toBe(false);
    expect(laterRow('list/entry[2]/button')).toBe(true);
    expect(laterRow('list/entry[12]')).toBe(true);
    expect(laterRow('menubar/button')).toBe(false);
  });

  it('turns candidates into recipe steps', () => {
    expect(candidateStep('key f1')).toEqual({ key: 'f1' });
    expect(candidateStep('province 148')).toEqual({ province: 148 });
    expect(candidateStep('click menu/menu_panel/menu_options_button')).toEqual({
      click: 'menu/menu_panel/menu_options_button',
    });
  });

  it('reads a new signature again until it holds', async () => {
    // Anbennar's lobby: the main menu's panels are still fading out at the first read.
    const reads = ['lobby', 'lobby'];
    const read = (): Promise<string> => Promise.resolve(reads.shift() ?? 'none');
    expect(await stableSignature('lobby\nmainmenu', 'lobby', read)).toBe('lobby');
    expect(reads).toEqual([]);
    // The expected signature is taken at once.
    expect(await stableSignature('lobby', 'lobby', () => Promise.reject(new Error('read')))).toBe(
      'lobby',
    );
    // A signature that keeps changing is taken after the last read.
    let n = 0;
    expect(await stableSignature('a', undefined, () => Promise.resolve(String(++n)), 3)).toBe('3');
  });

  it('clicks a button that only opens a dialog, but nothing in the dialog that confirms', async () => {
    const config = readSurveyConfig(
      await readFile(join(REPOSITORY, 'coverage', 'survey.json'), 'utf8'),
    );
    const abandon =
      'countryideasview/ideagroups_listbox_left/countryideaview_ideagroupitem[1]/abandon_idea_button';
    expect(config.crawl.never.some((n) => n.pattern === '//*abandon*')).toBe(true);
    expect(neverClicked(config.crawl, abandon)).toBeUndefined();
    expect(
      neverClicked(config.crawl, 'multi_unitpanel/unitlist/unitpanel/actual/disbandbutton'),
    ).toBeUndefined();
    expect(neverClicked(config.crawl, 'DefaultDialog/AgreeButton')?.pattern).toBe('//*agree*');
    // Buttons that act at once stay out.
    for (const path of [
      'countryreligionview/province_listbox/countryreligionview_provincelistitem[1]/send_missionary',
      'countrytradeview/trade_node_list_window/tradenode_list/trade_node_item[1]/send_merchant',
    ]) {
      expect(neverClicked(config.crawl, path)?.pattern).toBe('//*send*');
    }
    expect(neverClicked({ never: config.crawl.never }, abandon)?.pattern).toBe('//*abandon*');
    // The click must open a window the view did not show.
    expect(
      newWindows('DefaultDialog\nDefaultDialog/x\ncountryideasview', 'countryideasview'),
    ).toEqual(['DefaultDialog']);
    expect(newWindows('countryideasview\ncountryideasview/x', 'countryideasview')).toEqual([]);
  });
});

describe('the survey manifest', () => {
  it('is a valid corpus manifest with a view for each reproducible state', async () => {
    const { manifest } = await readCorpusManifest(join(REPOSITORY, 'corpus', 'manifest.json'));
    if (manifest === undefined) throw new Error('No corpus manifest.');
    const config = readSurveyConfig(
      await readFile(join(REPOSITORY, 'coverage', 'survey.json'), 'utf8'),
    );
    const crawl: CrawlFile = {
      formatVersion: 1,
      playset: 'vanilla',
      resolution: '1920x1080',
      start: 'save',
      states: [
        { id: 's0', steps: [], signature: 'topbar', roots: ['topbar'], depth: 0, explored: true },
        {
          id: 's1',
          steps: [{ key: 'f1' }],
          signature: 'countryview\ntopbar',
          roots: ['countryview'],
          depth: 1,
          explored: true,
        },
        {
          id: 's2',
          steps: [{ key: 'l' }],
          signature: 'ledger\ntopbar',
          roots: ['ledger'],
          depth: 1,
          explored: true,
          unreproducible: 'ui click ledger/page: not_visible.',
        },
        {
          id: 's4',
          steps: [{ click: 'speed_controls/button_speedup' }],
          signature: 'speed_controls\ntopbar',
          roots: ['speed_controls'],
          depth: 1,
          explored: true,
        },
        {
          id: 's3',
          steps: [{ key: 'b' }],
          signature: 'macro_build_interface\ntopbar',
          roots: ['macro_build_interface'],
          depth: 1,
          explored: true,
          unreproducible: 'Its steps led to another view.',
        },
        {
          id: 's5',
          steps: [{ click: 'countryestatesview/close_button' }],
          signature: 'estate_item[1]\nestate_item[2]\ntopbar',
          roots: ['estate_item[1]', 'estate_item[2]'],
          depth: 2,
          explored: true,
        },
        {
          id: 's6',
          steps: [{ click: 'topbar/shield' }],
          signature: 'country_selection_panel\nshield[1]\ntopbar',
          roots: ['country_selection_panel', 'shield[1]'],
          depth: 1,
          explored: true,
        },
      ],
      tried: {},
      skipped: {},
      starts: 1,
      done: true,
    };
    const out = surveyManifest(manifest, config, [crawl], (_, window) =>
      window === 'topbar' ? 'interface/topbar.gui' : 'interface/countryview.gui',
    );
    // A refused step, a click the survey now never makes, or roots that are only the rows of a
    // closed list leave a view out; a window that remembers its last tab, or numbered copies
    // beside a window of their own, do not.
    const ids = ['vanilla-save-s0', 'vanilla-save-s1', 'vanilla-save-s3', 'vanilla-save-s6'];
    expect(out.windows.map((w) => w.id)).toEqual(ids);
    expect(out.playsets.find((p) => p.id === 'bigger-ui')?.windows).toEqual(ids);
    expect(out.playsets.find((p) => p.id === 'anbennar-alone')).toBeUndefined();
    expect(out.windows[1]?.files).toEqual(['interface/countryview.gui']);
    expect(out.playsets.every((p) => p.gate === 'report')).toBe(true);
    const parsed = parseCorpusManifest(JSON.parse(JSON.stringify(out)) as unknown);
    expect(parsed.problems).toEqual([]);
  });
});

describe('the survey configuration and manifest, on what they leave out', () => {
  it('rejects another format version, and a playset that is neither crawled nor fed', () => {
    expect(() => readSurveyConfig('{ "formatVersion": 2, "playsets": [] }')).toThrow(
      'coverage/survey.json: formatVersion must be 1.',
    );
    expect(() =>
      readSurveyConfig('{ "formatVersion": 1, "playsets": [{ "id": "lost", "crawl": false }] }'),
    ).toThrow('coverage/survey.json: the playset "lost" needs crawl or viewsOf.');
  });

  it('skips a crawl at another size and a state with no roots, and puts last a view Escape keeps', async () => {
    const { manifest } = await readCorpusManifest(join(REPOSITORY, 'corpus', 'manifest.json'));
    if (manifest === undefined) throw new Error('No corpus manifest.');
    const config = readSurveyConfig(
      await readFile(join(REPOSITORY, 'coverage', 'survey.json'), 'utf8'),
    );
    const state = (id: string, roots: string[], more: object = {}) => ({
      id,
      steps: [{ key: 'f1' }],
      signature: roots.join('\n'),
      roots,
      depth: 1,
      explored: true,
      ...more,
    });
    const crawl = (resolution: string, states: CrawlFile['states']): CrawlFile => ({
      formatVersion: 1,
      playset: 'vanilla',
      resolution,
      start: 'main-menu',
      states,
      tried: {},
      skipped: {},
      starts: 1,
      done: true,
    });
    const out = surveyManifest(manifest, config, [
      crawl(config.resolution, [
        state('s0', ['kept_open'], { escapeFails: 'the view stayed' }),
        state('s1', []),
        state('s2', ['frontend']),
      ]),
      crawl('1280x720', [state('s3', ['elsewhere'])]),
    ]);
    // The main menu's views are named `menu`; with no file of its own, a view's window is unknown.
    expect(out.windows.map((w) => [w.id, w.files, w.views[0]?.note])).toEqual([
      ['vanilla-menu-s2', ['interface/unknown.gui'], undefined],
      ['vanilla-menu-s0', ['interface/unknown.gui'], 'Escape does not close it: the view stayed'],
    ]);
    expect(() =>
      surveyManifest(manifest, { ...config, playsets: [{ id: 'nowhere', crawl: true }] }, []),
    ).toThrow('The corpus has no playset "nowhere".');
  });
});

describe('the geometry and visibility measures, on a plan made by hand', () => {
  const rect = { x: 0, y: 0, w: 10, h: 10 };
  const captured = (path: string, visible = true): CapturedWidget => ({
    path,
    name: path.split('/').at(-1) ?? path,
    type: 'icon',
    visible,
    rect,
    children: [],
  });
  // Only whether a widget was laid out counts here, not how.
  const laidOut = {} as NonNullable<PlannedWidget['laidOut']>;
  const plan: CapturePlan = {
    key: { playset: 'vanilla', view: 'panel', resolution: { width: 200, height: 100 } },
    widgets: [
      // A window: only its corner is compared.
      {
        path: 'w',
        parent: -1,
        captured: captured('w'),
        laidOut,
        kind: 'windowType',
        hidden: false,
        rect: { ...rect, w: 50 },
      },
      {
        path: 'w/code',
        parent: 0,
        captured: captured('w/code'),
        laidOut,
        hidden: false,
        codeFilled: 'listboxType',
      },
      {
        path: 'w/unplaced',
        parent: 0,
        captured: captured('w/unplaced'),
        laidOut,
        hidden: false,
        unplaced: true,
      },
      {
        path: 'w/off',
        parent: 0,
        captured: captured('w/off', false),
        laidOut,
        hidden: false,
        offScreen: true,
      },
      { path: 'w/hidden', parent: 0, captured: captured('w/hidden'), laidOut, hidden: true },
      {
        path: 'w/hidden/kid',
        parent: 4,
        captured: captured('w/hidden/kid'),
        laidOut,
        hidden: false,
        rect,
      },
      {
        path: 'w/filled',
        parent: 0,
        captured: captured('w/filled'),
        hidden: false,
        codeFilled: 'listboxType',
      },
      { path: 'w/neither', parent: 0, captured: captured('w/neither', false), hidden: false },
    ],
    drawList: { version: DRAW_LIST_VERSION, width: 200, height: 100, textures: [], draws: [] },
    drawOwners: [],
    problems: [],
  };

  it('counts a window by its corner and skips what the code fills or the layout cannot place', () => {
    // The child of a hidden widget is still measured; one off screen has no layout rect to match.
    expect(outlineGeometry(plan)).toEqual({
      compared: 3,
      exact: 2,
      mismatches: [{ path: 'w/off', game: rect }],
      gameOnly: ['w/neither'],
      layoutOnly: [],
      codeFilled: 2,
    });
  });

  it('agrees on what neither shows, and skips the children of a hidden widget', () => {
    // The child of the hidden widget and the code-filled one the layout lacks are left out.
    expect(visibilityAgreement(plan)).toEqual({
      compared: 6,
      agree: 6,
      drawnHidden: [],
      shownMissing: [],
    });
  });
});

describe('the coverage measures', () => {
  it('reads the constructs of a widget without its content', () => {
    const file = readGuiFile(
      parseScript(`guiTypes = {
        windowType = {
          name = "w"
          instantTextBoxType = {
            name = "t" position = { x = 1 y = 2 } font = "vic_18" format = centre
            text = "HELLO" fixedsize = yes
            if_resolution = { min_height = 900 position = { x = 3 y = 4 } }
          }
        }
      }`),
    );
    const text = file.definitions[0]?.children[0];
    if (text === undefined) throw new Error('No text box.');
    expect(constructsOf(text).sort()).toEqual([
      'instantTextBoxType',
      'instantTextBoxType.fixedsize',
      'instantTextBoxType.fixedsize=yes',
      'instantTextBoxType.format',
      'instantTextBoxType.format=centre',
      'instantTextBoxType.if_resolution',
      'instantTextBoxType.position',
    ]);
  });

  it('takes a snapshot of a capture, and counts the texts a match takes', () => {
    const root: CapturedWidget = {
      path: 'w',
      name: 'w',
      type: 'window',
      visible: true,
      rect: { x: 0, y: 0, w: 10, h: 10 },
      children: [
        {
          path: 'w/a',
          name: 'a',
          type: 'text',
          visible: true,
          rect: { x: 0, y: 0, w: 5, h: 5 },
          text: 'One',
        },
        {
          path: 'w/b',
          name: 'b',
          type: 'text',
          visible: true,
          rect: { x: 5, y: 0, w: 5, h: 5 },
          text: 'Two',
        },
        {
          path: 'w/c',
          name: 'c',
          type: 'text',
          visible: false,
          rect: { x: 5, y: 5, w: 5, h: 5 },
          text: 'Hidden',
        },
      ],
    };
    const snapshot = snapshotOf(root, { width: 1920, height: 1080 }, '2026-11-02T00:00:00Z');
    expect(snapshot.widgets.map((w) => w.path)).toEqual(['w', 'w/a', 'w/b', 'w/c']);
    expect(snapshot.widgets[1]?.rect).toEqual([0, 0, 5, 5]);
    const counts = textAgreement(snapshot, {
      text: (path) => (path === 'w/a' ? '§GOne§!' : undefined),
      rows: () => undefined,
      state: () => undefined,
    });
    expect(counts).toEqual({ shown: 2, taken: 1, missing: ['w/b'] });
    expect(textAgreement(snapshot, undefined).taken).toBe(0);
    // A copy the game's code made from another definition is drawn with the text it showed.
    const adopted = textAgreement(snapshot, {
      text: (path) => (path === 'w/a' ? 'One' : undefined),
      rows: () => undefined,
      state: () => undefined,
      adopted: (path) => (path === 'w' ? [{ name: 'b', rect: [5, 0, 5, 5], text: 'Two' }] : []),
    });
    expect(adopted).toEqual({ shown: 2, taken: 2, missing: [] });
  });

  it('traces rect mismatches to the ancestor they move with', () => {
    const at = (x: number, y: number, w = 10, h = 10): WidgetRect => ({ x, y, w, h });
    const off = (path: string, dx: number, dy: number, size = 10): RectMismatch => ({
      path,
      game: at(0, 0),
      layout: at(dx, dy, size, size),
    });
    const mismatches: RectMismatch[] = [
      off('w/a', 10, 0), // before its parent in the list
      off('w', 10, 0),
      off('w/a/x', 10, 0), // two levels below its origin
      off('w/b', 3, 0), // its own origin, inside a window off by another amount
      off('W/B/y', 3, 0), // paths compare without case
      off('w/c/d', 10, 0), // w/c matches, so the chain to w is broken
      off('v', 0, 0, 20), // the size differs, nothing moves
      off('v/z', 0, 0, 20),
      { path: 'u', game: at(0, 0) }, // the layout puts both off screen
      { path: 'u/q', game: at(0, 0) },
    ];
    const summary = rectOrigins(mismatches).map(
      (o) => `${o.origin.path} ${o.delta} ${String(o.moved)}`,
    );
    expect(summary).toEqual([
      'w 10,0 2',
      'w/b 3,0 1',
      'w/c/d 10,0 0',
      'v 0,0 0',
      'v/z 0,0 0',
      'u off screen 1',
    ]);
    expect(rectOrigins([])).toEqual([]);
  });
});
