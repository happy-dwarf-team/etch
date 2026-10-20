// PROTOTYPE for happy-dwarf-team/etch#6, throwaway. Drives a running EU4 1.37.5 through Tongs'
// pipe (\\.\pipe\tongs, game_calls and input on) to answer: can the game reload a changed .gui
// window, how long does it take, and what goes stale. Edits only the probe mod made by session.ps1.
//
//   node probe.mjs <phase> <runDir>
//
// Phases (run one at a time, look at the log between them):
//   check   ping, state, window, frames
//   cycle   window open goto_box -> edit -> window close -> reload goto.gui -> window open (x5)
//   newfile a .gui file created while the game runs, reloaded and opened
//   hud     outliner.gui (registered, rebuilt by the in-game idler) reloaded while visible (x5)
//   texture topbar_UL.dds tinted, then reloadtexture
//   gfx     a .gfx file with a new spriteType created while running, used by a reloaded .gui
//   topbar  topbar.gui (registered file, but the topbar window is not in the idler's rebuild list)
//   diplo   countrydiplomacyview.gui (not registered) reloaded with the window open, then the
//           country view tab, then reloadinterface
// Every request and answer goes to <runDir>/probe.jsonl with the client round trip.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const [phase, runDir] = process.argv.slice(2);
if (!phase || !runDir) throw new Error('usage: node probe.mjs <phase> <runDir>');
const mod = path.join(os.homedir(), 'Documents', 'Paradox Interactive', 'Europa Universalis IV', 'mod', 'etch-reload-probe');
const logFile = path.join(runDir, 'probe.jsonl');

// --- pipe client: one JSON line per request ------------------------------------------------------
const sock = net.connect('\\\\.\\pipe\\tongs');
await new Promise((ok, fail) => { sock.once('connect', ok); sock.once('error', fail); });
let buf = '';
const waiting = [];
sock.on('data', (d) => {
  buf += d.toString('utf8');
  let i;
  while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); waiting.shift()?.(line); }
});
sock.on('close', () => { for (const w of waiting.splice(0)) w(JSON.stringify({ ok: false, error: 'pipe closed' })); });

function log(entry) { fs.appendFileSync(logFile, JSON.stringify({ phase, at: new Date().toISOString(), ...entry }) + '\n'); }
async function send(line, note) {
  const t0 = performance.now();
  const answer = await new Promise((ok) => { waiting.push(ok); sock.write(line + '\n'); });
  const ms = +(performance.now() - t0).toFixed(1);
  let a; try { a = JSON.parse(answer); } catch { a = { raw: answer }; }
  log({ line, note, roundtrip_ms: ms, answer: a });
  const brief = a.command === 'console' ? `text=${JSON.stringify(a.text)} queued=${a.queued_ms} run=${a.run_ms} frame=${a.frame}` : '';
  console.log(`${a.ok ? 'ok ' : 'ERR'} ${ms.toString().padStart(7)} ms  ${line}  ${brief}${a.ok ? '' : ' ' + JSON.stringify(a).slice(0, 300)}`);
  return a;
}
const cmd = (c) => send(`console ${c}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rect(sel) {
  const a = await send(`ui find ${sel} all`);
  const m = a.matches?.[0];
  return m ? { ...m.rect, visible: m.visible, count: a.count } : null;
}
// The longest frame gap since the previous `frames`: call once before (reset), once after.
async function frames(note) { const a = await send('frames', note); return a.longest_gap_ms ?? a.gap_max_ms ?? a; }

// --- edits of the probe mod's copies ---------------------------------------------------------------
// Adds dx to the x of the first `position = { x = N` after `name = "<child>"`.
function shift(rel, child, dx) {
  const file = path.join(mod, rel);
  const text = fs.readFileSync(file, 'latin1');
  const at = text.search(new RegExp(`name\\s*=\\s*"${child}"`));
  if (at < 0) throw new Error(`${child} not in ${rel}`);
  const re = /position\s*=\s*\{\s*x\s*=\s*(-?\d+)/g;
  re.lastIndex = at;
  const m = re.exec(text);
  const x = +m[1] + dx;
  const out = text.slice(0, m.index) + m[0].replace(/-?\d+$/, String(x)) + text.slice(m.index + m[0].length);
  fs.writeFileSync(file, out, 'latin1');
  log({ edit: rel, child, dx, newX: x });
  return x;
}
const shot = (name) => send(`screenshot etch6-${phase}-${name}`);

// --- phases ----------------------------------------------------------------------------------------
const phases = {
  async check() {
    for (const c of ['ping', 'state', 'window', 'frames', 'help']) await send(c);
  },

  // Ad-hoc lines: node probe.mjs raw <runDir> 'pause' 'ui find topbar'
  async raw() {
    for (const c of process.argv.slice(4)) console.log(JSON.stringify(await send(c)).slice(0, 1500));
  },

  async cycle() {
    await cmd('window open goto_box');
    const r0 = await rect('goto_box/provinces');
    await shot('before');
    for (let i = 0; i < 5; i++) {
      const dx = i % 2 === 0 ? 40 : -40;
      shift('interface/goto.gui', 'provinces', dx);
      await frames('reset');
      const t0 = performance.now();
      await cmd('window close goto_box');
      await cmd('reload goto.gui');
      await cmd('window open goto_box');
      const cycle = +(performance.now() - t0).toFixed(1);
      const gap = await frames('after cycle');
      const r = await rect('goto_box/provinces');
      log({ result: 'cycle', i, dx, cycle_roundtrip_ms: cycle, gap, rect: r, base: r0 });
      console.log(`cycle ${i}: dx=${dx} x=${r?.x} (base ${r0?.x}) roundtrip=${cycle} ms gap=${JSON.stringify(gap)}`);
      if (i === 0) await shot('after-1');
    }
    await cmd('window close goto_box');
  },

  async newfile() {
    const rel = 'interface/etch_probe.gui';
    fs.writeFileSync(path.join(mod, rel), [
      'guiTypes = {', '\twindowType = {', '\t\tname = "etch_probe_window"', '\t\tposition = { x = 400 y = 300 }',
      '\t\tsize = { x = 300 y = 120 }', '\t\tmoveable = 1', '\t\tinstantTextBoxType = {', '\t\t\tname = "etch_probe_text"',
      '\t\t\tposition = { x = 20 y = 20 }', '\t\t\tfont = "vic_18"', '\t\t\ttext = "ETCH PROBE"', '\t\t\tmaxWidth = 260',
      '\t\t\tmaxHeight = 30', '\t\t}', '\t}', '}', ''].join('\r\n'), 'latin1');
    await cmd('window open etch_probe_window');
    await cmd('reload etch_probe.gui');
    await cmd('window open etch_probe_window');
    console.log('rect', JSON.stringify(await rect('etch_probe_window/etch_probe_text')));
    await shot('open');
    await cmd('window close etch_probe_window');
  },

  async hud() {
    const r0 = await rect('outliner/outliner_top');
    for (let i = 0; i < 5; i++) {
      const dx = i % 2 === 0 ? 30 : -30;
      shift('interface/outliner.gui', 'outliner_top', dx);
      await frames('reset');
      const a = await cmd('reload outliner.gui');
      const gap = await frames('after reload');
      const r = await rect('outliner/outliner_top');
      log({ result: 'hud', i, dx, run_ms: a.run_ms, gap, rect: r, base: r0 });
      console.log(`hud ${i}: dx=${dx} x=${r?.x} (base ${r0?.x}) run=${a.run_ms} gap=${JSON.stringify(gap)}`);
      if (i === 0) await shot('after-1');
    }
    // The outliner's own button still works after the rebuild (re-bound by the idler)?
    await send('ui click outliner/button_outliner_options');
    await shot('options');
    await send('key escape');
  },

  async texture() {
    const rel = 'gfx/interface/topbar_UL.dds';
    await shot('before');
    // Tint the probe copy (ImageMagick): a change no one can miss.
    execFileSync('magick', [path.join(mod, rel), '-channel', 'RGB', '-negate', '-define', 'dds:compression=none', '-define', 'dds:mipmaps=0', path.join(mod, rel)]);
    log({ edit: rel, how: 'negate RGB' });
    for (const name of ['gfx//interface//topbar_UL.tga', 'gfx/interface/topbar_UL.tga', 'gfx/interface/topbar_UL.dds', 'topbar_UL.dds']) {
      await frames('reset');
      const a = await cmd(`reloadtexture ${name}`);
      const gap = await frames('after');
      console.log(`reloadtexture ${name}: ${a.text} gap=${JSON.stringify(gap)}`);
      if (/reloaded/i.test(a.text ?? '')) break;
    }
    await sleep(300);
    await shot('after');
  },

  async gfx() {
    fs.mkdirSync(path.join(mod, 'interface'), { recursive: true });
    fs.writeFileSync(path.join(mod, 'interface/etch_probe.gfx'), [
      'spriteTypes = {', '\tspriteType = {', '\t\tname = "GFX_etch_probe"',
      '\t\ttexturefile = "gfx//interface//topbar_UL.tga"', '\t}', '}', ''].join('\r\n'), 'latin1');
    // Add an icon with the new sprite to the probe window.
    const file = path.join(mod, 'interface/etch_probe.gui');
    const text = fs.readFileSync(file, 'latin1');
    fs.writeFileSync(file, text.replace('\t\tinstantTextBoxType = {',
      '\t\ticonType = {\r\n\t\t\tname = "etch_probe_icon"\r\n\t\t\tspriteType = "GFX_etch_probe"\r\n\t\t\tposition = { x = 0 y = 40 }\r\n\t\t}\r\n\t\tinstantTextBoxType = {'), 'latin1');
    await cmd('reload etch_probe.gfx');
    await cmd('reload interface/etch_probe.gfx');
    await cmd('reload etch_probe.gui');
    await cmd('window open etch_probe_window');
    console.log('icon', JSON.stringify(await rect('etch_probe_window/etch_probe_icon')));
    await shot('open');
    await cmd('window close etch_probe_window');
  },

  async topbar() {
    const r0 = await rect('topbar/brown_bg');
    await shot('before');
    shift('interface/topbar.gui', 'brown_bg', 200);
    await frames('reset');
    const a = await cmd('reload topbar.gui');
    const gap = await frames('after reload');
    await sleep(500);
    await shot('after');
    // The game keeps drawing? Hover over the topbar (tooltips read widget data).
    await send('move 300 30'); await sleep(800); await send('move 900 30'); await sleep(800);
    await shot('hover');
    await send('release');
    const g2 = await frames('after hover');
    log({ result: 'topbar', run_ms: a.run_ms, gap, g2, base: r0 });
    // Last: a tree read walks every widget's definition (+0xB0 -> name), stale ones included.
    console.log('after', JSON.stringify(await rect('topbar/brown_bg')), 'base', JSON.stringify(r0));
  },

  // Run 2. Run 1 crashed inside a Tongs tree read (`ui find`) after the topbar reload, so from here
  // on no tree read follows a reload that may leave stale widgets: click points are read first,
  // and the game alone is exercised (frames, hover, clicks, a month at speed 5). The tree read
  // comes last, as a canary.
  async diplo() {
    await send('key f1'); await sleep(1000);
    const tab = (await send('ui find countryview//tab_diplomacy')).matches?.[0]?.click_point;
    await send(`click ${tab.x} ${tab.y}`); await sleep(1000);
    await shot('tab-before');
    await send('key escape'); await sleep(500);
    await cmd('window open countrydiplomacyview'); await sleep(500);
    await shot('open');
    shift('interface/countrydiplomacyview.gui', 'topGold', 150);
    await frames('reset');
    const a = await cmd('reload countrydiplomacyview.gui');
    const gap = await frames('after reload (window kept open)');
    log({ result: 'diplo-reload', run_ms: a.run_ms, gap });
    await sleep(500);
    await shot('stale-open');
    await send('move 300 400'); await sleep(800);
    await shot('stale-hover');
    await send('release');
    await frames('after hover on the stale window');
    await cmd('window close countrydiplomacyview');
    await frames('after close of the stale window');
    // The country view's diplomacy tab was built at load from the old definitions.
    await send('key f1'); await sleep(1000);
    await send(`click ${tab.x} ${tab.y}`); await sleep(1000);
    await shot('tab-stale');
    await frames('after opening the stale tab');
    await send('key escape'); await sleep(500);
    await frames('reset');
    const b = await cmd('reloadinterface');
    const gap2 = await frames('after reloadinterface');
    log({ result: 'reloadinterface', run_ms: b.run_ms, gap: gap2 });
    await send('key f1'); await sleep(1000);
    await send(`click ${tab.x} ${tab.y}`); await sleep(1000);
    await shot('tab-after-reloadinterface');
    await frames('after opening the rebuilt tab');
    await send('key escape'); await sleep(500);
    await runMonth();
    await shot('after-month');
    console.log('canary', JSON.stringify(await rect('countryview//topGold')));
  },

  async topbar2() {
    const found = (await send('ui find topbar//[type=button] limit=60')).matches ?? [];
    const buttons = found.filter((m) => m.visible).slice(0, 4);
    log({ buttons: buttons.map((b) => [b.path, b.click_point]) });
    await shot('before');
    shift('interface/topbar.gui', 'brown_bg', 200);
    await frames('reset');
    const a = await cmd('reload topbar.gui');
    const gap = await frames('after reload');
    log({ result: 'topbar2-reload', run_ms: a.run_ms, gap });
    await sleep(500);
    await shot('after');
    for (const x of [100, 300, 600, 900, 1200]) { await send(`move ${x} 30`); await sleep(500); }
    await send('release');
    await frames('after hover');
    for (const [i, b] of buttons.entries()) {
      await send(`click ${b.click_point.x} ${b.click_point.y}`); await sleep(1000);
      await shot(`click-${i}`);
      await send('key escape'); await sleep(500);
      await frames(`after click ${b.path}`);
    }
    await runMonth();
    await shot('after-month');
    console.log('canary', JSON.stringify(await rect('topbar/brown_bg')));
  },
};

// One game month at speed 5, then paused again: daily and monthly updates refresh the views.
async function runMonth() {
  const s = await send('state');
  const [y, m, d] = s.date.split('.').map(Number);
  const to = m === 12 ? `${y + 1}.1.${d}` : `${y}.${m + 1}.${d}`;
  await frames('reset');
  await send(`run_until ${to} speed=5 timeout=120 events=first`);
  await frames('after a month');
}

if (!phases[phase]) throw new Error(`unknown phase ${phase}`);
try { await phases[phase](); } finally { sock.end(); }
