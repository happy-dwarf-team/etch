import type {
  BlockNode,
  EntryNode,
  Operator,
  OperatorNode,
  ParsedScript,
  PropertyNode,
  ScalarNode,
  SyntaxDiagnostic,
  SyntaxDiagnosticCode,
  ValueNode,
} from './tree.ts';

// Token kinds, kept in a typed array beside the token offsets.
const WORD = 0;
const STRING = 1;
const OPEN = 2;
const CLOSE = 3;
const OPERATOR = 4;

const TAB_OR_SPACE_MAX = 32; // every code unit up to and including ' ' is whitespace
const LF = 10;
const CR = 13;
const BANG = 33; // !
const QUOTE = 34; // "
const HASH = 35; // #
const LT = 60; // <
const EQ = 61; // =
const GT = 62; // >
const QUESTION = 63; // ?
const LBRACE = 123; // {
const RBRACE = 125; // }

/** The tokens of a text as parallel arrays: no object per token. */
class Tokens {
  count = 0;
  kinds: Uint8Array;
  starts: Int32Array;
  ends: Int32Array;

  constructor(capacity: number) {
    this.kinds = new Uint8Array(capacity);
    this.starts = new Int32Array(capacity);
    this.ends = new Int32Array(capacity);
  }

  push(kind: number, start: number, end: number): void {
    if (this.count === this.kinds.length) {
      const capacity = this.count * 2;
      const kinds = new Uint8Array(capacity);
      const starts = new Int32Array(capacity);
      const ends = new Int32Array(capacity);
      kinds.set(this.kinds);
      starts.set(this.starts);
      ends.set(this.ends);
      this.kinds = kinds;
      this.starts = starts;
      this.ends = ends;
    }
    this.kinds[this.count] = kind;
    this.starts[this.count] = start;
    this.ends[this.count] = end;
    this.count++;
  }
}

function diagnostic(
  code: SyntaxDiagnosticCode,
  start: number,
  end: number,
  message: string,
): SyntaxDiagnostic {
  return { code, message, start, end };
}

function tokenize(text: string, diagnostics: SyntaxDiagnostic[]): Tokens {
  const n = text.length;
  // Vanilla interface files average about one token per 7 characters.
  const tokens = new Tokens(Math.max(16, n >> 3));
  let i = 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c <= TAB_OR_SPACE_MAX) {
      i++;
    } else if (c === HASH) {
      while (i < n && text.charCodeAt(i) !== LF && text.charCodeAt(i) !== CR) i++;
    } else if (c === LBRACE) {
      tokens.push(OPEN, i, ++i);
    } else if (c === RBRACE) {
      tokens.push(CLOSE, i, ++i);
    } else if (
      c === EQ ||
      c === LT ||
      c === GT ||
      ((c === BANG || c === QUESTION) && text.charCodeAt(i + 1) === EQ)
    ) {
      const end = text.charCodeAt(i + 1) === EQ ? i + 2 : i + 1;
      tokens.push(OPERATOR, i, end);
      i = end;
    } else if (c === QUOTE) {
      // No escapes: vanilla writes paths as "gfx\interface\x.dds" and "gfx\\interface\\x.dds",
      // and no interface file has \". No string spans lines, so one that does not close on its
      // line is cut at the line end and the rest of the file still parses.
      let j = i + 1;
      for (; j < n; j++) {
        const d = text.charCodeAt(j);
        if (d === QUOTE || d === LF || d === CR) break;
      }
      if (j < n && text.charCodeAt(j) === QUOTE) {
        tokens.push(STRING, i, j + 1);
        i = j + 1;
      } else {
        diagnostics.push(
          diagnostic('unterminated-string', i, j, 'This string has no closing quote on its line.'),
        );
        tokens.push(STRING, i, j);
        i = j;
      }
    } else {
      let j = i + 1;
      for (; j < n; j++) {
        const d = text.charCodeAt(j);
        if (
          d <= TAB_OR_SPACE_MAX ||
          d === LBRACE ||
          d === RBRACE ||
          d === EQ ||
          d === HASH ||
          d === QUOTE ||
          d === LT ||
          d === GT ||
          ((d === BANG || d === QUESTION) && text.charCodeAt(j + 1) === EQ)
        ) {
          break;
        }
      }
      tokens.push(WORD, i, j);
      i = j;
    }
  }
  return tokens;
}

/** An open block: its entries so far and, unless anonymous, the key that owns it. */
interface Frame {
  readonly entries: EntryNode[];
  readonly open: number;
  readonly key: ScalarNode | undefined;
  readonly operator: OperatorNode | undefined;
}

/**
 * Parses game text of a `.gui` or `.gfx` file into a syntax tree. It never
 * throws: a syntax error becomes a diagnostic, and the parse recovers as the
 * diagnostic's code describes.
 */
export function parseScript(text: string): ParsedScript {
  const diagnostics: SyntaxDiagnostic[] = [];
  const tokens = tokenize(text, diagnostics);
  const { count, kinds, starts, ends } = tokens;

  const scalar = (t: number): ScalarNode => {
    const start = starts[t] ?? 0;
    const end = ends[t] ?? 0;
    if (kinds[t] === WORD) {
      return { kind: 'scalar', text: text.slice(start, end), quoted: false, start, end };
    }
    const closed = end - start >= 2 && text.charCodeAt(end - 1) === QUOTE;
    return {
      kind: 'scalar',
      text: text.slice(start + 1, closed ? end - 1 : end),
      quoted: true,
      start,
      end,
    };
  };

  const operator = (t: number): OperatorNode => {
    const start = starts[t] ?? 0;
    const end = ends[t] ?? 0;
    return { kind: 'operator', text: text.slice(start, end) as Operator, start, end };
  };

  const property = (
    key: ScalarNode,
    op: OperatorNode | undefined,
    value: ValueNode | undefined,
    end: number,
  ): PropertyNode => ({ kind: 'property', key, operator: op, value, start: key.start, end });

  const root: EntryNode[] = [];
  const stack: Frame[] = [];
  let entries = root;

  const close = (frame: Frame, end: number, closed: boolean): void => {
    const block: BlockNode = {
      kind: 'block',
      entries: frame.entries,
      closed,
      start: frame.open,
      end,
    };
    const parent = stack.at(-1)?.entries ?? root;
    parent.push(frame.key ? property(frame.key, frame.operator, block, end) : block);
    entries = parent;
  };

  const open = (t: number, key: ScalarNode | undefined, op: OperatorNode | undefined): void => {
    const frame: Frame = { entries: [], open: starts[t] ?? 0, key, operator: op };
    stack.push(frame);
    entries = frame.entries;
  };

  let t = 0;
  while (t < count) {
    const kind = kinds[t];
    if (kind === CLOSE) {
      const frame = stack.pop();
      if (frame) {
        close(frame, ends[t] ?? 0, true);
      } else {
        diagnostics.push(
          diagnostic(
            'unmatched-close',
            starts[t] ?? 0,
            ends[t] ?? 0,
            'This } closes no block and is ignored.',
          ),
        );
      }
      t++;
    } else if (kind === OPEN) {
      open(t, undefined, undefined);
      t++;
    } else if (kind === OPERATOR) {
      diagnostics.push(
        diagnostic(
          'missing-key',
          starts[t] ?? 0,
          ends[t] ?? 0,
          'This operator has no key before it and is ignored.',
        ),
      );
      t++;
    } else {
      const key = scalar(t);
      const next = kinds[t + 1];
      if (next === OPEN) {
        // `key { … }`, written so in vanilla's contentview.gui and tutorial.gui.
        open(t + 1, key, undefined);
        t += 2;
      } else if (next === OPERATOR) {
        const op = operator(t + 1);
        const v = t + 2;
        const valueKind = v < count ? kinds[v] : undefined;
        if (valueKind === OPEN) {
          open(v, key, op);
          t = v + 1;
        } else if (
          (valueKind === WORD || valueKind === STRING) &&
          !(v + 1 < count && kinds[v + 1] === OPERATOR)
        ) {
          const value = scalar(v);
          entries.push(property(key, op, value, value.end));
          t = v + 1;
        } else {
          // Nothing follows, or `}`, an operator, or the key of the next property (`a = b = c`).
          diagnostics.push(
            diagnostic('missing-value', op.start, op.end, `"${key.text}" has no value.`),
          );
          entries.push(property(key, op, undefined, op.end));
          t = v;
        }
      } else {
        entries.push(key);
        t++;
      }
    }
  }

  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    diagnostics.push(
      diagnostic(
        'unclosed-block',
        frame.open,
        frame.open + 1,
        'This { is never closed; the block runs to the end of the file.',
      ),
    );
    close(frame, text.length, false);
  }

  diagnostics.sort((a, b) => a.start - b.start);
  return { entries: root, diagnostics };
}
