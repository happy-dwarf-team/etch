// Local only: the save budgets of spec section 9, when ETCH_GAME_PATH names the game folder and
// ETCH_BUDGET_SAVES names a copy of a save per playset (never the player's own file):
//   $env:ETCH_BUDGET_SAVES = 'vanilla=C:\copies\mp_Russia1719_03_17.eu4;anbennar=C:\copies\big.eu4'
//   pnpm --filter etch test
// For each playset, the preview opens on a copy of the playset's winning provinceview.gui in a temp
// mod, in its profile's default view. Each run chooses the save and times it to the paint that has
// its values (reading the file, inflating, indexing, the view's blocks, the layout and the paint),
// then chooses other provinces and countries of it in turn and times each to its paint. The save
// is dropped between runs and read again from the operating system's file cache. A time over
// budget fails the suite. Method and results: docs/budgets.md.
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import { RESOLUTION_SETTING, type PreviewPaint, type PreviewRender } from '../src/preview/index.ts';
import { playsetMods, quantile } from './preview-budget.ts';

/** A playset's save budgets (spec section 9). */
interface SaveBudget {
  readonly playset: string;
  /** The Workshop id of the mod whose provinceview.gui wins; the game's when absent. */
  readonly fromMod?: string;
  readonly chooseSaveMs: number;
  readonly chooseDataMs: number;
}

const BUDGETS: readonly SaveBudget[] = [
  { playset: 'vanilla', chooseSaveMs: 1000, chooseDataMs: 100 },
  { playset: 'anbennar', fromMod: '3777997797', chooseSaveMs: 2000, chooseDataMs: 100 },
];

const RUNS = Number(process.env['ETCH_BUDGET_RUNS'] ?? '3');
/** Choices of another province or country per run. */
const CHOICES = 40;
const PAUSE_MS = 150;
const FILE = 'interface/provinceview.gui';

const now = (): number => performance.timeOrigin + performance.now();

/** The first paint, after an action, of a render that satisfies a condition. */
function paintWhere(
  api: EtchApi,
  done: (render: PreviewRender) => boolean,
  action: () => unknown,
): Promise<[PreviewRender, PreviewPaint]> {
  const { preview } = api;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      const last = preview.current;
      reject(
        new Error(
          `no matching paint in 60 s; the last render: ${last?.window.name ?? 'none'}, ` +
            `sample ${JSON.stringify(last?.sample?.counts)}, data ${JSON.stringify(preview.viewState?.data?.save)}`,
        ),
      );
    }, 60_000);
    const listener = preview.onDidPaint((paint) => {
      const render = preview.current;
      if (render?.id !== paint.id || !done(render)) return;
      clearTimeout(timer);
      listener.dispose();
      if (paint.error !== undefined) reject(new Error(paint.error));
      else resolve([render, paint]);
    });
    void action();
  });
}

/** The name the province view's name box shows, and from which layer. */
function provinceName(render: PreviewRender): { text: string; layer: string } | undefined {
  const box = render.layout.widgets.find((w) => w.widget.name === 'provincename')?.widget;
  return box === undefined ? undefined : render.sample?.text(box);
}

function summary(values: readonly number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number): string => quantile(sorted, q).toFixed(1);
  return `median ${at(0.5)} ms, p95 ${at(0.95)} ms, max ${at(1)} ms`;
}

async function measure(
  api: EtchApi,
  gamePath: string,
  budget: SaveBudget,
  save: string,
  misses: string[],
): Promise<void> {
  const { preview } = api;
  const mods = await playsetMods(gamePath, budget.playset);
  let source = path.join(gamePath, FILE);
  if (budget.fromMod !== undefined) {
    const from = mods.find((folder) => path.basename(folder) === budget.fromMod);
    assert.ok(from, `${budget.fromMod} is a mod of ${budget.playset}`);
    source = path.join(from, FILE);
  }
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-save-budget-')), 'etch_budget');
  const copy = path.join(mod, FILE);
  await mkdir(path.dirname(copy), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch save budget"\n');
  await copyFile(source, copy);

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  await settings.update(
    'playset',
    mods.length === 0 ? undefined : [...mods, mod],
    vscode.ConfigurationTarget.Global,
  );
  await settings.update(RESOLUTION_SETTING, '1920x1080', vscode.ConfigurationTarget.Global);

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(copy), {
    encoding: 'windows1252',
  });
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  // On a line of its own: a comment may name the window too.
  const at = document.getText().search(/^\s*name\s*=\s*"provinceview"/m);
  assert.ok(at >= 0, `${FILE} defines provinceview`);
  editor.selection = new vscode.Selection(document.positionAt(at), document.positionAt(at));
  const [first] = await paintWhere(
    api,
    (r) => r.window.name === 'provinceview' && r.sample !== undefined,
    () => vscode.commands.executeCommand('etch.openPreview'),
  );
  assert.equal(first.view?.profile.profile.window, 'provinceview', 'provinceview has its profile');

  const label = `[etch] save budget ${budget.playset}`;
  const saves: number[] = [];
  const choices: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    await preview.dataAction({ kind: 'dropSave' });
    await preview.idle();
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    const heap = process.memoryUsage();
    const chosen = now();
    let read = 0;
    const [withSave, paint] = await paintWhere(
      api,
      (r) => (r.sample?.counts.save ?? 0) > 0,
      async () => {
        await preview.chooseSave(save);
        read = now() - chosen;
      },
    );
    saves.push(paint.at - chosen);
    while (read === 0) await new Promise((resolve) => setTimeout(resolve, 10));
    console.log(
      `${label} run ${String(run + 1)}: paint ${(paint.at - chosen).toFixed(0)} ms, ` +
        `the save read ${read.toFixed(0)} ms; heap before ${(heap.heapUsed / 1e6).toFixed(0)} MB`,
    );
    if (run === 0) {
      const counts = preview.viewState?.data?.layers.map((l) => `${l.id} ${String(l.count)}`);
      console.log(
        `${label}: ${path.basename(save)}, ${provinceName(withSave)?.text ?? '?'}; texts: ${counts?.join(', ') ?? '?'}`,
      );
    }

    // Other provinces of the save, and now and then another country.
    assert.equal(preview.viewState?.data?.save.state, 'ready');
    const ids = choicesOf(api);
    for (let i = 0; i < CHOICES; i++) {
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      const next = ids[i % ids.length];
      assert.ok(next);
      const before = preview.current?.id ?? 0;
      const started = now();
      const [, changed] = await paintWhere(
        api,
        (r) => r.id > before,
        () => {
          preview.chooseData(next);
        },
      );
      choices.push(changed.at - started);
    }
  }
  console.log(
    `${label} choosing the save over ${String(RUNS)} runs: ${saves.map((ms) => ms.toFixed(0)).join(', ')} ms`,
  );
  console.log(
    `${label} choosing a province or country over ${String(RUNS * CHOICES)}: ${summary(choices)}`,
  );
  const worst = Math.max(...saves);
  if (worst > budget.chooseSaveMs) {
    misses.push(
      `${budget.playset} choosing a save ${worst.toFixed(0)} ms > ${String(budget.chooseSaveMs)} ms`,
    );
  }
  const p95 = quantile(
    [...choices].sort((a, b) => a - b),
    0.95,
  );
  if (p95 > budget.chooseDataMs) {
    misses.push(
      `${budget.playset} choosing a province or country p95 ${p95.toFixed(1)} ms > ${String(budget.chooseDataMs)} ms`,
    );
  }

  await preview.dataAction({ kind: 'dropSave' });
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await preview.idle();
}

/**
 * The choices a run steps through: the provinces of the chosen country, one by one, and every
 * tenth choice another country of the save.
 */
function choicesOf(api: EtchApi): { country?: string; province?: number }[] {
  const { countries, provinces, country: current, province: start } = api.preview.dataChoices();
  // Each choice changes something: never the province or the country already chosen.
  const own = provinces.filter((id) => id !== start).slice(0, 20);
  const others = countries.filter((tag) => tag !== current);
  const out: { country?: string; province?: number }[] = [];
  for (let i = 0; i < CHOICES; i++) {
    const country = others[Math.floor(i / 10)];
    const province = own[i % Math.max(1, own.length)];
    if (i % 10 === 9 && country !== undefined) out.push({ country });
    else if (province !== undefined) out.push({ province });
  }
  return out;
}

export async function testSaveBudget(api: EtchApi, gamePath: string, saves: string): Promise<void> {
  const chosen = new Map(
    saves
      .split(';')
      .map((pair) => pair.split('='))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([id, file]) => [id.trim(), file.trim()]),
  );
  const settings = vscode.workspace.getConfiguration('etch');
  const misses: string[] = [];
  try {
    for (const budget of BUDGETS) {
      const save = chosen.get(budget.playset);
      if (save === undefined) continue;
      await measure(api, gamePath, budget, save, misses);
    }
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('playset', undefined, vscode.ConfigurationTarget.Global);
    await settings.update(RESOLUTION_SETTING, undefined, vscode.ConfigurationTarget.Global);
  }
  assert.deepEqual(misses, [], 'the save budgets of spec section 9 hold');
}
