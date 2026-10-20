/**
 * The fields of a `.mod` descriptor that Etch uses. The launcher writes descriptors in UTF-8;
 * `path` is absolute or relative to the profile folder.
 */
export interface ModDescriptor {
  name?: string;
  path?: string;
  archive?: string;
  version?: string;
  supportedVersion?: string;
  remoteFileId?: string;
  /** Names of the mods this one is loaded after, in the order listed. */
  dependencies: string[];
  /** Folders, relative to the game folder, whose files from the game and earlier mods are hidden. */
  replacePaths: string[];
}

/**
 * Parses a `.mod` descriptor: `key = "value"`, `key = value` and `key = { "a" "b" }` with `#`
 * comments. Backslashes are literal, as in the game's script. Unknown keys are ignored, and a
 * malformed descriptor yields what could be read.
 */
export function parseModDescriptor(text: string): ModDescriptor {
  const descriptor: ModDescriptor = { dependencies: [], replacePaths: [] };
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i];
    if (key === undefined || isSymbol(key) || !isSymbol(tokens[i + 1], '=')) continue;
    const value = tokens[i + 2];
    if (value === undefined) break;
    i += 2;
    if (isSymbol(value, '{')) {
      const items: string[] = [];
      for (
        let item = tokens[i + 1];
        item !== undefined && !isSymbol(item, '}');
        item = tokens[i + 1]
      ) {
        if (!isSymbol(item)) items.push(item.text);
        i++;
      }
      i++;
      if (key.text === 'dependencies') descriptor.dependencies.push(...items);
      continue;
    }
    if (isSymbol(value)) continue;
    const text = value.text;
    switch (key.text) {
      case 'name':
        descriptor.name = text;
        break;
      case 'path':
        descriptor.path = text;
        break;
      case 'archive':
        descriptor.archive = text;
        break;
      case 'version':
        descriptor.version = text;
        break;
      case 'supported_version':
        descriptor.supportedVersion = text;
        break;
      case 'remote_file_id':
        descriptor.remoteFileId = text;
        break;
      case 'replace_path':
        descriptor.replacePaths.push(text);
        break;
    }
  }
  return descriptor;
}

/** Decodes a descriptor's bytes: UTF-8 with or without BOM, else Windows-1252 as a fallback. */
export function decodeDescriptor(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** A word or quoted string (`symbol` false), or one of `=`, `{` and `}` (`symbol` true). */
interface Token {
  text: string;
  symbol: boolean;
}

function isSymbol(token: Token | undefined, text?: string): boolean {
  return token !== undefined && token.symbol && (text === undefined || token.text === text);
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    const c = text[i] ?? '';
    if (/\s/.test(c)) {
      i++;
    } else if (c === '#') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '=' || c === '{' || c === '}') {
      tokens.push({ text: c, symbol: true });
      i++;
    } else if (c === '"') {
      const end = text.indexOf('"', i + 1);
      const stop = end === -1 ? text.length : end;
      tokens.push({ text: text.slice(i + 1, stop), symbol: false });
      i = stop + 1;
    } else {
      const start = i;
      while (i < text.length && !/[\s={}"#]/.test(text[i] ?? ' ')) i++;
      tokens.push({ text: text.slice(start, i), symbol: false });
    }
  }
  return tokens;
}
