// PROTOTYPE (etch#159), throwaway: a just-enough reader of a plain-text (zipped) EU4 save for the
// data picker: the player, the countries and each province's few fields the preview fills. Read
// only. The real reader is etch#154's byte-pass index; this one uses regular expressions.
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

export interface SaveProvince {
  readonly id: number;
  readonly name: string;
  readonly owner?: string;
  readonly fields: Readonly<Record<string, string>>;
}

export interface SaveIndex {
  readonly file: string;
  readonly date: string;
  readonly player: string;
  readonly mods: readonly string[];
  readonly countries: readonly string[];
  readonly provinces: readonly SaveProvince[];
}

const FIELDS = [
  'capital',
  'culture',
  'religion',
  'base_tax',
  'base_production',
  'base_manpower',
  'trade_goods',
  'local_autonomy',
  'controller',
  'garrison',
  'center_of_trade',
];

export async function readSave(path: string): Promise<SaveIndex> {
  const bytes = await readFile(path);
  const entries = unzip(bytes);
  const gamestate = entries.get('gamestate');
  const meta = entries.get('meta');
  if (gamestate === undefined || meta === undefined) throw new Error('not a zipped text save');
  // A binary (ironman) save starts `EU4bin`: refused, as the map decided (etch#154).
  if (gamestate.startsWith('EU4bin')) throw new Error('binary (ironman) saves are not read');
  const player = /\bplayer="([^"]+)"/.exec(meta)?.[1] ?? '';
  const date = /\bdate=([\d.]+)/.exec(meta)?.[1] ?? '';
  const mods = [...(/mods_enabled_names=\{([\s\S]*?)\n\}/.exec(meta)?.[1] ?? '').matchAll(/name="([^"]+)"/g)]
    .map((m) => m[1]!)
    .filter((n) => !n.startsWith('mod/'));
  const provinces: SaveProvince[] = [];
  const start = gamestate.indexOf('\nprovinces={\n');
  const end = gamestate.indexOf('\ncountries={', start);
  const block = gamestate.slice(start, end < 0 ? undefined : end);
  for (const m of block.matchAll(/\n-(\d+)=\{([\s\S]*?)(?=\n-\d+=\{|\n\}\n|$)/g)) {
    const body = m[2]!;
    const top = body.split('\n').filter((l) => /^\t\t[a-z_]+=/.test(l));
    const value = (key: string) => {
      const line = top.find((l) => l.startsWith(`\t\t${key}=`));
      return line?.slice(key.length + 3).replace(/^"|"$/g, '');
    };
    const name = value('name');
    if (name === undefined) continue;
    const fields: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = value(f);
      if (v !== undefined) fields[f] = v;
    }
    if (/\n\t\tgreat_projects=\{/.test(body)) fields.great_projects = 'yes';
    const owner = value('owner');
    provinces.push({ id: Number(m[1]), name, ...(owner === undefined ? {} : { owner }), fields });
  }
  const countries = [...new Set(provinces.flatMap((p) => (p.owner ? [p.owner] : [])))].sort();
  return { file: path, date, player, mods, countries, provinces };
}

/** The entries of a zip file, inflated and decoded as Windows-1252 (Latin-1 is close enough here). */
function unzip(b: Buffer): Map<string, string> {
  let e = b.length - 22;
  while (e > 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
  const count = b.readUInt16LE(e + 10);
  let c = b.readUInt32LE(e + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const method = b.readUInt16LE(c + 10);
    const size = b.readUInt32LE(c + 20);
    const nameLength = b.readUInt16LE(c + 28);
    const extra = b.readUInt16LE(c + 30);
    const comment = b.readUInt16LE(c + 32);
    const local = b.readUInt32LE(c + 42);
    const name = b.toString('latin1', c + 46, c + 46 + nameLength);
    const dataStart = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const data = b.subarray(dataStart, dataStart + size);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString('latin1'));
    c += 46 + nameLength + extra + comment;
  }
  return out;
}
