// Warnings on the particle references the game cannot start (etch#631), in the open `.asset` files
// under `gfx/` and `.gfx` files under `interface/` of the playset: a state event's `particle = …`
// that no pdxparticle type of the playset's `.gfx` files has, and a pdxparticle type whose `type`
// names no `particle` block of its `.asset` files, or that has no `type`. The same two failures
// the entity preview lists (`checkAssetParticles`, `checkGfxParticles` in core). The playset's
// definitions are read from disk; saving an `.asset` or `.gfx` file reads them again.
import * as vscode from 'vscode';
import {
  checkAssetParticles,
  checkGfxParticles,
  type EntityIndex,
  type ParticleDiagnostic,
} from '@etch/core/asset';
import { parseScript } from '@etch/core';
import { loadEntityIndex, type GameFiles } from '@etch/core/playset';
import { gamePathOf } from './live-game/pick.ts';
import { linkedFiles } from './script-profile-view.ts';

/** Diagnostics are not on the preview's path to pixels; a short debounce spares bursts of typing. */
const DEBOUNCE_MS = 150;

const PARTICLE_FILE = /\.(?:asset|gfx)$/i;

interface Playset {
  readonly files: GameFiles;
  readonly index: EntityIndex;
}

/**
 * The particle warnings of a file's text by its path on disk: an `.asset` file under `gfx/` or a
 * `.gfx` file under `interface/` of a playset layer, the folders the game reads them from;
 * `undefined` for any other file.
 */
export function diagnoseParticles(
  text: string,
  file: string,
  playset: Playset,
): ParticleDiagnostic[] | undefined {
  const gamePath = gamePathOf(file, playset.files)?.toLowerCase();
  if (gamePath === undefined) return undefined;
  if (gamePath.startsWith('gfx/') && gamePath.endsWith('.asset')) {
    return checkAssetParticles(parseScript(text), playset.index);
  }
  if (gamePath.startsWith('interface/') && gamePath.endsWith('.gfx')) {
    return checkGfxParticles(parseScript(text), playset.index);
  }
  return undefined;
}

/** Keeps the particle warnings of the open `.asset` and `.gfx` files. */
export class ParticleDiagnostics implements vscode.Disposable {
  private readonly collection = vscode.languages.createDiagnosticCollection('etch-particles');
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly subscriptions: vscode.Disposable[];
  private readonly output: vscode.LogOutputChannel;
  private playset: Promise<Playset | undefined> | undefined;
  private disposed = false;

  constructor(output: vscode.LogOutputChannel) {
    this.output = output;
    this.subscriptions = [
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.schedule(document);
      }),
      vscode.workspace.onDidChangeTextDocument(({ document }) => {
        this.schedule(document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        const key = document.uri.toString();
        clearTimeout(this.timers.get(key));
        this.timers.delete(key);
        this.collection.delete(document.uri);
      }),
      // A saved `.gfx` or `.asset` file can add or remove the definitions the others name.
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (PARTICLE_FILE.test(document.uri.fsPath)) this.refresh();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('etch.gamePath') ||
          event.affectsConfiguration('etch.playset')
        )
          this.refresh();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.refresh();
      }),
    ];
    for (const document of vscode.workspace.textDocuments) this.schedule(document);
  }

  /** Reads the playset's definitions again and checks the open files again. */
  refresh(): void {
    this.playset = undefined;
    for (const document of vscode.workspace.textDocuments) this.schedule(document);
  }

  private load(): Promise<Playset | undefined> {
    this.playset ??= linkedFiles()
      .then(async (linked) =>
        linked === undefined
          ? undefined
          : { files: linked.files, index: await loadEntityIndex(linked.files) },
      )
      .catch((error: unknown) => {
        this.output.warn(
          `Particles: the playset's .gfx and .asset files could not be read: ${error instanceof Error ? error.message : String(error)}`,
        );
        return undefined;
      });
    return this.playset;
  }

  private schedule(document: vscode.TextDocument): void {
    if (document.uri.scheme !== 'file' || !PARTICLE_FILE.test(document.uri.fsPath)) return;
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void this.update(document);
      }, DEBOUNCE_MS),
    );
  }

  private async update(document: vscode.TextDocument): Promise<void> {
    const { version } = document;
    const pending = this.load();
    const playset = await pending;
    if (this.disposed || document.isClosed || document.version !== version) return;
    // A refresh during the wait scheduled a newer update against the new definitions.
    if (this.playset !== pending) return;
    const found =
      playset === undefined
        ? undefined
        : diagnoseParticles(document.getText(), document.uri.fsPath, playset);
    if (found === undefined) {
      this.collection.delete(document.uri);
      return;
    }
    this.collection.set(
      document.uri,
      found.map((d) => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(document.positionAt(d.start), document.positionAt(d.end)),
          d.message,
          vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = 'Etch';
        diagnostic.code = d.code;
        return diagnostic;
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    vscode.Disposable.from(...this.subscriptions).dispose();
    this.collection.dispose();
  }
}

/** Registers the particle warnings of the open `.asset` and `.gfx` files. */
export function registerParticleDiagnostics(output: vscode.LogOutputChannel): vscode.Disposable {
  return vscode.Disposable.from(new ParticleDiagnostics(output));
}
