import { mkdir } from 'node:fs/promises';
import * as vscode from 'vscode';
import { LiveGame, type LiveGameState } from './live-game.ts';
import { PrivateInstallError } from './install.ts';

export type { LiveGameDisplay, LiveGameMod, PreparedInstall } from './install.ts';
export { PrivateInstallError } from './install.ts';
export { LiveGame, PrivateInstall, type LiveGameRequest, type LiveGameState } from './live-game.ts';

/** Starts the live game with the preview's playset (spec section 2). */
export const START_LIVE_GAME = 'etch.startLiveGame';
/** Stops the live game. */
export const STOP_LIVE_GAME = 'etch.stopLiveGame';
/** Removes the private install (spec section 2). */
export const REMOVE_PRIVATE_INSTALL = 'etch.removePrivateInstall';
/** Opens the live game's saves folder (spec section 6). */
export const OPEN_LIVE_GAME_SAVES = 'etch.openLiveGameSaves';

/**
 * Creates the live game's owner and registers the commands that stop it, open its saves and remove
 * its install; the preview registers the start command, which starts it with the preview's playset.
 * While the live game runs, the status bar offers to stop it, so that the player can start their
 * own game (Steam refuses it beside the live game, H11). Removes Etch 1.x's game host install,
 * saying so once (ADR 0005).
 */
export function registerLiveGame(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): LiveGame {
  const game = new LiveGame(
    context.globalStorageUri.fsPath,
    vscode.Uri.joinPath(context.extensionUri, 'game').fsPath,
    output,
    context.globalState,
  );
  const status = vscode.window.createStatusBarItem('etch.liveGame', vscode.StatusBarAlignment.Left);
  status.name = 'Etch Live Game';
  context.subscriptions.push(
    game,
    status,
    game.onDidChangeState((state) => {
      showState(state);
      showStatus(status, state);
    }),
    vscode.commands.registerCommand(OPEN_LIVE_GAME_SAVES, async () => {
      await mkdir(game.savesFolder, { recursive: true });
      await vscode.env.openExternal(vscode.Uri.file(game.savesFolder));
    }),
    vscode.commands.registerCommand(STOP_LIVE_GAME, async () => {
      if (!(await game.stop())) {
        void vscode.window.showInformationMessage('The live game is not running.');
      }
    }),
    vscode.commands.registerCommand(REMOVE_PRIVATE_INSTALL, async () => {
      try {
        const removed = await game.removeInstall();
        void vscode.window.showInformationMessage(
          removed ? 'The private install was removed.' : 'There is no private install.',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.error(`Private install not removed: ${message}`);
        void vscode.window.showErrorMessage(
          error instanceof PrivateInstallError
            ? message
            : `The private install could not be removed: ${message}`,
        );
      }
    }),
  );
  void game.closeOrphan().then(() => removeGameHostInstall(game, output));
  return game;
}

/** The status bar item: while the live game runs or starts, a click stops it. */
function showStatus(status: vscode.StatusBarItem, state: LiveGameState): void {
  const text: Partial<Record<LiveGameState['status'], string>> = {
    starting: '$(loading~spin) Live game starting',
    ready: '$(debug-stop) Live game',
    restarting: '$(loading~spin) Live game restarting',
    stopping: '$(loading~spin) Live game stopping',
  };
  const shown = text[state.status];
  if (shown === undefined) {
    status.hide();
    return;
  }
  status.text = shown;
  status.tooltip =
    state.status === 'stopping'
      ? 'Etch saves the live game and closes it.'
      : 'Etch: Stop the Live Game: saves it and closes it, so that you can play your own game.';
  status.command = state.status === 'stopping' ? undefined : STOP_LIVE_GAME;
  status.show();
}

/** What the live game says when its state changes; a start or a stop says nothing. */
function showState(state: LiveGameState): void {
  switch (state.status) {
    case 'ready':
      void vscode.window.showInformationMessage(
        `The live game is ready (after ${(state.readyMs / 1000).toFixed(1)} s).`,
      );
      break;
    case 'restarting':
      void vscode.window.showWarningMessage(`The live game restarts: ${state.reason}.`);
      break;
    case 'busy':
      void vscode.window.showWarningMessage(
        'Another VS Code window runs the live game; Etch runs one per machine.',
      );
      break;
    case 'failed':
      void vscode.window.showErrorMessage(`The live game is not running: ${state.message}`);
      break;
    default:
      break;
  }
}

/**
 * Removes a 1.x game host install on activation, with one notice. A 1.x window that still runs
 * its game host, or a removal that fails, leaves it for the next activation.
 */
async function removeGameHostInstall(
  game: LiveGame,
  output: vscode.LogOutputChannel,
): Promise<void> {
  try {
    if (!(await game.removeGameHostInstall())) return;
    void vscode.window.showInformationMessage(
      'Etch 2 has no game host: the live game replaces it. Its install in Etch’s storage was ' +
        'removed; your game folder, profile and mods were not changed.',
    );
  } catch (error) {
    output.error(`Etch 1.x's game host install was not removed: ${String(error)}`);
  }
}
