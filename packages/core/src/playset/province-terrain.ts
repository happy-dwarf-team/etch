import { decodeGameText } from '../game-text.ts';
import { parseScript } from '../script/parse.ts';
import type { BlockNode, EntryNode, ParsedScript } from '../script/tree.ts';
import type { GameFiles } from './game-files.ts';

/** A province's terrain category, as the game picks it when it loads the map. */
export interface ProvinceTerrain {
  /** The category of `map/terrain.txt`'s `categories` (`farmlands`), by province id. */
  readonly category: ReadonlyMap<number, string>;
}

function decode(bytes: Uint8Array): string {
  return decodeGameText(bytes, 'interface').text;
}

/** An uncompressed 8- or 24-bit bitmap's rows as the file stores them (bottom row first). */
interface StoredBitmap {
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  /** Tightly packed rows, `bytes` per pixel, in file order. */
  readonly data: Uint8Array;
}

function readStoredBitmap(file: Uint8Array): StoredBitmap | undefined {
  if (file.length < 54 || file[0] !== 0x42 || file[1] !== 0x4d) return undefined;
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const offset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const height = view.getInt32(22, true);
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (width <= 0 || height <= 0 || compression !== 0 || (bits !== 8 && bits !== 24)) {
    return undefined;
  }
  const bytes = bits / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  if (offset + stride * (height - 1) + width * bytes > file.length) return undefined;
  const data = new Uint8Array(width * height * bytes);
  for (let r = 0; r < height; r++) {
    data.set(
      file.subarray(offset + r * stride, offset + r * stride + width * bytes),
      r * width * bytes,
    );
  }
  return { width, height, bytes, data };
}

function props(entries: readonly EntryNode[]) {
  return entries.flatMap((e) => (e.kind === 'property' && e.value !== undefined ? [e] : []));
}

function scalarOf(body: BlockNode, key: string): string | undefined {
  for (const e of props(body.entries)) {
    if (e.key.text === key && e.value?.kind === 'scalar') return e.value.text;
  }
  return undefined;
}

function numbers(body: BlockNode, key: string): number[] {
  return props(body.entries).flatMap((e) =>
    e.key.text === key && e.value?.kind === 'block'
      ? e.value.entries.flatMap((i) =>
          i.kind === 'scalar' && /^\d+$/.test(i.text) ? [Number(i.text)] : [],
        )
      : [],
  );
}

function sectionOf(tree: ParsedScript, key: string): BlockNode | undefined {
  for (const e of props(tree.entries))
    if (e.key.text === key && e.value?.kind === 'block') return e.value;
  return undefined;
}

const f32 = Math.fround;

/**
 * The provinces' terrain categories, as eu4.exe 1.37.5 sets them when it loads the map
 * (the map's step after reading, `0x87B9E0`, and the map's load, `0x12DB850`); the rule was checked against the
 * categories of every province of a running game's vanilla map.
 *
 * 1. A category's `terrain_override` wins, the first in file order that lists the province.
 * 2. Else the trees paint `map/trees.bmp` into the terrain bitmap
 *    (the map's terrain update from the trees, `0x885D90`): each tree pixel sets every second row
 *    of a box of the map's size over the tree map's, odd rows half a box to the right, to the first
 *    colour of the first terrain whose category the tree's `terrain` names.
 * 3. Then the province's pixels vote (the province's terrain vote, `0xA42F00`): a
 *    land province's land pixels, a sea's or lake's water pixels; a `forest` or `jungle` pixel
 *    counts twice. Above 10000 every count is cut to a hundredth. The highest share wins, the
 *    earlier category on a tie; a province without pixels has the first category.
 */
export async function loadProvinceTerrain(files: GameFiles): Promise<ProvinceTerrain | undefined> {
  const mapFile = await files.find('map/default.map');
  if (mapFile === undefined) return undefined;
  const map = parseScript(decode(await files.readFile(mapFile)), { script: true });
  const name = (key: string, fallback: string): string => {
    for (const e of props(map.entries)) {
      if (e.key.text === key && e.value?.kind === 'scalar' && e.value.text !== '')
        return e.value.text;
    }
    return fallback;
  };
  const water = new Set<number>();
  for (const e of props(map.entries)) {
    if ((e.key.text === 'sea_starts' || e.key.text === 'lakes') && e.value?.kind === 'block') {
      for (const i of e.value.entries)
        if (i.kind === 'scalar' && /^\d+$/.test(i.text)) water.add(Number(i.text));
    }
  }
  const terrainTxt = await files.find(`map/${name('terrain_definition', 'terrain.txt')}`);
  if (terrainTxt === undefined) return undefined;
  const tree = parseScript(decode(await files.readFile(terrainTxt)), { script: true });

  const categories: { name: string; water: boolean; weight: number }[] = [];
  const index = new Map<string, number>();
  const override = new Map<number, number>();
  for (const c of props(sectionOf(tree, 'categories')?.entries ?? [])) {
    if (c.value?.kind !== 'block') continue;
    const type = scalarOf(c.value, 'type');
    const i = categories.length;
    categories.push({
      name: c.key.text,
      water: scalarOf(c.value, 'is_water') === 'yes',
      weight: 1 + (type === 'jungle' ? 1 : 0) + (type === 'forest' ? 1 : 0),
    });
    if (!index.has(c.key.text)) index.set(c.key.text, i);
    for (const id of numbers(c.value, 'terrain_override'))
      if (!override.has(id)) override.set(id, i);
  }
  // Palette index → category, and the first colour of its terrain entry.
  const graphical = new Array<{ category: number; colour: number } | undefined>(256);
  for (const t of props(sectionOf(tree, 'terrain')?.entries ?? [])) {
    if (t.value?.kind !== 'block') continue;
    const category = index.get(scalarOf(t.value, 'type') ?? '');
    const colours = numbers(t.value, 'color');
    if (category === undefined || colours[0] === undefined) continue;
    for (const c of colours)
      if (c < 256 && graphical[c] === undefined) graphical[c] = { category, colour: colours[0] };
  }
  const treeColour = new Array<number | undefined>(256);
  for (const t of props(sectionOf(tree, 'tree')?.entries ?? [])) {
    if (t.value?.kind !== 'block') continue;
    const target = scalarOf(t.value, 'terrain');
    let g: number | undefined;
    for (let i = 0; i < 256 && g === undefined; i++) {
      const entry = graphical[i];
      if (entry !== undefined && categories[entry.category]?.name === target) g = i;
    }
    for (const c of numbers(t.value, 'color'))
      if (c < 256) treeColour[c] = g === undefined ? undefined : graphical[g]?.colour;
  }

  const category = new Map<number, string>();
  for (const [id, i] of override) category.set(id, categories[i]?.name ?? '');
  const [provincesFile, terrainFile, treesFile, definitionFile] = await Promise.all([
    files.find(`map/${name('provinces', 'provinces.bmp')}`),
    files.find(`map/${name('terrain', 'terrain.bmp')}`),
    files.find(`map/${name('tree_definition', 'trees.bmp')}`),
    files.find(`map/${name('definitions', 'definition.csv')}`),
  ]);
  if (provincesFile === undefined || terrainFile === undefined || definitionFile === undefined) {
    return { category };
  }
  const [provinces, terrain, trees, definitions] = await Promise.all([
    files.readFile(provincesFile).then(readStoredBitmap),
    files.readFile(terrainFile).then(readStoredBitmap),
    treesFile === undefined ? undefined : files.readFile(treesFile).then(readStoredBitmap),
    files.readFile(definitionFile).then(decode),
  ]);
  if (provinces?.bytes !== 3 || terrain?.bytes !== 1) return { category };

  const idOf = new Map<number, number>();
  for (const line of definitions.split(/\r?\n/).slice(1)) {
    const m = /^\s*(\d+)\s*;\s*(\d+)\s*;\s*(\d+)\s*;\s*(\d+)/.exec(line);
    if (m === null) continue;
    const key = (Number(m[4]) << 16) | (Number(m[3]) << 8) | Number(m[2]);
    if (!idOf.has(key)) idOf.set(key, Number(m[1]));
  }
  const W = provinces.width;
  const H = provinces.height;
  const prov = new Int32Array(W * H);
  for (let i = 0, p = provinces.data; i < W * H; i++) {
    prov[i] =
      idOf.get(((p[3 * i] ?? 0) << 16) | ((p[3 * i + 1] ?? 0) << 8) | (p[3 * i + 2] ?? 0)) ?? -1;
  }
  const TW = terrain.width;
  const TH = terrain.height;
  const terr = new Uint8Array(terrain.data);

  if (trees?.bytes === 1) {
    const RW = trees.width;
    const RH = trees.height;
    const sx = f32(f32(W) / f32(RW));
    const sy = f32(f32(H) / f32(RH));
    const hx = f32(sx * 0.5);
    const hy = f32(sy * 0.5);
    const wmax = f32(W - 1);
    const hmax = f32(H - 1);
    const clamp = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);
    for (let r = 0; r < RH; r++) {
      const row = RH - r - 1;
      for (let x = 0; x < RW; x++) {
        const v = trees.data[row * RW + x] ?? 0;
        if (v === 0) continue;
        const colour = treeColour[v];
        if (colour === undefined) continue;
        let fx = f32(x * sx);
        const fy = f32(row * sy);
        if (r % 2 === 1) fx = f32(hx + fx);
        const x0 = clamp(f32(fx - hx), wmax);
        const y0 = clamp(f32(fy - hy), hmax);
        const x1 = clamp(f32(fx + hx), wmax);
        const y1 = clamp(f32(fy + hy), hmax);
        for (let xi = Math.trunc(x0); xi < x1; xi++) {
          for (let yi = Math.trunc(y0); yi < y1; yi += 2) {
            if (xi < TW && yi < TH) terr[yi * TW + xi] = colour;
          }
        }
      }
    }
  }

  const tsx = f32(f32(TW) / f32(W));
  const tsy = f32(f32(TH) / f32(H));
  const counts = new Map<number, Int32Array>();
  const totals = new Map<number, number>();
  const n = categories.length;
  for (let y = 0; y < H; y++) {
    const ty = Math.min(Math.max(Math.trunc(f32(y * tsy)), 0), TH - 1);
    for (let x = 0; x < W; x++) {
      const p = prov[y * W + x] ?? -1;
      if (p < 0 || override.has(p)) continue;
      const tx = tsx === 1 ? x : Math.min(Math.max(Math.trunc(f32(x * tsx)), 0), TW - 1);
      const g = graphical[terr[ty * TW + tx] ?? 0];
      if (g === undefined) continue;
      const c = categories[g.category];
      if (c === undefined || c.water !== water.has(p)) continue;
      let cp = counts.get(p);
      if (cp === undefined) counts.set(p, (cp = new Int32Array(n)));
      cp[g.category] = (cp[g.category] ?? 0) + c.weight;
      totals.set(p, (totals.get(p) ?? 0) + 1);
    }
  }
  for (const [p, raw] of counts) {
    let cp = Array.from(raw);
    let total = totals.get(p) ?? 0;
    if (Math.max(...cp) > 10000) {
      cp = cp.map((v) => Math.trunc(v / 100));
      total = Math.trunc(total / 100);
    }
    let best = -1;
    let bestShare = -Infinity;
    cp.forEach((v, i) => {
      if (v <= 0) return;
      const share = total === 0 ? -1 : Math.trunc((v * 100000) / total);
      if (share > bestShare) {
        best = i;
        bestShare = share;
      }
    });
    category.set(p, categories[best >= 0 ? best : 0]?.name ?? '');
  }
  return { category };
}
