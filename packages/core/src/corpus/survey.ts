/**
 * The coverage survey (docs/coverage.md): which playsets the crawler walks and how, and the
 * manifest of the views it found, in the corpus's own format, so that the capture driver captures
 * them and the comparison compares them as it does the corpus. The survey's manifest lives in its
 * local folder, beside its captures; only `coverage/survey.json` and the inventory the coverage
 * report writes are in the repository.
 */
import { LED_ELSEWHERE, neverClicked, type CrawlFile, type CrawlRules } from './driver/crawl.ts';
import type { CorpusManifest, CorpusPlayset, CorpusView, CorpusWindow } from './manifest.ts';

export const SURVEY_FORMAT_VERSION = 1;

export interface SurveyPlayset {
  /** A corpus playset's id, or the id of `playset`. */
  readonly id: string;
  /** A playset the corpus does not have, pinned like a corpus one: the holdout. */
  readonly playset?: CorpusPlayset;
  /** Walked by the crawler; otherwise its views are those of `viewsOf`. */
  readonly crawl: boolean;
  /** The crawled playset whose views this one captures, for a playset that is not crawled. */
  readonly viewsOf?: string;
  /** Measured once, before any fix the survey leads to, and reported apart. */
  readonly holdout?: boolean;
  /**
   * The resolutions this playset is captured at, in place of the survey's two: Proper 2K UI
   * Enhanced is made for screens of at least 2560×1440, as in the corpus.
   */
  readonly resolutions?: readonly string[];
}

export interface SurveyConfig {
  readonly formatVersion: typeof SURVEY_FORMAT_VERSION;
  readonly playsets: readonly SurveyPlayset[];
  /** The resolution the crawler walks and every view is captured at. */
  readonly resolution: string;
  /** Also captured at, for the views whose windows have another variant there. */
  readonly smallResolution: string;
  readonly starts: readonly ('save' | 'main-menu')[];
  readonly crawl: CrawlRules;
}

export function readSurveyConfig(text: string): SurveyConfig {
  const value = JSON.parse(text) as SurveyConfig;
  if ((value as { formatVersion?: unknown }).formatVersion !== SURVEY_FORMAT_VERSION) {
    throw new Error(
      `coverage/survey.json: formatVersion must be ${String(SURVEY_FORMAT_VERSION)}.`,
    );
  }
  for (const p of value.playsets) {
    if (!p.crawl && p.viewsOf === undefined) {
      throw new Error(`coverage/survey.json: the playset "${p.id}" needs crawl or viewsOf.`);
    }
  }
  return value;
}

/** The id of a survey view: the crawled playset, the start and the crawl state. */
export function surveyViewId(playset: string, start: string, state: string): string {
  return `${playset}-${start === 'main-menu' ? 'menu' : 'save'}-${state}`;
}

/**
 * The survey's manifest: the corpus manifest's game, Tongs, resolutions and rules, the survey's
 * playsets as report playsets at the survey's resolutions, and one window with one view for each
 * reproducible state of each crawl. A playset that is not crawled captures the views of the one
 * it names.
 */
export function surveyManifest(
  corpus: CorpusManifest,
  config: SurveyConfig,
  crawls: readonly CrawlFile[],
  /** The game-relative `.gui` file that defines a top-level window in a playset. */
  fileOf: (playset: string, window: string) => string | undefined = () => undefined,
): CorpusManifest {
  const windows: CorpusWindow[] = [];
  const byPlayset = new Map<string, string[]>();
  for (const crawl of crawls) {
    if (crawl.resolution !== config.resolution) continue;
    // A view Escape does not close ends its game when it is captured: such views go last, each
    // taken by a fresh start of its own (`run --max-starts`).
    const states = [
      ...crawl.states.filter((x) => x.escapeFails === undefined),
      ...crawl.states.filter((x) => x.escapeFails !== undefined),
    ];
    for (const state of states) {
      // Steps that Tongs refused cannot open the view again; steps that showed another view are
      // the game's memory of a window's last tab (`LED_ELSEWHERE`), which a fresh game does not have.
      if (state.unreproducible !== undefined && state.unreproducible !== LED_ELSEWHERE) continue;
      if (state.roots.length === 0) continue;
      // A view found before a `never` pattern named one of its clicks is left out with it.
      if (
        state.steps.some(
          (step) => 'click' in step && neverClicked(config.crawl, step.click) !== undefined,
        )
      ) {
        continue;
      }
      const id = surveyViewId(crawl.playset, crawl.start, state.id);
      const view: CorpusView = {
        id,
        title: `${state.roots.join(', ')} (${crawl.start}, ${state.id})`,
        recipe: {
          from: crawl.start,
          steps: state.steps,
          verified: false,
          evidence: `Found by the coverage crawler in ${crawl.playset} at ${crawl.resolution}.`,
        },
        roots: state.roots,
        codeFilled: [],
        ...(state.escapeFails === undefined
          ? state.unreproducible === undefined
            ? {}
            : {
                note: 'The game remembers what this window last showed; captured as a fresh game opens it.',
              }
          : { note: `Escape does not close it: ${state.escapeFails}` }),
      };
      const files = [
        ...new Set(state.roots.map((r) => fileOf(crawl.playset, r) ?? 'interface/unknown.gui')),
      ];
      windows.push({
        id,
        title: view.title,
        files,
        why: 'A view of the coverage survey.',
        views: [view],
      });
      byPlayset.set(crawl.playset, [...(byPlayset.get(crawl.playset) ?? []), id]);
    }
  }
  const playsets: CorpusPlayset[] = config.playsets.flatMap((p) => {
    const base = p.playset ?? corpus.playsets.find((c) => c.id === p.id);
    if (base === undefined) throw new Error(`The corpus has no playset "${p.id}".`);
    const own = byPlayset.get(p.crawl ? p.id : (p.viewsOf ?? '')) ?? [];
    if (own.length === 0) return [];
    return [
      {
        ...base,
        gate: 'report' as const,
        resolutions: p.resolutions ?? [config.resolution, config.smallResolution],
        windows: own,
        note: p.holdout === true ? 'The survey holdout.' : 'A playset of the coverage survey.',
      },
    ];
  });
  return { ...corpus, playsets, windows, knownDeviations: [] };
}
