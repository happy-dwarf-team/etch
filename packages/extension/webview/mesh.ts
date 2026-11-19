// The mesh preview's webview script (src/mesh-preview.ts): parses the posted `.mesh`
// with `@etch/core/asset`, draws its shapes with WebGL2 under an orbit camera (collision shapes
// skipped), and plays an animation the user picks, skinned on the CPU each frame. The game's files
// are left-handed with Y up: Z is mirrored so a mesh does not show mirrored.
//
// The shading follows the game's mesh shader (`gfx/FX/pdxmesh.shader` and
// `standardfuncsgfx.fxh` of EU4 1.37.5, read, not copied): a squared half-Lambert term with
// ambient 0.2 and intensity 1.2; the normal map in tangent space (RGB - 0.5, green flipped,
// bitangent `cross(n, ta.xyz) * ta.w`); a Blinn-Phong highlight (exponent 10, times 2) scaled by
// the specular map's alpha times 2 and added; for `PdxMeshColor`, the specular map's R, G and B
// mask the country's three colours. The light comes from the vanilla `LIGHT_DIRECTION` of
// `common/defines.lua` (-1, -1, 0.5, pointing away from the light). The map's fog of war, terra
// incognita, snow and distance fog are left out.

import {
  jointsOfBones,
  readAnimation,
  readMesh,
  skinningMatrices,
  skinPart,
  type MeshPart,
  type MeshShape,
  type PdxAnimation,
  type PdxMesh,
} from '@etch/core/asset';
import type {
  MeshHostMessage,
  MeshSummary,
  MeshTexture,
  MeshWebviewMessage,
} from '../src/mesh-protocol.ts';

declare function acquireVsCodeApi(): { postMessage(message: MeshWebviewMessage): void };
const vscode = acquireVsCodeApi();

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`missing #${id}`);
  return found;
}
const canvas = element('canvas') as HTMLCanvasElement;
const facts = element('facts');
const status = element('status');
const errorBox = element('error');
const animationSelect = element('animation') as HTMLSelectElement;
const playButton = element('play') as HTMLButtonElement;
const wireButton = element('wireframe') as HTMLButtonElement;
const mapsButton = element('maps') as HTMLButtonElement;
const colours = element('colours');
const colourInputs = (['primary', 'secondary', 'tertiary'] as const).map(
  (key) => [key, element(key) as HTMLInputElement] as const,
);
const resetButton = element('reset') as HTMLButtonElement;

const gl = canvas.getContext('webgl2', { antialias: true });

const VERTEX = `#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec4 tangent;
uniform mat4 viewProjection;
out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vBitangent;
out vec2 vUv;
void main() {
  // The bitangent in the file's space, then everything left-handed to right-handed: mirror Z.
  vec3 b = cross(normal, tangent.xyz) * tangent.w;
  vec3 mirror = vec3(1.0, 1.0, -1.0);
  vPosition = position * mirror;
  vNormal = normal * mirror;
  vTangent = tangent.xyz * mirror;
  vBitangent = b * mirror;
  vUv = uv;
  gl_Position = viewProjection * vec4(vPosition, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vBitangent;
in vec2 vUv;
uniform sampler2D diffuse;
uniform sampler2D specularMap;
uniform sampler2D normalMap;
uniform bool textured;
uniform bool normalMapped;
uniform bool specularMapped;
uniform bool countryColours;
uniform vec3 primary;
uniform vec3 secondary;
uniform vec3 tertiary;
uniform bool alphaTest;
uniform bool lines;
// Towards the light.
uniform vec3 light;
uniform vec3 eye;
out vec4 colour;
void main() {
  if (lines) { colour = vec4(0.1, 0.9, 1.0, 1.0); return; }
  vec4 base = textured ? texture(diffuse, vUv) : vec4(0.72, 0.72, 0.72, 1.0);
  if (alphaTest && base.a < 0.5) discard;
  vec3 n = normalize(vNormal);
  if (normalMapped) {
    vec3 s = normalize(texture(normalMap, vUv).rgb - 0.5);
    s.g = -s.g;
    n = normalize(s.x * normalize(vTangent) + s.y * normalize(vBitangent) + s.z * n);
  }
  vec4 spec = specularMapped ? texture(specularMap, vUv) : vec4(0.0);
  vec3 c = base.rgb;
  if (countryColours) {
    c = mix(c, c * spec.r * primary, spec.r);
    c = mix(c, c * spec.g * secondary, spec.g);
    c = mix(c, c * spec.b * tertiary, spec.b);
  }
  float halfLambert = dot(n, light) * 0.5 + 0.5;
  halfLambert = 0.2 + 0.8 * halfLambert * halfLambert;
  c = clamp(halfLambert * c * 1.2, 0.0, 1.0);
  vec3 h = normalize(normalize(eye - vPosition) + light);
  float highlight = clamp(pow(clamp(dot(h, n), 0.0, 1.0), 10.0) * 2.0, 0.0, 1.0) * spec.a * 2.0;
  colour = vec4(clamp(c + highlight, 0.0, 1.0), 1.0);
}`;

interface DrawnPart {
  readonly part: MeshPart;
  readonly shape: MeshShape;
  readonly vao: WebGLVertexArrayObject;
  readonly positions: WebGLBuffer;
  readonly normals: WebGLBuffer;
  readonly tangents: WebGLBuffer;
  readonly triangles: WebGLBuffer;
  readonly triangleCount: number;
  readonly edges: WebGLBuffer;
  readonly edgeCount: number;
  readonly texture: WebGLTexture | undefined;
  readonly normalMap: WebGLTexture | undefined;
  readonly specularMap: WebGLTexture | undefined;
  readonly countryColours: boolean;
  readonly alphaTest: boolean;
}

let program: WebGLProgram | undefined;
let drawn: DrawnPart[] = [];
/** The uploaded textures by file name, shared by the parts that name them. */
let uploaded = new Map<string, WebGLTexture | undefined>();
let mesh: PdxMesh | undefined;
let meshName = '';
let textured = 0;
/** Where each material's diffuse texture came from, or why it is missing. */
let textureSources: Record<string, string> = {};
let offered: string[] = [];
let animation: { name: string; data: PdxAnimation } | undefined;
let playing = false;
let started = 0;
let wireframe = false;
/** Whether normal and specular maps are drawn (the Maps button). */
let maps = true;
/** The country colours `PdxMeshColor` parts are drawn with, 0-1. */
const country = {
  primary: [0.75, 0.16, 0.12],
  secondary: [0.92, 0.88, 0.75],
  tertiary: [0.15, 0.3, 0.6],
};

/**
 * Towards the light, in the drawn space: the opposite of the vanilla `LIGHT_DIRECTION`
 * (-1, -1, 0.5) with Z mirrored.
 */
const LIGHT = normalise([1, 1, 0.5]);

/** The orbit camera: angles in radians, distance from the target. */
const camera = { yaw: 0.6, pitch: 0.35, distance: 10, target: [0, 0, 0] as number[] };

function fail(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
  vscode.postMessage({ type: 'failed', message });
}

function compile(context: WebGL2RenderingContext): WebGLProgram {
  const shader = (type: number, source: string): WebGLShader => {
    const created = context.createShader(type);
    if (created === null) throw new Error('cannot create a shader');
    context.shaderSource(created, source);
    context.compileShader(created);
    if (context.getShaderParameter(created, context.COMPILE_STATUS) !== true) {
      throw new Error(context.getShaderInfoLog(created) ?? 'shader error');
    }
    return created;
  };
  const linked = context.createProgram();
  context.attachShader(linked, shader(context.VERTEX_SHADER, VERTEX));
  context.attachShader(linked, shader(context.FRAGMENT_SHADER, FRAGMENT));
  context.bindAttribLocation(linked, 0, 'position');
  context.bindAttribLocation(linked, 1, 'normal');
  context.bindAttribLocation(linked, 2, 'uv');
  context.bindAttribLocation(linked, 3, 'tangent');
  context.linkProgram(linked);
  if (context.getProgramParameter(linked, context.LINK_STATUS) !== true) {
    throw new Error(context.getProgramInfoLog(linked) ?? 'link error');
  }
  return linked;
}

function buffer(
  context: WebGL2RenderingContext,
  target: number,
  data: ArrayBufferView,
  usage: number,
): WebGLBuffer {
  const created = context.createBuffer();
  context.bindBuffer(target, created);
  context.bufferData(target, data as ArrayBufferView<ArrayBuffer>, usage);
  return created;
}

/** Each triangle edge once, as line pairs. */
function edgesOf(indices: Uint32Array): Uint32Array {
  const seen = new Set<string>();
  const out: number[] = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    for (const [a, b] of [
      [indices[i], indices[i + 1]],
      [indices[i + 1], indices[i + 2]],
      [indices[i + 2], indices[i]],
    ] as const) {
      const lo = Math.min(a ?? 0, b ?? 0);
      const hi = Math.max(a ?? 0, b ?? 0);
      const key = `${String(lo)},${String(hi)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(lo, hi);
    }
  }
  return Uint32Array.from(out);
}

function textureOf(context: WebGL2RenderingContext, source: MeshTexture): WebGLTexture | undefined {
  if (!source.ok) return undefined;
  const texture = context.createTexture();
  context.bindTexture(context.TEXTURE_2D, texture);
  context.pixelStorei(context.UNPACK_ALIGNMENT, 1);
  context.texImage2D(
    context.TEXTURE_2D,
    0,
    context.RGBA,
    source.width,
    source.height,
    0,
    context.RGBA,
    context.UNSIGNED_BYTE,
    source.rgba,
  );
  context.generateMipmap(context.TEXTURE_2D);
  context.texParameteri(
    context.TEXTURE_2D,
    context.TEXTURE_MIN_FILTER,
    context.LINEAR_MIPMAP_LINEAR,
  );
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.REPEAT);
  context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.REPEAT);
  return texture;
}

function upload(
  context: WebGL2RenderingContext,
  loaded: PdxMesh,
  textures: Readonly<Record<string, MeshTexture>>,
): void {
  for (const old of drawn) {
    context.deleteVertexArray(old.vao);
    for (const b of [old.positions, old.normals, old.tangents, old.triangles, old.edges]) {
      context.deleteBuffer(b);
    }
  }
  for (const texture of uploaded.values()) {
    if (texture !== undefined) context.deleteTexture(texture);
  }
  drawn = [];
  uploaded = new Map();
  textured = 0;
  textureSources = {};
  const warnings = new Set<string>();
  /** The texture a material names, uploaded once; notes where it came from or why it is missing. */
  const named = (name: string | undefined, part: MeshPart): WebGLTexture | undefined => {
    if (name === undefined) return undefined;
    const source = textures[name];
    if (source === undefined) return undefined;
    textureSources[name] = source.ok ? source.source : 'not found';
    if (!source.ok) warnings.add(`${name}: ${source.message}`);
    if (part.uvs === undefined) return undefined;
    if (!uploaded.has(name)) uploaded.set(name, textureOf(context, source));
    return uploaded.get(name);
  };
  for (const shape of loaded.shapes) {
    if (shape.collision) continue;
    for (const part of shape.parts) {
      const vao = context.createVertexArray();
      context.bindVertexArray(vao);
      const positions = buffer(context, context.ARRAY_BUFFER, part.positions, context.DYNAMIC_DRAW);
      context.enableVertexAttribArray(0);
      context.vertexAttribPointer(0, 3, context.FLOAT, false, 0, 0);
      const normals = buffer(
        context,
        context.ARRAY_BUFFER,
        part.normals ?? new Float32Array(part.positions.length),
        context.DYNAMIC_DRAW,
      );
      context.enableVertexAttribArray(1);
      context.vertexAttribPointer(1, 3, context.FLOAT, false, 0, 0);
      buffer(
        context,
        context.ARRAY_BUFFER,
        part.uvs ?? new Float32Array((part.positions.length / 3) * 2),
        context.STATIC_DRAW,
      );
      context.enableVertexAttribArray(2);
      context.vertexAttribPointer(2, 2, context.FLOAT, false, 0, 0);
      const tangents = buffer(
        context,
        context.ARRAY_BUFFER,
        part.tangents ?? new Float32Array((part.positions.length / 3) * 4),
        context.DYNAMIC_DRAW,
      );
      context.enableVertexAttribArray(3);
      context.vertexAttribPointer(3, 4, context.FLOAT, false, 0, 0);
      const triangles = buffer(
        context,
        context.ELEMENT_ARRAY_BUFFER,
        part.indices,
        context.STATIC_DRAW,
      );
      context.bindVertexArray(null);
      const edgeList = edgesOf(part.indices);
      const edges = buffer(context, context.ELEMENT_ARRAY_BUFFER, edgeList, context.STATIC_DRAW);
      const texture = named(part.material.diffuse, part);
      if (texture !== undefined) textured++;
      drawn.push({
        part,
        shape,
        vao,
        positions,
        normals,
        tangents,
        triangles,
        triangleCount: part.indices.length,
        edges,
        edgeCount: edgeList.length,
        texture,
        normalMap: part.tangents === undefined ? undefined : named(part.material.normal, part),
        specularMap: named(part.material.specular, part),
        countryColours: /^PdxMeshColor/.test(part.material.shader),
        alphaTest: /alpha/i.test(part.material.shader),
      });
    }
  }
  errorBox.hidden = warnings.size === 0;
  errorBox.textContent =
    warnings.size === 0 ? '' : `Textures not shown:\n${[...warnings].join('\n')}`;
}

function frameView(): void {
  const bounds = mesh?.bounds;
  if (bounds === undefined) return;
  const [x0 = 0, y0 = 0, z0 = 0] = bounds.min;
  const [x1 = 0, y1 = 0, z1 = 0] = bounds.max;
  camera.target = [(x0 + x1) / 2, (y0 + y1) / 2, -(z0 + z1) / 2];
  camera.distance = Math.max(Math.hypot(x1 - x0, y1 - y0, z1 - z0), 0.01) * 1.1;
  camera.yaw = 0.6;
  camera.pitch = 0.35;
}

/** The camera's position, in the drawn (Z mirrored) space. */
function eyeOf(): number[] {
  const { yaw, pitch, distance, target } = camera;
  const [tx = 0, ty = 0, tz = 0] = target;
  return [
    tx + distance * Math.cos(pitch) * Math.sin(yaw),
    ty + distance * Math.sin(pitch),
    tz + distance * Math.cos(pitch) * Math.cos(yaw),
  ];
}

/** Perspective × look-at, by columns. */
function viewProjection(aspect: number): Float32Array {
  const { distance, target } = camera;
  const [tx = 0, ty = 0, tz = 0] = target;
  const eye = eyeOf();
  const f = normalise([tx - (eye[0] ?? 0), ty - (eye[1] ?? 0), tz - (eye[2] ?? 0)]);
  const s = normalise(cross(f, [0, 1, 0]));
  const u = cross(s, f);
  const view = new Float32Array([
    s[0] ?? 0,
    u[0] ?? 0,
    -(f[0] ?? 0),
    0,
    s[1] ?? 0,
    u[1] ?? 0,
    -(f[1] ?? 0),
    0,
    s[2] ?? 0,
    u[2] ?? 0,
    -(f[2] ?? 0),
    0,
    -dot(s, eye),
    -dot(u, eye),
    dot(f, eye),
    1,
  ]);
  const near = distance / 100;
  const far = distance * 10;
  const t = 1 / Math.tan((40 * Math.PI) / 360);
  const projection = new Float32Array([
    t / aspect,
    0,
    0,
    0,
    0,
    t,
    0,
    0,
    0,
    0,
    (far + near) / (near - far),
    -1,
    0,
    0,
    (2 * far * near) / (near - far),
    0,
  ]);
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (projection[k * 4 + r] ?? 0) * (view[c * 4 + k] ?? 0);
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function cross(a: readonly number[], b: readonly number[]): number[] {
  const [ax = 0, ay = 0, az = 0] = a;
  const [bx = 0, by = 0, bz = 0] = b;
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);
}
function normalise(v: readonly number[]): number[] {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
}

/** Poses the skinned parts at a frame of the animation (or the bind pose without one). */
function pose(context: WebGL2RenderingContext, frame: number): void {
  const matrices = new Map<MeshShape, Float32Array[]>();
  for (const item of drawn) {
    if (item.part.skin === undefined) continue;
    let posed: {
      positions: Float32Array;
      normals: Float32Array | undefined;
      tangents: Float32Array | undefined;
    };
    if (animation === undefined) {
      const { positions, normals, tangents } = item.part;
      posed = { positions, normals, tangents };
    } else {
      let shapeMatrices = matrices.get(item.shape);
      if (shapeMatrices === undefined) {
        const joints = jointsOfBones(item.shape.skeleton, animation.data);
        shapeMatrices = skinningMatrices(item.shape.skeleton, animation.data, frame, joints);
        matrices.set(item.shape, shapeMatrices);
      }
      posed = skinPart(item.part, shapeMatrices);
    }
    context.bindBuffer(context.ARRAY_BUFFER, item.positions);
    context.bufferSubData(context.ARRAY_BUFFER, 0, posed.positions);
    if (posed.normals !== undefined) {
      context.bindBuffer(context.ARRAY_BUFFER, item.normals);
      context.bufferSubData(context.ARRAY_BUFFER, 0, posed.normals);
    }
    if (posed.tangents !== undefined) {
      context.bindBuffer(context.ARRAY_BUFFER, item.tangents);
      context.bufferSubData(context.ARRAY_BUFFER, 0, posed.tangents);
    }
  }
}

function draw(now: number): void {
  if (gl === null || program === undefined) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  let frame: number;
  if (animation !== undefined && animation.data.frames > 0) {
    frame = playing ? (((now - started) / 1000) * animation.data.fps) % animation.data.frames : 0;
    pose(gl, frame);
    status.textContent = `${animation.name}: frame ${frame.toFixed(1).padStart(5)} of ${String(animation.data.frames)} at ${String(animation.data.fps)} fps`;
  }
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.16, 0.17, 0.19, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(program);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(program, 'viewProjection'),
    false,
    viewProjection(width / height),
  );
  const uniform = (name: string): WebGLUniformLocation | null =>
    gl.getUniformLocation(program as WebGLProgram, name);
  const vector = (name: string, v: readonly number[]): void => {
    gl.uniform3f(uniform(name), v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  };
  vector('light', LIGHT);
  vector('eye', eyeOf());
  vector('primary', country.primary);
  vector('secondary', country.secondary);
  vector('tertiary', country.tertiary);
  gl.uniform1i(uniform('diffuse'), 0);
  gl.uniform1i(uniform('specularMap'), 1);
  gl.uniform1i(uniform('normalMap'), 2);
  const lines = uniform('lines');
  for (const item of drawn) {
    gl.bindVertexArray(item.vao);
    gl.uniform1i(lines, 0);
    const normalMap = maps ? item.normalMap : undefined;
    const specularMap = maps ? item.specularMap : undefined;
    gl.uniform1i(uniform('textured'), item.texture === undefined ? 0 : 1);
    gl.uniform1i(uniform('normalMapped'), normalMap === undefined ? 0 : 1);
    gl.uniform1i(uniform('specularMapped'), specularMap === undefined ? 0 : 1);
    gl.uniform1i(uniform('countryColours'), item.countryColours ? 1 : 0);
    gl.uniform1i(uniform('alphaTest'), item.alphaTest ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, item.texture ?? null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, specularMap ?? null);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, normalMap ?? null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, item.triangles);
    gl.drawElements(gl.TRIANGLES, item.triangleCount, gl.UNSIGNED_INT, 0);
    if (wireframe) {
      gl.uniform1i(lines, 1);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, item.edges);
      gl.drawElements(gl.LINES, item.edgeCount, gl.UNSIGNED_INT, 0);
    }
  }
  gl.bindVertexArray(null);
  if (playing) requestAnimationFrame(draw);
}

function redraw(): void {
  if (!playing) requestAnimationFrame(draw);
}

function summary(): MeshSummary {
  const shapes = mesh?.shapes ?? [];
  const parts = shapes.filter((s) => !s.collision).flatMap((s) => s.parts);
  return {
    shapes: shapes.filter((s) => !s.collision).length,
    collisionShapes: shapes.filter((s) => s.collision).length,
    vertices: parts.reduce((sum, p) => sum + p.positions.length / 3, 0),
    triangles: parts.reduce((sum, p) => sum + p.indices.length / 3, 0),
    bones: shapes.reduce((sum, s) => sum + s.skeleton.length, 0),
    textured,
    normalMapped: drawn.filter((d) => d.normalMap !== undefined).length,
    specularMapped: drawn.filter((d) => d.specularMap !== undefined).length,
    animation: animation?.name,
    animations: offered,
    textures: textureSources,
  };
}

function showFacts(): void {
  const s = summary();
  const shaders = [...new Set(drawn.map((d) => d.part.material.shader).filter((x) => x !== ''))];
  const items = [
    meshName,
    `${String(s.shapes)} shape${s.shapes === 1 ? '' : 's'}`,
    `${s.vertices.toLocaleString('en')} vertices`,
    `${s.triangles.toLocaleString('en')} triangles`,
    s.bones > 0 ? `${String(s.bones)} bones` : 'no skeleton',
    `${String(s.textured)} of ${String(drawn.length)} parts textured`,
    `${String(s.normalMapped)} with normal maps, ${String(s.specularMapped)} with specular maps`,
    shaders.join(', '),
  ];
  if (s.collisionShapes > 0) items.push(`${String(s.collisionShapes)} collision (hidden)`);
  for (const [name, source] of Object.entries(s.textures)) items.push(`${name} (${source})`);
  facts.replaceChildren(
    ...items.map((text) => {
      const span = document.createElement('span');
      span.textContent = text;
      return span;
    }),
  );
}

window.addEventListener('message', (event: MessageEvent<MeshHostMessage>) => {
  const message = event.data;
  if (gl === null || program === undefined) return;
  try {
    if (message.type === 'mesh') {
      meshName = message.name;
      mesh = readMesh(Uint8Array.from(message.bytes));
      const keep = animation?.name;
      animation = undefined;
      playing = false;
      playButton.setAttribute('aria-pressed', 'false');
      playButton.textContent = 'Play';
      upload(gl, mesh, message.textures);
      const first = camera.distance === 10;
      if (first) frameView();
      animationSelect.replaceChildren(
        new Option('Bind pose', ''),
        ...message.animations.map(
          (a) => new Option(`${a.name} (${String(a.frames)} frames)`, a.name),
        ),
      );
      offered = message.animations.map((a) => a.name);
      animationSelect.hidden = message.animations.length === 0;
      playButton.hidden = true;
      colours.hidden = !drawn.some((d) => d.countryColours);
      showFacts();
      status.textContent = '';
      if (keep !== undefined && message.animations.some((a) => a.name === keep)) {
        animationSelect.value = keep;
        vscode.postMessage({ type: 'animation', name: keep });
      }
      redraw();
      vscode.postMessage({ type: 'shown', summary: summary() });
    } else {
      animation = { name: message.name, data: readAnimation(Uint8Array.from(message.bytes)) };
      playButton.hidden = false;
      playing = true;
      started = performance.now();
      playButton.setAttribute('aria-pressed', 'true');
      playButton.textContent = 'Pause';
      requestAnimationFrame(draw);
      vscode.postMessage({ type: 'shown', summary: summary() });
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
});

animationSelect.addEventListener('change', () => {
  const name = animationSelect.value;
  if (name === '') {
    animation = undefined;
    playing = false;
    playButton.hidden = true;
    status.textContent = '';
    if (gl !== null) pose(gl, 0);
    redraw();
    return;
  }
  vscode.postMessage({ type: 'animation', name });
});

playButton.addEventListener('click', () => {
  playing = !playing;
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.textContent = playing ? 'Pause' : 'Play';
  if (playing) {
    started = performance.now();
    requestAnimationFrame(draw);
  }
});

mapsButton.addEventListener('click', () => {
  maps = !maps;
  mapsButton.setAttribute('aria-pressed', String(maps));
  redraw();
});

for (const [key, input] of colourInputs) {
  input.addEventListener('input', () => {
    const hex = input.value.replace('#', '');
    country[key] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    redraw();
  });
}

wireButton.addEventListener('click', () => {
  wireframe = !wireframe;
  wireButton.setAttribute('aria-pressed', String(wireframe));
  redraw();
});

resetButton.addEventListener('click', () => {
  frameView();
  redraw();
});

let dragging: { x: number; y: number; pan: boolean } | undefined;
canvas.addEventListener('pointerdown', (event) => {
  dragging = { x: event.clientX, y: event.clientY, pan: event.shiftKey || event.button === 2 };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', () => {
  dragging = undefined;
});
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});
canvas.addEventListener('pointermove', (event) => {
  if (dragging === undefined) return;
  const dx = event.clientX - dragging.x;
  const dy = event.clientY - dragging.y;
  dragging = { ...dragging, x: event.clientX, y: event.clientY };
  if (dragging.pan) {
    const scale = camera.distance / Math.max(canvas.clientHeight, 1);
    const right = [Math.cos(camera.yaw), 0, -Math.sin(camera.yaw)];
    const [tx = 0, ty = 0, tz = 0] = camera.target;
    camera.target = [
      tx - (right[0] ?? 0) * dx * scale,
      ty + dy * scale,
      tz - (right[2] ?? 0) * dx * scale,
    ];
  } else {
    camera.yaw -= dx * 0.01;
    camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + dy * 0.01));
  }
  redraw();
});
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    camera.distance *= event.deltaY > 0 ? 1.1 : 1 / 1.1;
    redraw();
  },
  { passive: false },
);
new ResizeObserver(redraw).observe(canvas);

if (gl === null) {
  fail('This webview has no WebGL2, which the mesh preview needs.');
} else {
  try {
    program = compile(gl);
    vscode.postMessage({ type: 'ready' });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
