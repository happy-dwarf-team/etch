// The notices that script files open as Plain Text (etch#648, P2.9; etch#704). Etch adds no grammar
// (ADR 0008), so without CWTools or ParadoxCode a script file has no colours. Once a window, when
// such a file opens as Plain Text and neither extension is installed and enabled (VS Code does not
// list one that is turned off), Etch offers to install either, or not to show the notice again.
// Like VS Code's own extension recommendations, it stays silent when
// `extensions.ignoreRecommendations` is on, as it is in Etch's media captures.
//
// CWTools gives its `eu4` language only to files under a folder named after the game, so a mod
// kept elsewhere, such as a Git clone, stays Plain Text with CWTools installed. Once a window, when
// such a file opens, Etch says so and offers to add `files.associations` entries to the workspace
// settings that give the mod's script files that language. The setting has window scope, so they
// go to the workspace (the folder's `.vscode/settings.json`), never to a folder of a multi-root
// workspace. The notice comes up again after CWTools is installed from the first one.
import { resolve } from 'node:path';
import * as vscode from 'vscode';
import { findGameInSteam, isGameFolder, systemEnvironment } from '@etch/core/playset';
import {
  CWTOOLS_EU4_LANGUAGE,
  CWTOOLS_GAME_FOLDER,
  CWTOOLS_ID,
  SCRIPT_LANGUAGE_EXTENSIONS,
  offersCwtoolsGameFolder,
  scriptLanguageNotice,
  withScriptAssociations,
} from './script-language.ts';
import { ACTIONS, notify } from './notify.ts';

/** The global state key that Don't Show Again sets on the notice that offers the extensions. */
const DECLINED = 'etch.scriptLanguageNotice.declined';
/** The global state key that Don't Show Again sets on the notice about CWTools and the folder. */
const FOLDER_DECLINED = 'etch.scriptLanguageNotice.folderDeclined';
/** The global state key that Don't Show Again sets on the offer of the game folder to CWTools. */
const GAME_FOLDER_DECLINED = 'etch.scriptLanguageNotice.cwtoolsGameFolderDeclined';
const DONT_SHOW = "Don't Show Again";
const USE_FOLDER = 'Use This Folder';
const COLOUR_FILES = 'Colour Files in This Folder';
const LEARN_MORE = 'Learn More';
/** The docs section on a mod in a folder of its own. */
export const FOLDER_DOCS =
  'https://etch.happydwarf.dev/docs/getting-started/install/#a-mod-in-a-folder-of-its-own';
/** The docs section on CWTools and the game folder. */
export const GAME_FOLDER_DOCS =
  'https://etch.happydwarf.dev/docs/getting-started/install/#cwtools-and-the-game-folder';

const MESSAGE =
  'Script files open as Plain Text, without colours: Etch adds none. ' +
  'CWTools or ParadoxCode colour them, and you can use either together with Etch.';

const FOLDER_MESSAGE =
  'CWTools leaves this file Plain Text. ' +
  'It colours script files only inside a folder named Europa Universalis IV.';
const FOLDER_FIX = ' Etch can add a setting to this folder so that CWTools colours them here too.';
const NO_FOLDER_FIX =
  " Open your mod's folder, then a script file: Etch then offers a setting so that CWTools colours them.";
const CWTOOLS_OTHER_GAME =
  'CWTools was already running for another game. ' +
  'Reload the window so that it checks these files as EU4 files.';

/** Whether CWTools or ParadoxCode is installed and turned on. */
export function scriptLanguageInstalled(): boolean {
  return SCRIPT_LANGUAGE_EXTENSIONS.some(
    ({ id }) => vscode.extensions.getExtension(id) !== undefined,
  );
}

/** The game folder Etch finds, as the walkthrough's first step does: `etch.gamePath`, else Steam. */
async function etchGameFolder(): Promise<string | undefined> {
  const setting = vscode.workspace.getConfiguration('etch').get<string>('gamePath', '').trim();
  if (setting === '') return findGameInSteam(systemEnvironment()).catch(() => undefined);
  const folder = resolve(setting);
  return (await isGameFolder(folder).catch(() => false)) ? folder : undefined;
}

/** Shows each notice once a window, when a script file opens as Plain Text. */
export function registerScriptLanguageNotice(context: vscode.ExtensionContext): vscode.Disposable {
  const shown = new Set<string>();
  const considerGameFolder = async (document: vscode.TextDocument): Promise<void> => {
    if (shown.has('gameFolder') || document.languageId !== CWTOOLS_EU4_LANGUAGE) return;
    const cwtoolsSettings = vscode.workspace.getConfiguration('cwtools');
    const decide = (gameFolder: string | undefined): boolean =>
      offersCwtoolsGameFolder({
        languageId: document.languageId,
        cwtools: vscode.extensions.getExtension(CWTOOLS_ID) !== undefined,
        cwtoolsGameFolder: cwtoolsSettings.get<string | null>(CWTOOLS_GAME_FOLDER) ?? undefined,
        gameFolder,
        declined: context.globalState.get<boolean>(GAME_FOLDER_DECLINED, false),
      });
    // Decided once without the folder first, so that Steam is not searched for nothing.
    if (!decide('?')) return;
    shown.add('gameFolder');
    const gameFolder = await etchGameFolder();
    if (gameFolder === undefined || !decide(gameFolder)) return;
    await showGameFolderNotice(context, gameFolder);
  };
  const consider = (editor: vscode.TextEditor | undefined): void => {
    if (editor === undefined) return;
    const { document } = editor;
    void considerGameFolder(document);
    const notice = scriptLanguageNotice({
      scheme: document.uri.scheme,
      languageId: document.languageId,
      fileName: document.fileName,
      installed: scriptLanguageInstalled(),
      cwtools: vscode.extensions.getExtension(CWTOOLS_ID) !== undefined,
      declined:
        context.globalState.get<boolean>(DECLINED, false) ||
        vscode.workspace
          .getConfiguration('extensions')
          .get<boolean>('ignoreRecommendations', false),
      folderDeclined: context.globalState.get<boolean>(FOLDER_DECLINED, false),
    });
    if (notice === undefined || shown.has(notice)) return;
    shown.add(notice);
    void (notice === 'install' ? showNotice(context) : showFolderNotice(context, document));
  };
  consider(vscode.window.activeTextEditor);
  return vscode.Disposable.from(
    vscode.window.onDidChangeActiveTextEditor(consider),
    // CWTools installed from the first notice leaves the open file Plain Text outside such a folder.
    vscode.extensions.onDidChange(() => {
      consider(vscode.window.activeTextEditor);
    }),
  );
}

/** Shows the notice that offers the extensions and does what the user picks. */
async function showNotice(context: vscode.ExtensionContext): Promise<void> {
  const install = (name: string): string => `Install ${name}`;
  const choice = (
    await notify(
      'info',
      MESSAGE,
      ...SCRIPT_LANGUAGE_EXTENSIONS.map(({ name }) => ({ label: install(name) })),
      { label: DONT_SHOW },
    )
  )?.label;
  if (choice === DONT_SHOW) {
    await context.globalState.update(DECLINED, true);
    return;
  }
  const extension = SCRIPT_LANGUAGE_EXTENSIONS.find(({ name }) => choice === install(name));
  if (extension === undefined) return;
  try {
    await vscode.commands.executeCommand('workbench.extensions.installExtension', extension.id);
  } catch (error) {
    void notify(
      'error',
      `${extension.name} could not be installed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Shows the notice about CWTools and the mod's folder and does what the user picks. */
async function showFolderNotice(
  context: vscode.ExtensionContext,
  document: vscode.TextDocument,
): Promise<void> {
  const inFolder = vscode.workspace.getWorkspaceFolder(document.uri) !== undefined;
  const choice = (
    await notify(
      'info',
      FOLDER_MESSAGE + (inFolder ? FOLDER_FIX : NO_FOLDER_FIX),
      inFolder ? { label: COLOUR_FILES } : ACTIONS.openFolder,
      { label: LEARN_MORE, run: () => vscode.env.openExternal(vscode.Uri.parse(FOLDER_DOCS)) },
      { label: DONT_SHOW },
    )
  )?.label;
  if (choice === DONT_SHOW) {
    await context.globalState.update(FOLDER_DECLINED, true);
    return;
  }
  if (choice === COLOUR_FILES) await addScriptAssociations();
}

/** Offers CWTools the game folder Etch found, and on Use This Folder puts it in CWTools' setting. */
async function showGameFolderNotice(
  context: vscode.ExtensionContext,
  gameFolder: string,
): Promise<void> {
  const choice = (
    await notify(
      'info',
      `CWTools needs the game folder to check your mod against the base game. Etch found the game in ${gameFolder}.`,
      { label: USE_FOLDER },
      { label: LEARN_MORE, run: () => vscode.env.openExternal(vscode.Uri.parse(GAME_FOLDER_DOCS)) },
      { label: DONT_SHOW },
    )
  )?.label;
  if (choice === DONT_SHOW) {
    await context.globalState.update(GAME_FOLDER_DECLINED, true);
    return;
  }
  if (choice !== USE_FOLDER) return;
  try {
    await vscode.workspace
      .getConfiguration('cwtools')
      .update(CWTOOLS_GAME_FOLDER, gameFolder, vscode.ConfigurationTarget.Global);
  } catch (error) {
    void notify(
      'error',
      `Etch could not set cwtools.cache.eu4 in your user settings: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // No restart: CWTools reads cwtools.cache.eu4 when the setting changes, builds its cache of the
  // base game and checks the workspace again.
}

/** Adds Etch's `files.associations` entries to the workspace settings. */
async function addScriptAssociations(): Promise<void> {
  const files = vscode.workspace.getConfiguration('files');
  const current = files.inspect<Record<string, string>>('associations')?.workspaceValue;
  const merged = withScriptAssociations(current);
  if (merged === undefined) return;
  try {
    await files.update('associations', merged, vscode.ConfigurationTarget.Workspace);
  } catch (error) {
    void notify(
      'error',
      `The setting could not be added: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  // A CWTools that already runs, started by a .gui file opened as `paradox`, keeps that mode and
  // checks nothing in the files that are `eu4` now. One that does not run yet starts in EU4 mode
  // by itself when a file becomes `eu4`. CWTools 0.10.31's own restart command fails while its
  // server runs ("command 'pretriggerThisFile' already exists"), so a window reload restarts it.
  if (vscode.extensions.getExtension(CWTOOLS_ID)?.isActive === true) {
    void notify('info', CWTOOLS_OTHER_GAME, ACTIONS.reloadWindow);
  }
}
