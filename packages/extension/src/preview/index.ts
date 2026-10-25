import * as vscode from 'vscode';
import { START_GAME_HOST, type GameHost } from '../game-host/index.ts';
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
/** Turns the diff view on or off (spec section 5). */
export const TOGGLE_DIFF_VIEW = 'etch.toggleDiffView';

/**
 * Starts the preview and its commands. The preview decides the previewed window of the widget
 * outline while it is open, and clicks, hovers and highlights pass through `navigation`.
 */
export function registerPreview(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  navigation: WidgetNavigation,
  gameHost?: GameHost,
): PreviewApi {
  const preview = new Preview(
    context.extensionUri,
    output,
    navigation,
    context.globalState,
    gameHost,
  );
  context.subscriptions.push(
    preview,
    vscode.commands.registerCommand(OPEN_PREVIEW, () => {
      preview.open();
    }),
    vscode.commands.registerCommand(TOGGLE_PREVIEW_PIN, () => {
      preview.togglePin();
    }),
    // A diff view that cannot show stays off, and the command says why, as the disabled toggle does.
    vscode.commands.registerCommand(TOGGLE_DIFF_VIEW, () => {
      const { on, blocked } = preview.diff;
      if (!on && blocked !== undefined) void vscode.window.showInformationMessage(blocked);
      else preview.setDiffView(!on);
    }),
    // The game host starts at a switch of the preview to it (spec section 4).
    vscode.commands.registerCommand(START_GAME_HOST, () => {
      preview.open();
      preview.setBackend('game-host');
    }),
    vscode.commands.registerCommand(CHOOSE_RESOLUTION, () => chooseResolution(preview)),
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
