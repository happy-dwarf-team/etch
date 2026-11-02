// Renders clips' edits (edit.ts) with the Remotion composition in `motion/` (docs/media.md,
// "Editing"): the masters are first turned into proxies the composition can seek (H.264, a key
// frame every half second), then each edit is rendered to a ProRes 4444 cut, which `encode`
// turns into the published WebM and MP4 as before.
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { EditSpec, Source } from './edit.ts';
import { run } from './ffmpeg.ts';

const ENTRY = fileURLToPath(new URL('../motion/index.ts', import.meta.url));

/** A proxy's size: 4:2:0 needs even sides, so an odd side gains one row or column. */
export function proxySize(size: { width: number; height: number }): {
  width: number;
  height: number;
} {
  return { width: size.width + (size.width % 2), height: size.height + (size.height % 2) };
}

/**
 * Arguments of the proxy of a master: what the composition decodes, a key frame every 15 frames.
 * `gfxcapture` gets one row less than a window (2560 × 1439), which is repeated to an even size,
 * and stops emitting frames on a still window, so the end is padded with its last frame.
 */
export function proxyArgs(
  master: string,
  proxy: string,
  size: { width: number; height: number },
): string[] {
  const even = proxySize(size);
  const pad =
    even.width === size.width && even.height === size.height
      ? ''
      : `pad=${String(even.width)}:${String(even.height)}:0:0,` +
        `fillborders=right=${String(even.width - size.width)}:bottom=${String(even.height - size.height)}:mode=smear,`;
  return [
    ...['-hide_banner', '-loglevel', 'error', '-y', '-i', master, '-an'],
    ...['-vf', `${pad}tpad=stop_mode=clone:stop_duration=5,format=yuv420p`],
    ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '12'],
    ...['-g', '15', '-movflags', '+faststart', proxy],
  ];
}

export class Renderer {
  private readonly proxies: string;
  private readonly ffmpeg: string;
  private serveUrl: string | undefined;

  /** `proxies` is the composition's public folder: only the proxies go into its bundle. */
  constructor(ffmpeg: string, proxies: string) {
    this.ffmpeg = ffmpeg;
    this.proxies = proxies;
  }

  /** The proxies made in this run, by name: a take's masters serve several clips. */
  private readonly made = new Map<string, Source>();

  /** Makes the proxy of a master; the source an edit names it by. */
  async proxy(
    master: string,
    name: string,
    size: { width: number; height: number },
  ): Promise<Source> {
    const made = this.made.get(name);
    if (made !== undefined) return made;
    await mkdir(this.proxies, { recursive: true });
    const file = `${name}.mp4`;
    const source = { file, ...proxySize(size) };
    this.made.set(name, source);
    await run(this.ffmpeg, proxyArgs(master, path.join(this.proxies, file), size));
    // The bundle holds a copy of the public folder: the next render bundles it again.
    this.serveUrl = undefined;
    return source;
  }

  /** Renders an edit into a lossless-enough cut (ProRes 4444) for the encoders. */
  async render(spec: EditSpec, out: string): Promise<void> {
    this.serveUrl ??= await bundle({ entryPoint: ENTRY, publicDir: this.proxies });
    const inputProps = { spec };
    const composition = await selectComposition({
      serveUrl: this.serveUrl,
      id: 'clip',
      inputProps,
    });
    await renderMedia({
      composition,
      serveUrl: this.serveUrl,
      codec: 'prores',
      proResProfile: '4444',
      outputLocation: out,
      inputProps,
      muted: true,
      logLevel: 'warn',
    });
  }
}
