// Local only, with ETCH_GAME_HOST_CHECK=budget beside ETCH_GAME_HOST_PATH: the game host's times on
// the Anbennar playset (spec section 7, reported, not gated; etch#57). The manifest's pinned
// Workshop items are read in place, with a test mod after them that holds copies of the patch's
// topbar.gui and countrydiplomacyview.gui. It times the start to ready, warm edits of each file's
// window from the change to the drawn image and the job itself, and two restarts that a `.gfx`
// file in the test mod causes (saved, then deleted), from the save to ready and to the image. The
// game host is closed after the idle time, and the install is removed. Results: docs/budgets.md.
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import type { GameHostState } from '../src/game-host/index.ts';
import { prepareInstall } from '../src/game-host/install.ts';
import { processIdentity } from '../src/game-host/windows.ts';
import type { HostImagePaint } from '../src/preview/preview.ts';
import { waitFor } from './game-host.ts';
import { nextImage } from './game-host-jobs.ts';
import { playsetMods, quantile } from './preview-budget.ts';

const PLAYSET = 'anbennar';
/** The patch, whose files are edited. */
const FROM_MOD = '3777997797';
/** Each edited file, its window and the text whose first `0` after its `x` the edits toggle. */
const FILES = [
  { file: 'interface/topbar.gui', window: 'topbar', needle: 'show_position = { x = 0 y = -1 }' },
  {
    file: 'interface/countrydiplomacyview.gui',
    window: 'countrydiplomacyview',
    needle: 'show_position = { x=0 y =168 }',
  },
];
const EDITS = 20;
const RESTARTS = 2;

function times(values: readonly number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    `median ${quantile(sorted, 0.5).toFixed(0)} ms, p95 ${quantile(sorted, 0.95).toFixed(0)} ms, ` +
    `max ${quantile(sorted, 1).toFixed(0)} ms`
  );
}

/** The next state `status`, after any others. */
function next(api: EtchApi, status: GameHostState['status'], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error(`the game host is ${api.gameHost.state.status}, not ${status}`));
    }, timeoutMs);
    const listener = api.gameHost.onDidChangeState((state) => {
      if (state.status === 'failed') {
        clearTimeout(timer);
        listener.dispose();
        reject(new Error(`the game host failed: ${state.message}`));
      } else if (state.status === status) {
        clearTimeout(timer);
        listener.dispose();
        resolve();
      }
    });
  });
}

/** The next game host image the preview draws of a job after `job`. */
function imageAfterJob(api: EtchApi, job: number, timeoutMs: number): Promise<HostImagePaint> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error(`no image of a job after ${String(job)} in time`));
    }, timeoutMs);
    const listener = api.preview.onDidPaintHostImage((paint) => {
      if (paint.outcome.job <= job) return;
      clearTimeout(timer);
      listener.dispose();
      resolve(paint);
    });
  });
}

export async function testGameHostBudget(api: EtchApi, gamePath: string): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension);
  const mods = await playsetMods(gamePath, PLAYSET);
  const from = mods.find((folder) => path.basename(folder) === FROM_MOD);
  assert.ok(from, `${FROM_MOD} is a mod of ${PLAYSET}`);
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-host-budget-')), 'etch_budget');
  await mkdir(mod, { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch game host budget"\n');
  for (const { file } of FILES) {
    await mkdir(path.dirname(path.join(mod, file)), { recursive: true });
    await copyFile(path.join(from, file), path.join(mod, file));
  }

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  await settings.update('playset', [...mods, mod], vscode.ConfigurationTarget.Global);
  const { preview, gameHost } = api;
  // The last job whose image the preview drew.
  let lastJob = 0;
  const jobListener = preview.onDidPaintHostImage((paint) => {
    lastJob = Math.max(lastJob, paint.outcome.job);
  });
  try {
    // An editor first, so that the preview opens beside it: a preview that is not visible does
    // not render.
    const first = FILES[0];
    assert.ok(first);
    const firstDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.join(mod, first.file)),
      { encoding: 'windows1252' },
    );
    const firstEditor = await vscode.window.showTextDocument(firstDocument, vscode.ViewColumn.One);
    const at = firstDocument.positionAt(firstDocument.getText().indexOf(first.needle));
    firstEditor.selection = new vscode.Selection(at, at);
    preview.open();
    await preview.idle();

    await prepareInstall({
      layout: gameHost.install.layout,
      gameFolder: gamePath,
      buildsFolder: path.join(extension.extensionPath, 'game'),
      mods: [],
      display: { width: 1920, height: 1080, language: 'english' },
    });
    const switched = Date.now();
    const firstImage = nextImage(api, 240_000);
    firstImage.catch(() => undefined);
    preview.setBackend('game-host');
    const ready = await waitFor(api, 'ready', 240_000);
    assert.ok(ready.status === 'ready');
    const image = await firstImage;
    console.log(
      `[etch] host budget: ready ${String(ready.readyMs)} ms after creation, ` +
        `${String(Date.now() - switched)} ms after the switch, first image ` +
        `${String(image.at - switched)} ms after the switch`,
    );

    for (const { file, window, needle } of FILES) {
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.file(path.join(mod, file)),
        { encoding: 'windows1252' },
      );
      const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
      const offset = document.getText().indexOf(needle);
      assert.ok(offset >= 0, `${file} has ${needle}`);
      const position = document.positionAt(offset);
      editor.selection = new vscode.Selection(position, position);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await preview.idle();
      await gameHost.jobsIdle();
      assert.equal(preview.current?.window.name, window);

      const digit = offset + needle.indexOf('0', needle.indexOf('x'));
      const range = new vscode.Range(document.positionAt(digit), document.positionAt(digit + 1));
      const fromChange: number[] = [];
      const jobs: number[] = [];
      let crop = '';
      for (let edit = 0; edit < EDITS; edit++) {
        const waiting = nextImage(api);
        await editor.edit((builder) => {
          builder.replace(range, edit % 2 === 0 ? '1' : '0');
        });
        const paint: HostImagePaint = await waiting;
        fromChange.push(paint.fromChangeMs);
        jobs.push(paint.outcome.ms.job);
        const { width, height } = paint.outcome.image.crop;
        crop = `${String(width)}×${String(height)}`;
      }
      console.log(
        `[etch] host budget ${window} (${crop}), ${String(EDITS)} warm edits: change to image ` +
          `${times(fromChange)}; job ${times(jobs)}`,
      );
      await vscode.commands.executeCommand('workbench.action.files.revert');
    }

    // Restarts: a `.gfx` file in the test mod, saved and then deleted.
    const gfx = path.join(mod, 'interface', 'etch_budget_restart.gfx');
    for (let restart = 0; restart < RESTARTS; restart++) {
      // No job of the edits may answer for the restarted game.
      await preview.idle();
      await gameHost.jobsIdle();
      const saved = Date.now();
      const restarting = next(api, 'restarting', 10_000);
      if (restart % 2 === 0) await writeFile(gfx, 'spriteTypes = {\n}\n');
      else await rm(gfx, { force: true });
      await restarting;
      await next(api, 'ready', 240_000);
      const readyAt = Date.now();
      // The old game still answers the changed file's job before it closes, and the restarting
      // preview draws that image again, stale: the new game's image is of a later job.
      const paint = await imageAfterJob(api, lastJob, 60_000);
      const state = gameHost.state;
      console.log(
        `[etch] host budget restart ${String(restart + 1)}: ready ${String(readyAt - saved)} ms ` +
          `after the save (${state.status === 'ready' ? `${String(state.readyMs)} ms after creation` : state.status}), ` +
          `image ${(paint.at - saved).toFixed(0)} ms after the save`,
      );
    }

    const last = gameHost.running;
    assert.ok(last, 'the game host runs after the restarts');
    gameHost.setIdleTime(2_000);
    preview.setBackend('offline');
    await waitFor(api, 'stopped', 60_000);
    assert.equal(await processIdentity(last.identity.pid), undefined, 'the game process is gone');
    console.log('[etch] host budget: game host stopped after the idle time');
    await vscode.commands.executeCommand('etch.removeGameHostInstall');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  } finally {
    jobListener.dispose();
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await settings.update('playset', undefined, vscode.ConfigurationTarget.Global);
  }
}
