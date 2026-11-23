// Etch: Show Latest Script Profile (eu4-engine-lab#166): the newest CSV that Anvil's script profiler
// wrote to `logs/`, shown as a Markdown preview of two lists. The profiler runs in the player's own
// game (it is a window of Anvil's overlay, which the private install does not carry), so the player's
// game profile is searched first, then the live game's private one. The page is a Markdown file in
// Etch's own storage, written again on each open: the preview opens a link without a scheme
// itself, relative to the page's file, and renders no `file:` link (see `pageLink`).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, posix } from 'node:path';
import * as vscode from 'vscode';
import {
  baseGameFiles,
  findGameInSteam,
  findPlayset,
  findProfileFolder,
  type GameFiles,
  systemEnvironment,
} from '@etch/core/playset';
import type { LiveGame } from './live-game/index.ts';
import {
  findLatestScriptProfile,
  pageLink,
  readScriptProfile,
  scriptProfileMarkdown,
  type ScriptProfile,
  type ScriptProfileLinks,
} from './script-profile.ts';
import { findScriptSources } from './script-profile-sources.ts';
import { ScriptProfileLenses, registerScriptProfileLenses } from './script-profile-lenses.ts';
import { notify, showOutput } from './notify.ts';

export const SHOW_SCRIPT_PROFILE = 'etch.showScriptProfile';
/** The page's file name in Etch's global storage folder. */
export const SCRIPT_PROFILE_PAGE = 'Script profile.md';
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
export async function linkedFiles(): Promise<
  | {
      files: GameFiles;
      playset: string;
      /** The edited mod's folder: the workspace mod's root; `undefined` for none or the game. */
      editedRoot?: string;
    }
  | undefined
> {
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
      files: await baseGameFiles(game),
      playset: 'the game folder and its DLCs',
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
  return {
    files: playset.files,
    playset: `the workspace's playset (${layers.join(', ')})`,
    ...(playset.workspaceMod === undefined ? {} : { editedRoot: playset.workspaceMod.root }),
  };
}

/** Links from the shown rows to where their owners are written; `undefined` without a game folder. */
async function sourceLinks(
  profile: ScriptProfile,
  page: vscode.Uri,
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
      const uri = pageUri(page, source.absolutePath, `L${String(source.line)}`);
      if (uri === undefined) return undefined;
      const others =
        source.others === 0
          ? ''
          : `; ${String(source.others)} more ${source.others === 1 ? 'definition' : 'definitions'} in the playset`;
      return {
        uri,
        title: `${source.path}, line ${String(source.line)} (${source.layer === 'game' ? 'the game' : source.layer})${others}`,
      };
    },
  };
}

/** The link from the page to a file, `undefined` for one on another share (a UNC path). */
function pageUri(page: vscode.Uri, path: string, fragment?: string): string | undefined {
  const target = vscode.Uri.file(path);
  if (target.authority !== page.authority) return undefined;
  return pageLink(posix.dirname(page.path), target.path, fragment);
}

/** The page of the profile at `path`: its lists, or why the file could not be read. */
async function pageText(
  path: string,
  page: vscode.Uri,
  output: vscode.LogOutputChannel,
): Promise<string> {
  try {
    const profile = await readScriptProfile(path);
    const links = await sourceLinks(profile, page, output).catch((error: unknown) => {
      output.warn(
        `Script profile: the playset could not be searched: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    });
    return scriptProfileMarkdown(
      profile,
      { path, uri: pageUri(page, path) ?? vscode.Uri.file(path).toString() },
      ROWS_PER_LIST,
      links,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `# Script profile\n\n${path}\n\nThe file could not be read: ${message}\n`;
  }
}

/** Registers Etch: Show Latest Script Profile. */
export function registerScriptProfile(
  game: LiveGame,
  output: vscode.LogOutputChannel,
  storage: vscode.Uri,
): vscode.Disposable {
  const lenses = new ScriptProfileLenses();
  // A `file:` URI: the global storage's own is `vscode-userdata:`, and the preview joins its links
  // to the page's URI, so they would open the files under that scheme, not as the files themselves.
  const page = vscode.Uri.file(join(storage.fsPath, SCRIPT_PROFILE_PAGE));
  return vscode.Disposable.from(
    registerScriptProfileLenses(lenses),
    // Answers the page's file, `undefined` without a profile.
    vscode.commands.registerCommand(
      SHOW_SCRIPT_PROFILE,
      async (): Promise<vscode.Uri | undefined> => {
        const folders = await profileFolders(game);
        const latest = await findLatestScriptProfile(folders);
        if (latest === undefined) {
          void notify(
            'info',
            "No script profile yet. Measure one with the Script profiler window of Anvil's panel (Anvil 1.22 or newer); it is written to the game's logs folder.",
            showOutput(output),
          );
          output.info(`No script_profile_*.csv in the logs folders of: ${folders.join(', ')}`);
          return undefined;
        }
        output.info(`Script profile: ${latest.path}`);
        await mkdir(storage.fsPath, { recursive: true });
        // With a BOM, which VS Code reads as UTF-8 whatever `files.encoding` says: modders often set
        // it to the game files' windows1252, which shows the page's µ and · as Âµ and Â·.
        await writeFile(page.fsPath, `\ufeff${await pageText(latest.path, page, output)}`, 'utf8');
        await vscode.commands.executeCommand('markdown.showPreview', page);
        // The same numbers above the measured blocks of the script files.
        try {
          const profile = await readScriptProfile(latest.path);
          const linked = await linkedFiles().catch(() => undefined);
          lenses.show(profile, page, latest.path, linked?.files);
        } catch (error) {
          output.warn(
            `Script profile: no lenses, the file could not be read: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return page;
      },
    ),
  );
}
