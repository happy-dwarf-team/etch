import * as vscode from 'vscode';
import { START_LIVE_GAME, type LiveGame, type PickMode } from '../live-game/index.ts';
import type { WidgetNavigation } from '../navigation.ts';
import { CHOOSE_RESOLUTION, PREVIEW_VIEW_TYPE, Preview, type PreviewApi } from './preview.ts';
import { chooseResolution } from './resolution.ts';

export type { PreviewApi, PreviewPaint, PreviewRender, SourceText } from './preview.ts';
export type { PreviewMemento } from './protocol.ts';
export {
  CHOOSE_RESOLUTION,
  PREVIEW_OPEN_CONTEXT,
  PREVIEW_VIEW_TYPE,
  RESOLUTION_SETTING,
} from './preview.ts';
export { writeResolution } from './resolution.ts';

/** Opens the preview beside the editor (the editor title of a `.gui` file shows it). */
export const OPEN_PREVIEW = 'etch.openPreview';
/** Pins the previewed window, so that the preview stays on it while other files are edited. */
export const TOGGLE_PREVIEW_PIN = 'etch.togglePreviewPin';
/** Takes a live snapshot of the previewed window from the live game (spec section 7). */
export const SNAPSHOT_FROM_LIVE_GAME = 'etch.snapshotFromLiveGame';

/**
 * Starts the preview and its commands. The preview decides the previewed window of the widget
 * outline while it is open, and clicks, hovers and highlights pass through `navigation`.
 */
export function registerPreview(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  navigation: WidgetNavigation,
  liveGame?: LiveGame,
  pickMode?: PickMode,
): PreviewApi {
  const preview = new Preview(
    context.extensionUri,
    output,
    navigation,
    context.globalState,
    liveGame,
    pickMode,
    context.storageUri?.fsPath,
  );
  context.subscriptions.push(
    preview,
    vscode.commands.registerCommand(OPEN_PREVIEW, () => {
      preview.open();
    }),
    vscode.commands.registerCommand(TOGGLE_PREVIEW_PIN, () => {
      preview.togglePin();
    }),
    // The live game starts with the previewed file's playset (spec section 2).
    vscode.commands.registerCommand(START_LIVE_GAME, () => {
      preview.open();
      preview.startLiveGame();
    }),
    vscode.commands.registerCommand(CHOOSE_RESOLUTION, () => chooseResolution(preview)),
    vscode.commands.registerCommand(SNAPSHOT_FROM_LIVE_GAME, async () => {
      if (preview.current === undefined) {
        void vscode.window.showInformationMessage(
          'A live snapshot is of the previewed window: open the preview on it first.',
        );
        return;
      }
      await preview.takeSnapshot();
    }),
    // Reopens the preview after a window reload (`onWebviewPanel:etch.preview` activates Etch).
    vscode.window.registerWebviewPanelSerializer(PREVIEW_VIEW_TYPE, {
      deserializeWebviewPanel(panel, state: unknown) {
        preview.restore(panel, state);
        return Promise.resolve();
      },
    }),
  );
  return preview;
}
