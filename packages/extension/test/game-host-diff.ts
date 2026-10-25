// Local only, with ETCH_GAME_HOST_CHECK=diff beside ETCH_GAME_HOST_PATH: the diff view on the real
// game host (etch#54). countrydiplomacyview from a temporary mod, as game-host.ts previews it, goes
// to the game host; the check sets the preview resolution to the game host's, turns the diff view
// on, reports what it found and how long an edit takes to reach it, and holds it on the screen for
// ETCH_DIFF_HOLD_MS (15 s by default) so that it can be looked at. Then the game host stops and its
// install is removed. Nothing is written outside the test VS Code's storage and the temp folder.
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import { prepareInstall } from '../src/game-host/install.ts';
import { processIdentity } from '../src/game-host/windows.ts';
import { RESOLUTION_SETTING, writeResolution, type PreviewPaint } from '../src/preview/index.ts';
import { waitFor } from './game-host.ts';
import { nextImage } from './game-host-jobs.ts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function nextDiff(api: EtchApi, timeoutMs = 30_000): Promise<PreviewPaint> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listener.dispose();
      reject(new Error('no diff view painted in time'));
    }, timeoutMs);
    const listener = api.preview.onDidPaint((paint) => {
      if (paint.diff === undefined) return;
      clearTimeout(timer);
      listener.dispose();
      resolve(paint);
    });
  });
}

function summary(paint: PreviewPaint): string {
  const d = paint.diff;
  assert.ok(d);
  const differing = d.different + d.offlineOnly + d.hostOnly;
  return (
    `${String(differing)} of ${String(d.compared)} pixels differ ` +
    `(${((100 * differing) / d.compared).toFixed(1)} %): both ${String(d.different)}, ` +
    `offline only ${String(d.offlineOnly)}, game host only ${String(d.hostOnly)}, ` +
    `largest ${String(d.largest)}`
  );
}

export async function testGameHostDiff(api: EtchApi, gamePath: string): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension);
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-game-host-diff-')), 'etch_diff');
  await mkdir(path.join(mod, 'interface'), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch diff view test"\n');
  const copy = path.join(mod, 'interface', 'countrydiplomacyview.gui');
  await copyFile(path.join(gamePath, 'interface', 'countrydiplomacyview.gui'), copy);
  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  const { preview, gameHost } = api;
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(copy));
    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    const start = document.positionAt(document.getText().indexOf('name = "countrydiplomacyview"'));
    editor.selection = new vscode.Selection(start, start);
    preview.open();
    await preview.idle();
    await prepareInstall({
      layout: gameHost.install.layout,
      gameFolder: gamePath,
      buildsFolder: path.join(extension.extensionPath, 'game'),
      mods: [],
      display: { width: 1920, height: 1080, language: 'english' },
    });

    preview.setBackend('game-host');
    const firstImage = nextImage(api, 90_000);
    firstImage.catch(() => undefined);
    const ready = await waitFor(api, 'ready', 180_000);
    assert.ok(ready.status === 'ready');
    await firstImage;
    const screen = gameHost.screen;
    assert.ok(screen, 'the game host has a screen');
    console.log(
      `[etch] game host ready after ${String(ready.readyMs)} ms at ` +
        `${String(screen.width)}×${String(screen.height)}; diff ${JSON.stringify(preview.diff)}`,
    );

    // The diff view needs the preview resolution to be the game host's.
    await writeResolution(`${String(screen.width)}x${String(screen.height)}`);
    await delay(300);
    await preview.idle();
    assert.equal(preview.diff.blocked, undefined, JSON.stringify(preview.diff));

    const shown = nextDiff(api);
    const on = performance.timeOrigin + performance.now();
    preview.setDiffView(true);
    const first = await shown;
    console.log(
      `[etch] diff view of the last image in ${(first.at - on).toFixed(0)} ms: ${summary(first)}`,
    );
    assert.ok(
      preview.notices.some((n) => /differ by design/.test(n.message)),
      JSON.stringify(preview.notices),
    );

    // An edit: the next diff view pairs the new image with the render its job answered.
    const text = editor.document.getText();
    const match = /position = \{ x=-600 y=140 \}/.exec(text);
    assert.ok(match, 'the window has its position');
    const edited = nextDiff(api);
    const changed = performance.timeOrigin + performance.now();
    await editor.edit((builder) => {
      builder.replace(
        new vscode.Range(
          editor.document.positionAt(match.index),
          editor.document.positionAt(match.index + match[0].length),
        ),
        'position = { x=-560 y=180 }',
      );
    });
    const after = await edited;
    console.log(
      `[etch] diff view after an edit in ${(after.at - changed).toFixed(0)} ms: ${summary(after)}`,
    );

    const hold = Number(process.env['ETCH_DIFF_HOLD_MS'] ?? '15000');
    console.log(`[etch] diff view shown; holding it for ${String(hold)} ms`);
    await delay(hold);

    preview.setDiffView(false);
    const last = gameHost.running;
    assert.ok(last, 'the game host runs');
    gameHost.setIdleTime(2_000);
    preview.setBackend('offline');
    await waitFor(api, 'stopped', 60_000);
    assert.equal(await processIdentity(last.identity.pid), undefined, 'the game process is gone');
    console.log('[etch] game host stopped');
    await vscode.commands.executeCommand('etch.removeGameHostInstall');
    await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
    await settings.update(RESOLUTION_SETTING, undefined, vscode.ConfigurationTarget.Global);
  }
}
