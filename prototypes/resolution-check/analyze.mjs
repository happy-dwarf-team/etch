// PROTOTYPE for happy-dwarf-team/etch#18, throwaway. Compares the runs' screenshots:
//   - two Tongs screenshots of one state (menu, probe) against each other;
//   - the probe screenshot against etch-capture's back-buffer read-back of the same run;
//   - every probe widget's pixels (Tongs rect) and the whole 1280x720 corner against the
//     3440x1440 reference run.
// The green FPS counter (top-right, 80x20) is masked out.
//
//   node analyze.mjs <runsDir> <referenceRun> > summary.json
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function readPng(file) {
  const b = fs.readFileSync(file);
  let p = 8, w, h, type, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), kind = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[12] !== 0) throw new Error('unsupported png'); type = d[9]; }
    if (kind === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error(`png colour type ${type}`);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, rgba = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) rgba[(y * w + x) * 4 + k] = k < bpp ? cur[x * bpp + k] : 255;
    [prev, cur] = [cur, prev];
  }
  return { w, h, rgba };
}
function readBmp(file) {
  const b = fs.readFileSync(file), off = b.readUInt32LE(10), w = b.readInt32LE(18), hh = b.readInt32LE(22), bits = b.readUInt16LE(28);
  if (bits !== 32) throw new Error('bmp bits ' + bits);
  const h = Math.abs(hh), rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = hh > 0 ? h - 1 - y : y;
    for (let x = 0; x < w; x++) {
      const s = off + (sy * w + x) * 4, d = (y * w + x) * 4;
      rgba[d] = b[s + 2]; rgba[d + 1] = b[s + 1]; rgba[d + 2] = b[s]; rgba[d + 3] = 255;
    }
  }
  return { w, h, rgba };
}
// Differences of RGB inside rect r (same coordinates in both images), FPS corner of each masked.
function diff(A, B, r, opts = {}) {
  let n = 0, differ = 0, maxd = 0, bbox = null;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const bx = x + (opts.dx ?? 0), by = y + (opts.dy ?? 0);
    if ((y < 20 && x >= A.w - 80) || (by < 20 && bx >= B.w - 80)) continue;
    if (x >= A.w || y >= A.h || bx >= B.w || by >= B.h) continue;
    const i = (y * A.w + x) * 4, j = (by * B.w + bx) * 4;
    const d = Math.max(Math.abs(A.rgba[i] - B.rgba[j]), Math.abs(A.rgba[i + 1] - B.rgba[j + 1]), Math.abs(A.rgba[i + 2] - B.rgba[j + 2]));
    n++;
    if (d) {
      differ++; maxd = Math.max(maxd, d);
      bbox = bbox ? { x0: Math.min(bbox.x0, x), y0: Math.min(bbox.y0, y), x1: Math.max(bbox.x1, x), y1: Math.max(bbox.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
    }
  }
  return { compared: n, differ, max: maxd, bbox };
}
const full = (I) => ({ x: 0, y: 0, w: I.w, h: I.h });

const [runsDir, refName] = process.argv.slice(2);
const load = (run) => {
  const dir = path.join(runsDir, run), probe = JSON.parse(fs.readFileSync(path.join(dir, 'probe.json'), 'utf8'));
  return { run, dir, probe, menuA: readPng(path.join(dir, 'menu-a.png')), menuB: readPng(path.join(dir, 'menu-b.png')),
    probeA: readPng(path.join(dir, 'probe-a.png')), probeB: readPng(path.join(dir, 'probe-b.png')), back: readBmp(path.join(dir, 'probe-backbuffer.bmp')) };
};
const ref = load(refName);
const widgets = ['etch_res_button', 'etch_res_version_bg', 'etch_res_text', 'etch_res_panel', 'etch_res_ramp'];
const out = [];
for (const run of fs.readdirSync(runsDir).filter((d) => fs.existsSync(path.join(runsDir, d, 'probe.json'))).sort()) {
  const R = run === refName ? ref : load(run);
  const row = { run, client: `${R.probe.window.width}x${R.probe.window.height}`, screen: [R.probe.window.screen_x, R.probe.window.screen_y] };
  row.menuTwoShots = diff(R.menuA, R.menuB, full(R.menuA));
  row.probeTwoShots = diff(R.probeA, R.probeB, full(R.probeA));
  row.probeVsBackBuffer = diff(R.probeA, R.back, full(R.probeA));
  row.widgetsVsRef = {};
  for (const n of widgets) {
    const r = R.probe.probe[n], rr = ref.probe.probe[n];
    const sameRect = r && rr && r.x === rr.x && r.y === rr.y && r.w === rr.w && r.h === rr.h;
    const clip = { x: r.x, y: r.y, w: Math.min(r.w, R.probeA.w - r.x), h: Math.min(r.h, R.probeA.h - r.y) };
    row.widgetsVsRef[n] = { rect: r, sameRectAsRef: sameRect, visiblePart: clip, ...diff(R.probeA, ref.probeA, clip) };
  }
  // Markers: each at its branch position here, compared with the same marker at its position in the reference.
  let mk = { compared: 0, differ: 0 };
  for (const [k, r] of Object.entries(R.probe.probe).filter(([k]) => /^(max|min)_/.test(k))) {
    const rr = ref.probe.probe[k], d = diff(R.probeA, ref.probeA, r, { dx: rr.x - r.x, dy: rr.y - r.y });
    mk.compared += d.compared; mk.differ += d.differ;
  }
  row.markersVsRef = mk;
  row.cornerVsRef = diff(R.probeA, ref.probeA, { x: 0, y: 290, w: Math.min(1280, R.probeA.w), h: Math.min(720, R.probeA.h) - 290 });
  out.push(row);
}
console.log(JSON.stringify(out, null, 1));
