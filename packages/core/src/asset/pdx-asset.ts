// The Clausewitz asset container of `.mesh` and `.anim` files: a tree of named objects holding
// typed arrays. Two encodings carry the same tree:
//
// - binary, magic `@@b@`: `!` starts a property (a name length byte, the name, a type byte `i`,
//   `f` or `s`, a u32 count, then the values: little-endian i32 or f32, or strings as a u32 length
//   and bytes ending in NUL); one or more `[` open an object at that depth, its name ending in NUL;
// - text, magic `@@t@`: the same, as whitespace-separated tokens (`name type count values…`,
//   strings quoted) and `[[name]]` lines whose bracket count is the depth.
//
// Both were checked against every `.mesh` and `.anim` file of EU4 1.37.5 (458 + 18 meshes,
// 149 + 3 animations, binary + text).

/** A property's values: integers, floats or strings. */
export type PdxValue =
  | { readonly type: 'i'; readonly values: Int32Array }
  | { readonly type: 'f'; readonly values: Float32Array }
  | { readonly type: 's'; readonly values: readonly string[] };

/** An object of the tree; the root has the empty name. */
export interface PdxNode {
  readonly name: string;
  readonly properties: Map<string, PdxValue>;
  readonly children: PdxNode[];
}

export class PdxAssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdxAssetError';
  }
}

/** Reads an asset file in either encoding. */
export function readPdxAsset(bytes: Uint8Array): PdxNode {
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic === '@@b@') return readBinary(bytes);
  if (magic === '@@t@') return readText(latin1(bytes.subarray(4)));
  throw new PdxAssetError('not a Clausewitz asset file (no @@b@ or @@t@ magic)');
}

function node(name: string): PdxNode {
  return { name, properties: new Map(), children: [] };
}

/** Adds an object at a depth (1 is a child of the root) and makes it the deepest open one. */
function open(stack: PdxNode[], depth: number, name: string): void {
  if (depth > stack.length) {
    throw new PdxAssetError(`object "${name}" at depth ${String(depth)} has no parent`);
  }
  stack.length = depth;
  const child = node(name);
  stack[depth - 1]?.children.push(child);
  stack.push(child);
}

function latin1(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return text;
}

function readBinary(bytes: Uint8Array): PdxNode {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const root = node('');
  const stack: PdxNode[] = [root];
  let at = 4;
  const need = (count: number, what: string): void => {
    if (at + count > bytes.length) {
      throw new PdxAssetError(`the file ends inside ${what} at byte ${String(at)}`);
    }
  };
  while (at < bytes.length) {
    const marker = bytes[at];
    if (marker === 0x21 /* ! */) {
      need(2, 'a property');
      const nameLength = bytes[at + 1] ?? 0;
      need(2 + nameLength + 5, 'a property');
      const name = latin1(bytes.subarray(at + 2, at + 2 + nameLength));
      at += 2 + nameLength;
      const type = String.fromCharCode(bytes[at] ?? 0);
      const count = view.getUint32(at + 1, true);
      at += 5;
      const current = stack[stack.length - 1] ?? root;
      if (type === 'i' || type === 'f') {
        need(4 * count, `property "${name}"`);
        const values = type === 'i' ? new Int32Array(count) : new Float32Array(count);
        for (let i = 0; i < count; i++) {
          values[i] =
            type === 'i' ? view.getInt32(at + 4 * i, true) : view.getFloat32(at + 4 * i, true);
        }
        at += 4 * count;
        current.properties.set(
          name,
          type === 'i'
            ? { type, values: values as Int32Array }
            : { type, values: values as Float32Array },
        );
      } else if (type === 's') {
        const values: string[] = [];
        for (let i = 0; i < count; i++) {
          need(4, `property "${name}"`);
          const length = view.getUint32(at, true);
          need(4 + length, `property "${name}"`);
          let end = at + 4 + length;
          while (end > at + 4 && bytes[end - 1] === 0) end--;
          values.push(latin1(bytes.subarray(at + 4, end)));
          at += 4 + length;
        }
        current.properties.set(name, { type, values });
      } else {
        throw new PdxAssetError(`property "${name}" has an unknown type "${type}"`);
      }
    } else if (marker === 0x5b /* [ */) {
      let depth = 0;
      while (bytes[at] === 0x5b) {
        depth++;
        at++;
      }
      const end = bytes.indexOf(0, at);
      if (end < 0) throw new PdxAssetError(`an object name at byte ${String(at)} has no end`);
      open(stack, depth, latin1(bytes.subarray(at, end)));
      at = end + 1;
    } else {
      throw new PdxAssetError(`unexpected byte 0x${(marker ?? 0).toString(16)} at ${String(at)}`);
    }
  }
  return root;
}

function readText(text: string): PdxNode {
  const root = node('');
  const stack: PdxNode[] = [root];
  const tokens = /"([^"]*)"|(\S+)/g;
  const next = (): { text: string; quoted: boolean } | undefined => {
    const match = tokens.exec(text);
    if (match === null) return undefined;
    return match[1] !== undefined
      ? { text: match[1], quoted: true }
      : { text: match[2] ?? '', quoted: false };
  };
  for (let token = next(); token !== undefined; token = next()) {
    if (!token.quoted && token.text.startsWith('[')) {
      const depth = /^\[+/.exec(token.text)?.[0].length ?? 0;
      // A name may hold spaces: read up to the closing brackets on the same line.
      let name = token.text.slice(depth);
      while (!name.endsWith(']')) {
        const more = next();
        if (more === undefined) throw new PdxAssetError(`object "${name}" has no closing ]`);
        name += ` ${more.text}`;
      }
      open(stack, depth, name.replace(/\]+$/, ''));
      continue;
    }
    const name = token.text;
    const type = next()?.text;
    const count = Number(next()?.text);
    if ((type !== 'i' && type !== 'f' && type !== 's') || !Number.isInteger(count) || count < 0) {
      throw new PdxAssetError(`property "${name}" has no type and count`);
    }
    const current = stack[stack.length - 1] ?? root;
    if (type === 's') {
      const values: string[] = [];
      for (let i = 0; i < count; i++) values.push(next()?.text ?? '');
      current.properties.set(name, { type, values });
      continue;
    }
    const values = type === 'i' ? new Int32Array(count) : new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const value = Number(next()?.text);
      if (Number.isNaN(value)) throw new PdxAssetError(`property "${name}" has a bad number`);
      values[i] = value;
    }
    current.properties.set(
      name,
      type === 'i'
        ? { type, values: values as Int32Array }
        : { type, values: values as Float32Array },
    );
  }
  return root;
}

/** The first child of that name. */
export function childOf(parent: PdxNode, name: string): PdxNode | undefined {
  return parent.children.find((child) => child.name === name);
}

export function floats(of: PdxNode, name: string): Float32Array | undefined {
  const value = of.properties.get(name);
  return value?.type === 'f' ? value.values : undefined;
}

export function ints(of: PdxNode, name: string): Int32Array | undefined {
  const value = of.properties.get(name);
  return value?.type === 'i' ? value.values : undefined;
}

export function strings(of: PdxNode, name: string): readonly string[] | undefined {
  const value = of.properties.get(name);
  return value?.type === 's' ? value.values : undefined;
}
