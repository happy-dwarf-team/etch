/**
 * Layout of one window into the draw list (spec section 3, ADR 0001): every widget's rect from
 * its `orientation`, `position` and size, with `if_resolution` evaluated against the preview
 * screen, and the sprite, frame, shader and text each widget draws in the state the `.gui`
 * defines. Code-filled content stays as the file defines it: lists, grids and overlapping-element
 * boxes are empty, progress bars are empty, shields show no flag.
 *
 * Rules marked verified matched the game in etch#3 (live widget reads) or etch#9 (pixel for pixel
 * on the main menu); the rest are hypotheses for the precision corpus (ADR 0002).
 *
 * Layout is synchronous and reads no files: texture sizes and fonts come from {@link LayoutAssets},
 * and what they have not loaded yet is listed in {@link WindowLayout.unloaded}, so that a warm
 * reload with everything loaded runs in one pass.
 */
import {
  DRAW_LIST_VERSION,
  effectName,
  isSpriteShader,
  packGlyphs,
  type Draw,
  type DrawList,
  type DrawRect,
  type ProgressFill,
  type SpriteShader,
} from '../draw-list.ts';
import { diagnostic, type ModelDiagnostic } from '../model/diagnostics.ts';
import type { FontDefinition, Sprite } from '../model/gfx.ts';
import { widgetProperties, type GuiFile, type Screen, type Widget } from '../model/gui.ts';
import type { InterfaceIndex } from '../model/interface-index.ts';
import type { Properties, Size } from '../model/properties.ts';
import { resolveFontFiles, resolveTexture, type FileExists } from '../model/references.ts';
import type { SourceRange } from '../script/tree.ts';
import type { BmFont } from '../text/bmfont.ts';
import {
  layoutText,
  textAlign,
  type TextAlign,
  type TextBox,
  type TextVerticalAlign,
} from '../text/layout.ts';
import type { TextureSize } from './texture-size.ts';

/** Why a file layout asked for cannot be used. */
export interface AssetProblem {
  readonly problem: string;
}

/**
 * The files layout reads, already loaded. Paths are game-relative, as {@link resolveTexture} and
 * {@link resolveFontFiles} give them. `undefined` means not loaded yet: layout lists the path in
 * {@link WindowLayout.unloaded} and goes on without it.
 */
export interface LayoutAssets {
  textureSize(path: string): TextureSize | AssetProblem | undefined;
  font(path: string): BmFont | AssetProblem | undefined;
}

export interface LayoutInput {
  /** The file that holds the window, for its `@name` constants. */
  readonly file: GuiFile;
  readonly index: InterfaceIndex;
  readonly exists: FileExists;
  readonly assets: LayoutAssets;
  /** The preview resolution; at UI scale 1 it is also what `if_resolution` is evaluated against. */
  readonly screen: Screen;
  /** A `.gui` text as the game shows it: its localised value, or the text itself. Default: as written. */
  readonly localise?: (text: string) => string;
}

/** One laid-out widget, in paint order: a parent comes before its children. */
export interface LaidOutWidget extends DrawRect {
  readonly widget: Widget;
  /** Index of the parent in {@link WindowLayout.widgets}, −1 for the window itself. */
  readonly parent: number;
  /** The widget's own draws: `drawList.draws` from `drawStart` up to, not including, `drawEnd`. */
  readonly drawStart: number;
  readonly drawEnd: number;
}

export interface WindowLayout {
  readonly drawList: DrawList;
  readonly widgets: readonly LaidOutWidget[];
  /** Problems found while laying out; reference checks are `guiDiagnostics`' job and are not repeated. */
  readonly diagnostics: readonly ModelDiagnostic[];
  /** Files layout needed that the assets have not loaded; load them and lay out again. */
  readonly unloaded: readonly string[];
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Extent {
  readonly width: number;
  readonly height: number;
}

/** The anchor points the exe's token table lists, as fractions of the parent's box (etch#3). */
const ANCHORS: ReadonlyMap<string, readonly [number, number]> = new Map([
  ['upper_left', [0, 0]],
  ['upper_right', [1, 0]],
  ['lower_left', [0, 1]],
  ['lower_right', [1, 1]],
  ['center', [0.5, 0.5]],
  ['center_up', [0.5, 0]],
  ['center_down', [0.5, 1]],
  ['center_left', [0, 0.5]],
  ['center_right', [1, 0.5]],
]);

const CONTAINERS = new Set(['windowType', 'eu3dialogtype', 'containerWindowType']);
const SPRITE_WIDGETS = new Set([
  'iconType',
  'guiButtonType',
  'checkboxType',
  'buttonType',
  'background',
  'slider',
  'track',
  'increaseButton',
  'decreaseButton',
]);
const BUTTONS = new Set(['guiButtonType', 'checkboxType', 'buttonType']);
const TEXT_BOXES = new Set(['instantTextBoxType', 'textBoxType', 'editBoxType']);
const LISTS = new Set(['listboxType', 'smoothListboxType']);
/** Boxes the game's code fills; the `.gui` gives only their rect. */
const CODE_FILLED_BOXES = new Set(['gridBoxType', 'OverlappingElementsBoxType']);

const OPAQUE_WHITE = 0xffffffff;

/** Lays out a window, normally a top-level definition, on the preview screen. */
export function layoutWindow(window: Widget, input: LayoutInput): WindowLayout {
  const layout = new Layout(input);
  const { width, height } = input.screen;
  layout.place(window, { x: 0, y: 0, width, height }, -1, undefined);
  return layout.result();
}

class Layout {
  private readonly input: LayoutInput;
  private readonly localise: (text: string) => string;
  private readonly draws: Draw[] = [];
  private readonly textures: string[] = [];
  private readonly textureIndex = new Map<string, number>();
  private readonly widgets: LaidOutWidget[] = [];
  private readonly diagnostics = new Map<string, ModelDiagnostic>();
  private readonly unloaded = new Set<string>();

  constructor(input: LayoutInput) {
    this.input = input;
    this.localise = input.localise ?? ((text) => text);
  }

  result(): WindowLayout {
    return {
      drawList: {
        version: DRAW_LIST_VERSION,
        width: this.input.screen.width,
        height: this.input.screen.height,
        textures: this.textures,
        draws: this.draws,
      },
      widgets: this.widgets,
      diagnostics: [...this.diagnostics.values()].sort((a, b) => a.start - b.start),
      unloaded: [...this.unloaded],
    };
  }

  /**
   * Places a widget in its parent's box and draws it and its children. `fill` is the box of the
   * container whose background the widget is.
   */
  place(widget: Widget, parent: Rect, parentIndex: number, fill: Extent | undefined): void {
    const props = widgetProperties(widget, this.input.file.constants, this.input.screen);
    this.checkNotApplied(props);
    const anchor = this.anchor(props, parent);
    // Hypothesis: the preview shows a window where it ends up once opened, at `show_position`.
    const offset = props.point('show_position') ?? props.point('position') ?? { x: 0, y: 0 };
    const x = anchor.x + offset.x;
    const y = anchor.y + offset.y;
    const drawStart = this.draws.length;
    const source = widget.node.start;
    const kind = widget.kind;

    let rect: Rect = { x, y, width: 0, height: 0 };
    if (CONTAINERS.has(kind)) {
      // Verified: a full-screen window takes the screen's size (etch#9).
      const extent =
        props.flag('fullscreen') === true ? this.input.screen : sizeIn(props.size('size'), parent);
      rect = { x, y, ...extent };
    } else if (SPRITE_WIDGETS.has(kind)) {
      const drawn = this.drawSpriteOf(props, x, y, source, fill);
      if (drawn !== undefined) rect = { x, y, ...drawn };
      if (BUTTONS.has(kind)) this.drawButtonText(props, rect, source);
    } else if (kind === 'shieldtype') {
      const drawn = this.drawSpriteOf(props, x, y, source, undefined);
      if (drawn !== undefined) rect = { x, y, ...drawn };
    } else if (TEXT_BOXES.has(kind)) {
      rect = this.drawTextBox(props, x, y, source);
    } else if (LISTS.has(kind)) {
      rect = { x, y, ...sizeIn(props.size('size'), parent) };
      // Hypothesis: a list draws its `background` sprite behind its (empty) rows.
      const background = props.text('background');
      if (background !== undefined && background !== '') {
        const node = props.scalar('background');
        this.drawSprite(background, node, props, x, y, source, rect);
      }
    } else if (
      CODE_FILLED_BOXES.has(kind) ||
      kind === 'scrollbarType' ||
      kind === 'extendedScrollbarType'
    ) {
      rect = { x, y, ...sizeIn(props.size('size'), parent) };
    }

    const index = this.widgets.length;
    this.widgets.push({
      widget,
      parent: parentIndex,
      ...rect,
      drawStart,
      drawEnd: this.draws.length,
    });

    // A `scrollbarType` has no render node of its own; lists create it when their rows overflow
    // (etch#3), and the preview's lists are empty.
    if (kind === 'scrollbarType') return;
    for (const child of this.paintOrder(widget, props)) {
      this.place(child.widget, rect, index, child.background ? rect : undefined);
    }
  }

  /**
   * Children in the order they are painted: the window's background first (hypothesis: `background`
   * names the child that is painted behind the others), then the rest in file order (later on top).
   */
  private paintOrder(widget: Widget, props: Properties): { widget: Widget; background: boolean }[] {
    const children = widget.children;
    if (children.length === 0) return [];
    let background: Widget | undefined;
    if (widget.kind === 'containerWindowType') {
      background = children.find((c) => c.kind === 'background');
    } else if (widget.kind === 'windowType' || widget.kind === 'eu3dialogtype') {
      const name = props.text('background')?.toLowerCase();
      if (name !== undefined && name !== '') {
        background = children.find((c) => c.name?.toLowerCase() === name);
      }
    }
    const rest = children
      .filter((c) => c !== background)
      .map((c) => ({ widget: c, background: false }));
    return background === undefined ? rest : [{ widget: background, background: true }, ...rest];
  }

  /**
   * The anchor in the parent's box. Verified: `orientation` picks a point of the parent's box and
   * `position` is the offset of the widget's top-left corner from it (etch#3); a widget without
   * `orientation` anchors upper left, not to its parent's orientation (etch#9). Hypothesis: centres
   * round down.
   */
  private anchor(props: Properties, box: Rect): { x: number; y: number } {
    const written = props.text('orientation');
    let fractions = ANCHORS.get('upper_left') ?? [0, 0];
    if (written !== undefined) {
      const found = ANCHORS.get(written.toLowerCase());
      if (found !== undefined) fractions = found;
      else {
        this.report(
          'information',
          'unknown-orientation',
          props.scalar('orientation') ?? props.property('orientation'),
          `Orientation ${written} is not one the game lists; Etch anchors it upper left, which is unverified.`,
        );
      }
    }
    return {
      x: box.x + Math.floor(box.width * fractions[0]),
      y: box.y + Math.floor(box.height * fractions[1]),
    };
  }

  private checkNotApplied(props: Properties): void {
    const rotation = props.number('rotation');
    if (rotation !== undefined && rotation !== 0) {
      this.report(
        'information',
        'not-applied',
        props.property('rotation'),
        'Etch draws the sprite without its rotation.',
      );
    }
    if (props.has('origo')) {
      this.report(
        'information',
        'not-applied',
        props.property('origo'),
        'Etch places the widget without its origo, whose meaning is unverified.',
      );
    }
  }

  /** The sprite of an icon, button or part, from `spriteType` or `quadTextureSprite`. */
  private drawSpriteOf(
    props: Properties,
    x: number,
    y: number,
    source: number,
    fill: Extent | undefined,
  ): Extent | undefined {
    const key = props.has('spritetype') ? 'spritetype' : 'quadtexturesprite';
    const name = props.text(key);
    if (name === undefined || name === '') return undefined;
    return this.drawSprite(name, props.scalar(key), props, x, y, source, fill);
  }

  /**
   * Draws a sprite by name at a point and returns its size. A missing sprite or texture draws
   * nothing; `guiDiagnostics` reports it.
   */
  private drawSprite(
    name: string,
    reference: SourceRange | undefined,
    props: Properties,
    x: number,
    y: number,
    source: number,
    fill: Extent | undefined,
  ): Extent | undefined {
    const sprite = this.input.index.sprite(name)?.item;
    if (sprite === undefined) return undefined;
    switch (sprite.kind) {
      case 'spriteType':
      case 'textSpriteType':
      case 'frameAnimatedSpriteType':
        return this.drawFrame(sprite, reference, props, x, y, source);
      case 'corneredTileSpriteType':
        return this.drawCorneredTile(sprite, reference, props, x, y, source, fill);
      case 'progressbartype':
        return this.drawProgress(sprite, reference, x, y, source);
      case 'maskedShieldType':
        return this.drawShield(sprite, reference, props, x, y, source);
      case 'PieChartType':
      case 'LineChartType':
        // Code-filled charts: only their size.
        return sprite.properties.point('size') === undefined
          ? undefined
          : chartSize(sprite.properties);
    }
  }

  /**
   * A plain sprite: one horizontal cell of its texture (etch#3), at the cell's size times `scale`.
   * Hypothesis: `frame` counts from 1 (vanilla never writes 0), and no `frame` is the first cell,
   * which also is the state a button or check box is in before code changes it.
   */
  private drawFrame(
    sprite: Sprite,
    reference: SourceRange | undefined,
    props: Properties,
    x: number,
    y: number,
    source: number,
  ): Extent | undefined {
    const texture = this.texture(sprite, 'texturefile', reference);
    if (texture === undefined) return undefined;
    const cell = texture.size.width / sprite.frames;
    const frame = Math.min(
      sprite.frames - 1,
      Math.max(0, Math.floor(props.number('frame') ?? 1) - 1),
    );
    // Hypothesis: a scaled sprite keeps fractional pixels.
    const scale = props.number('scale') ?? 1;
    const width = cell * scale;
    const height = texture.size.height * scale;
    this.draws.push({
      kind: 'sprite',
      source,
      texture: texture.index,
      x,
      y,
      width,
      height,
      sx: frame * cell,
      sy: 0,
      sw: cell,
      sh: texture.size.height,
      shader: this.shader(sprite, reference),
    });
    return { width, height };
  }

  /**
   * A nine-slice sprite. Its size is the widget's `size` (27 vanilla buttons have one), else the
   * container's box when it is a background, else the sprite's `size`, else its texture's.
   * Hypothesis: corners keep their texels and the edges and middle repeat their source rect.
   */
  private drawCorneredTile(
    sprite: Sprite,
    reference: SourceRange | undefined,
    props: Properties,
    x: number,
    y: number,
    source: number,
    fill: Extent | undefined,
  ): Extent | undefined {
    const texture = this.texture(sprite, 'texturefile', reference);
    if (texture === undefined) return undefined;
    const own = props.point('size');
    const extent: Extent = own
      ? { width: own.x, height: own.y }
      : (fill ?? pointExtent(sprite.properties.point('size')) ?? texture.size);
    const tw = texture.size.width;
    const th = texture.size.height;
    const border = sprite.properties.point('bordersize') ?? { x: 0, y: 0 };
    const bx = Math.max(0, Math.min(border.x, tw / 2, extent.width / 2));
    const by = Math.max(0, Math.min(border.y, th / 2, extent.height / 2));
    const shader = this.shader(sprite, reference);
    const columns = [
      { x: 0, w: bx, sx: 0, sw: bx, repeat: false },
      { x: bx, w: extent.width - 2 * bx, sx: bx, sw: tw - 2 * bx, repeat: true },
      { x: extent.width - bx, w: bx, sx: tw - bx, sw: bx, repeat: false },
    ];
    const rows = [
      { y: 0, h: by, sy: 0, sh: by, repeat: false },
      { y: by, h: extent.height - 2 * by, sy: by, sh: th - 2 * by, repeat: true },
      { y: extent.height - by, h: by, sy: th - by, sh: by, repeat: false },
    ];
    for (const row of rows) {
      for (const column of columns) {
        if (column.w <= 0 || row.h <= 0 || column.sw <= 0 || row.sh <= 0) continue;
        const repeat = column.repeat || row.repeat;
        this.draws.push({
          kind: 'sprite',
          source,
          texture: texture.index,
          x: x + column.x,
          y: y + row.y,
          width: column.w,
          height: row.h,
          sx: column.sx,
          sy: row.sy,
          sw: column.sw,
          sh: row.sh,
          shader,
          ...(repeat ? { repeat } : {}),
        });
      }
    }
    return extent;
  }

  /**
   * A progress bar at the sprite's `size`, empty: its value comes from code (hypothesis: an
   * unfilled bar shows `textureFile2` or `colortwo` everywhere). `horizontal = no` fills upwards.
   */
  private drawProgress(
    sprite: Sprite,
    reference: SourceRange | undefined,
    x: number,
    y: number,
    source: number,
  ): Extent | undefined {
    const first = this.progressFill(sprite, 'texturefile1', 'color', reference);
    const second = this.progressFill(sprite, 'texturefile2', 'colortwo', reference);
    const extent = pointExtent(sprite.properties.point('size')) ?? first.size ?? second.size;
    if (extent === undefined) return undefined;
    this.draws.push({
      kind: 'progress',
      source,
      x,
      y,
      ...extent,
      first: first.fill,
      second: second.fill,
      value: 0,
      ...(sprite.properties.flag('horizontal') === false ? { vertical: true } : {}),
    });
    return extent;
  }

  private progressFill(
    sprite: Sprite,
    textureKey: string,
    colourKey: string,
    reference: SourceRange | undefined,
  ): { fill: ProgressFill; size?: TextureSize } {
    const texture = this.texture(sprite, textureKey, reference);
    if (texture !== undefined) return { fill: { texture: texture.index }, size: texture.size };
    return { fill: { colour: rgbColour(sprite.properties.numbers(colourKey)) } };
  }

  /**
   * A `maskedShieldType` without its flag, which code picks: only the overlay, `textureFile1`, at
   * its own size times `scale` (hypothesis). The renderer's masked draw is for when a flag is known.
   */
  private drawShield(
    sprite: Sprite,
    reference: SourceRange | undefined,
    props: Properties,
    x: number,
    y: number,
    source: number,
  ): Extent | undefined {
    const texture = this.texture(sprite, 'texturefile1', reference);
    if (texture === undefined) return undefined;
    const scale = props.number('scale') ?? 1;
    const width = texture.size.width * scale;
    const height = texture.size.height * scale;
    this.draws.push({
      kind: 'sprite',
      source,
      texture: texture.index,
      x,
      y,
      width,
      height,
      sx: 0,
      sy: 0,
      sw: texture.size.width,
      sh: texture.size.height,
      shader: 'default',
    });
    return { width, height };
  }

  /** The sprite's shader; one the renderer does not port draws with `default` and is reported. */
  private shader(sprite: Sprite, reference: SourceRange | undefined): SpriteShader {
    const name = effectName(sprite.effectFile);
    if (isSpriteShader(name)) return name;
    this.report(
      'information',
      'unhandled-shader',
      reference,
      `Sprite ${sprite.name} uses the shader ${name}, which Etch draws with its default shader.`,
    );
    return 'default';
  }

  /** A sprite's texture: resolved, sized and given its index in the draw list. */
  private texture(
    sprite: Sprite,
    key: string,
    reference: SourceRange | undefined,
  ): { index: number; size: TextureSize } | undefined {
    const written = sprite.textures.find((t) => t.key === key);
    if (written === undefined) return undefined;
    const path = resolveTexture(written.path, this.input.exists);
    if (path === undefined) return undefined;
    const size = this.input.assets.textureSize(path);
    if (size === undefined) {
      this.unloaded.add(path);
      return undefined;
    }
    if ('problem' in size) {
      this.report('warning', 'unreadable-file', reference, `Texture ${path}: ${size.problem}.`);
      return undefined;
    }
    return { index: this.textureOf(path), size };
  }

  private textureOf(path: string): number {
    let index = this.textureIndex.get(path);
    if (index === undefined) {
      index = this.textures.length;
      this.textureIndex.set(path, index);
      this.textures.push(path);
    }
    return index;
  }

  /**
   * A text box: `maxWidth` × `maxHeight` (an edit box: `size`) with `borderSize` inside (etch#3).
   * Verified on the main menu: the text starts at `y + borderSize.y`, wraps at the inner width, and
   * centres rounding half up (etch#9). `fixedsize` and `truncate` are not applied.
   */
  private drawTextBox(props: Properties, x: number, y: number, source: number): Rect {
    const size = props.point('size');
    const width = props.number('maxwidth') ?? size?.x ?? 0;
    const height = props.number('maxheight') ?? size?.y;
    const border = props.point('bordersize') ?? { x: 0, y: 0 };
    const box: TextBox = { x, y, width, border, ...(height === undefined ? {} : { height }) };
    const laid = this.drawText(props, 'text', 'font', box, source, {
      align: textAlign(props.text('format')),
      verticalAlign: verticalAlign(props.text('vertical_alignment')) ?? 'top',
      snap: true,
      ...colourCode(props),
    });
    return { x, y, width, height: height ?? laid ?? 0 };
  }

  /**
   * `buttonText` in `buttonFont`, centred in the button both ways (or as `format` and
   * `vertical_alignment` say) without rounding: the closest rule found in etch#9, which still draws
   * 1 px higher than the game (spec section 15). `text` and `font` stand in when they are missing.
   */
  private drawButtonText(props: Properties, rect: Rect, source: number): void {
    const textKey = props.has('buttontext') ? 'buttontext' : 'text';
    const fontKey = props.has('buttonfont') ? 'buttonfont' : 'font';
    const format = props.text('format');
    this.drawText(props, textKey, fontKey, rect, source, {
      align: format === undefined ? 'centre' : textAlign(format),
      verticalAlign: verticalAlign(props.text('vertical_alignment')) ?? 'centre',
      snap: false,
    });
  }

  /** Lays out and draws a widget's text; returns the text's height, if any was laid out. */
  private drawText(
    props: Properties,
    textKey: string,
    fontKey: string,
    box: TextBox,
    source: number,
    options: {
      align: TextAlign;
      verticalAlign: TextVerticalAlign;
      snap: boolean;
      colourCode?: string;
    },
  ): number | undefined {
    const written = props.text(textKey);
    const fontName = props.text(fontKey);
    if (written === undefined || written === '' || fontName === undefined) return undefined;
    const definition = this.input.index.font(fontName)?.item;
    if (definition === undefined) return undefined;
    const files = resolveFontFiles(definition, this.input.exists);
    if (files.fnt === undefined || files.texture === undefined) return undefined;
    const font = this.input.assets.font(files.fnt);
    const fontNode = props.scalar(fontKey);
    if (font === undefined) {
      this.unloaded.add(files.fnt);
      return undefined;
    }
    if ('problem' in font) {
      this.report(
        'warning',
        'unreadable-file',
        fontNode,
        `Font file ${files.fnt}: ${font.problem}.`,
      );
      return undefined;
    }

    const text = this.localise(written);
    const icons = new Map<string, { sprite: Sprite; index: number; size: Extent }>();
    const laid = layoutText(font, text, box, {
      colours: {
        base: definition.colour ?? OPAQUE_WHITE,
        font: definition.textColours,
        global: this.input.index.textColours,
      },
      align: options.align,
      verticalAlign: options.verticalAlign,
      snap: options.snap,
      ...(options.colourCode === undefined ? {} : { colourCode: options.colourCode }),
      icon: (name) => {
        const sprite = this.input.index.sprite(name)?.item;
        if (sprite === undefined) return undefined;
        const texture = this.texture(sprite, 'texturefile', props.scalar(textKey));
        if (texture === undefined) return undefined;
        // Hypothesis: an icon is the first cell of its sprite, at the cell's size.
        const size = { width: texture.size.width / sprite.frames, height: texture.size.height };
        icons.set(name, { sprite, index: texture.index, size });
        return size;
      },
    });

    const textNode = props.scalar(textKey);
    const where = text === written ? '' : ` in the localisation of ${written}`;
    for (const issue of laid.issues) {
      this.report('warning', issue.code, textNode, `${capitalise(issue.message)}${where}.`);
    }
    if (laid.glyphs.length > 0) {
      this.draws.push({
        kind: 'text',
        source,
        texture: this.textureOf(files.texture),
        glyphs: packGlyphs(laid.glyphs),
        ...(hasAlpha(definition) ? { border: definition.borderColour ?? 0 } : {}),
      });
    }
    for (const icon of laid.icons) {
      const found = icons.get(icon.sprite);
      if (found === undefined) continue;
      this.draws.push({
        kind: 'sprite',
        source,
        texture: found.index,
        x: icon.x,
        y: icon.y,
        width: icon.width,
        height: icon.height,
        sx: 0,
        sy: 0,
        sw: found.size.width,
        sh: found.size.height,
        shader: this.shader(found.sprite, textNode),
      });
    }
    return laid.height;
  }

  private report(
    severity: ModelDiagnostic['severity'],
    code: ModelDiagnostic['code'],
    range: SourceRange | undefined,
    message: string,
  ): void {
    if (range === undefined) return;
    const key = `${code}:${String(range.start)}:${message}`;
    if (!this.diagnostics.has(key)) {
      this.diagnostics.set(key, diagnostic(severity, code, range, message));
    }
  }
}

/** A `size` in the parent's box: pixels, or percent of the parent's size. */
function sizeIn(size: Size | undefined, parent: Extent): Extent {
  if (size === undefined) return { width: 0, height: 0 };
  return {
    width: size.width.percent ? (parent.width * size.width.value) / 100 : size.width.value,
    height: size.height.percent ? (parent.height * size.height.value) / 100 : size.height.value,
  };
}

function pointExtent(point: { x: number; y: number } | undefined): Extent | undefined {
  return point === undefined ? undefined : { width: point.x, height: point.y };
}

function chartSize(properties: Properties): Extent | undefined {
  return pointExtent(properties.point('size'));
}

/** `color = { r g b }` with channels 0–1 as an opaque `0xAARRGGBB`; white when malformed. */
function rgbColour(channels: number[] | undefined): number {
  if (channels === undefined || channels.length < 3) return OPAQUE_WHITE;
  const byte = (c: number | undefined): number =>
    Math.round(Math.min(1, Math.max(0, c ?? 0)) * 255);
  return (
    ((0xff << 24) | (byte(channels[0]) << 16) | (byte(channels[1]) << 8) | byte(channels[2])) >>> 0
  );
}

/** `vertical_alignment`: the exe knows `top` and `bottom`; `center`/`centre` is read as centre. */
function verticalAlign(value: string | undefined): TextVerticalAlign | undefined {
  switch (value?.toLowerCase()) {
    case 'top':
      return 'top';
    case 'bottom':
      return 'bottom';
    case 'center':
    case 'centre':
      return 'centre';
    default:
      return undefined;
  }
}

function colourCode(props: Properties): { colourCode?: string } {
  const code = props.text('text_color_code');
  return code === undefined || code === '' ? {} : { colourCode: code };
}

function hasAlpha(font: FontDefinition): boolean {
  return font.borderColour !== undefined && font.borderColour >>> 24 !== 0;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
