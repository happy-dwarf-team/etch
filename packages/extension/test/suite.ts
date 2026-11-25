// Runs inside the VS Code that test/run.mts starts. No test framework: a thrown
// error fails the run.
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { EtchApi } from '../src/extension.ts';
import { testAssetLinks } from './asset-links.ts';
import { testSpriteLinks } from './sprite-links.ts';
import { testFontLinks } from './font-links.ts';
import { testLocalisationHints } from './localisation-hints.ts';
import { testGuiCompletion } from './gui-completion.ts';
import { testInterfaceSymbols } from './interface-symbols.ts';
import { testSpriteReferences } from './sprite-references.ts';
import { testGfxColours } from './gfx-colours.ts';
import { testBuildCheck } from './build-check.ts';
import { testData } from './data.ts';
import { testGameText } from './game-text.ts';
import { testNavigation } from './navigation.ts';
import { testPreviewBudget } from './preview-budget.ts';
import { testProvinceIds } from './province-ids.ts';
import { testProvinceNames } from './province-names.ts';
import { testParticleDiagnostics } from './particle-diagnostics.ts';
import { testSaveBudget } from './save-budget.ts';
import { testScriptProfile } from './script-profile.ts';
import { testScriptedSkeleton } from './scripted-skeleton.ts';
import { testMeshPreview } from './mesh-preview.ts';
import { testEntityPreview } from './entity-preview.ts';
import { testTexturePreview } from './texture-preview.ts';
import { testPreview } from './preview.ts';
import { testPlaysetWindows } from './playset-windows.ts';
import { testViews } from './views.ts';

// ETCH_TEST_ONLY runs only the tests whose name it matches: a case-insensitive regular
// expression, so a plain substring works too (ETCH_TEST_ONLY=scriptedSkeleton). The extension
// still activates first, and the tests keep their order.
const only = process.env['ETCH_TEST_ONLY'];
const onlyPattern = only !== undefined && only !== '' ? new RegExp(only, 'i') : undefined;

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<EtchApi>('happy-dwarf-team.etch');
  assert.ok(extension, 'the extension is installed');
  const api = await extension.activate();
  assert.equal(extension.isActive, true, 'the extension activates');

  const names: string[] = [];
  const ran: string[] = [];
  const test = async (name: string, body: () => Promise<void> | void): Promise<void> => {
    names.push(name);
    if (onlyPattern !== undefined && !onlyPattern.test(name)) return;
    ran.push(name);
    await body();
  };
  try {
    await tests(test, api, extension.extensionUri);
  } finally {
    if (onlyPattern !== undefined)
      console.log(`ETCH_TEST_ONLY=${only ?? ''} ran: ${ran.join(', ')}`);
  }
  if (onlyPattern !== undefined && ran.length === 0) {
    throw new Error(`ETCH_TEST_ONLY=${only ?? ''} matches no test of: ${names.join(', ')}`);
  }
}

type Test = (name: string, body: () => Promise<void> | void) => Promise<void>;

async function tests(test: Test, api: EtchApi, extensionUri: vscode.Uri): Promise<void> {
  await test('settings', () => {
    const settings = vscode.workspace.getConfiguration('etch');
    assert.equal(settings.get('gamePath'), '', 'etch.gamePath is contributed');
    assert.deepEqual(settings.get('playset'), [], 'etch.playset is contributed');
    assert.equal(settings.get('language'), 'english', 'etch.language is contributed');
    assert.equal(
      settings.get('previewResolution'),
      'default',
      'etch.previewResolution is contributed',
    );
  });

  await test('buildCheck', () => testBuildCheck(extensionUri));

  const gamePath = process.env['ETCH_GAME_PATH'];

  // Local only: every window a corpus playset's mods override, in the preview (etch#55).
  const playsetCheck = process.env['ETCH_PLAYSET_CHECK'];
  if (playsetCheck !== undefined && playsetCheck !== '') {
    assert.ok(gamePath !== undefined && gamePath !== '', 'ETCH_GAME_PATH names the game folder');
    await test('playsetWindows', () => testPlaysetWindows(api, gamePath));
    return;
  }

  // Local only: the vanilla budgets, read from an installed game in place. They run first, so that
  // the first cold open is the first preview of this VS Code process.
  if (gamePath !== undefined && gamePath !== '') {
    await test('previewBudget', () => testPreviewBudget(api, gamePath));
  }
  // Local only: the save budgets (spec section 9), from copies of saves.
  const budgetSaves = process.env['ETCH_BUDGET_SAVES'];
  if (
    gamePath !== undefined &&
    gamePath !== '' &&
    budgetSaves !== undefined &&
    budgetSaves !== ''
  ) {
    await test('saveBudget', () => testSaveBudget(api, gamePath, budgetSaves));
  }

  await test('commands', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      'etch.startLiveGame',
      'etch.stopLiveGame',
      'etch.removePrivateInstall',
      'etch.openLiveGameSaves',
      'etch.getStarted',
    ]) {
      assert.ok(commands.includes(command), `${command} is registered`);
    }
    // Etch 1.x's game host commands and the diff view are gone (ADR 0005).
    for (const command of ['etch.startGameHost', 'etch.toggleDiffView']) {
      assert.ok(!commands.includes(command), `${command} is not registered`);
    }
    assert.equal(api.liveGame.state.status, 'stopped', 'the live game starts only on request');
  });

  await test('gameText', () => testGameText());
  await test('navigation', () => testNavigation(api));
  await test('preview', () => testPreview(api));
  await test('views', () => testViews(api));
  await test('data', () => testData(api));
  await test('scriptProfile', () => testScriptProfile());
  await test('provinceIds', () => testProvinceIds());
  await test('provinceNames', () => testProvinceNames());
  await test('particleDiagnostics', () => testParticleDiagnostics());
  await test('scriptedSkeleton', () => testScriptedSkeleton(api));
  await test('texturePreview', () => testTexturePreview(api));
  await test('assetLinks', () => testAssetLinks());
  await test('meshPreview', () => testMeshPreview(api));
  await test('entityPreview', () => testEntityPreview(api));
  await test('spriteLinks', () => testSpriteLinks(api));
  await test('fontLinks', () => testFontLinks());
  await test('localisationHints', () => testLocalisationHints());
  await test('guiCompletion', () => testGuiCompletion());
  await test('interfaceSymbols', () => testInterfaceSymbols());
  await test('spriteReferences', () => testSpriteReferences());
  await test('gfxColours', () => testGfxColours());
}
