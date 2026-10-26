// Runs inside the VS Code that test/run.mts starts. No test framework: a thrown
// error fails the run.
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import { testGameHost } from './game-host.ts';
import { testGameHostBudget } from './game-host-budget.ts';
import { testGameHostCorpus } from './game-host-corpus.ts';
import { testGameHostDiff } from './game-host-diff.ts';
import { testPreviewCopyH1 } from './game-host-h1.ts';
import { testGameText } from './game-text.ts';
import { testNavigation } from './navigation.ts';
import { testPreviewBudget } from './preview-budget.ts';
import { testPreview } from './preview.ts';
import { testPlaysetWindows } from './playset-windows.ts';

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
  const gameHostPath = process.env['ETCH_GAME_HOST_PATH'];

  // Local only: every window a corpus playset's mods override, in both backends (etch#55).
  const playsetCheck = process.env['ETCH_PLAYSET_CHECK'];
  if (playsetCheck !== undefined && playsetCheck !== '') {
    const game = gamePath ?? gameHostPath;
    assert.ok(game !== undefined && game !== '', 'ETCH_GAME_PATH names the game folder');
    await testPlaysetWindows(api, game, gameHostPath === '' ? undefined : gameHostPath);
    return;
  }

  // Local only: the vanilla budgets, read from an installed game in place. They run first, so that
  // the first cold open is the first preview of this VS Code process.
  if (gamePath !== undefined && gamePath !== '') await testPreviewBudget(api, gamePath);

  const commands = await vscode.commands.getCommands(true);
  for (const command of ['etch.startGameHost', 'etch.stopGameHost', 'etch.removeGameHostInstall']) {
    assert.ok(commands.includes(command), `${command} is registered`);
  }
  assert.equal(api.gameHost.state.status, 'stopped', 'the game host starts only on demand');

  // Local only: one start of the real game host from a game host install.
  if (gameHostPath !== undefined && gameHostPath !== '') {
    // ETCH_GAME_HOST_CHECK=h1 runs H1 of etch#16 instead (etch#119), =corpus the corpus's windows
    // (etch#53), =diff the diff view (etch#54), =budget the game host's times on Anbennar (etch#57).
    const check = process.env['ETCH_GAME_HOST_CHECK'];
    if (check === 'budget') await testGameHostBudget(api, gameHostPath);
    else if (check === 'h1') await testPreviewCopyH1(api, gameHostPath);
    else if (check === 'corpus') await testGameHostCorpus(api, gameHostPath);
    else if (check === 'diff') await testGameHostDiff(api, gameHostPath);
    else await testGameHost(api, gameHostPath);
    return;
  }

  await testGameText();
  await testNavigation(api);
  await testPreview(api);
}
