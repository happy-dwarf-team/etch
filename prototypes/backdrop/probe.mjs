// PROTOTYPE for happy-dwarf-team/etch#22, throwaway, never merged. Drives the game host started by
// host.ps1 (etch#21's install) through Tongs (\\.\pipe\tongs, patched for the main menu) and
// etch-capture (\\.\pipe\etch-proto). Writes preview copies into the overlay mod only.
//
//   node probe.mjs <phase> <runDir> [args...]
//
//   check     pings, top-level windows of the main menu
//   fill      opens each backdrop form (btn, icon, scaled) in black, captures the full frame, counts
//             the black pixels; picks the form for the later phases (backdrop.json)
//   zorder    preview window opened before / after the backdrop: which one is on top
//   windows   per previewed window: menu alone, window over the menu, over black, over white
//             (two captures each), crops with a margin; [names...] limits the set
//   cycle     backdrop open once, 10 x (edit -> close -> reload -> open -> crop); then 5 dual jobs
//             (black then white backdrop, one crop each)
//   frontend  closes every top-level window that is not Etch's, captures the full frame
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const [phase, runDir, ...rest] = process.argv.slice(2);
if (!phase || !runDir) throw new Error('usage: node probe.mjs <phase> <runDir>');
const lab = 'C:\\Users\\styda\\repositories\\eu4-engine-lab';
const overlay = path.join(lab, 'work', 'etch21-host', 'overlay', 'interface');
const p2ke = 'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\236850\\3290499798\\interface';
const captures = path.join(runDir, 'captures');
fs.mkdirSync(captures, { recursive: true });
const logFile = path.join(runDir, 'probe.jsonl');
const log = (e) => fs.appendFileSync(logFile, JSON.stringify({ phase, at: new Date().toISOString(), ...e }) + '\n');
const SCREEN = { w: 3440, h: 1440 };

async function client(name) {
  const sock = net.connect(`\\\\.\\pipe\\${name}`);
  await new Promise((ok, fail) => { sock.once('connect', ok); sock.once('error', fail); });
  let buf = '';
  const waiting = [];
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); waiting.shift()?.(line); }
  });
  return async (line, note) => {
    const t0 = performance.now();
    const answer = await new Promise((ok) => { waiting.push(ok); sock.write(line + '\n'); });
    const ms = +(performance.now() - t0).toFixed(1);
    let a; try { a = JSON.parse(answer); } catch { a = { raw: answer }; }
    log({ pipe: name, line, note, roundtrip_ms: ms, answer: a });
    const brief = a.command === 'console' ? `text=${JSON.stringify(a.text)} run=${a.run_ms} frame=${a.frame}`
      : a.command === 'capture' ? `frame ${a.frame_at_request}->${a.frame} total=${a.total_ms}` : '';
    console.log(`${a.ok ? 'ok ' : 'ERR'} ${String(ms).padStart(7)} ms  ${line.slice(0, 90)}  ${brief}${a.ok ? '' : ' ' + JSON.stringify(a).slice(0, 300)}`);
    return a;
  };
}
const tongs = await client('tongs');
const etch = await client('etch-proto');
const cmd = (c) => tongs(`console ${c}`);
const open = (w) => cmd(`window open ${w}`);
const close = (w) => cmd(`window close ${w}`);

async function rect(sel) {
  const a = await tongs(`ui find ${sel} all`);
  const m = a.matches?.find((x) => x.visible) ?? a.matches?.[0];
  return m ? m.rect : null;
}
async function topLevel(note) {
  const a = await tongs('ui tree depth=0 limit=500 all', note);
  const widgets = a.widgets ?? [];
  const names = widgets.map((w) => `${w.path ?? w.name}${w.visible === false ? ' (hidden)' : ''}`);
  log({ result: 'top-level windows', note, names });
  console.log(`top-level (${note}): ${names.join(', ')}`);
  return widgets;
}
// Crop rectangle: the window's rect plus a margin, clamped to the screen; tall windows capped.
function cropOf(r, margin = 6, maxH = 1440) {
  const x = Math.max(0, r.x - margin), y = Math.max(0, r.y - margin);
  const x2 = Math.min(SCREEN.w, r.x + r.w + margin), y2 = Math.min(SCREEN.h, r.y + Math.min(r.h, maxH) + margin);
  return { x, y, w: x2 - x, h: y2 - y };
}
let shotNo = 0;
async function shot(r, name) {
  const file = path.join(captures, `${String(++shotNo).padStart(3, '0')}-${name}.bmp`);
  const a = await etch(`capture crop ${r.x} ${r.y} ${r.w} ${r.h} ${file}`);
  return { ...a, file };
}

// 32-bit top-down BMP from etch-capture -> { w, h, px (BGRA) }.
function readBmp(file) {
  const b = fs.readFileSync(file);
  const off = b.readUInt32LE(10), w = b.readInt32LE(18), h = Math.abs(b.readInt32LE(22));
  return { w, h, px: b.subarray(off, off + w * h * 4) };
}
function shareOf(img, rgb) {
  let n = 0;
  for (let i = 0; i < img.w * img.h * 4; i += 4) if (img.px[i] === rgb[2] && img.px[i + 1] === rgb[1] && img.px[i + 2] === rgb[0]) n++;
  return n / (img.w * img.h);
}

// Prefix the top-level names of a .gui file (name = "..." directly inside guiTypes' children).
function prefixTopLevel(text, prefix) {
  let depth = 0, out = '', i = 0;
  const names = [];
  while (i < text.length) {
    const c = text[i];
    if (c === '#') { const e = text.indexOf('\n', i); const j = e < 0 ? text.length : e; out += text.slice(i, j); i = j; continue; }
    if (c === '"') { const e = text.indexOf('"', i + 1); out += text.slice(i, e + 1); i = e + 1; continue; }
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth === 2) {
      const m = /^name\s*=\s*"([^"]*)"/.exec(text.slice(i, i + 200));
      if (m && /[\s{]/.test(text[i - 1] ?? ' ')) { out += `name = "${prefix}${m[1]}"`; names.push(m[1]); i += m[0].length; continue; }
    }
    out += c; i++;
  }
  return { text: out, names };
}
function writeCopy(file) {
  const { text, names } = prefixTopLevel(fs.readFileSync(path.join(p2ke, file), 'latin1'), 'etch_');
  fs.writeFileSync(path.join(overlay, `etch_${file}`), text, 'latin1');
  log({ wrote: `etch_${file}`, renamed: names });
}
// The console keeps one window open: `window open B` closes A. So the backdrop goes into the
// preview copy itself, as the previewed window's first child: an icon of the solid sprite at
// (-4000, -4000) scaled 300x (9600 px), which covers the screen wherever the window sits.
const backdropChild = (c) => `\r\n\t\ticonType = {\r\n\t\t\tname = "etch_backdrop_fill"\r\n\t\t\tspriteType = "GFX_etch_backdrop_${c}"\r\n\t\t\tposition = { x = -4000 y = -4000 }\r\n\t\t\tscale = 300\r\n\t\t}`;
function inject(text, windowName, c) {
  const at = `name = "${windowName}"`;
  if (!text.includes(at)) throw new Error(`no ${at}`);
  return text.replace(at, at + backdropChild(c));
}
// Two copies per previewed file: etch_<file>.gui with a black backdrop child, etchw_<file>.gui
// (prefix etchw_) with a white one. Returns the window names.
function writeInjected(file, win, source) {
  const out = {};
  for (const [prefix, c] of [['etch_', 'black'], ['etchw_', 'white']]) {
    const { text } = prefixTopLevel(source, prefix);
    fs.writeFileSync(path.join(overlay, `${prefix}${file}`), inject(text, prefix + win, c), 'latin1');
    out[c] = prefix + win;
  }
  log({ wrote: [`etch_${file}`, `etchw_${file}`], windows: out });
  return out;
}
// A window's backGround widget is drawn before every child, so an injected first child covers it
// (goto_box). The wrapper keeps the window whole: a new full-screen top-level window
// <prefix><win>_backdrop holds the backdrop icon and then the previewed window's block, nested.
// Top-level blocks: [start, end) of each direct child of guiTypes, with its depth-2 name.
function topBlocks(text) {
  const blocks = [];
  let depth = 0, i = 0, start = -1, keyStart = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '#') { const e = text.indexOf('\n', i); i = e < 0 ? text.length : e; continue; }
    if (c === '"') { i = text.indexOf('"', i + 1) + 1; continue; }
    if (c === '{') { if (depth === 1) start = keyStart; depth++; }
    else if (c === '}') { depth--; if (depth === 1) { const body = text.slice(start, i + 1); blocks.push({ start, end: i + 1, name: /name\s*=\s*"([^"]*)"/.exec(body)?.[1] }); } }
    else if (depth === 1 && /\s/.test(text[i - 1] ?? ' ') && /[A-Za-z_]/.test(c)) keyStart = i;
    i++;
  }
  return blocks;
}
function wrap(text, windowName, c) {
  const b = topBlocks(text).find((x) => x.name === windowName);
  if (!b) throw new Error(`no top-level ${windowName}`);
  const inner = text.slice(b.start, b.end);
  const wrapper = [`windowType = {`, `\t\tname = "${windowName}_backdrop"`, '\t\tposition = { x = 0 y = 0 }', '\t\tsize = { x = 3440 y = 1440 }',
    '\t\tmoveable = 0', '\t\tfullscreen = yes', '\t\ticonType = {', '\t\t\tname = "etch_backdrop_fill"', `\t\t\tspriteType = "GFX_etch_backdrop_${c}"`,
    '\t\t\tposition = { x = 0 y = 0 }', '\t\t\tscale = 120', '\t\t}', '\t\t' + inner, '\t}'].join('\r\n');
  return text.slice(0, b.start) + wrapper + text.slice(b.end);
}
function writeWrapped(file, win, source) {
  const out = {};
  for (const [prefix, c] of [['etch_', 'black'], ['etchw_', 'white']]) {
    const { text } = prefixTopLevel(source, prefix);
    fs.writeFileSync(path.join(overlay, `${prefix}${file}`), wrap(text, prefix + win, c), 'latin1');
    out[c] = `${prefix}${win}_backdrop`;
    out[`${c}Inner`] = prefix + win;
  }
  log({ wrote: [`etch_${file}`, `etchw_${file}`], windows: out });
  return out;
}
const INJECT = {
  etch_probe_window: { file: 'probe.gui', win: 'probe_window', source: (x = 400) => probeGui(x).replace('"etch_probe_window"', '"probe_window"') },
  etch_topbar: { file: 'topbar.gui', win: 'topbar', source: () => fs.readFileSync(path.join(p2ke, 'topbar.gui'), 'latin1'), maxH: 200 },
  etch_goto_box: { file: 'goto.gui', win: 'goto_box', source: () => fs.readFileSync(path.join(p2ke, 'goto.gui'), 'latin1') },
};

// The probe window: a 300x120 window with the alpha ramp (alpha = column) and a text box with
// antialiased glyph edges; no background sprite, so everything else is the window's transparency.
const probeGui = (x) => ['guiTypes = {', '\twindowType = {', '\t\tname = "etch_probe_window"', `\t\tposition = { x = ${x} y = 300 }`,
  '\t\tsize = { x = 300 y = 120 }', '\t\tmoveable = 0', '\t\ticonType = {', '\t\t\tname = "etch_probe_ramp"', '\t\t\tspriteType = "GFX_etch_ramp"',
  '\t\t\tposition = { x = 20 y = 60 }', '\t\t}', '\t\tinstantTextBoxType = {', '\t\t\tname = "etch_probe_text"',
  '\t\t\tposition = { x = 20 y = 20 }', '\t\t\tfont = "vic_18"', '\t\t\ttext = "ETCH PROBE"', '\t\t\tmaxWidth = 260',
  '\t\t\tmaxHeight = 30', '\t\t}', '\t}', '}', ''].join('\r\n');
const writeProbe = (x) => { fs.writeFileSync(path.join(overlay, 'etch_probe.gui'), probeGui(x), 'latin1'); log({ wrote: 'etch_probe.gui', x }); };

const formFile = path.join(runDir, 'backdrop.json');
const form = () => (fs.existsSync(formFile) ? JSON.parse(fs.readFileSync(formFile, 'utf8')).form : 'btn');
const bd = (c) => `etch_backdrop_${form()}_${c}`;
const FULL = { x: 0, y: 0, w: SCREEN.w, h: SCREEN.h };

// Previewed windows: how the definition gets there, crop height cap.
const WINDOWS = {
  etch_probe_window: { prepare: async () => { writeProbe(400); await cmd('reload etch_probe.gui'); } },
  etch_topbar: { prepare: async () => { writeCopy('topbar.gui'); await cmd('reload etch_topbar.gui'); }, maxH: 200 },
  goto_box: { prepare: async () => {} },  // P2KE's own definition, loaded at startup
  etch_goto_box: { prepare: async () => { writeCopy('goto.gui'); await cmd('reload etch_goto.gui'); } },
};

const phases = {
  async check() {
    for (const c of ['ping', 'state', 'window']) await tongs(c);
    await etch('ping');
    await topLevel('main menu at start');
  },
  async fill() {
    const results = [];
    for (const f of ['btn', 'icon', 'scaled']) {
      const w = `etch_backdrop_${f}_black`;
      await open(w);
      const r = await rect(w);
      await topLevel(`${w} open`);
      const s = await shot(FULL, `fill-${f}-black-full`);
      await close(w);
      const share = s.ok ? shareOf(readBmp(s.file), [0, 0, 0]) : 0;
      results.push({ form: f, rect: r, blackShare: +share.toFixed(5) });
      console.log(`fill ${f}: rect ${JSON.stringify(r)} black ${(share * 100).toFixed(3)} %`);
    }
    const best = results.reduce((a, b) => (b.blackShare > a.blackShare ? b : a));
    await open(`etch_backdrop_${best.form}_white`);
    const s = await shot(FULL, `fill-${best.form}-white-full`);
    await close(`etch_backdrop_${best.form}_white`);
    const whiteShare = s.ok ? shareOf(readBmp(s.file), [255, 255, 255]) : 0;
    log({ result: 'fill', results, chosen: best.form, whiteShare });
    fs.writeFileSync(formFile, JSON.stringify({ form: best.form, results, whiteShare }, null, 2));
    console.log(`chosen ${best.form}; white ${(whiteShare * 100).toFixed(3)} %`);
  },
  async zorder() {
    writeProbe(400);
    await cmd('reload etch_probe.gui');
    const w = 'etch_probe_window';
    const r = cropOf({ x: 400, y: 300, w: 300, h: 120 });
    await open(w); await open(bd('black'));
    await topLevel('preview then backdrop');
    await shot(r, 'zorder-preview-then-backdrop');
    await close(bd('black')); await close(w);
    await open(bd('black')); await open(w);
    await topLevel('backdrop then preview');
    await shot(r, 'zorder-backdrop-then-preview');
    await close(w); await close(bd('black'));
  },
  async windows() {
    const names = rest.length ? rest : Object.keys(WINDOWS);
    for (const w of names) {
      await WINDOWS[w].prepare();
      await open(w);
      const wr = await rect(w);
      if (!wr) { log({ result: 'no rect', window: w }); await close(w); continue; }
      const c = cropOf(wr, 6, WINDOWS[w].maxH ?? 1440);
      log({ result: 'window rect', window: w, rect: wr, crop: c });
      await close(w);
      await shot(c, `${w}-menu-a`); await shot(c, `${w}-menu-b`);
      await open(w);
      await shot(c, `${w}-over-menu-a`); await shot(c, `${w}-over-menu-b`);
      await close(w);
      for (const col of ['black', 'white']) {
        await open(bd(col)); await open(w);
        await shot(c, `${w}-over-${col}-a`); await shot(c, `${w}-over-${col}-b`);
        await close(w); await close(bd(col));
      }
    }
  },
  async cycle() {
    const w = 'etch_probe_window';
    const c = { x: 154, y: 290, w: 792, h: 140 };  // covers every x below plus a margin
    await open(bd('black'));
    for (let i = 0; i < 10; i++) {
      const x = 400 + (i % 2 ? -60 : 60) * ((i >> 1) % 3 + 1);
      writeProbe(x);
      const t0 = performance.now();
      await close(w); await cmd('reload etch_probe.gui'); const o = await open(w);
      const t1 = performance.now();
      const s = await shot(c, `cycle${i}-x${x}`);
      const row = { result: 'cycle', i, x, job_roundtrip_ms: +(t1 - t0).toFixed(1), with_capture_ms: +(performance.now() - t0).toFixed(1), job_frame: o.frame, capture_frame: s.frame };
      log(row); console.log(JSON.stringify(row));
    }
    // Dual jobs: the same window over black, then over white, one crop each.
    const r = cropOf({ x: 400, y: 300, w: 300, h: 120 });
    writeProbe(400); await close(w); await cmd('reload etch_probe.gui'); await open(w);
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await close(w); await close(bd('white')); await open(bd('black')); await open(w);
      const b = await shot(r, `dual${i}-black`);
      await close(w); await close(bd('black')); await open(bd('white')); await open(w);
      const wh = await shot(r, `dual${i}-white`);
      const row = { result: 'dual', i, both_ms: +(performance.now() - t0).toFixed(1), frames: [b.frame, wh.frame] };
      log(row); console.log(JSON.stringify(row));
    }
    await close(w); await close(bd('white')); await close(bd('black'));
    await etch('ping');
  },
  // The backdrop inside the copy: per window, menu alone and the plain copy over the menu, then the
  // black and white injected copies (the second open replaces the first).
  async inject() {
    const names = rest.length ? rest : Object.keys(INJECT);
    for (const w of names) {
      const t = INJECT[w];
      // Plain copy first (as the windows phase), for the rect and the over-menu captures.
      const { text } = prefixTopLevel(t.source(), 'etch_');
      fs.writeFileSync(path.join(overlay, `etch_${t.file}`), text, 'latin1');
      await cmd(`reload etch_${t.file}`);
      await open(w);
      const wr = await rect(w);
      const c = cropOf(wr, 6, t.maxH ?? 1440);
      log({ result: 'window rect', window: w, rect: wr, crop: c });
      await close(w);
      await shot(c, `${w}-menu-a`); await shot(c, `${w}-menu-b`);
      await open(w);
      await shot(c, `${w}-over-menu-a`); await shot(c, `${w}-over-menu-b`);
      await close(w);
      const v = writeInjected(t.file, t.win, t.source());
      await cmd(`reload etch_${t.file}`); await cmd(`reload etchw_${t.file}`);
      await open(v.black);
      log({ result: 'injected rect', window: v.black, rect: await rect(v.black) });
      await shot(c, `${w}-over-black-a`); await shot(c, `${w}-over-black-b`);
      await open(v.white);
      await topLevel(`${v.white} open after ${v.black}`);
      await shot(c, `${w}-over-white-a`); await shot(c, `${w}-over-white-b`);
      await close(v.white);
    }
  },
  // Jobs with the backdrop inside the copy: 10 x (edit -> close -> reload -> open -> crop), then
  // 5 dual captures (open the black copy, crop, open the white copy, crop).
  async injectcycle() {
    const t = INJECT.etch_probe_window;
    const c = { x: 154, y: 290, w: 792, h: 140 };
    for (let i = 0; i < 10; i++) {
      const x = 400 + (i % 2 ? -60 : 60) * ((i >> 1) % 3 + 1);
      const v = writeInjected(t.file, t.win, t.source(x));
      const t0 = performance.now();
      await close(v.black); await cmd(`reload etch_${t.file}`); const o = await open(v.black);
      const t1 = performance.now();
      const s = await shot(c, `cycle${i}-x${x}`);
      const row = { result: 'cycle', i, x, job_roundtrip_ms: +(t1 - t0).toFixed(1), with_capture_ms: +(performance.now() - t0).toFixed(1), job_frame: o.frame, capture_frame: s.frame };
      log(row); console.log(JSON.stringify(row));
    }
    const v = writeInjected(t.file, t.win, t.source(400));
    await cmd(`reload etch_${t.file}`); await cmd(`reload etchw_${t.file}`);
    const r = cropOf({ x: 400, y: 300, w: 300, h: 120 });
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await open(v.black); const b = await shot(r, `dual${i}-black`);
      await open(v.white); const wh = await shot(r, `dual${i}-white`);
      const row = { result: 'dual', i, both_ms: +(performance.now() - t0).toFixed(1), frames: [b.frame, wh.frame] };
      log(row); console.log(JSON.stringify(row));
    }
    await close(v.white);
    await etch('ping');
  },
  // The wrapper: as inject, but the black and white copies wrap the window.
  async wrap() {
    const names = rest.length ? rest : Object.keys(INJECT);
    for (const w of names) {
      const t = INJECT[w];
      const { text } = prefixTopLevel(t.source(), 'etch_');
      fs.writeFileSync(path.join(overlay, `etch_${t.file}`), text, 'latin1');
      await cmd(`reload etch_${t.file}`);
      await open(w);
      const wr = await rect(w);
      const c = cropOf(wr, 6, t.maxH ?? 1440);
      log({ result: 'window rect', window: w, rect: wr, crop: c });
      await close(w);
      await shot(c, `${w}-menu-a`); await shot(c, `${w}-menu-b`);
      await open(w);
      await shot(c, `${w}-over-menu-a`); await shot(c, `${w}-over-menu-b`);
      await close(w);
      const v = writeWrapped(t.file, t.win, t.source());
      await cmd(`reload etch_${t.file}`); await cmd(`reload etchw_${t.file}`);
      await open(v.black);
      log({ result: 'wrapped rect', window: v.blackInner, rect: await rect(v.blackInner), wrapper: await rect(v.black) });
      await shot(c, `${w}-over-black-a`); await shot(c, `${w}-over-black-b`);
      await open(v.white);
      await topLevel(`${v.white} open after ${v.black}`);
      await shot(c, `${w}-over-white-a`); await shot(c, `${w}-over-white-b`);
      await close(v.white);
    }
  },
  // Jobs with the wrapper, always close -> reload -> open: 10 x edit, then 5 dual jobs (close,
  // reload both copies, open black, crop, open white, crop).
  async wrapcycle() {
    const t = INJECT.etch_probe_window;
    const c = { x: 154, y: 290, w: 792, h: 140 };
    let v;
    for (let i = 0; i < 10; i++) {
      const x = 400 + (i % 2 ? -60 : 60) * ((i >> 1) % 3 + 1);
      v = writeWrapped(t.file, t.win, t.source(x));
      const t0 = performance.now();
      await close(v.black); await cmd(`reload etch_${t.file}`); const o = await open(v.black);
      const t1 = performance.now();
      const s = await shot(c, `cycle${i}-x${x}`);
      const row = { result: 'cycle', i, x, job_roundtrip_ms: +(t1 - t0).toFixed(1), with_capture_ms: +(performance.now() - t0).toFixed(1), job_frame: o.frame, capture_frame: s.frame };
      log(row); console.log(JSON.stringify(row));
    }
    const r = cropOf({ x: 400, y: 300, w: 300, h: 120 });
    for (let i = 0; i < 5; i++) {
      v = writeWrapped(t.file, t.win, t.source(400));
      const t0 = performance.now();
      await close(v.black); await close(v.white);
      await cmd(`reload etch_${t.file}`); await cmd(`reload etchw_${t.file}`);
      await open(v.black); const b = await shot(r, `dual${i}-black`);
      await open(v.white); const wh = await shot(r, `dual${i}-white`);
      const row = { result: 'dual', i, job_with_both_captures_ms: +(performance.now() - t0).toFixed(1), frames: [b.frame, wh.frame] };
      log(row); console.log(JSON.stringify(row));
    }
    await close(v.white);
    await etch('ping');
  },
  // The green FPS counter top right: does the console's fps command turn it off?
  async fps() {
    const r = { x: 3340, y: 0, w: 100, h: 24 };
    await shot(r, 'fps-before');
    await cmd('fps'); await shot(r, 'fps-after-1');
    await cmd('fps'); await shot(r, 'fps-after-2');
  },
  async frontend() {
    await shot(FULL, 'frontend-before-full');
    const tops = await topLevel('before closing');
    for (const t of tops) {
      const n = t.path ?? t.name;
      if (n && !n.startsWith('etch_')) await close(n);
    }
    await topLevel('after closing');
    await shot(FULL, 'frontend-closed-full');
    await etch('ping');
  },
  async raw() {
    for (const c of rest) console.log(JSON.stringify(c.startsWith('etch:') ? await etch(c.slice(5)) : await tongs(c)).slice(0, 3000));
  },
};
if (!phases[phase]) throw new Error(`unknown phase ${phase}`);
// Captures of later phases continue the numbering.
shotNo = fs.readdirSync(captures).filter((f) => f.endsWith('.bmp')).length;
await phases[phase]();
process.exit(0);
