// Hovers and Go to Definition on font names (ADR 0008): in `.gui` files, a widget's `font` and
// `buttonFont`, the keys completion offers fonts for; in `.gfx` files, the `font` of an
// `objectTypes` entry's `textblock` (vanilla's `animatedmaptext`). The hover names the
// `bitmapfont`, the `.gfx` file and playset layer that define it, its `path`, `color` and
// `border_color`, its `.fnt` file and texture, and a line of sample text drawn in it; Go to
// Definition (F12, Ctrl+click) opens that `.gfx` file at the font's name. The font is the one the
// preview draws with: the first definition in load order (`InterfaceIndex.font`), over the
// playset the sprite links load.

import * as vscode from 'vscode';
import {
  decodeGameText,
  fontFilePaths,
  gfxFontReferences,
  guiFontReferences,
  normaliseGamePath,
  parseBmFont,
  parseScript,
  readGuiFile,
  type FontDefinition,
  type FontReference,
  type Located,
} from '@etch/core';
import { statGamePath, type GameFile, type GameFiles } from '@etch/core/playset';
import { inspectTexture } from '@etch/renderer/inspect';
import { pathUri } from './dlc-files.ts';
import { fontSample } from './font-sample.ts';
import { encodePng } from './png.ts';
import { GUI_SELECTOR, type Loaded, type SpriteLinks } from './sprite-links.ts';

export const GFX_SELECTOR: vscode.DocumentSelector = [{ scheme: 'file', pattern: '**/*.gfx' }];

/** Samples kept. */
const CACHE_SIZE = 32;

export class FontLinks implements vscode.HoverProvider, vscode.DefinitionProvider {
  private readonly links: SpriteLinks;
  private readonly output: vscode.LogOutputChannel;
  private readonly samples = new Map<string, Promise<string>>();

  constructor(links: SpriteLinks, output: vscode.LogOutputChannel) {
    this.links = links;
    this.output = output;
  }

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | undefined> {
    const found = referenceAt(document, position);
    if (found === undefined) return undefined;
    const loaded = await this.links.playset();
    if (loaded === undefined) return undefined;
    const font = loaded.ui.index.font(found.reference.name);
    if (font === undefined) {
      // A `.gui` file's diagnostics report a missing font; a `.gfx` file's textblock has none.
      if (!found.gui) {
        return new vscode.Hover(
          new vscode.MarkdownString(
            `**${found.reference.name}** · no font of that name in the playset's \`.gfx\` files.`,
          ),
          found.range,
        );
      }
      return undefined;
    }
    return new vscode.Hover(await this.describe(loaded, font), found.range);
  }

  /** A font's definition, files and sample, as its hover shows it. */
  async describe(loaded: Loaded, font: Located<FontDefinition>): Promise<vscode.MarkdownString> {
    const { item } = font;
    const definitions = loaded.ui.index.fontDefinitions(item.name).length;
    const markdown = new vscode.MarkdownString();
    markdown.supportHtml = true;
    markdown.appendMarkdown(`**${item.name}** · font\n\n`);
    const gfx = await loaded.files.find(font.path);
    markdown.appendMarkdown(`Defined in \`${font.path}\` — ${layerName(gfx)}`);
    if (definitions > 1) {
      markdown.appendMarkdown(` (defined ${String(definitions)} times; Etch uses the first one)`);
    }
    const facts = [item.path === undefined ? 'no `path`' : `Path \`${item.path}\``];
    if (item.colour !== undefined) facts.push(`colour ${colourText(item.colour)}`);
    if (item.borderColour !== undefined) facts.push(`border ${colourText(item.borderColour)}`);
    markdown.appendMarkdown(`\n\n${facts.join(' · ')}`);
    if (item.path === undefined) return markdown;

    const paths = fontFilePaths(normaliseGamePath(item.path));
    const fnt = await loaded.files.find(paths.fnt);
    const texture = await firstFile(loaded.files, paths.textures);
    if (fnt === undefined) {
      markdown.appendMarkdown(`\n\n**Not in the playset:** \`${paths.fnt}\``);
    }
    if (texture === undefined) {
      markdown.appendMarkdown(`\n\n**Not in the playset:** \`${paths.textures.join('` or `')}\``);
    }
    if (fnt === undefined || texture === undefined) return markdown;
    try {
      markdown.appendMarkdown(`\n\n${await this.sample(loaded.files, item, fnt, texture)}`);
    } catch (error) {
      markdown.appendMarkdown(`\n\nEtch cannot show it: ${messageOf(error)}.`);
    }
    return markdown;
  }

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Location | undefined> {
    const found = referenceAt(document, position);
    if (found === undefined) return undefined;
    const loaded = await this.links.playset();
    const font = loaded?.ui.index.font(found.reference.name);
    if (loaded === undefined || font === undefined) return undefined;
    const file = await loaded.files.find(font.path);
    if (file === undefined) return undefined;
    const text = decodeGameText(await loaded.files.readFile(file), 'interface').text;
    const { nameNode } = font.item;
    const start = nameNode.quoted ? nameNode.start + 1 : nameNode.start;
    const end = nameNode.quoted ? nameNode.end - 1 : nameNode.end;
    return new vscode.Location(
      pathUri(file.absolutePath),
      new vscode.Range(positionIn(text, start), positionIn(text, end)),
    );
  }

  /** The `.fnt` and texture facts and the sample's picture, cached by file, time and size. */
  private async sample(
    files: GameFiles,
    font: FontDefinition,
    fnt: GameFile,
    texture: GameFile,
  ): Promise<string> {
    const [fntInfo, textureInfo] = await Promise.all([
      statGamePath(fnt.absolutePath),
      statGamePath(texture.absolutePath),
    ]);
    const key = [
      fnt.absolutePath,
      String(fntInfo.mtimeMs),
      String(fntInfo.size),
      texture.absolutePath,
      String(textureInfo.mtimeMs),
      String(textureInfo.size),
      String(font.colour),
      String(font.borderColour),
    ].join('|');
    let entry = this.samples.get(key);
    if (entry === undefined) {
      entry = render(files, font, fnt, texture);
      this.samples.set(key, entry);
      entry.catch((error: unknown) => {
        this.samples.delete(key);
        this.output.warn(`Font ${font.name}: ${messageOf(error)}`);
      });
      if (this.samples.size > CACHE_SIZE) {
        const oldest = this.samples.keys().next().value;
        if (oldest !== undefined) this.samples.delete(oldest);
      }
    }
    return entry;
  }
}

async function render(
  files: GameFiles,
  font: FontDefinition,
  fntFile: GameFile,
  textureFile: GameFile,
): Promise<string> {
  // BMFont text files are Windows-1252; their syntax is ASCII, so Latin-1 reads them.
  const fnt = parseBmFont(Buffer.from(await files.readFile(fntFile)).toString('latin1')).font;
  const { summary, rgba } = inspectTexture(
    textureFile.path,
    Uint8Array.from(await files.readFile(textureFile)),
  );
  const sample = fontSample(
    fnt,
    { width: summary.width, height: summary.height, rgba },
    font.colour,
    font.borderColour,
  );
  const png = encodePng(sample.width, sample.height, sample.rgba);
  const lines = [
    `Glyphs \`${fntFile.path}\` — ${layerName(fntFile)} · ${String(fnt.glyphs.size)} characters · line height ${String(fnt.lineHeight)}`,
    `Texture \`${textureFile.path}\` — ${layerName(textureFile)} · ${String(summary.width)} × ${String(summary.height)} · ${summary.container} ${summary.format}`,
    `![Sample text in ${font.name}](data:image/png;base64,${Buffer.from(png).toString('base64')})`,
  ];
  const notes = [sample.scale === 2 ? 'At 2×.' : ''];
  if (sample.missing > 0) {
    notes.push(`The font has no glyph for ${String(sample.missing)} of the sample's characters.`);
  }
  const note = notes.filter((n) => n !== '').join(' ');
  return lines.join('\n\n') + (note === '' ? '' : `\n\n${note}`);
}

/**
 * The font reference under the cursor, with its range inside the quotes: a `font` or
 * `buttonFont` in a `.gui` file, or a textblock's `font` in a `.gfx` file.
 */
function referenceAt(
  document: vscode.TextDocument,
  position: vscode.Position,
): { reference: FontReference; range: vscode.Range; gui: boolean } | undefined {
  const offset = document.offsetAt(position);
  const gui = /\.gui$/i.test(document.fileName);
  if (!gui && !/\.gfx$/i.test(document.fileName)) return undefined;
  const parsed = parseScript(document.getText());
  const references = gui ? guiFontReferences(readGuiFile(parsed)) : gfxFontReferences(parsed);
  const reference = references.find(({ node }) => node.start <= offset && offset <= node.end);
  if (reference === undefined) return undefined;
  const { node } = reference;
  const start = node.quoted ? node.start + 1 : node.start;
  const end = node.quoted && node.end - node.start >= 2 ? node.end - 1 : node.end;
  return {
    reference,
    range: new vscode.Range(document.positionAt(start), document.positionAt(end)),
    gui,
  };
}

async function firstFile(
  files: GameFiles,
  paths: readonly string[],
): Promise<GameFile | undefined> {
  for (const path of paths) {
    const file = await files.find(path);
    if (file !== undefined) return file;
  }
  return undefined;
}

/** `0xAARRGGBB` with a swatch of its colour (VS Code colours a hover's `<span>`). */
function colourText(argb: number): string {
  const hex = (argb >>> 0).toString(16).padStart(8, '0');
  return `<span style="color:#${hex.slice(2)};">■</span> \`0x${hex}\``;
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
export function registerFontLinks(
  context: vscode.ExtensionContext,
  links: SpriteLinks,
  output: vscode.LogOutputChannel,
): FontLinks {
  const fonts = new FontLinks(links, output);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(GUI_SELECTOR, fonts),
    vscode.languages.registerDefinitionProvider(GUI_SELECTOR, fonts),
    vscode.languages.registerHoverProvider(GFX_SELECTOR, fonts),
    vscode.languages.registerDefinitionProvider(GFX_SELECTOR, fonts),
  );
  return fonts;
}
