import * as vscode from 'vscode';
import { SUPPORTED_GAME_VERSION } from '@etch/core';
import { registerLiveGame, type LiveGame } from './live-game/index.ts';
import { closeWindowsHelper } from './live-game/windows.ts';
import { registerGameText } from './game-text.ts';
import { WidgetNavigation } from './navigation.ts';
import { registerPreview, type PreviewApi } from './preview/index.ts';

/** What `activate` returns: for Etch's own tests, not a stable API for other extensions. */
export interface EtchApi {
  readonly navigation: WidgetNavigation;
  readonly preview: PreviewApi;
  readonly liveGame: LiveGame;
}

let liveGame: LiveGame | undefined;

export function activate(context: vscode.ExtensionContext): EtchApi {
  const { version } = context.extension.packageJSON as { version: string };
  const output = vscode.window.createOutputChannel('Etch', { log: true });
  context.subscriptions.push(output);
  output.info(`Etch ${version} for EU4 ${SUPPORTED_GAME_VERSION}`);
  context.subscriptions.push(registerGameText());
  const navigation = new WidgetNavigation();
  context.subscriptions.push(navigation);
  liveGame = registerLiveGame(context, output);
  return {
    navigation,
    preview: registerPreview(context, output, navigation, liveGame),
    liveGame,
  };
}

/** The live game stops when the window closes (spec section 6); VS Code waits for it. */
export async function deactivate(): Promise<void> {
  await liveGame?.stop();
  closeWindowsHelper();
  // Everything else Etch creates is disposed through context.subscriptions.
}
