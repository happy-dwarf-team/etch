/**
 * The Markdown summary of a coverage run (docs/coverage.md): per playset the shares of the three
 * measures, the views, the classes of what differs, the windows reached and not, and the
 * constructs.
 */
import { rectOrigins, type WidgetRect } from '@etch/core/corpus';
import {
  CONFIRMED,
  confirmedConstruct,
  type CoverageResult,
  type ViewCoverage,
  type WindowStatus,
} from './coverage.ts';

const percent = (part: number, whole: number): string =>
  whole === 0 ? '–' : `${(Math.floor((1000 * part) / whole) / 10).toFixed(1)} %`;

interface Totals {
  views: number;
  offlineGeometry: [number, number];
  offlineVisibility: [number, number];
  liveGeometry: [number, number];
  liveVisibility: [number, number];
  texts: [number, number];
  profiledTexts: [number, number];
  pixelsPassed: [number, number];
  full: { offline: number; live: number };
}

function totalsOf(views: readonly ViewCoverage[]): Totals {
  const t: Totals = {
    views: views.length,
    offlineGeometry: [0, 0],
    offlineVisibility: [0, 0],
    liveGeometry: [0, 0],
    liveVisibility: [0, 0],
    texts: [0, 0],
    profiledTexts: [0, 0],
    pixelsPassed: [0, 0],
    full: { offline: 0, live: 0 },
  };
  const add = (pair: [number, number], part: number, whole: number): void => {
    pair[0] += part;
    pair[1] += whole;
  };
  for (const v of views) {
    add(t.offlineGeometry, v.offline.geometry.exact, v.offline.geometry.compared);
    add(t.offlineVisibility, v.offline.visibility.agree, v.offline.visibility.compared);
    add(t.liveGeometry, v.live.geometry.exact, v.live.geometry.compared);
    add(t.liveVisibility, v.live.visibility.agree, v.live.visibility.compared);
    for (const r of v.roots) {
      add(t.texts, r.texts.taken, r.texts.shown);
      if (r.profiled) add(t.profiledTexts, r.texts.taken, r.texts.shown);
    }
    if (v.pixels !== undefined) add(t.pixelsPassed, v.pixels.passed ? 1 : 0, 1);
    if (full(v, 'offline')) t.full.offline++;
    if (full(v, 'live')) t.full.live++;
  }
  return t;
}

/**
 * As the measures' target asks: every compared rect exact and nothing the game shows missing from
 * the layout; from the live snapshot also every visibility agreeing. Offline, without a profile,
 * the outline draws everything but the other half of a `_large` pair, so its visibility is not part
 * of it.
 */
function full(v: ViewCoverage, which: 'offline' | 'live'): boolean {
  const m = v[which];
  return (
    m.geometry.exact === m.geometry.compared &&
    m.geometry.gameOnly.length === 0 &&
    (which === 'offline' || m.visibility.agree === m.visibility.compared)
  );
}

/** What a rect mismatch is, for grouping: the kind and which of x, y, w, h differ. */
function rectClass(kind: string | undefined, game: WidgetRect, layout?: WidgetRect): string {
  if (layout === undefined) return `${kind ?? '?'}: placed outside the screen`;
  const fields = (['x', 'y', 'w', 'h'] as const).filter((f) => game[f] !== layout[f]);
  return `${kind ?? '?'}: ${fields.join(', ')} differ`;
}

export function coverageMarkdown(result: CoverageResult): string {
  const lines: string[] = ['# Coverage survey results', ''];
  const playsets = [...new Set(result.views.map((v) => v.playset))];
  lines.push(
    'Shares are of widgets summed over the views (docs/coverage.md, "Measures"); a view is',
    '"full" when every compared rect is exact and the game shows nothing the layout lacks, and from',
    'the live snapshot also when every visibility agrees.',
    '',
    '| Playset | Resolution | Views | Outline rects | Outline visibility | Full (outline) | Live rects | Live visibility | Full (live) | Live texts | Texts, profiled windows | Pixel pass |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  const groups = [...new Set(result.views.map((v) => `${v.playset} ${v.resolution}`))];
  for (const group of groups) {
    const [id = '', resolution = ''] = group.split(' ');
    const t = totalsOf(result.views.filter((v) => v.playset === id && v.resolution === resolution));
    lines.push(
      `| ${id} | ${resolution} | ${String(t.views)} | ${percent(...t.offlineGeometry)} | ${percent(...t.offlineVisibility)} | ${String(t.full.offline)} | ${percent(...t.liveGeometry)} | ${percent(...t.liveVisibility)} | ${String(t.full.live)} | ${percent(...t.texts)} | ${percent(...t.profiledTexts)} | ${t.pixelsPassed[1] === 0 ? '–' : `${String(t.pixelsPassed[0])} of ${String(t.pixelsPassed[1])}`} |`,
    );
  }
  if (result.notCaptured.length > 0) {
    const by = new Map<string, number>();
    for (const name of result.notCaptured) {
      const [, playset = '', resolution = ''] = name.split('/');
      by.set(`${playset} ${resolution}`, (by.get(`${playset} ${resolution}`) ?? 0) + 1);
    }
    lines.push(
      '',
      `Captures the survey's manifest lists but no record has: ${[...by].map(([k, n]) => `${k} ${String(n)}`).join(', ')}. At 1280×720 only the views whose windows have a variant there are captured.`,
    );
  }

  lines.push('', '## What differs', '');
  for (const id of playsets) {
    const views = result.views.filter((v) => v.playset === id);
    const classes = new Map<string, { count: number; views: Set<string>; example: string }>();
    const bump = (cls: string, view: string, example: string): void => {
      const c = classes.get(cls) ?? { count: 0, views: new Set<string>(), example };
      c.count++;
      c.views.add(view);
      classes.set(cls, c);
    };
    for (const v of views) {
      for (const o of rectOrigins(v.offline.geometry.mismatches)) {
        const cls = `outline rect, ${rectClass(o.origin.kind, o.origin.game, o.origin.layout)}`;
        bump(cls, v.view, o.origin.path);
      }
      for (const p of v.offline.geometry.gameOnly)
        bump('outline: the game shows a widget the layout lacks', v.view, p);
      const profiled = new Set(
        v.roots.filter((r) => r.profiled).map((r) => r.window.toLowerCase()),
      );
      const whose = (path: string): string =>
        profiled.has((path.split('/')[0] ?? '').toLowerCase()) ? 'profiled' : 'no profile';
      for (const p of v.live.visibility.drawnHidden) {
        bump(`live: drawn, the game hides it (${whose(p)})`, v.view, p);
      }
      for (const p of v.live.visibility.shownMissing) {
        bump(`live: the game shows it, not drawn (${whose(p)})`, v.view, p);
      }
      for (const r of v.roots) {
        for (const p of r.texts.missing) {
          bump(`live text not taken (${r.profiled ? 'profiled' : 'no profile'})`, v.view, p);
        }
        for (const s of r.unknownSelectors)
          bump(`live: no value of selector ${s} fits`, v.view, r.window);
      }
    }
    lines.push(
      `### ${id}`,
      '',
      '| Class | Widgets | Views | Example |',
      '| --- | --- | --- | --- |',
    );
    for (const [cls, c] of [...classes].sort((a, b) => b[1].count - a[1].count).slice(0, 40)) {
      lines.push(`| ${cls} | ${String(c.count)} | ${String(c.views.size)} | \`${c.example}\` |`);
    }
    lines.push('');
  }

  lines.push('## Pixels', '');
  lines.push(
    "`compare`'s per-widget result for the survey's views. The survey's views have no hand-made",
    'masks of what the game fills (the corpus has `codeFilled`), so a text or icon the game fills',
    'fails by its content; the rect-only column counts the widgets that fail by their rect alone.',
    '',
    '| Playset | Views compared | Views passing | Widgets passing | Widgets failing | Rect only | Failing by kind |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const id of playsets) {
    const own = result.views.filter((v) => v.playset === id && v.pixels !== undefined);
    const kinds: Record<string, number> = {};
    for (const v of own) {
      for (const [k, n] of Object.entries(v.pixels?.failByKind ?? {}))
        kinds[k] = (kinds[k] ?? 0) + n;
    }
    const sum = (f: (p: NonNullable<ViewCoverage['pixels']>) => number): number =>
      own.reduce((n, v) => n + (v.pixels === undefined ? 0 : f(v.pixels)), 0);
    lines.push(
      `| ${id} | ${String(own.length)} | ${String(own.filter((v) => v.pixels?.passed === true).length)} | ${String(sum((p) => p.pass))} | ${String(sum((p) => p.fail))} | ${String(sum((p) => p.rectOnly))} | ${Object.entries(
        kinds,
      )
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${String(n)}`)
        .join(', ')} |`,
    );
  }
  lines.push('');

  lines.push('## Where rects start to differ', '');
  lines.push(
    'Each row is a widget whose outline rect is off while its parent is not off by the same',
    'amount; the widgets inside it that only move with it are counted, not listed. At the largest',
    'captured resolution only: below it a window taller than the screen takes the bounds of its',
    'children in Tongs, so its own rect is not compared and every child would count as an origin.',
    '',
  );
  for (const id of playsets) {
    const rows = new Map<
      string,
      { delta: string; moved: number; views: Set<string>; kind: string }
    >();
    const own = result.views.filter((x) => x.playset === id);
    const largest = Math.max(...own.map((x) => Number(x.resolution.split('x')[1] ?? 0)));
    for (const v of own.filter((x) => Number(x.resolution.split('x')[1] ?? 0) === largest)) {
      for (const o of rectOrigins(v.offline.geometry.mismatches)) {
        const key = `${o.origin.path}|${o.delta}`;
        const row = rows.get(key) ?? {
          delta: o.delta,
          moved: 0,
          views: new Set<string>(),
          kind: o.origin.kind ?? '?',
        };
        row.moved = Math.max(row.moved, o.moved);
        row.views.add(v.view);
        rows.set(key, row);
      }
    }
    lines.push(
      `### ${id}`,
      '',
      '| Widget | Kind | Layout − game (x, y) | Moved with it | Views |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const [key, row] of [...rows]
      .sort((a, b) => b[1].moved + b[1].views.size - (a[1].moved + a[1].views.size))
      .slice(0, 40)) {
      lines.push(
        `| \`${key.split('|')[0] ?? ''}\` | ${row.kind} | ${row.delta} | ${String(row.moved)} | ${String(row.views.size)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Windows', '');
  lines.push('| Playset | Windows | Views | Inside a view | Not reached |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const id of playsets) {
    const own = result.windows.filter((w) => w.playset === id);
    const count = (s: WindowStatus['status']): number => own.filter((w) => w.status === s).length;
    lines.push(
      `| ${id} | ${String(own.length)} | ${String(count('view'))} | ${String(count('inside'))} | ${String(count('not reached'))} |`,
    );
  }

  lines.push(
    '',
    "A window's confidence is the share of its widgets built only of confirmed constructs.",
    '',
    '| Playset | Not reached | Confidence 100 % | 90 % or more | 50 % or more | Below 50 % |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const id of playsets) {
    const own = result.windows.filter((w) => w.playset === id && w.status === 'not reached');
    const share = (w: WindowStatus): number => (w.widgets === 0 ? 1 : w.confirmed / w.widgets);
    lines.push(
      `| ${id} | ${String(own.length)} | ${String(own.filter((w) => share(w) === 1).length)} | ${String(own.filter((w) => share(w) >= 0.9).length)} | ${String(own.filter((w) => share(w) >= 0.5).length)} | ${String(own.filter((w) => share(w) < 0.5).length)} |`,
    );
  }

  lines.push('', '## Constructs', '');
  lines.push(
    `A construct is confirmed when at least ${String(CONFIRMED.seen)} widgets built with it were compared on their own and at least ${String(100 * CONFIRMED.exactShare)} % of them had the game's rect.`,
    '',
    '| Playset | Seen | Confirmed | All exact | Some rect differs |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const id of playsets) {
    const own = Object.values(result.constructs[id] ?? {});
    lines.push(
      `| ${id} | ${String(own.length)} | ${String(own.filter(confirmedConstruct).length)} | ${String(own.filter((c) => c.exact === c.seen).length)} | ${String(own.filter((c) => c.exact < c.seen).length)} |`,
    );
  }
  for (const id of playsets) {
    const doubtful = Object.entries(result.constructs[id] ?? {})
      .filter(([, c]) => c.exact < c.seen)
      .sort((a, b) => b[1].seen - b[1].exact - (a[1].seen - a[1].exact))
      .slice(0, 25);
    if (doubtful.length === 0) continue;
    lines.push('', `${id}, constructs with rects that differ (most first):`, '');
    for (const [k, c] of doubtful) {
      lines.push(`- \`${k}\`: ${String(c.seen - c.exact)} of ${String(c.seen)} differ`);
    }
  }

  lines.push('', '## Views', '');
  for (const id of playsets) {
    lines.push(
      `### ${id}`,
      '',
      '| View | Roots | Outline rects | Outline visibility | Live rects | Live visibility | Live texts | Pixels |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const v of result.views.filter((x) => x.playset === id)) {
      const shown = v.roots.reduce((n, r) => n + r.texts.shown, 0);
      const taken = v.roots.reduce((n, r) => n + r.texts.taken, 0);
      lines.push(
        `| ${v.view} ${v.resolution} | ${v.roots.map((r) => `${r.window}${r.profiled ? ' (profile)' : ''}`).join(', ')} | ${percent(v.offline.geometry.exact, v.offline.geometry.compared)} | ${percent(v.offline.visibility.agree, v.offline.visibility.compared)} | ${percent(v.live.geometry.exact, v.live.geometry.compared)} | ${percent(v.live.visibility.agree, v.live.visibility.compared)} | ${percent(taken, shown)} | ${v.pixels === undefined ? '–' : v.pixels.passed ? 'pass' : `${String(v.pixels.fail)} fail`} |`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
