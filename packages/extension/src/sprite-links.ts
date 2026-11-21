// Hovers and Go to Definition on the sprite names of `.gui` files (`spriteType`,
// `quadTextureSprite`, a list's `background`) and of script files (an event's `picture`, a
// mission's and an estate privilege's `icon`, the keys of `SCRIPT_SPRITE_KEYS`): the hover names the sprite's kind, frames and the
// `.gfx` file and playset layer that define it, then its texture with its facts and a thumbnail
// (the first frame of a strip); Go to Definition (F12, Ctrl+click) opens that `.gfx` file at the
// sprite's name. The sprite is the one the game draws: the last definition in load order
// (`InterfaceIndex`), over the playset the script profile and the asset links use.

import { readFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import {
  decodeGameText,
  parseScript,
  isSpriteScriptPath,
  readGuiFile,
  scriptSpriteReferences,
  spriteReferences,
  SPRITE_SCRIPT_FOLDERS,
  textureCandidates,
  type Located,
  type Sprite,
  type SpriteReference,
} from '@etch/core';
import { PlaysetInterface, type GameFile, type GameFiles } from '@etch/core/playset';
import { linkedFiles } from './script-profile-view.ts';
import { TextureThumbnails } from './texture-thumbnail.ts';

export const GUI_SELECTOR: vscode.DocumentSelector = [{ scheme: 'file', pattern: '**/*.gui' }];

/** The script files that name sprites; the folders in the file's path decide which key. */
export const SPRITE_SCRIPT_SELECTOR: vscode.DocumentSelector = SPRITE_SCRIPT_FOLDERS.map(
  (folder) => ({ scheme: 'file', pattern: `**/${folder}/**/*.txt` }),
);

export interface Loaded {
  readonly files: GameFiles;
  readonly ui: PlaysetInterface;
  /** The edited mod's folder; `undefined` without a workspace mod (the game folder alone). */
  readonly editedRoot: string | undefined;
}

export class SpriteLinks implements vscode.HoverProvider, vscode.DefinitionProvider {
  private loaded: Promise<Loaded | undefined> | undefined;
  private readonly thumbnails = new TextureThumbnails();
  private readonly output: vscode.LogOutputChannel;

  constructor(output: vscode.LogOutputChannel) {
    this.output = output;
  }

  /** Forgets the playset's interface: after a setting, workspace or `.gfx` file changes. */
  reset(): void {
    this.loaded = undefined;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const found = referenceAt(document, position);
    if (found === undefined) return undefined;
    const loaded = await this.playset();
    if (loaded === undefined) return undefined;
    const sprite = loaded.ui.index.sprite(found.reference.name);
    if (sprite === undefined) {
      // A `.gui` file's diagnostics report a missing sprite; a script file has none.
      if (found.script) {
        return new vscode.Hover(
          new vscode.MarkdownString(
            `**${found.reference.name}** · no sprite of that name in the playset's \`.gfx\` files. ` +
              'Etch does not read the DLC archives, which define many event pictures.',
          ),
          found.range,
        );
      }
      return undefined;
    }
    return new vscode.Hover(await this.describe(loaded, sprite), found.range);
  }

  /**
   * A sprite's kind, frames, `.gfx` file and texture with its thumbnail, as its hover shows it;
   * completion shows the same for a sprite name it offers.
   */
  async describe(loaded: Loaded, sprite: Located<Sprite>): Promise<vscode.MarkdownString> {
    const definitions = loaded.ui.index.spriteDefinitions(sprite.item.name).length;
    const { item } = sprite;
    const markdown = new vscode.MarkdownString();
    const frames = item.frames > 1 ? ` · ${String(item.frames)} frames` : '';
    markdown.appendMarkdown(`**${item.name}** · ${item.kind}${frames}\n\n`);
    const gfx = await loaded.files.find(sprite.path);
    markdown.appendMarkdown(`Defined in \`${sprite.path}\` — ${layerName(gfx)}`);
    if (definitions > 1) {
      markdown.appendMarkdown(` (defined ${String(definitions)} times; the last one wins)`);
    }
    const texture = item.textures[0];
    if (texture !== undefined) {
      const file = await findTexture(loaded.files, texture.path);
      if (file === undefined) {
        markdown.appendMarkdown(`\n\n**Texture not in the playset:** \`${texture.path}\``);
      } else {
        markdown.appendMarkdown(`\n\nTexture \`${file.path}\` — ${layerName(file)}`);
        try {
          markdown.appendMarkdown(
            `\n\n${await this.thumbnails.markdown(file.absolutePath, item.frames)}`,
          );
        } catch (error) {
          markdown.appendMarkdown(`\n\nEtch cannot show it: ${messageOf(error)}.`);
        }
      }
    }
    return markdown;
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location | undefined> {
    const found = referenceAt(document, position);
    if (found === undefined) return undefined;
    const loaded = await this.playset();
    if (loaded === undefined) return undefined;
    const sprite = loaded.ui.index.sprite(found.reference.name);
    if (sprite === undefined) return undefined;
    return this.locationOf(loaded.files, sprite);
  }

  /** The sprite's name in its `.gfx` file, counted in the file's game text. */
  private async locationOf(
    files: GameFiles,
    sprite: Located<Sprite>,
  ): Promise<vscode.Location | undefined> {
    const file = await files.find(sprite.path);
    if (file === undefined) return undefined;
    const text = decodeGameText(await readFile(file.absolutePath), 'interface').text;
    const { nameNode } = sprite.item;
    const start = nameNode.quoted ? nameNode.start + 1 : nameNode.start;
    const end = nameNode.quoted ? nameNode.end - 1 : nameNode.end;
    return new vscode.Location(
      vscode.Uri.file(file.absolutePath),
      new vscode.Range(positionIn(text, start), positionIn(text, end)),
    );
  }

  /** The playset's files and interface, loaded once until {@link reset}; shared with completion. */
  playset(): Promise<Loaded | undefined> {
    this.loaded ??= linkedFiles().then(
      async (linked) =>
        linked === undefined
          ? undefined
          : {
              files: linked.files,
              ui: await PlaysetInterface.load(linked.files),
              editedRoot: linked.editedRoot,
            },
      (error: unknown) => {
        this.output.warn(`Sprite hovers: the playset could not be read: ${messageOf(error)}`);
        return undefined;
      },
    );
    return this.loaded;
  }
}

/**
 * The game path of a script file that names sprites, from the folders in its file name: from the
 * last folder of `SPRITE_SCRIPT_FOLDERS` (`events`, `missions`, `common/estate_privileges` …) on,
 * as a mod or the game folder holds them at its root.
 */
export function spriteScriptPath(fileName: string): string | undefined {
  const slashed = fileName.replace(/\\/g, '/');
  const lower = slashed.toLowerCase();
  let at = -1;
  for (const folder of SPRITE_SCRIPT_FOLDERS) {
    at = Math.max(at, lower.lastIndexOf(`/${folder}/`));
  }
  if (at < 0) return undefined;
  const path = slashed.slice(at + 1);
  return isSpriteScriptPath(path) ? path : undefined;
}

/**
 * The sprite reference under the cursor, with its range inside the quotes: in a `.gui` file, or
 * in a script file whose folder names sprites (`scriptSpriteReferences`).
 */
function referenceAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { reference: SpriteReference; range: vscode.Range; script: boolean } | undefined {
  const offset = document.offsetAt(position);
  const script = !/\.gui$/i.test(document.fileName);
  const reference = documentSpriteReferences(document).find(
    ({ node }) => node.start <= offset && offset <= node.end,
  );
  if (reference === undefined) return undefined;
  const { node } = reference;
  const start = node.quoted ? node.start + 1 : node.start;
  const end = node.quoted && node.end - node.start >= 2 ? node.end - 1 : node.end;
  return {
    reference,
    range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
    script,
  };
}

/**
 * Every sprite name a `.gui` file or a script file that names sprites writes, in text order;
 * none for another document. Shared with the gutter thumbnails.
 */
export function documentSpriteReferences(document: vscode.TextDocument): SpriteReference[] {
  if (/\.gui$/i.test(document.fileName)) {
    return spriteReferences(readGuiFile(parseScript(document.getText())));
  }
  const path = spriteScriptPath(document.fileName);
  if (path === undefined) return [];
  return scriptSpriteReferences(path, parseScript(document.getText(), { script: true }));
}

/** The texture file a sprite's `texturefile` names, as the game finds it; shared with the gutter. */
export async function findTexture(
  files: GameFiles,
  written: string,
): Promise<GameFile | undefined> {
  for (const candidate of textureCandidates(written)) {
    const file = await files.find(candidate);
    if (file !== undefined) return file;
  }
  return undefined;
}

function layerName(file: GameFile | undefined): string {
  if (file === undefined) return 'not found';
  return file.layer.name === 'game' ? 'the game' : file.layer.name;
}

function positionIn(text: string, offset: number): vscode.Position {
  let line = 0;
  let lineStart = 0;
  for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) {
    line++;
    lineStart = i + 1;
  }
  return new vscode.Position(line, offset - lineStart);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Registers the hovers and definitions; the returned object is for Etch's tests. */
export function registerSpriteLinks(
  context: vscode.ExtensionContext,
  output: vscode.LogOutputChannel,
): SpriteLinks {
  const links = new SpriteLinks(output);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(GUI_SELECTOR, links),
    vscode.languages.registerDefinitionProvider(GUI_SELECTOR, links),
    vscode.languages.registerHoverProvider(SPRITE_SCRIPT_SELECTOR, links),
    vscode.languages.registerDefinitionProvider(SPRITE_SCRIPT_SELECTOR, links),
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
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (/\.gfx$/i.test(document.fileName)) links.reset();
    }),
  );
  return links;
}
