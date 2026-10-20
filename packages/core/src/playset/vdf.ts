/** A block of Valve's text KeyValues format, as `libraryfolders.vdf` uses it. */
export interface VdfObject {
  [key: string]: string | VdfObject;
}

/**
 * Parses Valve's text KeyValues format: quoted or bare keys and values, `{}` blocks and `//`
 * comments. Platform conditionals such as `[$WIN32]` are skipped. A later duplicate key wins.
 * Malformed input yields what was read up to the error rather than throwing.
 */
export function parseVdf(text: string): VdfObject {
  const tokens = tokenize(text);
  let index = 0;

  function parseBlock(): VdfObject {
    const block: VdfObject = {};
    while (index < tokens.length) {
      const key = tokens[index++];
      if (key === undefined || key.kind === 'close') return block;
      if (key.kind !== 'string') continue;
      const value = tokens[index];
      if (value === undefined) return block;
      index++;
      if (value.kind === 'open') block[key.text] = parseBlock();
      else if (value.kind === 'string') block[key.text] = value.text;
      else return block;
    }
    return block;
  }

  return parseBlock();
}

type Token = { kind: 'open' } | { kind: 'close' } | { kind: 'string'; text: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    const c = text[i];
    if (c === undefined) break;
    if (/\s/.test(c)) {
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '{') {
      tokens.push({ kind: 'open' });
      i++;
    } else if (c === '}') {
      tokens.push({ kind: 'close' });
      i++;
    } else if (c === '[') {
      // A platform conditional such as [$WIN32]; Etch runs on Windows only.
      while (i < text.length && text[i] !== ']') i++;
      i++;
    } else if (c === '"') {
      let value = '';
      i++;
      while (i < text.length && text[i] !== '"') {
        const ch = text[i];
        if (ch === '\\' && i + 1 < text.length) {
          const next = text[i + 1];
          value += next === 'n' ? '\n' : next === 't' ? '\t' : (next ?? '');
          i += 2;
        } else {
          value += ch ?? '';
          i++;
        }
      }
      i++;
      tokens.push({ kind: 'string', text: value });
    } else {
      const start = i;
      while (i < text.length && !/[\s{}"]/.test(text[i] ?? ' ')) i++;
      tokens.push({ kind: 'string', text: text.slice(start, i) });
    }
  }
  return tokens;
}
