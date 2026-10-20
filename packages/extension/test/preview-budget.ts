// Local only: cold open and warm reload of vanilla countrydiplomacyview.gui (spec section 7),
// when ETCH_GAME_PATH names the game folder, for example
//   $env:ETCH_GAME_PATH = 'C:\Program Files (x86)\Steam\steamapps\common\Europa Universalis IV'
// The game is read in place; the edited file is a copy in a temp mod. Times are printed, not
// checked: CI has no game and its runners are too noisy to time (ADR 0004).
import * as assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import type { PreviewPaint, PreviewRender } from '../src/preview/index.ts';

const EDITS = 40;
const NEEDLE = 'show_position = { x=0 y =140 }';

function stats(values: readonly number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  return `median ${at(0.5).toFixed(1)} ms, p95 ${at(0.95).toFixed(1)} ms, max ${at(1).toFixed(1)} ms`;
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

export async function testPreviewBudget(api: EtchApi, gamePath: string): Promise<void> {
  const mod = path.join(await mkdtemp(path.join(tmpdir(), 'etch-budget-')), 'etch_budget');
  const copy = path.join(mod, 'interface', 'countrydiplomacyview.gui');
  await mkdir(path.dirname(copy), { recursive: true });
  await writeFile(path.join(mod, 'descriptor.mod'), 'name="Etch budget"\n');
  await copyFile(path.join(gamePath, 'interface', 'countrydiplomacyview.gui'), copy);

  const settings = vscode.workspace.getConfiguration('etch');
  await settings.update('gamePath', gamePath, vscode.ConfigurationTarget.Global);
  try {
    // The game reads interface files as Windows-1252 (etch#15).
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(copy), {
      encoding: 'windows1252',
    });
    const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
    const at = document.getText().indexOf(NEEDLE);
    assert.ok(at >= 0);
    editor.selection = new vscode.Selection(document.positionAt(at), document.positionAt(at));

    const opened = performance.timeOrigin + performance.now();
    const [first, cold] = await nextPaint(api, () =>
      vscode.commands.executeCommand('etch.openPreview'),
    );
    assert.equal(first.window.name, 'countrydiplomacyview');
    console.log(
      `[etch] budget cold open: ${(cold.at - opened).toFixed(0)} ms, ` +
        `${String(first.drawList.draws.length)} draws, ${String(first.drawList.textures.length)} textures`,
    );

    const offset = at + NEEDLE.indexOf('x=0');
    const range = new vscode.Range(document.positionAt(offset), document.positionAt(offset + 3));
    const times: number[] = [];
    for (let i = 0; i < EDITS; i++) {
      const [render, paint] = await nextPaint(api, () =>
        editor.edit((edit) => {
          edit.replace(range, i % 2 === 0 ? 'x=1' : 'x=0');
        }),
      );
      times.push(paint.at - render.requestedAt);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    console.log(`[etch] budget warm reload over ${String(EDITS)} edits: ${stats(times)}`);

    await vscode.commands.executeCommand('workbench.action.files.revert');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  } finally {
    await settings.update('gamePath', undefined, vscode.ConfigurationTarget.Global);
  }
}
