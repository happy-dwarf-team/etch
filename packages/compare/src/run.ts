/**
 * One run of the precision corpus (ADR 0002, etch#43): every capture the manifest wants, rendered
 * headless and compared widget by widget with its screenshot, and the reports. Reads the
 * repository's `corpus/` folder and the screenshots of the local corpus folder; writes only into
 * the local corpus folder's `renders/`, `diffs/` and `reports/` folders.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  captureProblems,
  capturePath,
  captureRecordFile,
  compareCapture,
  corpusSummary,
  decodePng,
  differenceImage,
  findView,
  encodePng,
  gates,
  hashFile,
  matchesWidgetPattern,
  planCapture,
  profileSaveTexts,
  profileVisibility,
  readCaptureRecord,
  readCorpusManifest,
  requiredCaptures,
  resolutionKey,
  screenshotFile,
  unstableMaskFile,
  splitWidgetPath,
  viewInPlayset,
  viewSave,
  windowReport,
  type CaptureKey,
  type CaptureOutcome,
  type CaptureRecord,
  type CorpusManifest,
  type CorpusWindow,
  type PlanWindow,
  type SaveTextReport,
  type VisibilityResult,
} from '@etch/core/corpus';
import { SaveChoice } from '@etch/core/profile';
import { readSave, type Save } from '@etch/core/save';
import type { DiscoveryEnvironment } from '@etch/core/playset';
import { HeadlessRenderer } from './headless.ts';
import { CorpusPlaysetFiles } from './playset.ts';

export interface RunOptions {
  /** The repository's `corpus/` folder: the manifest and the capture records. */
  readonly corpusFolder: string;
  /** The local corpus folder (`ETCH_CORPUS_PATH`): the screenshots, and where results go. */
  readonly localFolder: string;
  /** The game folder; found through Steam when not given. */
  readonly gamePath?: string | undefined;
  /** Only these playsets, views and resolutions (`WxH`); all when empty or left out. */
  readonly playsets?: readonly string[];
  readonly views?: readonly string[];
  readonly resolutions?: readonly string[];
  /** Etch's window profiles, `profiles/` beside `corpus/` when left out. */
  readonly profilesFolder?: string;
  /**
   * Where the playsets' saves are, for the report of the profiles' `save` texts; the report is
   * left out without it, or when a save is not the one its playset pins.
   */
  readonly savesFolder?: string;
  /** Render on the GPU instead of SwiftShader. */
  readonly gpu?: boolean;
  readonly environment?: DiscoveryEnvironment;
  readonly log?: (line: string) => void;
}

export interface RunResult {
  readonly manifest: CorpusManifest;
  readonly outcomes: readonly CaptureOutcome[];
  /** Every gating capture of the run compared and passed. */
  readonly passed: boolean;
  /** The WebGL renderer the renders came from, when any was drawn. */
  readonly gpu: string | undefined;
}

/** The folders of the local corpus folder a run writes. */
export const RESULT_FOLDERS = { renders: 'renders', diffs: 'diffs', reports: 'reports' } as const;

export async function runCorpus(options: RunOptions): Promise<RunResult> {
  const log = options.log ?? (() => undefined);
  const read = await readCorpusManifest(join(options.corpusFolder, 'manifest.json'));
  const manifest = read.manifest;
  if (manifest === undefined) {
    throw new Error(
      `corpus/manifest.json has problems: ${read.problems.map((p) => `${p.at}: ${p.message}`).join('; ')}`,
    );
  }
  const keys = requiredCaptures(manifest).filter(
    (key) =>
      wanted(options.playsets, key.playset) &&
      wanted(options.views, key.view) &&
      wanted(options.resolutions, resolutionKey(key.resolution)),
  );

  // First what can be compared at all, so that no playset is opened (and its mods hashed) for
  // nothing.
  const outcomes = new Map<CaptureKey, CaptureOutcome>();
  const ready: {
    key: CaptureKey;
    record: CaptureRecord;
    screenshot: string;
    unstable?: string;
  }[] = [];
  for (const key of keys) {
    const reasons = await readiness(manifest, key, options);
    if (typeof reasons === 'string' || Array.isArray(reasons)) {
      outcomes.set(key, { kind: 'not-compared', key, reasons: [reasons].flat() });
    } else {
      ready.push({ key, ...reasons });
    }
  }

  let renderer: HeadlessRenderer | undefined;
  const playsets = new Map<string, Promise<CorpusPlaysetFiles>>();
  const saves = new Map<string, Promise<Save | undefined>>();
  try {
    for (const { key, record, screenshot, unstable } of ready) {
      const name = capturePath(key);
      log(`${name}: comparing`);
      try {
        const playset = manifest.playsets.find((p) => p.id === key.playset);
        if (playset === undefined) throw new Error(`No playset "${key.playset}".`);
        let opening = playsets.get(playset.id);
        if (opening === undefined) {
          opening = CorpusPlaysetFiles.open(manifest, playset, {
            gamePath: options.gamePath,
            environment: options.environment,
          });
          playsets.set(playset.id, opening);
        }
        const files = await opening;
        const corpusWindow = manifest.windows.find((w) => w.id === manifestWindowOf(manifest, key));
        const codeSized = findView(manifest, key.view)?.view.codeSized ?? [];
        const windows: PlanWindow[] = [];
        for (const top of new Set(record.widgets.map((w) => topLevel(w.path)))) {
          // A window whose size the game's code sets is laid out at the game's size.
          const root = codeSized.some((p) => matchesWidgetPattern(p, top))
            ? record.widgets.find((w) => w.path === top)?.rect
            : undefined;
          const size = root === undefined ? undefined : { width: root.w, height: root.h };
          const window = await files.window(top, record.resolution, corpusWindow?.files, size);
          if (window !== undefined) windows.push(window);
        }
        const plan = planCapture({ manifest, record, windows });
        renderer ??= await HeadlessRenderer.launch({ gpu: options.gpu ?? false });
        const painted = await renderer.paint(plan.drawList, files.fileOf);
        const game = decodePng(await readFile(screenshot));
        const mask = unstable === undefined ? undefined : decodePng(await readFile(unstable));
        const { comparison, map } = compareCapture(manifest, plan, painted.image, game, mask);
        const visibility = await profileGate(
          manifest,
          options,
          files,
          key,
          record,
          corpusWindow,
          await saveOf(manifest, options, key, saves, log),
        );
        const problems = [
          ...comparison.problems,
          ...painted.problems.map((p) => `A texture could not be drawn: ${p}`),
          ...visibility.problems,
        ];
        const result = {
          ...comparison,
          passed: comparison.passed && problems.length === comparison.problems.length,
          problems,
          ...(visibility.results.length === 0 ? {} : { visibility: visibility.results }),
          ...(visibility.texts.length === 0 ? {} : { saveTexts: visibility.texts }),
        };
        await write(
          options.localFolder,
          RESULT_FOLDERS.renders,
          `${name}.png`,
          encodePng(painted.image),
        );
        await write(
          options.localFolder,
          RESULT_FOLDERS.diffs,
          `${name}.png`,
          encodePng(differenceImage(map, game)),
        );
        await write(
          options.localFolder,
          RESULT_FOLDERS.reports,
          `${name}.json`,
          `${JSON.stringify({ ...result, renderer: renderer.gpu }, null, 1)}\n`,
        );
        outcomes.set(key, { kind: 'compared', key, comparison: result });
        log(`${name}: ${result.passed ? 'pass' : 'FAIL'}`);
      } catch (error) {
        outcomes.set(key, { kind: 'not-compared', key, reasons: [messageOf(error)] });
        log(`${name}: not compared, ${messageOf(error)}`);
      }
    }
  } finally {
    await renderer?.close();
  }

  const ordered = keys.flatMap((key) => {
    const outcome = outcomes.get(key);
    return outcome === undefined ? [] : [outcome];
  });
  for (const window of manifest.windows) {
    if (!ordered.some((o) => manifestWindowOf(manifest, o.key) === window.id)) continue;
    await write(
      options.localFolder,
      RESULT_FOLDERS.reports,
      `${window.id}.md`,
      windowReport(manifest, window.id, ordered),
    );
  }
  const summary = corpusSummary(manifest, ordered);
  await write(options.localFolder, RESULT_FOLDERS.reports, 'README.md', summary.markdown);
  const gating = ordered.filter((o) => gates(manifest, o.key));
  return {
    manifest,
    outcomes: ordered,
    passed: gating.every((o) => o.kind === 'compared' && o.comparison.passed),
    gpu: renderer?.gpu,
  };
}

/**
 * The visibility gate of the capture's profiled root windows (ADR 0006, spec v2 section 14): each
 * root that Etch's profiles describe is evaluated at the view's selector values in this playset
 * and the capture's size, and every path the profile names must show as the game showed it. A
 * profile that does not load cleanly fails the capture too.
 */
async function profileGate(
  manifest: CorpusManifest,
  options: RunOptions,
  files: CorpusPlaysetFiles,
  key: CaptureKey,
  record: CaptureRecord,
  corpusWindow: CorpusWindow | undefined,
  save: Save | undefined,
): Promise<{ results: VisibilityResult[]; problems: string[]; texts: SaveTextReport[] }> {
  const found = findView(manifest, key.view);
  const playset = manifest.playsets.find((p) => p.id === key.playset);
  const view =
    found === undefined || playset === undefined ? undefined : viewInPlayset(found.view, playset);
  const selectors = view?.selectors ?? {};
  const data = view?.data;
  const choice =
    save === undefined || data?.province === undefined
      ? undefined
      : new SaveChoice(save, data.country ?? save.meta.player, data.province);
  const texts: SaveTextReport[] = [];
  const profilesFolder = options.profilesFolder ?? join(options.corpusFolder, '..', 'profiles');
  const results: VisibilityResult[] = [];
  const problems: string[] = [];
  for (const root of record.widgets) {
    if (splitWidgetPath(root.path)?.length !== 1) continue;
    const loaded = await files.profile(profilesFolder, root.path, corpusWindow?.files);
    if (loaded === undefined) continue;
    problems.push(...loaded.problems.map((p) => `Profile of ${root.path}: ${p}`));
    const result = profileVisibility(
      loaded.profile,
      loaded.window,
      record.resolution,
      selectors,
      root,
    );
    results.push(result);
    if (choice !== undefined) {
      texts.push(
        profileSaveTexts(
          loaded.profile,
          loaded.window,
          record.resolution,
          selectors,
          choice,
          files.localise,
          root,
        ),
      );
    }
    problems.push(
      ...result.mismatches.map(
        (m) =>
          `Profile of ${root.path} predicts ${m.path} ${m.game ? 'hidden' : 'shown'}; the game ${m.game ? 'shows' : 'hides'} it.`,
      ),
    );
  }
  return { results, problems, texts };
}

/**
 * The save the capture's view loads in its playset (`viewSave`) from `savesFolder`, read once per
 * save; `undefined` without the folder, the file, or when the file is not the one the view pins.
 */
function saveOf(
  manifest: CorpusManifest,
  options: RunOptions,
  key: CaptureKey,
  saves: Map<string, Promise<Save | undefined>>,
  log: (line: string) => void,
): Promise<Save | undefined> {
  const playset = manifest.playsets.find((p) => p.id === key.playset);
  const found = findView(manifest, key.view);
  const pinned =
    playset === undefined || found === undefined
      ? undefined
      : (viewSave(viewInPlayset(found.view, playset), playset) ?? playset.save);
  if (options.savesFolder === undefined || pinned === undefined) return Promise.resolve(undefined);
  const savesFolder = options.savesFolder;
  let reading = saves.get(pinned.sha256);
  if (reading === undefined) {
    reading = (async () => {
      const file = join(savesFolder, pinned.file);
      try {
        if ((await hashFile(file)) !== pinned.sha256) {
          log(`${file}: not the save the manifest pins; its save texts are not reported`);
          return undefined;
        }
        return await readSave(await readFile(file));
      } catch (error) {
        log(`${file}: ${messageOf(error)}; its save texts are not reported`);
        return undefined;
      }
    })();
    saves.set(pinned.sha256, reading);
  }
  return reading;
}

/**
 * The record and screenshot of a capture, or why it cannot be compared: no record or screenshot,
 * a record that is invalid or out of date for the manifest, or a screenshot that is not the one
 * the record holds.
 */
async function readiness(
  manifest: CorpusManifest,
  key: CaptureKey,
  options: RunOptions,
): Promise<{ record: CaptureRecord; screenshot: string; unstable?: string } | string | string[]> {
  const recordFile = captureRecordFile(options.corpusFolder, key);
  let parsed;
  try {
    parsed = await readCaptureRecord(recordFile);
  } catch {
    return 'No capture record.';
  }
  const record = parsed.capture;
  if (record === undefined) {
    return parsed.problems.map(
      (p) => `The capture record is invalid at ${p.at || 'its root'}: ${p.message}`,
    );
  }
  const stale = captureProblems(manifest, record);
  if (stale.length > 0) {
    return stale.map((p) => `Recapture: ${p.message}`);
  }
  const screenshot = screenshotFile(options.localFolder, key);
  let sha256;
  try {
    sha256 = await hashFile(screenshot);
  } catch {
    return 'No screenshot in the local corpus folder.';
  }
  if (sha256 !== record.screenshot.sha256) {
    return 'The screenshot is not the one the capture record holds.';
  }
  if (record.screenshot.unstable === undefined) return { record, screenshot };
  // The pixels that changed between the shots (etch#42) are never compared.
  const unstable = unstableMaskFile(options.localFolder, key);
  let maskSha256;
  try {
    maskSha256 = await hashFile(unstable);
  } catch {
    return 'The capture has unstable pixels, but no unstable mask in the local corpus folder.';
  }
  if (maskSha256 !== record.screenshot.unstable.sha256) {
    return 'The unstable mask is not the one the capture record holds.';
  }
  return { record, screenshot, unstable };
}

function wanted(filter: readonly string[] | undefined, value: string): boolean {
  return filter === undefined || filter.length === 0 || filter.includes(value);
}

function topLevel(path: string): string {
  return splitWidgetPath(path)?.[0]?.name ?? path;
}

function manifestWindowOf(manifest: CorpusManifest, key: CaptureKey): string | undefined {
  return manifest.windows.find((w) => w.views.some((v) => v.id === key.view))?.id;
}

async function write(
  localFolder: string,
  folder: string,
  name: string,
  content: string | Uint8Array,
): Promise<void> {
  const file = join(localFolder, folder, ...name.split('/'));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
