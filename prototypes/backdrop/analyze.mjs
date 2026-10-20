// PROTOTYPE for happy-dwarf-team/etch#22, throwaway, never merged.
//
//   node analyze.mjs <runDir> [<earlierRunDir>]
//
// Reads the crops probe.mjs wrote and answers, per previewed window:
// - stable: are two captures of the same state identical?
// - alpha recovery: over black B = c*a, over white W = c*a + 255*(1-a), so a = 1 - (W-B)/255 per
//   channel and B is the premultiplied colour. Channel disagreement or W < B means the window is
//   not drawn with plain source-over blending.
// - opaque pixels unchanged: where a = 255, the window over the menu equals the window over black.
// - prediction: over the menu M, src-over gives B + M*(1-a); compared with the real capture.
// - the probe's ramp: recovered alpha per column against the texture's alpha (= column).
// - cycle: after every close -> reload -> open, the backdrop still fills the crop around the
//   window and the window sits at its new x.
// - H1 of etch#16: goto_box against its preview copy etch_goto_box.
// - restart: with an earlier run, the same crops byte for byte.
// Writes summary.json, PNGs next to the BMPs and compare.html (local only: the crops are game art).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const [runDir, earlierDir] = process.argv.slice(2);
if (!runDir) throw new Error('usage: node analyze.mjs <runDir> [<earlierRunDir>]');
const capDir = path.join(runDir, 'captures');

function readBmp(file) {
  const b = fs.readFileSync(file);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), h = Math.abs(b.readInt32LE(22));
  const px = Buffer.alloc(w * h * 4);  // RGBA
  for (let i = 0; i < w * h; i++) { px[i * 4] = b[off + i * 4 + 2]; px[i * 4 + 1] = b[off + i * 4 + 1]; px[i * 4 + 2] = b[off + i * 4]; px[i * 4 + 3] = 255; }
  return { w, h, px };
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function writePng(file, { w, h, px }) {
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
const files = fs.readdirSync(capDir).filter((f) => f.endsWith('.bmp')).sort();
const find = (suffix) => { const f = files.findLast((x) => x.replace(/^\d+-/, '') === `${suffix}.bmp`); return f ? path.join(capDir, f) : null; };
const load = (suffix) => { const f = find(suffix); return f ? readBmp(f) : null; };
const png = (img, name) => { writePng(path.join(capDir, `${name}.png`), img); return `captures/${name}.png`; };
function diff(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return { comparable: false };
  let n = 0, max = 0;
  for (let i = 0; i < a.px.length; i += 4) {
    const d = Math.max(Math.abs(a.px[i] - b.px[i]), Math.abs(a.px[i + 1] - b.px[i + 1]), Math.abs(a.px[i + 2] - b.px[i + 2]));
    if (d) n++; if (d > max) max = d;
  }
  return { comparable: true, differing: n, of: a.w * a.h, max };
}

function windowReport(win) {
  const M = load(`${win}-menu-a`), V0 = load(`${win}-over-menu-a`), B = load(`${win}-over-black-a`), W = load(`${win}-over-white-a`);
  if (!B || !W) return null;
  const r = { window: win, size: [B.w, B.h] };
  r.stable = Object.fromEntries(['menu', 'over-menu', 'over-black', 'over-white'].map((v) => [v, diff(load(`${win}-${v}-a`), load(`${win}-${v}-b`))]));
  const n = B.w * B.h;
  const alpha = new Uint8Array(n);
  let opaque = 0, clear = 0, partial = 0, spreadOver1 = 0, maxSpread = 0, negative = 0;
  for (let i = 0; i < n; i++) {
    const as = [0, 1, 2].map((c) => 255 - (W.px[i * 4 + c] - B.px[i * 4 + c]));
    if (as.some((a) => a > 255)) negative++;
    const spread = Math.max(...as) - Math.min(...as);
    if (spread > 1) spreadOver1++; if (spread > maxSpread) maxSpread = spread;
    const a = Math.min(255, Math.max(0, Math.round((as[0] + as[1] + as[2]) / 3)));
    alpha[i] = a; if (a === 255) opaque++; else if (a === 0) clear++; else partial++;
  }
  r.alpha = { opaque, clear, partial, channelSpreadOver1: spreadOver1, maxChannelSpread: maxSpread, whiteBelowBlack: negative };
  // Opaque pixels: the window over the menu against the window over black.
  // The menu animates (its map), so only pixels that are the same in both menu captures and in both
  // over-menu captures are compared.
  if (V0) {
    const M2 = load(`${win}-menu-b`), V02 = load(`${win}-over-menu-b`);
    let opaqueChanged = 0, clearChanged = 0, predMax = 0, pred1 = 0, pred2 = 0, compared = 0;
    for (let i = 0; i < n; i++) {
      const still = [0, 1, 2].every((c) => (!M || !M2 || M.px[i * 4 + c] === M2.px[i * 4 + c]) && (!V02 || V0.px[i * 4 + c] === V02.px[i * 4 + c]));
      if (!still) continue;
      compared++;
      for (let c = 0; c < 3; c++) {
        const k = i * 4 + c;
        if (alpha[i] === 255 && V0.px[k] !== B.px[k]) { opaqueChanged++; break; }
      }
      if (M && alpha[i] === 0) for (let c = 0; c < 3; c++) if (V0.px[i * 4 + c] !== M.px[i * 4 + c]) { clearChanged++; break; }
      if (M) {
        let d = 0;
        for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(B.px[i * 4 + c] + M.px[i * 4 + c] * (255 - alpha[i]) / 255 - V0.px[i * 4 + c]));
        if (d > predMax) predMax = d; if (d <= 1) pred1++; if (d <= 2) pred2++;
      }
    }
    r.overMenu = { stillPixels: compared, of: n, opaquePixelsChanged: opaqueChanged, clearPixelsNotMenu: clearChanged, prediction: M ? { maxDiff: +predMax.toFixed(2), within1: +(pred1 / compared).toFixed(5), within2: +(pred2 / compared).toFixed(5) } : null };
  }
  // Recovered straight RGBA and the alpha map.
  const rgba = Buffer.alloc(n * 4), amap = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const a = alpha[i];
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = a ? Math.min(255, Math.round(B.px[i * 4 + c] * 255 / a)) : 0;
    rgba[i * 4 + 3] = a; amap[i * 4] = amap[i * 4 + 1] = amap[i * 4 + 2] = a; amap[i * 4 + 3] = 255;
  }
  r.images = {
    menu: M && png(M, `${win}-menu`), overMenu: V0 && png(V0, `${win}-over-menu`), overBlack: png(B, `${win}-over-black`),
    overWhite: png(W, `${win}-over-white`), rgba: png({ w: B.w, h: B.h, px: rgba }, `${win}-recovered-rgba`), alpha: png({ w: B.w, h: B.h, px: amap }, `${win}-alpha`),
  };
  r._alpha = alpha; r._B = B; r._W = W;
  return r;
}

const summary = { runDir, windows: [] };
for (const win of ['etch_probe_window', 'etch_topbar', 'goto_box', 'etch_goto_box']) {
  const r = windowReport(win);
  if (!r) continue;
  if (win === 'etch_probe_window') {
    // Ramp at window (20, 60), crop margin 6: crop (26, 66), 256 x 32; alpha = column, colour (200, 120, 40).
    let maxAlphaErr = 0, maxColourErr = 0;
    for (let y = 66; y < 98; y++) for (let x = 0; x < 256; x++) {
      const i = y * r.size[0] + 26 + x;
      maxAlphaErr = Math.max(maxAlphaErr, Math.abs(r._alpha[i] - x));
      if (x >= 32) { const want = [200, 120, 40]; for (let c = 0; c < 3; c++) maxColourErr = Math.max(maxColourErr, Math.abs(Math.round(r._B.px[i * 4 + c] * 255 / r._alpha[i]) - want[c])); }
    }
    r.ramp = { maxAlphaError: maxAlphaErr, maxColourErrorAtAlphaFrom32: maxColourErr };
  }
  summary.windows.push(r);
}
// H1 of etch#16: the original against the preview copy.
const g = summary.windows.find((w) => w.window === 'goto_box'), e = summary.windows.find((w) => w.window === 'etch_goto_box');
if (g && e) summary.h1 = { overBlack: diff(g._B, e._B), overWhite: diff(g._W, e._W) };

// Fill and z-order.
const fillJson = path.join(runDir, 'backdrop.json');
if (fs.existsSync(fillJson)) summary.fill = JSON.parse(fs.readFileSync(fillJson, 'utf8'));
for (const f of files.filter((x) => /fill-|frontend-/.test(x))) {
  const img = readBmp(path.join(capDir, f));
  const half = { w: img.w >> 1, h: img.h >> 1, px: Buffer.alloc((img.w >> 1) * (img.h >> 1) * 4) };
  for (let y = 0; y < half.h; y++) for (let x = 0; x < half.w; x++) img.px.copy(half.px, (y * half.w + x) * 4, ((2 * y) * img.w + 2 * x) * 4, ((2 * y) * img.w + 2 * x) * 4 + 4);
  (summary.full ??= {})[f.replace(/\.bmp$/, '')] = png(half, f.replace(/\.bmp$/, '-half'));
}
for (const z of ['zorder-preview-then-backdrop', 'zorder-backdrop-then-preview']) {
  const img = load(z);
  if (img) {
    let black = 0; for (let i = 0; i < img.px.length; i += 4) if (!img.px[i] && !img.px[i + 1] && !img.px[i + 2]) black++;
    (summary.zorder ??= {})[z] = { blackShare: +(black / (img.w * img.h)).toFixed(4), image: png(img, z) };
  }
}

// Cycle: crop (154, 290, 792 x 140); window at (x, 300) 300 x 120; ramp column 255 at window (275, 76).
const cyc = files.filter((f) => /-cycle\d+-x\d+\.bmp$/.test(f));
if (cyc.length) {
  summary.cycle = cyc.map((f) => {
    const x = +/x(\d+)\.bmp$/.exec(f)[1], img = readBmp(path.join(capDir, f));
    const wx = x - 154, wy = 10;
    let outsideNotBlack = 0;
    for (let y = 0; y < img.h; y++) for (let xx = 0; xx < img.w; xx++) {
      if (xx >= wx && xx < wx + 300 && y >= wy && y < wy + 120) continue;
      const i = (y * img.w + xx) * 4; if (img.px[i] || img.px[i + 1] || img.px[i + 2]) outsideNotBlack++;
    }
    const i = ((wy + 76) * img.w + wx + 275) * 4;
    return { file: f, x, outsideNotBlack, rampEnd: [img.px[i], img.px[i + 1], img.px[i + 2]], image: png(img, f.replace(/\.bmp$/, '')) };
  });
}
const p = summary.windows.find((w) => w.window === 'etch_probe_window');
const dual = files.filter((f) => /-dual\d+-(black|white)\.bmp$/.test(f));
if (dual.length && p) summary.dual = dual.map((f) => ({ file: f, sameAsWindowsPhase: diff(readBmp(path.join(capDir, f)), /black/.test(f) ? p._B : p._W) }));

// Restart: the same crops in an earlier run.
if (earlierDir) {
  const earlier = fs.readdirSync(path.join(earlierDir, 'captures')).filter((f) => f.endsWith('.bmp'));
  summary.restart = [];
  for (const win of summary.windows) for (const v of ['over-black-a', 'over-white-a']) {
    const f = earlier.find((x) => x.replace(/^\d+-/, '') === `${win.window}-${v}.bmp`);
    if (f) summary.restart.push({ crop: `${win.window}-${v}`, vsEarlier: diff(load(`${win.window}-${v}`), readBmp(path.join(earlierDir, 'captures', f))) });
  }
}

for (const w of summary.windows) { delete w._alpha; delete w._B; delete w._W; }
fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, (k, v) => (k === 'images' || k === 'image' ? undefined : v), 2));

// compare.html: per window, the variants side by side and one switchable view.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sections = summary.windows.map((w) => {
  const v = Object.entries(w.images).filter(([, src]) => src);
  return `<section><h2>${esc(w.window)} <small>${w.size.join('×')}</small></h2>
  <div class="tabs">${v.map(([k], i) => `<button data-k="${k}" class="${i ? '' : 'on'}">${k}</button>`).join('')}</div>
  <div class="view">${v.map(([k, src], i) => `<img data-k="${k}" src="${src}" class="${k === 'rgba' ? 'checker' : ''}" ${i ? 'hidden' : ''}>`).join('')}</div>
  <pre>${esc(JSON.stringify({ stable: w.stable, alpha: w.alpha, overMenu: w.overMenu, ramp: w.ramp }, null, 1))}</pre></section>`;
}).join('\n');
const fulls = Object.entries(summary.full ?? {}).map(([k, src]) => `<figure><img src="${src}"><figcaption>${esc(k)}</figcaption></figure>`).join('');
const cycles = (summary.cycle ?? []).map((c) => `<figure><img src="${c.image}"><figcaption>x=${c.x}, non-black outside: ${c.outsideNotBlack}</figcaption></figure>`).join('');
const zo = Object.entries(summary.zorder ?? {}).map(([k, z]) => `<figure><img src="${z.image}"><figcaption>${esc(k)} (black ${z.blackShare})</figcaption></figure>`).join('');
fs.writeFileSync(path.join(runDir, 'compare.html'), `<!doctype html><meta charset="utf-8"><title>Backdrop prototype</title>
<style>:root{color-scheme:light dark;--bg:#f4f4f2;--fg:#1d1d1b;--line:#ccc}@media (prefers-color-scheme:dark){:root{--bg:#1b1b1d;--fg:#e8e8e6;--line:#444}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1400px;padding:16px}
h1{font-size:20px}h2{font-size:16px;margin:24px 0 8px}small{opacity:.6;font-weight:400}section{border-top:1px solid var(--line)}
.tabs button{font:inherit;padding:4px 10px;margin:0 4px 6px 0;border:1px solid var(--line);background:transparent;color:inherit;border-radius:4px;cursor:pointer}.tabs button.on{background:var(--fg);color:var(--bg)}
.view{overflow:auto;max-width:100%}.view img{image-rendering:pixelated;display:block}
.checker{background:conic-gradient(#999 25%,#ddd 0 50%,#999 0 75%,#ddd 0) 0 0/16px 16px}
pre{font-size:12px;overflow:auto;max-height:240px}figure{display:inline-block;margin:0 12px 12px 0;vertical-align:top}figure img{max-width:100%;image-rendering:pixelated}
.grid figure img{max-width:860px}</style>
<h1>Backdrop under a previewed window (etch#22 prototype)</h1>
<p>Run: ${esc(path.basename(runDir))}. Chosen backdrop form: ${esc(summary.fill?.form ?? '?')}. Local only: the images are game art.</p>
${sections}
<h2>Fill and frontend (half size)</h2><div class="grid">${fulls}</div>
<h2>Z-order</h2>${zo}
<h2>Close → reload → open with the backdrop open</h2>${cycles}
<script>document.querySelectorAll('section').forEach(s=>s.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{s.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));s.querySelectorAll('.view img').forEach(i=>i.hidden=i.dataset.k!==b.dataset.k)}))</script>`);
console.log(`wrote ${path.join(runDir, 'compare.html')}`);
