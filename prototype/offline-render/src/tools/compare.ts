// PROTOTYPE (etch#9): compare an offline render with a game screenshot of the same resolution. Throwaway.
// usage: node out/compare.js <game.png> <render.png> <drawlist.json> <outdir> [x y w h crop for the picture]
// Only pixels the render covers fully (alpha 255) are compared: the game draws the map behind translucent edges.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import type { DrawList } from '../core/layout';

const [gameF, renderF, listF, outDir, ...cropA] = process.argv.slice(2);
const game = PNG.sync.read(fs.readFileSync(gameF)); const ren = PNG.sync.read(fs.readFileSync(renderF));
const list: DrawList = JSON.parse(fs.readFileSync(listF, 'utf8'));
const W = game.width, H = game.height;
if (ren.width !== W || ren.height !== H) throw new Error(`size mismatch ${W}x${H} vs ${ren.width}x${ren.height}`);
fs.mkdirSync(outDir, { recursive: true });

// per-widget masks from the draw list
const masks = new Map<string, Set<number>>();
const cover = (wi: string, x: number, y: number, w: number, h: number) => {
  let m = masks.get(wi); if (!m) masks.set(wi, m = new Set());
  for (let j = Math.max(0, Math.floor(y)); j < Math.min(H, Math.ceil(y + h)); j++) for (let i = Math.max(0, Math.floor(x)); i < Math.min(W, Math.ceil(x + w)); i++) m.add(j * W + i);
};
for (const d of list.draws) {
  if (d.k === 's') cover(String(d.widget), d.x, d.y, d.w, d.h);
  else for (let i = 0; i < d.q.length; i += 8) cover(d.widget + ':text', d.q[i], d.q[i + 1], d.q[i + 2], d.q[i + 3]);
}

function diffAt(p: number, dx: number, dy: number): number {
  const x = p % W + dx, y = Math.floor(p / W) + dy; if (x < 0 || y < 0 || x >= W || y >= H) return 255;
  const a = p * 4, b = (y * W + x) * 4;
  return Math.max(Math.abs(ren.data[a] - game.data[b]), Math.abs(ren.data[a + 1] - game.data[b + 1]), Math.abs(ren.data[a + 2] - game.data[b + 2]));
}
function stats(px: number[], dx = 0, dy = 0) {
  let sum = 0, le2 = 0, le8 = 0, le24 = 0;
  for (const p of px) { const d = diffAt(p, dx, dy); sum += d; if (d <= 2) le2++; if (d <= 8) le8++; if (d <= 24) le24++; }
  const n = px.length || 1;
  return { n: px.length, mean: +(sum / n).toFixed(2), le2: +(100 * le2 / n).toFixed(1), le8: +(100 * le8 / n).toFixed(1), le24: +(100 * le24 / n).toFixed(1) };
}

const rows: any[] = []; const all: number[] = []; let partial = 0;
for (const [key, m] of masks) {
  const wi = parseInt(key); const w = list.widgets[wi];
  const opaque: number[] = [];
  for (const p of m) { const a = ren.data[p * 4 + 3]; if (a === 255) opaque.push(p); else if (a > 0) partial++; }
  all.push(...opaque);
  const s0 = stats(opaque);
  let best = { dx: 0, dy: 0, mean: s0.mean };
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const s = stats(opaque, dx, dy); if (s.mean < best.mean - 0.01) best = { dx, dy, mean: s.mean }; }
  const isText = key.endsWith(':text');
  rows.push({ widget: w.path.split('/').slice(-2).join('/') + (isText ? ' [text]' : ''), kind: w.kind, text: isText, rect: w.rect, ...s0, bestShift: best });
}
const summary = { pixelsCompared: all.length, partialAlphaExcluded: partial, ...stats(all) };
fs.writeFileSync(path.join(outDir, 'compare.json'), JSON.stringify({ summary, widgets: rows }, null, 1));
console.log('summary', summary);
for (const r of rows) console.log(`${r.widget.padEnd(48)} ${r.kind.padEnd(19)} n=${String(r.n).padStart(6)} mean=${String(r.mean).padStart(6)} ≤2:${String(r.le2).padStart(5)}% ≤8:${String(r.le8).padStart(5)}% best shift ${r.bestShift.dx},${r.bestShift.dy} (${r.bestShift.mean})`);

// pictures: game | render | diff, stacked, for a crop
const [cx, cy, cw, ch] = cropA.length === 4 ? cropA.map(Number) : [0, 0, W, H];
const pic = new PNG({ width: cw, height: ch * 3 });
for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
  const s = ((cy + j) * W + cx + i) * 4;
  const put = (row: number, r: number, g: number, b: number) => { const d = ((row * ch + j) * cw + i) * 4; pic.data[d] = r; pic.data[d + 1] = g; pic.data[d + 2] = b; pic.data[d + 3] = 255; };
  put(0, game.data[s], game.data[s + 1], game.data[s + 2]);
  const a = ren.data[s + 3] / 255; const chk = ((i >> 3) + (j >> 3)) & 1 ? 60 : 90; // render over a checkerboard
  put(1, ren.data[s] + chk * (1 - a), ren.data[s + 1] + chk * (1 - a), ren.data[s + 2] + chk * (1 - a));
  if (ren.data[s + 3] === 255) { const d = Math.min(255, diffAt(s / 4, 0, 0) * 4); put(2, d, d, d); }
  else if (ren.data[s + 3] > 0) put(2, 0, 0, 90); else put(2, 0, 0, 0);
}
fs.writeFileSync(path.join(outDir, 'compare.png'), PNG.sync.write(pic));
console.log('wrote', path.join(outDir, 'compare.png'));
