import { describe, expect, it } from 'vitest';
import {
  WIDGET_STATUSES,
  corpusSummary,
  gates,
  outcomePassed,
  parseCorpusManifest,
  windowReport,
  type CaptureComparison,
  type CaptureKey,
  type CaptureOutcome,
  type CorpusManifest,
  type PixelCounts,
  type WidgetComparison,
} from '../../src/corpus/index.ts';

const EXE = '9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A';
const SMALL = { width: 200, height: 100 };
const WIDE = { width: 400, height: 100 };

function playset(id: string, gate: 'release' | 'report'): Record<string, unknown> {
  return {
    id,
    title: id,
    gate,
    save: { file: `${id}.eu4`, sha256: 'A'.repeat(64), description: 'a save' },
    mods: [],
    disabledDlcs: [],
    windows: ['panel', 'other'],
  };
}

function view(id: string): Record<string, unknown> {
  return {
    id,
    title: id,
    recipe: { from: 'main-menu', steps: [], verified: true, evidence: 'a test' },
    roots: [id],
    codeFilled: [],
  };
}

/** Two playsets (one gates a release) and two resolutions (one confirmed), two windows. */
function manifest(): CorpusManifest {
  const { manifest: parsed, problems } = parseCorpusManifest({
    formatVersion: 1,
    game: { version: '1.37.5', exeSha256: EXE },
    tongs: { version: '0.14.1' },
    uiScale: 1,
    resolutions: [
      { ...SMALL, confirmed: true, evidence: 'a test' },
      { ...WIDE, confirmed: false, evidence: 'a test' },
    ],
    codeFilledKinds: [],
    notCovered: [],
    playsets: [playset('vanilla', 'release'), playset('modded', 'report')],
    windows: [
      {
        id: 'panel',
        title: 'The panel',
        files: ['interface/a.gui'],
        why: 'a test',
        views: [view('panel')],
      },
      {
        id: 'other',
        title: 'Other',
        files: ['interface/b.gui', 'interface/c.gui'],
        why: 'a test',
        views: [view('other')],
      },
    ],
    knownDeviations: [],
  });
  expect(problems).toEqual([]);
  if (parsed === undefined) throw new Error('no manifest');
  return parsed;
}

function pixels(compared: number, within: number, meanDifference = 0): PixelCounts {
  return { compared, within, meanDifference, partial: 0, unstable: 0, masked: 0 };
}

function counts(edit: Partial<Record<(typeof WIDGET_STATUSES)[number], number>> = {}) {
  return { ...Object.fromEntries(WIDGET_STATUSES.map((s) => [s, 0])), ...edit } as Record<
    (typeof WIDGET_STATUSES)[number],
    number
  >;
}

function comparison(
  key: CaptureKey,
  widgets: readonly WidgetComparison[],
  extra: Partial<CaptureComparison> = {},
): CaptureComparison {
  const passed = widgets.every((w) => w.status !== 'fail');
  return {
    playset: key.playset,
    resolution: `${String(key.resolution.width)}x${String(key.resolution.height)}`,
    view: key.view,
    window: key.view,
    gate: key.playset === 'vanilla' ? 'release' : 'report',
    passed,
    problems: [],
    widgets,
    totals: { widgets: counts({ pass: widgets.length }), pixels: pixels(300, 297, 0.25) },
    ...extra,
  };
}

function compared(key: CaptureKey, widgets: readonly WidgetComparison[] = [], extra = {}) {
  return { kind: 'compared', key, comparison: comparison(key, widgets, extra) } as const;
}

const at = (playsetId: string, resolution: typeof SMALL, viewId = 'panel'): CaptureKey => ({
  playset: playsetId,
  resolution,
  view: viewId,
});

describe('corpus gate', () => {
  it('gates only a release playset at a confirmed resolution', () => {
    const m = manifest();
    expect(gates(m, at('vanilla', SMALL))).toBe(true);
    expect(gates(m, at('vanilla', WIDE))).toBe(false);
    expect(gates(m, at('modded', SMALL))).toBe(false);
    expect(gates(m, at('nobody', SMALL))).toBe(false);
    expect(gates(m, at('vanilla', { width: 1, height: 1 }))).toBe(false);
  });

  it('passes an outcome only when it was compared and passed', () => {
    expect(outcomePassed(compared(at('vanilla', SMALL)))).toBe(true);
    const failing = compared(at('vanilla', SMALL), [
      { path: 'panel/a', status: 'fail', problems: ['Off.'], pixels: pixels(1, 0) },
    ]);
    expect(outcomePassed(failing)).toBe(false);
    expect(
      outcomePassed({ kind: 'not-compared', key: at('vanilla', SMALL), reasons: ['None.'] }),
    ).toBe(false);
  });
});

describe('window report', () => {
  it('tells the profiles, the save texts and why each notable widget differs', () => {
    const key = at('vanilla', SMALL);
    const page = windowReport(manifest(), 'panel', [
      compared(
        key,
        [
          { path: 'panel/ok', status: 'pass', problems: [], pixels: pixels(10, 10) },
          {
            path: 'panel/known',
            type: 'icon',
            status: 'deviation',
            problems: [],
            deviations: ['font-hinting'],
            pixels: pixels(10, 5),
          },
          {
            path: 'panel/flag',
            status: 'not-covered',
            problems: ['Drawn by the game.'],
            reason: 'gui_rendertarget',
            pixels: pixels(0, 0),
          },
          {
            path: 'panel/bad',
            kind: 'iconType',
            status: 'fail',
            problems: ['Off.'],
            pixels: pixels(10, 0),
          },
        ],
        {
          problems: ['The capture is old.'],
          visibility: [
            { window: 'panel', compared: 12, mismatches: [{ path: 'panel/x', game: false }] },
          ],
          saveTexts: [
            {
              window: 'panel',
              compared: 3,
              matched: 2,
              differences: [
                { path: 'panel/name', from: 'player.name', sample: 'Muscovy', game: 'Russia' },
              ],
            },
          ],
        },
      ),
      // Another window's view is left out of this window's report.
      compared(at('vanilla', SMALL, 'other')),
    ]);
    expect(page).toContain('# The panel\n');
    expect(page).toContain('Corpus window `panel` (`interface/a.gui`), compared');
    expect(page).toContain('| vanilla | 200x100 | panel | release | **fail** | 4 | 0 |');
    expect(page).toContain('| 99.00 % | 0.25 |');
    expect(page).not.toContain('| other |');
    expect(page).toContain('- The capture is old.\n');
    expect(page).toContain('Profile of `panel`: 12 widgets, 1 not as the game shows them.');
    expect(page).toContain(
      'Save texts of `panel` (reported): 2 of 3 as the game shows them.\n' +
        '- `panel/name` (player.name): "Muscovy", the game "Russia".',
    );
    // Failures first, then deviations, then the rest, in the order of the statuses.
    const rows = page.split('\n').filter((l) => l.startsWith('| `panel/'));
    expect(rows).toEqual([
      '| `panel/bad` | iconType | fail | Off. |',
      '| `panel/known` | icon | deviation | Known deviation `font-hinting`. |',
      '| `panel/flag` |  | not-covered | Drawn by the game. Not covered: gui_rendertarget. |',
    ]);
  });

  it('says when every compared widget passes, and has no share without pixels', () => {
    const m = manifest();
    const key = at('modded', WIDE);
    const page = windowReport(m, 'panel', [
      compared(key, [{ path: 'panel/ok', status: 'pass', problems: [], pixels: pixels(4, 4) }]),
    ]);
    expect(page).toContain('| modded | 400x100 | panel | report | pass |');
    expect(page).toContain('Every compared widget passes: 300 pixels, 99.00 % within ±2.');

    const empty = windowReport(m, 'panel', [
      compared(key, [], {
        totals: { widgets: counts(), pixels: pixels(0, 0) },
      }),
    ]);
    expect(empty).toContain('| – | – |\n');
    expect(empty).toContain('Every compared widget passes: 0 pixels, – within ±2.');
  });

  it('names a window the manifest does not have by its id', () => {
    const page = windowReport(manifest(), 'gone', [compared(at('vanilla', SMALL))]);
    expect(page.startsWith('# gone\n\nCorpus window `gone` (), compared')).toBe(true);
    // Its views are not in the manifest, so the report has no rows.
    expect(page).not.toContain('| vanilla |');
  });
});

describe('corpus summary', () => {
  it('counts the captures of each window and playset at each resolution', () => {
    const m = manifest();
    const failing = compared(at('vanilla', SMALL, 'other'), [
      { path: 'other/a', status: 'fail', problems: ['Off.'], pixels: pixels(1, 0) },
    ]);
    const outcomes: CaptureOutcome[] = [
      compared(at('vanilla', SMALL)),
      compared(at('vanilla', WIDE)),
      compared(at('modded', WIDE)),
      failing,
      // A view of no window counts in no row.
      compared(at('vanilla', SMALL, 'gone')),
    ];
    const summary = corpusSummary(m, outcomes);
    expect(summary.passed).toBe(false);
    expect(summary.markdown).toContain(
      'The layout preview does not meet its target: 2 of 3 gating captures pass.',
    );
    expect(summary.markdown).toContain('| Window | Playset | Gate | 200x100 | 400x100 |');
    expect(summary.markdown).toContain('| [panel](panel.md) | vanilla | release | 1/1 | 1/1 |');
    expect(summary.markdown).toContain('| [panel](panel.md) | modded | report | – | 1/1 |');
    expect(summary.markdown).toContain('| [other](other.md) | vanilla | release | **0/1** | – |');
    // No row for a window and playset without captures.
    expect(summary.markdown).not.toContain('| [other](other.md) | modded |');

    const passing = corpusSummary(m, outcomes.slice(0, 3));
    expect(passing.passed).toBe(true);
    expect(passing.markdown).toContain(
      'The layout preview meets its target: all 1 gating captures pass.',
    );
  });

  it('does not meet the target without any gating capture', () => {
    const summary = corpusSummary(manifest(), [compared(at('modded', SMALL))]);
    expect(summary.passed).toBe(false);
    expect(summary.markdown).toContain('0 of 0 gating captures pass.');
  });
});
