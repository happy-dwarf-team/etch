import * as vscode from 'vscode';
import type { WidgetNavigation } from '../navigation.ts';
import { Preview, type PreviewApi } from './preview.ts';

export type { PreviewApi, PreviewPaint, PreviewRender, SourceText } from './preview.ts';
export { DEFAULT_SCREEN, PREVIEW_OPEN_CONTEXT } from './preview.ts';

/** Opens the preview beside the editor (the editor title of a `.gui` file shows it). */
export const OPEN_PREVIEW = 'etch.openPreview';
/** Pins the previewed window, so that the preview stays on it while other files are edited. */
export const TOGGLE_PREVIEW_PIN = 'etch.togglePreviewPin';

/**
 * Starts the preview and its commands. The preview decides the previewed window of the widget
 * outline while it is open, and clicks, hovers and highlights pass through `navigation`.
 */
export function registerPreview(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  navigation: WidgetNavigation,
): PreviewApi {
  const preview = new Preview(context.extensionUri, output, navigation);
  context.subscriptions.push(
    preview,
    vscode.commands.registerCommand(OPEN_PREVIEW, () => {
      preview.open();
    }),
    vscode.commands.registerCommand(TOGGLE_PREVIEW_PIN, () => {
      preview.togglePin();
    }),
  );
  return preview;
}
