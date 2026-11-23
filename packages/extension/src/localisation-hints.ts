// Localisation inlay hints (ADR 0008): a value of a `.gui` or script file that names a key the
// playset's localisation defines gets the key's text as an inlay hint, in the plain form of
// profile labels, and Go to Definition opens the key's line in its `.yml` file. A hover on the
// key, and on its hint, shows the whole text as the game colours it, with its language, file and
// line (localisation-markup.ts). The localisation is the playset's in `etch.language`, read once
// and again after a `.yml` file is saved or the game path, playset or language changes; it is the
// same playset the sprite links read, which give the hover its colours and icons.
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
import { loadPlaysetLocalisation, type GameFile, type GameFiles } from '@etch/core/playset';
import { plainLabelText } from '@etch/core/profile';
import { colouredText, escapeHtml, iconSprites } from './localisation-markup.ts';
import { linkedFiles } from './script-profile-view.ts';
import type { TextArt } from './sprite-links.ts';
import { readGamePath } from '@etch/core/playset';
import { pathUri } from './dlc-files.ts';

/** The longest side of an icon in a hover's text, in pixels: about a line of the hover's text. */
const ICON_SIZE = 18;

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

/** A hint that knows its key, so that its tooltip is made when VS Code shows it. */
class KeyHint extends vscode.InlayHint {
  readonly key: string;

  constructor(position: vscode.Position, label: string, key: string) {
    super(position, label);
    this.key = key;
  }
}

export class LocalisationHints
  implements vscode.InlayHintsProvider<KeyHint>, vscode.DefinitionProvider, vscode.HoverProvider
{
  private loaded: Promise<Loaded | undefined> | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this.changed.event;
  private readonly output: vscode.LogOutputChannel;
  private readonly art: TextArt | undefined;
  private readonly parsed = new Map<
    string,
    { version: number; references: LocalisationReference[] }
  >();

  constructor(output: vscode.LogOutputChannel, art?: TextArt) {
    this.output = output;
    this.art = art;
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

  async provideInlayHints(document: vscode.TextDocument, range: vscode.Range): Promise<KeyHint[]> {
    if (!enabled(document)) return [];
    const path = localisationReferencePath(document.fileName);
    if (path === undefined) return [];
    const loaded = await this.localisation();
    if (loaded === undefined) return [];
    const start = document.offsetAt(range.start);
    const end = document.offsetAt(range.end);
    const hints: KeyHint[] = [];
    for (const { node, key } of this.references(document, path)) {
      if (node.end < start || node.start > end) continue;
      const text = loaded.localisation.get(key);
      if (text === undefined) continue;
      const plain = plainLabelText(text);
      if (plain === undefined) continue;
      const hint = new KeyHint(document.positionAt(node.end), plain, key);
      hint.paddingLeft = true;
      hints.push(hint);
    }
    return hints;
  }

  /** The hint's tooltip: the key's hover. */
  async resolveInlayHint(hint: KeyHint): Promise<KeyHint> {
    const loaded = await this.localisation();
    const tooltip = loaded === undefined ? undefined : await this.describe(loaded, hint.key);
    if (tooltip !== undefined) hint.tooltip = tooltip;
    return hint;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const found = this.referenceAt(document, position);
    if (found === undefined) return undefined;
    const loaded = await this.localisation();
    const markdown = loaded === undefined ? undefined : await this.describe(loaded, found.key);
    if (markdown === undefined) return undefined;
    const { node } = found;
    const quoted = node.quoted && node.end - node.start >= 2;
    return new vscode.Hover(
      markdown,
      new vscode.Range(
        document.positionAt(quoted ? node.start + 1 : node.start),
        document.positionAt(quoted ? node.end - 1 : node.end),
      ),
    );
  }

  /**
   * A key's text as the game colours it, with its language, and the file, line and playset layer
   * that define it; undefined for a key the playset does not define.
   */
  private async describe(loaded: Loaded, key: string): Promise<vscode.MarkdownString | undefined> {
    const text = loaded.localisation.get(key);
    if (text === undefined) return undefined;
    const colours = (await this.art?.textColours()) ?? {};
    const icons = new Map<string, string>();
    for (const sprite of iconSprites(text)) {
      const uri = await this.art?.spriteUri(sprite, ICON_SIZE);
      if (uri !== undefined) icons.set(sprite, uri);
    }
    const markdown = new vscode.MarkdownString();
    markdown.supportHtml = true;
    markdown.appendMarkdown(
      `**${escapeHtml(key)}** · localisation · ${loaded.localisation.language}\n\n`,
    );
    markdown.appendMarkdown(`${colouredText(text, colours, icons)}\n\n`);
    const at = await definitionOf(loaded, key);
    if (at !== undefined) {
      const layer = at.file.layer.name === 'game' ? 'the game' : at.file.layer.name;
      markdown.appendMarkdown(
        `Defined in \`${at.file.path}:${String(at.line + 1)}\` — ${escapeHtml(layer)}`,
      );
    }
    return markdown;
  }

  private referenceAt(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): LocalisationReference | undefined {
    if (!enabled(document)) return undefined;
    const path = localisationReferencePath(document.fileName);
    if (path === undefined) return undefined;
    const offset = document.offsetAt(position);
    return this.references(document, path).find(
      ({ node }) => node.start <= offset && offset <= node.end,
    );
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location | undefined> {
    const found = this.referenceAt(document, position);
    if (found === undefined) return undefined;
    const loaded = await this.localisation();
    const at = loaded === undefined ? undefined : await definitionOf(loaded, found.key);
    if (at === undefined) return undefined;
    return new vscode.Location(
      pathUri(at.file.absolutePath),
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

/** The `.yml` file that defines a key the game shows, and the key's line and column in it. */
async function definitionOf(
  loaded: Loaded,
  key: string,
): Promise<{ file: GameFile; line: number; column: number } | undefined> {
  const source = loaded.localisation.source(key);
  const file = source === undefined ? undefined : await loaded.files.find(source.path);
  if (file === undefined) return undefined;
  const text = decodeGameText(await readGamePath(file.absolutePath), 'localisation').text;
  const replace = file.path.replace(/\\/g, '/').toLowerCase().startsWith('localisation/replace/');
  const at = keyLine(text, key, replace);
  return at === undefined ? undefined : { file, ...at };
}

function enabled(document: vscode.TextDocument): boolean {
  return vscode.workspace.getConfiguration('etch', document.uri).get<boolean>(SETTING, true);
}

/**
 * Where `key:` starts in a localisation file's text: its 0-based line and column. Of a key written
 * twice in a file, the game keeps the first value, and in a `localisation/replace` file the last
 * (`last`), as the core's `Localisation` does; that line wins.
 */
export function keyLine(
  text: string,
  key: string,
  last = false,
): { line: number; column: number } | undefined {
  const lines = text.split('\n');
  const order = lines.map((_, line) => line);
  if (last) order.reverse();
  for (const line of order) {
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

/**
 * Registers the hints, hovers and definitions; `art` gives the hovers the playset's colours and
 * icons. The returned object is for Etch's tests.
 */
export function registerLocalisationHints(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
  art?: TextArt,
): LocalisationHints {
  const hints = new LocalisationHints(output, art);
  context.subscriptions.push(
    hints,
    vscode.languages.registerInlayHintsProvider(SELECTOR, hints),
    vscode.languages.registerDefinitionProvider(SELECTOR, hints),
    vscode.languages.registerHoverProvider(SELECTOR, hints),
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
