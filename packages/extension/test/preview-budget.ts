// Local only: the vanilla budgets of spec section 7, when ETCH_GAME_PATH names the game folder:
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
//   pnpm --filter etch test
// The game is read in place; the edited file is a copy of countrydiplomacyview.gui in a temp mod,
// edited in its unsaved buffer. At each resolution, each run is a cold open of the preview (the
// playset, its sprite index, and the window's textures and fonts) and warm reloads of one edit
// each; the preview is closed between runs, so each cold open loads the playset again. A run over
// budget fails the suite. CI never sets ETCH_GAME_PATH: it has no game and its runners are too
// noisy to time (ADR 0004). Method and results: docs/budgets.md.
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import { RESOLUTION_SETTING, type PreviewPaint, type PreviewRender } from '../src/preview/index.ts';

/** The budgets of spec section 7 for the vanilla playset. */
const WARM_RELOAD_MS = 50;
const COLD_OPEN_MS = 1000;

const RUNS = Number(process.env['ETCH_BUDGET_RUNS'] ?? '3');
const EDITS = 40;
/** The pause between edits, longer than a reload, so that each edit is one warm reload. */
const PAUSE_MS = 150;
/** The corpus's common and largest resolution (ADR 0002). */
const RESOLUTIONS = ['1920x1080', '3440x1440'];
const NEEDLE = 'show_position = { x=0 y =140 }';

/** Nearest-rank quantile of sorted values. */
function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0;
}

interface Summary {
  readonly median: number;
  readonly p95: number;
  readonly max: number;
}

function summary(values: readonly number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), max: quantile(sorted, 1) };
}

function show({ median, p95, max }: Summary): string {
  return `median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${max.toFixed(1)} ms`;
}

/** The paint of the next render after an action. */
function nextPaint(api: EtchApi, action: () => unknown): Promise<[PreviewRender, PreviewPaint]> {
  const { preview } = api;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error('no paint in 30 s'));
    }, 30_000);
    const listener = preview.onDidPaint((paint) => {
      const render = preview.current;
      if (render?.id !== paint.id) return;
      clearTimeout(timer);
      listener.dispose();
      if (paint.error !== undefined) reject(new Error(paint.error));
      else resolve([render, paint]);
    });
    void action();
  });
}

const now = (): number => performance.timeOrigin + performance.now();

async function closePreview(api: EtchApi): Promise<void> {
  const tabs = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('etch.preview'),
    );
  await vscode.window.tabGroups.close(tabs);
  await api.preview.idle();
}

export async function testPreviewBudget(api: EtchApi, gamePath: string): Promise<void> {
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-budget-')), 'etch_budget');
  const copy = path.join(mod, 'interface', 'countrydiplomacyview.gui');
  await mkdir(path.dirname(copy), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch budget"\n');
  await copyFile(path.join(gamePath, 'interface', 'countrydiplomacyview.gui'), copy);

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  const misses: string[] = [];
  const rows: string[] = [];
  try {
    // The game reads interface files as Windows-1252 (etch#15).
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(copy), {
      encoding: 'windows1252',
    });
    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    const at = document.getText().indexOf(NEEDLE);
    assert.ok(at >= 0);
    editor.selection = new vscode.Selection(document.positionAt(at), document.positionAt(at));
    const offset = at + NEEDLE.indexOf('x=0');
    const range = new vscode.Range(document.positionAt(offset), document.positionAt(offset + 3));

    for (const resolution of RESOLUTIONS) {
      await settings.update(RESOLUTION_SETTING, resolution, vscode.ConfigurationTarget.Global);
      const colds: number[] = [];
      const fromEvent: number[] = [];
      const fromEdit: number[] = [];
      for (let run = 0; run < RUNS; run++) {
        const opened = now();
        const [first, cold] = await nextPaint(api, () =>
          vscode.commands.executeCommand('etch.openPreview'),
        );
        assert.equal(first.window.name, 'countrydiplomacyview');
        assert.equal(
          `${String(first.drawList.width)}x${String(first.drawList.height)}`,
          resolution,
        );
        colds.push(cold.at - opened);
        if (run === 0) {
          console.log(
            `[etch] budget window: ${String(first.drawList.draws.length)} draws, ` +
              `${String(first.drawList.textures.length)} textures, ${String(first.layout.widgets.length)} widgets`,
          );
        }

        for (let i = 0; i < EDITS; i++) {
          const edited = now();
          const [render, paint] = await nextPaint(api, () =>
            editor.edit((edit) => {
              edit.replace(range, i % 2 === 0 ? 'x=1' : 'x=0');
            }),
          );
          // From the change event the preview answers, and from the edit itself.
          fromEvent.push(paint.at - render.requestedAt);
          fromEdit.push(paint.at - edited);
          await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
        }
        await closePreview(api);
      }

      const cold = summary(colds);
      const warm = summary(fromEdit);
      console.log(
        `[etch] budget ${resolution} cold open over ${String(RUNS)} runs: ` +
          `${colds.map((ms) => ms.toFixed(0)).join(', ')} ms`,
      );
      console.log(
        `[etch] budget ${resolution} warm reload over ${String(RUNS * EDITS)} edits, ` +
          `from the change event: ${show(summary(fromEvent))}`,
      );
      console.log(
        `[etch] budget ${resolution} warm reload over ${String(RUNS * EDITS)} edits, ` +
          `from the edit: ${show(warm)}`,
      );
      rows.push(
        `| ${resolution.replace('x', '×')} | ${warm.median.toFixed(1)} | ${warm.p95.toFixed(1)} | ` +
          `${warm.max.toFixed(1)} | ${colds.map((ms) => ms.toFixed(0)).join(', ')} |`,
      );
      if (warm.p95 > WARM_RELOAD_MS) {
        misses.push(
          `${resolution} warm reload p95 ${warm.p95.toFixed(1)} ms > ${String(WARM_RELOAD_MS)} ms`,
        );
      }
      if (cold.max > COLD_OPEN_MS) {
        misses.push(
          `${resolution} cold open ${cold.max.toFixed(0)} ms > ${String(COLD_OPEN_MS)} ms`,
        );
      }
    }
    console.log(
      [
        '[etch] budget table (warm reload from the edit, ms; cold opens, ms):',
        '| Resolution | Median | p95 | Max | Cold opens |',
        '| --- | --- | --- | --- | --- |',
        ...rows,
      ].join('\n'),
    );

    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await settings.update(RESOLUTION_SETTING, undefined, vscode.ConfigurationTarget.Global);
  }
  assert.deepEqual(misses, [], 'the vanilla budgets of spec section 7 hold');
}
