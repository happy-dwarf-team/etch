import * as vscode from 'vscode';
import { SUPPORTED_GAME_VERSION } from '@etch/core';
import { BuildCheck } from './build-check.ts';
import { RUNNING_BUILD } from './build-stamp.ts';
import { registerLiveGame, type LiveGame, type PickMode } from './live-game/index.ts';
import { closeWindowsHelper } from './live-game/windows.ts';
import { registerGameText } from './game-text.ts';
import { WidgetNavigation } from './navigation.ts';
import { registerPreview, type PreviewApi } from './preview/index.ts';

/** What `activate` returns: for Etch's own tests, not a stable API for other extensions. */
export interface EtchApi {
  readonly navigation: WidgetNavigation;
  readonly preview: PreviewApi;
  readonly liveGame: LiveGame;
  readonly pickMode: PickMode;
}

let liveGame: LiveGame | undefined;

export function activate(context: vscode.ExtensionContext): EtchApi {
  const { version } = context.extension.packageJSON as { version: string };
  const output = vscode.window.createOutputChannel('Etch', { log: true });
  context.subscriptions.push(output);
  // The commit names the build: a VSIX of the same version can replace the files of this one.
  output.info(
    `Etch ${version} (${RUNNING_BUILD?.commit ?? 'dev'}) for EU4 ${SUPPORTED_GAME_VERSION}`,
  );
  context.subscriptions.push(registerGameText());
  const navigation = new WidgetNavigation();
  context.subscriptions.push(navigation);
  const live = registerLiveGame(context, output);
  liveGame = live.game;
  if (RUNNING_BUILD !== undefined) {
    const build = new BuildCheck(RUNNING_BUILD, context.extensionUri, output);
    context.subscriptions.push(
      build,
      live.game.onDidChangeState((state) => {
        if (state.status === 'starting') void build.check();
      }),
    );
  }
  return {
    navigation,
    preview: registerPreview(context, output, navigation, live.game, live.pick),
    liveGame: live.game,
    pickMode: live.pick,
  };
}

/** The live game stops when the window closes (spec section 6); VS Code waits for it. */
export async function deactivate(): Promise<void> {
  await liveGame?.stop();
  closeWindowsHelper();
  // Everything else Etch creates is disposed through context.subscriptions.
}
