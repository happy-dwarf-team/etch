// The Run selection commands (lab#156): the selected script, or the statement on the cursor's line,
// runs in the live game through Etch's plugin and the game's console `run`; the answer and the
// run's `error.log` lines come back to the editor.
import * as vscode from 'vscode';
import type { LiveGame, RunOutcome } from './live-game.ts';
import { blockAtLine, mapRunErrors, type RunMode, type RunScope } from './run-script.ts';

/** Runs the selection's effects in the player's country. */
export const RUN_SELECTION = 'etch.runSelection';
/** Runs them in the province on screen, wrapped in `<id> = { … }`. */
export const RUN_SELECTION_IN_PROVINCE = 'etch.runSelectionInProvince';
/** Checks the selection as a trigger and shows whether it is true. */
export const CHECK_SELECTION_AS_TRIGGER = 'etch.checkSelectionAsTrigger';
/** Set while a live game is ready to take a Run: the editor's context menu shows the commands. */
export const CAN_RUN_CONTEXT = 'etch.liveGame.canRun';

/** The notice of a game session's first Run (lab#65). */
const PRIVATE_COPY_NOTICE =
  "Run changes the live game's private copy of the game. Your own saves are untouched.";
/**
 * A trigger the game cannot read is left out of the `limit` without stopping the run, so the rest
 * may be true where the selection is not: said with every TRUE that came with errors.
 */
const UNREAD_TRIGGER_NOTE =
  'The game reported errors: a trigger it cannot read is left out and counts as true.';

export function registerRunSelection(
  context: vscode.ExtensionContext,
  game: LiveGame,
  output: vscode.LogOutputChannel,
): void {
  const problems = vscode.languages.createDiagnosticCollection('etch-live-run');
  const run = (mode: RunMode, where: 'country' | 'province' | 'ask') => () =>
    runSelection(game, problems, output, mode, where);
  context.subscriptions.push(
    problems,
    vscode.commands.registerCommand(RUN_SELECTION, run('effect', 'country')),
    vscode.commands.registerCommand(RUN_SELECTION_IN_PROVINCE, run('effect', 'province')),
    vscode.commands.registerCommand(CHECK_SELECTION_AS_TRIGGER, run('trigger', 'ask')),
    vscode.workspace.onDidChangeTextDocument((e) => {
      // The lines Problems point at moved; the next Run sets them again.
      if (e.contentChanges.length > 0) problems.delete(e.document.uri);
    }),
  );
}

async function runSelection(
  game: LiveGame,
  problems: vscode.DiagnosticCollection,
  output: vscode.LogOutputChannel,
  mode: RunMode,
  where: 'country' | 'province' | 'ask',
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor === undefined) {
    void vscode.window.showInformationMessage('Open a script file and select what to run.');
    return;
  }
  const document = editor.document;
  let range: vscode.Range = editor.selection;
  if (editor.selection.isEmpty) {
    const text = document.getText();
    const line = document.lineAt(editor.selection.active.line);
    const block = blockAtLine(text, document.offsetAt(line.range.start));
    if (block === undefined) {
      void vscode.window.showInformationMessage(
        'Select the script to run, or put the cursor on the line where a statement starts.',
      );
      return;
    }
    range = new vscode.Range(document.positionAt(block.start), document.positionAt(block.end));
    editor.selection = new vscode.Selection(range.start, range.end);
  }
  if (!game.canRun) {
    const start = 'Start the Live Game';
    const answer = await vscode.window.showInformationMessage(
      'Run needs the live game: start it and load a save first.',
      start,
    );
    if (answer === start) void vscode.commands.executeCommand('etch.startLiveGame');
    return;
  }
  const screen = await game.onScreen();
  if (screen === undefined) {
    void vscode.window.showWarningMessage('The live game does not answer; try again in a moment.');
    return;
  }
  if (!screen.inGame) {
    void vscode.window.showInformationMessage(
      'The live game is in the main menu: load a save or start a game first.',
    );
    return;
  }
  let scope: RunScope = { kind: 'country' };
  const province = screen.province?.province;
  if (where === 'province') {
    if (province === undefined) {
      void vscode.window.showInformationMessage(
        'No province is on screen: open a province in the live game first.',
      );
      return;
    }
    scope = { kind: 'province', province };
  } else if (where === 'ask' && province !== undefined) {
    const chosen = await vscode.window.showQuickPick(
      [
        { label: '$(globe) Your country', scope: { kind: 'country' } as RunScope },
        {
          label: `$(location) Province ${String(province)}`,
          description: 'the province on screen',
          scope: { kind: 'province', province } as RunScope,
        },
      ],
      { title: 'Check as trigger', placeHolder: 'Which scope is the trigger checked in?' },
    );
    if (chosen === undefined) return;
    scope = chosen.scope;
  }
  const selection = document.getText(range);
  const outcome = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title:
        mode === 'trigger' ? 'Checking the trigger in the live game' : 'Running in the live game',
    },
    () => game.runScript(selection, scope, mode),
  );
  show(outcome, { document, range, selection, scope, mode, problems, output });
}

interface Shown {
  readonly document: vscode.TextDocument;
  readonly range: vscode.Range;
  readonly selection: string;
  readonly scope: RunScope;
  readonly mode: RunMode;
  readonly problems: vscode.DiagnosticCollection;
  readonly output: vscode.LogOutputChannel;
}

function scopeName(scope: RunScope): string {
  return scope.kind === 'province' ? `province ${String(scope.province)}` : 'your country';
}

function show(outcome: RunOutcome, shown: Shown): void {
  const { document, range, selection, scope, mode, problems, output } = shown;
  if (outcome.kind === 'refused') {
    problems.delete(document.uri);
    const text =
      outcome.code === 'not_available'
        ? `The live game does not run scripts here: ${outcome.message}.`
        : outcome.code === 'busy'
          ? 'The live game is busy with a reload; run the selection again in a moment.'
          : `The live game did not run the selection: ${outcome.message}.`;
    void vscode.window.showWarningMessage(text);
    return;
  }
  if (outcome.firstInSession) void vscode.window.showInformationMessage(PRIVATE_COPY_NOTICE);
  const lineCount = selection.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').length;
  const errors = mapRunErrors(outcome.errors, outcome.script, lineCount);
  const diagnostics = errors.map((e) => {
    const line = range.start.line + (e.selectionLine ?? 0);
    const at = document.lineAt(Math.min(line, document.lineCount - 1)).range;
    const d = new vscode.Diagnostic(
      e.selectionLine === undefined ? range : at,
      `error.log: ${e.line}${e.count > 1 ? ` (×${String(e.count)})` : ''}`,
      vscode.DiagnosticSeverity.Error,
    );
    d.source = 'Etch live game';
    d.code = 'game-error-log';
    return d;
  });
  problems.set(document.uri, diagnostics);
  for (const e of errors) output.warn(`Run, error.log: ${e.line}`);
  const lost =
    outcome.lost > 0
      ? ` ${String(outcome.lost)} characters have no byte in the game's code page and were run as "?".`
      : '';
  const errorNote =
    errors.length > 0 ? ` ${String(errors.length)} error.log lines are in Problems.` : '';
  if (!outcome.answer.success) {
    void vscode.window.showErrorMessage(
      `The game's console did not run the selection: ${outcome.answer.text || 'no answer'}.${errorNote}`,
    );
    return;
  }
  if (mode === 'effect') {
    const text = `Ran in ${scopeName(scope)}.${errorNote}${lost}`;
    if (errors.length > 0 || outcome.lost > 0) void vscode.window.showWarningMessage(text);
    else void vscode.window.showInformationMessage(text);
    return;
  }
  if (outcome.check === undefined) {
    void vscode.window.showWarningMessage(
      `The trigger gave no answer in ${scopeName(scope)}: the game logged neither TRUE nor FALSE.${errorNote}${lost}`,
    );
    return;
  }
  const answer = `The trigger is ${outcome.check ? 'TRUE' : 'FALSE'} in ${scopeName(scope)}.`;
  if (errors.length > 0) {
    void vscode.window.showWarningMessage(
      `${answer}${outcome.check ? ` ${UNREAD_TRIGGER_NOTE}` : ''}${errorNote}${lost}`,
    );
  } else if (outcome.lost > 0) {
    void vscode.window.showWarningMessage(`${answer}${lost}`);
  } else {
    void vscode.window.showInformationMessage(answer);
  }
}
