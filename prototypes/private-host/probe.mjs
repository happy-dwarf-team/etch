// PROTOTYPE for happy-dwarf-team/etch#21, throwaway, never merged. Drives the game host started by
// host.ps1 through two pipes: Tongs (\\.\pipe\tongs, patched to run console calls in the main menu)
// and etch-capture (\\.\pipe\etch-proto). Writes preview copies into the overlay mod only.
//
//   node probe.mjs <phase> <runDir> [args...]
//
//   check     Tongs ping/state, etch-capture ping
//   newfile   a preview copy created while the game runs (with Bellows): window open before and
//             after reload, its rect, full and crop captures
//   topbar    a preview copy of P2KE's topbar.gui with prefixed top-level names, opened in the
//             main menu, captured
//   cycle     10 x (edit -> window close -> reload -> window open -> capture crop), timed
//   capture   20 captures of the last window, alternating full and crop, timed
//   raw       ad-hoc Tongs lines; etch:<line> goes to etch-capture
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
      : a.command === 'capture' ? `frame ${a.frame_at_request}->${a.frame} wait=${a.wait_ms} prep=${a.prep_ms} readback=${a.readback_ms} copy=${a.copy_ms} write=${a.write_ms} fg=${a.foreground}` : '';
    console.log(`${a.ok ? 'ok ' : 'ERR'} ${String(ms).padStart(7)} ms  ${line.slice(0, 90)}  ${brief}${a.ok ? '' : ' ' + JSON.stringify(a).slice(0, 300)}`);
    return a;
  };
}
const tongs = await client('tongs');
const etch = await client('etch-proto');
const cmd = (c) => tongs(`console ${c}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rect(sel) {
  const a = await tongs(`ui find ${sel} all`);
  const m = a.matches?.[0];
  return m ? m.rect : null;
}
let shotNo = 0;
const shot = (mode, r, name) => etch(`capture ${mode} ${r.x} ${r.y} ${r.w ?? r.width} ${r.h ?? r.height} ${path.join(captures, `${String(++shotNo).padStart(3, '0')}-${name}-${mode}.bmp`)}`);
const FULL = { x: 0, y: 0, w: 3440, h: 1440 };

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

const probeGui = (x) => ['guiTypes = {', '\twindowType = {', '\t\tname = "etch_probe_window"', `\t\tposition = { x = ${x} y = 300 }`,
  '\t\tsize = { x = 300 y = 120 }', '\t\tmoveable = 1', '\t\ticonType = {', '\t\t\tname = "etch_probe_bg"', '\t\t\tspriteType = "GFX_tile_bg"',
  '\t\t\tposition = { x = 0 y = 0 }', '\t\t}', '\t\tinstantTextBoxType = {', '\t\t\tname = "etch_probe_text"',
  '\t\t\tposition = { x = 20 y = 20 }', '\t\t\tfont = "vic_18"', '\t\t\ttext = "ETCH PROBE"', '\t\t\tmaxWidth = 260',
  '\t\t\tmaxHeight = 30', '\t\t}', '\t}', '}', ''].join('\r\n');

const phases = {
  async check() {
    for (const c of ['ping', 'state', 'window']) await tongs(c);
    await etch('ping');
  },
  async newfile() {
    await cmd('window open etch_probe_window');  // expected to fail: the file does not exist yet
    fs.writeFileSync(path.join(overlay, 'etch_probe.gui'), probeGui(400), 'latin1');
    log({ wrote: 'etch_probe.gui', x: 400 });
    await cmd('reload etch_probe.gui');
    await cmd('window open etch_probe_window');
    const r = await rect('etch_probe_window');
    log({ result: 'newfile rect', rect: r });
    await shot('full', FULL, 'newfile');
    if (r) { await shot('crop', r, 'newfile'); await shot('full', r, 'newfile'); }
    await etch('ping');
  },
  async topbar() {
    const src = fs.readFileSync(path.join(p2ke, 'topbar.gui'), 'latin1');
    const { text, names } = prefixTopLevel(src, 'etch_');
    fs.writeFileSync(path.join(overlay, 'etch_topbar.gui'), text, 'latin1');
    log({ wrote: 'etch_topbar.gui', renamed: names });
    console.log('renamed', names.join(', '));
    await cmd('reload etch_topbar.gui');
    await cmd('window open etch_topbar');
    const r = await rect('etch_topbar');
    log({ result: 'topbar rect', rect: r });
    await shot('full', FULL, 'topbar');
    if (r) await shot('crop', { x: r.x, y: Math.max(0, r.y), w: r.w ?? r.width, h: r.h ?? r.height }, 'topbar');
    await etch('ping');
  },
  async cycle() {
    for (let i = 0; i < 10; i++) {
      const x = 400 + (i % 2 ? -60 : 60) * ((i >> 1) % 3 + 1);
      fs.writeFileSync(path.join(overlay, 'etch_probe.gui'), probeGui(x), 'latin1');
      const t0 = performance.now();
      const a = await cmd('window close etch_probe_window');
      const b = await cmd('reload etch_probe.gui');
      const c = await cmd('window open etch_probe_window');
      const t1 = performance.now();
      const s = await shot('crop', { x: x - 20, y: 280, w: 340, h: 160 }, `cycle${i}-x${x}`);
      const t2 = performance.now();
      const row = { result: 'cycle', i, x, job_roundtrip_ms: +(t1 - t0).toFixed(1), capture_roundtrip_ms: +(t2 - t1).toFixed(1),
        run_ms: [a.run_ms, b.run_ms, c.run_ms], job_frame: c.frame, capture_frame: s.frame, drawn_after_job: s.frame >= c.frame };
      log(row);
      console.log(JSON.stringify(row));
    }
  },
  async capture() {
    const sel = rest[0] ?? 'etch_probe_window';
    const r = (await rect(sel)) ?? { x: 380, y: 280, w: 340, h: 160 };
    for (let i = 0; i < 20; i++) await shot(i % 2 ? 'crop' : 'full', r, `rep${i}`);
    await etch('ping');
  },
  async raw() {
    for (const c of rest) console.log(JSON.stringify(c.startsWith('etch:') ? await etch(c.slice(5)) : await tongs(c)).slice(0, 2000));
  },
};
if (!phases[phase]) throw new Error(`unknown phase ${phase}`);
await phases[phase]();
process.exit(0);
