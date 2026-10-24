// `pnpm media capture` (etch-website docs/spec.md section 8.1): builds the extension, runs each
// chosen scene in a fresh VS Code, encodes the loops and writes everything into the git-ignored
// `packages/media/out/v<version>/`: masters, WebM/MP4, PNG stills and posters, the draft manifest
// and a capture log. It publishes nothing.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { LOOP_HEIGHT, LOOP_WIDTH, MASTER, VSCODE_VERSION } from './config.ts';
import {
  cutArgs,
  duration,
  firstChangeArgs,
  GfxCapture,
  h264Args,
  parseFirstChange,
  run,
  vp9Args,
} from './ffmpeg.ts';
import {
  draftManifest,
  LOOP_IDS,
  STILL_IDS,
  type CapturedLoop,
  type LoopId,
  type SceneId,
  type StillId,
} from './manifest.ts';
import {
  DIALOG,
  LOOP_LEAD_MS,
  START_FILE,
  scenesFor,
  type LoopMoment,
  type Scene,
} from './scenes.ts';
import { Workbench } from './workbench.ts';

/** How a loop is recorded: FFmpeg `gfxcapture` (lossless) or Playwright's `recordVideo`. */
export type Recorder = 'gfxcapture' | 'playwright';

export interface CaptureOptions {
  readonly repository: string;
  readonly scenes: readonly SceneId[];
  readonly recorder: Recorder;
  readonly ffmpeg: string;
  readonly ffprobe: string;
  /** A short folder for VS Code and its throwaway profiles (MAX_PATH). */
  readonly work: string;
  readonly gamePath: string | undefined;
}

/** What one scene's run left, for the capture log. */
interface SceneLog {
  readonly capturedAt: string;
  readonly recorder?: Recorder;
  readonly firstPaint: number;
  readonly master?: string;
  readonly cut?: { readonly start: number; readonly duration: number };
}

/** The width and height in a PNG's header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(12) !== 0x49484452) {
    throw new Error('not a PNG');
  }
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export async function capture(options: CaptureOptions): Promise<string> {
  const extension = path.join(options.repository, 'packages', 'extension');
  const version = (
    JSON.parse(await readFile(path.join(extension, 'package.json'), 'utf8')) as { version: string }
  ).version;
  const out = path.join(options.repository, 'packages', 'media', 'out', `v${version}`);
  const masters = path.join(out, 'masters');
  await mkdir(masters, { recursive: true });

  console.log(`Building the extension (Etch ${version})…`);
  await run(process.execPath, ['build.mts'], extension);

  const logFile = path.join(out, 'capture.json');
  const previous = await readFile(logFile, 'utf8').then(
    (text) => JSON.parse(text) as { scenes?: Record<string, SceneLog> },
    () => undefined,
  );
  const scenes: Record<string, SceneLog> = { ...previous?.scenes };
  for (const scene of scenesFor(options.scenes)) {
    console.log(`Scene ${scene.id}…`);
    scenes[scene.id] = await runScene(scene, options, extension, out, masters);
  }

  const loops: Partial<Record<LoopId, CapturedLoop>> = {};
  for (const id of LOOP_IDS) {
    const webm = path.join(out, `${id}.webm`);
    const mp4 = path.join(out, `${id}.mp4`);
    const sizes = await Promise.all([stat(webm), stat(mp4)]).catch(() => undefined);
    if (sizes === undefined) continue;
    loops[id] = {
      width: LOOP_WIDTH,
      height: LOOP_HEIGHT,
      duration: await duration(options.ffprobe, webm),
      webmBytes: sizes[0].size,
      mp4Bytes: sizes[1].size,
    };
  }
  const stills: StillId[] = [];
  for (const id of STILL_IDS) {
    if (await stat(path.join(out, `${id}.png`)).catch(() => undefined)) stills.push(id);
  }
  const manifest = draftManifest(version, loops, stills);
  await writeFile(path.join(out, 'media.draft.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    logFile,
    `${JSON.stringify(
      {
        etch: version,
        commit: gitCommit(options.repository),
        vscode: VSCODE_VERSION,
        ffmpeg: (await run(options.ffmpeg, ['-hide_banner', '-version'])).split('\n')[0]?.trim(),
        scenes,
      },
      null,
      2,
    )}\n`,
  );
  return out;
}

function gitCommit(repository: string): string {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository })
      .toString()
      .trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: repository }).length > 0;
    return dirty ? `${commit}+changes` : commit;
  } catch {
    return 'unknown';
  }
}

async function runScene(
  scene: Scene,
  options: CaptureOptions,
  extension: string,
  out: string,
  masters: string,
): Promise<SceneLog> {
  const recorder = scene.loop ? options.recorder : undefined;
  const videoDir =
    recorder === 'playwright' ? path.join(masters, `${scene.id}-playwright`) : undefined;
  if (videoDir !== undefined) await rm(videoDir, { recursive: true, force: true });
  const gfxMaster = path.join(masters, `${scene.id}.gfxcapture.mkv`);
  const marks: Partial<Record<LoopMoment, number>> = {};
  let recording: GfxCapture | undefined;

  const wb = await Workbench.launch({
    work: options.work,
    extensionPath: extension,
    demoMod: path.join(options.repository, 'packages', 'media', 'demo-mod'),
    open: START_FILE,
    gamePath: options.gamePath,
    videoDir,
  });
  let firstPaint: number;
  let video: string | undefined;
  try {
    // VS Code opens a folder with the Explorer shown; scenes that need it open it again.
    await wb.command('View: Close Primary Side Bar');
    await wb.find(`"${DIALOG}"`);
    firstPaint = (await wb.openPreview()).id;
    await wb.expectPreviewed(DIALOG);
    await wb.fitPreview();
    await wb.checkFrame();
    await scene.run({
      wb,
      async still(id, rules) {
        await wb.checkFrame(rules);
        const file = path.join(out, `${id}.png`);
        await wb.screenshot(file);
        const size = pngSize(await readFile(file));
        if (size.width !== MASTER.width || size.height !== MASTER.height) {
          throw new Error(`${id}.png is ${String(size.width)} × ${String(size.height)}`);
        }
      },
      async record() {
        if (recorder === 'gfxcapture') {
          recording = await GfxCapture.start(options.ffmpeg, wb.hwnd, gfxMaster);
        }
      },
      mark(moment) {
        const at = performance.now();
        marks[moment] = at;
        return at;
      },
    });
  } catch (error) {
    // What the window showed when the scene failed, beside the masters, for the maintainer only.
    await wb.screenshot(path.join(masters, `${scene.id}.failed.png`)).catch(() => undefined);
    throw error;
  } finally {
    const stopped = recording?.stop();
    video = await wb.close();
    await stopped;
  }
  const capturedAt = new Date().toISOString();
  if (recorder === undefined) return { capturedAt, firstPaint };

  const master = recorder === 'gfxcapture' ? gfxMaster : video;
  if (master === undefined) throw new Error(`${scene.id}: Playwright recorded no video`);
  const cut = await encodeLoop(scene.id as LoopId, master, marks, options, out, masters);
  return { capturedAt, recorder, firstPaint, master: path.basename(master), cut };
}

/** Cuts the loop out of its master by its marks and encodes the WebM and MP4. */
async function encodeLoop(
  id: LoopId,
  master: string,
  marks: Partial<Record<LoopMoment, number>>,
  options: CaptureOptions,
  out: string,
  masters: string,
): Promise<{ start: number; duration: number }> {
  const first = marks['first-key'];
  const last = marks['last-key'];
  if (first === undefined || last === undefined) throw new Error(`${id}: the loop has no marks`);
  // The first keystroke is the master's first change: the cut starts LOOP_LEAD_MS before it and
  // ends at the last keystroke, whose result (the start state again) is the loop's first frame.
  const change = parseFirstChange(await run(options.ffmpeg, firstChangeArgs(master)));
  if (change === undefined) throw new Error(`${id}: the master never changes`);
  const start = change - LOOP_LEAD_MS / 1000;
  if (start < 0) throw new Error(`${id}: the master starts ${String(-start)} s too late`);
  const length = (last - first + LOOP_LEAD_MS) / 1000;
  console.log(`Encoding ${id}: ${length.toFixed(2)} s from ${start.toFixed(2)} s of the master…`);

  const cut = path.join(masters, `${id}.cut.mkv`);
  await run(options.ffmpeg, cutArgs(master, start, length, cut));
  const [pass1, pass2] = vp9Args(
    cut,
    path.join(masters, `${id}.vp9`),
    path.join(out, `${id}.webm`),
  );
  await run(options.ffmpeg, pass1, masters);
  await run(options.ffmpeg, pass2, masters);
  await run(options.ffmpeg, h264Args(cut, path.join(out, `${id}.mp4`)));
  return { start, duration: length };
}
