// Game text from the unsaved editor buffer or from disk, and the diagnostics
// and quick fixes for where it differs from the editor text (etch#15). The
// buffer is encoded the way the next save writes it; core decodes the bytes
// as the game does. Etch never changes the user's encoding settings.

import * as vscode from 'vscode';
import {
  builtInSaveEncoding,
  decodeGameText,
  diagnoseGameText,
  encodeForSave,
  encodingLabel,
  gameTextKind,
  nonAsciiRuns,
  type GameText,
  type GameTextDiagnosticCode,
  type GameTextKind,
  type SaveEncoding,
} from '@etch/core';

/** The command behind the reopen quick fix: `(uri: Uri, encoding: string)`. */
export const REOPEN_WITH_ENCODING = 'etch.reopenWithEncoding';

/** VS Code's own command that offers Reopen and Save with Encoding. */
const CHANGE_ENCODING = 'workbench.action.editor.changeEncoding';

/** The same debounce as the preview's parse (spec section 7). */
const DEBOUNCE_MS = 30;

/** The encoding the game expects for each kind of game text. */
const EXPECTED_ENCODING: Readonly<Record<GameTextKind, string>> = {
  interface: 'windows1252',
  localisation: 'utf8bom',
};

/**
 * The game text of an open document: its text encoded the way the next save
 * writes it, read as the game reads it.
 */
export async function gameTextOfDocument(
  document: vscode.TextDocument,
  kind: GameTextKind,
): Promise<GameText> {
  const text = document.getText();
  const encoding = builtInSaveEncoding(document.encoding);
  const bytes = encoding
    ? encodeForSave(text, encoding)
    : await vscode.workspace.encode(text, { encoding: document.encoding });
  return decodeGameText(bytes, kind);
}

/**
 * The game text of a file: from its editor buffer when it is open, from disk
 * otherwise. `undefined` for a file that is not game text.
 */
export async function readGameText(uri: vscode.Uri): Promise<GameText | undefined> {
  const kind = gameTextKind(uri.path);
  if (!kind) {
    return undefined;
  }
  const key = uri.toString();
  const document = vscode.workspace.textDocuments.find((open) => open.uri.toString() === key);
  if (document) {
    return gameTextOfDocument(document, kind);
  }
  return decodeGameText(await vscode.workspace.fs.readFile(uri), kind);
}

/**
 * The encoding of a document for core. An encoding core has no encoder for is
 * encoded through VS Code, which is asynchronous, so the runs core will ask
 * for are encoded up front.
 */
export async function saveEncodingOf(
  document: vscode.TextDocument,
  text: string,
): Promise<SaveEncoding> {
  const id = document.encoding;
  const builtIn = builtInSaveEncoding(id);
  if (builtIn) {
    return builtIn;
  }
  const runs = new Set(nonAsciiRuns(text).map((run) => text.slice(run.start, run.end)));
  const encoded = new Map<string, Uint8Array>();
  await Promise.all(
    [...runs].map(async (run) => {
      encoded.set(run, await vscode.workspace.encode(run, { encoding: id }));
    }),
  );
  return {
    id,
    encode: (run) => {
      const bytes = encoded.get(run);
      if (!bytes) {
        throw new Error(`run not encoded in advance: ${run}`);
      }
      return bytes;
    },
  };
}

/** Keeps the game text diagnostics of open interface and localisation documents. */
class GameTextDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('etch-game-text');
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly subscriptions: vscode.Disposable[];
  private disposed = false;

  constructor() {
    this.subscriptions = [
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.schedule(document);
      }),
      // Also fires when the document's encoding changes.
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        this.schedule(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.forget(document.uri);
      }),
    ];
    for (const document of vscode.workspace.textDocuments) {
      this.schedule(document);
    }
  }

  private schedule(document: vscode.TextDocument): void {
    const kind = gameTextKind(document.uri.path);
    if (!kind) {
      return;
    }
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.update(document, kind);
      }, DEBOUNCE_MS),
    );
  }

  private async update(document: vscode.TextDocument, kind: GameTextKind): Promise<void> {
    const { version, encoding: id } = document;
    const text = document.getText();
    let encoding: SaveEncoding;
    try {
      encoding = await saveEncodingOf(document, text);
    } catch {
      // VS Code could not encode it; leave the last diagnostics in place.
      return;
    }
    if (this.disposed) {
      return;
    }
    if (document.isClosed || document.version !== version || document.encoding !== id) {
      return; // A newer update is scheduled.
    }
    const diagnostics = diagnoseGameText(text, kind, encoding).map((found) => {
      const range = new vscode.Range(
        document.positionAt(found.range.start),
        document.positionAt(found.range.end),
      );
      const severity =
        found.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : vscode.DiagnosticSeverity.Warning;
      const diagnostic = new vscode.Diagnostic(range, found.message, severity);
      diagnostic.source = 'Etch';
      diagnostic.code = found.code;
      return diagnostic;
    });
    this.collection.set(document.uri, diagnostics);
  }

  private forget(uri: vscode.Uri): void {
    const key = uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.delete(key);
    this.collection.delete(uri);
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.collection.dispose();
  }
}

const CODES = new Set<string>([
  'game-text-differs',
  'replacement-character',
  'unreadable-encoding',
  'interface-bom',
  'localisation-encoding',
] satisfies GameTextDiagnosticCode[]);

/**
 * Reopen in the expected encoding for a clean document, which `openTextDocument`
 * refuses for a dirty one; VS Code's Save with Encoding for both.
 */
class GameTextFixes implements vscode.CodeActionProvider {
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  };

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const kind = gameTextKind(document.uri.path);
    const ours = context.diagnostics.filter(
      (diagnostic) =>
        diagnostic.source === 'Etch' &&
        typeof diagnostic.code === 'string' &&
        CODES.has(diagnostic.code),
    );
    if (!kind || ours.length === 0) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];
    const expected = EXPECTED_ENCODING[kind];
    const reopenable = ours.filter(
      (diagnostic) =>
        diagnostic.code !== 'interface-bom' &&
        // UTF-8 localisation reads the same with a BOM; only a save adds it.
        !(diagnostic.code === 'localisation-encoding' && document.encoding === 'utf8'),
    );
    if (!document.isDirty && document.encoding !== expected && reopenable.length > 0) {
      const reopen = new vscode.CodeAction(
        `Reopen as ${encodingLabel(expected)}`,
        vscode.CodeActionKind.QuickFix,
      );
      reopen.diagnostics = reopenable;
      reopen.command = {
        title: reopen.title,
        command: REOPEN_WITH_ENCODING,
        arguments: [document.uri, expected],
      };
      actions.push(reopen);
    }

    const save = new vscode.CodeAction('Save with Encoding…', vscode.CodeActionKind.QuickFix);
    save.diagnostics = ours;
    save.command = { title: save.title, command: CHANGE_ENCODING };
    actions.push(save);
    return actions;
  }
}

async function reopenWithEncoding(uri: vscode.Uri, encoding: string): Promise<void> {
  try {
    const document = await vscode.workspace.openTextDocument(uri, { encoding });
    await vscode.window.showTextDocument(document);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(
      `Etch could not reopen the file as ${encodingLabel(encoding)}: ${reason}`,
    );
  }
}

/** Starts the game text diagnostics, their quick fixes and the reopen command. */
export function registerGameText(): vscode.Disposable {
  return vscode.Disposable.from(
    new GameTextDiagnostics(),
    vscode.languages.registerCodeActionsProvider(
      { pattern: '**/*.{gui,gfx,fnt,yml}' },
      new GameTextFixes(),
      GameTextFixes.metadata,
    ),
    vscode.commands.registerCommand(REOPEN_WITH_ENCODING, reopenWithEncoding),
  );
}
