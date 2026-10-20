// PROTOTYPE (etch#9): automated run inside a real VS Code (launched by run-vscode.ts). Throwaway.
// 1. S3TC and GPU facts from the webview. 2. Capture of the main menu for the comparison.
// 3. Cold open and warm reload of vanilla countrydiplomacyview.gui from the unsaved buffer.
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PNG } from 'pngjs';
import { config } from '../tools/config';
import { rootsFromPlayset } from '../core/files';
import { Session } from '../core/session';
import type { Preview as PreviewT, Drawn } from './extension';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const OUT = process.env.ETCH_OUT!;
const log = (...a: unknown[]) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.log('[etch-proto]', s); fs.appendFileSync(path.join(OUT, 'suite.log'), s + '\n'); };

function savePng(d: Drawn, file: string) {
  const png = new PNG({ width: d.msg.w, height: d.msg.h }); png.data = Buffer.from(d.msg.capture, 'base64');
  fs.writeFileSync(file, PNG.sync.write(png));
}

function chain(d: Drawn) {
  const m = d.msg; const hostMs = Object.values(d.host).reduce((a, b) => a + b, 0);
  return {
    changeToPixels: m.tPixels - d.tChange, fireToPixels: m.tPixels - d.tFire, changeToFrame: m.tFrame - d.tChange,
    debounce: d.tFire - d.tChange, host: hostMs, parse: d.host.parse, layout: d.host.layout, serialize: d.host.serialize, post: d.host.post,
    transit: m.tRecv - d.tFire - hostMs, webviewJson: m.tParsed - m.tRecv, textures: m.tTex - m.tParsed, drawGpu: m.tPixels - m.tTex, toFrame: m.tFrame - m.tPixels,
    bytes: d.postBytes, tex: m.tex,
  };
}
const stat = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: s.length, min: s[0], median: q(0.5), p95: q(0.95), max: s[s.length - 1] }; };

async function copyOpen(src: string, name: string) {
  const dst = path.join(OUT, name); fs.copyFileSync(src, dst);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(dst));
  const ed = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  return { doc, ed };
}

async function warm(p: PreviewT, ed: vscode.TextEditor, needle: string, a: string, b: string, n: number) {
  const text = ed.document.getText(); const at = text.indexOf(needle); if (at < 0) throw new Error(`needle ${needle} not found`);
  const off = at + needle.indexOf(a);
  const out: ReturnType<typeof chain>[] = [];
  for (let i = 0; i < n; i++) {
    const done = new Promise<Drawn>(res => { p.onDrawn = d => { if (d.trigger === 'change') res(d); }; });
    const [from, to] = i % 2 === 0 ? [a, b] : [b, a];
    const r = new vscode.Range(ed.document.positionAt(off), ed.document.positionAt(off + from.length));
    await ed.edit(e => e.replace(r, to));
    const d = await done; out.push(chain(d));
    await sleep(150);
  }
  return out;
}

export async function run() {
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'suite.log'), '');
  const ext = vscode.extensions.getExtension('happy-dwarf-team.etch-prototype-offline-render')!;
  const api = await ext.activate() as { Preview: typeof PreviewT; ctx: vscode.ExtensionContext };
  const cfg = config();
  const results: any = { vscode: vscode.version, electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, when: new Date().toISOString() };

  // --- 1+2: main menu, full playset, 3440×1440 like the Tongs capture
  {
    const files = new Session(cfg.roots).files;
    const src = files.resolve('interface/frontend.gui')!;
    log('roots', cfg.roots.map(r => r.name), 'user', cfg.user, 'home', require('node:os').homedir(), 'USERPROFILE', process.env.USERPROFILE);
    log('frontend.gui from', src.replace(/^.*[\\/]236850[\\/]/, 'workshop/'));
    const { doc, ed } = await copyOpen(src, 'frontend.gui');
    const sample = JSON.parse(fs.readFileSync(path.join(ext.extensionPath, 'samples', 'mainmenu.json'), 'utf8'));
    const p = new api.Preview(api.ctx, doc, { window: 'country_selection_panel/mainmenu', screen: { w: 3440, h: 1440 }, sample, roots: cfg.roots });
    const d0 = await p.open();
    results.webview = p.info;
    log('webview', { ua: p.info.userAgent, renderer: p.info.renderer, s3tc: p.info.extensions.includes('WEBGL_compressed_texture_s3tc'), s3tcCheck: p.info.s3tcCheck });
    results.mainmenu = { cold: { ...p.cold }, first: chain(d0) };
    results.dxtCheck = await p.dxtCheck(JSON.parse(fs.readFileSync(path.join(ext.extensionPath, 'samples', 'dxt-check.json'), 'utf8')));
    log('dxtCheck', results.dxtCheck);
    for (const [name, half] of [['render-mainmenu.png', false], ['render-mainmenu-halfpixel.png', true]] as const) {
      p.opt.halfPixel = half; const d = await p.redraw(true); savePng(d, path.join(OUT, name));
    }
    p.opt.halfPixel = false;
    const r = p.session.render(doc.getText(), p.opt.window, p.opt.screen, sample);
    fs.writeFileSync(path.join(OUT, 'mainmenu.drawlist.json'), JSON.stringify(r.list));
    results.mainmenu.warm = await warm(p, ed, 'position = { x = 419 y = -42 }', '419', '420', 20);
    p.dispose(); await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    log('mainmenu warm', stat(results.mainmenu.warm.map((x: any) => x.changeToPixels)));
  }

  // --- 3: vanilla budget window
  {
    const roots = rootsFromPlayset(cfg.game, undefined);
    const src = path.join(cfg.game, 'interface', 'countrydiplomacyview.gui');
    const { doc, ed } = await copyOpen(src, 'countrydiplomacyview.gui');
    const colds: any[] = [];
    let p: PreviewT | undefined;
    for (let i = 0; i < 6; i++) {
      p?.dispose(); await sleep(300);
      p = new api.Preview(api.ctx, doc, { window: 'countrydiplomacyview', screen: { w: 1920, h: 1080 }, roots });
      const d = await p.open();
      colds.push({ ...p.cold, first: chain(d) });
      log('cold', i, p.cold.total.toFixed(1), JSON.stringify(p.cold));
    }
    results.diplo = { colds, info: p!.info.renderer };
    const d = await p!.redraw(true); savePng(d, path.join(OUT, 'render-countrydiplomacyview.png'));
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    results.diplo.warm = await warm(p!, ed, 'show_position = { x=0 y =140 }', 'x=0', 'x=1', 40);
    log('diplo warm', stat(results.diplo.warm.map((x: any) => x.changeToPixels)), 'fire→pixels', stat(results.diplo.warm.map((x: any) => x.fireToPixels)));
    p!.dispose(); await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  log('done');
}
