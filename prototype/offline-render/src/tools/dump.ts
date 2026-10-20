// PROTOTYPE (etch#9): headless layout dump in plain Node. usage: node out/dump.js <file.gui> <window> [WxH]
import * as fs from 'node:fs';
import { config } from './config';
import { Session } from '../core/session';

const [gui, win, res] = process.argv.slice(2);
const cfg = config();
const t0 = performance.now();
const s = new Session(cfg.roots);
const [w, h] = (res ?? '3440x1440').split('x').map(Number);
const file = s.files.resolve(gui) ?? gui;
const text = s.files.text(file);
const r = s.render(text, win, { w, h }, cfg.sample);
console.log(JSON.stringify({ file, cold: s.cold, t: r.t, total: performance.now() - t0, sprites: s.gfx.sprites.size, dupSprites: s.gfx.dupSprites, fonts: s.gfx.fontDefs.size, loc: s.loc.size, textures: r.list.textures.length, draws: r.list.draws.length, bytes: JSON.stringify(r.list).length }, null, 1));
for (const x of r.list.widgets) console.log(x.kind.padEnd(24), x.path.padEnd(70), JSON.stringify(x.rect), x.note ?? '');
console.log('diags', [...new Set(r.list.diags)]);
console.log('textures', r.list.textures.map(t => `${t.rel} ${t.w}x${t.h} ${t.fmt}`));
fs.mkdirSync('work', { recursive: true });
fs.writeFileSync(`work/${win}.drawlist.json`, JSON.stringify(r.list));
