// Warnings on the particle references the game cannot start (etch#631), in the open `.asset` files
// under `gfx/` and `.gfx` files under `interface/` of the playset: a state event's `particle = …`
// that no pdxparticle type of the playset's `.gfx` files has, and a pdxparticle type whose `type`
// names no `particle` block of its `.asset` files, or that has no `type`. The same two failures
// the entity preview lists (`checkAssetParticles`, `checkGfxParticles` in core). In the `.asset`
// files also the warnings of their `particle` blocks (`checkParticleBlocks`): unknown keys, curve
// and force names the effect does not define, curve times and durations the game changes, emitter
// keys of the other shape, a shader effect the playset's `gfx/FX/particle.shader` does not have, a
// `local_space = yes` that shader does not place, and a texture the playset does not have. The playset's definitions are read from disk; saving an
// `.asset`, `.gfx` or `.shader` file reads them again. Hovers on the keys of particle blocks and of
// `.gfx` pdxparticle types say what they do (`particleHoverAt`), in any `.asset` or `.gfx` file.
import * as vscode from 'vscode';
import {
  checkAssetParticles,
  checkGfxParticles,
  checkParticleBlocks,
  particleHoverAt,
  particleTextureFiles,
  shaderEffectNames,
  shaderPlacesLocalSpace,
  type EntityIndex,
} from '@etch/core/asset';
import { normaliseGamePath, parseScript, textureCandidates, type SourceRange } from '@etch/core';
import { loadEntityIndex, type GameFiles } from '@etch/core/playset';
import { gamePathOf } from './live-game/pick.ts';
import { linkedFiles } from './script-profile-view.ts';

/** Diagnostics are not on the preview's path to pixels; a short debounce spares bursts of typing. */
const DEBOUNCE_MS = 150;

const PARTICLE_FILE = /\.(?:asset|gfx)$/i;
/** The files whose saving can change the warnings of the others. */
const DEFINITION_FILE = /\.(?:asset|gfx|shader)$/i;

/** The files whose keys get hovers. */
const PARTICLE_SELECTOR: vscode.DocumentSelector = [
  { scheme: 'file', pattern: '**/*.asset' },
  { scheme: 'file', pattern: '**/*.gfx' },
];

interface Playset {
  readonly files: GameFiles;
  readonly index: EntityIndex;
  /** The effects of the playset's `gfx/FX/particle.shader`; `undefined` when it has none. */
  readonly effects: ReadonlySet<string> | undefined;
  /** Whether that shader uses `InstanceWorldMatrix`; `undefined` when the playset has none. */
  readonly localSpacePlaced?: boolean | undefined;
}

/** A warning of a particle file, with the code the Problems panel shows. */
export interface ParticleWarning extends SourceRange {
  readonly code: string;
  readonly message: string;
}

/**
 * The particle warnings of a file's text by its path on disk: an `.asset` file under `gfx/` or a
 * `.gfx` file under `interface/` of a playset layer, the folders the game reads them from;
 * `undefined` for any other file.
 */
export async function diagnoseParticles(
  text: string,
  file: string,
  playset: Playset,
): Promise<ParticleWarning[] | undefined> {
  const gamePath = gamePathOf(file, playset.files)?.toLowerCase();
  if (gamePath === undefined) return undefined;
  if (gamePath.startsWith('gfx/') && gamePath.endsWith('.asset')) {
    const parsed = parseScript(text);
    const found: ParticleWarning[] = [
      ...checkAssetParticles(parsed, playset.index),
      ...checkParticleBlocks(parsed, playset.effects, playset.localSpacePlaced),
    ];
    for (const node of particleTextureFiles(parsed)) {
      const candidates = textureCandidates(normaliseGamePath(node.text));
      const files = await Promise.all(candidates.map((c) => playset.files.find(c)));
      if (files.some((f) => f !== undefined)) continue;
      found.push({
        code: 'missing-particle-texture',
        start: node.quoted ? node.start + 1 : node.start,
        end: node.quoted && node.end - node.start >= 2 ? node.end - 1 : node.end,
        message: `Texture ${normaliseGamePath(node.text)} is not in the playset, so the game has no picture for these particles.`,
      });
    }
    return found.sort((a, b) => a.start - b.start);
  }
  if (gamePath.startsWith('interface/') && gamePath.endsWith('.gfx')) {
    return checkGfxParticles(parseScript(text), playset.index);
  }
  return undefined;
}

/**
 * The effect names of the playset's `gfx/FX/particle.shader` and whether it uses
 * `InstanceWorldMatrix`, or both `undefined` without one.
 */
async function particleShader(
  files: GameFiles,
): Promise<Pick<Playset, 'effects' | 'localSpacePlaced'>> {
  const shader = await files.read('gfx/FX/particle.shader');
  if (shader === undefined) return { effects: undefined, localSpacePlaced: undefined };
  const text = new TextDecoder('latin1').decode(shader);
  return { effects: shaderEffectNames(text), localSpacePlaced: shaderPlacesLocalSpace(text) };
}

/** Hovers on the keys of particle blocks and on the curve and force names they use. */
export class ParticleHovers implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const found = particleHoverAt(parseScript(document.getText()), document.offsetAt(position));
    if (found === undefined) return undefined;
    return new vscode.Hover(
      new vscode.MarkdownString(found.markdown),
      new vscode.Range(document.positionAt(found.start), document.positionAt(found.end)),
    );
  }
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
      // A saved `.gfx`, `.asset` or `.shader` file can add or remove what the others name.
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (DEFINITION_FILE.test(document.uri.fsPath)) this.refresh();
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
          : {
              files: linked.files,
              index: await loadEntityIndex(linked.files),
              ...(await particleShader(linked.files)),
            },
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
    // Not after a change of the file, or a refresh, during a wait: a newer update is scheduled.
    const current = (): boolean =>
      !this.disposed &&
      !document.isClosed &&
      document.version === version &&
      this.playset === pending;
    const playset = await pending;
    if (!current()) return;
    const found =
      playset === undefined
        ? undefined
        : await diagnoseParticles(document.getText(), document.uri.fsPath, playset);
    if (!current()) return;
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

/** Registers the particle warnings of the open `.asset` and `.gfx` files, and their hovers. */
export function registerParticleDiagnostics(output: vscode.LogOutputChannel): vscode.Disposable {
  return vscode.Disposable.from(
    new ParticleDiagnostics(output),
    vscode.languages.registerHoverProvider(PARTICLE_SELECTOR, new ParticleHovers()),
  );
}
