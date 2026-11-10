/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScript, readGuiFile } from '../../src/index.ts';
import {
  changedRoots,
  constructsOf,
  laterRow,
  parseCorpusManifest,
  readCorpusManifest,
  readSurveyConfig,
  snapshotOf,
  surveyManifest,
  textAgreement,
  viewSignature,
  type CapturedWidget,
  type CrawlFile,
  type TreeWidget,
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
      ],
      tried: {},
      skipped: {},
      starts: 1,
      done: true,
    };
    const out = surveyManifest(manifest, config, [crawl], (_, window) =>
      window === 'topbar' ? 'interface/topbar.gui' : 'interface/countryview.gui',
    );
    // A refused step or a click the survey now never makes leaves a view out; a window that
    // remembers its last tab does not.
    const ids = ['vanilla-save-s0', 'vanilla-save-s1', 'vanilla-save-s3'];
    expect(out.windows.map((w) => w.id)).toEqual(ids);
    expect(out.playsets.find((p) => p.id === 'bigger-ui')?.windows).toEqual(ids);
    expect(out.playsets.find((p) => p.id === 'anbennar-alone')).toBeUndefined();
    expect(out.windows[1]?.files).toEqual(['interface/countryview.gui']);
    expect(out.playsets.every((p) => p.gate === 'report')).toBe(true);
    const parsed = parseCorpusManifest(JSON.parse(JSON.stringify(out)) as unknown);
    expect(parsed.problems).toEqual([]);
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
  });
});
