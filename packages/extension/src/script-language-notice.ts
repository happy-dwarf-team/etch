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
import * as vscode from 'vscode';
import {
  CWTOOLS_ID,
  SCRIPT_LANGUAGE_EXTENSIONS,
  scriptLanguageNotice,
  withScriptAssociations,
} from './script-language.ts';
import { ACTIONS, notify } from './notify.ts';

/** The global state key that Don't Show Again sets on the notice that offers the extensions. */
const DECLINED = 'etch.scriptLanguageNotice.declined';
/** The global state key that Don't Show Again sets on the notice about CWTools and the folder. */
const FOLDER_DECLINED = 'etch.scriptLanguageNotice.folderDeclined';
const DONT_SHOW = "Don't Show Again";
const COLOUR_FILES = 'Colour Files in This Folder';
const LEARN_MORE = 'Learn More';
/** The docs section on a mod in a folder of its own. */
export const FOLDER_DOCS =
  'https://etch.happydwarf.dev/docs/getting-started/install/#a-mod-in-a-folder-of-its-own';

const MESSAGE =
  'Script files open as Plain Text, without colours: Etch adds none. ' +
  'CWTools or ParadoxCode colour them, and you can use either together with Etch.';

const FOLDER_MESSAGE =
  'CWTools leaves this file Plain Text. ' +
  'It colours script files only inside a folder named Europa Universalis IV.';
const FOLDER_FIX = ' Etch can add a setting to this folder so that CWTools colours them here too.';
const NO_FOLDER_FIX =
  " Open your mod's folder, then a script file: Etch then offers a setting so that CWTools colours them.";

/** Whether CWTools or ParadoxCode is installed and turned on. */
export function scriptLanguageInstalled(): boolean {
  return SCRIPT_LANGUAGE_EXTENSIONS.some(
    ({ id }) => vscode.extensions.getExtension(id) !== undefined,
  );
}

/** Shows each notice once a window, when a script file opens as Plain Text. */
export function registerScriptLanguageNotice(context: vscode.ExtensionContext): vscode.Disposable {
  const shown = new Set<string>();
  const consider = (editor: vscode.TextEditor | undefined): void => {
    if (editor === undefined) return;
    const { document } = editor;
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
  }
}
