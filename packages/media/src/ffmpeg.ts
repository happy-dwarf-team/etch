// FFmpeg for the loops (spec sections 8.3 and 8.6): a lossless `gfxcapture` master of VS Code's
// window, the cut of one loop out of a master, and the published VP9 WebM and H.264 MP4. The
// argument lists are plain functions so the encoder settings are tested without FFmpeg.
import { spawn, type ChildProcess } from 'node:child_process';
import {
  H264_CRF,
  H264_PROFILE,
  LOOP_FPS,
  LOOP_HEIGHT,
  LOOP_WIDTH,
  MASTER,
  VP9_CRF,
} from './config.ts';

/** Records a window by its handle, without the pointer, into a lossless RGB master. */
export function gfxcaptureArgs(hwnd: string, master: string): string[] {
  return [
    ...['-hide_banner', '-loglevel', 'error', '-stats', '-y'],
    '-filter_complex',
    // gfxcapture emits a frame only when the window changes; fps fills the gaps.
    `gfxcapture=hwnd=${hwnd}:capture_cursor=0:max_framerate=60,hwdownload,format=bgra,` +
      `fps=${String(LOOP_FPS)},format=bgr0`,
    ...['-c:v', 'libx264rgb', '-preset', 'ultrafast', '-crf', '0'],
    master,
  ];
}

/** Finds when the picture first changes: the end of the first still stretch of a master. */
export function firstChangeArgs(master: string): string[] {
  return [
    ...['-hide_banner', '-nostats', '-i', master],
    ...['-vf', 'freezedetect=n=-60dB:d=1', '-map', '0:v:0', '-f', 'null', '-'],
  ];
}

/** The first `freeze_end` FFmpeg's `freezedetect` reports, in seconds. */
export function parseFirstChange(log: string): number | undefined {
  const match = /freeze_end: (\d+(?:\.\d+)?)/.exec(log);
  return match === null ? undefined : Number(match[1]);
}

/**
 * Cuts one loop out of a master into a lossless 2560 × 1440 intermediate at the loop frame rate.
 * `gfxcapture` gets one row less than the window (2560 × 1439, from the top), so the last row,
 * the status bar's bottom edge, is repeated; a `recordVideo` master loses its own last row the
 * same way. The end is padded with its last frame, since `gfxcapture` stops emitting frames on a
 * still window.
 */
export function cutArgs(master: string, start: number, duration: number, out: string): string[] {
  const width = String(MASTER.width);
  const rows = MASTER.height - 1;
  return [
    ...['-hide_banner', '-loglevel', 'error', '-y'],
    ...['-ss', start.toFixed(3), '-i', master, '-t', duration.toFixed(3)],
    '-filter_complex',
    // In RGB: a recordVideo master is 4:2:0, where a row of one pixel cannot be cut.
    `[0:v]format=gbrp,crop=${width}:${String(rows)}:0:0,split[top][edge];` +
      `[edge]crop=${width}:1:0:${String(rows - 1)}[row];[top][row]vstack,` +
      `fps=${String(LOOP_FPS)},tpad=stop_mode=clone:stop_duration=5[v]`,
    ...['-map', '[v]', '-an', '-c:v', 'ffv1', out],
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

/** A running `gfxcapture` recording. */
export class GfxCapture {
  private readonly child: ChildProcess;
  private readonly exited: Promise<number | null>;

  private constructor(child: ChildProcess, exited: Promise<number | null>) {
    this.child = child;
    this.exited = exited;
  }

  /** Starts recording and resolves once FFmpeg has written its first frame. */
  static async start(ffmpeg: string, hwnd: string, master: string): Promise<GfxCapture> {
    const child = spawn(ffmpeg, gfxcaptureArgs(hwnd, master), {
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

  /** Asks FFmpeg to finish the file, as `q` on its console does. */
  async stop(): Promise<void> {
    this.child.stdin?.end('q');
    const code = await this.exited;
    if (code !== 0) throw new Error(`gfxcapture exited with ${String(code)}`);
  }
}
