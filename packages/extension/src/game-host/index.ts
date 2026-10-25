import * as vscode from 'vscode';
import { GameHost } from './host.ts';
import { GameHostInstallError } from './install.ts';

export type { GameHostMod, HostDisplay, PreparedInstall } from './install.ts';
export { GameHostInstallError } from './install.ts';
export { GameHost, GameHostInstall, type GameHostRequest, type GameHostState } from './host.ts';
export type { JobChange, JobCommand, JobOutcome, PluginTimes } from './jobs.ts';
export { needsRestart } from './watchdog.ts';

/** Starts the game host: switches the preview to it (spec section 2). */
export const START_GAME_HOST = 'etch.startGameHost';
/** Stops the game host. */
export const STOP_GAME_HOST = 'etch.stopGameHost';
/** Removes the game host install (spec section 2). */
export const REMOVE_GAME_HOST_INSTALL = 'etch.removeGameHostInstall';

/**
 * Creates the game host's owner and registers the commands that stop it and remove its install;
 * the preview registers the start command, which switches it to the game host.
 */
export function registerGameHost(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): GameHost {
  const host = new GameHost(
    context.globalStorageUri.fsPath,
    vscode.Uri.joinPath(context.extensionUri, 'game').fsPath,
    output,
  );
  context.subscriptions.push(
    host,
    vscode.commands.registerCommand(STOP_GAME_HOST, async () => {
      if (!(await host.stop())) {
        void vscode.window.showInformationMessage('The game host is not running.');
      }
    }),
    vscode.commands.registerCommand(REMOVE_GAME_HOST_INSTALL, async () => {
      try {
        const removed = await host.removeInstall();
        void vscode.window.showInformationMessage(
          removed ? 'The game host install was removed.' : 'There is no game host install.',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        output.error(`Game host install not removed: ${message}`);
        void vscode.window.showErrorMessage(
          error instanceof GameHostInstallError
            ? message
            : `The game host install could not be removed: ${message}`,
        );
      }
    }),
  );
  void host.closeOrphan();
  return host;
}
