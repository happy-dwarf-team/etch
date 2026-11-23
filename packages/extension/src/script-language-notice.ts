// The notice that script files open as Plain Text (etch#648, P2.9). Etch adds no grammar (ADR
// 0008), so without CWTools or ParadoxCode a script file has no colours. Once a window, when such a
// file opens as Plain Text and neither extension is installed and enabled (VS Code does not list
// one that is turned off), Etch offers to install either, or not to show the notice again. Like
// VS Code's own extension recommendations, it stays silent when `extensions.ignoreRecommendations`
// is on, as it is in Etch's media captures.
import * as vscode from 'vscode';
import { SCRIPT_LANGUAGE_EXTENSIONS, offersScriptLanguage } from './script-language.ts';

/** The global state key that Don't Show Again sets. */
const DECLINED = 'etch.scriptLanguageNotice.declined';
const DONT_SHOW = "Don't Show Again";

const MESSAGE =
  'Script files open as Plain Text, without colours: Etch adds none. ' +
  'CWTools or ParadoxCode colour them, and you can use either together with Etch.';

/** Offers CWTools and ParadoxCode once a window, when a script file opens as Plain Text. */
export function registerScriptLanguageNotice(context: vscode.ExtensionContext): vscode.Disposable {
  let shown = false;
  const consider = (editor: vscode.TextEditor | undefined): void => {
    if (editor === undefined || shown) return;
    const { document } = editor;
    const offer = offersScriptLanguage({
      scheme: document.uri.scheme,
      languageId: document.languageId,
      fileName: document.fileName,
      installed: SCRIPT_LANGUAGE_EXTENSIONS.some(
        ({ id }) => vscode.extensions.getExtension(id) !== undefined,
      ),
      declined:
        context.globalState.get<boolean>(DECLINED, false) ||
        vscode.workspace
          .getConfiguration('extensions')
          .get<boolean>('ignoreRecommendations', false),
    });
    if (!offer) return;
    shown = true;
    void showNotice(context);
  };
  consider(vscode.window.activeTextEditor);
  return vscode.window.onDidChangeActiveTextEditor(consider);
}

/** Shows the notice and does what the user picks. */
async function showNotice(context: vscode.ExtensionContext): Promise<void> {
  const install = (name: string): string => `Install ${name}`;
  const choice = await vscode.window.showInformationMessage(
    MESSAGE,
    ...SCRIPT_LANGUAGE_EXTENSIONS.map(({ name }) => install(name)),
    DONT_SHOW,
  );
  if (choice === DONT_SHOW) {
    await context.globalState.update(DECLINED, true);
    return;
  }
  const extension = SCRIPT_LANGUAGE_EXTENSIONS.find(({ name }) => choice === install(name));
  if (extension === undefined) return;
  try {
    await vscode.commands.executeCommand('workbench.extensions.installExtension', extension.id);
  } catch (error) {
    void vscode.window.showErrorMessage(
      `${extension.name} could not be installed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
