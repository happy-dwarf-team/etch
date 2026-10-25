// The game host's `error.log` (spec section 10, etch#52): the game writes it into the private
// profile's `logs` folder, a line at a time, and the extension reads what each preview job added.
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
