/**
 * The syntax tree of a Paradox script file (`.gui`, `.gfx`): what is written,
 * in file order, with duplicate keys kept. Keys and values are text as written;
 * case, numbers and meaning are left to the model.
 */

/**
 * A half-open range `[start, end)` of offsets into the game text the tree was
 * parsed from. Game text of an interface file is Windows-1252, one character
 * per byte, so the offsets are also byte offsets into the file.
 */
export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

/** A word (`guiTypes`, `-12`, `@offset`) or a quoted string. */
export interface ScalarNode extends SourceRange {
  readonly kind: 'scalar';
  /** The text as written, without the quotes of a quoted string; escapes only in a save's. */
  readonly text: string;
  /** Whether the scalar was written in quotes; its range then includes them. */
  readonly quoted: boolean;
}

/** `{ … }`; its range runs from `{` through `}`, or to the end of the text when unclosed. */
export interface BlockNode extends SourceRange {
  readonly kind: 'block';
  /** Properties, bare values and anonymous blocks, in file order. */
  readonly entries: readonly EntryNode[];
  /** False when the text ends before the block's `}`. */
  readonly closed: boolean;
}

export type ValueNode = ScalarNode | BlockNode;

export type Operator = '=' | '==' | '!=' | '<' | '<=' | '>' | '>=' | '?=';

export interface OperatorNode extends SourceRange {
  readonly kind: 'operator';
  readonly text: Operator;
}

/** `key = value`; its range runs from the key to the end of the value. */
export interface PropertyNode extends SourceRange {
  readonly kind: 'property';
  readonly key: ScalarNode;
  /** Undefined for `key { … }`, which vanilla files use as `key = { … }`. */
  readonly operator: OperatorNode | undefined;
  /** Undefined when the value is missing; the parse then reports `missing-value`. */
  readonly value: ValueNode | undefined;
}

/** What a block or the file holds: a property, a bare value (`{ 1 2 3 }`) or an anonymous block. */
export type EntryNode = PropertyNode | ValueNode;

export type SyntaxDiagnosticCode =
  /** A `{` without its `}`; the block runs to the end of the text. */
  | 'unclosed-block'
  /** A `}` with no open block; it is skipped. */
  | 'unmatched-close'
  /** A quoted string without its closing quote on the same line; it ends at the line end. */
  | 'unterminated-string'
  /** An operator with nothing after it, or followed by `}` or by the next property. */
  | 'missing-value'
  /** An operator with no key before it; it is skipped. */
  | 'missing-key';

/** A syntax error. The parse always completes; each error says how it recovered. */
export interface SyntaxDiagnostic extends SourceRange {
  readonly code: SyntaxDiagnosticCode;
  readonly message: string;
}

export interface ParsedScript {
  /** The file's top-level entries, in file order. */
  readonly entries: readonly EntryNode[];
  /** Syntax errors in text order. */
  readonly diagnostics: readonly SyntaxDiagnostic[];
}
