// The player's `settings.txt` in the profile folder (spec section 6): the game's resolution, the
// default preview resolution, and its UI scale, which the preview reports when it is not 1. The
// file is only read.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Screen } from '../model/index.ts';
import { isSide } from '../resolution.ts';
import { parseScript, type BlockNode, type EntryNode } from '../script/index.ts';

/** What the preview uses from the player's settings. */
export interface PlayerSettings {
  /** `graphics.size`, when both sides are valid. */
  readonly screen: Screen | undefined;
  /** `graphics.game_ui_scale`, when it is a number. */
  readonly uiScale: number | undefined;
}

/** Reads `settings.txt` of a profile folder; `undefined` when there is no such file. */
export async function readPlayerSettings(
  profileFolder: string | undefined,
): Promise<PlayerSettings | undefined> {
  if (profileFolder === undefined) return undefined;
  const bytes = await readFile(join(profileFolder, 'settings.txt')).catch(() => undefined);
  // The game writes the file in ASCII; latin1 reads any byte.
  return bytes === undefined ? undefined : parsePlayerSettings(bytes.toString('latin1'));
}

/** The settings the preview uses from the text of a `settings.txt`. */
export function parsePlayerSettings(text: string): PlayerSettings {
  const graphics = block(parseScript(text).entries, 'graphics');
  const size = graphics && block(graphics.entries, 'size');
  const width = size && number(size.entries, 'x');
  const height = size && number(size.entries, 'y');
  const scale = graphics && number(graphics.entries, 'game_ui_scale');
  return {
    screen:
      width !== undefined && height !== undefined && isSide(width) && isSide(height)
        ? { width, height }
        : undefined,
    uiScale: scale !== undefined && scale > 0 ? scale : undefined,
  };
}

/** The value of the last property with a key; the game keeps the last one it reads. */
function value(entries: readonly EntryNode[], key: string): EntryNode | undefined {
  let found: EntryNode | undefined;
  for (const entry of entries) {
    if (entry.kind === 'property' && entry.key.text.toLowerCase() === key) found = entry.value;
  }
  return found;
}

function block(entries: readonly EntryNode[], key: string): BlockNode | undefined {
  const found = value(entries, key);
  return found?.kind === 'block' ? found : undefined;
}

function number(entries: readonly EntryNode[], key: string): number | undefined {
  const found = value(entries, key);
  if (found?.kind !== 'scalar' || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(found.text)) return undefined;
  return Number(found.text);
}
