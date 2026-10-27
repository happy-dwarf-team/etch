// Runs inside the VS Code that test/run.mts starts. No test framework: a thrown
// error fails the run.
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import { testData } from './data.ts';
import { testGameText } from './game-text.ts';
import { testNavigation } from './navigation.ts';
import { testPreviewBudget } from './preview-budget.ts';
import { testPreview } from './preview.ts';
import { testPlaysetWindows } from './playset-windows.ts';
import { testViews } from './views.ts';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension, 'the extension is installed');
  const api = await extension.activate();
  assert.equal(extension.isActive, true, 'the extension activates');

  const settings = vscode.workspace.getConfiguration('etch');
  assert.equal(settings.get('gamePath'), '', 'etch.gamePath is contributed');
  assert.deepEqual(settings.get('playset'), [], 'etch.playset is contributed');
  assert.equal(settings.get('language'), 'english', 'etch.language is contributed');
  assert.equal(
    settings.get('previewResolution'),
    'default',
    'etch.previewResolution is contributed',
  );

  const gamePath = process.env['ETCH_GAME_PATH'];

  // Local only: every window a corpus playset's mods override, in the preview (etch#55).
  const playsetCheck = process.env['ETCH_PLAYSET_CHECK'];
  if (playsetCheck !== undefined && playsetCheck !== '') {
    assert.ok(gamePath !== undefined && gamePath !== '', 'ETCH_GAME_PATH names the game folder');
    await testPlaysetWindows(api, gamePath);
    return;
  }

  // Local only: the vanilla budgets, read from an installed game in place. They run first, so that
  // the first cold open is the first preview of this VS Code process.
  if (gamePath !== undefined && gamePath !== '') await testPreviewBudget(api, gamePath);

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'etch.startLiveGame',
    'etch.stopLiveGame',
    'etch.removePrivateInstall',
    'etch.openLiveGameSaves',
  ]) {
    assert.ok(commands.includes(command), `${command} is registered`);
  }
  // Etch 1.x's game host commands and the diff view are gone (ADR 0005).
  for (const command of ['etch.startGameHost', 'etch.toggleDiffView']) {
    assert.ok(!commands.includes(command), `${command} is not registered`);
  }
  assert.equal(api.liveGame.state.status, 'stopped', 'the live game starts only on request');

  await testGameText();
  await testNavigation(api);
  await testPreview(api);
  await testViews(api);
  await testData(api);
}
