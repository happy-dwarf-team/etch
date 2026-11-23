import { mkdir } from 'node:fs/promises';
import * as vscode from 'vscode';
import { LiveGame, type LiveGameState } from './live-game.ts';
import { PrivateInstallError } from './install.ts';
import { PICK_KEY_SETTING, PickMode, TOGGLE_PICK_MODE, pickKeySetting } from './pick-mode.ts';
import { CAN_RUN_CONTEXT, registerRunSelection } from './run-selection.ts';
import { registerCheckFile } from './check-file.ts';
import {
  liveMenu,
  liveStatus,
  pickStatus,
  spokenText,
  type LiveMenuAction,
  type StatusText,
} from './status-view.ts';

export type { LiveGameDisplay, LiveGameMod, PreparedInstall } from './install.ts';
export { PrivateInstallError } from './install.ts';
export { LiveGame, PrivateInstall, type LiveGameRequest, type LiveGameState } from './live-game.ts';
export { PickMode, pickKeySetting, type PickOpened } from './pick-mode.ts';

/** Starts the live game with the preview's playset (spec section 2). */
export const START_LIVE_GAME = 'etch.startLiveGame';
/** Stops the live game. */
export const STOP_LIVE_GAME = 'etch.stopLiveGame';
/** Removes the private install (spec section 2). */
export const REMOVE_PRIVATE_INSTALL = 'etch.removePrivateInstall';
/** Opens the live game's saves folder (spec section 6). */
export const OPEN_LIVE_GAME_SAVES = 'etch.openLiveGameSaves';
/** Restarts the live game: the menu's and the planned restart notice's. */
export const RESTART_LIVE_GAME = 'etch.restartLiveGame';
/** Opens the live game's menu: the click on its status bar item (etch#648, P2.7). */
export const LIVE_GAME_MENU = 'etch.liveGameMenu';
/**
 * Set while the live game starts, runs, restarts or stops, so that the Command Palette offers
 * **Stop** then and **Start** otherwise (etch#648, P1.2); `etch.liveGame.canRun` is set while it
 * takes commands.
 */
export const RUNNING_CONTEXT = 'etch.liveGame.running';
/** The preview's command, which takes a live snapshot of the previewed window. */
const SNAPSHOT_FROM_LIVE_GAME = 'etch.snapshotFromLiveGame';
/** How long a texture file must stay unchanged before it is reloaded: editors write in steps. */
const TEXTURE_SETTLE_MS = 300;

/**
 * Creates the live game's owner and registers the commands that stop it, open its saves and remove
 * its install; the preview registers the start command, which starts it with the preview's playset.
 * While the live game runs, its status bar item opens a menu that also stops it, so that the
 * player can start their own game (Steam refuses it beside the live game, H11). Removes Etch 1.x's
 * game host install, saying so once (ADR 0005).
 */
export function registerLiveGame(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): { game: LiveGame; pick: PickMode } {
  const game = new LiveGame(
    context.globalStorageUri.fsPath,
    vscode.Uri.joinPath(context.extensionUri, 'game').fsPath,
    output,
    context.globalState,
  );
  const pick = new PickMode(game, output);
  // Left of the other items; the pick mode item left of the live game's.
  const status = vscode.window.createStatusBarItem(
    'etch.liveGame',
    vscode.StatusBarAlignment.Left,
    50,
  );
  status.name = 'Etch Live Game';
  status.command = LIVE_GAME_MENU;
  const pickItem = vscode.window.createStatusBarItem(
    'etch.pickMode',
    vscode.StatusBarAlignment.Left,
    51,
  );
  pickItem.name = 'Etch Pick Mode';
  pickItem.command = TOGGLE_PICK_MODE;
  const showItems = (): void => {
    show(status, liveStatus(game.state));
    show(pickItem, pickStatus(game.state, pick.isOn, pickKeySetting()));
  };
  context.subscriptions.push(
    game,
    pick,
    status,
    pickItem,
    game.onDidChangeState((state) => {
      showState(state);
      showItems();
      void vscode.commands.executeCommand(
        'setContext',
        CAN_RUN_CONTEXT,
        state.status === 'ready' || state.status === 'stale',
      );
      void vscode.commands.executeCommand('setContext', RUNNING_CONTEXT, isRunning(state));
    }),
    pick.onDidChange(showItems),
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration(`etch.${PICK_KEY_SETTING}`)) showItems();
    }),
    vscode.commands.registerCommand(LIVE_GAME_MENU, () => openMenu(game, pick, output)),
    vscode.commands.registerCommand(RESTART_LIVE_GAME, () => game.restartNow()),
    // Each saved file of the playset goes to the reload policy (spec section 6): text files as
    // VS Code saves them, textures as an image editor writes them into the workspace.
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme === 'file') void game.fileSaved(document.uri.fsPath);
    }),
    ...watchTextures(game),
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
  registerRunSelection(context, game, output);
  registerCheckFile(context, game, output);
  void game.closeOrphan().then(() => removeGameHostInstall(game, output));
  return { game, pick };
}

/** Textures written into the workspace, each reloaded once it stays unchanged for a moment. */
function watchTextures(game: LiveGame): vscode.Disposable[] {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{dds,tga,png,DDS,TGA,PNG}');
  const waiting = new Map<string, NodeJS.Timeout>();
  const changed = (uri: vscode.Uri): void => {
    if (game.state.status !== 'ready' && game.state.status !== 'stale') return;
    const key = uri.fsPath.toLowerCase();
    clearTimeout(waiting.get(key));
    waiting.set(
      key,
      setTimeout(() => {
        waiting.delete(key);
        void game.fileSaved(uri.fsPath);
      }, TEXTURE_SETTLE_MS),
    );
  };
  return [
    watcher,
    watcher.onDidChange(changed),
    watcher.onDidCreate(changed),
    new vscode.Disposable(() => {
      waiting.forEach((timer) => {
        clearTimeout(timer);
      });
    }),
  ];
}

/** Whether a live game starts, runs, restarts or stops in this window. */
function isRunning(state: LiveGameState): boolean {
  return (
    state.status === 'starting' ||
    state.status === 'ready' ||
    state.status === 'stale' ||
    state.status === 'restarting' ||
    state.status === 'stopping'
  );
}

/** Shows a status bar item with its text, or hides it. */
function show(item: vscode.StatusBarItem, shown: StatusText | undefined): void {
  if (shown === undefined) {
    item.hide();
    return;
  }
  item.text = shown.text;
  item.tooltip = shown.tooltip;
  item.accessibilityInformation = { label: spokenText(shown.text), role: 'button' };
  item.show();
}

/** The live game's menu (`liveMenu`), and what its chosen item does. */
async function openMenu(
  game: LiveGame,
  pick: PickMode,
  output: vscode.LogOutputChannel,
): Promise<void> {
  const request = game.request;
  const menu = liveMenu(game.state, {
    pickOn: pick.isOn,
    pickKey: pickKeySetting(),
    mod: request?.mods.find((mod) => mod.root === request.editedRoot)?.name,
  });
  if (menu === undefined) {
    void vscode.window.showInformationMessage('The live game is not running.');
    return;
  }
  type Item = vscode.QuickPickItem & { readonly action?: LiveMenuAction };
  const items: Item[] = menu.items.map((item) =>
    'separator' in item
      ? { label: '', kind: vscode.QuickPickItemKind.Separator }
      : {
          label: item.label,
          iconPath: new vscode.ThemeIcon(item.icon),
          action: item.action,
          ...(item.description === undefined ? {} : { description: item.description }),
        },
  );
  const chosen = await vscode.window.showQuickPick(items, {
    title: menu.title,
    placeHolder: 'Choose an action',
  });
  switch (chosen?.action) {
    case 'pick':
      await vscode.commands.executeCommand(TOGGLE_PICK_MODE);
      break;
    case 'snapshot':
      await vscode.commands.executeCommand(SNAPSHOT_FROM_LIVE_GAME);
      break;
    case 'saves':
      await vscode.commands.executeCommand(OPEN_LIVE_GAME_SAVES);
      break;
    case 'log':
      output.show(true);
      break;
    case 'restart':
      await vscode.commands.executeCommand(RESTART_LIVE_GAME);
      break;
    case 'stop':
      await vscode.commands.executeCommand(STOP_LIVE_GAME);
      break;
    default:
      break;
  }
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
