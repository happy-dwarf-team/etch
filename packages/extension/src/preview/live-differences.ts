// Compare with Live Game's entries in Problems (spec v3 section 4): the collection
// `etch-live-compare`, at Information, by file and window. A window's entries go when the next
// Compare of that window runs or when its file changes, not when the game stops. Each entry offers
// **Report to Etch**; a window without a profile's one entry also **Save as view** and
// **Open profile**.
import * as vscode from 'vscode';
import type { LiveDifference } from '@etch/core/corpus';
import { reportBody, reportTitle, reportUrl, type ReportVersions } from './live-report.ts';

export const REPORT_LIVE_DIFFERENCE = 'etch.reportLiveDifference';
export const SAVE_LIVE_VIEW = 'etch.saveLiveView';
export const OPEN_LIVE_PROFILE = 'etch.openLiveProfile';
export const LIVE_COMPARE_SOURCE = 'Etch live compare';

export interface LiveEntry {
  readonly diagnostic: vscode.Diagnostic;
  readonly difference: LiveDifference;
}

interface WindowEntries {
  readonly window: string;
  readonly profiled: boolean;
  readonly screen: { readonly width: number; readonly height: number };
  readonly entries: readonly LiveEntry[];
}

export class LiveDifferences implements vscode.CodeActionProvider, vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('etch-live-compare');
  /** By file, then by window name in lower case. */
  private readonly byFile = new Map<string, Map<string, WindowEntries>>();
  private readonly disposables: vscode.Disposable[] = [];

  private readonly versions: () => ReportVersions;

  constructor(versions: () => ReportVersions) {
    this.versions = versions;
    this.disposables.push(
      this.collection,
      vscode.languages.registerCodeActionsProvider({ pattern: '**/*.gui' }, this, {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
      }),
      vscode.commands.registerCommand(
        REPORT_LIVE_DIFFERENCE,
        (uri: string, window: string, index: number) => this.report(uri, window, index),
      ),
      // A file that changes no longer is what the game showed.
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0) this.clearFile(event.document.uri);
      }),
    );
  }

  /** Replaces a window's entries in its file. */
  set(
    uri: vscode.Uri,
    window: string,
    profiled: boolean,
    screen: { readonly width: number; readonly height: number },
    entries: readonly LiveEntry[],
  ): void {
    const key = uri.toString();
    const windows = this.byFile.get(key) ?? new Map<string, WindowEntries>();
    this.byFile.set(key, windows);
    for (const entry of entries) entry.diagnostic.source = LIVE_COMPARE_SOURCE;
    windows.set(window.toLowerCase(), { window, profiled, screen, entries });
    this.collection.set(
      uri,
      [...windows.values()].flatMap((w) => w.entries.map((e) => e.diagnostic)),
    );
  }

  clearFile(uri: vscode.Uri): void {
    if (!this.byFile.delete(uri.toString())) return;
    this.collection.delete(uri);
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const windows = this.byFile.get(document.uri.toString());
    if (windows === undefined) return [];
    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== LIVE_COMPARE_SOURCE) continue;
      for (const w of windows.values()) {
        const index = w.entries.findIndex(
          (e) =>
            e.diagnostic.message === diagnostic.message &&
            e.diagnostic.range.isEqual(diagnostic.range),
        );
        const entry = w.entries[index];
        if (entry === undefined) continue;
        if (entry.difference.kind === 'hiddenInWindow') {
          actions.push(
            action('Save as view', diagnostic, {
              command: SAVE_LIVE_VIEW,
              title: 'Save as view',
              arguments: [w.window, entry.difference.paths],
            }),
            action('Open profile', diagnostic, {
              command: OPEN_LIVE_PROFILE,
              title: 'Open profile',
              arguments: [w.window],
            }),
          );
        }
        actions.push(
          action('Report to Etch…', diagnostic, {
            command: REPORT_LIVE_DIFFERENCE,
            title: 'Report to Etch…',
            arguments: [document.uri.toString(), w.window, index],
          }),
        );
      }
    }
    return actions;
  }

  /** **Report to Etch**: shows what the issue holds, then opens it filled in for the author to send. */
  private async report(uri: string, window: string, index: number): Promise<void> {
    const w = this.byFile.get(uri)?.get(window.toLowerCase());
    const entry = w?.entries[index];
    if (w === undefined || entry === undefined) return;
    const body = reportBody(entry.difference, w.screen, this.versions(), w.profiled);
    const open = await vscode.window.showInformationMessage(
      'Report to Etch opens a new issue of happy-dwarf-team/etch with these fields; you send it from the browser.',
      { modal: true, detail: body },
      'Open in Browser',
    );
    if (open !== 'Open in Browser') return;
    await vscode.env.openExternal(vscode.Uri.parse(reportUrl(reportTitle(entry.difference), body)));
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

function action(
  title: string,
  diagnostic: vscode.Diagnostic,
  command: vscode.Command,
): vscode.CodeAction {
  const fix = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
  fix.diagnostics = [diagnostic];
  fix.command = command;
  return fix;
}
