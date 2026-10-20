// PROTOTYPE (etch#9): sprite index, bitmap fonts, texture headers, localisation. Throwaway.
import * as fs from 'node:fs';
import { Files } from './files';
import { Node, parse, str, num, kids, xy } from './parse';

export interface Sprite {
  name: string; kind: string; texture?: string; frames: number; effect?: string;
  border?: { x: number; y: number }; size?: { x: number; y: number }; file: string;
}
export interface FontDef { name: string; path: string; color: number; textcolors: Record<string, [number, number, number]> }
export interface Glyph { x: number; y: number; w: number; h: number; xo: number; yo: number; adv: number }
export interface Font { def: FontDef; lineHeight: number; base: number; scaleW: number; scaleH: number; glyphs: Map<number, Glyph>; kern: Map<number, number>; texture?: string }

export class Gfx {
  sprites = new Map<string, Sprite>();
  fontDefs = new Map<string, FontDef>();
  globalColors: Record<string, [number, number, number]> = {};
  fonts = new Map<string, Font>();
  dupSprites = 0;
  private dims = new Map<string, { w: number; h: number; fmt: string } | null>();

  constructor(readonly files: Files) {
    for (const f of files.list('interface/', '.gfx')) this.addFile(f, parse(files.text(f)));
  }

  private addFile(file: string, top: Node[]) {
    for (const b of top) {
      if (!Array.isArray(b.value)) continue;
      if (b.lkey === 'spritetypes') {
        for (const s of b.value) {
          if (!Array.isArray(s.value)) continue;
          const v = s.value; const name = str(v, 'name'); if (!name) continue;
          if (this.sprites.has(name)) { this.dupSprites++; continue; } // hypothesis: first definition wins
          this.sprites.set(name, {
            name, kind: s.lkey, file,
            texture: str(v, 'texturefile') ?? str(v, 'texturefile1'),
            frames: Math.max(1, num(v, 'noofframes', 1)),
            effect: str(v, 'effectfile'),
            border: xy(kids(v, 'bordersize')), size: xy(kids(v, 'size')),
          });
        }
      } else if (b.lkey === 'bitmapfonts') {
        for (const f of b.value) {
          if (f.lkey === 'textcolors' && Array.isArray(f.value)) Object.assign(this.globalColors, colors(f.value));
          if (f.lkey !== 'bitmapfont' || !Array.isArray(f.value)) continue;
          const name = str(f.value, 'name'); const p = str(f.value, 'path'); if (!name || !p) continue;
          const tc = kids(f.value, 'textcolors');
          this.fontDefs.set(name, { name, path: p, color: parseInt(str(f.value, 'color') ?? '0xffffffff'), textcolors: tc ? colors(tc) : {} });
        }
      }
    }
  }

  /** Width/height from the DDS or TGA header only (the host never decodes pixels). */
  textureDims(rel: string): { w: number; h: number; fmt: string; abs: string } | undefined {
    const abs = this.textureFile(rel); if (!abs) return undefined;
    let d = this.dims.get(abs);
    if (d === undefined) {
      const fd = fs.openSync(abs, 'r'); const b = Buffer.alloc(128); fs.readSync(fd, b, 0, 128, 0); fs.closeSync(fd);
      if (b.toString('latin1', 0, 4) === 'DDS ') {
        const four = b.toString('latin1', 84, 88);
        d = { h: b.readUInt32LE(12), w: b.readUInt32LE(16), fmt: (b.readUInt32LE(80) & 4) ? four : `rgb${b.readUInt32LE(88)}` };
      } else d = { w: b.readUInt16LE(12), h: b.readUInt16LE(14), fmt: `tga${b[2]}/${b[16]}` };
      this.dims.set(abs, d);
    }
    return d ? { ...d, abs } : undefined;
  }

  textureFile(rel: string): string | undefined {
    const r = rel.replace(/\.lua$/, '');
    const hit = this.files.resolve(r);
    if (hit) return hit;
    const alt = r.replace(/\.(dds|tga)$/i, m => m.toLowerCase() === '.dds' ? '.tga' : '.dds'); // hypothesis: game falls back to the other extension
    return this.files.resolve(alt);
  }

  font(name: string): Font | undefined {
    let f = this.fonts.get(name); if (f) return f;
    const def = this.fontDefs.get(name); if (!def) return undefined;
    const fnt = this.files.resolve(def.path + '.fnt'); if (!fnt) return undefined;
    f = parseFnt(this.files.text(fnt), def);
    f.texture = this.textureFile(def.path + '.dds') ? def.path + '.dds' : def.path + '.tga'; // page line ignored, as the game does
    this.fonts.set(name, f); return f;
  }
}

function colors(n: Node[]): Record<string, [number, number, number]> {
  const o: Record<string, [number, number, number]> = {};
  for (const c of n) if (Array.isArray(c.value)) { const v = c.value.map(x => +x.value); o[c.key] = [v[0], v[1], v[2]]; }
  return o;
}

export function parseFnt(src: string, def: FontDef): Font {
  const f: Font = { def, lineHeight: 0, base: 0, scaleW: 0, scaleH: 0, glyphs: new Map(), kern: new Map() };
  for (const line of src.split(/\r?\n/)) {
    const sp = line.indexOf(' '); const tag = sp < 0 ? line : line.slice(0, sp);
    if (tag !== 'char' && tag !== 'common' && tag !== 'kerning') continue;
    const a: Record<string, number> = {};
    for (const m of line.matchAll(/(\w+)=(-?\d+)/g)) a[m[1]] = +m[2];
    if (tag === 'common') { f.lineHeight = a.lineHeight; f.base = a.base; f.scaleW = a.scaleW; f.scaleH = a.scaleH; }
    else if (tag === 'char') f.glyphs.set(a.id, { x: a.x, y: a.y, w: a.width, h: a.height, xo: a.xoffset, yo: a.yoffset, adv: a.xadvance });
    else f.kern.set(a.first * 256 + a.second, a.amount);
  }
  return f;
}

/** English localisation: KEY:0 "text". Later files win (hypothesis; `replace/` folders load last). */
export function loadLocalisation(files: Files): Map<string, string> {
  const m = new Map<string, string>();
  const list = files.list('localisation/', '_l_english.yml');
  list.sort((a, b) => (+/[\\/]replace[\\/]/i.test(a)) - (+/[\\/]replace[\\/]/i.test(b)));
  const re = /^\s*([^#\s:]+):\d*\s*"(.*)"/gm;
  for (const f of list) {
    const s = fs.readFileSync(f, 'utf8');
    for (const x of s.matchAll(re)) m.set(x[1], x[2]);
  }
  return m;
}
