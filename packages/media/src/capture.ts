// `pnpm media capture` (etch-website docs/spec.md section 8.1): builds the extension, shoots each
// chosen clip (its take, then its edit rendered and encoded), and writes everything into the
// git-ignored `packages/media/out/v<version>/`: masters, take logs, edits, WebM/MP4, PNG posters,
// the draft manifest and a capture log. It publishes nothing.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { CLIPS, HERO_OPEN, heroEdit } from './clips.ts';
import { LOOP_HEIGHT, LOOP_WIDTH, VSCODE_VERSION } from './config.ts';
import type { EditSpec } from './edit.ts';
import { duration, h264Args, posterArgs, run, vp9Args } from './ffmpeg.ts';
import { LIVE_CLIPS, takeLive } from './live.ts';
import {
  CLIP_IDS,
  draftManifest,
  LIVE_CLIP_IDS,
  type CapturedLoop,
  type ClipId,
} from './manifest.ts';
import { Renderer } from './render.ts';
import { cutClip, editClip, takeClip, type ShootOptions } from './shoot.ts';
import type { TakeLog } from './take.ts';

export interface CaptureOptions {
  readonly repository: string;
  readonly clips: readonly ClipId[];
  readonly ffmpeg: string;
  readonly ffprobe: string;
  /** A short folder for VS Code and its throwaway profiles (MAX_PATH). */
  readonly work: string;
  /** The game folder: `etch.gamePath`, and where the overridden base-game files come from. */
  readonly gamePath: string;
  /**
   * The save whose province (`SAMPLE_PROVINCE`) the preview's sample data shows in every take, and
   * the live take's game plays.
   */
  readonly save?: string;
  /** The script profile the `profile` clip shows: a CSV of Anvil's script profiler. */
  readonly profile?: string;
  /** Edit the clips again from their takes' logs and masters, without new takes. */
  readonly reedit?: boolean;
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
  if (options.reedit !== true && options.save === undefined) {
    throw new Error("the takes need a save for the preview's data and the live game: pass --save");
  }
  const out = path.join(options.repository, 'packages', 'media', 'out', `v${version}`);
  const masters = path.join(out, 'masters');
  await mkdir(masters, { recursive: true });

  console.log(`Building the extension (Etch ${version})…`);
  await run(process.execPath, ['build.mts'], extension);

  const logFile = path.join(out, 'capture.json');
  const previous = await readFile(logFile, 'utf8').then(
    (text) => JSON.parse(text) as { takes?: Record<string, string> },
    () => undefined,
  );
  const takes: Record<string, string> = { ...previous?.takes };
  const shoot: ShootOptions = {
    ...options,
    extension,
    out,
    masters,
    renderer: new Renderer(options.ffmpeg, path.join(masters, 'proxies')),
    encode: (id, cut) => encode(id, cut, options.ffmpeg, out, masters),
  };
  const readTake = async (id: string): Promise<TakeLog> =>
    JSON.parse(await readFile(path.join(masters, `${id}.take.json`), 'utf8')) as TakeLog;
  const edits = new Map<string, EditSpec>();

  for (const clip of CLIPS) {
    if (!options.clips.includes(clip.id as ClipId)) continue;
    console.log(`Clip ${clip.id}…`);
    const log = options.reedit === true ? await readTake(clip.id) : await takeClip(clip, shoot);
    takes[clip.id] = log.capturedAt;
    edits.set(clip.id, await editClip(clip, log, shoot));
  }

  if (LIVE_CLIP_IDS.some((id) => options.clips.includes(id))) {
    let log: TakeLog;
    if (options.reedit === true) log = await readTake('live');
    else {
      if (options.save === undefined) throw new Error('the live clips need a save: pass --save');
      console.log('Take live…');
      log = await takeLive({ ...shoot, save: options.save });
    }
    takes['live'] = log.capturedAt;
    for (const clip of LIVE_CLIPS) {
      if (!options.clips.includes(clip.id as ClipId)) continue;
      console.log(`Clip ${clip.id}…`);
      edits.set(clip.id, await editClip(clip, log, shoot));
    }
  }

  if (options.clips.includes('hero')) {
    // The first chapter has a take of its own, which no loop of the site shows.
    console.log(`Clip hero: ${HERO_OPEN.id}…`);
    const log =
      options.reedit === true ? await readTake(HERO_OPEN.id) : await takeClip(HERO_OPEN, shoot);
    takes[HERO_OPEN.id] = log.capturedAt;
    edits.set(HERO_OPEN.id, (await cutClip(HERO_OPEN, log, shoot)).spec);
    console.log('Clip hero…');
    const parts = await heroParts(edits, masters);
    const spec = heroEdit(
      Object.fromEntries(
        await Promise.all(
          parts.map(
            async ({ spec: part }) =>
              [
                part.id,
                await shoot.renderer.proxy(
                  path.join(masters, `${part.id}.cut.mov`),
                  `hero.${part.id}`,
                  { width: LOOP_WIDTH, height: LOOP_HEIGHT },
                ),
              ] as const,
          ),
        ),
      ),
      parts,
    );
    await writeFile(path.join(masters, 'hero.edit.json'), `${JSON.stringify(spec, null, 2)}\n`);
    const cut = path.join(masters, 'hero.cut.mov');
    await shoot.renderer.render(spec, cut);
    await run(options.ffmpeg, posterArgs(cut, path.join(out, 'hero.png')));
    await encode('hero', cut, options.ffmpeg, out, masters);
  }

  const loops: Partial<Record<ClipId, CapturedLoop>> = {};
  for (const id of CLIP_IDS) {
    const webm = path.join(out, `${id}.webm`);
    const mp4 = path.join(out, `${id}.mp4`);
    const sizes = await Promise.all([stat(webm), stat(mp4)]).catch(() => undefined);
    if (sizes === undefined) continue;
    // The hero's chapters are in its edit, of the same capture as its files.
    const chapters =
      id === 'hero'
        ? await readFile(path.join(masters, 'hero.edit.json'), 'utf8').then(
            (text) => (JSON.parse(text) as EditSpec).chapters,
            () => undefined,
          )
        : undefined;
    loops[id] = {
      width: LOOP_WIDTH,
      height: LOOP_HEIGHT,
      duration: await duration(options.ffprobe, webm),
      webmBytes: sizes[0].size,
      mp4Bytes: sizes[1].size,
      ...(chapters === undefined ? {} : { chapters }),
    };
  }
  const manifest = draftManifest(version, loops);
  await writeFile(path.join(out, 'media.draft.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    logFile,
    `${JSON.stringify(
      {
        etch: version,
        commit: gitCommit(options.repository),
        vscode: VSCODE_VERSION,
        ffmpeg: (await run(options.ffmpeg, ['-hide_banner', '-version'])).split('\n')[0]?.trim(),
        takes,
      },
      null,
      2,
    )}\n`,
  );
  return out;
}

/**
 * The hero's chapters (etch-website docs/spec.md section 4.2) and the cuts they take their parts
 * from: the `open` take's, then four of the site's loops.
 */
export const HERO_CHAPTERS = [
  { chapter: 'open', clip: 'open' },
  { chapter: 'type', clip: 'preview' },
  { chapter: 'mesh', clip: 'mesh' },
  { chapter: 'reload', clip: 'reload' },
  { chapter: 'pick', clip: 'pick' },
] as const;

/** The hero's chapters, in order, with the edits of their cuts. */
async function heroParts(
  edits: ReadonlyMap<string, EditSpec>,
  masters: string,
): Promise<{ chapter: string; spec: EditSpec }[]> {
  const parts: { chapter: string; spec: EditSpec }[] = [];
  for (const { chapter, clip: id } of HERO_CHAPTERS) {
    const spec =
      edits.get(id) ??
      (JSON.parse(
        await readFile(path.join(masters, `${id}.edit.json`), 'utf8').catch(() => {
          throw new Error(`the hero needs the ${id} clip: capture it first`);
        }),
      ) as EditSpec);
    parts.push({ chapter, spec });
  }
  return parts;
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

/** Encodes a loop's cut into the published VP9 WebM and H.264 MP4. */
export async function encode(
  id: string,
  cut: string,
  ffmpeg: string,
  out: string,
  masters: string,
): Promise<void> {
  const [pass1, pass2] = vp9Args(
    cut,
    path.join(masters, `${id}.vp9`),
    path.join(out, `${id}.webm`),
  );
  await run(ffmpeg, pass1, masters);
  await run(ffmpeg, pass2, masters);
  await run(ffmpeg, h264Args(cut, path.join(out, `${id}.mp4`)));
}
