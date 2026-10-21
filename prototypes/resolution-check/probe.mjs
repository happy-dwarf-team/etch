// PROTOTYPE for happy-dwarf-team/etch#18, throwaway, never merged. Run by host.ps1 once the game
// is ready: reads the client area, the main menu's if_resolution widgets, two screenshots of the
// menu, opens the probe window by console, reads its widgets, takes two screenshots and one
// back-buffer capture of it. Everything is logged to <runDir>/probe.jsonl and probe.json.
//
//   node probe.mjs <runDir> <width> <height>
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const [runDir, w, h] = process.argv.slice(2);
const logFile = path.join(runDir, 'probe.jsonl');
const log = (e) => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const call = async (line) => {
    const answer = await new Promise((ok) => { waiting.push(ok); sock.write(line + '\n'); });
    let a; try { a = JSON.parse(answer); } catch { a = { raw: answer }; }
    log({ pipe: name, line, answer: a });
    console.log(`${a.ok === false ? 'ERR' : 'ok '} ${name} ${line.slice(0, 80)} ${JSON.stringify(a).slice(0, 160)}`);
    return a;
  };
  call.close = () => sock.end();
  return call;
}

const tongs = await client('tongs');
const etch = await client('etch-proto');
const out = { requested: { width: +w, height: +h } };
out.ping = await tongs('ping');
out.window = await tongs('window');
out.menu = {};
for (const n of ['version_background', 'version_label', 'background', 'frontend_links', 'login_logout_button', 'epic_button',
  'settings_button', 'exit_button', 'credits_button', 'tutorial_button']) {
  const a = await tongs(`ui find //${n} all`);
  out.menu[n] = (a.matches ?? []).map((m) => ({ path: m.path, visible: m.visible, rect: m.rect }));
}
out.menuShots = [];
for (const n of ['menu-a', 'menu-b']) { out.menuShots.push(await tongs(`screenshot ${n}`)); await sleep(300); }
out.open = await tongs('console window open etch_res_window');
await tongs('frames');
await sleep(1000);
out.probe = {};
const tree = await tongs('ui tree etch_res_window limit=200 all');
out.probeTree = tree;
for (const t of [750, 868, 900, 1048, 1052, 1080]) {
  for (const k of ['max', 'min']) {
    const a = await tongs(`ui find etch_res_window/etch_res_${k}_${t} all`);
    out.probe[`${k}_${t}`] = a.matches?.[0]?.rect ?? null;
  }
}
for (const n of ['etch_res_button', 'etch_res_version_bg', 'etch_res_text', 'etch_res_panel', 'etch_res_ramp']) {
  const a = await tongs(`ui find etch_res_window/${n} all`);
  out.probe[n] = a.matches?.[0]?.rect ?? null;
}
out.probeShots = [];
for (const n of ['probe-a', 'probe-b']) { out.probeShots.push(await tongs(`screenshot ${n}`)); await sleep(300); }
out.capture = await etch(`capture full 0 0 ${out.window.width} ${out.window.height} ${path.join(runDir, 'probe-backbuffer.bmp')}`);
out.windowAfter = await tongs('window');
fs.writeFileSync(path.join(runDir, 'probe.json'), JSON.stringify(out, null, 2));
tongs.close(); etch.close();
