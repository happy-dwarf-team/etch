import { describe, expect, it } from 'vitest';
import type { GeometryCounts, RectMismatch, VisibilityCounts } from '@etch/core/corpus';
import { coverageMarkdown } from '../src/coverage-report.ts';
import {
  confirmedConstruct,
  type CoverageResult,
  type ViewCoverage,
  type WindowStatus,
} from '../src/coverage.ts';

function geometry(
  exact: number,
  compared: number,
  more: Partial<GeometryCounts> = {},
): GeometryCounts {
  return { compared, exact, mismatches: [], gameOnly: [], layoutOnly: [], codeFilled: 0, ...more };
}

function visibility(
  agree: number,
  compared: number,
  more: Partial<VisibilityCounts> = {},
): VisibilityCounts {
  return { compared, agree, drawnHidden: [], shownMissing: [], ...more };
}

const rect = (
  x: number,
  y: number,
  w = 10,
  h = 10,
): { x: number; y: number; w: number; h: number } => ({
  x,
  y,
  w,
  h,
});

function view(more: Partial<ViewCoverage> & Pick<ViewCoverage, 'view'>): ViewCoverage {
  const m = { geometry: geometry(1, 1), visibility: visibility(1, 1) };
  return {
    playset: 'vanilla',
    resolution: '1920x1080',
    roots: [],
    offline: m,
    preview: m,
    live: m,
    problems: [],
    ...more,
  };
}

function window(more: Partial<WindowStatus> & Pick<WindowStatus, 'name' | 'status'>): WindowStatus {
  return {
    playset: 'vanilla',
    kind: 'windowType',
    file: 'interface/a.gui',
    views: [],
    widgets: 10,
    confirmed: 10,
    ...more,
  };
}

/** The table rows under a heading line, up to the next blank line after them. */
function table(markdown: string, heading: string): string[] {
  const lines = markdown.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`no ${heading}`);
  const rows: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) rows.push(line);
    else if (rows.length > 0) break;
  }
  return rows.slice(rows.findIndex((r) => r.startsWith('| ---')) + 1);
}

const moved: RectMismatch[] = [
  { path: 'w/panel', kind: 'containerWindowType', game: rect(0, 0), layout: rect(5, 0) },
  { path: 'w/panel/a', kind: 'iconType', game: rect(1, 1), layout: rect(6, 1) },
  { path: 'w/panel/b', kind: 'instantTextBoxType', game: rect(2, 2), layout: rect(7, 2) },
  { path: 'w/size', kind: 'iconType', game: rect(0, 0), layout: rect(0, 0, 20) },
  { path: 'w/gone', kind: 'iconType', game: rect(0, 0) },
];

const RESULT: CoverageResult = {
  views: [
    view({
      view: 'country',
      roots: [
        {
          window: 'countryview',
          profiled: true,
          unknownSelectors: ['tab'],
          texts: { shown: 4, taken: 3, missing: ['countryview/name'] },
        },
      ],
      offline: {
        geometry: geometry(7, 12, { mismatches: moved, gameOnly: ['w/extra'] }),
        visibility: visibility(2, 3),
      },
      preview: { geometry: geometry(2, 3), visibility: visibility(1, 3) },
      live: {
        geometry: geometry(3, 3),
        visibility: visibility(1, 3, {
          drawnHidden: ['countryview/hidden'],
          shownMissing: ['topbar/shown'],
        }),
      },
      profiled: { geometry: geometry(1, 2), visibility: visibility(2, 2) },
      profiledTexts: { geometry: geometry(2, 2), visibility: visibility(1, 2) },
      pixels: {
        passed: false,
        fail: 3,
        pass: 7,
        within: 0,
        compared: 10,
        failByKind: { iconType: 2, instantTextBoxType: 1 },
        rectOnly: 1,
      },
    }),
    view({
      view: 'ledger',
      roots: [
        {
          window: 'ledger',
          profiled: false,
          unknownSelectors: [],
          texts: { shown: 2, taken: 2, missing: [] },
        },
      ],
      pixels: {
        passed: true,
        fail: 0,
        pass: 5,
        within: 0,
        compared: 5,
        failByKind: { iconType: 0 },
        rectOnly: 0,
      },
    }),
    view({
      view: 'ledger',
      resolution: '1280x720',
      offline: {
        geometry: geometry(0, 1, { mismatches: moved.slice(0, 1) }),
        visibility: visibility(0, 0),
      },
    }),
    view({ view: 'menu', playset: 'anbennar', resolution: '1920x1080' }),
  ],
  constructs: {
    vanilla: {
      'iconType spriteType': { seen: 20, exact: 20 },
      'iconType frame': { seen: 10, exact: 9 },
      'instantTextBoxType font': { seen: 3, exact: 1 },
    },
  },
  windows: [
    window({ name: 'countryview', status: 'view', views: ['country'] }),
    window({ name: 'tab', status: 'inside' }),
    window({ name: 'a', status: 'not reached' }),
    window({ name: 'b', status: 'not reached', confirmed: 9 }),
    window({ name: 'c', status: 'not reached', confirmed: 5 }),
    window({ name: 'd', status: 'not reached', confirmed: 1 }),
    window({ name: 'e', status: 'not reached', widgets: 0, confirmed: 0 }),
  ],
  notCaptured: [
    'captures/vanilla/1280x720/country',
    'captures/vanilla/1280x720/menu',
    'captures/anbennar/1920x1080/country',
  ],
};

describe('coverageMarkdown', () => {
  const md = coverageMarkdown(RESULT);

  it('sums the measures per playset and resolution, floored to a tenth of a per cent', () => {
    const rows = table(
      md,
      '| Playset | Resolution | Views | Offline preview: rects | Offline preview: visibility | Outline rects | Outline visibility | Full (outline) | With profiles: rects | With profiles: visibility | Live rects | Live visibility | Full (live) | Live texts | Texts, profiled windows | Pixel pass |',
    );
    expect(rows).toEqual([
      '| vanilla | 1920x1080 | 2 | 75.0 % | 50.0 % | 61.5 % | 75.0 % | 1 | 50.0 % | 100.0 % | 100.0 % | 50.0 % | 1 | 83.3 % | 75.0 % | 1 of 2 |',
      '| vanilla | 1280x720 | 1 | 100.0 % | 100.0 % | 0.0 % | – | 0 | – | – | 100.0 % | 100.0 % | 1 | – | – | – |',
      '| anbennar | 1920x1080 | 1 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 1 | – | – | 100.0 % | 100.0 % | 1 | – | – | – |',
    ]);
    expect(
      table(
        md,
        '| Playset | Resolution | With profiles and live texts: rects | With profiles and live texts: visibility |',
      ),
    ).toEqual([
      '| vanilla | 1920x1080 | 100.0 % | 50.0 % |',
      '| vanilla | 1280x720 | – | – |',
      '| anbennar | 1920x1080 | – | – |',
    ]);
  });

  it('counts the captures no record has by playset and resolution', () => {
    expect(md).toContain(
      "Captures the survey's manifest lists but no record has: vanilla 1280x720 2 (country, menu), anbennar 1920x1080 1 (country).",
    );
    expect(coverageMarkdown({ ...RESULT, notCaptured: [] })).not.toContain('no record has');
  });

  it('groups what differs by class, most widgets first', () => {
    expect(table(md, '### vanilla')).toEqual([
      '| outline rect, containerWindowType: x differ | 2 | 2 | `w/panel` |',
      '| outline rect, iconType: w differ | 1 | 1 | `w/size` |',
      '| outline rect, iconType: placed outside the screen | 1 | 1 | `w/gone` |',
      '| outline: the game shows a widget the layout lacks | 1 | 1 | `w/extra` |',
      '| live: drawn, the game hides it (profiled) | 1 | 1 | `countryview/hidden` |',
      '| live: the game shows it, not drawn (no profile) | 1 | 1 | `topbar/shown` |',
      '| live text not taken (profiled) | 1 | 1 | `countryview/name` |',
      '| live: no value of selector tab fits | 1 | 1 | `countryview` |',
    ]);
  });

  it('sums the pixel results and the failing kinds', () => {
    expect(
      table(
        md,
        '| Playset | Views compared | Views passing | Widgets passing | Widgets failing | Rect only | Failing by kind |',
      ),
    ).toEqual([
      '| vanilla | 2 | 1 | 12 | 3 | 1 | iconType 2, instantTextBoxType 1 |',
      '| anbennar | 0 | 0 | 0 | 0 | 0 |  |',
    ]);
  });

  it('lists where rects start to differ at the largest resolution only', () => {
    const section = md.slice(
      md.indexOf('## Where rects start to differ'),
      md.indexOf('## Windows'),
    );
    expect(table(section, '### vanilla')).toEqual([
      '| `w/panel` | containerWindowType | 5,0 | 2 | 1 |',
      '| `w/size` | iconType | 0,0 | 0 | 1 |',
      '| `w/gone` | iconType | off screen | 0 | 1 |',
    ]);
  });

  it("sorts the windows by status and the unreached ones by their constructs' confidence", () => {
    expect(table(md, '| Playset | Windows | Views | Inside a view | Not reached |')).toEqual([
      '| vanilla | 7 | 1 | 1 | 5 |',
      '| anbennar | 0 | 0 | 0 | 0 |',
    ]);
    // A window without widgets counts as fully confident.
    expect(
      table(
        md,
        '| Playset | Not reached | Confidence 100 % | 90 % or more | 50 % or more | Below 50 % |',
      ),
    ).toEqual(['| vanilla | 5 | 2 | 3 | 4 | 1 |', '| anbennar | 0 | 0 | 0 | 0 | 0 |']);
  });

  it('counts the constructs and lists the doubtful ones, most differing first', () => {
    expect(md).toContain('A construct is confirmed when at least 10 widgets built with it');
    expect(md).toContain('at least 95 % of them');
    expect(table(md, '| Playset | Seen | Confirmed | All exact | Some rect differs |')).toEqual([
      '| vanilla | 3 | 1 | 1 | 2 |',
      '| anbennar | 0 | 0 | 0 | 0 |',
    ]);
    expect(md).toContain(
      'vanilla, constructs with rects that differ (most first):\n\n- `instantTextBoxType font`: 2 of 3 differ\n- `iconType frame`: 1 of 10 differ\n',
    );
    expect(md).not.toContain('anbennar, constructs with rects');
    expect(confirmedConstruct({ seen: 10, exact: 9 })).toBe(false);
    expect(confirmedConstruct({ seen: 20, exact: 19 })).toBe(true);
  });

  it('lists each view with its roots and pixel result', () => {
    const views = md.slice(md.indexOf('## Views'));
    expect(table(views, '### vanilla')).toEqual([
      '| country 1920x1080 | countryview (profile) | 58.3 % | 66.6 % | 100.0 % | 33.3 % | 75.0 % | 3 fail |',
      '| ledger 1920x1080 | ledger | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | pass |',
      '| ledger 1280x720 |  | 0.0 % | – | 100.0 % | 100.0 % | – | – |',
    ]);
    expect(md.endsWith('|\n\n')).toBe(true);
  });
});
