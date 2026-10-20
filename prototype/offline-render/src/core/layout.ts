// PROTOTYPE (etch#9): layout of one .gui window into a draw list. Throwaway.
// Rules marked H are hypotheses the comparison with the game is meant to test.
import { Gfx, Font } from './gfx';
import { Node, str, num, kids, xy, get } from './parse';

export interface Rect { x: number; y: number; w: number; h: number }
export interface DrawSprite { k: 's'; tex: number; x: number; y: number; w: number; h: number; u0: number; v0: number; u1: number; v1: number; shader: string; filter: 'point' | 'linear'; widget: number }
export interface DrawText { k: 't'; tex: number; q: number[]; color: [number, number, number, number]; widget: number } // q: x y w h u0 v0 u1 v1 per glyph
export type Draw = DrawSprite | DrawText;
export interface WidgetOut { path: string; kind: string; rect: Rect; start: number; end: number; note?: string }
export interface Texture { rel: string; abs: string; w: number; h: number; fmt: string }
export interface DrawList { screen: { w: number; h: number }; textures: Texture[]; draws: Draw[]; widgets: WidgetOut[]; diags: string[] }

export interface SampleData { text?: Record<string, string>; hidden?: string[] }
export interface Options { screen: { w: number; h: number }; loc: Map<string, string>; sample?: SampleData; inheritOrientation?: boolean; only?: string }

const CP1252: Record<number, number> = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
const WIDGETS = new Set(['windowtype', 'eu3dialogtype', 'containerwindowtype', 'listboxtype', 'smoothlistboxtype', 'gridboxtype', 'overlappingelementsboxtype', 'shieldtype', 'scrollbartype', 'extendedscrollbartype', 'positiontype', 'icontype', 'guibuttontype', 'checkboxtype', 'buttontype', 'instanttextboxtype', 'textboxtype', 'editboxtype']);
const cp = (c: number) => c < 256 ? c : (CP1252[c] ?? 63);

const WINDOWS = new Set(['windowtype', 'eu3dialogtype', 'containerwindowtype']);
const CODE_FILLED = new Set(['listboxtype', 'smoothlistboxtype', 'gridboxtype', 'overlappingelementsboxtype', 'shieldtype', 'scrollbartype', 'extendedscrollbartype', 'positiontype']);

/** Apply if_resolution blocks whose range contains the screen: their keys come last, so they win. */
function resolveProps(v: Node[], scr: { w: number; h: number }): Node[] {
  if (!v.some(n => n.lkey === 'if_resolution')) return v;
  const out: Node[] = []; const extra: Node[] = [];
  for (const n of v) {
    if (n.lkey !== 'if_resolution' || !Array.isArray(n.value)) { out.push(n); continue; }
    const b = n.value; const g = (k: string) => { const s = str(b, k); return s === undefined ? undefined : +s; };
    const minH = g('min_height'), maxH = g('max_height'), minW = g('min_width'), maxW = g('max_width');
    if ((minH === undefined || scr.h >= minH) && (maxH === undefined || scr.h <= maxH) && (minW === undefined || scr.w >= minW) && (maxW === undefined || scr.w <= maxW))
      extra.push(...b.filter(x => !/^(min|max)_(height|width)$/.test(x.lkey)));
  }
  return out.concat(extra);
}

function anchor(o: string, box: Rect): { x: number; y: number } {
  switch (o) {
    case 'upper_right': return { x: box.x + box.w, y: box.y };
    case 'lower_left': return { x: box.x, y: box.y + box.h };
    case 'lower_right': return { x: box.x + box.w, y: box.y + box.h };
    case 'center': return { x: box.x + Math.floor(box.w / 2), y: box.y + Math.floor(box.h / 2) }; // H: floor
    case 'center_up': return { x: box.x + Math.floor(box.w / 2), y: box.y };
    case 'center_down': return { x: box.x + Math.floor(box.w / 2), y: box.y + box.h };
    case 'center_left': return { x: box.x, y: box.y + Math.floor(box.h / 2) };
    case 'center_right': return { x: box.x + box.w, y: box.y + Math.floor(box.h / 2) };
    default: return { x: box.x, y: box.y }; // upper_left and unknown values (H)
  }
}

export function layoutWindow(gfx: Gfx, root: Node, opt: Options): DrawList {
  const scr = opt.screen;
  const out: DrawList = { screen: scr, textures: [], draws: [], widgets: [], diags: [] };
  const texIdx = new Map<string, number>();
  const hidden = new Set(opt.sample?.hidden ?? []);

  function tex(rel: string): Texture | undefined {
    const d = gfx.textureDims(rel); if (!d) { out.diags.push(`missing texture ${rel}`); return undefined; }
    let i = texIdx.get(d.abs);
    if (i === undefined) { i = out.textures.length; texIdx.set(d.abs, i); out.textures.push({ rel, abs: d.abs, w: d.w, h: d.h, fmt: d.fmt }); }
    return out.textures[i];
  }

  function spriteQuads(name: string, x: number, y: number, frame: number, scale: number, sizeOverride: { x: number; y: number } | undefined, wi: number): Rect | undefined {
    const s = gfx.sprites.get(name);
    if (!s || !s.texture) { out.diags.push(`unknown sprite ${name}`); return undefined; }
    if (s.kind === 'maskedshieldtype' || s.kind === 'progressbartype' || s.kind === 'piecharttype' || s.kind === 'linecharttype') {
      out.widgets[wi].note = `code-filled ${s.kind}, not drawn`; return undefined;
    }
    const t = tex(s.texture); if (!t) return undefined;
    const ti = texIdx.get(t.abs)!;
    const shader = (s.effect ?? '').replace(/^.*[\\/]/, '').replace(/\.(lua|shader)$/, '') || 'default';
    const filter: 'point' | 'linear' = /^buttonstate($|_nodowneffect|_onlydisable)|^progress/.test(shader) ? 'point' : 'linear';
    if (s.kind === 'corneredtilespritetype') {
      const sz = sizeOverride ?? s.size ?? { x: t.w, y: t.h };
      const b = s.border ?? { x: 0, y: 0 };
      const xs = [0, b.x, sz.x - b.x, sz.x], ys = [0, b.y, sz.y - b.y, sz.y];
      const us = [0, b.x / t.w, 1 - b.x / t.w, 1], vs = [0, b.y / t.h, 1 - b.y / t.h, 1];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
        const w = xs[i + 1] - xs[i], h = ys[j + 1] - ys[j]; if (w <= 0 || h <= 0) continue;
        out.draws.push({ k: 's', tex: ti, x: x + xs[i], y: y + ys[j], w, h, u0: us[i], v0: vs[j], u1: us[i + 1], v1: vs[j + 1], shader, filter, widget: wi });
      }
      return { x, y, w: sz.x, h: sz.y };
    }
    const fw = t.w / s.frames;
    const f = Math.min(s.frames - 1, Math.max(0, frame > 0 ? frame - 1 : 0)); // H: `frame` is 1-based
    const w = Math.round(fw * scale), h = Math.round(t.h * scale);
    out.draws.push({ k: 's', tex: ti, x, y, w, h, u0: f / s.frames, v0: 0, u1: (f + 1) / s.frames, v1: 1, shader, filter, widget: wi });
    return { x, y, w, h };
  }

  function text(raw: string, fontName: string | undefined, box: Rect, fmt: string, border: { x: number; y: number }, wi: number, vcentre: boolean) {
    if (!raw || !fontName) return;
    const font = gfx.font(fontName); if (!font) { out.diags.push(`unknown font ${fontName}`); return; }
    const t = tex(font.texture!); if (!t) return;
    const ti = texIdx.get(t.abs)!;
    const s = (opt.loc.get(raw) ?? raw).replace(/§./g, '').replace(/\\n/g, '\n');
    const lines = wrap(font, s, box.w - 2 * border.x);
    const q: number[] = [];
    const lh = font.lineHeight;
    let y0 = box.y + border.y;
    if (vcentre) y0 = box.y + (box.h - lines.length * lh) / 2; // H3: button text centred vertically, not rounded (half pixels blur through the linear sampler)
    lines.forEach((line, li) => {
      const lw = measure(font, line);
      let x = box.x + border.x;
      if (fmt === 'centre' || fmt === 'center') x = box.x + (vcentre ? (box.w - lw) / 2 : Math.round((box.w - lw) / 2)); // H2: text boxes round half up; H4: button text not rounded
      else if (fmt === 'right') x = box.x + box.w - border.x - lw;
      const y = y0 + li * lh;
      let prev = -1;
      for (const ch of line) {
        const c = cp(ch.codePointAt(0)!); const g = font.glyphs.get(c);
        if (!g) { out.diags.push(`missing glyph ${c} in ${fontName}`); prev = -1; continue; }
        if (prev >= 0) x += font.kern.get(prev * 256 + c) ?? 0;
        if (g.w > 0 && g.h > 0) q.push(x + g.xo, y + g.yo, g.w, g.h, g.x / t.w, g.y / t.h, (g.x + g.w) / t.w, (g.y + g.h) / t.h);
        x += g.adv; prev = c;
      }
    });
    const c = font.def.color >>> 0;
    out.draws.push({ k: 't', tex: ti, q, color: [(c >> 16) & 255, (c >> 8) & 255, c & 255, (c >>> 24) & 255], widget: wi });
  }

  function walk(n: Node, parentBox: Rect, parentPath: string, parentOrient: string) {
    if (!Array.isArray(n.value)) return;
    const v = resolveProps(n.value, scr);
    const name = str(v, 'name') ?? '';
    const p = parentPath ? `${parentPath}/${name}` : name;
    // `only`: lay out the ancestors of one window for their boxes, draw just that window's subtree
    const ancestor = !!opt.only && opt.only !== p && opt.only.startsWith(p + '/');
    if (opt.only && !ancestor && opt.only !== p && !p.startsWith(opt.only + '/')) return;
    const orient = (str(v, 'orientation') ?? (opt.inheritOrientation ? parentOrient : 'upper_left')).toLowerCase();
    const pos = xy(kids(v, 'show_position')) ?? xy(kids(v, 'position')) ?? { x: 0, y: 0 }; // H: preview shows the window open
    const a = anchor(orient, parentBox);
    const x = a.x + pos.x, y = a.y + pos.y;
    const wi = out.widgets.length;
    const w: WidgetOut = { path: p, kind: n.lkey, rect: { x, y, w: 0, h: 0 }, start: n.start, end: n.end };
    out.widgets.push(w);
    if (hidden.has(p)) { w.note = 'hidden (sample data)'; return; }
    const scale = num(v, 'scale', 1);

    if (WINDOWS.has(n.lkey)) {
      const full = /^(yes|1)$/i.test(str(v, 'fullscreen') ?? '');
      const sz = kids(v, 'size');
      let ww = 0, hh = 0;
      if (full) { ww = scr.w; hh = scr.h; }
      else if (sz) {
        const sx = str(sz, 'x') ?? str(sz, 'width') ?? '0', sy = str(sz, 'y') ?? str(sz, 'height') ?? '0';
        ww = sx.endsWith('%') ? parentBox.w * parseFloat(sx) / 100 : +sx;
        hh = sy.endsWith('%') ? parentBox.h * parseFloat(sy) / 100 : +sy;
      }
      w.rect = { x, y, w: ww, h: hh };
      const bgk = kids(v, 'background');
      const bg = str(v, 'background') || (bgk ? str(bgk, 'spritetype') ?? str(bgk, 'quadtexturesprite') : undefined);
      if (bg && !ancestor) spriteQuads(bg, x, y, 0, 1, { x: ww, y: hh }, wi);
      for (const c of v) if (Array.isArray(c.value) && WIDGETS.has(c.lkey)) walk(c, w.rect, p, orient);
      return;
    }
    if (ancestor) return;
    if (CODE_FILLED.has(n.lkey)) {
      const sz = xy(kids(v, 'size'));
      w.rect = { x, y, w: sz?.x ?? 0, h: sz?.y ?? 0 }; w.note = 'code-filled, not drawn';
      return;
    }
    if (n.lkey === 'icontype' || n.lkey === 'guibuttontype' || n.lkey === 'checkboxtype' || n.lkey === 'buttontype') {
      const sp = str(v, 'spritetype') ?? str(v, 'quadtexturesprite');
      const r = sp ? spriteQuads(sp, x, y, num(v, 'frame', 0), scale, xy(kids(v, 'size')), wi) : undefined;
      if (r) w.rect = r;
      const bt = opt.sample?.text?.[p] ?? str(v, 'buttontext') ?? (n.lkey === 'guibuttontype' ? str(v, 'text') : undefined);
      if (bt) text(bt, str(v, 'buttonfont') ?? str(v, 'font'), w.rect, (str(v, 'format') ?? 'centre').toLowerCase(), { x: 0, y: 0 }, wi, true);
      return;
    }
    if (n.lkey === 'instanttextboxtype' || n.lkey === 'textboxtype' || n.lkey === 'editboxtype') {
      const mw = num(v, 'maxwidth', 0), mh = num(v, 'maxheight', 0);
      const sz = xy(kids(v, 'size'));
      w.rect = { x, y, w: mw || sz?.x || 0, h: mh || sz?.y || 0 }; // H: the box is maxWidth × maxHeight
      const t = opt.sample?.text?.[p] ?? str(v, 'text') ?? '';
      text(t, str(v, 'font'), w.rect, (str(v, 'format') ?? 'left').toLowerCase(), xy(kids(v, 'bordersize')) ?? { x: 0, y: 0 }, wi, false);
      return;
    }
    w.note = `kind ${n.lkey} not handled`;
  }

  walk(root, { x: 0, y: 0, w: scr.w, h: scr.h }, '', 'upper_left');
  return out;
}

function measure(f: Font, s: string): number {
  let w = 0, prev = -1;
  for (const ch of s) { const c = cp(ch.codePointAt(0)!); const g = f.glyphs.get(c); if (!g) { prev = -1; continue; } if (prev >= 0) w += f.kern.get(prev * 256 + c) ?? 0; w += g.adv; prev = c; }
  return w;
}

/** H: greedy word wrap at spaces against the inner width. */
function wrap(f: Font, s: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    if (maxW <= 0) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const cand = line ? line + ' ' + word : word;
      if (line && measure(f, cand) > maxW) { out.push(line + ' '); line = word; } else line = cand; // H2: a wrapped line keeps its trailing space when measured
    }
    out.push(line);
  }
  return out;
}

/** Find a root widget by name in a parsed .gui file. */
export function findWindow(top: Node[], name: string): Node | undefined {
  for (const g of top) if (g.lkey === 'guitypes' && Array.isArray(g.value))
    for (const w of g.value) if (Array.isArray(w.value) && str(w.value, 'name') === name) return w;
  return undefined;
}
export { get };
