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
const BACKSLASH = 92; // \
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

/** How a text is read. */
export interface ParseOptions {
  /**
   * Read the text as a save's (spec section 5): a quoted string may span lines and holds `\"`
   * and `\\` escapes, which a scalar's `text` gives unescaped. Interface files have neither
   * (etch#15).
   */
  readonly save?: boolean;
  /**
   * Read the text as a script file's (`common`, `events`, `decisions`, `missions`, `history`): a
   * quoted string runs to the next quote, across lines, as the game reads it. Vanilla's
   * government mechanics hold an `effect = "` whose script runs over the next lines, and
   * Anbennar's parliament issues an `effect = "add_country_modifier = {` closed by `}"` lines
   * later; cut at the line end, its braces would close the wrong block. No escapes, as in
   * interface files. A string that never closes is cut at its line end, so that the rest of the
   * file still parses; its problem goes where the quotes start to pair up wrongly
   * (`unclosedScriptString`).
   */
  readonly script?: boolean;
}

/** The 1-based line of `offset`, with line ends counted as VS Code counts them. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let k = 0; k < offset; k++) {
    const c = text.charCodeAt(k);
    if (c === LF || (c === CR && text.charCodeAt(k + 1) !== LF)) line++;
  }
  return line;
}

/**
 * The problem for a script file's string that never closes, `start` to `end` cut at its line
 * end. The game reads a string up to the next quote, across lines, so one missing quote pairs
 * every later quote with the wrong one, and only the file's last string is left open, often
 * hundreds of lines below the fault. So the problem goes on the first string before it that runs
 * over several lines and whose text is not script (vanilla's strings over several lines hold
 * script, `first_effect = "…"`): that is where the quotes start to pair up wrongly. Without one,
 * it stays on the last string. `spanning` holds the strings over several lines, start and end.
 */
function unclosedScriptString(
  text: string,
  start: number,
  end: number,
  spanning: readonly number[],
): SyntaxDiagnostic {
  for (let k = 0; k < spanning.length; k += 2) {
    const from = spanning[k] ?? 0;
    const to = spanning[k + 1] ?? 0;
    if (parseScript(text.slice(from + 1, to - 1), { script: true }).diagnostics.length === 0) {
      continue;
    }
    let lineEnd = from + 1;
    while (lineEnd < to && text.charCodeAt(lineEnd) !== LF && text.charCodeAt(lineEnd) !== CR) {
      lineEnd++;
    }
    return diagnostic(
      'unterminated-string',
      from,
      lineEnd,
      'A quote is probably missing here: this string runs over several lines to the next quote, ' +
        'as the game reads it, and what it holds is not script. From here on the quotes pair up ' +
        `wrongly, and the file's last string, on line ${String(lineAt(text, start))}, never closes.`,
    );
  }
  return diagnostic(
    'unterminated-string',
    start,
    end,
    'This string is never closed; it ends at its line end.',
  );
}

function tokenize(
  text: string,
  diagnostics: SyntaxDiagnostic[],
  save: boolean,
  script: boolean,
): Tokens {
  const n = text.length;
  // Vanilla interface files average about one token per 7 characters.
  const tokens = new Tokens(Math.max(16, n >> 3));
  /** A script file's closed strings that run over several lines: start and end, in pairs. */
  const spanning: number[] = [];
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
    } else if (c === QUOTE && save) {
      // A save escapes `"` and `\` in a string, and a typed name may break the line (etch#154).
      let j = i + 1;
      for (; j < n; j++) {
        const d = text.charCodeAt(j);
        if (d === QUOTE) break;
        if (d === BACKSLASH) j++;
      }
      if (j < n) {
        tokens.push(STRING, i, j + 1);
        i = j + 1;
      } else {
        diagnostics.push(diagnostic('unterminated-string', i, n, 'This string is never closed.'));
        tokens.push(STRING, i, n);
        i = n;
      }
    } else if (c === QUOTE) {
      // No escapes: vanilla writes paths as "gfx\interface\x.dds" and "gfx\\interface\\x.dds",
      // and no interface file has \". No interface string spans lines, so one that does not close
      // on its line is cut at the line end and the rest of the file still parses. A script file's
      // string runs to the next quote (`ParseOptions.script`).
      let j = i + 1;
      let spans = false;
      for (; j < n; j++) {
        const d = text.charCodeAt(j);
        if (d === QUOTE) break;
        if (d === LF || d === CR) {
          if (!script) break;
          spans = true;
        }
      }
      if (script && j >= n) {
        // Never closed: cut at the line end, as an interface file's string is.
        for (j = i + 1; j < n; j++) {
          const d = text.charCodeAt(j);
          if (d === LF || d === CR) break;
        }
        diagnostics.push(unclosedScriptString(text, i, j, spanning));
        tokens.push(STRING, i, j);
        i = j;
      } else if (j < n && text.charCodeAt(j) === QUOTE) {
        if (spans) spanning.push(i, j + 1);
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
export function parseScript(text: string, options: ParseOptions = {}): ParsedScript {
  const save = options.save === true;
  const diagnostics: SyntaxDiagnostic[] = [];
  const tokens = tokenize(text, diagnostics, save, options.script === true);
  const { count, kinds, starts, ends } = tokens;

  const scalar = (t: number): ScalarNode => {
    const start = starts[t] ?? 0;
    const end = ends[t] ?? 0;
    if (kinds[t] === WORD) {
      return { kind: 'scalar', text: text.slice(start, end), quoted: false, start, end };
    }
    const closed = end - start >= 2 && text.charCodeAt(end - 1) === QUOTE;
    const inner = text.slice(start + 1, closed ? end - 1 : end);
    return {
      kind: 'scalar',
      text: save && inner.includes('\\') ? inner.replace(/\\(["\\])/g, '$1') : inner,
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
      const next = t + 1 < count ? kinds[t + 1] : undefined;
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
