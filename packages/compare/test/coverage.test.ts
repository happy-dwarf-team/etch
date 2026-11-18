/// <reference types="node" />
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DiscoveryEnvironment } from '@etch/core/playset';
import { confirmedConstruct, runCoverage, type CoverageOptions } from '../src/coverage.ts';

const EXE = 'not really eu4.exe';
const EXE_SHA256 = createHash('sha256').update(EXE).digest('hex').toUpperCase();
const GAME = 'lib/steamapps/common/Europa Universalis IV';

/** A window the survey captures, one it never reaches, and a position that is no window. */
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
	windowType = {
		name = "other_window"
		position = { x = 0 y = 0 }
		size = { x = 50 y = 50 }
	}
	positionType = { name = "test_anchor" position = { x = 1 y = 1 } }
}
`;

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

const RECIPE = { from: 'main-menu', steps: [], verified: true, evidence: 'a test' };

/** A survey of one view at two sizes, of which only 1920x1080 was captured. */
const MANIFEST = {
  formatVersion: 1,
  game: { version: '1.37.5', exeSha256: EXE_SHA256 },
  tongs: { version: '0.36.0' },
  uiScale: 1,
  resolutions: [
    { width: 1920, height: 1080, confirmed: true, evidence: 'a test' },
    { width: 1280, height: 720, confirmed: true, evidence: 'a test' },
  ],
  codeFilledKinds: [],
  notCovered: [],
  knownDeviations: [],
  playsets: [
    { id: 'test', title: 'Test', gate: 'report', mods: [], disabledDlcs: [], windows: ['w'] },
  ],
  windows: [
    {
      id: 'w',
      title: 'Test window',
      files: ['interface/test.gui'],
      why: 'a test',
      views: [
        { id: 'v', title: 'Test view', recipe: RECIPE, roots: ['test_window'], codeFilled: [] },
      ],
    },
  ],
};

/** The game's test_window, its title at `titleX` (the `.gui` puts it at 15). */
function record(titleX: number): Record<string, unknown> {
  return {
    formatVersion: 1,
    playset: 'test',
    resolution: { width: 1920, height: 1080 },
    view: 'v',
    takenAt: '2026-11-18T06:00:00.000Z',
    game: { exeSha256: EXE_SHA256 },
    tongs: { version: '0.36.0' },
    mods: [],
    disabledDlcs: [],
    recipe: RECIPE,
    window: { width: 1920, height: 1080, dpi: 96 },
    screenshot: { sha256: 'A'.repeat(64), width: 1920, height: 1080, shots: 2 },
    widgets: [
      {
        name: 'test_window',
        path: 'test_window',
        type: 'window',
        visible: true,
        rect: { x: 10, y: 20, w: 300, h: 200 },
        children: [
          {
            name: 'title',
            path: 'test_window/title',
            type: 'text',
            visible: true,
            text: 'A title',
            rect: { x: titleX, y: 25, w: 100, h: 20 },
          },
        ],
      },
    ],
  };
}

async function addFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

describe('runCoverage', () => {
  let root: string;
  let options: CoverageOptions;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'etch-compare-coverage-'));
    await addFiles(root, {
      [`${GAME}/eu4.exe`]: EXE,
      [`${GAME}/interface/test.gui`]: GUI,
      [`${GAME}/localisation/test_l_english.yml`]: '﻿l_english:\n TEST_TITLE:0 "A title"\n',
      'survey/manifest.json': JSON.stringify(MANIFEST),
    });
    const environment: DiscoveryEnvironment = {
      readRegistryValue: () => Promise.resolve(undefined),
      env: { USERPROFILE: join(root, 'home') },
      homedir: join(root, 'home'),
    };
    options = {
      surveyFolder: join(root, 'survey'),
      profilesFolder: join(root, 'profiles'),
      gamePath: join(root, ...GAME.split('/')),
      environment,
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function capture(titleX: number): Promise<void> {
    await addFiles(root, {
      'survey/captures/test/1920x1080/v.json': JSON.stringify(record(titleX)),
    });
  }

  it('reports nothing captured for a survey without captures', async () => {
    const lines: string[] = [];
    const result = await runCoverage({ ...options, log: (line) => lines.push(line) });
    expect(result.views).toEqual([]);
    expect(result.notCaptured).toEqual(['captures/test/1920x1080/v', 'captures/test/1280x720/v']);
    expect(result.constructs).toEqual({});
    expect(lines).toEqual([]);
  });

  it('measures a captured view offline, in the preview and from its live snapshot', async () => {
    await capture(15);
    const lines: string[] = [];
    const result = await runCoverage({ ...options, log: (line) => lines.push(line) });
    expect(lines).toEqual(['captures/test/1920x1080/v: measuring']);
    expect(result.notCaptured).toEqual(['captures/test/1280x720/v']);
    expect(result.views).toHaveLength(1);
    const view = result.views[0];
    expect(view?.problems).toEqual([]);
    expect([view?.playset, view?.resolution, view?.view]).toEqual(['test', '1920x1080', 'v']);
    // The window and its title are where the `.gui` puts them, in every measure.
    for (const measure of [view?.offline, view?.preview, view?.live]) {
      expect(measure?.geometry.compared).toBe(2);
      expect(measure?.geometry.exact).toBe(2);
      expect(measure?.geometry.mismatches).toEqual([]);
      expect(measure?.visibility.agree).toBe(measure?.visibility.compared);
    }
    expect(view?.roots).toEqual([
      expect.objectContaining({ window: 'test_window', profiled: false, unknownSelectors: [] }),
    ]);
    // No profile, no profiled measures; no `compare` report, no pixels.
    expect(view?.profiled).toBeUndefined();
    expect(view?.profiledTexts).toBeUndefined();
    expect(view?.pixels).toBeUndefined();
  });

  it('sorts the windows of the playset into reached and not', async () => {
    await capture(15);
    const { windows } = await runCoverage(options);
    expect(windows.map((w) => [w.name, w.kind, w.status, w.views, w.widgets])).toEqual([
      ['test_window', 'windowType', 'view', ['v'], 2],
      ['other_window', 'windowType', 'not reached', [], 1],
    ]);
  });

  it('counts the constructs of each compared widget, exact where its rect was the game', async () => {
    await capture(15);
    const exact = await runCoverage(options);
    const counts = exact.constructs['test'] ?? {};
    expect(Object.keys(counts).length).toBeGreaterThan(0);
    for (const count of Object.values(counts)) {
      expect(count.exact).toBe(count.seen);
    }
    // Two widgets are not enough to confirm a construct (CONFIRMED.seen is 10).
    expect(Object.values(counts).some(confirmedConstruct)).toBe(false);
    expect(exact.windows.every((w) => w.confirmed === 0)).toBe(true);

    // The game's title 20 pixels to the right: the title's own constructs are seen, not exact.
    await capture(35);
    const moved = await runCoverage(options);
    const view = moved.views[0];
    expect(view?.offline.geometry.exact).toBe(1);
    expect(view?.offline.geometry.mismatches.map((m) => m.path)).toEqual(['test_window/title']);
    const missed = Object.values(moved.constructs['test'] ?? {}).filter((c) => c.exact < c.seen);
    expect(missed.length).toBeGreaterThan(0);
  });

  it('measures a profiled root with the selector values that fit the game', async () => {
    await capture(35);
    await addFiles(root, { 'profiles/vanilla/test_window.jsonc': SHIFT_PROFILE });
    const { views } = await runCoverage(options);
    const view = views[0];
    expect(view?.problems).toEqual([]);
    expect(view?.roots.map((r) => [r.window, r.profiled])).toEqual([['test_window', true]]);
    // Offline the title is 20 pixels off; with `shift = yes`, which fits the game, it is not.
    expect(view?.offline.geometry.exact).toBe(1);
    expect(view?.preview.geometry.exact).toBe(2);
    expect(view?.profiled?.geometry.exact).toBe(2);
    // Compare with Live Game sets the selectors the snapshot's states tell, and a selector that
    // only moves widgets is not one of them: the title stays at the default `shift = no`.
    expect(view?.profiledTexts?.geometry.exact).toBe(1);
    expect(
      view?.profiledTexts?.geometry.mismatches.map((m) => [m.path, m.game.x, m.layout?.x]),
    ).toEqual([['test_window/title', 35, 15]]);
    expect(view?.live.geometry.exact).toBe(2);
  });

  it("reads `compare`'s report of the capture, by kind of failing widget", async () => {
    await capture(15);
    const report = {
      passed: false,
      totals: { widgets: { fail: 2, pass: 5 }, pixels: { within: 900, compared: 1000 } },
      widgets: [
        { path: 'a', status: 'fail', kind: 'iconType', problems: ['The rect is 2 pixels off.'] },
        { path: 'b', status: 'fail', problems: ['The pixels differ.', 'The rect is off.'] },
        { path: 'c', status: 'pass', kind: 'iconType', problems: [] },
      ],
    };
    await addFiles(root, {
      'survey/reports/captures/test/1920x1080/v.json': JSON.stringify(report),
    });
    const { views } = await runCoverage(options);
    expect(views[0]?.pixels).toEqual({
      passed: false,
      fail: 2,
      pass: 5,
      within: 900,
      compared: 1000,
      failByKind: { iconType: 1, 'none in the layout': 1 },
      rectOnly: 1,
    });
  });

  it('names a root the playset does not define, and takes only the playsets asked for', async () => {
    // The game showed a window of another name, which no `.gui` file of the playset defines.
    const renamed = JSON.stringify(record(15)).replaceAll('test_window', 'gone_window');
    await addFiles(root, { 'survey/captures/test/1920x1080/v.json': renamed });
    const { views } = await runCoverage(options);
    expect(views[0]?.problems).toContain('The playset defines no window "gone_window".');
    expect(views[0]?.roots).toEqual([]);

    const none = await runCoverage({ ...options, playsets: ['other'] });
    expect(none).toEqual({ views: [], constructs: {}, windows: [], notCaptured: [] });
  });

  it('refuses a survey whose manifest has problems', async () => {
    await addFiles(root, { 'survey/manifest.json': JSON.stringify({ formatVersion: 2 }) });
    await expect(runCoverage(options)).rejects.toThrow("The survey's manifest has problems");
  });
});
