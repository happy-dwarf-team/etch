/**
 * Which game sessions a capture run needs. ADR 0002 asks for a fresh game start for each
 * resolution and playset; views opened from the main menu and views opened from the save get a
 * start each, because the game cannot go back from a loaded save to a fresh main menu, and so does
 * each view's own save (an event open, etch#97).
 */
import {
  findView,
  requiredCaptures,
  resolutionKey,
  viewInPlayset,
  viewSave,
  type CorpusManifest,
  type CorpusPlayset,
  type CorpusResolution,
  type CorpusSave,
  type CorpusView,
  type RecipeStart,
} from '../manifest.ts';

export interface CaptureSession {
  readonly playset: CorpusPlayset;
  readonly resolution: CorpusResolution;
  readonly start: RecipeStart;
  /** The save the game loads, from a save: the playset's, or the views' own (`viewSave`). */
  readonly save?: CorpusSave;
  /** The views to capture, in manifest order. */
  readonly views: readonly CorpusView[];
}

export interface SkippedView {
  readonly playset: string;
  readonly resolution: string;
  readonly view: string;
  readonly reason: string;
}

export interface CapturePlan {
  readonly sessions: readonly CaptureSession[];
  readonly skipped: readonly SkippedView[];
}

export interface PlanFilter {
  /** Only release playsets at confirmed resolutions (the default). */
  readonly gating?: boolean;
  readonly playsets?: readonly string[];
  /** As `1920x1080`. */
  readonly resolutions?: readonly string[];
  readonly views?: readonly string[];
}

/**
 * The sessions of a run, playset by playset, resolution by resolution: the main menu first, then
 * the playset's save, then the views' own saves.
 */
export function planCaptures(manifest: CorpusManifest, filter: PlanFilter = {}): CapturePlan {
  const unknown = [
    ...(filter.playsets ?? [])
      .filter((id) => !manifest.playsets.some((p) => p.id === id))
      .map((id) => `playset "${id}"`),
    ...(filter.resolutions ?? [])
      .filter((key) => !manifest.resolutions.some((r) => resolutionKey(r) === key))
      .map((key) => `resolution ${key}`),
    ...(filter.views ?? [])
      .filter((id) => findView(manifest, id) === undefined)
      .map((id) => `view "${id}"`),
  ];
  if (unknown.length > 0) throw new Error(`The manifest has no ${unknown.join(', ')}.`);

  const sessions = new Map<string, CaptureSession & { views: CorpusView[] }>();
  const skipped: SkippedView[] = [];
  for (const key of requiredCaptures(manifest, { gating: filter.gating ?? true })) {
    const resolution = resolutionKey(key.resolution);
    if (filter.playsets !== undefined && !filter.playsets.includes(key.playset)) continue;
    if (filter.resolutions !== undefined && !filter.resolutions.includes(resolution)) continue;
    if (filter.views !== undefined && !filter.views.includes(key.view)) continue;
    const found = findView(manifest, key.view);
    const playset = manifest.playsets.find((p) => p.id === key.playset);
    const size = manifest.resolutions.find((r) => resolutionKey(r) === resolution);
    if (found === undefined || playset === undefined || size === undefined) continue;
    const view = viewInPlayset(found.view, playset);
    const skip = (reason: string): void => {
      skipped.push({ playset: playset.id, resolution, view: view.id, reason });
    };
    if (view.roots.length === 0) {
      skip('The recipe names no roots to read.');
      continue;
    }
    const save = viewSave(view, playset);
    if (view.recipe.from === 'save' && save === undefined) {
      skip(`The playset "${playset.id}" has no save.`);
      continue;
    }
    if (playset.mods.some((m) => m.workshopId === undefined || m.sha256 === undefined)) {
      skip(`The playset "${playset.id}" has a mod without a Workshop item or a pin.`);
      continue;
    }
    const id = `${playset.id} ${resolution} ${view.recipe.from} ${save?.file ?? ''}`;
    let session = sessions.get(id);
    if (session === undefined) {
      session = {
        playset,
        resolution: size,
        start: view.recipe.from,
        ...(save !== undefined ? { save } : {}),
        views: [],
      };
      sessions.set(id, session);
    }
    session.views.push(view);
  }
  const order = (s: CaptureSession): number =>
    s.start === 'main-menu' ? 0 : s.save?.file === s.playset.save?.file ? 1 : 2;
  // Stable sort: playsets and resolutions keep manifest order, the main menu goes first.
  const list = [...sessions.values()];
  const grouped = list.sort((a, b) => {
    const pa = manifest.playsets.indexOf(a.playset) - manifest.playsets.indexOf(b.playset);
    if (pa !== 0) return pa;
    const ra =
      manifest.resolutions.indexOf(a.resolution) - manifest.resolutions.indexOf(b.resolution);
    return ra !== 0 ? ra : order(a) - order(b);
  });
  return { sessions: grouped, skipped };
}

/** One line per session, for a run's log and a dry run. */
export function describeSession(session: CaptureSession): string {
  const own =
    session.save !== undefined && session.save.file !== session.playset.save?.file
      ? ` ${session.save.file}`
      : '';
  return `${session.playset.id} ${resolutionKey(session.resolution)} from ${session.start}${own}: ${session.views.map((v) => v.id).join(', ')}`;
}
