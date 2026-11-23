import * as vscode from 'vscode';

/**
 * Etch's notifications, in one place (etch#648, finding P1.1): one short sentence first, which
 * the collapsed toast shows whole, and a button for the next step where there is one. Details
 * belong in the Etch log. A modal dialog that asks before acting stays a dialog.
 */
export type NotifyKind = 'info' | 'warning' | 'error';

/** A button of a notification: its label and what a click does. */
export interface NotifyAction {
  readonly label: string;
  readonly run?: () => unknown;
}

function command(label: string, id: string, ...args: unknown[]): NotifyAction {
  return { label, run: () => vscode.commands.executeCommand(id, ...args) };
}

/** The next steps the notifications share. */
export const ACTIONS = {
  startLiveGame: command('Start the Live Game', 'etch.startLiveGame'),
  setGameFolder: command('Set the Game Folder…', 'workbench.action.openSettings', 'etch.gamePath'),
  openPreview: command('Open Preview', 'etch.openPreview'),
  openFolder: command('Open Folder…', 'workbench.action.files.openFolder'),
  showProblems: command('Show Problems', 'workbench.actions.view.problems'),
  reloadWindow: command('Reload Window', 'workbench.action.reloadWindow'),
} as const;

/** Shows the Etch log the details went to. */
export function showOutput(output: { show(preserveFocus?: boolean): void }): NotifyAction {
  return {
    label: 'Show Output',
    run: () => {
      output.show(true);
    },
  };
}

/**
 * Shows a notification and runs the button the user clicks. Resolves to that button, or to
 * `undefined` when the notification is closed without one.
 */
export async function notify(
  kind: NotifyKind,
  text: string,
  ...actions: readonly NotifyAction[]
): Promise<NotifyAction | undefined> {
  const labels = actions.map((a) => a.label);
  const chosen =
    kind === 'error'
      ? await vscode.window.showErrorMessage(text, ...labels)
      : kind === 'warning'
        ? await vscode.window.showWarningMessage(text, ...labels)
        : await vscode.window.showInformationMessage(text, ...labels);
  const action = actions.find((a) => a.label === chosen);
  await action?.run?.();
  return action;
}
