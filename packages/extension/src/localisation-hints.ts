// Localisation inlay hints (ADR 0008): a value of a `.gui` or script file that names a key the
// playset's localisation defines gets the key's text as an inlay hint, in the plain form of
// profile labels, and Go to Definition opens the key's line in its `.yml` file. The localisation
// is the playset's in `etch.language`, read once and again after a `.yml` file is saved or the
// game path, playset or language changes; it is the same playset the sprite links read.
import * as vscode from 'vscode';
import {
  DEFAULT_LANGUAGE,
  decodeGameText,
  isLocalisationReferencePath,
  localisationReferences,
  parseScript,
  type Localisation,
  type LocalisationReference,
} from '@etch/core';
import { loadPlaysetLocalisation, type GameFiles } from '@etch/core/playset';
import { plainLabelText } from '@etch/core/profile';
import { linkedFiles } from './script-profile-view.ts';
import { readGamePath } from '@etch/core/playset';
import { pathUri } from './dlc-files.ts';

const SELECTOR: vscode.DocumentSelector = [
  { scheme: 'file', pattern: '**/*.gui' },
  { scheme: 'file', pattern: '**/{events,decisions,missions,common}/**/*.txt' },
];

/** The setting that turns the hints and their definitions on and off. */
const SETTING = 'editor.localisationHints';

interface Loaded {
  readonly files: GameFiles;
  readonly localisation: Localisation;
}

/**
 * The game-relative path the file's folders give: any `.gui` file, or from the last `events`,
 * `decisions`, `missions` or `common` folder on for a `.txt` file; `undefined` for other files.
 */
export function localisationReferencePath(fileName: string): string | undefined {
  const slashed = fileName.replace(/\\/g, '/');
  const lower = slashed.toLowerCase();
  if (lower.endsWith('.gui')) return `interface/${slashed.slice(slashed.lastIndexOf('/') + 1)}`;
  let at = -1;
  for (const folder of ['/events/', '/decisions/', '/missions/', '/common/']) {
    at = Math.max(at, lower.lastIndexOf(folder));
  }
  if (at < 0) return undefined;
  const path = slashed.slice(at + 1);
  return isLocalisationReferencePath(path) ? path : undefined;
}

export class LocalisationHints implements vscode.InlayHintsProvider, vscode.DefinitionProvider {
  private loaded: Promise<Loaded | undefined> | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.changed.event;
  private readonly output: vscode.LogOutputChannel;
  private readonly parsed = new Map<
    string,
    { version: number; references: LocalisationReference[] }
  >();

  constructor(output: vscode.LogOutputChannel) {
    this.output = output;
  }

  /** Forgets the localisation and asks VS Code for new hints. */
  reset(): void {
    this.loaded = undefined;
    this.changed.fire();
  }

  dispose(): void {
    this.changed.dispose();
  }

  /**
   * The document's references, parsed once per version: VS Code asks for the hints of a range on
   * every scroll, and vanilla's largest script (`common/achievements.txt`, 240,000 characters)
   * takes about 80 ms to parse and read.
   */
  private references(document: vscode.TextDocument, path: string): LocalisationReference[] {
    const key = document.uri.toString();
    const cached = this.parsed.get(key);
    if (cached?.version === document.version) return cached.references;
    const parsed = parseScript(document.getText(), { script: !path.endsWith('.gui') });
    const references = localisationReferences(path, parsed);
    this.parsed.set(key, { version: document.version, references });
    return references;
  }

  /** Forgets a closed document's references. */
  forget(document: vscode.TextDocument): void {
    this.parsed.delete(document.uri.toString());
  }

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
  ): Promise<vscode.InlayHint[]> {
    if (!enabled(document)) return [];
    const path = localisationReferencePath(document.fileName);
    if (path === undefined) return [];
    const loaded = await this.localisation();
    if (loaded === undefined) return [];
    const start = document.offsetAt(range.start);
    const end = document.offsetAt(range.end);
    const hints: vscode.InlayHint[] = [];
    for (const { node, key } of this.references(document, path)) {
      if (node.end < start || node.start > end) continue;
      const text = loaded.localisation.get(key);
      if (text === undefined) continue;
      const plain = plainLabelText(text);
      if (plain === undefined) continue;
      const hint = new vscode.InlayHint(document.positionAt(node.end), plain);
      hint.paddingLeft = true;
      const source = loaded.localisation.source(key);
      const tooltip = new vscode.MarkdownString();
      tooltip.appendMarkdown(`**${key}** · ${loaded.localisation.language}`);
      if (source !== undefined) tooltip.appendMarkdown(` · \`${source.path}\``);
      tooltip.appendMarkdown('\n\n');
      tooltip.appendText(text);
      hint.tooltip = tooltip;
      hints.push(hint);
    }
    return hints;
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location | undefined> {
    if (!enabled(document)) return undefined;
    const path = localisationReferencePath(document.fileName);
    if (path === undefined) return undefined;
    const offset = document.offsetAt(position);
    const found = this.references(document, path).find(
      ({ node }) => node.start <= offset && offset <= node.end,
    );
    if (found === undefined) return undefined;
    const loaded = await this.localisation();
    const source = loaded?.localisation.source(found.key);
    if (loaded === undefined || source === undefined) return undefined;
    const file = await loaded.files.find(source.path);
    if (file === undefined) return undefined;
    const text = decodeGameText(await readGamePath(file.absolutePath), 'localisation').text;
    const at = keyLine(text, found.key);
    if (at === undefined) return undefined;
    return new vscode.Location(
      pathUri(file.absolutePath),
      new vscode.Range(at.line, at.column, at.line, at.column + found.key.length),
    );
  }

  private localisation(): Promise<Loaded | undefined> {
    this.loaded ??= linkedFiles().then(
      async (linked) => {
        if (linked === undefined) return undefined;
        const folder = vscode.workspace.workspaceFolders?.[0];
        const language = vscode.workspace
          .getConfiguration('etch', folder?.uri)
          .get<string>('language', DEFAULT_LANGUAGE);
        const localisation = await loadPlaysetLocalisation(linked.files, language);
        this.output.info(
          `Localisation hints: ${String(localisation.size)} keys in ${language} from ${linked.playset}`,
        );
        return { files: linked.files, localisation };
      },
      (error: unknown) => {
        this.output.warn(`Localisation hints: the playset could not be read: ${messageOf(error)}`);
        return undefined;
      },
    );
    return this.loaded;
  }
}

function enabled(document: vscode.TextDocument): boolean {
  return vscode.workspace.getConfiguration('etch', document.uri).get<boolean>(SETTING, true);
}

/**
 * Where `key:` starts in a localisation file's text: its 0-based line and column. The last such
 * line wins, as the core's `Localisation` keeps the last value of a key written twice in a file.
 */
export function keyLine(text: string, key: string): { line: number; column: number } | undefined {
  const lines = text.split('\n');
  for (let line = lines.length - 1; line >= 0; line--) {
    const content = lines[line] ?? '';
    const trimmed = content.trimStart();
    if (trimmed.startsWith(`${key}:`)) {
      return { line, column: content.length - trimmed.length };
    }
  }
  return undefined;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Registers the hints and definitions; the returned object is for Etch's tests. */
export function registerLocalisationHints(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): LocalisationHints {
  const hints = new LocalisationHints(output);
  context.subscriptions.push(
    hints,
    vscode.languages.registerInlayHintsProvider(SELECTOR, hints),
    vscode.languages.registerDefinitionProvider(SELECTOR, hints),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('etch.gamePath') ||
        event.affectsConfiguration('etch.playset') ||
        event.affectsConfiguration('etch.language') ||
        event.affectsConfiguration(`etch.${SETTING}`)
      ) {
        hints.reset();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      hints.reset();
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (/\.yml$/i.test(document.fileName)) hints.reset();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      hints.forget(document);
    }),
  );
  return hints;
}
