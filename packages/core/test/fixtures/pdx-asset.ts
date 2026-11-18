// Writes Clausewitz asset files (`.mesh`, `.anim`) in either encoding from a list of objects and
// properties, and a small skinned mesh with an animation, for the asset tests. No game content.

/** One item of an asset file, in file order. */
export type Item =
  | { readonly object: string; readonly depth: number }
  | {
      readonly name: string;
      readonly type: 'i' | 'f' | 's';
      readonly values: readonly (number | string)[];
    };

export const obj = (depth: number, object: string): Item => ({ object, depth });
export const ints = (name: string, ...values: number[]): Item => ({ name, type: 'i', values });
export const floats = (name: string, ...values: number[]): Item => ({ name, type: 'f', values });
export const strs = (name: string, ...values: string[]): Item => ({ name, type: 's', values });

export function binary(items: readonly Item[]): Uint8Array {
  const out: number[] = [0x40, 0x40, 0x62, 0x40]; // @@b@
  const u32 = (value: number): void => {
    out.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);
  };
  const text = (value: string): void => {
    for (const c of value) out.push(c.charCodeAt(0));
  };
  for (const item of items) {
    if ('object' in item) {
      for (let i = 0; i < item.depth; i++) out.push(0x5b);
      text(item.object);
      out.push(0);
      continue;
    }
    out.push(0x21, item.name.length);
    text(item.name);
    text(item.type);
    u32(item.values.length);
    for (const value of item.values) {
      if (item.type === 's') {
        u32(String(value).length + 1);
        text(String(value));
        out.push(0);
      } else {
        const view = new DataView(new ArrayBuffer(4));
        if (item.type === 'i') view.setInt32(0, Number(value), true);
        else view.setFloat32(0, Number(value), true);
        out.push(...new Uint8Array(view.buffer));
      }
    }
  }
  return Uint8Array.from(out);
}

export function text(items: readonly Item[]): Uint8Array {
  const lines = ['@@t@'];
  for (const item of items) {
    if ('object' in item) {
      lines.push(`${'['.repeat(item.depth)}${item.object}${']'.repeat(item.depth)}`);
    } else {
      const values = item.values.map((v) => (item.type === 's' ? `"${String(v)}"` : String(v)));
      lines.push(`\t${item.name} ${item.type} ${String(item.values.length)} ${values.join(' ')}`);
    }
  }
  return new TextEncoder().encode(lines.join('\n'));
}

/** A quad skinned to two bones along x, a collision box, and a two-bone skeleton. */
export const MESH: Item[] = [
  ints('pdxasset', 1, 0),
  obj(1, 'object'),
  obj(2, 'flagShape'),
  obj(3, 'mesh'),
  floats('p', 0, 0, 0, 2, 0, 0, 0, 1, 0, 2, 1, 0),
  floats('n', 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1),
  floats('u0', 0, 1, 1, 1, 0, 0, 1, 0),
  ints('tri', 0, 1, 2, 1, 3, 2),
  obj(4, 'material'),
  strs('shader', 'PdxMeshStandardSkinned'),
  strs('diff', 'flag_diffuse.dds'),
  obj(4, 'skin'),
  ints('bones', 1),
  ints('ix', 0, -1, -1, -1, 1, -1, -1, -1, 0, -1, -1, -1, 1, -1, -1, -1),
  floats('w', 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
  obj(3, 'skeleton'),
  obj(4, 'root'),
  ints('ix', 0),
  floats('tx', 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0),
  obj(4, 'tip'),
  ints('ix', 1),
  ints('pa', 0),
  floats('tx', 1, 0, 0, 0, 1, 0, 0, 0, 1, -1, 0, 0),
  obj(2, 'pickShape'),
  obj(3, 'mesh'),
  floats('p', 0, 0, 0, 1, 0, 0, 0, 1, 0),
  ints('tri', 0, 1, 2),
  obj(4, 'material'),
  strs('shader', 'Collision'),
];

/** Two joints; the tip turns from 0 to 90 degrees about Z over two frames. */
export const half = Math.SQRT1_2;
export const ANIM: Item[] = [
  ints('pdxasset', 1, 0),
  obj(1, 'info'),
  floats('fps', 15),
  ints('sa', 2),
  ints('j', 2),
  obj(2, 'root'),
  strs('sa', ''),
  floats('t', 0, 0, 0),
  floats('q', 0, 0, 0, 1),
  floats('s', 1),
  obj(2, 'tip'),
  strs('sa', 'q'),
  floats('t', 1, 0, 0),
  floats('q', 0, 0, 0, 1),
  floats('s', 1),
  obj(1, 'samples'),
  floats('q', 0, 0, 0, 1, 0, 0, half, half),
];
