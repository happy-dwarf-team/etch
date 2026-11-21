// Check File in the Live Game (ADR 0007, part 2): the open script file's trigger and effect blocks,
// wrapped by the core so that nothing in them runs, go through the plugin's `run` job; the
// `error.log` lines the game writes while it reads them go to Problems on the file, as "Etch game
// check". On request, and on save with `etch.liveGame.checkOnSave`.
import * as vscode from 'vscode';
import { assignCheckLines, checkFolderOf, mapCheckErrors, planCheck } from '@etch/core';
import type { LiveGame } from './live-game.ts';
import { MAX_SCRIPT } from './run-script.ts';

export const CHECK_FILE = 'etch.checkFileInLiveGame';
/** The Problems source of a check's lines. */
export const CHECK_SOURCE = 'Etch game check';
const CHECK_ON_SAVE = 'checkOnSave';

/** The wrapper of the largest block adds a few lines; a run file stays under the plugin's cap. */
const CHUNK_CHARS = MAX_SCRIPT - 1024;

export function registerCheckFile(
  context: vscode.ExtensionContext,
  game: LiveGame,
  output: vscode.LogOutputChannel,
): void {
  const problems = vscode.languages.createDiagnosticCollection('etch-live-check');
  context.subscriptions.push(
    problems,
    vscode.commands.registerCommand(CHECK_FILE, async (uri?: vscode.Uri) => {
      const document =
        uri instanceof vscode.Uri
          ? await vscode.workspace.openTextDocument(uri)
          : vscode.window.activeTextEditor?.document;
      if (document === undefined) {
        void vscode.window.showInformationMessage('Open a script file to check.');
        return;
      }
      await checkFile(game, problems, output, document, false);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!vscode.workspace.getConfiguration('etch.liveGame').get<boolean>(CHECK_ON_SAVE, false)) {
        return;
      }
      if (document.uri.scheme !== 'file' || checkFolderOf(document.uri.fsPath) === undefined) {
        return;
      }
      if (!game.canRun) return;
      void checkFile(game, problems, output, document, true);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      // The lines Problems point at moved; the next check sets them again.
      if (e.contentChanges.length > 0) problems.delete(e.document.uri);
    }),
  );
}

/**
 * Checks one file. `quiet` (on save) says nothing when the check finds nothing or cannot run;
 * the command says why it did not check.
 */
async function checkFile(
  game: LiveGame,
  problems: vscode.DiagnosticCollection,
  output: vscode.LogOutputChannel,
  document: vscode.TextDocument,
  quiet: boolean,
): Promise<void> {
  const say = (text: string, warn = false): void => {
    if (quiet) return;
    if (warn) void vscode.window.showWarningMessage(text);
    else void vscode.window.showInformationMessage(text);
  };
  const folder = checkFolderOf(document.uri.fsPath);
  if (folder === undefined) {
    say(
      'Check File checks the .txt files of events, decisions, missions, ' +
        'common/scripted_effects and common/scripted_triggers.',
    );
    return;
  }
  if (!game.canRun) {
    if (quiet) return;
    const start = 'Start the Live Game';
    const answer = await vscode.window.showInformationMessage(
      'Check File needs the live game: start it and load a save first.',
      start,
    );
    if (answer === start) void vscode.commands.executeCommand('etch.startLiveGame');
    return;
  }
  const screen = await game.onScreen();
  if (screen === undefined) {
    say('The live game does not answer; try again in a moment.', true);
    return;
  }
  if (!screen.inGame) {
    say('The live game is in the main menu: load a save or start a game first.');
    return;
  }
  const text = document.getText();
  const version = document.version;
  const plan = planCheck(text, folder, CHUNK_CHARS);
  if (plan.kind === 'refused') {
    problems.delete(document.uri);
    if (plan.code === 'syntax') {
      say(
        `Not checked: ${plan.message}${plan.line === undefined ? '' : ` (line ${String(plan.line)})`}. ` +
          'The game would read the rest of the file wrong.',
        true,
      );
    } else {
      say('Not checked: the file has no trigger or effect blocks.');
    }
    return;
  }
  const outcome = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Checking the file in the live game' },
    () => game.checkScripts(plan.chunks.map((chunk) => chunk.text)),
  );
  if (outcome.kind === 'refused') {
    output.warn(`Check File: not checked, ${outcome.code}: ${outcome.message}`);
    say(
      outcome.code === 'not_available'
        ? `The live game does not check scripts here: ${outcome.message}.`
        : outcome.code === 'busy'
          ? 'The live game is busy with a reload; check the file again in a moment.'
          : `The live game did not check the file: ${outcome.message}.`,
      true,
    );
    return;
  }
  if (document.version !== version) {
    // Edited while the game read it: the lines the game names are no longer the file's.
    problems.delete(document.uri);
    say('The file changed during the check; check it again.');
    return;
  }
  const diagnostics: vscode.Diagnostic[] = [];
  let unplaced = 0;
  let lost = 0;
  const lines = assignCheckLines(outcome.runs);
  outcome.runs.forEach((run, i) => {
    const chunk = plan.chunks[i];
    if (chunk === undefined) return;
    lost += run.lost;
    for (const error of mapCheckErrors(lines[i] ?? [], chunk, text)) {
      if (error.line === undefined) {
        unplaced++;
        output.info(`Check File, error.log (not about this file): ${error.message}`);
        continue;
      }
      const line = Math.min(error.line - 1, document.lineCount - 1);
      const range =
        error.column === undefined
          ? document.lineAt(line).range
          : new vscode.Range(line, error.column.start, line, error.column.end);
      const d = new vscode.Diagnostic(
        range,
        `${error.message}${error.count > 1 ? ` (×${String(error.count)})` : ''}`,
        vscode.DiagnosticSeverity.Error,
      );
      d.source = CHECK_SOURCE;
      d.code = 'game-error-log';
      diagnostics.push(d);
      output.warn(`Check File, line ${String(error.line)}: ${error.message}`);
    }
  });
  problems.set(document.uri, diagnostics);
  const blocks = plan.chunks.reduce((sum, chunk) => sum + chunk.blocks.length, 0);
  const lostNote =
    lost > 0
      ? ` ${String(lost)} characters have no byte in the game's code page and were checked as "?".`
      : '';
  const unplacedNote =
    unplaced > 0
      ? ` ${String(unplaced)} other error.log lines came meanwhile; they are in the Etch output.`
      : '';
  if (diagnostics.length > 0) {
    say(
      `The game found ${String(diagnostics.length)} problems in ${String(blocks)} blocks; they are in Problems.${unplacedNote}${lostNote}`,
      true,
    );
  } else {
    say(`The game found nothing in ${String(blocks)} blocks.${unplacedNote}${lostNote}`);
  }
}
