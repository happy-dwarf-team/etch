// The shown script profile in the script files (after-v2.md, "The latest script profile"): once
// Etch: Show Latest Script Profile opened a profile, a CodeLens above each event, option, decision,
// mission, on_action, … that it measured gives the times of its rows, and opens the profile again.
// Etch: Hide the Script Profile in Script Files takes them away.
import * as vscode from 'vscode';
import type { GameFiles } from '@etch/core/playset';
import type { ScriptProfile } from './script-profile.ts';
import { isLoadedCopy, scriptProfileLenses } from './script-profile-sources.ts';

export const HIDE_SCRIPT_PROFILE_LENSES = 'etch.hideScriptProfileLenses';
/** True while a profile's lenses are shown, for the hide command's `when`. */
export const SCRIPT_PROFILE_SHOWN_CONTEXT = 'etch.scriptProfileShown';

/** The profile whose lenses are shown, and how to open its page. */
interface Shown {
  readonly profile: ScriptProfile;
  readonly page: vscode.Uri;
  readonly file: string;
  /** The workspace's playset, to leave out the copies it does not load; `undefined` without one. */
  readonly files: GameFiles | undefined;
}

export class ScriptProfileLenses implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;
  private shown: Shown | undefined;

  /** Shows a profile's lenses in every script file, replacing the last one's. */
  show(profile: ScriptProfile, page: vscode.Uri, file: string, files?: GameFiles): void {
    this.shown = { profile, page, file, files };
    void vscode.commands.executeCommand('setContext', SCRIPT_PROFILE_SHOWN_CONTEXT, true);
    this.changed.fire();
  }

  hide(): void {
    this.shown = undefined;
    void vscode.commands.executeCommand('setContext', SCRIPT_PROFILE_SHOWN_CONTEXT, false);
    this.changed.fire();
  }

  /** The profile file shown, `undefined` when none is. */
  get file(): string | undefined {
    return this.shown?.file;
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const shown = this.shown;
    if (shown === undefined || document.uri.scheme !== 'file') return [];
    // A copy that a later layer overrides, or a replace_path hides, did not run in the game.
    if (shown.files !== undefined) {
      const loaded = await isLoadedCopy(document.uri.fsPath, shown.files).catch(() => undefined);
      if (loaded === false) return [];
    }
    return scriptProfileLenses(document.getText(), document.uri.fsPath, shown.profile).map(
      (lens) => {
        const line = Math.min(lens.line - 1, document.lineCount - 1);
        return new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
          title: lens.title,
          tooltip: lens.detail,
          command: 'markdown.showPreview',
          arguments: [shown.page],
        });
      },
    );
  }

  dispose(): void {
    this.changed.dispose();
  }
}

/** Registers the lenses for `.txt` files and the command that hides them. */
export function registerScriptProfileLenses(lenses: ScriptProfileLenses): vscode.Disposable {
  return vscode.Disposable.from(
    lenses,
    vscode.languages.registerCodeLensProvider({ scheme: 'file', pattern: '**/*.txt' }, lenses),
    vscode.commands.registerCommand(HIDE_SCRIPT_PROFILE_LENSES, () => {
      lenses.hide();
    }),
  );
}
