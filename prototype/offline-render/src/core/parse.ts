// PROTOTYPE (etch#9): tolerant Clausewitz-script parser. Throwaway.
// Keeps file order, duplicate keys and source offsets; never throws on broken braces.

export interface Node {
  key: string;          // as written
  lkey: string;         // lower-cased
  value: string | Node[];
  start: number;        // offset of the key
  end: number;          // offset after the value
}

const enum T { Word, Str, Eq, Open, Close, Op }

interface Tok { t: T; s: string; at: number; end: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c <= 32) { i++; continue; }
    if (c === 35 /* # */) { while (i < n && src.charCodeAt(i) !== 10) i++; continue; }
    if (c === 123) { out.push({ t: T.Open, s: '{', at: i, end: i + 1 }); i++; continue; }
    if (c === 125) { out.push({ t: T.Close, s: '}', at: i, end: i + 1 }); i++; continue; }
    if (c === 61) { out.push({ t: T.Eq, s: '=', at: i, end: i + 1 }); i++; continue; }
    if (c === 60 || c === 62) { // < > <= >=
      const at = i; i++; if (src.charCodeAt(i) === 61) i++;
      out.push({ t: T.Op, s: src.slice(at, i), at, end: i }); continue;
    }
    if (c === 34) {
      const at = i; i++;
      let j = i;
      while (j < n && src.charCodeAt(j) !== 34 && src.charCodeAt(j) !== 10) j++;
      out.push({ t: T.Str, s: src.slice(i, j), at, end: j + 1 });
      i = j + 1; continue;
    }
    const at = i;
    while (i < n) {
      const d = src.charCodeAt(i);
      if (d <= 32 || d === 123 || d === 125 || d === 61 || d === 35 || d === 34 || d === 60 || d === 62) break;
      i++;
    }
    out.push({ t: T.Word, s: src.slice(at, i), at, end: i });
  }
  return out;
}

export function parse(src: string): Node[] {
  const toks = tokenize(src);
  let p = 0;
  function block(depth: number): Node[] {
    const items: Node[] = [];
    while (p < toks.length) {
      const k = toks[p];
      if (k.t === T.Close) { if (depth > 0) { p++; return items; } p++; continue; } // stray } at top: skip
      if (k.t === T.Open) { // anonymous block
        p++; const v = block(depth + 1);
        items.push({ key: '', lkey: '', value: v, start: k.at, end: toks[p - 1]?.end ?? k.end });
        continue;
      }
      if (k.t === T.Eq || k.t === T.Op) { p++; continue; }
      const nx = toks[p + 1];
      if (nx && (nx.t === T.Eq || nx.t === T.Op)) {
        p += 2;
        const v = toks[p];
        if (!v) break;
        if (v.t === T.Open) {
          p++; const kids = block(depth + 1);
          items.push({ key: k.s, lkey: k.s.toLowerCase(), value: kids, start: k.at, end: toks[p - 1]?.end ?? v.end });
        } else if (v.t === T.Word || v.t === T.Str) {
          p++;
          items.push({ key: k.s, lkey: k.s.toLowerCase(), value: v.s, start: k.at, end: v.end });
        } else {
          // `key = }`: treat as empty
          items.push({ key: k.s, lkey: k.s.toLowerCase(), value: '', start: k.at, end: v.at });
        }
      } else {
        // bare value inside a list (e.g. `{ 1 2 3 }`)
        p++;
        items.push({ key: '', lkey: '', value: k.s, start: k.at, end: k.end });
      }
    }
    return items;
  }
  return block(0);
}

export function get(n: Node[], lkey: string): Node | undefined {
  for (let i = n.length - 1; i >= 0; i--) if (n[i].lkey === lkey) return n[i]; // last wins
  return undefined;
}
export function str(n: Node[], lkey: string): string | undefined {
  const v = get(n, lkey)?.value; return typeof v === 'string' ? v : undefined;
}
export function kids(n: Node[], lkey: string): Node[] | undefined {
  const v = get(n, lkey)?.value; return Array.isArray(v) ? v : undefined;
}
export function num(n: Node[], lkey: string, d = 0): number {
  const s = str(n, lkey); if (s === undefined) return d; const f = parseFloat(s); return Number.isFinite(f) ? f : d;
}
export function xy(n: Node[] | undefined, a = 'x', b = 'y'): { x: number; y: number } | undefined {
  if (!n) return undefined;
  const x = str(n, a) ?? str(n, 'width'); const y = str(n, b) ?? str(n, 'height');
  return { x: parseFloat(x ?? '0') || 0, y: parseFloat(y ?? '0') || 0 };
}
