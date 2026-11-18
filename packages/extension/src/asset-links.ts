// Links and hovers on the asset paths of `.gfx` and `.asset` files: a texture, mesh or animation
// path is a link to the file the playset resolves it to (a texture opens in Etch Texture
// Preview), and hovering a texture path shows the texture, its size and format, and which layer of
// the playset it comes from. Paths resolve as `assetReferences` (core) says; the playset is the
// one the script profile and the province id check use (`linkedFiles`).

import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { assetReferences, parseScript, type AssetReference } from '@etch/core';
import type { GameFiles } from '@etch/core/playset';
import { inspectTexture } from '@etch/renderer/inspect';
import { encodePng, thumbnail } from './png.ts';
import { linkedFiles } from './script-profile-view.ts';

/** The files whose asset paths get links and hovers. */
export const ASSET_SELECTOR: vscode.DocumentSelector = [
  { scheme: 'file', pattern: '**/*.gfx' },
  { scheme: 'file', pattern: '**/*.asset' },
];

/** The thumbnail's longest side in a hover, in pixels. */
const THUMBNAIL_SIZE = 128;
/** Thumbnails kept, by file and modification time. */
const CACHE_SIZE = 32;

/** Where an asset path leads: the file on disk and the layer of the playset it comes from. */
export interface ResolvedAsset {
  readonly absolutePath: string;
  /** Game-relative, as the playset found it; the file name for one beside the naming file. */
  readonly path: string;
  /** `the game`, a mod's name, or `beside this file` outside the playset. */
  readonly source: string;
}

export class AssetLinks implements vscode.DocumentLinkProvider, vscode.HoverProvider {
  private files: Promise<GameFiles | undefined> | undefined;
  private readonly thumbnails = new Map<string, Promise<string>>();
  private readonly output: vscode.LogOutputChannel;

  constructor(output: vscode.LogOutputChannel) {
    this.output = output;
  }

  /** Forgets the playset, after a change of `etch.gamePath`, `etch.playset` or the workspace. */
  reset(): void {
    this.files = undefined;
  }

  /**
   * A link for each path the playset resolves; a path it does not resolve gets none (its hover
   * says so). The playset's folder listings are cached, so resolving them all is cheap.
   */
  async provideDocumentLinks(document: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
    const links: vscode.DocumentLink[] = [];
    for (const { reference, range } of references(document)) {
      const resolved = await this.resolve(document.uri, reference);
      if (resolved === undefined) continue;
      const link = new vscode.DocumentLink(range, vscode.Uri.file(resolved.absolutePath));
      link.tooltip = `${resolved.path} (${resolved.source})`;
      links.push(link);
    }
    return links;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const found = references(document).find(({ range }) => range.contains(position));
    if (found === undefined) return undefined;
    const { reference, range } = found;
    const resolved = await this.resolve(document.uri, reference);
    const markdown = new vscode.MarkdownString();
    if (resolved === undefined) {
      markdown.appendMarkdown('**Not in the playset:** ');
      markdown.appendMarkdown(reference.candidates.map((c) => `\`${c}\``).join(', '));
      return new vscode.Hover(markdown, range);
    }
    markdown.appendMarkdown(`\`${resolved.path}\` — ${resolved.source}`);
    if (reference.kind === 'texture') {
      try {
        markdown.appendMarkdown(`\n\n${await this.thumbnail(resolved.absolutePath)}`);
      } catch (error) {
        markdown.appendMarkdown(`\n\nEtch cannot show it: ${messageOf(error)}.`);
      }
    }
    return new vscode.Hover(markdown, range);
  }

  /** The file an asset path leads to, or `undefined` when the playset has none. */
  async resolve(
    document: vscode.Uri,
    reference: AssetReference,
  ): Promise<ResolvedAsset | undefined> {
    const files = await this.playset();
    if (reference.folder === 'game') {
      for (const candidate of reference.candidates) {
        const file = await files?.find(candidate);
        if (file !== undefined) return described(file.absolutePath, file.path, file.layer.name);
      }
      return undefined;
    }
    // A bare name: in the naming file's folder, through the playset when the file is in one of
    // its layers, else on disk beside it.
    const folder = files === undefined ? undefined : layerFolder(files, document.fsPath);
    for (const candidate of reference.candidates) {
      if (folder !== undefined && files !== undefined) {
        const file = await files.find(folder === '' ? candidate : `${folder}/${candidate}`);
        if (file !== undefined) return described(file.absolutePath, file.path, file.layer.name);
      }
      const beside = path.join(path.dirname(document.fsPath), candidate);
      if (await isFile(beside)) {
        return { absolutePath: beside, path: candidate, source: 'beside this file' };
      }
    }
    return undefined;
  }

  private playset(): Promise<GameFiles | undefined> {
    this.files ??= linkedFiles().then(
      (linked) => linked?.files,
      (error: unknown) => {
        this.output.warn(`Asset links: the playset could not be read: ${messageOf(error)}`);
        return undefined;
      },
    );
    return this.files;
  }

  /** The thumbnail's Markdown: a line of facts and the image, cached by file and time. */
  private async thumbnail(absolutePath: string): Promise<string> {
    const info = await stat(absolutePath);
    const key = `${absolutePath}|${String(info.mtimeMs)}|${String(info.size)}`;
    let entry = this.thumbnails.get(key);
    if (entry === undefined) {
      entry = (async () => {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
        const { summary, rgba } = inspectTexture(absolutePath, Uint8Array.from(bytes));
        const small = thumbnail(summary.width, summary.height, rgba, THUMBNAIL_SIZE);
        const png = Buffer.from(encodePng(small.width, small.height, small.rgba)).toString(
          'base64',
        );
        const facts = [
          `${String(summary.width)} × ${String(summary.height)}`,
          `${summary.container} ${summary.format}${summary.dx10 ? ' (DX10 header)' : ''}`,
          summary.mipLevels === 1 ? 'no mip chain' : `${String(summary.mipLevels)} mip levels`,
          summary.hasAlpha ? 'alpha used' : 'opaque',
        ];
        return `${facts.join(' · ')}\n\n![${path.basename(absolutePath)}](data:image/png;base64,${png})`;
      })();
      this.thumbnails.set(key, entry);
      entry.catch(() => this.thumbnails.delete(key));
      if (this.thumbnails.size > CACHE_SIZE) {
        const oldest = this.thumbnails.keys().next().value;
        if (oldest !== undefined) this.thumbnails.delete(oldest);
      }
    }
    return entry;
  }
}

/** The asset paths of a document with their ranges inside the quotes. */
function references(
  document: vscode.TextDocument,
): { reference: AssetReference; range: vscode.Range }[] {
  return assetReferences(parseScript(document.getText())).map((reference) => {
    const { node } = reference;
    const start = node.quoted ? node.start + 1 : node.start;
    const end = node.quoted && node.end - node.start >= 2 ? node.end - 1 : node.end;
    return {
      reference,
      range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
    };
  });
}

/** The game-relative folder of a file inside one of the playset's layers, last layer first. */
function layerFolder(files: GameFiles, file: string): string | undefined {
  for (const layer of [...files.layers].reverse()) {
    const relative = path.relative(layer.root, path.dirname(file));
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return relative.replace(/\\/g, '/');
    }
  }
  return undefined;
}

function described(absolutePath: string, gamePath: string, layer: string): ResolvedAsset {
  return { absolutePath, path: gamePath, source: layer === 'game' ? 'the game' : layer };
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Registers the links and hovers; the returned object is for Etch's tests. */
export function registerAssetLinks(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): AssetLinks {
  const links = new AssetLinks(output);
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(ASSET_SELECTOR, links),
    vscode.languages.registerHoverProvider(ASSET_SELECTOR, links),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration('etch.gamePath') ||
        event.affectsConfiguration('etch.playset')
      ) {
        links.reset();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      links.reset();
    }),
  );
  return links;
}
