/**
 * The coverage report of the survey (docs/coverage.md): every captured view of the survey's local
 * folder measured three ways, as the outline draws it offline, as the preview draws it from the
 * live snapshot of the same game, and, when `compare` ran over the folder, by its pixels; the
 * survey's `.gui` windows sorted into reached and not; and the constructs the views confirmed,
 * with the confidence they give every other window of the playset.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  capturePath,
  captureRecordFile,
  constructsOf,
  findView,
  matchesWidgetPattern,
  outlineGeometry,
  planCapture,
  readCaptureRecord,
  readCorpusManifest,
  rectOrigins,
  requiredCaptures,
  resolutionKey,
  rootInstance,
  snapshotOf,
  splitWidgetPath,
  textAgreement,
  visibilityAgreement,
  type CaptureComparison,
  type GeometryCounts,
  type PlanWindow,
  type TextCounts,
  type VisibilityCounts,
} from '@etch/core/corpus';
import type { DiscoveryEnvironment } from '@etch/core/playset';
import type { Widget } from '@etch/core';
import { CorpusPlaysetFiles } from './playset.ts';

export interface CoverageOptions {
  /** The survey's local folder: its `manifest.json`, `captures/` and, after `compare`, `reports/`. */
  readonly surveyFolder: string;
  readonly profilesFolder: string;
  readonly gamePath?: string | undefined;
  readonly environment?: DiscoveryEnvironment;
  readonly playsets?: readonly string[];
  readonly log?: (line: string) => void;
}

/** One root window of a view. */
export interface RootCoverage {
  readonly window: string;
  readonly profiled: boolean;
  /** Selectors of its profile that no value fits to the snapshot. */
  readonly unknownSelectors: readonly string[];
  readonly texts: TextCounts;
}

export interface ViewCoverage {
  readonly playset: string;
  readonly resolution: string;
  readonly view: string;
  readonly roots: readonly RootCoverage[];
  /** The offline outline: the `.gui` alone with the game's screen-height rules (etch#272). */
  readonly offline: { readonly geometry: GeometryCounts; readonly visibility: VisibilityCounts };
  /** The preview from the live snapshot of the same game. */
  readonly live: { readonly geometry: GeometryCounts; readonly visibility: VisibilityCounts };
  /** `compare`'s result for the capture, when it ran. */
  readonly pixels?: {
    readonly passed: boolean;
    readonly fail: number;
    readonly pass: number;
    readonly within: number;
    readonly compared: number;
    /** Failing widgets by `.gui` kind, and those of them that fail by their rect alone. */
    readonly failByKind: Readonly<Record<string, number>>;
    readonly rectOnly: number;
  };
  readonly problems: readonly string[];
}

export interface ConstructCount {
  /** Widgets built with it whose rect the survey compared. */
  seen: number;
  /** Of those, the ones whose rect was the game's. */
  exact: number;
}

export interface WindowStatus {
  readonly playset: string;
  readonly name: string;
  readonly kind: string;
  readonly file: string;
  /** `view`: a root of a captured view; `inside`: created inside one; `not reached`. */
  readonly status: 'view' | 'inside' | 'not reached';
  readonly views: readonly string[];
  /** Widgets of its definition, and of those the ones built only of confirmed constructs. */
  readonly widgets: number;
  readonly confirmed: number;
}

export interface CoverageResult {
  readonly views: readonly ViewCoverage[];
  readonly constructs: Readonly<Record<string, Readonly<Record<string, ConstructCount>>>>;
  readonly windows: readonly WindowStatus[];
  readonly notCaptured: readonly string[];
}

/**
 * A construct the survey confirms: compared often enough, and nearly always exact. A window's
 * confidence is an estimate for windows no survey reached, not a gate, so it takes a share where
 * the targets take none (docs/coverage.md, "Measures").
 */
export const CONFIRMED = { seen: 10, exactShare: 0.95 } as const;

export function confirmedConstruct(c: ConstructCount): boolean {
  return c.seen >= CONFIRMED.seen && c.exact / c.seen >= CONFIRMED.exactShare;
}

/** Top-level kinds that are windows a view can show; the others are parts and positions. */
const WINDOW_KINDS = new Set(['windowType', 'eu3dialogtype', 'containerWindowType']);

export async function runCoverage(options: CoverageOptions): Promise<CoverageResult> {
  const log = options.log ?? (() => undefined);
  const read = await readCorpusManifest(join(options.surveyFolder, 'manifest.json'));
  const manifest = read.manifest;
  if (manifest === undefined) {
    throw new Error(
      `The survey's manifest has problems: ${read.problems.map((p) => `${p.at}: ${p.message}`).join('; ')}`,
    );
  }
  const keys = requiredCaptures(manifest, { gating: false }).filter(
    (k) => options.playsets === undefined || options.playsets.includes(k.playset),
  );
  const playsets = new Map<string, Promise<CorpusPlaysetFiles>>();
  const open = (id: string): Promise<CorpusPlaysetFiles> => {
    let opening = playsets.get(id);
    if (opening === undefined) {
      const playset = manifest.playsets.find((p) => p.id === id);
      if (playset === undefined) throw new Error(`No playset "${id}".`);
      opening = CorpusPlaysetFiles.open(manifest, playset, {
        gamePath: options.gamePath,
        environment: options.environment,
      });
      playsets.set(id, opening);
    }
    return opening;
  };

  const views: ViewCoverage[] = [];
  const notCaptured: string[] = [];
  const constructs: Record<string, Record<string, ConstructCount>> = {};
  /** By playset: the names of top-level windows that are roots, and of every captured widget. */
  const roots = new Map<string, Map<string, Set<string>>>();
  const inside = new Map<string, Map<string, Set<string>>>();
  const note = (
    map: Map<string, Map<string, Set<string>>>,
    playset: string,
    name: string,
    view: string,
  ): void => {
    const byName = map.get(playset) ?? new Map<string, Set<string>>();
    map.set(playset, byName);
    const key = name.toLowerCase();
    byName.set(key, (byName.get(key) ?? new Set()).add(view));
  };

  for (const key of keys) {
    const name = capturePath(key);
    let record;
    try {
      record = (await readCaptureRecord(captureRecordFile(options.surveyFolder, key))).capture;
    } catch {
      record = undefined;
    }
    if (record === undefined) {
      notCaptured.push(name);
      continue;
    }
    log(`${name}: measuring`);
    const files = await open(key.playset);
    const problems: string[] = [];
    const offlineWindows: PlanWindow[] = [];
    const liveWindows: PlanWindow[] = [];
    const rootResults: RootCoverage[] = [];
    const codeSized = findView(manifest, key.view)?.view.codeSized ?? [];
    for (const root of record.widgets) {
      const top = splitWidgetPath(root.path)?.[0]?.name ?? root.path;
      // A window whose size the game's code sets is laid out at the game's size, as in `compare`.
      const size = codeSized.some((p) => matchesWidgetPattern(p, top))
        ? { width: root.rect.w, height: root.rect.h }
        : undefined;
      note(roots, key.playset, top, key.view);
      const walk = (w: typeof root): void => {
        if (w.name !== '') note(inside, key.playset, w.name, key.view);
        for (const c of w.children ?? []) walk(c);
      };
      walk(root);
      const instance = rootInstance(record.widgets, root.path);
      const offline = await files.window(top, record.resolution, [], size, instance);
      if (offline === undefined) {
        problems.push(`The playset defines no window "${top}".`);
        continue;
      }
      offlineWindows.push(offline);
      const loaded = await files.profile(options.profilesFolder, top);
      if (loaded !== undefined && loaded.problems.length > 0) {
        problems.push(...loaded.problems.map((p) => `Profile of ${top}: ${p}`));
      }
      const snapshot = snapshotOf(root, record.resolution, record.takenAt);
      const live = await files.livePreview(top, record.resolution, snapshot, loaded, size);
      if (live === undefined) continue;
      liveWindows.push(live.window);
      rootResults.push({
        window: top,
        profiled: loaded !== undefined,
        unknownSelectors: live.unknownSelectors,
        texts: textAgreement(snapshot, live.texts),
      });
    }
    const offlinePlan = planCapture({ manifest, record, windows: offlineWindows });
    const livePlan = planCapture({ manifest, record, windows: liveWindows });
    problems.push(...offlinePlan.problems);
    const geometry = outlineGeometry(offlinePlan);
    tallyConstructs(constructs, key.playset, offlinePlan, geometry);
    views.push({
      playset: key.playset,
      resolution: resolutionKey(key.resolution),
      view: key.view,
      roots: rootResults,
      offline: { geometry, visibility: visibilityAgreement(offlinePlan) },
      live: { geometry: outlineGeometry(livePlan), visibility: visibilityAgreement(livePlan) },
      ...(await pixelsOf(options.surveyFolder, name)),
      problems,
    });
  }

  const windows: WindowStatus[] = [];
  for (const id of new Set(keys.map((k) => k.playset))) {
    const files = await open(id);
    const confirmed = new Set(
      Object.entries(constructs[id] ?? {})
        .filter(([, c]) => confirmedConstruct(c))
        .map(([k]) => k),
    );
    const seen = new Set<string>();
    for (const definition of files.topLevel()) {
      if (!WINDOW_KINDS.has(definition.kind) || definition.name === '') continue;
      const key = definition.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const asRoot = roots.get(id)?.get(key);
      const within = inside.get(id)?.get(key);
      const widgets = files.definition(definition.name);
      const all = widgets === undefined ? [] : [...descendants(widgets)];
      windows.push({
        playset: id,
        name: definition.name,
        kind: definition.kind,
        file: definition.file,
        status: asRoot !== undefined ? 'view' : within !== undefined ? 'inside' : 'not reached',
        views: [...(asRoot ?? within ?? [])].sort(),
        widgets: all.length,
        confirmed: all.filter((w) => constructsOf(w).every((c) => confirmed.has(c))).length,
      });
    }
  }
  return { views, constructs, windows, notCaptured };
}

function* descendants(widget: Widget): Generator<Widget> {
  yield widget;
  for (const child of widget.children) yield* descendants(child);
}

/** Each compared widget's constructs: seen, and exact when its rect was the game's. */
function tallyConstructs(
  constructs: Record<string, Record<string, ConstructCount>>,
  playset: string,
  plan: ReturnType<typeof planCapture>,
  geometry: GeometryCounts,
): void {
  // A widget that only moves with a moved ancestor was not measured on its own: left out.
  const origins = rectOrigins(geometry.mismatches);
  const missed = new Set(origins.map((o) => o.origin.path));
  const moved = new Set(geometry.mismatches.map((m) => m.path).filter((p) => !missed.has(p)));
  const own = (constructs[playset] ??= {});
  for (const w of plan.widgets) {
    if (w.captured === undefined || w.hidden || w.codeFilled !== undefined) continue;
    if (w.laidOut === undefined || w.unplaced === true || moved.has(w.path)) continue;
    const exact = !missed.has(w.path);
    for (const c of constructsOf(w.laidOut.widget)) {
      const count = (own[c] ??= { seen: 0, exact: 0 });
      count.seen++;
      if (exact) count.exact++;
    }
  }
}

async function pixelsOf(
  surveyFolder: string,
  name: string,
): Promise<{ pixels?: NonNullable<ViewCoverage['pixels']> }> {
  try {
    const report = JSON.parse(
      await readFile(join(surveyFolder, 'reports', `${name}.json`), 'utf8'),
    ) as CaptureComparison;
    const failByKind: Record<string, number> = {};
    let rectOnly = 0;
    for (const w of report.widgets) {
      if (w.status !== 'fail') continue;
      const kind = w.kind ?? 'none in the layout';
      failByKind[kind] = (failByKind[kind] ?? 0) + 1;
      if (w.problems.every((p) => p.startsWith('The rect is'))) rectOnly++;
    }
    return {
      pixels: {
        passed: report.passed,
        fail: report.totals.widgets.fail,
        pass: report.totals.widgets.pass,
        within: report.totals.pixels.within,
        compared: report.totals.pixels.compared,
        failByKind,
        rectOnly,
      },
    };
  } catch {
    return {};
  }
}
