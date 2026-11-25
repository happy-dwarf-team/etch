/**
 * The structure of a `.gui` file against the keys EU4 1.37.5 reads ({@link GUI_SCHEMAS}): where a
 * block of the file stands in that table, for completion, and the structure check, whose
 * diagnostics are kept apart from `guiDiagnostics` so that the extension can leave them to CWTools
 * when its `.gui` rules run.
 */
import type { BlockNode, PropertyNode, ScalarNode } from '../script/tree.ts';
import { diagnostic, type ModelDiagnostic } from './diagnostics.ts';
import type { GuiFile } from './gui.ts';
import {
  GUI_ANIMATIONS,
  GUI_CONTAINER_ORIENTATIONS,
  GUI_ORIENTATIONS,
  GUI_ROOT,
  GUI_SCHEMAS,
  GUI_TEXT_FORMATS,
  GUI_VERTICAL_ALIGNMENTS,
  type GuiSchema,
  type GuiSchemaName,
  type GuiValueKind,
} from './gui-schema.ts';
import { keyOf, parseNumber, scalarText, type Constants } from './properties.ts';

/** The kinds of value a field of a value block takes: an integer, or an integer, `N%` or `auto`. */
type FieldKind = 'int' | 'length';

/** The value blocks with named fields, and the nested blocks of `position` and `size`. */
type BlockKind = 'point' | 'position' | 'positionPart' | 'size' | 'sizePart' | 'offset';

const BLOCK_FIELDS: Readonly<Record<BlockKind, Readonly<Record<string, FieldKind | BlockKind>>>> = {
  point: { x: 'int', y: 'int' },
  position: {
    x: 'length',
    y: 'length',
    step: 'positionPart',
    min: 'positionPart',
    max: 'positionPart',
  },
  positionPart: { x: 'length', y: 'length' },
  size: { width: 'length', height: 'length', step: 'sizePart', min: 'sizePart', max: 'sizePart' },
  sizePart: { width: 'length', height: 'length' },
  offset: { left: 'length', right: 'length', top: 'length', bottom: 'length' },
};

const RESOLUTION_BOUNDS = ['min_width', 'max_width', 'min_height', 'max_height'];

/** Where a block of a `.gui` file stands in the table of keys the game reads. */
export type GuiPlace =
  /** Directly inside `guiTypes`. */
  | { readonly kind: 'root' }
  /** Inside a widget's block, or inside one of its `if_resolution` blocks (`resolution`). */
  | {
      readonly kind: 'widget';
      readonly schema: GuiSchemaName;
      /** The widget's key as written (`windowType`, `listboxType`). */
      readonly written: string;
      readonly resolution: boolean;
    }
  /** Inside a value block such as `position = { … }`. */
  | { readonly kind: 'block'; readonly block: BlockKind; readonly written: string };

/** A key the game reads at a place, as the table spells it. */
export interface GuiPlaceKey {
  readonly written: string;
  /** A widget key's schema, or the value kind of any other key. */
  readonly widget: GuiSchemaName | undefined;
  readonly value: GuiValueKind | FieldKind | BlockKind | undefined;
}

const ROOT_BY_KEY = lowerMap(GUI_ROOT);
const CHILDREN_BY_KEY = new Map<GuiSchemaName, ReadonlyMap<string, [string, GuiSchemaName]>>();
const KEYS_BY_KEY = new Map<GuiSchemaName, ReadonlyMap<string, [string, GuiValueKind]>>();
for (const [name, schema] of Object.entries(GUI_SCHEMAS) as [GuiSchemaName, GuiSchema][]) {
  CHILDREN_BY_KEY.set(name, lowerMap(schema.children));
  KEYS_BY_KEY.set(name, lowerMap(schema.keys));
}

function lowerMap<T>(record: Readonly<Record<string, T>>): ReadonlyMap<string, [string, T]> {
  return new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), [key, value]]));
}

/** Whether the game reads a key (any case) as a widget somewhere: in `guiTypes` or in a container. */
export function isGuiWidgetKey(key: string): boolean {
  const lower = key.toLowerCase();
  return ROOT_BY_KEY.has(lower) || [...CHILDREN_BY_KEY.values()].some((c) => c.has(lower));
}

/**
 * Whether the game creates a child widget of key `child` inside a window of key `parent`
 * (`containerWindowType`, `windowType`, `eu3dialogtype`), both in any case: a
 * `containerWindowType` creates a `buttonType` but no `guiButtonType`, a `windowType` the other
 * way round. `true` for a parent the table has no widget of `guiTypes` for.
 */
export function guiCreatesChild(parent: string, child: string): boolean {
  const schema = ROOT_BY_KEY.get(parent.toLowerCase())?.[1];
  if (schema === undefined) return true;
  return CHILDREN_BY_KEY.get(schema)?.has(child.toLowerCase()) ?? true;
}

/** The place inside a `guiTypes` block. */
export const GUI_ROOT_PLACE: GuiPlace = { kind: 'root' };

/**
 * The place inside a property's block, from the place that holds the property; `undefined`
 * where the game reads no block (an unknown key, a value that is not a block).
 */
export function guiPlaceInside(place: GuiPlace, property: PropertyNode): GuiPlace | undefined {
  const key = keyOf(property);
  const written = property.key.text;
  switch (place.kind) {
    case 'root': {
      const schema = ROOT_BY_KEY.get(key)?.[1];
      return schema === undefined
        ? undefined
        : { kind: 'widget', schema, written, resolution: false };
    }
    case 'widget': {
      const schema = GUI_SCHEMAS[place.schema];
      if (key === 'if_resolution' && schema.resolution) return { ...place, resolution: true };
      const child = CHILDREN_BY_KEY.get(place.schema)?.get(key)?.[1];
      if (child !== undefined) return { kind: 'widget', schema: child, written, resolution: false };
      const value = KEYS_BY_KEY.get(place.schema)?.get(key)?.[1];
      return value !== undefined && isBlockKind(value)
        ? { kind: 'block', block: value, written }
        : undefined;
    }
    case 'block': {
      const field = BLOCK_FIELDS[place.block][key];
      return field !== undefined && isBlockKind(field)
        ? { kind: 'block', block: field, written }
        : undefined;
    }
  }
}

function isBlockKind(kind: string): kind is BlockKind {
  return kind in BLOCK_FIELDS;
}

/**
 * The keys the game reads at a place, as the table spells them: the widgets of `guiTypes`; a
 * widget's keys (without those it ignores) and the child widgets it creates, with the bounds of
 * `if_resolution` inside one; a value block's fields.
 */
export function guiPlaceKeys(place: GuiPlace): GuiPlaceKey[] {
  switch (place.kind) {
    case 'root':
      return Object.entries(GUI_ROOT).map(([written, widget]) => ({
        written,
        widget,
        value: undefined,
      }));
    case 'widget': {
      const schema = GUI_SCHEMAS[place.schema];
      const out: GuiPlaceKey[] = [];
      for (const [written, widget] of Object.entries(schema.children)) {
        out.push({ written, widget, value: undefined });
      }
      for (const [written, value] of Object.entries(schema.keys)) {
        if (place.resolution && written === 'name') continue;
        out.push({ written, widget: undefined, value });
      }
      if (schema.resolution) {
        if (place.resolution) {
          for (const written of RESOLUTION_BOUNDS)
            out.push({ written, widget: undefined, value: 'int' });
        } else {
          out.push({ written: 'if_resolution', widget: undefined, value: undefined });
        }
      }
      return out;
    }
    case 'block':
      return Object.entries(BLOCK_FIELDS[place.block]).map(([written, value]) => ({
        written,
        widget: undefined,
        value,
      }));
  }
}

/** The value kind the game reads for a key of a widget (any case), or `undefined`. */
export function guiValueKind(schema: GuiSchemaName, key: string): GuiValueKind | undefined {
  return KEYS_BY_KEY.get(schema)?.get(key.toLowerCase())?.[1];
}

/** The words a value kind takes, for completion: an enum's, or `yes` and `no`. */
export function guiValueWords(kind: GuiValueKind): readonly string[] | undefined {
  switch (kind) {
    case 'bool':
      return ['yes', 'no'];
    case 'orientation':
      return GUI_ORIENTATIONS;
    case 'containerOrientation':
      return GUI_CONTAINER_ORIENTATIONS;
    case 'animation':
      return GUI_ANIMATIONS;
    case 'textFormat':
      return GUI_TEXT_FORMATS;
    case 'verticalAlignment':
      return GUI_VERTICAL_ALIGNMENTS;
    default:
      return undefined;
  }
}

const INTEGER = /^[+-]?\d+$/;
const BOOLS = new Set(['yes', 'no']);
const ANCHORS = new Set(GUI_ORIENTATIONS.map((w) => w.toLowerCase()));
const CONTAINER_ANCHORS = new Set(GUI_CONTAINER_ORIENTATIONS.map((w) => w.toLowerCase()));
const ENUM_FALLBACK: Partial<Record<GuiValueKind, [ReadonlySet<string>, string]>> = {
  textFormat: [new Set(GUI_TEXT_FORMATS), 'left'],
  verticalAlignment: [new Set(GUI_VERTICAL_ALIGNMENTS), 'bottom'],
  animation: [new Set(GUI_ANIMATIONS), 'none'],
};

/**
 * The structure check of a `.gui` file against the keys EU4 1.37.5 reads: keys a widget does not
 * take (child widgets included), keys it reads only to log that they do nothing, values of the
 * wrong kind, orientations outside the anchors, and fractions where the game reads an integer.
 * Keys compare without regard to case, as the game reads them. Values written as `@name`
 * constants are read through the file's constants; one the file does not define is left to
 * `unknown-constant`.
 */
export function guiStructureDiagnostics(file: GuiFile): ModelDiagnostic[] {
  const check = new StructureCheck(file.constants);
  for (const guiTypes of file.guiTypes) {
    if (guiTypes.value?.kind === 'block') check.block(GUI_ROOT_PLACE, guiTypes.value);
  }
  return check.out.sort((a, b) => a.start - b.start);
}

class StructureCheck {
  readonly out: ModelDiagnostic[] = [];
  private readonly constants: Constants;

  constructor(constants: Constants) {
    this.constants = constants;
  }

  block(place: GuiPlace, block: BlockNode): void {
    for (const entry of block.entries) {
      if (entry.kind !== 'property') {
        if (place.kind === 'block') {
          this.warn(
            'wrong-value-kind',
            entry,
            `The game reads named fields here, not a bare value.`,
          );
        }
        continue;
      }
      if (entry.key.text.startsWith('@')) continue;
      this.property(place, entry);
    }
  }

  private property(place: GuiPlace, property: PropertyNode): void {
    const key = keyOf(property);
    const written = property.key.text;
    const value = property.value;
    if (value === undefined) return;
    if (place.kind === 'root') {
      if (!ROOT_BY_KEY.has(key)) {
        this.warn(
          'unknown-key',
          property.key,
          `The game does not read ${written} in guiTypes.${hint(key, undefined)}`,
        );
        return;
      }
      this.widget(place, property);
      return;
    }
    if (place.kind === 'block') {
      const field = BLOCK_FIELDS[place.block][key];
      if (field === undefined) {
        const fields = Object.keys(BLOCK_FIELDS[place.block]);
        this.warn(
          'unknown-key',
          property.key,
          `The game does not read ${written} in ${place.written}: it takes ${fields.slice(0, -1).join(', ')} and ${fields.at(-1) ?? ''}.`,
        );
      } else if (isBlockKind(field)) {
        this.valueBlock(field, property);
      } else {
        this.field(field, property);
      }
      return;
    }

    const schema = GUI_SCHEMAS[place.schema];
    if (place.resolution && RESOLUTION_BOUNDS.includes(key)) {
      this.scalar('int', property);
      return;
    }
    if (key === 'if_resolution' && schema.resolution) {
      if (value.kind !== 'block') this.notBlock(property);
      else this.block({ ...place, resolution: true }, value);
      return;
    }
    if (CHILDREN_BY_KEY.get(place.schema)?.has(key) === true) {
      this.widget(place, property);
      return;
    }
    const kind = KEYS_BY_KEY.get(place.schema)?.get(key)?.[1];
    if (kind !== undefined) {
      if (isBlockKind(kind)) this.valueBlock(kind, property);
      else if (kind === 'floats') this.floats(property);
      else this.scalar(kind, property, place.written);
      return;
    }
    if (schema.ignored.some((k) => k.toLowerCase() === key)) {
      this.warn('ignored-key', property.key, `The game ignores ${written} in ${place.written}.`);
      return;
    }
    this.warn(
      'unknown-key',
      property.key,
      `The game does not read ${written} in ${place.written}.${hint(key, place.schema)}`,
    );
  }

  private widget(place: GuiPlace, property: PropertyNode): void {
    const inside = guiPlaceInside(place, property);
    if (property.value?.kind !== 'block' || inside === undefined) {
      this.notBlock(property);
      return;
    }
    this.block(inside, property.value);
  }

  private valueBlock(kind: BlockKind, property: PropertyNode): void {
    if (property.value?.kind !== 'block') {
      this.warn(
        'wrong-value-kind',
        property.value ?? property,
        `The game reads ${property.key.text} as a block, { ${Object.keys(BLOCK_FIELDS[kind]).slice(0, 2).join(' = … ')} = … }.`,
      );
      return;
    }
    this.block({ kind: 'block', block: kind, written: property.key.text }, property.value);
  }

  private floats(property: PropertyNode): void {
    const value = property.value;
    if (value?.kind !== 'block') {
      this.warn(
        'wrong-value-kind',
        value ?? property,
        `The game reads ${property.key.text} as a block of numbers.`,
      );
      return;
    }
    for (const entry of value.entries) {
      const scalar = entry.kind === 'scalar' ? entry : undefined;
      const text = scalar === undefined ? undefined : this.text(scalar);
      if (scalar !== undefined && text === undefined) continue;
      if (scalar === undefined || parseNumber(text) === undefined) {
        this.warn(
          'wrong-value-kind',
          entry,
          `The game reads ${property.key.text} as a block of numbers.`,
        );
      }
    }
  }

  private field(kind: FieldKind, property: PropertyNode): void {
    const value = property.value;
    if (value?.kind !== 'scalar') {
      this.notScalar(property);
      return;
    }
    const text = this.text(value);
    if (text === undefined) return;
    if (kind === 'length') {
      const lower = text.toLowerCase();
      if (lower === 'auto') return;
      if (text.endsWith('%') && parseNumber(text.slice(0, -1)) !== undefined) return;
    }
    this.integer(property, value, text);
  }

  private scalar(kind: GuiValueKind, property: PropertyNode, widget?: string): void {
    const value = property.value;
    if (value?.kind !== 'scalar') {
      this.notScalar(property);
      return;
    }
    const text = this.text(value);
    if (text === undefined) return;
    const lower = text.toLowerCase();
    const key = property.key.text;
    switch (kind) {
      case 'text':
      case 'sprite':
        return;
      case 'int':
        this.integer(property, value, text);
        return;
      case 'float':
        if (parseNumber(text) === undefined) {
          this.warn('wrong-value-kind', value, `The game reads ${key} as a number, not ${text}.`);
        }
        return;
      case 'bool':
        if (!BOOLS.has(lower)) {
          this.warn('wrong-value-kind', value, `The game reads ${key} as yes or no, not ${text}.`);
        }
        return;
      case 'orientation':
        if (!ANCHORS.has(lower)) {
          this.warn(
            'unknown-orientation',
            value,
            `${text} is not one of the nine anchors the game reads for ${key}; the game puts the widget at the upper left.`,
          );
        }
        return;
      case 'containerOrientation':
        if (!CONTAINER_ANCHORS.has(lower)) {
          this.warn(
            'unknown-orientation',
            value,
            ANCHORS.has(lower)
              ? `${widget ?? 'containerWindowType'} does not take ${text} for ${key}; the game puts it at the upper left.`
              : `${text} is not one of the anchors the game reads for ${key}; the game puts the widget at the upper left.`,
          );
        }
        return;
      default: {
        const fallback = ENUM_FALLBACK[kind];
        if (fallback !== undefined && !fallback[0].has(lower)) {
          this.warn(
            'wrong-value-kind',
            value,
            `The game does not know ${text} for ${key}: it takes ${[...fallback[0]].join(', ')}, and reads any other word as ${fallback[1]}.`,
          );
        }
      }
    }
  }

  private integer(property: PropertyNode, value: ScalarNode, text: string): void {
    if (INTEGER.test(text)) return;
    const n = parseNumber(text);
    const key = property.key.text;
    if (n !== undefined && Number.isInteger(n)) return;
    if (n === undefined) {
      this.warn('wrong-value-kind', value, `The game reads ${key} as a whole number, not ${text}.`);
    } else {
      this.warn(
        'fraction-as-int',
        value,
        `The game reads ${key} as a whole number: ${text} is read as ${String(Math.trunc(n))}.`,
      );
    }
  }

  private notBlock(property: PropertyNode): void {
    this.warn(
      'wrong-value-kind',
      property.value ?? property,
      `The game reads ${property.key.text} as a block.`,
    );
  }

  private notScalar(property: PropertyNode): void {
    this.warn(
      'wrong-value-kind',
      property.value ?? property,
      `The game reads ${property.key.text} as a value, not a block.`,
    );
  }

  /** A scalar's text through the file's constants; `undefined` for an unknown or computed one. */
  private text(node: ScalarNode): string | undefined {
    const text = scalarText(node, this.constants);
    return text === undefined || text.startsWith('@') ? undefined : text;
  }

  private warn(
    code:
      | 'unknown-key'
      | 'ignored-key'
      | 'wrong-value-kind'
      | 'unknown-orientation'
      | 'fraction-as-int',
    range: { start: number; end: number },
    message: string,
  ): void {
    this.out.push(diagnostic('warning', code, range, message));
  }
}

/**
 * A hint for a widget key the game reads elsewhere: the key this place takes for the same widget
 * (`buttonType` in a `containerWindowType` for `guiButtonType`), or where the game reads it.
 */
function hint(key: string, schema: GuiSchemaName | undefined): string {
  const target =
    ROOT_BY_KEY.get(key)?.[1] ??
    [...CHILDREN_BY_KEY.values()]
      .map((children) => children.get(key)?.[1])
      .find((s) => s !== undefined);
  if (target === undefined) return '';
  const here = schema === undefined ? ROOT_BY_KEY : CHILDREN_BY_KEY.get(schema);
  const same = [...(here?.values() ?? [])].find(([written, s]) => {
    const other = written.toLowerCase();
    return s === target && (key.endsWith(other) || other.endsWith(key));
  })?.[0];
  if (same !== undefined) return ` It takes ${same} for this widget here.`;
  return schema === undefined
    ? ' It is a widget the game reads only inside another widget.'
    : ' It is a widget the game does not create here.';
}
