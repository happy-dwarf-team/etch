// The live game's `error.log` (spec section 6, etch#52): the game writes it into the private
// profile's `logs` folder, a line at a time, and the extension reads what each reload added.
// Node only, no vscode.
import { open } from 'node:fs/promises';
import { decodeGameText } from '@etch/core';

/** The most bytes one read takes; a longer addition keeps its last lines. */
const MAX_READ = 1 << 20;

/**
 * Reads the lines added to a log since the last read. Only whole lines count: a line the game is
 * still writing is read when its end comes. A log that got shorter (the game started again and
 * wrote a new one) is read from its start.
 */
export class ErrorLogTail {
  readonly path: string;
  private offset = 0;
  private reading: Promise<unknown> = Promise.resolve();

  constructor(path: string) {
    this.path = path;
  }

  /** Skips what the log holds now; returns how many lines that was. */
  async skip(): Promise<number> {
    return (await this.read()).length;
  }

  /** The whole lines added since the last read, without their line ends. */
  read(): Promise<string[]> {
    const next = this.reading.then(() => this.readNow());
    this.reading = next.catch(() => undefined);
    return next;
  }

  private async readNow(): Promise<string[]> {
    let handle;
    try {
      handle = await open(this.path, 'r');
    } catch {
      return [];
    }
    try {
      const { size } = await handle.stat();
      if (size < this.offset) this.offset = 0;
      if (size === this.offset) return [];
      const from = Math.max(this.offset, size - MAX_READ);
      const bytes = new Uint8Array(size - from);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, from);
      const end = bytes.subarray(0, bytesRead).lastIndexOf(0x0a);
      if (end < 0) return [];
      // A read that starts inside the new part skips the line it starts in.
      const begin = from > this.offset ? bytes.indexOf(0x0a) + 1 : 0;
      this.offset = from + end + 1;
      return decodeGameText(bytes.subarray(begin, end), 'interface')
        .text.split('\n')
        .map((line) => line.replace(/\r$/, ''))
        .filter((line) => line.trim() !== '');
    } finally {
      await handle.close();
    }
  }
}

/**
 * Lines the game writes on every reload of the vanilla province view, also of the unchanged file:
 * its rebuild binds widgets the file does not have (H1). They are not the user's.
 */
const GAME_BINDING_LINES = [
  /Missing Button 'close_button' in window 'provinceview'/i,
  /Missing Icon 'remove_parliament'/i,
];

/** A line of `error.log` and how often it came, in the order of its first coming. */
export interface CollapsedLine {
  readonly line: string;
  readonly count: number;
}

/**
 * New `error.log` lines as Problems take them (spec section 6): the game's own binding lines left
 * out, and repeats collapsed into one with a count (a texture drawn missing writes about 220 lines
 * a second, H9). Lines compare without their time stamp.
 */
export function collapseErrorLog(lines: readonly string[]): CollapsedLine[] {
  const counts = new Map<string, { line: string; count: number }>();
  for (const line of lines) {
    if (GAME_BINDING_LINES.some((pattern) => pattern.test(line))) continue;
    const key = line.replace(/^\[\d{1,2}:\d{2}:\d{2}\]\s*/, '');
    const seen = counts.get(key);
    if (seen === undefined) counts.set(key, { line, count: 1 });
    else seen.count++;
  }
  return [...counts.values()];
}

/**
 * Whether `error.log` says the game drew a texture while it was missing (H9): an `Error
 * initialising texture` line, or another texture line, naming its file. Read from the end, up to
 * `maxBytes`.
 */
export async function textureDrawnMissing(
  path: string,
  texture: string,
  maxBytes = 4 << 20,
): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    return false;
  }
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const bytes = Buffer.alloc(length);
    await handle.read(bytes, 0, length, size - length);
    const name = texture.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
    const stem = name.replace(/\.(dds|tga|png)$/, '');
    if (stem === '') return false;
    return bytes
      .toString('latin1')
      .split(/\r?\n/)
      .some(
        (line) => /texture/i.test(line) && line.replace(/\\/g, '/').toLowerCase().includes(stem),
      );
  } finally {
    await handle.close();
  }
}
