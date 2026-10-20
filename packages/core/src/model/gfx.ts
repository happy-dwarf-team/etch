/**
 * The extension's model of a `.gfx` file (etch#3): the sprites of `spriteTypes` and the fonts and
 * text colours of `bitmapfonts`. `objectTypes` (3D and map objects) is left out.
 */
import type { Rgb } from '../text/markup.ts';
import type { ParsedScript, PropertyNode, ScalarNode } from '../script/tree.ts';
import { diagnostic, type ModelDiagnostic } from './diagnostics.ts';
import { Properties, keyOf, parseNumber, propertiesOf } from './properties.ts';

/**
 * The sprite kinds vanilla 1.37.5 defines in `spriteTypes`, spelled as vanilla writes them. The
 * only other entry there, `cursor_offset = { -5 -4 }`, is not a sprite.
 */
export const SPRITE_KINDS = [
  'spriteType',
  'textSpriteType',
  'progressbartype',
  'corneredTileSpriteType',
  'maskedShieldType',
  'frameAnimatedSpriteType',
  'PieChartType',
  'LineChartType',
] as const;

export type SpriteKind = (typeof SPRITE_KINDS)[number];

const SPRITE_KIND_BY_KEY: ReadonlyMap<string, SpriteKind> = new Map(
  SPRITE_KINDS.map((kind) => [kind.toLowerCase(), kind]),
);

/** Keys of a sprite whose value is a texture path. */
const TEXTURE_KEYS = new Set([
  'texturefile',
  'texturefile1',
  'texturefile2',
  'texturefile3',
  'alphamaskfile',
]);

/** A texture path a sprite names, as written (`gfx//interface//x.tga`). */
export interface SpriteTexture {
  /** The key in lower case: `texturefile`, `texturefile1` … `texturefile3` or `alphamaskfile`. */
  readonly key: string;
  readonly path: string;
  readonly node: ScalarNode;
}

export interface Sprite {
  readonly kind: SpriteKind;
  readonly name: string;
  readonly nameNode: ScalarNode;
  readonly node: PropertyNode;
  readonly properties: Properties;
  /** Non-empty texture paths in file order. */
  readonly textures: readonly SpriteTexture[];
  /** `noOfFrames`, at least 1: the texture is cut into that many horizontal cells. */
  readonly frames: number;
  /** `effectFile` as written, such as `gfx/FX/buttonstate.lua`; it names the sprite's shader. */
  readonly effectFile: string | undefined;
}

export interface FontDefinition {
  readonly name: string;
  readonly nameNode: ScalarNode;
  readonly node: PropertyNode;
  readonly properties: Properties;
  /** `path` without extension, such as `gfx/fonts/vic_18`; see `fontFilePaths`. */
  readonly path: string | undefined;
  readonly pathNode: ScalarNode | undefined;
  /** `color`, `0xAARRGGBB`. */
  readonly colour: number | undefined;
  /** `border_color`, `0xAARRGGBB`. */
  readonly borderColour: number | undefined;
  /** The font's own `textcolors`. */
  readonly textColours: Readonly<Record<string, Rgb>>;
}

export interface GfxFile {
  readonly sprites: readonly Sprite[];
  readonly fonts: readonly FontDefinition[];
  /** The global `textcolors` of `bitmapfonts`, letter as written to colour. */
  readonly textColours: Readonly<Record<string, Rgb>>;
  readonly diagnostics: readonly ModelDiagnostic[];
}

/** Builds the model of a parsed `.gfx` file. */
export function readGfxFile(parsed: ParsedScript): GfxFile {
  const sprites: Sprite[] = [];
  const fonts: FontDefinition[] = [];
  const textColours: Record<string, Rgb> = {};
  const diagnostics: ModelDiagnostic[] = [];

  for (const top of parsed.entries) {
    if (top.kind !== 'property' || top.value?.kind !== 'block') continue;
    const topKey = keyOf(top);
    if (topKey === 'spritetypes') {
      for (const entry of propertiesOf(top.value)) {
        const sprite = readSprite(entry, diagnostics);
        if (sprite !== undefined) sprites.push(sprite);
      }
    } else if (topKey === 'bitmapfonts') {
      for (const entry of propertiesOf(top.value)) {
        const key = keyOf(entry);
        if (key === 'bitmapfont') {
          const font = readFont(entry);
          if (font !== undefined) fonts.push(font);
        } else if (key === 'textcolors') {
          Object.assign(textColours, readTextColours(entry));
        }
      }
    }
  }
  return { sprites, fonts, textColours, diagnostics };
}

function nameOf(properties: Properties): ScalarNode | undefined {
  const node = properties.scalar('name');
  return node === undefined || node.text === '' ? undefined : node;
}

function readSprite(entry: PropertyNode, diagnostics: ModelDiagnostic[]): Sprite | undefined {
  if (entry.value?.kind !== 'block') return undefined;
  const properties = new Properties(propertiesOf(entry.value));
  const nameNode = nameOf(properties);
  if (nameNode === undefined) return undefined;
  const kind = SPRITE_KIND_BY_KEY.get(keyOf(entry));
  if (kind === undefined) {
    diagnostics.push(
      diagnostic(
        'information',
        'unknown-sprite-kind',
        entry.key,
        `${entry.key.text} is not a sprite kind vanilla EU4 1.37.5 uses; Etch does not draw it.`,
      ),
    );
    return undefined;
  }
  const textures: SpriteTexture[] = [];
  for (const p of properties.entries) {
    const key = keyOf(p);
    if (TEXTURE_KEYS.has(key) && p.value?.kind === 'scalar' && p.value.text !== '') {
      textures.push({ key, path: p.value.text, node: p.value });
    }
  }
  const frames = properties.number('noofframes');
  return {
    kind,
    name: nameNode.text,
    nameNode,
    node: entry,
    properties,
    textures,
    frames: frames !== undefined && frames >= 1 ? Math.floor(frames) : 1,
    effectFile: properties.text('effectfile'),
  };
}

function readFont(entry: PropertyNode): FontDefinition | undefined {
  if (entry.value?.kind !== 'block') return undefined;
  const properties = new Properties(propertiesOf(entry.value));
  const nameNode = nameOf(properties);
  if (nameNode === undefined) return undefined;
  const pathNode = properties.scalar('path');
  const colours = properties.property('textcolors');
  return {
    name: nameNode.text,
    nameNode,
    node: entry,
    properties,
    path: pathNode?.text,
    pathNode,
    colour: parseColour(properties.text('color')),
    borderColour: parseColour(properties.text('border_color')),
    textColours: colours === undefined ? {} : readTextColours(colours),
  };
}

/** `0xAARRGGBB` (or decimal) as an unsigned 32-bit number. */
export function parseColour(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  if (/^0x[0-9a-f]{1,8}$/i.test(text)) return Number.parseInt(text.slice(2), 16) >>> 0;
  const n = parseNumber(text);
  return n === undefined || !Number.isInteger(n) ? undefined : n >>> 0;
}

/** `textcolors = { G = { 0 255 0 } … }`. */
function readTextColours(entry: PropertyNode): Record<string, Rgb> {
  const out: Record<string, Rgb> = {};
  if (entry.value?.kind !== 'block') return out;
  for (const colour of propertiesOf(entry.value)) {
    if (colour.value?.kind !== 'block') continue;
    const channels = colour.value.entries.map((c) =>
      c.kind === 'scalar' ? parseNumber(c.text) : undefined,
    );
    const [r, g, b] = channels;
    if (channels.length === 3 && r !== undefined && g !== undefined && b !== undefined) {
      out[colour.key.text] = [r, g, b];
    }
  }
  return out;
}
