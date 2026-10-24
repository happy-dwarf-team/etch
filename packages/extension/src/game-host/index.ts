import * as vscode from 'vscode';
import {
  GameHostInstallError,
  copySize,
  gameHostLayout,
  installExists,
  prepareInstall,
  removeInstall,
  type GameHostLayout,
  type GameHostMod,
  type PreparedInstall,
} from './install.ts';

export type { GameHostMod, PreparedInstall } from './install.ts';
export { GameHostInstallError } from './install.ts';

/** Removes the game host install (spec section 2). */
export const REMOVE_GAME_HOST_INSTALL = 'etch.removeGameHostInstall';

/**
 * The game host install in the extension's global storage: created on first use after one
 * confirmation, checked and brought up to date before every start, and removed by command. One
 * operation runs at a time.
 */
export class GameHostInstall {
  readonly layout: GameHostLayout;
  private readonly buildsFolder: string;
  private readonly output: vscode.LogOutputChannel;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(storageFolder: string, buildsFolder: string, output: vscode.LogOutputChannel) {
    this.layout = gameHostLayout(storageFolder);
    this.buildsFolder = buildsFolder;
    this.output = output;
  }

  /**
   * The install ready for a start with this playset, or `undefined` when the player declined to
   * create it. Throws `GameHostInstallError` when it cannot be used, such as for an `eu4.exe` other
   * than the pinned build.
   */
  prepare(gameFolder: string, mods: readonly GameHostMod[]): Promise<PreparedInstall | undefined> {
    return this.serial(async () => {
      if (!(await installExists(this.layout)) && !(await this.confirmCreate(gameFolder))) {
        return undefined;
      }
      const started = performance.now();
      const prepared = await prepareInstall({
        layout: this.layout,
        gameFolder,
        buildsFolder: this.buildsFolder,
        mods,
      });
      if (prepared.restored.length > 0) {
        this.output.warn(`Game host install: installed again ${prepared.restored.join(', ')}`);
      }
      this.output.info(
        `Game host install ready in ${String(Math.round(performance.now() - started))} ms: ${this.layout.root}`,
      );
      return prepared;
    });
  }

  /** Removes the install; false when there was none. */
  remove(): Promise<boolean> {
    return this.serial(async () => {
      const removed = await removeInstall(this.layout);
      if (removed) this.output.info(`Game host install removed: ${this.layout.root}`);
      return removed;
    });
  }

  private async confirmCreate(gameFolder: string): Promise<boolean> {
    const megabytes = Math.ceil((await copySize(gameFolder)) / 1e6);
    const create = 'Create';
    const answer = await vscode.window.showInformationMessage(
      'Create the game host install?',
      {
        modal: true,
        detail:
          `The game host runs a private copy of EU4 in Etch's storage: links to the game's folders, ` +
          `a copy of its top-level files (about ${String(megabytes)} MB), Anvil, Bellows and Etch's ` +
          `plugin, and a profile of its own. Your game folder, profile and mods are not changed. ` +
          `Etch: Remove the Game Host Install removes it again.`,
      },
      create,
    );
    return answer === create;
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Creates the game host install's owner and registers its command. */
export function registerGameHostInstall(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): GameHostInstall {
  const install = new GameHostInstall(
    context.globalStorageUri.fsPath,
    vscode.Uri.joinPath(context.extensionUri, 'game').fsPath,
    output,
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(REMOVE_GAME_HOST_INSTALL, async () => {
      try {
        const removed = await install.remove();
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
  return install;
}
