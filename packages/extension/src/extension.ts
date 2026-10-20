import * as vscode from 'vscode';
import { SUPPORTED_GAME_VERSION } from '@etch/core';
import { registerGameText } from './game-text.ts';
import { WidgetNavigation } from './navigation.ts';

/** What `activate` returns: for Etch's own tests, not a stable API for other extensions. */
export interface EtchApi {
  readonly navigation: WidgetNavigation;
}

export function activate(context: vscode.ExtensionContext): EtchApi {
  const { version } = context.extension.packageJSON as { version: string };
  const output = vscode.window.createOutputChannel('Etch', { log: true });
  context.subscriptions.push(output);
  output.info(`Etch ${version} for EU4 ${SUPPORTED_GAME_VERSION}`);
  context.subscriptions.push(registerGameText());
  const navigation = new WidgetNavigation();
  context.subscriptions.push(navigation);
  return { navigation };
}

export function deactivate(): void {
  // Everything Etch creates is disposed through context.subscriptions.
}
