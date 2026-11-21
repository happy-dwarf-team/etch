import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameFiles } from '@etch/core/playset';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startReport } from '../src/live-game/start-report.ts';

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'etch-start-report-'));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function tree(root: string, files: Record<string, string>): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const file = join(root, ...name.split('/'));
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, content);
  }
}

describe('startReport', () => {
  it("puts the lines on the edited mod's files and counts the rest", async () => {
    const game = join(folder, 'game');
    const other = join(folder, 'other');
    const mod = join(folder, 'mod');
    await tree(game, {
      'interface/settings.gui': 'guiTypes = {\n}\n',
      'interface/frontend.gui': 'guiTypes = {\n}\n',
    });
    await tree(other, { 'interface/other.gui': 'guiTypes = {\n}\n' });
    await tree(mod, {
      'interface/etch.gui': 'guiTypes = {\n\twindowType = {\n\t\tname = "etch"\n\t}\n}\n',
      'events/etch.txt': 'namespace = etch\nlimit = { has_province_modifier = etch_tower }\n',
      'localisation/etch_l_english.yml': '﻿l_english:\n MODIFIER_ETCH:0 "x"\n',
      'gfx/skipped.txt': 'etch_tower\n',
    });
    const files = new GameFiles([
      { name: 'game', root: game, replacePaths: [] },
      { name: 'Other', root: other, replacePaths: [] },
      { name: 'Etch', root: mod, replacePaths: [] },
    ]);
    const lines = [
      "[windowtype.cpp:809]: Guitype 'b' already exists in windowtype 'etch'.  file: interface/etch.gui line: 3",
      "[windowtype.cpp:809]: Guitype 'b' already exists in windowtype 'etch'.  file: interface/etch.gui line: 3",
      '[persistent.cpp:88]: Parsing Error. File: "interface/settings.gui", Error: Unexpected token: format, near line: 2',
      "[fixedwindow.cpp:2962]: interface/etch.gui: Missing Button 'close' in window 'etch'.",
      "[fixedwindow.cpp:2962]: interface/other.gui: Missing Button 'close' in window 'other'.",
      '[triggerimplementation.cpp:17071]: Unknown province-modifier in a trigger etch_tower',
      '[pdx_localize.cpp:1063]: Error in localization value! Key: "MODIFIER_ETCH", Error: "Couldn\'t find Latin1 character"',
      '[triggerimplementation.cpp:17071]: Unknown province-modifier in a trigger nowhere_tower',
      // Anvil's log throttle: the first note is dropped, the second adds its 6 to the line's 1.
      '[pdx_localize.cpp:1063]: [anvil-log-throttle] logged 10 times; further repeats are counted and reported every 60 s: Error in localization value! Key: "MODIFIER_ETCH", Error: "Couldn\'t find Latin1 character"',
      '[12:00:01][pdx_localize.cpp:1063]: [anvil-log-throttle] repeated 6 more times in the last 198 s: Error in localization value! Key: "MODIFIER_ETCH", Error: "Couldn\'t find Latin1 character"',
      "[news_banner.cpp:96]: Failed to get server data for key: 'steam_depot_id'",
      '[dlc.cpp:254]: Invalid supported_version in  file: mod/ugc_1.mod line: 8',
    ];
    const report = await startReport(lines, files, mod);
    expect(
      report.problems.map((p) => ({
        file: p.file.slice(mod.length + 1).replace(/\\/g, '/'),
        start: p.start,
        end: p.end,
        error: p.error,
        placed: p.placed,
        message: p.message.slice(0, 40),
      })),
    ).toEqual([
      // `\t\tname = "etch"`, line 3, without its indentation.
      {
        file: 'interface/etch.gui',
        start: 31,
        end: 44,
        error: false,
        placed: 'line',
        message: "error.log: Guitype 'b' already exists in",
      },
      // The window it names: `etch` in `name = "etch"`.
      {
        file: 'interface/etch.gui',
        start: 39,
        end: 43,
        error: false,
        placed: 'window',
        message: 'error.log: interface/etch.gui: Missing B',
      },
      {
        file: 'events/etch.txt',
        start: 51,
        end: 61,
        error: false,
        placed: 'key',
        message: 'error.log: Unknown province-modifier in ',
      },
      {
        file: 'localisation/etch_l_english.yml',
        start: 12,
        end: 25,
        error: false,
        placed: 'key',
        message: 'error.log: Error in localization value! ',
      },
    ]);
    expect(report.problems[0]?.message).toMatch(/\(×2\)$/);
    expect(report.problems[3]?.message).toMatch(/\(×7\)$/);
    expect(report.lines).toBe(9);
    // settings.gui and other.gui and the descriptor are not the mod's.
    expect(report.elsewhere).toBe(3);
    // The unknown key and the line that names nothing.
    expect(report.unplaced).toBe(2);
  });
});
