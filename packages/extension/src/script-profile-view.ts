// Etch: Show Latest Script Profile (eu4-engine-lab#166): the newest CSV that Anvil's script profiler
// wrote to `logs/`, shown as a Markdown preview of two lists. The profiler runs in the player's own
// game (it is a window of Anvil's overlay, which the private install does not carry), so the player's
// game profile is searched first, then the live game's private one.
import { dirname } from 'node:path';
import * as vscode from 'vscode';
import {
  findGameInSteam,
  findPlayset,
  findProfileFolder,
  GameFiles,
  systemEnvironment,
} from '@etch/core/playset';
import type { LiveGame } from './live-game/index.ts';
import {
  findLatestScriptProfile,
  readScriptProfile,
  scriptProfileMarkdown,
  type ScriptProfile,
  type ScriptProfileLinks,
} from './script-profile.ts';
import { findScriptSources } from './script-profile-sources.ts';

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

/**
 * The files the links point into: the playset of the first workspace folder (the game and the
 * mods `etch.gamePath` and `etch.playset` give, as the preview finds them), or the game folder
 * alone without a workspace folder. `undefined` when no game folder is found.
 */
async function linkedFiles(): Promise<{ files: GameFiles; playset: string } | undefined> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const settings = vscode.workspace.getConfiguration('etch', folder?.uri);
  const gamePath = settings.get<string>('gamePath', '').trim();
  if (folder === undefined) {
    const game =
      gamePath !== ''
        ? gamePath
        : await findGameInSteam(systemEnvironment()).catch(() => undefined);
    if (game === undefined) return undefined;
    return {
      files: new GameFiles([{ name: 'game', root: game, replacePaths: [] }]),
      playset: 'the game folder',
    };
  }
  const playset = await findPlayset({
    gamePath,
    playsetOverride: settings.get<string[]>('playset', []),
    workspaceFolder: folder.uri.fsPath,
  });
  if (playset.gameFolder === undefined) return undefined;
  const layers = playset.files.layers.map((layer) =>
    layer.name === 'game' ? 'the game' : layer.name,
  );
  return { files: playset.files, playset: `the workspace's playset (${layers.join(', ')})` };
}

/** Links from the shown rows to where their owners are written; `undefined` without a game folder. */
async function sourceLinks(
  profile: ScriptProfile,
  output: vscode.LogOutputChannel,
): Promise<{ find: ScriptProfileLinks; playset: string } | undefined> {
  const linked = await linkedFiles();
  if (linked === undefined) return undefined;
  const shown = [profile.triggers, profile.scriptedTriggers, profile.effects].flatMap((list) =>
    list.rows.slice(0, ROWS_PER_LIST),
  );
  const started = Date.now();
  const sources = await findScriptSources(linked.files, shown);
  output.info(
    `Script profile: ${String(sources.size)} of ${String(shown.length)} rows found in the playset in ${String(Date.now() - started)} ms`,
  );
  return {
    playset: linked.playset,
    find: (row) => {
      const source = sources.get(row);
      if (source === undefined) return undefined;
      const others =
        source.others === 0
          ? ''
          : `; ${String(source.others)} more ${source.others === 1 ? 'definition' : 'definitions'} in the playset`;
      return {
        uri: vscode.Uri.file(source.absolutePath)
          .with({ fragment: `L${String(source.line)}` })
          .toString(),
        title: `${source.path}, line ${String(source.line)} (${source.layer === 'game' ? 'the game' : source.layer})${others}`,
      };
    },
  };
}

class ScriptProfileDocuments implements vscode.TextDocumentContentProvider {
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  private readonly output: vscode.LogOutputChannel;

  constructor(output: vscode.LogOutputChannel) {
    this.output = output;
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const path = uri.query;
    try {
      const profile = await readScriptProfile(path);
      const links = await sourceLinks(profile, this.output).catch((error: unknown) => {
        this.output.warn(
          `Script profile: the playset could not be searched: ${error instanceof Error ? error.message : String(error)}`,
        );
        return undefined;
      });
      return scriptProfileMarkdown(
        profile,
        { path, uri: vscode.Uri.file(path).toString() },
        ROWS_PER_LIST,
        links,
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
  const documents = new ScriptProfileDocuments(output);
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
