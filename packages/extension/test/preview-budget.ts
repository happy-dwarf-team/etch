// Local only: the budgets of spec section 7, when ETCH_GAME_PATH names the game folder:
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
//   pnpm --filter etch test
// The game is read in place. Each playset's edited file is a copy of one of its `.gui` files in a
// temp mod, edited in its unsaved buffer: vanilla's countrydiplomacyview.gui, and for Anbennar the
// patch's topbar.gui, with the manifest's pinned Workshop items read in place before the temp mod.
// At each resolution, each run is a cold open of the preview (the playset, its sprite index, and
// the window's textures and fonts) and warm reloads of one edit each; the preview is closed between
// runs, so each cold open loads the playset again. ETCH_BUDGET_PLAYSETS (ids separated by `,`,
// default `vanilla,anbennar`) picks the playsets and their order. A run over budget fails the
// suite. CI never sets ETCH_GAME_PATH: it has no game and its runners are too noisy to time
// (ADR 0004). Method and results: docs/budgets.md.
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { hashModFolder, readCorpusManifest } from '@etch/core/corpus';
import { workshopFolderFor } from '@etch/core/playset';
import type { EtchApi } from '../src/extension.ts';
import { RESOLUTION_SETTING, type PreviewPaint, type PreviewRender } from '../src/preview/index.ts';

/** A playset of spec section 7 and its budgets. */
interface BudgetCase {
  /** The corpus manifest's playset id. */
  readonly playset: string;
  /** The edited file, relative to the game folder or to the mod `fromMod`. */
  readonly file: string;
  /** The Workshop id of the playset's mod whose `file` is copied; the game's when absent. */
  readonly fromMod?: string;
  readonly window: string;
  /** Text in the window; the edits toggle the first `0` after its `x` with `1`. */
  readonly needle: string;
  readonly warmReloadMs: number;
  readonly coldOpenMs: number;
}

/** The budgets of spec section 7. */
const CASES: readonly BudgetCase[] = [
  {
    playset: 'vanilla',
    file: 'interface/countrydiplomacyview.gui',
    window: 'countrydiplomacyview',
    needle: 'show_position = { x=0 y =140 }',
    warmReloadMs: 50,
    coldOpenMs: 1000,
  },
  {
    playset: 'anbennar',
    file: 'interface/topbar.gui',
    fromMod: '3777997797',
    window: 'topbar',
    needle: 'show_position = { x = 0 y = -1 }',
    warmReloadMs: 50,
    coldOpenMs: 2000,
  },
];

const RUNS = Number(process.env['ETCH_BUDGET_RUNS'] ?? '3');
const EDITS = 40;
/** The pause between edits, longer than a reload, so that each edit is one warm reload. */
const PAUSE_MS = 150;
/** The corpus's common and largest resolution (ADR 0002). */
const RESOLUTIONS = ['1920x1080', '3440x1440'];

/** Nearest-rank quantile of sorted values. */
export function quantile(sorted: readonly number[], q: number): number {
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

/** The playset's mod folders in the Workshop, each checked against the manifest's pin. */
export async function playsetMods(gamePath: string, playsetId: string): Promise<string[]> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension);
  const repository = path.join(extension.extensionPath, '..', '..');
  const read = await readCorpusManifest(path.join(repository, 'corpus', 'manifest.json'));
  assert.ok(read.manifest, `the manifest reads: ${JSON.stringify(read.problems)}`);
  const playset = read.manifest.playsets.find((p) => p.id === playsetId);
  assert.ok(playset, `the manifest has the playset ${playsetId}`);
  const workshop = workshopFolderFor(gamePath);
  const folders: string[] = [];
  for (const mod of playset.mods) {
    assert.ok(mod.workshopId !== undefined, `${mod.name} is a Workshop item`);
    const folder = path.join(workshop, mod.workshopId);
    if (mod.sha256 !== undefined) {
      assert.equal(await hashModFolder(folder), mod.sha256, `${mod.name} is the pinned version`);
    }
    folders.push(folder);
  }
  return folders;
}

async function measure(
  api: EtchApi,
  gamePath: string,
  budget: BudgetCase,
  misses: string[],
): Promise<void> {
  const mods = await playsetMods(gamePath, budget.playset);
  let source = path.join(gamePath, budget.file);
  if (budget.fromMod !== undefined) {
    const from = mods.find((folder) => path.basename(folder) === budget.fromMod);
    assert.ok(from, `${budget.fromMod} is a mod of ${budget.playset}`);
    source = path.join(from, budget.file);
  }
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-budget-')), 'etch_budget');
  const copy = path.join(mod, budget.file);
  await mkdir(path.dirname(copy), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch budget"\n');
  await copyFile(source, copy);

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  // Without mods the playset is the edited file's mod; with them, the override lists it last.
  await settings.update(
    'playset',
    mods.length === 0 ? undefined : [...mods, mod],
    vscode.ConfigurationTarget.Global,
  );

  // The game reads interface files as Windows-1252 (etch#15).
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(copy), {
    encoding: 'windows1252',
  });
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  const at = document.getText().indexOf(budget.needle);
  assert.ok(at >= 0, `${budget.file} has ${budget.needle}`);
  editor.selection = new vscode.Selection(document.positionAt(at), document.positionAt(at));
  const offset = at + budget.needle.indexOf('0', budget.needle.indexOf('x'));
  const range = new vscode.Range(document.positionAt(offset), document.positionAt(offset + 1));

  const rows: string[] = [];
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
      assert.equal(first.window.name, budget.window);
      assert.equal(`${String(first.drawList.width)}x${String(first.drawList.height)}`, resolution);
      colds.push(cold.at - opened);
      if (run === 0) {
        console.log(
          `[etch] budget ${budget.playset} window: ${String(first.drawList.draws.length)} draws, ` +
            `${String(first.drawList.textures.length)} textures, ${String(first.layout.widgets.length)} widgets`,
        );
      }

      for (let i = 0; i < EDITS; i++) {
        const edited = now();
        const [render, paint] = await nextPaint(api, () =>
          editor.edit((edit) => {
            edit.replace(range, i % 2 === 0 ? '1' : '0');
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
    const label = `[etch] budget ${budget.playset} ${resolution}`;
    console.log(
      `${label} cold open over ${String(RUNS)} runs: ` +
        `${colds.map((ms) => ms.toFixed(0)).join(', ')} ms`,
    );
    console.log(
      `${label} warm reload over ${String(RUNS * EDITS)} edits, ` +
        `from the change event: ${show(summary(fromEvent))}`,
    );
    console.log(
      `${label} warm reload over ${String(RUNS * EDITS)} edits, from the edit: ${show(warm)}`,
    );
    rows.push(
      `| ${resolution.replace('x', '×')} | ${warm.median.toFixed(1)} | ${warm.p95.toFixed(1)} | ` +
        `${warm.max.toFixed(1)} | ${colds.map((ms) => ms.toFixed(0)).join(', ')} |`,
    );
    if (warm.p95 > budget.warmReloadMs) {
      misses.push(
        `${budget.playset} ${resolution} warm reload p95 ${warm.p95.toFixed(1)} ms > ` +
          `${String(budget.warmReloadMs)} ms`,
      );
    }
    if (cold.max > budget.coldOpenMs) {
      misses.push(
        `${budget.playset} ${resolution} cold open ${cold.max.toFixed(0)} ms > ` +
          `${String(budget.coldOpenMs)} ms`,
      );
    }
  }
  console.log(
    [
      `[etch] budget table, ${budget.playset} (warm reload from the edit, ms; cold opens, ms):`,
      '| Resolution | Median | p95 | Max | Cold opens |',
      '| --- | --- | --- | --- | --- |',
      ...rows,
    ].join('\n'),
  );

  await vscode.window.showTextDocument(document);
  await vscode.commands.executeCommand('workbench.action.files.revert');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

export async function testPreviewBudget(api: EtchApi, gamePath: string): Promise<void> {
  const ids = (process.env['ETCH_BUDGET_PLAYSETS'] ?? 'vanilla,anbennar')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');
  const settings = vscode.workspace.getConfiguration('etch');
  const misses: string[] = [];
  try {
    for (const id of ids) {
      const budget = CASES.find((c) => c.playset === id);
      assert.ok(budget, `spec section 7 has budgets for ${id}`);
      await measure(api, gamePath, budget, misses);
    }
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('playset', undefined, vscode.ConfigurationTarget.Global);
    await settings.update(RESOLUTION_SETTING, undefined, vscode.ConfigurationTarget.Global);
  }
  assert.deepEqual(misses, [], 'the budgets of spec section 7 hold');
}
