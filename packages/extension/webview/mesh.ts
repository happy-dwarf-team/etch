// The webview script of the mesh preview (src/mesh-preview.ts) and the entity preview
// (src/entity-preview.ts): parses the posted `.mesh` files with `@etch/core/asset`, draws their
// shapes with WebGL2 under an orbit camera (collision shapes skipped), and plays an animation,
// skinned on the CPU each frame. A mesh preview draws one mesh and plays the animation the user
// picks. An entity preview draws the entity's mesh and its attachments, each on its parent's bone
// as the bone moves, and plays the state the user picks on all of them. The game's files are
// left-handed with Y up: Z is mirrored so a mesh does not show mirrored.
//
// The shading follows the game's mesh shader (`gfx/FX/pdxmesh.shader` and
// `standardfuncsgfx.fxh` of EU4 1.37.5, read, not copied): a squared half-Lambert term with
// ambient 0.2 and intensity 1.2; the normal map in tangent space (RGB - 0.5, green flipped,
// bitangent `cross(n, ta.xyz) * ta.w`); a Blinn-Phong highlight (exponent 10, times 2) scaled by
// the specular map's alpha times 2 and added; for `PdxMeshColor`, the specular map's R, G and B
// mask the country's three colours; for `PdxMeshTextureAtlas` (a ship's sails, a map flag), the
// diffuse map's alpha blends in the diffuse colour times the country's flag, sampled with the
// second texture coordinates (`u1`). The light comes from the vanilla `LIGHT_DIRECTION` of
// `common/defines.lua` (-1, -1, 0.5, pointing away from the light). The map's fog of war, terra
// incognita, snow and distance fog are left out.
//
// An attachment's scale: its own pdxmesh and entity scale, not multiplied by its parent's (the
// bone's position is). Vanilla gives a soldier and the weapon in its hand the same scale (0.5).

import {
  boneWorldMatrices,
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
  EntityNode,
  MeshHostMessage,
  MeshSummary,
  MeshTexture,
  MeshWebviewMessage,
} from '../src/mesh-protocol.ts';
import {
  edgesOf,
  eyeOf,
  FRAMED_PITCH,
  FRAMED_YAW,
  frameOf,
  framing,
  normalise,
  placedBounds,
  placement,
  scaling,
  viewProjection,
  type Bounds,
  type OrbitCamera,
} from './view-math.ts';

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
const flagLabel = element('flag');
const flagInput = element('flag-tag') as HTMLInputElement;

const gl = canvas.getContext('webgl2', { antialias: true });

const VERTEX = `#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;
in vec4 tangent;
in vec2 uv1;
uniform mat4 viewProjection;
uniform mat4 model;
out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vBitangent;
out vec2 vUv;
out vec2 vUv1;
void main() {
  // Placed in the file's space (rotation and uniform scale), the bitangent built there, then
  // everything left-handed to right-handed: mirror Z.
  mat3 turn = mat3(model);
  vec3 n = normalize(turn * normal);
  vec3 t = normalize(turn * tangent.xyz);
  vec3 b = cross(n, t) * tangent.w;
  vec3 mirror = vec3(1.0, 1.0, -1.0);
  vPosition = (model * vec4(position, 1.0)).xyz * mirror;
  vNormal = n * mirror;
  vTangent = t * mirror;
  vBitangent = b * mirror;
  vUv = uv;
  vUv1 = uv1;
  gl_Position = viewProjection * vec4(vPosition, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vBitangent;
in vec2 vUv;
in vec2 vUv1;
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
// PdxMeshTextureAtlas: the flag through the second UVs, or the country colours as stripes.
uniform bool atlas;
uniform bool flagFromColours;
uniform sampler2D flagMap;
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
  if (atlas && textured) {
    vec3 flag = flagFromColours
      ? (vUv1.x < 1.0 / 3.0 ? primary : vUv1.x < 2.0 / 3.0 ? secondary : tertiary)
      : texture(flagMap, vUv1).rgb;
    c = mix(c, flag * c, base.a);
  }
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
  readonly buffers: readonly WebGLBuffer[];
  readonly positions: WebGLBuffer;
  /** The positions as drawn now: skinned into the current frame, or the mesh's own. */
  posed: Float32Array;
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
  /** A `PdxMeshTextureAtlas` part with second UVs: the flag is drawn on it. */
  readonly atlas: boolean;
  readonly alphaTest: boolean;
}

/** One drawn mesh: the mesh preview's only one, or an entity's or one of its attachments. */
interface Instance {
  readonly name: string;
  readonly meshName: string;
  readonly mesh: PdxMesh;
  readonly parts: readonly DrawnPart[];
  readonly parent: Instance | undefined;
  readonly bone: string | undefined;
  readonly scale: number;
  /** What it plays in each state, by key of `animations` (entity) or file name (mesh). */
  readonly states: Readonly<Record<string, string | undefined>>;
  /** Where it is drawn, in the file's space; set by `pose`. */
  model: Float32Array;
}

let program: WebGLProgram | undefined;
let instances: Instance[] = [];
/** The uploaded textures, shared by the parts of a mesh that name them. */
let uploaded: WebGLTexture[] = [];
/** The mesh preview's file name, or the entity's name. */
let title = '';
let textured = 0;
/** Where each texture came from, or why it is missing. */
let textureSources: Record<string, string> = {};
/** Mesh preview: the animations beside the mesh. */
let offered: string[] = [];
/** The animations that can play, by key: a file name (mesh) or a game path (entity). */
const animations = new Map<string, PdxAnimation>();
/** Entity preview: its name, states and what could not be resolved. */
let entity: { name: string; states: string[]; problems: string[] } | undefined;
/** What plays: an animation's file name (mesh) or a state (entity); `undefined` for the bind pose. */
let playingKey: string | undefined;
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
let camera: OrbitCamera = { yaw: FRAMED_YAW, pitch: FRAMED_PITCH, distance: 10, target: [0, 0, 0] };
/** The flag on `PdxMeshTextureAtlas` parts: a tag's, or none for the country colours' stripes. */
let flag: { tag: string; texture: WebGLTexture; source: string } | undefined;

/** Whether the camera has framed a mesh yet: a reload keeps the user's view. */
let framed = false;

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
  context.bindAttribLocation(linked, 4, 'uv1');
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

/** Frees every instance's buffers and textures. */
function clear(context: WebGL2RenderingContext): void {
  for (const instance of instances) {
    for (const old of instance.parts) {
      context.deleteVertexArray(old.vao);
      for (const b of old.buffers) context.deleteBuffer(b);
    }
  }
  for (const texture of uploaded) context.deleteTexture(texture);
  instances = [];
  uploaded = [];
  textured = 0;
  textureSources = {};
}

/** Uploads a mesh's drawn parts; notes texture sources and adds missing textures to `warnings`. */
function upload(
  context: WebGL2RenderingContext,
  loaded: PdxMesh,
  textures: Readonly<Record<string, MeshTexture>>,
  warnings: Set<string>,
): DrawnPart[] {
  const shared = new Map<string, WebGLTexture | undefined>();
  /** The texture a material names, uploaded once; notes where it came from or why it is missing. */
  const named = (name: string | undefined, part: MeshPart): WebGLTexture | undefined => {
    if (name === undefined) return undefined;
    const source = textures[name];
    if (source === undefined) return undefined;
    textureSources[name] = source.ok ? source.source : 'not found';
    if (!source.ok) warnings.add(`${name}: ${source.message}`);
    if (part.uvs === undefined) return undefined;
    if (!shared.has(name)) {
      const texture = textureOf(context, source);
      shared.set(name, texture);
      if (texture !== undefined) uploaded.push(texture);
    }
    return shared.get(name);
  };
  const parts: DrawnPart[] = [];
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
      const uvs = buffer(
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
      const uvs1 = buffer(
        context,
        context.ARRAY_BUFFER,
        part.uvs1 ?? new Float32Array((part.positions.length / 3) * 2),
        context.STATIC_DRAW,
      );
      context.enableVertexAttribArray(4);
      context.vertexAttribPointer(4, 2, context.FLOAT, false, 0, 0);
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
      parts.push({
        part,
        shape,
        vao,
        buffers: [positions, normals, uvs, tangents, uvs1, triangles, edges],
        positions,
        posed: part.positions,
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
        atlas: /^PdxMeshTextureAtlas/.test(part.material.shader) && part.uvs1 !== undefined,
        alphaTest: /alpha/i.test(part.material.shader),
      });
    }
  }
  return parts;
}

/** The warnings of the drawn mesh or entity, and why the flag asked for is not shown. */
let warningLines: string[] = [];
let flagProblem: string | undefined;

function showWarnings(warnings: ReadonlySet<string>, problems: readonly string[] = []): void {
  warningLines = [];
  if (problems.length > 0) warningLines.push('Not resolved:', ...problems);
  if (warnings.size > 0) warningLines.push('Textures not shown:', ...warnings);
  showErrorBox();
}

function showErrorBox(): void {
  const lines = flagProblem === undefined ? warningLines : [...warningLines, flagProblem];
  errorBox.hidden = lines.length === 0;
  errorBox.textContent = lines.join('\n');
}

/** The animation an instance plays now, if any. */
function animationOf(instance: Instance): PdxAnimation | undefined {
  if (playingKey === undefined) return undefined;
  const key = entity === undefined ? playingKey : instance.states[playingKey];
  return key === undefined ? undefined : animations.get(key);
}

/**
 * Poses every instance `seconds` into the animation: skins its parts and places it, the root at
 * its scale and an attachment on its parent's bone (parents come first).
 */
function pose(context: WebGL2RenderingContext, seconds: number): void {
  const worlds = new Map<Instance, Map<string, Float32Array>>();
  for (const instance of instances) {
    const animation = animationOf(instance);
    const frame = frameOf(animation, seconds);
    // Bone matrices in the mesh's space, by bone name, for the attachments on it.
    const bones = new Map<string, Float32Array>();
    const matrices = new Map<MeshShape, Float32Array[]>();
    for (const shape of instance.mesh.shapes) {
      if (shape.skeleton.length === 0) continue;
      const world = boneWorldMatrices(shape.skeleton, animation, frame);
      for (const [index, bone] of shape.skeleton.entries()) {
        const matrix = world[index];
        if (matrix !== undefined && !bones.has(bone.name)) bones.set(bone.name, matrix);
      }
      if (animation !== undefined) {
        matrices.set(
          shape,
          skinningMatrices(
            shape.skeleton,
            animation,
            frame,
            jointsOfBones(shape.skeleton, animation),
          ),
        );
      }
    }
    worlds.set(instance, bones);
    const parent = instance.parent;
    const bone =
      parent === undefined || instance.bone === undefined
        ? undefined
        : worlds.get(parent)?.get(instance.bone);
    instance.model = placement(instance.scale, parent, bone);
    for (const item of instance.parts) {
      if (item.part.skin === undefined) continue;
      const shapeMatrices = matrices.get(item.shape);
      const posed =
        shapeMatrices === undefined
          ? {
              positions: item.part.positions,
              normals: item.part.normals,
              tangents: item.part.tangents,
            }
          : skinPart(item.part, shapeMatrices);
      item.posed = posed.positions;
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
}

/** The bounds of every drawn vertex as placed now, in the drawn (Z mirrored) space. */
function boundsOf(): Bounds | undefined {
  return placedBounds(
    instances.flatMap((instance) =>
      instance.parts.map((item) => ({ model: instance.model, positions: item.posed })),
    ),
  );
}

function frameView(): void {
  const bounds = boundsOf();
  if (bounds === undefined) return;
  camera = framing(bounds, canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1);
  framed = true;
}

/** The status line: what plays and where it is. */
function showStatus(seconds: number): void {
  if (playingKey === undefined) {
    status.textContent = '';
    return;
  }
  const root = instances[0];
  const animation = root === undefined ? undefined : animationOf(root);
  const where =
    animation === undefined
      ? 'no animation on the root mesh'
      : `frame ${frameOf(animation, seconds).toFixed(1).padStart(5)} of ${String(animation.frames)} at ${String(Number(animation.fps.toFixed(2)))} fps`;
  status.textContent = `${entity === undefined ? '' : 'State '}${playingKey}: ${where}`;
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
  if (playing) {
    const seconds = (now - started) / 1000;
    pose(gl, seconds);
    showStatus(seconds);
  }
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.16, 0.17, 0.19, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(program);
  const uniform = (name: string): WebGLUniformLocation | null =>
    gl.getUniformLocation(program as WebGLProgram, name);
  const vector = (name: string, v: readonly number[]): void => {
    gl.uniform3f(uniform(name), v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
  };
  gl.uniformMatrix4fv(uniform('viewProjection'), false, viewProjection(camera, width / height));
  vector('light', LIGHT);
  vector('eye', eyeOf(camera));
  vector('primary', country.primary);
  vector('secondary', country.secondary);
  vector('tertiary', country.tertiary);
  gl.uniform1i(uniform('diffuse'), 0);
  gl.uniform1i(uniform('specularMap'), 1);
  gl.uniform1i(uniform('normalMap'), 2);
  gl.uniform1i(uniform('flagMap'), 3);
  gl.uniform1i(uniform('flagFromColours'), flag === undefined ? 1 : 0);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, flag?.texture ?? null);
  const lines = uniform('lines');
  for (const instance of instances) {
    gl.uniformMatrix4fv(uniform('model'), false, instance.model);
    for (const item of instance.parts) {
      gl.bindVertexArray(item.vao);
      gl.uniform1i(lines, 0);
      const normalMap = maps ? item.normalMap : undefined;
      const specularMap = maps ? item.specularMap : undefined;
      gl.uniform1i(uniform('textured'), item.texture === undefined ? 0 : 1);
      gl.uniform1i(uniform('normalMapped'), normalMap === undefined ? 0 : 1);
      gl.uniform1i(uniform('specularMapped'), specularMap === undefined ? 0 : 1);
      gl.uniform1i(uniform('countryColours'), item.countryColours ? 1 : 0);
      gl.uniform1i(uniform('atlas'), item.atlas ? 1 : 0);
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
  }
  gl.bindVertexArray(null);
  if (playing) requestAnimationFrame(draw);
}

function redraw(): void {
  if (!playing) requestAnimationFrame(draw);
}

function summary(): MeshSummary {
  const shapes = instances.flatMap((i) => i.mesh.shapes);
  const parts = instances.flatMap((i) => i.parts);
  const drawnParts = parts.map((d) => d.part);
  let base: MeshSummary = {
    shapes: shapes.filter((s) => !s.collision).length,
    collisionShapes: shapes.filter((s) => s.collision).length,
    vertices: drawnParts.reduce((sum, p) => sum + p.positions.length / 3, 0),
    triangles: drawnParts.reduce((sum, p) => sum + p.indices.length / 3, 0),
    bones: shapes.reduce((sum, s) => sum + s.skeleton.length, 0),
    textured,
    normalMapped: parts.filter((d) => d.normalMap !== undefined).length,
    specularMapped: parts.filter((d) => d.specularMap !== undefined).length,
    animation: entity === undefined ? playingKey : undefined,
    animations: offered,
    textures: textureSources,
  };
  const atlasParts = parts.filter((d) => d.atlas).length;
  if (atlasParts > 0) base = { ...base, flag: { parts: atlasParts, tag: flag?.tag } };
  if (entity === undefined) return base;
  return {
    ...base,
    entity: {
      name: entity.name,
      nodes: instances.map((i) => (i.bone === undefined ? i.name : `${i.name} on ${i.bone}`)),
      states: entity.states,
      state: playingKey,
      problems: entity.problems,
    },
  };
}

function showFacts(): void {
  const s = summary();
  const parts = instances.flatMap((i) => i.parts);
  const shaders = [...new Set(parts.map((d) => d.part.material.shader).filter((x) => x !== ''))];
  const items = [title];
  if (s.entity !== undefined) {
    const attached = s.entity.nodes.length - 1;
    items.push(
      `${instances[0]?.meshName ?? ''}${attached > 0 ? ` and ${String(attached)} attached` : ''}`,
    );
  }
  items.push(
    `${String(s.shapes)} shape${s.shapes === 1 ? '' : 's'}`,
    `${s.vertices.toLocaleString('en')} vertices`,
    `${s.triangles.toLocaleString('en')} triangles`,
    s.bones > 0 ? `${String(s.bones)} bones` : 'no skeleton',
    `${String(s.textured)} of ${String(parts.length)} parts textured`,
    `${String(s.normalMapped)} with normal maps, ${String(s.specularMapped)} with specular maps`,
    shaders.join(', '),
  );
  if (instances[0] !== undefined && instances[0].scale !== 1) {
    items.push(`scale ${String(instances[0].scale)}`);
  }
  if (s.flag !== undefined) {
    items.push(
      flag === undefined ? 'flag: the country colours' : `flag: ${flag.tag} (${flag.source})`,
    );
  }
  if (s.collisionShapes > 0) items.push(`${String(s.collisionShapes)} collision (hidden)`);
  for (const [name, source] of Object.entries(s.textures)) items.push(`${name} (${source})`);
  facts.replaceChildren(
    ...items.map((text) => {
      const span = document.createElement('span');
      span.textContent = text;
      return span;
    }),
  );
  if (s.entity !== undefined) {
    const attached = instances.slice(1).map((i) => `${i.name} on ${i.bone ?? ''} (${i.meshName})`);
    facts.title = attached.length === 0 ? '' : `Attached:\n${attached.join('\n')}`;
  } else {
    facts.title = '';
  }
}

/** Starts playing `key` (an animation or a state), or shows the bind pose for `undefined`. */
function play(key: string | undefined): void {
  playingKey = key;
  playing = key !== undefined;
  playButton.hidden = key === undefined;
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.textContent = playing ? 'Pause' : 'Play';
  started = performance.now();
  if (gl !== null) pose(gl, 0);
  showStatus(0);
  if (playing) requestAnimationFrame(draw);
  else redraw();
}

/** Builds the instances of a mesh or an entity and shows them. */
function show(
  context: WebGL2RenderingContext,
  nodes: readonly Omit<EntityNode, 'bytes'>[],
  meshes: readonly PdxMesh[],
  problems: readonly string[],
): void {
  clear(context);
  const warnings = new Set<string>();
  for (const [index, node] of nodes.entries()) {
    const mesh = meshes[index];
    if (mesh === undefined) continue;
    instances.push({
      name: node.name,
      meshName: node.meshName,
      mesh,
      parts: upload(context, mesh, node.textures, warnings),
      parent: node.parent === undefined ? undefined : instances[node.parent],
      bone: node.bone,
      scale: node.scale,
      states: node.states,
      model: scaling(node.scale),
    });
  }
  showWarnings(warnings, problems);
  colours.hidden = !instances.some((i) => i.parts.some((d) => d.countryColours || d.atlas));
  flagLabel.hidden = !instances.some((i) => i.parts.some((d) => d.atlas));
  pose(context, 0);
}

window.addEventListener('message', (event: MessageEvent<MeshHostMessage>) => {
  const message = event.data;
  if (gl === null || program === undefined) return;
  try {
    if (message.type === 'mesh') {
      title = message.name;
      entity = undefined;
      const keep = playingKey;
      playing = false;
      playingKey = undefined;
      animations.clear();
      const mesh = readMesh(Uint8Array.from(message.bytes));
      show(
        gl,
        [
          {
            name: message.name,
            parent: undefined,
            bone: undefined,
            meshName: message.name,
            textures: message.textures,
            scale: 1,
            states: {},
          },
        ],
        [mesh],
        [],
      );
      animationSelect.replaceChildren(
        new Option('Bind pose', ''),
        ...message.animations.map(
          (a) => new Option(`${a.name} (${String(a.frames)} frames)`, a.name),
        ),
      );
      offered = message.animations.map((a) => a.name);
      animationSelect.hidden = message.animations.length === 0;
      play(undefined);
      if (!framed) frameView();
      showFacts();
      if (keep !== undefined && message.animations.some((a) => a.name === keep)) {
        animationSelect.value = keep;
        vscode.postMessage({ type: 'animation', name: keep });
      }
      vscode.postMessage({ type: 'shown', summary: summary() });
    } else if (message.type === 'flag') {
      // Only the tag still asked for: a reply to an earlier one is dropped.
      if (message.tag !== flagInput.value.trim().toUpperCase()) return;
      if (flag !== undefined) gl.deleteTexture(flag.texture);
      flag = undefined;
      const texture = message.texture.ok ? textureOf(gl, message.texture) : undefined;
      if (texture !== undefined) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // A flag is drawn once across its part: no repeat at the edges.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        flag = {
          tag: message.tag,
          texture,
          source: message.texture.ok ? message.texture.source : '',
        };
      }
      flagProblem = message.texture.ok
        ? undefined
        : `Flag ${message.tag}: ${message.texture.message}`;
      showErrorBox();
      showFacts();
      redraw();
      vscode.postMessage({ type: 'shown', summary: summary() });
    } else if (message.type === 'animation') {
      animations.set(message.name, readAnimation(Uint8Array.from(message.bytes)));
      play(message.name);
      vscode.postMessage({ type: 'shown', summary: summary() });
    } else {
      title = message.name;
      const keep = playingKey;
      animations.clear();
      const problems = [...message.problems];
      for (const [key, bytes] of Object.entries(message.animations)) {
        try {
          animations.set(key, readAnimation(Uint8Array.from(bytes)));
        } catch (error) {
          problems.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      const meshes: PdxMesh[] = [];
      const nodes: Omit<EntityNode, 'bytes'>[] = [];
      for (const node of message.nodes) {
        try {
          meshes.push(readMesh(Uint8Array.from(node.bytes)));
          nodes.push(node);
        } catch (error) {
          // A mesh that cannot be read is left out, and so is what hangs on it.
          problems.push(
            `${node.meshName}: ${error instanceof Error ? error.message : String(error)}`,
          );
          meshes.push(readMesh(EMPTY_MESH));
          nodes.push({ ...node, textures: {} });
        }
      }
      entity = { name: message.name, states: [...message.states], problems };
      offered = [];
      show(gl, nodes, meshes, problems);
      animationSelect.replaceChildren(
        new Option('Bind pose', ''),
        ...message.states.map((state) => new Option(`State: ${state}`, state)),
      );
      animationSelect.hidden = message.states.length === 0;
      const first = keep !== undefined && message.states.includes(keep) ? keep : message.state;
      animationSelect.value = first ?? '';
      play(first);
      // Framed on the state's first frame, which can stand far from the bind pose.
      if (!framed) frameView();
      showFacts();
      vscode.postMessage({ type: 'shown', summary: summary() });
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
});

/** A mesh with no shapes, standing in for one that cannot be read. */
const EMPTY_MESH = new TextEncoder().encode('@@t@\n\tpdxasset i 2 1 0\n[object]\n');

animationSelect.addEventListener('change', () => {
  const key = animationSelect.value === '' ? undefined : animationSelect.value;
  if (key === undefined || entity !== undefined || animations.has(key)) {
    play(key);
    vscode.postMessage({ type: 'shown', summary: summary() });
    return;
  }
  vscode.postMessage({ type: 'animation', name: key });
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

flagInput.addEventListener('change', () => {
  const tag = flagInput.value.trim().toUpperCase();
  flagInput.value = tag;
  if (/^[A-Z0-9]{3}$/.test(tag)) {
    vscode.postMessage({ type: 'flag', tag });
    return;
  }
  if (flag !== undefined) gl?.deleteTexture(flag.texture);
  flag = undefined;
  flagProblem = tag === '' ? undefined : `Flag ${tag}: a country tag has three letters or digits`;
  showErrorBox();
  showFacts();
  redraw();
  vscode.postMessage({ type: 'shown', summary: summary() });
});

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
