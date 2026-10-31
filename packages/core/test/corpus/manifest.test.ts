/// <reference types="node" />
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORPUS_RESOLUTIONS,
  SUPPORTED_GAME_VERSION,
  UNCHECKED_RESOLUTIONS,
} from '../../src/index.ts';
import {
  captureProblems,
  capturePath,
  deviationCovers,
  findView,
  listCaptureRecords,
  parseCorpusManifest,
  readCaptureRecord,
  readCorpusManifest,
  requiredCaptures,
  viewInPlayset,
  type CorpusManifest,
  type KnownDeviation,
} from '../../src/corpus/index.ts';
import { SUPPORTED_GAME_EXE_SHA256 } from '../../src/playset/index.ts';
import { set, unset } from './json-edit.ts';

const CORPUS = join(import.meta.dirname, '..', '..', '..', '..', 'corpus');

async function committedManifest(): Promise<CorpusManifest> {
  const { manifest, problems } = await readCorpusManifest(join(CORPUS, 'manifest.json'));
  expect(problems).toEqual([]);
  if (manifest === undefined) throw new Error('no manifest');
  return manifest;
}

/** A small valid manifest to break in each test. */
function sample(): Record<string, unknown> {
  return {
    formatVersion: 1,
    game: { version: '1.37.5', exeSha256: SUPPORTED_GAME_EXE_SHA256 },
    tongs: { version: '0.14.1' },
    uiScale: 1,
    resolutions: [
      { width: 1920, height: 1080, confirmed: false, evidence: 'etch#18' },
      { width: 3440, height: 1440, confirmed: true, evidence: 'the lab monitor' },
    ],
    codeFilledKinds: ['listboxType'],
    notCovered: [
      { widgetKind: 'buttonType', reason: 'not in the corpus' },
      { shader: 'gui_rendertarget', reason: 'needs a battle' },
    ],
    playsets: [
      {
        id: 'vanilla',
        title: 'Vanilla',
        gate: 'release',
        save: { file: 'a.eu4', sha256: 'A'.repeat(64), description: 'a save' },
        mods: [],
        disabledDlcs: [],
        windows: ['frontend', 'court'],
      },
      {
        id: 'big-mod',
        title: 'A big mod',
        gate: 'report',
        mods: [{ name: 'Big mod' }],
        disabledDlcs: [],
        windows: ['court'],
      },
    ],
    windows: [
      {
        id: 'frontend',
        title: 'Main menu',
        files: ['interface/frontend.gui'],
        why: 'edit boxes',
        views: [
          {
            id: 'main-menu',
            title: 'Main menu',
            recipe: { from: 'main-menu', steps: [], verified: true, evidence: 'etch#9' },
            roots: ['country_selection_panel'],
            codeFilled: ['country_selection_panel//version_label'],
          },
        ],
      },
      {
        id: 'court',
        title: 'Court',
        files: ['interface/countrycourtview.gui'],
        why: 'a pie chart',
        views: [
          {
            id: 'court',
            title: 'Court',
            recipe: {
              from: 'save',
              steps: [{ key: 'f1' }, { click: 'countryview//court_tab' }],
              verified: true,
              evidence: 'live',
            },
            roots: ['countrycourtview'],
            codeFilled: [],
          },
        ],
      },
    ],
    knownDeviations: [],
  };
}

function problemsOf(edit: (m: Record<string, unknown>) => void): string[] {
  const m = sample();
  edit(m);
  return parseCorpusManifest(m).problems.map((p) => `${p.at}: ${p.message}`);
}

describe('the committed corpus', () => {
  it('has a valid manifest pinned to the supported build', async () => {
    const manifest = await committedManifest();
    expect(manifest.game).toEqual({
      version: SUPPORTED_GAME_VERSION,
      exeSha256: SUPPORTED_GAME_EXE_SHA256,
    });
    expect(manifest.uiScale).toBe(1);
  });

  it('lists the corpus resolutions, all but the unchecked ones confirmed', async () => {
    const manifest = await committedManifest();
    expect(manifest.resolutions.map((r) => ({ width: r.width, height: r.height }))).toEqual(
      CORPUS_RESOLUTIONS,
    );
    const unchecked = UNCHECKED_RESOLUTIONS.map((r) => `${String(r.width)}x${String(r.height)}`);
    for (const r of manifest.resolutions) {
      expect(r.confirmed, `${String(r.width)}x${String(r.height)}`).toBe(
        !unchecked.includes(`${String(r.width)}x${String(r.height)}`),
      );
    }
  });

  it('has the 11 vanilla corpus windows of etch#10 in the four release playsets', async () => {
    const manifest = await committedManifest();
    expect(manifest.windows).toHaveLength(11);
    const release = manifest.playsets.filter((p) => p.gate === 'release');
    // The Anbennar playset gates 2.0.0 since M10 (spec v2 section 10).
    expect(release.map((p) => p.id)).toEqual([
      'vanilla',
      'proper-2k-ui-enhanced',
      'anbennar',
      'anbennar-alone',
    ]);
    for (const playset of release) {
      // The event window waits for a recipe (etch#97) and gates nothing until then.
      expect(playset.windows).toEqual(
        manifest.windows.map((w) => w.id).filter((id) => id !== 'event'),
      );
    }
  });

  it('records no known deviation since the button text edges were fixed (etch#96)', async () => {
    expect((await committedManifest()).knownDeviations).toEqual([]);
  });

  it('has capture records that match the manifest', async () => {
    const manifest = await committedManifest();
    for (const path of await listCaptureRecords(CORPUS)) {
      const { capture, problems } = await readCaptureRecord(join(CORPUS, ...path.split('/')));
      expect(problems, path).toEqual([]);
      if (capture === undefined) continue;
      expect(`${capturePath(capture)}.json`).toBe(path);
      expect(captureProblems(manifest, capture), path).toEqual([]);
    }
  });
});

describe('parseCorpusManifest', () => {
  it('accepts a valid manifest', () => {
    expect(parseCorpusManifest(sample()).problems).toEqual([]);
  });

  it('reports unknown and missing fields with where they are', () => {
    expect(
      problemsOf((m) => {
        set(m, 'windows.0.views.0.colour', 'red');
        unset(m, 'playsets.0.title');
      }),
    ).toEqual([
      'windows[0].views[0].colour: Unknown field "colour".',
      'playsets[0]: Missing field "title".',
    ]);
  });

  it('asks a release playset to pin its save and every mod', () => {
    expect(
      problemsOf((m) => {
        unset(m, 'playsets.0.save');
        set(m, 'playsets.0.mods', [{ name: 'A mod', workshopId: '123' }]);
      }),
    ).toEqual([
      'playsets[0]: A release playset pins its save.',
      'playsets[0].mods[0]: A release playset pins every mod by its content hash.',
    ]);
  });

  it('allows a report playset without pins', () => {
    expect(
      problemsOf((m) => {
        set(m, 'playsets.1.mods', [{ name: 'x' }]);
      }),
    ).toEqual([]);
  });

  it('checks ids, references and duplicates', () => {
    expect(
      problemsOf((m) => {
        set(m, 'windows.1.views.0.id', 'main-menu');
        set(m, 'playsets.1.windows', ['court', 'ledger']);
        set(m, 'playsets.1.id', 'Big Mod');
        set(m, 'resolutions.2', {
          width: 3440,
          height: 1440,
          confirmed: true,
          evidence: 'x',
        });
      }),
    ).toEqual([
      'resolutions[2]: The resolution "3440x1440" occurs more than once.',
      'windows: The view id "main-menu" occurs more than once.',
      'playsets[1].id: "Big Mod" is not an id in lowercase words joined by -.',
      'playsets[1].windows[1]: No corpus window has the id "ledger".',
    ]);
  });

  it('checks recipe steps, roots and widget patterns', () => {
    expect(
      problemsOf((m) => {
        set(m, 'windows.1.views.0.recipe.steps', [
          { key: 'F1' },
          { key: 'f1', click: 'x' },
          { click: 'a///b' },
          { point: { x: 0.5, y: 1.5 } },
          { point: { x: 0, y: 1 } },
        ]);
        set(m, 'windows.1.views.0.roots', []);
        set(m, 'windows.1.views.0.codeFilled', ['a/[x]']);
        set(m, 'windows.1.views.0.codeMoved', ['a/b', 'c/[y]']);
      }),
    ).toEqual([
      expect.stringMatching(/^windows\[1\]\.views\[0\]\.recipe\.steps\[0\]\.key: Expected one of /),
      'windows[1].views[0].recipe.steps[1]: Give one of "key", "click", "point", "text", "map", "wheel" or "province".',
      'windows[1].views[0].recipe.steps[2].click: "a///b" has more than two slashes in a row.',
      'windows[1].views[0].recipe.steps[3].point.y: Expected a fraction from 0 to 1.',
      'windows[1].views[0].roots: A verified recipe names the roots it reads.',
      'windows[1].views[0].codeFilled[0]: "[x]" in "a/[x]" is not a name with an optional [n].',
      'windows[1].views[0].codeMoved[1]: "[y]" in "c/[y]" is not a name with an optional [n].',
    ]);
  });

  it('checks text and map steps, selector values and recipes by playset', () => {
    expect(
      problemsOf((m) => {
        set(m, 'windows.1.views.0.recipe.steps', [
          { text: 'Verne' },
          { text: 'snow ☃' },
          { map: { x: -0.65, y: 0.1 } },
          { map: { x: -3, y: 0 } },
          { wheel: { x: 0.5, y: 0, steps: 0 } },
          { wheel: { x: 0.5, y: 0, steps: -3 } },
        ]);
        set(m, 'windows.1.views.0.selectors', { owner: 'yes', 'bad id!': 'x', tab: 3 });
        set(m, 'windows.1.views.0.byPlayset', {
          'big-mod': {
            recipe: { from: 'save', steps: [{ key: 'f2' }], verified: false, evidence: 'not yet' },
            selectors: { owner: 'no' },
            note: 'its own save',
          },
          nowhere: { colour: 'red' },
        });
      }),
    ).toEqual([
      'windows[1].views[0].recipe.steps[1].text: "snow ☃" is not Latin-1 text.',
      'windows[1].views[0].recipe.steps[3].map.x: Expected client heights from the centre, from -2 to 2.',
      'windows[1].views[0].recipe.steps[4].wheel.steps: Turn the wheel at least one step.',
      'windows[1].views[0].selectors.bad id!: Not a selector id.',
      'windows[1].views[0].selectors.tab: Expected a non-empty string.',
      'windows[1].views[0].byPlayset.nowhere.colour: Unknown field "colour".',
      'windows[1].views[0].byPlayset.nowhere: The manifest has no playset "nowhere".',
    ]);
  });

  it("checks a playset's resolutions", () => {
    expect(
      problemsOf((m) => {
        set(m, 'playsets.0.resolutions', ['3440x1440']);
      }),
    ).toEqual([]);
    expect(
      problemsOf((m) => {
        set(m, 'playsets.0.resolutions', ['2560x1440', '3440x1440', '3440x1440']);
      }),
    ).toEqual([
      'playsets[0].resolutions[0]: The manifest has no resolution "2560x1440".',
      'playsets[0].resolutions: The resolution "3440x1440" occurs more than once.',
    ]);
  });

  it('lets an unverified recipe leave its steps and roots empty', () => {
    expect(
      problemsOf((m) => {
        set(m, 'windows.1.views.0.recipe', {
          from: 'save',
          steps: [],
          verified: false,
          evidence: 'not chosen yet',
        });
        set(m, 'windows.1.views.0.roots', []);
      }),
    ).toEqual([]);
  });

  it('checks not-covered kinds and shaders', () => {
    expect(
      problemsOf((m) => {
        m['notCovered'] = [
          { widgetKind: 'ButtonType', reason: 'x' },
          { widgetKind: 'buttonType', shader: 'x', reason: 'x' },
          { shader: 'Gui_RenderTarget', reason: 'x' },
        ];
      }),
    ).toEqual([
      expect.stringMatching(/^notCovered\[0\]\.widgetKind: Expected one of /),
      'notCovered[1]: Give either "widgetKind" or "shader".',
      'notCovered[2].shader: "Gui_RenderTarget" is not a shader name in lower case.',
    ]);
  });

  it('checks known deviations and their scopes', () => {
    expect(
      problemsOf((m) => {
        m['knownDeviations'] = [
          {
            id: 'button-text-lower',
            widgets: '//*',
            kinds: ['guiButtonType'],
            views: ['court', 'lobby'],
            resolutions: ['1366x768'],
            difference: 'text drawn 1 px lower',
            issue: 'https://github.com/happy-dwarf-team/etch/issues/9',
            consent: 'https://github.com/happy-dwarf-team/etch/issues/44#issuecomment-1',
          },
          { id: 'no-issue', widgets: 'x', difference: 'x', issue: '#9', consent: 'x' },
        ];
      }),
    ).toEqual([
      'knownDeviations[0].views[1]: The manifest has no view "lobby".',
      'knownDeviations[0].resolutions[0]: The manifest has no resolution "1366x768".',
      'knownDeviations[1].issue: "#9" is not a GitHub issue link.',
      'knownDeviations[1].consent: "x" is not a link.',
    ]);
  });

  it('rejects other format versions and UI scales', () => {
    expect(
      problemsOf((m) => {
        m['formatVersion'] = 2;
        m['uiScale'] = 1.25;
      }),
    ).toEqual([
      'formatVersion: Expected 1.',
      'uiScale: Only a UI scale of 1 is checked (ADR 0002).',
    ]);
  });
});

describe('the corpus helpers', () => {
  const manifest = parseCorpusManifest(sample()).manifest as CorpusManifest;

  it("lists a playset's captures at its own resolutions only", () => {
    const m = sample();
    set(m, 'playsets.1.resolutions', ['3440x1440']);
    const parsed = parseCorpusManifest(m).manifest as CorpusManifest;
    expect(requiredCaptures(parsed).filter((k) => k.playset === 'big-mod')).toEqual([
      { playset: 'big-mod', resolution: { width: 3440, height: 1440 }, view: 'court' },
    ]);
  });

  it('lists the captures a release needs, and all of them', () => {
    expect(requiredCaptures(manifest, { gating: true })).toEqual([
      { playset: 'vanilla', resolution: { width: 3440, height: 1440 }, view: 'main-menu' },
      { playset: 'vanilla', resolution: { width: 3440, height: 1440 }, view: 'court' },
    ]);
    expect(requiredCaptures(manifest)).toHaveLength(6);
  });

  it("gives a view its playset's own recipe and selectors", () => {
    const m = sample();
    set(m, 'windows.1.views.0.selectors', { owner: 'yes', tab: 'province' });
    set(m, 'windows.1.views.0.byPlayset', {
      'big-mod': {
        recipe: { from: 'save', steps: [{ key: 'f2' }], verified: false, evidence: 'not yet' },
        selectors: { owner: 'no' },
      },
    });
    const parsed = parseCorpusManifest(m).manifest as CorpusManifest;
    const view = findView(parsed, 'court')?.view;
    if (view === undefined) throw new Error('no view');
    expect(viewInPlayset(view, { id: 'vanilla' })).toBe(view);
    const own = viewInPlayset(view, { id: 'big-mod' });
    expect(own.recipe.steps).toEqual([{ key: 'f2' }]);
    expect(own.selectors).toEqual({ owner: 'no', tab: 'province' });
  });

  it('names capture files by playset, resolution and view', () => {
    expect(
      capturePath({ playset: 'vanilla', resolution: { width: 3440, height: 1440 }, view: 'court' }),
    ).toBe('captures/vanilla/3440x1440/court');
    expect(findView(manifest, 'court')?.window.id).toBe('court');
    expect(findView(manifest, 'nothing')).toBeUndefined();
  });

  it('applies a known deviation by pattern, kind and scope', () => {
    const deviation: KnownDeviation = {
      id: 'button-text-lower',
      widgets: '//*',
      kinds: ['guiButtonType'],
      views: ['court'],
      difference: 'text drawn 1 px lower',
      issue: 'https://github.com/happy-dwarf-team/etch/issues/9',
      consent: 'https://github.com/happy-dwarf-team/etch/issues/44#issuecomment-1',
    };
    const key = { playset: 'vanilla', resolution: { width: 3440, height: 1440 }, view: 'court' };
    expect(deviationCovers(deviation, key, 'countrycourtview/close', 'guiButtonType')).toBe(true);
    expect(deviationCovers(deviation, key, 'countrycourtview/bg', 'iconType')).toBe(false);
    expect(deviationCovers(deviation, key, 'countrycourtview/close', undefined)).toBe(false);
    expect(
      deviationCovers(deviation, { ...key, view: 'main-menu' }, 'a/close', 'guiButtonType'),
    ).toBe(false);
  });
});
