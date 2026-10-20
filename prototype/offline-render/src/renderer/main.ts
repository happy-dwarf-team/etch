// PROTOTYPE (etch#9): webview side. Fetches textures itself, draws the draw list with WebGL2. Throwaway.
import { readDds, readTga, decodeDxt, Img } from './images';
import type { DrawList } from '../core/layout';

declare function acquireVsCodeApi(): { postMessage(m: unknown): void };
const vscode = acquireVsCodeApi();
const epoch = () => performance.timeOrigin + performance.now();

const canvas = document.getElementById('c') as HTMLCanvasElement;
const status = document.getElementById('s')!;
const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true })!;
const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc') as null | { COMPRESSED_RGBA_S3TC_DXT1_EXT: number; COMPRESSED_RGBA_S3TC_DXT3_EXT: number; COMPRESSED_RGBA_S3TC_DXT5_EXT: number };

// --- shaders: one program; per-draw uniforms select the texel layout and the colour. Samplers pick point/linear.
const vs = `#version 300 es
in vec2 aPos; in vec2 aUv; uniform vec2 uScreen; uniform vec2 uOffset; out vec2 vUv;
void main(){ vec2 p = aPos + uOffset; gl_Position = vec4(p.x / uScreen.x * 2.0 - 1.0, 1.0 - p.y / uScreen.y * 2.0, 0, 1); vUv = aUv; }`;
const fs = `#version 300 es
precision highp float; in vec2 vUv; uniform sampler2D uTex; uniform int uLayout; uniform vec4 uColor; out vec4 o;
void main(){ vec4 t = texture(uTex, vUv);
  if (uLayout == 1) t = t.bgra; else if (uLayout == 2) t = vec4(t.bgr, 1.0); else if (uLayout == 3) t = vec4(t.rgb, 1.0);
  o = t * uColor; }`; // simple.shader / buttonstate Up / text.shader without border colour: texel * colour
function sh(type: number, src: string) { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)!); return s; }
const prog = gl.createProgram()!; gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
const U = (n: string) => gl.getUniformLocation(prog, n);
const uScreen = U('uScreen'), uOffset = U('uOffset'), uLayout = U('uLayout'), uColor = U('uColor'), uTex = U('uTex');
const samplers: Record<string, WebGLSampler> = {};
for (const [k, f] of [['point', gl.NEAREST], ['linear', gl.LINEAR]] as const) {
  const s = gl.createSampler()!; gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, f); gl.samplerParameteri(s, gl.TEXTURE_MAG_FILTER, f);
  gl.samplerParameteri(s, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.samplerParameteri(s, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); samplers[k] = s;
}
const vbo = gl.createBuffer()!; const vao = gl.createVertexArray()!;
gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
const aPos = gl.getAttribLocation(prog, 'aPos'), aUv = gl.getAttribLocation(prog, 'aUv');
gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(aUv); gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

// --- textures: fetched and decoded once per URI, kept on the GPU
interface Tex { t: WebGLTexture; layout: number; how: string; bytes: number }
const cache = new Map<string, Promise<Tex>>();
const stats = { fetchMs: 0, decodeMs: 0, uploadMs: 0, compressed: 0, cpuDxt: 0, errors: [] as string[] };

function upload(img: Img, uri: string): Tex {
  const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
  const t0 = performance.now(); let layout = 0, how = '';
  if (img.kind === 'dxt') {
    if (s3tc && img.w % 4 === 0 && img.h % 4 === 0) {
      const f = img.fourcc === 'DXT1' ? s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT : img.fourcc === 'DXT3' ? s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT : s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT;
      gl.compressedTexImage2D(gl.TEXTURE_2D, 0, f, img.w, img.h, 0, img.data); how = `s3tc ${img.fourcc}`; stats.compressed++;
    } else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, img.w, img.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, decodeDxt(img)); how = `cpu ${img.fourcc}`; stats.cpuDxt++; }
  } else if (img.layout === 'bgr') { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, img.w, img.h, 0, gl.RGB, gl.UNSIGNED_BYTE, img.data); layout = 2; how = 'bgr8'; }
  else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, img.w, img.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, img.data); layout = img.layout === 'bgra' ? 1 : img.layout === 'bgrx' ? 2 : 0; how = img.layout; }
  const e = gl.getError(); if (e) stats.errors.push(`${uri}: GL error ${e} (${how})`);
  stats.uploadMs += performance.now() - t0;
  return { t, layout, how, bytes: img.data.byteLength };
}

function texture(uri: string): Promise<Tex> {
  let p = cache.get(uri);
  if (!p) {
    p = (async () => {
      let t0 = performance.now();
      const buf = await (await fetch(uri)).arrayBuffer(); stats.fetchMs += performance.now() - t0; t0 = performance.now();
      const img = /\.tga$/i.test(uri) ? readTga(buf) : readDds(buf); stats.decodeMs += performance.now() - t0;
      return upload(img, uri);
    })();
    cache.set(uri, p);
  }
  return p;
}

let half = 0;
function draw(list: DrawList & { uris: string[] }, texs: Tex[]) {
  if (canvas.width !== list.screen.w || canvas.height !== list.screen.h) { canvas.width = list.screen.w; canvas.height = list.screen.h; }
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(prog); gl.bindVertexArray(vao);
  gl.uniform2f(uScreen, list.screen.w, list.screen.h); gl.uniform2f(uOffset, half, half); gl.uniform1i(uTex, 0);
  // one vertex buffer for the whole list, then one drawArrays per draw item, in file order
  let n = 0; for (const d of list.draws) n += d.k === 's' ? 6 : d.q.length / 8 * 6;
  const v = new Float32Array(n * 4); let o = 0;
  const quad = (x: number, y: number, w: number, h: number, u0: number, v0: number, u1: number, v1: number) => {
    const p = [x, y, u0, v0, x + w, y, u1, v0, x, y + h, u0, v1, x, y + h, u0, v1, x + w, y, u1, v0, x + w, y + h, u1, v1];
    v.set(p, o); o += 24;
  };
  for (const d of list.draws) {
    if (d.k === 's') quad(d.x, d.y, d.w, d.h, d.u0, d.v0, d.u1, d.v1);
    else for (let i = 0; i < d.q.length; i += 8) quad(d.q[i], d.q[i + 1], d.q[i + 2], d.q[i + 3], d.q[i + 4], d.q[i + 5], d.q[i + 6], d.q[i + 7]);
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STREAM_DRAW);
  let first = 0;
  for (const d of list.draws) {
    const cnt = d.k === 's' ? 6 : d.q.length / 8 * 6;
    const t = texs[d.tex];
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t.t);
    gl.bindSampler(0, samplers[d.k === 's' ? d.filter : 'linear']); // text.shader: MagFilter Linear at 1:1
    gl.uniform1i(uLayout, t.layout);
    if (d.k === 's') gl.uniform4f(uColor, 1, 1, 1, 1); else gl.uniform4f(uColor, d.color[0] / 255, d.color[1] / 255, d.color[2] / 255, d.color[3] / 255);
    gl.drawArrays(gl.TRIANGLES, first, cnt); first += cnt;
  }
}

function capture(w: number, h: number): string {
  const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const row = w * 4; const flip = new Uint8Array(px.length);
  for (let y = 0; y < h; y++) flip.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  let s = ''; const CH = 0x8000; for (let i = 0; i < flip.length; i += CH) s += String.fromCharCode(...flip.subarray(i, i + CH));
  return btoa(s);
}

/** S3TC self-check: a 4×4 DXT1 block of pure red, uploaded compressed, drawn and read back. */
function s3tcCheck(): string {
  if (!s3tc) return 'extension missing';
  const block = new Uint8Array([0x00, 0xF8, 0x00, 0x00, 0, 0, 0, 0]);
  const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
  gl.compressedTexImage2D(gl.TEXTURE_2D, 0, s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT, 4, 4, 0, block);
  const err = gl.getError();
  canvas.width = 4; canvas.height = 4; gl.viewport(0, 0, 4, 4); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(prog); gl.bindVertexArray(vao); gl.uniform2f(uScreen, 4, 4); gl.uniform2f(uOffset, 0, 0); gl.uniform1i(uLayout, 0); gl.uniform4f(uColor, 1, 1, 1, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 0, 4, 0, 1, 0, 0, 4, 0, 1, 0, 4, 0, 1, 4, 0, 1, 0, 4, 4, 1, 1]), gl.STREAM_DRAW);
  gl.bindSampler(0, samplers.point); gl.disable(gl.BLEND); gl.drawArrays(gl.TRIANGLES, 0, 6);
  const px = new Uint8Array(4); gl.readPixels(1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.deleteTexture(t);
  return `upload error ${err}, read back rgba(${px.join(',')})` + (px[0] === 255 && px[1] === 0 && px[2] === 0 && px[3] === 255 ? ' OK' : ' WRONG');
}

/** Real vanilla DXT files: upload compressed (any size), draw into an FBO, compare with the CPU decode. */
async function dxtCheck(uris: string[]) {
  const res: unknown[] = [];
  for (const uri of uris) {
    const img = readDds(await (await fetch(uri)).arrayBuffer());
    if (img.kind !== 'dxt' || !s3tc) { res.push({ uri, skipped: img.kind }); continue; }
    const ref = decodeDxt(img);
    const f = img.fourcc === 'DXT1' ? s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT : img.fourcc === 'DXT3' ? s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT : s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT;
    while (gl.getError()) { /* clear */ }
    const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
    const t0 = performance.now();
    gl.compressedTexImage2D(gl.TEXTURE_2D, 0, f, img.w, img.h, 0, img.data);
    const err = gl.getError(); const uploadMs = performance.now() - t0;
    let maxDiff = -1, mean = -1;
    if (!err) {
      const rt = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, rt); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, img.w, img.h);
      const fb = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt, 0);
      gl.viewport(0, 0, img.w, img.h); gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(prog); gl.bindVertexArray(vao); gl.uniform2f(uScreen, img.w, img.h); gl.uniform2f(uOffset, 0, 0); gl.uniform1i(uLayout, 0); gl.uniform4f(uColor, 1, 1, 1, 1);
      const W = img.w, H = img.h; // y flipped: FBO row 0 is the bottom, so draw v from 1 to 0
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, W, 0, 1, 1, 0, H, 0, 0, 0, H, 0, 0, W, 0, 1, 1, W, H, 1, 0]), gl.STREAM_DRAW);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, t); gl.bindSampler(0, samplers.point); gl.drawArrays(gl.TRIANGLES, 0, 6);
      const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0; maxDiff = 0;
      for (let i = 0; i < px.length; i++) { const d = Math.abs(px[i] - ref[i]); sum += d; if (d > maxDiff) maxDiff = d; }
      mean = sum / px.length;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(rt);
    }
    gl.deleteTexture(t);
    res.push({ file: decodeURIComponent(uri).replace(/^.*gfx\/interface\//, ''), fourcc: img.fourcc, w: img.w, h: img.h, uploadError: err, uploadMs: +uploadMs.toFixed(2), maxDiff, meanDiff: +mean.toFixed(3) });
  }
  return res;
}

window.addEventListener('message', async (ev) => {
  const m = ev.data;
  if (m.type === 'dxtcheck') { vscode.postMessage({ type: 'dxtcheck', results: await dxtCheck(m.uris) }); return; }
  if (m.type === 'draw') {
    const tRecv = epoch();
    m.list = JSON.parse(m.json);
    const tParsed = epoch();
    half = m.halfPixel ? -0.5 : 0;
    const before = { ...stats, errors: stats.errors.length };
    try {
      const texs = await Promise.all((m.list.uris as string[]).map(texture));
      const tTex = epoch();
      draw(m.list, texs);
      const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // forces the GPU work to finish
      const tPixels = epoch();
      requestAnimationFrame(() => {
        const tFrame = epoch();
        status.textContent = `${m.id}: ${m.list.draws.length} draws, ${texs.length} textures, ${(tPixels - m.tChange).toFixed(1)} ms change→pixels`;
        vscode.postMessage({
          type: 'drawn', id: m.id, tRecv, tParsed, tTex, tPixels, tFrame,
          tex: { fetchMs: stats.fetchMs - before.fetchMs, decodeMs: stats.decodeMs - before.decodeMs, uploadMs: stats.uploadMs - before.uploadMs, compressed: stats.compressed - before.compressed, cpuDxt: stats.cpuDxt - before.cpuDxt, how: texs.map(t => t.how), errors: stats.errors.slice(before.errors) },
          capture: m.capture ? capture(canvas.width, canvas.height) : undefined, w: canvas.width, h: canvas.height,
        });
      });
    } catch (e) { vscode.postMessage({ type: 'error', id: m.id, error: String((e as Error)?.stack ?? e) }); }
  }
});

const dbg = gl.getExtension('WEBGL_debug_renderer_info');
vscode.postMessage({
  type: 'ready', t: epoch(),
  info: {
    userAgent: navigator.userAgent,
    version: gl.getParameter(gl.VERSION), glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    extensions: gl.getSupportedExtensions(),
    webgl1S3tc: !!document.createElement('canvas').getContext('webgl')?.getExtension('WEBGL_compressed_texture_s3tc'),
    s3tcCheck: s3tcCheck(),
  },
});
