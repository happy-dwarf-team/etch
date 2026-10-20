/**
 * Reference checks of one `.gui` or `.gfx` file against the playset: sprites, fonts, textures,
 * top-level definitions and sibling widgets (spec section 10, etch#4). Files are looked up
 * through a synchronous `exists`, so a warm reload never waits on the disk.
 */
import type { PropertyNode, ScalarNode } from '../script/tree.ts';
import { fontFilePaths } from '../text/bmfont.ts';
import { diagnostic, type ModelDiagnostic } from './diagnostics.ts';
import type { FontDefinition, GfxFile, Sprite } from './gfx.ts';
import { allWidgets, type GuiFile, type Widget } from './gui.ts';
import type { InterfaceIndex, Located } from './interface-index.ts';
import { keyOf, scalarText } from './properties.ts';

/** Whether a game-relative file exists in the playset (any layer, after `replace_path`). */
export type FileExists = (path: string) => boolean;

/** A game-relative path with `/` separators, as `.gfx` files write it with `\`, `/` or `//`. */
export function normaliseGamePath(path: string): string {
  return path
    .trim()
    .replace(/[\\/]+/g, '/')
    .replace(/^\//, '');
}

/**
 * The files to try for a texture path, in order. A `.tga` path falls back to the `.dds` of the
 * same name: in vanilla 1.37.5, 584 sprites name a `.tga` that exists only as `.dds`, and the game
 * draws them. Which of the two the game takes when both exist (7 vanilla paths) is unverified.
 */
export function textureCandidates(path: string): string[] {
  const normal = normaliseGamePath(path);
  return /\.tga$/i.test(normal) ? [normal, normal.replace(/\.tga$/i, '.dds')] : [normal];
}

/** The texture file a path resolves to, or `undefined` when no candidate exists. */
export function resolveTexture(path: string, exists: FileExists): string | undefined {
  return textureCandidates(path).find(exists);
}

/** The font's `.fnt` file and texture that exist, if any. */
export function resolveFontFiles(
  font: FontDefinition,
  exists: FileExists,
): { fnt: string | undefined; texture: string | undefined } {
  if (font.path === undefined) return { fnt: undefined, texture: undefined };
  const files = fontFilePaths(normaliseGamePath(font.path));
  return { fnt: exists(files.fnt) ? files.fnt : undefined, texture: files.textures.find(exists) };
}

const SPRITE_KEYS = new Set(['spritetype', 'quadtexturesprite']);
const FONT_KEYS = new Set(['font', 'buttonfont']);
/** Keys of `scrollbarType` that name one of its child buttons. */
const SCROLLBAR_PART_KEYS = new Set(['slider', 'track', 'leftbutton', 'rightbutton']);

/** The `.gui` file's own diagnostics and its references checked against the playset. */
export function guiDiagnostics(
  file: GuiFile,
  index: InterfaceIndex,
  exists: FileExists,
): ModelDiagnostic[] {
  const out: ModelDiagnostic[] = [...file.diagnostics];
  for (const { widget, parent } of allWidgets(file)) {
    for (const property of referenceProperties(widget)) {
      const value = property.value;
      if (value?.kind !== 'scalar') continue;
      const text = scalarText(value, file.constants);
      if (text === undefined || text === '') continue;
      checkWidgetReference(widget, parent, keyOf(property), value, text, index, exists, out);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** A widget's properties including those of every `if_resolution` block, whichever applies. */
function* referenceProperties(widget: Widget): Generator<PropertyNode> {
  for (const property of widget.properties) {
    if (keyOf(property) !== 'if_resolution') yield property;
  }
  for (const block of widget.resolutionBlocks) yield* block.entries;
}

function checkWidgetReference(
  widget: Widget,
  parent: Widget | undefined,
  key: string,
  node: ScalarNode,
  name: string,
  index: InterfaceIndex,
  exists: FileExists,
  out: ModelDiagnostic[],
): void {
  if (SPRITE_KEYS.has(key) || (key === 'background' && isList(widget))) {
    checkSprite(node, name, index, exists, out);
  } else if (FONT_KEYS.has(key)) {
    checkFont(node, name, index, exists, out);
  } else if (key === 'texturefile') {
    if (resolveTexture(name, exists) === undefined) {
      out.push(
        diagnostic('warning', 'missing-texture', node, `Texture ${name} is not in the playset.`),
      );
    }
  } else if (key === 'scrollbartype' || (key === 'parent' && parent === undefined)) {
    const found = index.guiType(name);
    if (found === undefined) {
      out.push(
        diagnostic(
          'warning',
          'missing-gui-type',
          node,
          `No .gui file of the playset defines ${name} at top level.`,
        ),
      );
    } else {
      checkCase(node, name, found.item.name ?? name, found.path, out);
    }
  } else if (key === 'parent' || (key === 'background' && isWindow(widget))) {
    // A nested `parent` and a window's `background` name widgets of the same container (etch#16).
    const container = key === 'parent' ? parent : widget;
    if (container !== undefined) checkChild(node, name, container, out);
  } else if (SCROLLBAR_PART_KEYS.has(key) && widget.kind === 'scrollbarType') {
    checkChild(node, name, widget, out);
  }
}

function isList(widget: Widget): boolean {
  return widget.kind === 'listboxType' || widget.kind === 'smoothListboxType';
}

function isWindow(widget: Widget): boolean {
  return widget.kind === 'windowType' || widget.kind === 'eu3dialogtype';
}

function checkChild(
  node: ScalarNode,
  name: string,
  container: Widget,
  out: ModelDiagnostic[],
): void {
  const key = name.toLowerCase();
  const child = container.children.find((c) => c.name?.toLowerCase() === key);
  if (child === undefined) {
    const where = container.name === undefined ? 'its container' : container.name;
    out.push(
      diagnostic('warning', 'missing-widget', node, `${where} has no widget named ${name}.`),
    );
  } else if (child.name !== undefined) {
    checkCase(node, name, child.name, undefined, out);
  }
}

function checkSprite(
  node: ScalarNode,
  name: string,
  index: InterfaceIndex,
  exists: FileExists,
  out: ModelDiagnostic[],
): void {
  const found = index.sprite(name);
  if (found === undefined) {
    out.push(
      diagnostic(
        'warning',
        'missing-sprite',
        node,
        `No .gfx file of the playset defines sprite ${name}.`,
      ),
    );
    return;
  }
  checkCase(node, name, found.item.name, found.path, out);
  for (const texture of found.item.textures) {
    if (resolveTexture(texture.path, exists) === undefined) {
      out.push(
        diagnostic(
          'warning',
          'missing-texture',
          node,
          `Texture ${texture.path} of sprite ${found.item.name} (${found.path}) is not in the playset.`,
        ),
      );
    }
  }
}

function checkFont(
  node: ScalarNode,
  name: string,
  index: InterfaceIndex,
  exists: FileExists,
  out: ModelDiagnostic[],
): void {
  const found = index.font(name);
  if (found === undefined) {
    out.push(
      diagnostic(
        'warning',
        'missing-font',
        node,
        `No .gfx file of the playset defines font ${name}.`,
      ),
    );
    return;
  }
  checkCase(node, name, found.item.name, found.path, out);
  const problem = fontFileProblem(found.item, exists);
  if (problem !== undefined) {
    out.push(
      diagnostic(
        'warning',
        'missing-font-file',
        node,
        `Font ${found.item.name} (${found.path}): ${problem}`,
      ),
    );
  }
}

function fontFileProblem(font: FontDefinition, exists: FileExists): string | undefined {
  if (font.path === undefined) return 'it has no path.';
  const files = resolveFontFiles(font, exists);
  const expected = fontFilePaths(normaliseGamePath(font.path));
  if (files.fnt === undefined) return `${expected.fnt} is not in the playset.`;
  if (files.texture === undefined) {
    return `neither ${expected.textures[0]} nor ${expected.textures[1]} is in the playset.`;
  }
  return undefined;
}

function checkCase(
  node: ScalarNode,
  written: string,
  defined: string,
  path: string | undefined,
  out: ModelDiagnostic[],
): void {
  if (written === defined) return;
  const where = path === undefined ? '' : ` in ${path}`;
  out.push(
    diagnostic(
      'information',
      'reference-case',
      node,
      `${written} matches ${defined}${where} only when case is ignored; whether the game ignores case here is unverified.`,
    ),
  );
}

/** The `.gfx` file's own diagnostics, its texture and font files, and names defined earlier in load order. */
export function gfxDiagnostics(
  path: string,
  file: GfxFile,
  index: InterfaceIndex,
  exists: FileExists,
): ModelDiagnostic[] {
  const out: ModelDiagnostic[] = [...file.diagnostics];
  for (const sprite of file.sprites) {
    for (const texture of sprite.textures) {
      if (resolveTexture(texture.path, exists) === undefined) {
        out.push(
          diagnostic(
            'warning',
            'missing-texture',
            texture.node,
            `Texture ${texture.path} is not in the playset.`,
          ),
        );
      }
    }
    reportShadowed(
      sprite,
      index.spriteDefinitions(sprite.name),
      path,
      'duplicate-sprite',
      'Sprite',
      out,
    );
  }
  for (const font of file.fonts) {
    const problem = fontFileProblem(font, exists);
    if (problem !== undefined) {
      out.push(
        diagnostic(
          'warning',
          'missing-font-file',
          font.pathNode ?? font.nameNode,
          `Font ${font.name}: ${problem}`,
        ),
      );
    }
    reportShadowed(font, index.fontDefinitions(font.name), path, 'duplicate-font', 'Font', out);
  }
  return out.sort((a, b) => a.start - b.start);
}

function reportShadowed(
  item: Sprite | FontDefinition,
  definitions: readonly Located<Sprite | FontDefinition>[],
  path: string,
  code: 'duplicate-sprite' | 'duplicate-font',
  what: string,
  out: ModelDiagnostic[],
): void {
  const winner = definitions[0];
  if (winner === undefined || winner.item === item) return;
  const where = samePath(winner.path, path) ? 'earlier in this file' : `in ${winner.path}`;
  out.push(
    diagnostic(
      'information',
      code,
      item.nameNode,
      `${what} ${item.name} is also defined ${where}, which Etch uses because it loads first; ` +
        'which definition the game uses is unverified.',
    ),
  );
}

function samePath(a: string, b: string): boolean {
  return normaliseGamePath(a).toLowerCase() === normaliseGamePath(b).toLowerCase();
}
