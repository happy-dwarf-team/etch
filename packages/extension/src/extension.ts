import * as vscode from 'vscode';
import { SUPPORTED_GAME_VERSION } from '@etch/core';

export function activate(context: vscode.ExtensionContext): void {
  const { version } = context.extension.packageJSON as { version: string };
  const output = vscode.window.createOutputChannel('Etch', { log: true });
  context.subscriptions.push(output);
  output.info(`Etch ${version} for EU4 ${SUPPORTED_GAME_VERSION}`);
}

export function deactivate(): void {
  // Everything Etch creates is disposed through context.subscriptions.
}
