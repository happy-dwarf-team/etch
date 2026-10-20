/**
 * The extension's model of a `.gui` file (etch#3): the widgets under `guiTypes`, nested as written,
 * with their properties and `if_resolution` blocks. Reading never fails; what the model cannot use
 * becomes a diagnostic.
 */
import type { BlockNode, ParsedScript, PropertyNode, ScalarNode } from '../script/tree.ts';
import { diagnostic, type ModelDiagnostic } from './diagnostics.ts';
import {
  Properties,
  constantReferences,
  keyOf,
  parseNumber,
  propertiesOf,
  type Constants,
} from './properties.ts';

/**
 * The block kinds vanilla 1.37.5 uses for widgets, spelled as vanilla mostly writes them. The
 * last five are parts: `background` inside `containerWindowType`, the other four inside
 * `extendedScrollbarType` (etch#3).
 */
export const WIDGET_KINDS = [
  'instantTextBoxType',
  'iconType',
  'guiButtonType',
  'windowType',
  'listboxType',
  'checkboxType',
  'positionType',
  'editBoxType',
  'OverlappingElementsBoxType',
  'shieldtype',
  'textBoxType',
  'eu3dialogtype',
  'buttonType',
  'smoothListboxType',
  'containerWindowType',
  'scrollbarType',
  'gridBoxType',
  'extendedScrollbarType',
  'background',
  'slider',
  'track',
  'increaseButton',
  'decreaseButton',
] as const;

export type WidgetKind = (typeof WIDGET_KINDS)[number];

const PART_PARENTS: ReadonlyMap<string, WidgetKind> = new Map<string, WidgetKind>([
  ['background', 'containerWindowType'],
  ['slider', 'extendedScrollbarType'],
  ['track', 'extendedScrollbarType'],
  ['increasebutton', 'extendedScrollbarType'],
  ['decreasebutton', 'extendedScrollbarType'],
]);

const KIND_BY_KEY: ReadonlyMap<string, WidgetKind> = new Map(
  WIDGET_KINDS.map((kind) => [kind.toLowerCase(), kind]),
);

/** The widget kind a block key names inside a parent of `parentKind` (`undefined` at top level). */
function widgetKindOf(key: string, parentKind: WidgetKind | undefined): WidgetKind | undefined {
  const kind = KIND_BY_KEY.get(key);
  if (kind === undefined) return undefined;
  const partOf = PART_PARENTS.get(key);
  return partOf === undefined || partOf === parentKind ? kind : undefined;
}

/** The screen size `if_resolution` blocks are evaluated against. */
export interface Screen {
  readonly width: number;
  readonly height: number;
}

/** An `if_resolution = { min_height = … … }` block: properties applied when the screen is in range. */
export interface ResolutionBlock {
  readonly node: PropertyNode;
  readonly minWidth: number | undefined;
  readonly maxWidth: number | undefined;
  readonly minHeight: number | undefined;
  readonly maxHeight: number | undefined;
  /** The properties it applies, in file order, without the bounds. */
  readonly entries: readonly PropertyNode[];
}

export interface Widget {
  readonly kind: WidgetKind;
  /** The `name` value as written; the game compares names without regard to case (etch#16). */
  readonly name: string | undefined;
  readonly nameNode: ScalarNode | undefined;
  /** The `kind = { … }` property: its range is the widget's source range. */
  readonly node: PropertyNode;
  /**
   * The widget's own properties in file order, child widgets left out and `if_resolution` blocks
   * kept where they stand. {@link widgetProperties} applies them for one screen.
   */
  readonly properties: readonly PropertyNode[];
  readonly resolutionBlocks: readonly ResolutionBlock[];
  readonly children: readonly Widget[];
}

export interface GuiFile {
  /** The top-level widgets of every `guiTypes` block, in file order. */
  readonly definitions: readonly Widget[];
  /** Top-level `@name = value` constants (Anbennar's 2K UI uses them for positions). */
  readonly constants: Constants;
  /** Structural problems: duplicate top-level names, unknown kinds and constants. */
  readonly diagnostics: readonly ModelDiagnostic[];
}

const RESOLUTION_BOUNDS = new Set(['min_width', 'max_width', 'min_height', 'max_height']);

/** Builds the model of a parsed `.gui` file. */
export function readGuiFile(parsed: ParsedScript): GuiFile {
  const diagnostics: ModelDiagnostic[] = [];
  const constants = new Map<string, ScalarNode>();
  for (const entry of parsed.entries) {
    if (
      entry.kind === 'property' &&
      entry.key.text.startsWith('@') &&
      entry.value?.kind === 'scalar'
    ) {
      constants.set(entry.key.text, entry.value);
    }
  }

  const definitions: Widget[] = [];
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || keyOf(entry) !== 'guitypes' || entry.value?.kind !== 'block')
      continue;
    for (const child of propertiesOf(entry.value)) {
      const widget = readWidget(child, undefined, diagnostics);
      if (widget !== undefined) definitions.push(widget);
    }
  }

  reportDuplicateNames(definitions, diagnostics);
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || keyOf(entry) !== 'guitypes') continue;
    for (const ref of constantReferences(entry.value)) {
      if (!constants.has(ref.text)) {
        diagnostics.push(
          diagnostic(
            'warning',
            'unknown-constant',
            ref,
            `Constant ${ref.text} is not defined in this file.`,
          ),
        );
      }
    }
  }
  diagnostics.sort((a, b) => a.start - b.start);
  return { definitions, constants, diagnostics };
}

function readWidget(
  node: PropertyNode,
  parentKind: WidgetKind | undefined,
  diagnostics: ModelDiagnostic[],
): Widget | undefined {
  const body = node.value;
  if (body?.kind !== 'block') return undefined;
  const key = keyOf(node);
  const kind = widgetKindOf(key, parentKind);
  if (kind === undefined) {
    if (looksLikeWidget(key, body, parentKind)) {
      diagnostics.push(
        diagnostic(
          'information',
          'unknown-widget-kind',
          node.key,
          `${node.key.text} is not a widget kind vanilla EU4 1.37.5 uses; Etch does not draw it.`,
        ),
      );
    }
    return undefined;
  }

  const properties: PropertyNode[] = [];
  const resolutionBlocks: ResolutionBlock[] = [];
  const children: Widget[] = [];
  let nameNode: ScalarNode | undefined;
  for (const entry of propertiesOf(body)) {
    const entryKey = keyOf(entry);
    if (entry.value?.kind === 'block' && widgetKindOf(entryKey, kind) !== undefined) {
      const child = readWidget(entry, kind, diagnostics);
      if (child !== undefined) children.push(child);
      continue;
    }
    if (entry.value?.kind === 'block' && looksLikeWidget(entryKey, entry.value, kind)) {
      readWidget(entry, kind, diagnostics);
      continue;
    }
    properties.push(entry);
    if (entryKey === 'name' && entry.value?.kind === 'scalar') nameNode = entry.value;
    if (entryKey === 'if_resolution' && entry.value?.kind === 'block') {
      resolutionBlocks.push(readResolutionBlock(entry, entry.value));
    }
  }
  return { kind, name: nameNode?.text, nameNode, node, properties, resolutionBlocks, children };
}

/** A named block whose key reads like a widget kind (`…Type`, `…Box`), or any named block at top level. */
function looksLikeWidget(
  key: string,
  body: BlockNode,
  parentKind: WidgetKind | undefined,
): boolean {
  if (key === 'if_resolution') return false;
  const named = propertiesOf(body).some((p) => keyOf(p) === 'name');
  return named && (parentKind === undefined || /(?:type|box)$/.test(key));
}

function readResolutionBlock(node: PropertyNode, body: BlockNode): ResolutionBlock {
  const bounds = new Map<string, number | undefined>();
  const entries: PropertyNode[] = [];
  for (const entry of propertiesOf(body)) {
    const key = keyOf(entry);
    if (RESOLUTION_BOUNDS.has(key)) {
      bounds.set(key, entry.value?.kind === 'scalar' ? parseNumber(entry.value.text) : undefined);
    } else {
      entries.push(entry);
    }
  }
  return {
    node,
    minWidth: bounds.get('min_width'),
    maxWidth: bounds.get('max_width'),
    minHeight: bounds.get('min_height'),
    maxHeight: bounds.get('max_height'),
    entries,
  };
}

function reportDuplicateNames(
  definitions: readonly Widget[],
  diagnostics: ModelDiagnostic[],
): void {
  const first = new Map<string, Widget>();
  for (const widget of definitions) {
    if (widget.name === undefined || widget.nameNode === undefined) continue;
    const key = widget.name.toLowerCase();
    const earlier = first.get(key);
    if (earlier === undefined) {
      first.set(key, widget);
      continue;
    }
    diagnostics.push(
      diagnostic(
        'warning',
        'duplicate-top-level-name',
        widget.nameNode,
        `Top-level name ${widget.name} is already defined in this file (offset ${String(earlier.node.start)}). ` +
          'At startup the game keeps one of the two at random, and a reload of this file frees the old ' +
          'definition twice and can crash the game (etch#16).',
      ),
    );
  }
}

/** Whether an `if_resolution` block applies on a screen; bounds are inclusive. */
export function resolutionApplies(block: ResolutionBlock, screen: Screen): boolean {
  return (
    (block.minWidth === undefined || screen.width >= block.minWidth) &&
    (block.maxWidth === undefined || screen.width <= block.maxWidth) &&
    (block.minHeight === undefined || screen.height >= block.minHeight) &&
    (block.maxHeight === undefined || screen.height <= block.maxHeight)
  );
}

/**
 * A widget's properties on a screen: its own, with each applying `if_resolution` block's
 * properties taking effect where the block stands in the file, as the game evaluates them while
 * parsing (etch#16). Without a screen no `if_resolution` block applies.
 */
export function widgetProperties(
  widget: Widget,
  constants: Constants,
  screen?: Screen,
): Properties {
  const applied: PropertyNode[] = [];
  let blocks = 0;
  for (const entry of widget.properties) {
    if (keyOf(entry) !== 'if_resolution') {
      applied.push(entry);
      continue;
    }
    const block = widget.resolutionBlocks[blocks++];
    if (screen !== undefined && block !== undefined && resolutionApplies(block, screen)) {
      applied.push(...block.entries);
    }
  }
  return new Properties(applied, constants);
}

/** The top-level definition with a name, compared without regard to case; the first one wins. */
export function findDefinition(file: GuiFile, name: string): Widget | undefined {
  const key = name.toLowerCase();
  return file.definitions.find((w) => w.name?.toLowerCase() === key);
}

/** The widgets whose source range holds `offset`, from the top-level definition down. */
export function widgetPathAt(file: GuiFile, offset: number): Widget[] {
  const path: Widget[] = [];
  let level: readonly Widget[] = file.definitions;
  for (;;) {
    const hit = level.find((w) => w.node.start <= offset && offset < w.node.end);
    if (hit === undefined) return path;
    path.push(hit);
    level = hit.children;
  }
}

/** Every widget of a file, depth first in file order, with its parent. */
export function* allWidgets(
  file: GuiFile,
): Generator<{ widget: Widget; parent: Widget | undefined }> {
  function* walk(
    widgets: readonly Widget[],
    parent: Widget | undefined,
  ): Generator<{ widget: Widget; parent: Widget | undefined }> {
    for (const widget of widgets) {
      yield { widget, parent };
      yield* walk(widget.children, widget);
    }
  }
  yield* walk(file.definitions, undefined);
}
