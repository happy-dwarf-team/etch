// FFmpeg for the loops (spec sections 8.3 and 8.6): the lossless `gfxcapture` masters of a take's
// windows, a rendered cut's poster, and the published VP9 WebM and H.264 MP4. The argument lists
// are plain functions so the encoder settings are tested without FFmpeg.
import { spawn, type ChildProcess } from 'node:child_process';
import { H264_CRF, H264_PROFILE, LOOP_FPS, LOOP_HEIGHT, LOOP_WIDTH, VP9_CRF } from './config.ts';

export interface GfxCaptureOptions {
  /** Draw the pointer when it is over the window (the live scene's game). */
  readonly cursor?: boolean;
  /**
   * A shared clock for several masters, in Unix microseconds: the master's time 0 is this moment,
   * so masters recorded side by side line up frame by frame (the live scene).
   */
  readonly epochUs?: number;
}

/** Records a window by its handle, without the pointer, into a lossless RGB master. */
export function gfxcaptureArgs(
  hwnd: string,
  master: string,
  options: GfxCaptureOptions = {},
): string[] {
  // gfxcapture counts time from its first frame. Against a shared clock, that frame is placed at
  // the wall clock it arrived at (RTCTIME, in µs), and every later frame keeps its distance from it.
  const clock =
    options.epochUs === undefined
      ? ''
      : `setpts='st(0,if(eq(N,0),(RTCTIME-${String(options.epochUs)})/1000000/TB-PTS,ld(0)));PTS+ld(0)',`;
  return [
    ...['-hide_banner', '-loglevel', 'error', '-stats', '-y'],
    '-filter_complex',
    // gfxcapture emits a frame only when the window changes; fps fills the gaps (from the shared
    // clock's 0, with the first frame, when there is one).
    `gfxcapture=hwnd=${hwnd}:capture_cursor=${options.cursor === true ? '1' : '0'}:max_framerate=60,` +
      `${clock}hwdownload,format=bgra,` +
      `fps=${String(LOOP_FPS)}${options.epochUs === undefined ? '' : ':start_time=0'},format=bgr0`,
    ...['-c:v', 'libx264rgb', '-preset', 'ultrafast', '-crf', '0'],
    master,
  ];
}

/** The first frame of a cut as a PNG: a loop's poster. */
export function posterArgs(cut: string, png: string): string[] {
  return [
    ...['-hide_banner', '-loglevel', 'error', '-y', '-i', cut],
    ...['-frames:v', '1', '-update', '1', png],
  ];
}

const SCALE = `scale=${String(LOOP_WIDTH)}:${String(LOOP_HEIGHT)}:flags=lanczos,format=yuv420p`;

/** The two passes of the VP9 WebM: CRF, screen content, no audio. */
export function vp9Args(input: string, passlog: string, out: string): [string[], string[]] {
  const common = [
    ...['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-an', '-vf', SCALE],
    ...['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(VP9_CRF), '-tune-content', 'screen'],
    ...['-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-g', '240'],
    ...['-passlogfile', passlog],
  ];
  return [
    [...common, '-pass', '1', '-f', 'null', '-'],
    [...common, '-pass', '2', out],
  ];
}

/** The H.264 MP4: CRF, `veryslow`, High profile at level 4.0, `faststart`, no audio. */
export function h264Args(input: string, out: string): string[] {
  return [
    ...['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-an', '-vf', SCALE],
    ...['-c:v', 'libx264', '-preset', 'veryslow', '-crf', String(H264_CRF)],
    ...['-profile:v', H264_PROFILE.profile, '-level:v', H264_PROFILE.level, '-g', '240'],
    ...['-movflags', '+faststart', out],
  ];
}

/** Runs a tool to the end; its output, standard error last (where FFmpeg logs). */
export function run(tool: string, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(`${out}${err}`);
      else reject(new Error(`${tool} exited with ${String(code)}: ${err.slice(-2000)}`));
    });
  });
}

/** A media file's duration in seconds, from `ffprobe`. */
export async function duration(ffprobe: string, file: string): Promise<number> {
  const out = await run(ffprobe, [
    ...['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
  ]);
  const seconds = Number(out.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe gives no duration for ${file}`);
  return seconds;
}

/** A video's width and height in pixels. */
export async function videoSize(
  ffprobe: string,
  file: string,
): Promise<{ width: number; height: number }> {
  const out = await run(ffprobe, [
    ...['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height'],
    ...['-of', 'csv=p=0', file],
  ]);
  const [width, height] = out.trim().split(',').map(Number);
  if (width === undefined || height === undefined || !(width > 0 && height > 0)) {
    throw new Error(`ffprobe gives no size for ${file}`);
  }
  return { width, height };
}

/** A running `gfxcapture` recording. */
export class GfxCapture {
  private readonly child: ChildProcess;
  private readonly exited: Promise<number | null>;

  private constructor(child: ChildProcess, exited: Promise<number | null>) {
    this.child = child;
    this.exited = exited;
  }

  /** Starts recording and resolves once FFmpeg has written its first frame. */
  static async start(
    ffmpeg: string,
    hwnd: string,
    master: string,
    options: GfxCaptureOptions = {},
  ): Promise<GfxCapture> {
    const child = spawn(ffmpeg, gfxcaptureArgs(hwnd, master, options), {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
    let log = '';
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`gfxcapture wrote no frame in 15 s: ${log.slice(-1000)}`));
      }, 15_000);
      child.stderr.on('data', (chunk: Buffer) => {
        log += chunk.toString();
        if (/frame=\s*[1-9]/.test(log)) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on('error', reject);
      void exited.then((code) => {
        clearTimeout(timer);
        reject(new Error(`gfxcapture exited with ${String(code)}: ${log.slice(-1000)}`));
      });
    });
    return new GfxCapture(child, exited);
  }

  /**
   * Asks FFmpeg to finish the file, as `q` on its console does. FFmpeg reads it between frames,
   * and `gfxcapture` gives none while the window stands still, so `nudge` makes the window draw
   * until FFmpeg is done; after 15 s it is killed.
   */
  async stop(nudge?: () => Promise<void>): Promise<void> {
    this.child.stdin?.end('q');
    // Set by the exit, which the loop below cannot see coming: a holder, not a local.
    const exit: { code?: number | null } = {};
    const done = this.exited.then((code) => {
      exit.code = code;
    });
    const deadline = Date.now() + 15_000;
    while (!('code' in exit) && Date.now() < deadline) {
      await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 250))]);
      if (!('code' in exit)) await nudge?.().catch(() => undefined);
    }
    if (!('code' in exit)) {
      this.child.kill();
      throw new Error('gfxcapture did not finish its file in 15 s and was stopped');
    }
    const code = exit.code;
    if (code !== 0) throw new Error(`gfxcapture exited with ${String(code)}`);
  }
}
