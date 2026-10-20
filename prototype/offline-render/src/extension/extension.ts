// PROTOTYPE (etch#9): VS Code glue. Host parses and lays out, webview draws. Throwaway.
import * as vscode from 'vscode';
import * as path from 'node:path';
import { Session, Timings } from '../core/session';
import { Root } from '../core/files';
import { SampleData } from '../core/layout';
import { config } from '../tools/config';

const epoch = () => performance.timeOrigin + performance.now();

export interface PreviewOpts { window: string; screen: { w: number; h: number }; sample?: SampleData; roots?: Root[]; capture?: boolean; halfPixel?: boolean; debounceMs?: number }
export interface Drawn { id: number; trigger: 'open' | 'change'; tChange: number; tFire: number; host: Timings; postBytes: number; msg: any }

export class Preview {
  panel!: vscode.WebviewPanel; session!: Session;
  info: any; cold: Timings = {};
  private seq = 0; private waiters = new Map<number, (d: Drawn) => void>(); private pending = new Map<number, Omit<Drawn, 'msg'>>();
  private timer: NodeJS.Timeout | undefined; private sub: vscode.Disposable | undefined;
  onDrawn?: (d: Drawn) => void;
  captureNext = false;
  private dxtWaiter?: (r: unknown[]) => void;
  dxtCheck(files: string[]): Promise<unknown[]> {
    return new Promise(res => { this.dxtWaiter = res; this.panel.webview.postMessage({ type: 'dxtcheck', uris: files.map(f => this.panel.webview.asWebviewUri(vscode.Uri.file(f)).toString()) }); });
  }

  constructor(private ctx: vscode.ExtensionContext, readonly doc: vscode.TextDocument, readonly opt: PreviewOpts) {}

  /** Cold open: index the mod set, lay out, create the webview, load the window's textures, first pixels. */
  async open(): Promise<Drawn> {
    const t0 = epoch();
    const roots = this.opt.roots ?? config().roots;
    this.session = new Session(roots);
    Object.assign(this.cold, this.session.cold);
    let t = epoch();
    this.panel = vscode.window.createWebviewPanel('etchProto', `Etch prototype: ${this.opt.window}`, vscode.ViewColumn.Beside, {
      enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'out'), ...roots.map(r => vscode.Uri.file(r.dir))],
    });
    const ready = new Promise<void>(res => {
      this.panel.webview.onDidReceiveMessage(m => {
        if (m.type === 'ready') { this.info = m.info; this.cold.webviewBoot = epoch() - t; res(); }
        else if (m.type === 'drawn') { const p = this.pending.get(m.id)!; const d = { ...p, msg: m }; this.pending.delete(m.id); this.onDrawn?.(d); this.waiters.get(m.id)?.(d); this.waiters.delete(m.id); }
        else if (m.type === 'dxtcheck') this.dxtWaiter?.(m.results);
        else if (m.type === 'error') console.error('[etch-proto webview]', m.error);
      });
    });
    this.panel.webview.html = this.html();
    await ready;
    const d = await this.render('open', t0, epoch());
    this.cold.total = d.msg.tPixels - t0;
    this.sub = vscode.workspace.onDidChangeTextDocument(e => {
      if (e.document !== this.doc) return;
      const tChange = epoch();
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.render('change', tChange, epoch()), this.opt.debounceMs ?? 30);
    });
    return d;
  }

  render(trigger: 'open' | 'change', tChange: number, tFire: number): Promise<Drawn> {
    const id = ++this.seq;
    const r = this.session.render(this.doc.getText(), this.opt.window, this.opt.screen, this.opt.sample);
    let s = epoch();
    const uris = r.list.textures.map(x => this.panel.webview.asWebviewUri(vscode.Uri.file(x.abs)).toString());
    const list = { ...r.list, textures: undefined, uris };
    const payload = JSON.stringify(list); r.t.serialize = epoch() - s;
    const capture = this.captureNext; this.captureNext = false;
    this.pending.set(id, { id, trigger, tChange, tFire, host: r.t, postBytes: payload.length });
    s = epoch();
    this.panel.webview.postMessage({ type: 'draw', id, json: payload, tChange, capture, halfPixel: this.opt.halfPixel });
    r.t.post = epoch() - s;
    return new Promise(res => this.waiters.set(id, res));
  }

  /** Re-render now (no edit), e.g. with a capture. */
  redraw(capture = false): Promise<Drawn> { this.captureNext = capture; return this.render('open', epoch(), epoch()); }

  dispose() { this.sub?.dispose(); this.panel?.dispose(); }

  private html(): string {
    const w = this.panel.webview; const js = w.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'out', 'webview.js'));
    const nonce = Math.random().toString(36).slice(2);
    return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${w.cspSource}; connect-src ${w.cspSource}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<style>body{margin:0;background:#1e1e1e;color:#ccc;font:12px sans-serif} canvas{width:100%;image-rendering:pixelated;background:repeating-conic-gradient(#333 0 25%,#444 0 50%) 0 0/16px 16px} #s{position:fixed;bottom:0;left:0;background:#000a;padding:2px 6px}</style>
</head><body><canvas id="c"></canvas><div id="s">PROTOTYPE etch#9</div><script nonce="${nonce}" src="${js}"></script></body></html>`;
  }
}

export function activate(ctx: vscode.ExtensionContext) {
  ctx.subscriptions.push(vscode.commands.registerCommand('etchProto.preview', async () => {
    const ed = vscode.window.activeTextEditor; if (!ed) return;
    const window = await vscode.window.showInputBox({ prompt: 'Window path (root/child/...)', value: path.basename(ed.document.fileName, '.gui') });
    if (!window) return;
    const p = new Preview(ctx, ed.document, { window, screen: { w: 1920, h: 1080 } });
    const d = await p.open();
    vscode.window.showInformationMessage(`Etch prototype: cold open ${p.cold.total.toFixed(0)} ms, ${d.msg.tex.how.length} textures`);
  }));
  return { Preview, ctx };
}
export function deactivate() {}
