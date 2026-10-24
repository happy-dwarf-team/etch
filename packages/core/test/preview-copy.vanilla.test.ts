/// <reference types="node" />
// Local only: writes the preview copies of every window of an installed game's interface files
// in memory, read in place; nothing is written to disk. Runs when ETCH_GAME_PATH names the game
// folder, and also over mod folders when ETCH_MOD_PATHS lists them (separated by `;`), for example
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
// and is skipped otherwise (CI has no game). Game and mod files never enter the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeGameText, parseScript, readGuiFile, writePreviewCopy } from '../src/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];
const modPaths = (process.env['ETCH_MOD_PATHS'] ?? '').split(';').filter((p) => p.trim() !== '');
const screen = { width: 3440, height: 1440 };

function guiFiles(root: string): string[] {
  const dir = join(root, 'interface');
  try {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => f.toLowerCase().endsWith('.gui'))
      .map((f) => relative(root, join(dir, f)).replaceAll('\\', '/'));
  } catch {
    return [];
  }
}

interface Tally {
  files: number;
  copies: number;
  refused: Record<string, number>;
  leftOut: string[];
  rewritten: number;
}

/** Writes every top-level window's copies and checks what the copies must keep (etch#16, etch#22). */
function copyAll(root: string): Tally {
  const tally: Tally = { files: 0, copies: 0, refused: {}, leftOut: [], rewritten: 0 };
  for (const path of guiFiles(root)) {
    const original = readFileSync(join(root, path));
    const { text, bom } = decodeGameText(original, 'interface');
    const parsed = parseScript(text);
    const file = readGuiFile(parsed);
    tally.files++;
    for (const definition of file.definitions) {
      const name = definition.name;
      if (name === undefined) continue;
      const copy = writePreviewCopy({ path, text, bom, window: name, screen });
      if (copy.files === undefined) {
        for (const d of copy.diagnostics) tally.refused[d.code] = (tally.refused[d.code] ?? 0) + 1;
        continue;
      }
      if (copy.diagnostics.some((d) => d.code === 'copy-leaves-out')) {
        tally.leftOut.push(`${path}: ${copy.diagnostics.map((d) => d.code).join(', ')}`);
      }
      tally.copies++;
      for (const c of copy.files) {
        const prefix = c.colour === 'black' ? 'etch_' : 'etchw_';
        const out = parseScript(c.text);
        expect(out.diagnostics.length).toBe(parsed.diagnostics.length);
        const model = readGuiFile(out);
        const names = model.definitions.map((d) => d.name ?? '');
        expect(names.every((n) => n.startsWith(prefix))).toBe(true);
        expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
        const wrapper = model.definitions.find((d) => d.name === c.wrapper);
        const inner = wrapper?.children.at(-1);
        expect(inner?.name).toBe(c.window);
        if (wrapper === undefined || inner === undefined) continue;
        // Without the wrapper and the prefixes, the copy is the original's text, unless the copy
        // left something out.
        if (copy.diagnostics.some((d) => d.code === 'copy-leaves-out')) continue;
        const unwrapped =
          c.text.slice(0, wrapper.node.start) +
          c.text.slice(inner.node.start, inner.node.end) +
          c.text.slice(wrapper.node.end);
        expect(unwrapped.replaceAll(prefix, '')).toBe(text);
        expect(c.bytes.length).toBe(c.text.length + (bom ? 3 : 0));
        if (c.colour === 'white') {
          // Prefixes beyond the top-level names (the wrapper's included) and the inner window's.
          tally.rewritten +=
            c.text.split(prefix).length - text.split(prefix).length - model.definitions.length - 1;
        }
      }
    }
  }
  return tally;
}

describe.skipIf(gamePath === undefined)('preview copies of the installed game', () => {
  it(
    'copies every vanilla window, rewriting only the one same-file scroll bar',
    { timeout: 60_000 },
    () => {
      const start = performance.now();
      const tally = copyAll(gamePath ?? '');
      const ms = performance.now() - start;
      expect(tally.files).toBe(129);
      // 623 windowType + 54 eu3dialogtype top-level windows; the other kinds are refused.
      expect(tally.copies).toBe(677);
      expect(tally.refused).toEqual({ 'game-host-window-kind': 181 });
      expect(tally.leftOut).toEqual([]);
      // console_wnd/console_list's scrollbartype, in each of core.gui's window copies.
      const core = readGuiFile(
        parseScript(
          decodeGameText(readFileSync(join(gamePath ?? '', 'interface/core.gui')), 'interface')
            .text,
        ),
      ).definitions.filter((d) => d.kind === 'windowType' || d.kind === 'eu3dialogtype').length;
      expect(tally.rewritten).toBe(core);
      console.log(`vanilla: ${String(tally.copies)} windows copied in ${ms.toFixed(0)} ms`);
    },
  );

  it.skipIf(modPaths.length === 0)(
    'copies every window of the listed mods',
    { timeout: 120_000 },
    () => {
      for (const root of modPaths) {
        const tally = copyAll(root);
        console.log(
          `${root}: ${String(tally.files)} files, ${String(tally.copies)} windows, refused ` +
            `${JSON.stringify(tally.refused)}, rewritten ${String(tally.rewritten)}, left out ` +
            JSON.stringify(tally.leftOut.slice(0, 3)),
        );
      }
    },
  );
});
