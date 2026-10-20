// Runs inside the VS Code that test/run.mts starts. No test framework: a thrown
// error fails the run.
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import { testGameText } from './game-text.ts';
import { testNavigation } from './navigation.ts';
import { testPreviewBudget } from './preview-budget.ts';
import { testPreview } from './preview.ts';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension, 'the extension is installed');
  const api = await extension.activate();
  assert.equal(extension.isActive, true, 'the extension activates');

  const settings = vscode.workspace.getConfiguration('etch');
  assert.equal(settings.get('gamePath'), '', 'etch.gamePath is contributed');
  assert.deepEqual(settings.get('playset'), [], 'etch.playset is contributed');
  assert.equal(settings.get('language'), 'english', 'etch.language is contributed');

  await testGameText();
  await testNavigation(api);
  await testPreview(api);

  // Local only: the vanilla budgets, read from an installed game in place.
  const gamePath = process.env['ETCH_GAME_PATH'];
  if (gamePath !== undefined && gamePath !== '') await testPreviewBudget(api, gamePath);
}
