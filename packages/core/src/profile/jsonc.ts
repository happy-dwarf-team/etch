/**
 * A JSON-with-comments reader for window profiles (ADR 0006) that keeps the source range of every
 * value and key, so that a load check can point at the line of a faulty entry. It accepts what VS
 * Code's `jsonc` language accepts: `//` and `/* *\/` comments and trailing commas. It stops at the
 * first syntax error.
 */
import type { SourceRange } from '../script/tree.ts';

export type JsonNode =
  | (SourceRange & { readonly kind: 'object'; readonly members: readonly JsonMember[] })
  | (SourceRange & { readonly kind: 'array'; readonly items: readonly JsonNode[] })
  | (SourceRange & { readonly kind: 'string'; readonly value: string })
  | (SourceRange & { readonly kind: 'number'; readonly value: number })
  | (SourceRange & { readonly kind: 'boolean'; readonly value: boolean })
  | (SourceRange & { readonly kind: 'null' });

export interface JsonMember extends SourceRange {
  readonly key: string;
  /** The key's range, quotes included. */
  readonly keyRange: SourceRange;
  readonly value: JsonNode;
}

export interface JsoncResult {
  /** `undefined` when the text has a syntax error. */
  readonly root: JsonNode | undefined;
  readonly error?: SourceRange & { readonly message: string };
}

class JsoncError extends Error {
  readonly start: number;
  readonly end: number;
  constructor(message: string, start: number, end: number) {
    super(message);
    this.start = start;
    this.end = end;
  }
}

/** Reads a JSONC text. A byte order mark is skipped. */
export function parseJsonc(text: string): JsoncResult {
  const reader = new Reader(text);
  try {
    reader.skip();
    const root = reader.value();
    reader.skip();
    if (reader.at < text.length) reader.fail('Expected the end of the file');
    return { root };
  } catch (error) {
    if (!(error instanceof JsoncError)) throw error;
    return {
      root: undefined,
      error: { message: error.message, start: error.start, end: error.end },
    };
  }
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

class Reader {
  readonly text: string;
  at: number;

  constructor(text: string) {
    this.text = text;
    this.at = text.startsWith('﻿') ? 1 : 0;
  }

  fail(message: string, start = this.at, end = Math.min(this.text.length, start + 1)): never {
    throw new JsoncError(message, start, end);
  }

  /** Skips white space and comments. */
  skip(): void {
    const text = this.text;
    for (;;) {
      const c = text[this.at];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        this.at++;
      } else if (c === '/' && text[this.at + 1] === '/') {
        const end = text.indexOf('\n', this.at);
        this.at = end < 0 ? text.length : end + 1;
      } else if (c === '/' && text[this.at + 1] === '*') {
        const end = text.indexOf('*/', this.at + 2);
        if (end < 0) this.fail('Unterminated comment', this.at, this.at + 2);
        this.at = end + 2;
      } else {
        return;
      }
    }
  }

  value(): JsonNode {
    const start = this.at;
    const c = this.text[start];
    switch (c) {
      case '{':
        return this.object();
      case '[':
        return this.array();
      case '"':
        return { kind: 'string', ...this.string() };
      case undefined:
        return this.fail('Expected a value, not the end of the file');
    }
    for (const [word, node] of [
      ['true', { kind: 'boolean', value: true }],
      ['false', { kind: 'boolean', value: false }],
      ['null', { kind: 'null' }],
    ] as const) {
      if (this.text.startsWith(word, start)) {
        this.at += word.length;
        return { ...node, start, end: this.at };
      }
    }
    NUMBER.lastIndex = start;
    const number = NUMBER.exec(this.text);
    if (number === null) this.fail('Expected a value');
    this.at += number[0].length;
    return { kind: 'number', value: Number(number[0]), start, end: this.at };
  }

  private object(): JsonNode {
    const start = this.at++;
    const members: JsonMember[] = [];
    for (;;) {
      this.skip();
      if (this.text[this.at] === '}') break;
      if (this.text[this.at] !== '"') this.fail('Expected a property name in double quotes');
      const key = this.string();
      this.skip();
      if (this.text[this.at] !== ':') this.fail('Expected a colon after the property name');
      this.at++;
      this.skip();
      const value = this.value();
      members.push({
        key: key.value,
        keyRange: { start: key.start, end: key.end },
        value,
        start: key.start,
        end: value.end,
      });
      this.skip();
      if (this.text[this.at] === ',') {
        this.at++;
        continue;
      }
      if (this.text[this.at] !== '}') this.fail('Expected a comma or a closing brace');
      break;
    }
    this.at++;
    return { kind: 'object', members, start, end: this.at };
  }

  private array(): JsonNode {
    const start = this.at++;
    const items: JsonNode[] = [];
    for (;;) {
      this.skip();
      if (this.text[this.at] === ']') break;
      items.push(this.value());
      this.skip();
      if (this.text[this.at] === ',') {
        this.at++;
        continue;
      }
      if (this.text[this.at] !== ']') this.fail('Expected a comma or a closing bracket');
      break;
    }
    this.at++;
    return { kind: 'array', items, start, end: this.at };
  }

  private string(): { value: string; start: number; end: number } {
    const start = this.at++;
    let value = '';
    for (;;) {
      const c = this.text[this.at];
      if (c === undefined || c === '\n') this.fail('Unterminated string', start, this.at);
      this.at++;
      if (c === '"') break;
      if (c !== '\\') {
        value += c;
        continue;
      }
      const escape = this.text[this.at++] ?? '';
      if (escape === 'u') {
        const hex = this.text.slice(this.at, this.at + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail('Expected four hex digits', this.at - 2);
        value += String.fromCharCode(parseInt(hex, 16));
        this.at += 4;
      } else {
        const known = ESCAPES[escape];
        if (known === undefined) this.fail(`Unknown escape \\${escape}`, this.at - 2, this.at);
        value += known;
      }
    }
    return { value, start, end: this.at };
  }
}
