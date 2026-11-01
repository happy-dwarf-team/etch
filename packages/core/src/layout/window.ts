/**
 * Layout of one window into the draw list (spec section 3, ADR 0001): every widget's rect from
 * its `orientation`, `position` and size, with `if_resolution` evaluated against the preview
 * screen, and the sprite, frame, shader and text each widget draws in the state the `.gui`
 * defines. Code-filled content stays as the file defines it, unless sample data fills its texts
 * and list boxes (spec section 5): lists, grids and overlapping-element boxes are empty, progress
 * bars are empty, shields show no flag.
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
import type { Constants, Properties, Size } from '../model/properties.ts';
import { resolveFontFiles, resolveTexture, type FileExists } from '../model/references.ts';
import type { SourceRange } from '../script/tree.ts';
import type { BmFont } from '../text/bmfont.ts';
import { fitText, type TextFit } from '../text/fit.ts';
import {
  layoutText,
  textAlign,
  type TextAlign,
  type TextBox,
  type TextVerticalAlign,
} from '../text/layout.ts';
import { textIconSprite } from '../text/markup.ts';
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
  /** The view a window profile chooses (spec section 3); without one every widget is drawn. */
  readonly view?: LayoutView;
  /** Sample data in code-filled widgets (spec section 5); without it they stay as written. */
  readonly content?: LayoutContent;
}

/**
 * What sample data changes in layout: the text a code-filled widget shows instead of its `.gui`
 * text (already as the game would show it, not localised again), and the entries a list box
 * shows, each a template laid out below the last.
 */
export interface LayoutContent {
  /** A widget's text; `row` is the entry of a list box the widget is part of. */
  text(widget: Widget, row: number | undefined): string | undefined;
  /**
   * What a live snapshot showed of a widget: a list entry's part the game hid is not drawn, a
   * disabled button draws with its shader's `disable` effect, a ticked check box its second frame.
   */
  state?(
    widget: Widget,
    row: number | undefined,
  ):
    { readonly visible: boolean; readonly enabled: boolean; readonly checked: boolean } | undefined;
  /**
   * The entries of a list box: a top-level definition, from its file, `count` times; with `place`,
   * the entries the game's code puts in a window, from `x`, `y`, `columns` to a row, `step` apart.
   */
  rows(list: Widget):
    | {
        readonly template: Widget;
        readonly file: GuiFile;
        readonly count: number;
        readonly place?: {
          readonly start: { readonly x: number; readonly y: number } | string;
          readonly step?: { readonly x: number; readonly y: number } | string;
          readonly columns?: number | string;
        };
      }
    | undefined;
}

/**
 * What a view changes in layout: a widget it hides or the game does not create is neither laid
 * out nor drawn, nor its children; a moved widget takes the `position` of a `positionType` of the
 * window's file; a frame set by code replaces the `.gui` one.
 */
export interface LayoutView {
  shows(widget: Widget): boolean;
  /** The name of the `positionType` the game's code moves the widget to. */
  movedTo(widget: Widget): string | undefined;
  /** The one coordinate of that `positionType` the widget takes; both when `undefined`. */
  movedAxis?(widget: Widget): 'x' | 'y' | undefined;
  /** The sprite frame, from 1, the game's code sets. */
  frame(widget: Widget): number | undefined;
}

/** One laid-out widget, in paint order: a parent comes before its children. */
export interface LaidOutWidget extends DrawRect {
  readonly widget: Widget;
  /** Index of the parent in {@link WindowLayout.widgets}, −1 for the window itself. */
  readonly parent: number;
  /** The widget's own draws: `drawList.draws` from `drawStart` up to, not including, `drawEnd`. */
  readonly drawStart: number;
  readonly drawEnd: number;
  /** The entry of a list box this widget is part of, from 0, when sample data fills the list. */
  readonly row?: number;
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
  /** The window file's size steps, read once; `null` until read. */
  private steps: { large?: number; huge?: number } | undefined | null = null;
  /** The `@name` constants in scope: the window's file's, or a list entry template's file's. */
  private constants: Constants;
  /** The list box entry being laid out, if any. */
  private row: number | undefined;
  /** The widget being drawn, for its sample text. */
  private current: Widget | undefined;

  constructor(input: LayoutInput) {
    this.input = input;
    this.localise = input.localise ?? ((text) => text);
    this.constants = input.file.constants;
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
    const view = this.input.view;
    if (view !== undefined && !view.shows(widget)) return;
    const state = this.input.content?.state?.(widget, this.row);
    // The view says what shows of the window; a live snapshot says it for each list entry.
    if (this.row !== undefined && state?.visible === false) return;
    const props = widgetProperties(widget, this.constants, this.input.screen);
    this.checkNotApplied(props);
    this.current = widget;
    const anchor = this.anchor(props, parent);
    // Hypothesis: the preview shows a window where it ends up once opened, at `show_position`.
    const written = props.point('show_position') ?? props.point('position') ?? { x: 0, y: 0 };
    const moved = this.movedPosition(widget);
    const axis = view?.movedAxis?.(widget);
    const offset =
      moved === undefined
        ? written
        : axis === 'x'
          ? { x: moved.x, y: written.y }
          : axis === 'y'
            ? { x: written.x, y: moved.y }
            : moved;
    // Hypothesis: a ticked check box draws its sprite's second frame, as the game's do.
    const frame =
      view?.frame(widget) ??
      (widget.kind === 'checkboxType' && state?.checked === true ? 2 : undefined);
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
      // Verified in the corpus (etch#44): a widget whose `.gui` picks its sprite by
      // `if_resolution` (the declare war dialog's background) gets no screen-sized variant.
      const variantTop = widget.resolutionBlocks.length === 0 ? parent.y : undefined;
      const drawn = this.drawSpriteOf(props, x, y, source, fill, variantTop, frame);
      if (drawn !== undefined) rect = { x, y, ...drawn };
      // Verified in the corpus (etch#44): the game draws no `buttonText` on a check box; the
      // message settings lay a text box over each of theirs instead.
      // A disabled button draws its sprite with the shader's `disable` effect. Verified in
      // eu4.exe (0x15DA600): a sprite definition without `effectFile` loads
      // gfx/FX/buttonstate.lua (buttonstate_linear.lua at another UI scale), so a disabled
      // button greys out as the live game shows (2.0.0 trial).
      if (BUTTONS.has(kind) && state?.enabled === false) {
        for (let i = drawStart; i < this.draws.length; i++) {
          const draw = this.draws[i];
          if (draw?.kind === 'sprite') {
            this.draws[i] = {
              ...draw,
              effect: 'disable',
              ...(draw.shader === 'default' ? { shader: 'buttonstate' as const } : {}),
            };
          } else if (draw?.kind === 'masked') {
            this.draws[i] = { ...draw, effect: 'disable' };
          }
        }
      }
      if (BUTTONS.has(kind) && kind !== 'checkboxType') {
        const textStart = this.draws.length;
        this.drawButtonText(props, rect, source);
        this.bakeButtonText(props, drawStart, textStart);
      }
    } else if (kind === 'shieldtype') {
      const drawn = this.drawSpriteOf(props, x, y, source, undefined, undefined, frame);
      if (drawn !== undefined) rect = { x, y, ...drawn };
    } else if (TEXT_BOXES.has(kind)) {
      rect = this.drawTextBox(kind, props, x, y, source);
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
      ...(this.row === undefined ? {} : { row: this.row }),
    });

    if (LISTS.has(kind)) this.placeRows(widget, props, rect, index);
    if (kind === 'OverlappingElementsBoxType') this.placeOverlapping(widget, props, rect, index);
    // A `scrollbarType` has no render node of its own; lists create it when their rows overflow
    // (etch#3), and the preview does not scroll.
    if (kind === 'scrollbarType') return;
    for (const child of this.paintOrder(widget, props)) {
      this.place(child.widget, rect, index, child.background ? rect : undefined);
    }
    if (CONTAINERS.has(kind)) this.placeEntries(widget, rect, index);
  }

  /**
   * The entries the game's code puts in a window that is not a list box (spec section 5, a
   * repeater's `place`), after the window's own children, so on top of them: the first at `start`
   * of the window, each next `step` further (the template's size by default), or with `columns` a
   * new row after that many, `step.y` lower. A place named by a `positionType` takes its position
   * from the window's file, as the game's code reads it: `building_start`, `building_offset` and
   * `building_max_per_row` give the building slots of `general_buildings_window` (corpus: 64 px
   * apart in rows of four in vanilla, 77 px in Proper 2K UI Enhanced). Nothing is clipped.
   */
  private placeEntries(window: Widget, rect: Rect, index: number): void {
    const rows = this.input.content?.rows(window);
    const place = rows?.place;
    if (rows === undefined || place === undefined || rows.count === 0) return;
    const point = (
      value: { readonly x: number; readonly y: number } | string | undefined,
    ): { x: number; y: number } | undefined => {
      if (typeof value !== 'string') return value;
      const target = this.input.file.definitions.find(
        (d) => d.kind === 'positionType' && d.name?.toLowerCase() === value.toLowerCase(),
      );
      return target === undefined
        ? undefined
        : widgetProperties(target, this.input.file.constants, this.input.screen).point('position');
    };
    const start = point(place.start) ?? { x: 0, y: 0 };
    const size = sizeIn(
      widgetProperties(rows.template, rows.file.constants, this.input.screen).size('size'),
      rect,
    );
    const step = point(place.step) ?? { x: size.width, y: size.height };
    const columns =
      typeof place.columns === 'string' ? point(place.columns)?.x : (place.columns ?? undefined);
    const outer = { constants: this.constants, row: this.row };
    this.constants = rows.file.constants;
    for (let row = 0; row < rows.count; row++) {
      this.row = row;
      const across = columns === undefined || columns < 1 ? row : row % columns;
      const down = columns === undefined || columns < 1 ? row : Math.floor(row / columns);
      const box: Rect = {
        x: rect.x + start.x + across * step.x,
        y: rect.y + start.y + down * step.y,
        width: size.width,
        height: size.height,
      };
      this.place(rows.template, box, index, undefined);
    }
    this.constants = outer.constants;
    this.row = outer.row;
  }

  /**
   * The entries sample data puts in an `OverlappingElementsBoxType` (the core shields of
   * `cores_box`): side by side from its left, `spacing` apart, and moved closer, overlapping, when
   * they do not fit its width. Seen in the corpus: two 32 px shields of `cores_box` (spacing 1)
   * 33 px apart; the overlap is a hypothesis from the name.
   */
  private placeOverlapping(box: Widget, props: Properties, rect: Rect, index: number): void {
    const rows = this.input.content?.rows(box);
    if (rows === undefined || rows.count === 0) return;
    const size = sizeIn(
      widgetProperties(rows.template, rows.file.constants, this.input.screen).size('size'),
      rect,
    );
    const spacing = props.number('spacing') ?? 0;
    const fits = rows.count * size.width + (rows.count - 1) * spacing <= rect.width;
    const step =
      fits || rows.count < 2 ? size.width + spacing : (rect.width - size.width) / (rows.count - 1);
    const outer = { constants: this.constants, row: this.row };
    this.constants = rows.file.constants;
    for (let row = 0; row < rows.count; row++) {
      this.row = row;
      const box: Rect = {
        x: rect.x + Math.round(row * step),
        y: rect.y,
        width: size.width,
        height: size.height,
      };
      this.place(rows.template, box, index, undefined);
    }
    this.constants = outer.constants;
    this.row = outer.row;
  }

  /**
   * The entries sample data puts in a list box (spec section 5): its template laid out once per
   * entry, from the list's `borderSize`, each below the last (beside it with `horizontal`) with
   * `spacing` between. Hypotheses for the precision corpus: the entries start at the border, and
   * only those that fit whole show, as the list does not scroll in the preview.
   */
  private placeRows(list: Widget, props: Properties, rect: Rect, index: number): void {
    const rows = this.input.content?.rows(list);
    if (rows === undefined || rows.count === 0) return;
    const border = props.point('bordersize') ?? { x: 0, y: 0 };
    const spacing = props.number('spacing') ?? 0;
    const horizontal = props.flag('horizontal') === true;
    const room = horizontal ? rect.width - 2 * border.x : rect.height - 2 * border.y;
    const outer = { constants: this.constants, row: this.row };
    this.constants = rows.file.constants;
    let offset = 0;
    for (let row = 0; row < rows.count; row++) {
      this.row = row;
      const box: Rect = horizontal
        ? {
            x: rect.x + border.x + offset,
            y: rect.y + border.y,
            width: room - offset,
            height: rect.height - 2 * border.y,
          }
        : {
            x: rect.x + border.x,
            y: rect.y + border.y + offset,
            width: rect.width - 2 * border.x,
            height: room - offset,
          };
      const widgets = this.widgets.length;
      const draws = this.draws.length;
      this.place(rows.template, box, index, undefined);
      const placed = this.widgets[widgets];
      const extent = placed === undefined ? 0 : horizontal ? placed.width : placed.height;
      if (row > 0 && offset + extent > room) {
        this.widgets.length = widgets;
        this.draws.length = draws;
        break;
      }
      offset += extent + spacing;
    }
    this.constants = outer.constants;
    this.row = outer.row;
  }

  /**
   * The `position` of the `positionType` the view moves a widget to, from the top-level
   * definitions of the window's file; `undefined` when it is not moved or the file lacks it.
   */
  private movedPosition(widget: Widget): { x: number; y: number } | undefined {
    const name = this.input.view?.movedTo(widget)?.toLowerCase();
    if (name === undefined) return undefined;
    const target = this.input.file.definitions.find(
      (d) => d.kind === 'positionType' && d.name?.toLowerCase() === name,
    );
    if (target === undefined) return undefined;
    return widgetProperties(target, this.input.file.constants, this.input.screen).point('position');
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
    variantTop: number | undefined,
    frame: number | undefined,
  ): Extent | undefined {
    const key = props.has('spritetype') ? 'spritetype' : 'quadtexturesprite';
    const name = props.text(key);
    if (name === undefined || name === '') return undefined;
    const sprite = variantTop === undefined ? name : this.sizedSprite(name, variantTop);
    return this.drawSprite(sprite, props.scalar(key), props, x, y, source, fill, frame);
  }

  /**
   * The sprite the game draws for a widget's sprite at this screen size, of the sprite's `_huge`
   * and `_large` variants (a `_standard` suffix replaced) or the sprite itself.
   *
   * When the window's file has the country views' size steps (`positionType`s named
   * `…_scaling_large_min_inc` and `…_scaling_huge_min_inc`, whose `x` is the least screen height of
   * each step), the game draws the largest variant whose step the screen height reaches. Verified
   * on the estates backgrounds of the three corpus playsets at the six resolutions (M10): vanilla
   * steps at 900 and 1080, Proper 2K UI Enhanced at 1080 and 1296, and P2KE Patch - Anbennar at 1089
   * and 1307, which keeps the standard background at 1080.
   *
   * Otherwise (etch#44, the diplomacy and estates backgrounds of the release playsets) the largest
   * variant whose texture, measured from the top of the widget's window, ends on the screen (Proper
   * 2K UI Enhanced's estates background, 892 high in a window at 168, is not drawn at 1050
   * although it would end at 1048 from its own top at 156).
   */
  private sizedSprite(name: string, top: number): string {
    const base = name.replace(/_standard$/i, '');
    const steps = this.sizeSteps();
    if (steps !== undefined) {
      const height = this.input.screen.height;
      for (const [suffix, from] of [
        ['_huge', steps.huge],
        ['_large', steps.large],
      ] as const) {
        if (from !== undefined && height >= from && this.input.index.sprite(base + suffix)) {
          return base + suffix;
        }
      }
      return name;
    }
    for (const suffix of ['_huge', '_large']) {
      const sprite = this.input.index.sprite(base + suffix)?.item;
      const written = sprite?.textures.find((t) => t.key === 'texturefile');
      if (written === undefined) continue;
      const path = resolveTexture(written.path, this.input.exists);
      if (path === undefined) continue;
      const size = this.input.assets.textureSize(path);
      if (size === undefined) {
        this.unloaded.add(path);
        continue;
      }
      if (!('problem' in size) && top + size.height <= this.input.screen.height) {
        return base + suffix;
      }
    }
    return name;
  }

  /**
   * The least screen heights of the window file's `_large` and `_huge` steps, from its
   * `…_scaling_large_min_inc` and `…_scaling_huge_min_inc` positionTypes; `undefined` without them.
   */
  private sizeSteps(): { large?: number; huge?: number } | undefined {
    if (this.steps !== null) return this.steps;
    let large: number | undefined;
    let huge: number | undefined;
    for (const d of this.input.file.definitions) {
      if (d.kind !== 'positionType' || d.name === undefined) continue;
      const step = /_scaling_(large|huge)_min_inc$/i.exec(d.name)?.[1]?.toLowerCase();
      if (step === undefined) continue;
      const x = widgetProperties(d, this.input.file.constants, this.input.screen).point(
        'position',
      )?.x;
      if (step === 'large') large ??= x;
      else huge ??= x;
    }
    this.steps =
      large === undefined && huge === undefined
        ? undefined
        : { ...(large === undefined ? {} : { large }), ...(huge === undefined ? {} : { huge }) };
    return this.steps;
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
    frame?: number,
  ): Extent | undefined {
    const sprite = this.input.index.sprite(name)?.item;
    if (sprite === undefined) return undefined;
    switch (sprite.kind) {
      case 'spriteType':
      case 'textSpriteType':
      case 'frameAnimatedSpriteType':
        return this.drawFrame(sprite, reference, props, x, y, source, frame);
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
    frameSet?: number,
  ): Extent | undefined {
    const texture = this.texture(sprite, 'texturefile', reference);
    if (texture === undefined) return undefined;
    const cell = texture.size.width / sprite.frames;
    const frame = Math.min(
      sprite.frames - 1,
      Math.max(0, Math.floor(frameSet ?? props.number('frame') ?? 1) - 1),
    );
    // Verified in the corpus (etch#44) on five scaled icons: the game draws the scaled size
    // exactly, its bottom edge on whole pixels, and the widget is that size rounded down.
    const scale = props.number('scale') ?? 1;
    const width = cell * scale;
    const height = texture.size.height * scale;
    this.draws.push({
      kind: 'sprite',
      source,
      texture: texture.index,
      x,
      y: y + Math.floor(height) - height,
      width,
      height,
      sx: frame * cell,
      sy: 0,
      sw: cell,
      sh: texture.size.height,
      shader: this.shader(sprite, reference),
    });
    // A texture whose width is no multiple of its frames gives the widget the width of a whole
    // cell, rounded down before the scale: Anbennar's 162-pixel legitimacy strip of 5 frames at a
    // scale of 0.9 makes a widget 28 pixels wide, not 29 (etch#55). It draws as before.
    return { width: Math.floor(Math.floor(cell) * scale), height: Math.floor(height) };
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
   * Verified on the main menu: the text starts at `y + borderSize.y` and wraps at the inner width
   * (etch#9); centring is in `layoutText` (etch#44).
   *
   * Verified in `eu4.exe` 1.37.5: an `instantTextBoxType` with `fixedsize = yes` fits its text
   * into `maxWidth` × `maxHeight` first (`fitText`), cut with " ..." unless `truncate = no`.
   * Without `fixedsize`, `truncate` does nothing, and a `textBoxType` never fits its text.
   *
   * Verified in the corpus (etch#44): an `instantTextBoxType` is as tall as its lines plus the
   * border above and below, whatever `maxHeight` and `fixedsize` say; empty text is one line.
   */
  private drawTextBox(kind: string, props: Properties, x: number, y: number, source: number): Rect {
    const size = props.point('size');
    const width = props.number('maxwidth') ?? size?.x ?? 0;
    const height = props.number('maxheight') ?? size?.y;
    const border = props.point('bordersize') ?? { x: 0, y: 0 };
    const box: TextBox = { x, y, width, border, ...(height === undefined ? {} : { height }) };
    const fixed = kind === 'instantTextBoxType' && props.flag('fixedsize') === true;
    const laid = this.drawText(props, 'text', 'font', box, source, {
      align: textAlign(props.text('format')),
      verticalAlign: verticalAlign(props.text('vertical_alignment')) ?? 'top',
      ...colourCode(props),
      ...(fixed
        ? {
            fit: {
              // The text node reads only `maxWidth` and `maxHeight`, and makes 0 into 200.
              width: props.number('maxwidth') || 200,
              height: props.number('maxheight') || 200,
              border,
              truncate: props.flag('truncate') !== false,
              // Both keys set the same flag (`0x15E7770`).
              specialChars:
                props.flag('ignore_special_chars') !== true &&
                props.flag('use_special_chars') !== false,
            },
          }
        : {}),
    });
    if (kind === 'instantTextBoxType') {
      const lineHeight = this.lineHeightOf(props, 'font');
      if (lineHeight !== undefined) {
        return { x, y, width, height: Math.max(laid ?? 0, lineHeight) + 2 * border.y };
      }
    }
    return { x, y, width, height: height ?? laid ?? 0 };
  }

  /** The `lineHeight` of a widget's font, when the font is loaded. */
  private lineHeightOf(props: Properties, fontKey: string): number | undefined {
    const fontName = props.text(fontKey);
    if (fontName === undefined) return undefined;
    const definition = this.input.index.font(fontName)?.item;
    if (definition === undefined) return undefined;
    const fnt = resolveFontFiles(definition, this.input.exists).fnt;
    if (fnt === undefined) return undefined;
    const font = this.input.assets.font(fnt);
    if (font === undefined) this.unloaded.add(fnt);
    return font === undefined || 'problem' in font ? undefined : font.lineHeight;
  }

  /**
   * `buttonText` in `buttonFont`, centred in the button both ways (or as `format` and
   * `vertical_alignment` say) on whole pixels, by the rules of text boxes (etch#44). `text` and
   * `font` stand in when they are missing.
   */
  private drawButtonText(props: Properties, rect: Rect, source: number): void {
    const textKey = props.has('buttontext') ? 'buttontext' : 'text';
    const fontKey = props.has('buttonfont') ? 'buttonfont' : 'font';
    const format = props.text('format');
    this.drawText(props, textKey, fontKey, rect, source, {
      align: format === undefined ? 'centre' : textAlign(format),
      verticalAlign: verticalAlign(props.text('vertical_alignment')) ?? 'centre',
    });
  }

  /**
   * Moves a button's text draw into its sprite draw when the sprite is a `textSpriteType`: the
   * game bakes such a button's text into a copy of its texture and draws that copy (etch#96,
   * verified in `eu4.exe` 1.37.5: the button's constructor `0x15AC670` gives a `textSpriteType`
   * no text node of its own, and the sprite's node `0x1550E90` renders texture and text into a
   * target through `0x1596660`). Inline icons stay draws of their own (hypothesis).
   */
  private bakeButtonText(props: Properties, spriteAt: number, textStart: number): void {
    const name = props.text(props.has('spritetype') ? 'spritetype' : 'quadtexturesprite');
    if (name === undefined || this.input.index.sprite(name)?.item.kind !== 'textSpriteType') {
      return;
    }
    const sprite = this.draws[spriteAt];
    const textAt = this.draws.findIndex((draw, i) => i >= textStart && draw.kind === 'text');
    const text = this.draws[textAt];
    if (sprite?.kind !== 'sprite' || text?.kind !== 'text') return;
    this.draws.splice(textAt, 1);
    const baked = {
      texture: text.texture,
      glyphs: text.glyphs,
      ...(text.border === undefined ? {} : { border: text.border }),
    };
    this.draws[spriteAt] = { ...sprite, text: baked };
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
      colourCode?: string;
      /** A fixed-size text box's box, which the text is fitted into before it is laid out. */
      fit?: Omit<TextFit, 'iconWidth'>;
    },
  ): number | undefined {
    const sample =
      this.current === undefined ? undefined : this.input.content?.text(this.current, this.row);
    const written = sample ?? props.text(textKey);
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

    const text = sample ?? this.localise(written);
    const icons = new Map<string, { sprite: Sprite; index: number; size: Extent }>();
    const shown =
      options.fit === undefined
        ? text
        : fitText(font, text, {
            ...options.fit,
            // The fit measures an icon by its whole texture (`0x109B000`), whatever its frames.
            iconWidth: (key) => {
              const sprite = this.input.index.sprite(textIconSprite(key))?.item;
              if (sprite === undefined) return 0;
              return this.texture(sprite, 'texturefile', props.scalar(textKey))?.size.width ?? 0;
            },
          }).text;
    const laid = layoutText(font, shown, box, {
      colours: {
        base: definition.colour ?? OPAQUE_WHITE,
        font: definition.textColours,
        global: this.input.index.textColours,
      },
      align: options.align,
      verticalAlign: options.verticalAlign,
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
