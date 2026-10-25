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
  encodePng,
  gates,
  hashFile,
  planCapture,
  readCaptureRecord,
  readCorpusManifest,
  requiredCaptures,
  resolutionKey,
  screenshotFile,
  unstableMaskFile,
  splitWidgetPath,
  windowReport,
  type CaptureKey,
  type CaptureOutcome,
  type CaptureRecord,
  type CorpusManifest,
  type PlanWindow,
} from '@etch/core/corpus';
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
  /** Render on the GPU instead of SwiftShader. */
  readonly gpu?: boolean;
  /**
   * Compare the game host's images (etch#53) instead of headless renders: the local corpus
   * folder's `game-host/images/captures/...png`, which the extension's corpus check writes. The
   * results then go to `game-host/diffs/` and `game-host/reports/`.
   */
  readonly gameHost?: boolean;
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

/** The game host's images and results in the local corpus folder (etch#53). */
export const GAME_HOST_FOLDER = 'game-host';

/** The folder of the local corpus folder a run writes `folder` (diffs, reports) to. */
export function resultFolder(options: Pick<RunOptions, 'gameHost'>, folder: string): string {
  return options.gameHost === true ? join(GAME_HOST_FOLDER, folder) : folder;
}

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
        const windows: PlanWindow[] = [];
        for (const top of new Set(record.widgets.map((w) => topLevel(w.path)))) {
          const window = await files.window(top, record.resolution, corpusWindow?.files);
          if (window !== undefined) windows.push(window);
        }
        const plan = planCapture({ manifest, record, windows });
        let painted;
        if (options.gameHost === true) {
          const image = join(options.localFolder, GAME_HOST_FOLDER, 'images', `${name}.png`);
          const bytes = await readFile(image).catch(() => {
            throw new Error('No game host image.');
          });
          painted = { image: decodePng(bytes), problems: [] };
        } else {
          renderer ??= await HeadlessRenderer.launch({ gpu: options.gpu ?? false });
          painted = await renderer.paint(plan.drawList, files.fileOf);
        }
        const game = decodePng(await readFile(screenshot));
        const mask = unstable === undefined ? undefined : decodePng(await readFile(unstable));
        const { comparison, map } = compareCapture(manifest, plan, painted.image, game, mask);
        const result =
          painted.problems.length === 0
            ? comparison
            : {
                ...comparison,
                passed: false,
                problems: [
                  ...comparison.problems,
                  ...painted.problems.map((p) => `A texture could not be drawn: ${p}`),
                ],
              };
        if (options.gameHost !== true) {
          await write(
            options.localFolder,
            RESULT_FOLDERS.renders,
            `${name}.png`,
            encodePng(painted.image),
          );
        }
        await write(
          options.localFolder,
          resultFolder(options, RESULT_FOLDERS.diffs),
          `${name}.png`,
          encodePng(differenceImage(map, game)),
        );
        await write(
          options.localFolder,
          resultFolder(options, RESULT_FOLDERS.reports),
          `${name}.json`,
          `${JSON.stringify({ ...result, renderer: options.gameHost === true ? 'game host' : renderer?.gpu }, null, 1)}\n`,
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
      resultFolder(options, RESULT_FOLDERS.reports),
      `${window.id}.md`,
      windowReport(manifest, window.id, ordered),
    );
  }
  const summary = corpusSummary(manifest, ordered);
  await write(
    options.localFolder,
    resultFolder(options, RESULT_FOLDERS.reports),
    'README.md',
    summary.markdown,
  );
  const gating = ordered.filter((o) => gates(manifest, o.key));
  return {
    manifest,
    outcomes: ordered,
    passed: gating.every((o) => o.kind === 'compared' && o.comparison.passed),
    gpu: renderer?.gpu,
  };
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
