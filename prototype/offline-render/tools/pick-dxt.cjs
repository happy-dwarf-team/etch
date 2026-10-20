// PROTOTYPE helper: pick vanilla DXT1/3/5 interface textures for the S3TC check.
const fs = require('fs'), p = require('path');
const root = 'C:/Program Files (x86)/Steam/steamapps/common/Europa Universalis IV/gfx/interface';
const out = {};
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = p.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.dds$/i.test(e.name)) { const b = Buffer.alloc(128); const fd = fs.openSync(f, 'r'); fs.readSync(fd, b, 0, 128, 0); fs.closeSync(fd); if (b.readUInt32LE(80) & 4) { const k = b.toString('latin1', 84, 88); (out[k] = out[k] || []).push([f, b.readUInt32LE(16), b.readUInt32LE(12)]); } } } })(root);
const pick = [];
for (const k in out) {
  const l = out[k].sort((a, b) => b[1] * b[2] - a[1] * a[2]);
  console.log(k, l.length, l.slice(0, 2).map(x => p.relative(root, x[0]) + ' ' + x[1] + 'x' + x[2]).join(', '));
  pick.push(...l.slice(0, 3).map(x => x[0]));
  const odd = l.filter(x => x[1] % 4 || x[2] % 4); if (odd.length) { console.log(' not multiple of 4:', odd.length, p.relative(root, odd[0][0]), odd[0][1] + 'x' + odd[0][2]); pick.push(odd[0][0]); }
}
fs.writeFileSync('samples/dxt-check.json', JSON.stringify(pick.map(f => f.split(p.sep).join('/')), null, 1));
