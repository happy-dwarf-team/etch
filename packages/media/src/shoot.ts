// Shoots one offline clip (clips.ts): its take in a fresh VS Code, the log and the masters' proxies,
// the edit, its render and the published encodes, all into the capture folder.
import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { OVERRIDES, START_FILE, WINDOW_NAME, type Clip } from './clips.ts';
import type { EditSpec, Source } from './edit.ts';
import { posterArgs, run, videoSize } from './ffmpeg.ts';
import type { Renderer } from './render.ts';
import { Take, type TakeLog } from './take.ts';
import { Workbench } from './workbench.ts';

/** The longest an offline take may run, its VS Code's start included. */
const TAKE_TIMEOUT_MS = 180_000;

export interface ShootOptions {
  readonly repository: string;
  readonly extension: string;
  readonly ffmpeg: string;
  readonly ffprobe: string;
  readonly work: string;
  readonly gamePath: string;
  readonly out: string;
  readonly masters: string;
  readonly renderer: Renderer;
  /** Encodes a rendered cut into `<id>.webm` and `<id>.mp4`. */
  readonly encode: (id: string, cut: string) => Promise<void>;
}

/** Records a clip's take; returns its log, written beside the masters. */
export async function takeClip(clip: Clip, options: ShootOptions): Promise<TakeLog> {
  const take = new Take(clip.id, options.ffmpeg);
  const wb = await Workbench.launch({
    work: options.work,
    extensionPath: options.extension,
    demoMod: path.join(options.repository, 'packages', 'media', 'demo-mod'),
    overrides: OVERRIDES,
    open: START_FILE,
    gamePath: options.gamePath,
    videoDir: undefined,
  });
  try {
    await wb.command('View: Close Primary Side Bar');
    await wb.find(`"${WINDOW_NAME}"`);
    await wb.openPreview();
    await wb.expectPreviewed(WINDOW_NAME);
    await wb.fitPreview();
    await wb.checkFrame();
    // A step that waits on nothing would hang the run without a trace: the take has a limit.
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      clip.run({
        wb,
        take,
        record: () =>
          take.record('vscode', wb.hwnd, path.join(options.masters, `${clip.id}.vscode.mkv`), {
            nudge: () => wb.nudge(),
          }),
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `the ${clip.id} take did not finish in ${String(TAKE_TIMEOUT_MS / 1000)} s; its last event: ${take.lastEvent()}`,
            ),
          );
        }, TAKE_TIMEOUT_MS);
      }),
    ]).finally(() => {
      clearTimeout(timer);
    });
  } catch (error) {
    await wb.screenshot(path.join(options.masters, `${clip.id}.failed.png`)).catch(() => undefined);
    throw error;
  } finally {
    await take.stop();
    await wb.close();
  }
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const { name, file } of take.masters()) sizes[name] = await videoSize(options.ffprobe, file);
  const log = take.log(sizes);
  await writeFile(
    path.join(options.masters, `${clip.id}.take.json`),
    `${JSON.stringify(log, null, 2)}\n`,
  );
  return log;
}

/**
 * Edits, renders and encodes a clip from its take's log; writes `<id>.png`, its first frame, and
 * returns the edit.
 */
export async function editClip(
  clip: Pick<Clip, 'id' | 'edit'>,
  log: TakeLog,
  options: ShootOptions,
): Promise<EditSpec> {
  const sources: Record<string, Source> = {};
  for (const [name, source] of Object.entries(log.sources)) {
    sources[name] = await options.renderer.proxy(
      path.join(options.masters, source.master),
      `${log.id}.${name}`,
      source,
    );
  }
  const spec = clip.edit(log, sources);
  await writeFile(
    path.join(options.masters, `${clip.id}.edit.json`),
    `${JSON.stringify(spec, null, 2)}\n`,
  );
  const cut = path.join(options.masters, `${clip.id}.cut.mov`);
  console.log(`Rendering ${clip.id}…`);
  await options.renderer.render(spec, cut);
  await run(options.ffmpeg, posterArgs(cut, path.join(options.out, `${clip.id}.png`)));
  await options.encode(clip.id, cut);
  return spec;
}
