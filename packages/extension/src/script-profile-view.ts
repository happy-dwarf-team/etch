// Etch: Show Latest Script Profile (eu4-engine-lab#166): the newest CSV that Anvil's script profiler
// wrote to `logs/`, shown as a Markdown preview of two lists. The profiler runs in the player's own
// game (it is a window of Anvil's overlay, which the private install does not carry), so the player's
// game profile is searched first, then the live game's private one.
import { dirname } from 'node:path';
import * as vscode from 'vscode';
import { findGameInSteam, findProfileFolder, systemEnvironment } from '@etch/core/playset';
import type { LiveGame } from './live-game/index.ts';
import {
  findLatestScriptProfile,
  readScriptProfile,
  scriptProfileMarkdown,
} from './script-profile.ts';

export const SHOW_SCRIPT_PROFILE = 'etch.showScriptProfile';
/** The virtual documents' scheme: the CSV's path is the query, read again on each open. */
const SCHEME = 'etch-script-profile';
/** The longest rows of each list that the page shows; the CSV has all of them. */
const ROWS_PER_LIST = 30;

/** The game profile folders a script profile may be in: the player's, then the live game's. */
async function profileFolders(game: LiveGame): Promise<string[]> {
  const folders: string[] = [];
  const environment = systemEnvironment();
  const configured = vscode.workspace.getConfiguration('etch').get<string>('gamePath', '').trim();
  const gameFolder =
    configured !== '' ? configured : await findGameInSteam(environment).catch(() => undefined);
  const player = await findProfileFolder(gameFolder, environment).catch(() => undefined);
  if (player !== undefined) folders.push(player);
  folders.push(dirname(game.savesFolder));
  return folders;
}

class ScriptProfileDocuments implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const path = uri.query;
    try {
      const profile = await readScriptProfile(path);
      return scriptProfileMarkdown(
        profile,
        { path, uri: vscode.Uri.file(path).toString() },
        ROWS_PER_LIST,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `# Script profile\n\n${path}\n\nThe file could not be read: ${message}\n`;
    }
  }

  refresh(uri: vscode.Uri): void {
    this.changed.fire(uri);
  }

  dispose(): void {
    this.changed.dispose();
  }
}

/** Registers Etch: Show Latest Script Profile. */
export function registerScriptProfile(
  game: LiveGame,
  output: vscode.LogOutputChannel,
): vscode.Disposable {
  const documents = new ScriptProfileDocuments();
  return vscode.Disposable.from(
    documents,
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, documents),
    vscode.commands.registerCommand(SHOW_SCRIPT_PROFILE, async () => {
      const folders = await profileFolders(game);
      const latest = await findLatestScriptProfile(folders);
      if (latest === undefined) {
        void vscode.window.showInformationMessage(
          "No script profile yet: measure one with the Script profiler window of Anvil's panel (Anvil 1.22 or newer), and it is written to the game's logs folder.",
        );
        output.info(`No script_profile_*.csv in the logs folders of: ${folders.join(', ')}`);
        return;
      }
      output.info(`Script profile: ${latest.path}`);
      const uri = vscode.Uri.from({
        scheme: SCHEME,
        path: '/Script profile.md',
        query: latest.path,
      });
      documents.refresh(uri);
      await vscode.commands.executeCommand('markdown.showPreview', uri);
    }),
  );
}
