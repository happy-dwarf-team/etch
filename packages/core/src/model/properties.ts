import type { BlockNode, PropertyNode, ScalarNode, ValueNode } from '../script/tree.ts';

/** `@name = value` definitions of a file, by name as written (with the `@`). */
export type Constants = ReadonlyMap<string, ScalarNode>;

const NO_CONSTANTS: Constants = new Map();

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A length of `size`: pixels, or a percentage of the parent (`width = 100%`). */
export interface Length {
  readonly value: number;
  readonly percent: boolean;
}

export interface Size {
  readonly width: Length;
  readonly height: Length;
}

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
const FLAGS: Readonly<Record<string, boolean>> = { yes: true, no: false, true: true, false: false };

/** A property's key as the model compares it: lower case, since the game reads keys without regard to case (etch#3). */
export function keyOf(property: PropertyNode): string {
  return property.key.text.toLowerCase();
}

/** Whether a scalar is a `@name` constant reference. */
export function isConstantReference(node: ScalarNode): boolean {
  return !node.quoted && node.text.startsWith('@') && node.text.length > 1;
}

/** A scalar's text with `@name` replaced by the constant's value; `undefined` for an unknown constant. */
export function scalarText(
  node: ScalarNode,
  constants: Constants = NO_CONSTANTS,
): string | undefined {
  if (!isConstantReference(node)) return node.text;
  return constants.get(node.text)?.text;
}

/** A number written as `12`, `-3`, `0.5` or `+.25`; `undefined` otherwise. */
export function parseNumber(text: string | undefined): number | undefined {
  return text !== undefined && NUMBER.test(text) ? Number(text) : undefined;
}

function parseLength(text: string | undefined): Length | undefined {
  if (text === undefined) return undefined;
  const percent = text.endsWith('%');
  const value = parseNumber(percent ? text.slice(0, -1) : text);
  return value === undefined ? undefined : { value, percent };
}

/**
 * The properties of a widget, sprite or font block as the game would apply them: in the given
 * order, the last one of a key winning (an assumption; the game's rule for a repeated key is
 * unverified). Values are read through the file's `@name` constants. Accessors return
 * `undefined` for a missing or malformed value.
 */
export class Properties {
  /** The properties in the order they apply. */
  readonly entries: readonly PropertyNode[];
  private readonly constants: Constants;
  private readonly byKey = new Map<string, PropertyNode>();

  constructor(entries: readonly PropertyNode[], constants: Constants = NO_CONSTANTS) {
    this.entries = entries;
    this.constants = constants;
    for (const entry of entries) this.byKey.set(keyOf(entry), entry);
  }

  /** The winning property of a key (any case). */
  property(key: string): PropertyNode | undefined {
    return this.byKey.get(key.toLowerCase());
  }

  has(key: string): boolean {
    return this.byKey.has(key.toLowerCase());
  }

  /** Lower-case keys that have a value, in first-seen order. */
  keys(): IterableIterator<string> {
    return this.byKey.keys();
  }

  /** The value's scalar node, or `undefined` when the value is a block or missing. */
  scalar(key: string): ScalarNode | undefined {
    const value = this.property(key)?.value;
    return value?.kind === 'scalar' ? value : undefined;
  }

  block(key: string): BlockNode | undefined {
    const value = this.property(key)?.value;
    return value?.kind === 'block' ? value : undefined;
  }

  text(key: string): string | undefined {
    const node = this.scalar(key);
    return node === undefined ? undefined : scalarText(node, this.constants);
  }

  number(key: string): number | undefined {
    return parseNumber(this.text(key));
  }

  /** `yes`/`no`, `true`/`false` or a number (non-zero is true), without regard to case. */
  flag(key: string): boolean | undefined {
    const text = this.text(key)?.toLowerCase();
    if (text === undefined) return undefined;
    const flag = FLAGS[text];
    if (flag !== undefined) return flag;
    const n = parseNumber(text);
    return n === undefined ? undefined : n !== 0;
  }

  /** `{ x = … y = … }`, `{ width = … height = … }` or `{ a b }`. */
  point(key: string): Point | undefined {
    const pair = this.pair(key);
    if (pair === undefined) return undefined;
    const x = parseNumber(pair[0]);
    const y = parseNumber(pair[1]);
    return x === undefined || y === undefined ? undefined : { x, y };
  }

  /** Like {@link point}, with `%` allowed on either side. */
  size(key: string): Size | undefined {
    const pair = this.pair(key);
    if (pair === undefined) return undefined;
    const width = parseLength(pair[0]);
    const height = parseLength(pair[1]);
    return width === undefined || height === undefined ? undefined : { width, height };
  }

  /** Bare numbers of a block, such as `color = { 1.0 0.5 0 }`. */
  numbers(key: string): number[] | undefined {
    const block = this.block(key);
    if (block === undefined) return undefined;
    const out: number[] = [];
    for (const entry of block.entries) {
      if (entry.kind !== 'scalar') return undefined;
      const n = parseNumber(scalarText(entry, this.constants));
      if (n === undefined) return undefined;
      out.push(n);
    }
    return out;
  }

  private pair(key: string): [string | undefined, string | undefined] | undefined {
    const block = this.block(key);
    if (block === undefined) return undefined;
    const inner = new Properties(propertiesOf(block), this.constants);
    if (inner.has('x') || inner.has('y')) return [inner.text('x'), inner.text('y')];
    if (inner.has('width') || inner.has('height'))
      return [inner.text('width'), inner.text('height')];
    const bare = block.entries.filter((e): e is ScalarNode => e.kind === 'scalar');
    if (bare.length !== 2) return undefined;
    return [
      scalarText(bare[0] as ScalarNode, this.constants),
      scalarText(bare[1] as ScalarNode, this.constants),
    ];
  }
}

/** The `key = value` entries of a block, in file order. */
export function propertiesOf(block: BlockNode): PropertyNode[] {
  return block.entries.filter((e): e is PropertyNode => e.kind === 'property');
}

/** Every `@name` scalar in a value, for the unknown-constant check. */
export function* constantReferences(value: ValueNode | undefined): Generator<ScalarNode> {
  if (value === undefined) return;
  if (value.kind === 'scalar') {
    if (isConstantReference(value)) yield value;
    return;
  }
  for (const entry of value.entries) {
    if (entry.kind === 'property') yield* constantReferences(entry.value);
    else yield* constantReferences(entry);
  }
}
