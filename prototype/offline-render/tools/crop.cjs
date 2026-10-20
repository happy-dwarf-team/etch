// PROTOTYPE helper: crop a PNG. usage: node tools/crop.cjs in.png out.png x y w h [scale]
const { PNG } = require('pngjs'); const fs = require('fs');
const [,, inp, out, x, y, w, h, s] = process.argv; const X=+x, Y=+y, W=+w, H=+h, S=+(s||1);
const src = PNG.sync.read(fs.readFileSync(inp)); const dst = new PNG({ width: W*S, height: H*S });
for (let j = 0; j < H*S; j++) for (let i = 0; i < W*S; i++) {
  const si = ((Y + Math.floor(j/S)) * src.width + X + Math.floor(i/S)) * 4, di = (j * W*S + i) * 4;
  for (let c = 0; c < 4; c++) dst.data[di + c] = src.data[si + c];
}
fs.writeFileSync(out, PNG.sync.write(dst)); console.log(src.width, src.height);
