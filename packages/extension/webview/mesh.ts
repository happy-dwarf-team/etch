// The webview script of the mesh preview (src/mesh-preview.ts) and the entity preview
// (src/entity-preview.ts): parses the posted `.mesh` files with `@etch/core/asset`, draws their
// shapes with WebGL2 under an orbit camera (collision shapes skipped, one level of detail of a mesh
// that has several), and plays an animation, skinned on the CPU each frame. A mesh preview draws
// one mesh and plays the animation the user picks. An entity preview draws the entity's mesh and
// its attachments, each on its parent's bone as the bone moves, and plays the state the user picks
// on all of them. The game's files are left-handed with Y up: Z is mirrored so a mesh does not
// show mirrored.
//
// The shading follows the game's mesh shader (`gfx/FX/pdxmesh.shader` and
// `standardfuncsgfx.fxh` of EU4 1.37.5, read, not copied): a squared half-Lambert term with
// ambient 0.2 and intensity 1.2; the normal map in tangent space (RGB - 0.5, green flipped,
// bitangent `cross(n, ta.xyz) * ta.w`); a Blinn-Phong highlight (exponent 10, times 2) scaled by
// the specular map's alpha times 2 and added; for `PdxMeshColor`, the specular map's R, G and B
// mask the country's three colours (the colour boxes, which a tag in the Country box fills with
// that country's colours as the host finds them); for `PdxMeshTextureAtlas` (a ship's sails, a map flag), the
// diffuse map's alpha blends in the diffuse colour times the country's flag, sampled with the
// second texture coordinates (`u1`). A colonial nation's region colour (the Region box), as the
// game's `AtlasHalfColor`, takes the flag's far half (u1's u over 0.5) and the tertiary colour's
// place; for `PdxMeshAlphaBlend` (and its `NoZWrite` variant, which
// does not write depth), the colour is blended over what is behind it by the diffuse map's alpha
// (`SRC_ALPHA`, `INV_SRC_ALPHA`), after the opaque parts. The light comes from the vanilla
// `LIGHT_DIRECTION` of
// `common/defines.lua` (-1, -1, 0.5, pointing away from the light). The map's fog of war, terra
// incognita, snow and distance fog are left out.
//
// Back faces are culled, as pdxmesh.shader's one rasterizer state for all its effects says
// (`CullMode = "CULL_BACK"`, `FrontCCW = no`: a front face runs clockwise on the screen). The Z
// mirror leaves the screen image as the game's, so a front face runs clockwise here too
// (`gl.frontFace(gl.CW)`); in vanilla's meshes 99.5% of the triangles turn that way round their
// normals. A sheet the artist meant to be seen from both sides (a ship's sails) is modelled twice,
// once each way, and shows the side that faces the camera, lit as that side. tree.shader names no
// rasterizer state, so the engine's default holds; its fields are Direct3D's, whose default culls
// back faces, and the map trees are culled the same (not confirmed in the game's code).
//
// A mesh the playset names as a map tree (`mapobject_<n>`) is drawn as the game's tree shader
// (`gfx/FX/tree.shader`, read, not copied) draws it, whatever shader its materials name: texels
// with a diffuse alpha under 0.5 are cut out, the same light, and no highlight. Its normal map
// reads the same (green not flipped, bitangent `cross(t, n) * ta.w`: the two signs cancel). Its
// tint map (the playset's `map/terrain/Tree_tint.bmp`) is laid over the diffuse colour at 0.5
// (`GetOverlay`), sampled at the second UVs (`u1`) shifted along u by the tree's turn: the game
// turns each tree by a random angle and shifts by that angle over a full turn, the preview by its
// Turn slider (0 by default). The map's colour map at the tree's place is laid over that at 0.25,
// the preview's Ground colour standing in for it (grey, #808080, changes nothing). Then the
// season colour: the season map (the playset's `map/terrain/Tree_season.bmp`, eight columns) at u
// `season / 8 + 1/16` and v the u1's v, less 0.5, is added, times a fade that is 0 in the map's
// southern half and rises to 1 at nine tenths of its height. The season value comes from the date
// and the playset's `map/seasons.txt`: the index of its `tree_*` block the date falls in, or how far
// it is through the gap after one (`seasonAt`). The preview takes the date from its Date slider
// (1 July by default) and the fade from its North slider (0 by default, which changes nothing).
// A province in the Place box sets both Ground and North (`applyPlace`): the host reads the
// colour maps at its position, and Ground mixes them for the date (`colourMapAt`).
// The random height and turn of the mesh itself are left out; its snow is below.
//
// Snow, as the game puts it on `PdxMeshSnow` parts (`ApplySnowMesh` in pdxmesh.shader) and map
// trees (`ApplySnowTree` in tree.shader) before the light: the game takes the amount from the map
// at the mesh's place and season, the preview from its Snow slider (0 by default). A mesh part
// blends to the snow colour (0.7 grey) where its normal points up and turns its normal up with it;
// a tree only where the normal points steeply up, more of it the more snow.
//
// An attachment's scale: its own pdxmesh and entity scale, not multiplied by its parent's (the
// bone's position is). Vanilla gives a soldier and the weapon in its hand the same scale (0.5).
//
// The particle effects a state's events start are drawn by an approximate player (particles.ts,
// the Particles button), after the meshes.

import {
  animationFits,
  boneWorldMatrices,
  colourMapAt,
  dayName,
  jointsOfBones,
  multiply,
  poseMatrix,
  readAnimation,
  readMesh,
  seasonAt,
  skinningMatrices,
  skinPart,
  TREE_SEASONS,
  type MeshPart,
  type MeshShape,
  type PdxAnimation,
  type PdxMesh,
  type SeasonSpan,
  type SeasonValue,
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
  onScreen,
  placedBones,
  placedBounds,
  placement,
  scaling,
  levelAtDistance,
  shownLevel,
  viewProjection,
  type Bounds,
  type OrbitCamera,
  type PlacedBone,
} from './view-math.ts';
import { ParticleLayer } from './particles.ts';
import { listenForZoomKeys } from './zoom-keys.ts';

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
const lodSelect = element('lod') as HTMLSelectElement;
const playButton = element('play') as HTMLButtonElement;
const frameInput = element('frame') as HTMLInputElement;
const wireButton = element('wireframe') as HTMLButtonElement;
const skeletonButton = element('skeleton') as HTMLButtonElement;
const particlesButton = element('particles') as HTMLButtonElement;
const boneTip = element('bone-tip');
const mapButtons = {
  diffuse: element('diffuse-map') as HTMLButtonElement,
  normal: element('normal-map') as HTMLButtonElement,
  specular: element('specular-map') as HTMLButtonElement,
};
const colours = element('colours');
const colourInputs = (['primary', 'secondary', 'tertiary'] as const).map(
  (key) => [key, element(key) as HTMLInputElement] as const,
);
const resetButton = element('reset') as HTMLButtonElement;
const zoomOutButton = element('zoom-out') as HTMLButtonElement;
const zoomInButton = element('zoom-in') as HTMLButtonElement;
const zoomLevel = element('zoom-level') as HTMLButtonElement;
zoomLevel.title =
  'The mesh against the view that fits all of it in (100 %). Click to fit it in again, keeping its turn (Ctrl+Shift+0).';
const flagLabel = element('flag');
const regionLabel = element('region');
const regionOn = element('region-on') as HTMLInputElement;
const regionInput = element('region-colour') as HTMLInputElement;
const flagInput = element('flag-tag') as HTMLInputElement;
const snowLabel = element('snow');
const snowInput = element('snow-amount') as HTMLInputElement;
const tintLabel = element('tint');
const tintInput = element('tint-turn') as HTMLInputElement;
const placeLabel = element('place');
const placeInput = element('place-province') as HTMLInputElement;
const groundLabel = element('ground');
const groundInput = element('ground-colour') as HTMLInputElement;
const seasonLabel = element('season');
const seasonDayInput = element('season-day') as HTMLInputElement;
const seasonDateOutput = element('season-date');
const seasonNorthInput = element('season-north') as HTMLInputElement;

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
// A colonial nation's region colour; alpha 0 when off.
uniform vec4 region;
uniform sampler2D flagMap;
// PdxMeshAlphaBlend: the diffuse alpha is the output's, for blending.
uniform bool blended;
// Drawn as the map's tree shader: alpha cut out, no highlight.
uniform bool tree;
// The Snow slider's amount, and whether this part takes snow (PdxMeshSnow, or a map tree).
uniform float snow;
uniform bool snowy;
// A map tree's tint map, and the Turn slider: how far along u the tint is shifted.
uniform sampler2D tintMap;
uniform bool tinted;
uniform float turn;
// The Ground colour: the map's colour map under a map tree.
uniform vec3 ground;
// A map tree's season map; the Season slider (its column, 0 to 1 over its width) and the North
// slider (how much of it the tree takes).
uniform sampler2D seasonMap;
uniform bool seasoned;
uniform float seasonTime;
uniform float north;
uniform bool lines;
// Towards the light.
uniform vec3 light;
uniform vec3 eye;
out vec4 colour;
// The game's GetOverlay: multiply where the overlay is dark, screen where it is light, by amount.
vec3 overlay(vec3 c, vec3 o, float amount) {
  vec3 low = 2.0 * o * c;
  vec3 high = 1.0 - 2.0 * (1.0 - o) * (1.0 - c);
  return mix(c, mix(high, low, vec3(lessThan(o, vec3(0.5)))), amount);
}
void main() {
  if (lines) { colour = vec4(0.1, 0.9, 1.0, 1.0); return; }
  vec4 base = textured ? texture(diffuse, vUv) : vec4(0.72, 0.72, 0.72, 1.0);
  if (tree && base.a < 0.5) discard;
  vec3 n = normalize(vNormal);
  if (normalMapped) {
    vec3 s = normalize(texture(normalMap, vUv).rgb - 0.5);
    s.g = -s.g;
    n = normalize(s.x * normalize(vTangent) + s.y * normalize(vBitangent) + s.z * n);
  }
  vec4 spec = specularMapped ? texture(specularMap, vUv) : vec4(0.0);
  vec3 c = base.rgb;
  if (tree && tinted) c = overlay(c, texture(tintMap, vec2(vUv1.x + turn, vUv1.y)).rgb, 0.5);
  if (tree) c = overlay(c, ground, 0.25);
  if (tree && seasoned) {
    c += (texture(seasonMap, vec2(seasonTime + 1.0 / 16.0, vUv1.y)).rgb - 0.5) * north;
  }
  if (snowy && tree) {
    float fade = clamp(
      clamp(n.y - clamp(1.0 - snow, 0.0, 1.0), 0.0, 1.0) * snow * 5.5 * clamp((n.y - 0.6) * 1000.0, 0.0, 1.0),
      0.0, 1.0);
    c = mix(c, vec3(0.7), fade);
    n = normalize(n + vec3(0.0, fade, 0.0));
  } else if (snowy) {
    float isSnow = snow * clamp((n.y - 0.1) * 100.0, 0.0, 1.0);
    c = mix(c, vec3(0.7), clamp(clamp(isSnow - 0.1, 0.0, 1.0) * 3.5, 0.0, 1.0));
    n = normalize(n + vec3(0.0, isSnow, 0.0));
  }
  if (atlas && textured) {
    vec3 flag = region.a > 0.0 && vUv1.x > 0.5
      ? region.rgb
      : flagFromColours
        ? (vUv1.x < 1.0 / 3.0 ? primary : vUv1.x < 2.0 / 3.0 ? secondary : tertiary)
        : texture(flagMap, vUv1).rgb;
    c = mix(c, flag * c, base.a);
  }
  if (countryColours) {
    c = mix(c, c * spec.r * primary, spec.r);
    c = mix(c, c * spec.g * secondary, spec.g);
    c = mix(c, c * spec.b * (region.a > 0.0 ? region.rgb : tertiary), spec.b);
  }
  float halfLambert = dot(n, light) * 0.5 + 0.5;
  halfLambert = 0.2 + 0.8 * halfLambert * halfLambert;
  c = clamp(halfLambert * c * 1.2, 0.0, 1.0);
  vec3 h = normalize(normalize(eye - vPosition) + light);
  float highlight = tree
    ? 0.0
    : clamp(pow(clamp(dot(h, n), 0.0, 1.0), 10.0) * 2.0, 0.0, 1.0) * spec.a * 2.0;
  colour = vec4(clamp(c + highlight, 0.0, 1.0), blended ? base.a : 1.0);
}`;

// The Bones button: lines and points already in the drawn space, over the model.
const BONE_VERTEX = `#version 300 es
in vec3 position;
uniform mat4 viewProjection;
uniform float pointSize;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  gl_PointSize = pointSize;
}`;

const BONE_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 tint;
uniform bool round;
out vec4 colour;
void main() {
  if (round && length(gl_PointCoord - 0.5) > 0.5) discard;
  colour = vec4(tint, 1.0);
}`;

/** The bones' lines, joints and the joints an attachment hangs on, red, green, blue 0-1. */
const BONE_COLOURS = {
  line: [1, 0.82, 0.25],
  joint: [1, 1, 1],
  attachment: [1, 0.35, 0.1],
} as const;

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
  /** A `PdxMeshSnow` part: the game puts snow on it. */
  readonly snow: boolean;
  /** A `PdxMeshTextureAtlas` part with second UVs: the flag is drawn on it. */
  readonly atlas: boolean;
  /** `PdxMeshAlphaBlend` parts are blended; `PdxMeshAlphaBlendNoZWrite` ones write no depth. */
  readonly blend: 'none' | 'blend' | 'noDepthWrite';
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
  /** Its skinned shapes' bones at the frame shown, in the drawn space; set by `pose`. */
  bones: PlacedBone[];
  /** Its bones' matrices at the frame shown, in the mesh's space, by name; set by `pose`. */
  boneMatrices: Map<string, Float32Array>;
}

let program: WebGLProgram | undefined;
/** The entity preview's particle effects (the Particles button). */
let particleLayer: ParticleLayer | undefined;
/** The Bones button's program, with its vertex array and buffer. */
let bonePass:
  { program: WebGLProgram; vao: WebGLVertexArrayObject; buffer: WebGLBuffer } | undefined;
/** Whether the skinned shapes' bones are drawn over the model (the Bones button). */
let skeletonShown = false;
let instances: Instance[] = [];
/** The uploaded textures, shared by the parts of a mesh that name them. */
let uploaded: WebGLTexture[] = [];
/** The mesh preview's file name, or the entity's name. */
let title = '';
/** Where each texture came from, or why it is missing. */
let textureSources: Record<string, string> = {};
/** Mesh preview: the animations beside the mesh. */
let offered: string[] = [];
/** The animations that can play, by key: a file name (mesh) or a game path (entity). */
const animations = new Map<string, PdxAnimation>();
/** Entity preview: its name, states, what could not be resolved and the particles of each state. */
let entity:
  | {
      name: string;
      states: string[];
      problems: string[];
      particles: Readonly<Record<string, readonly string[]>>;
    }
  | undefined;
/** Mesh preview: the map tree type (`mapobject_<n>`) that draws the mesh, if one does. */
let tree: string | undefined;
/** The Snow slider: how much snow `PdxMeshSnow` parts and map trees take, 0 to 1. */
let snowAmount = 0;
/** Mesh preview of a map tree: its tint map, uploaded, and where it came from. */
let tint: { texture: WebGLTexture; source: string } | undefined;
/** Why a map tree's tint map is not drawn. */
let tintProblem: string | undefined;
/** The Turn slider: the tree's turn the tint is shifted by, 0 to 1 of a full turn. */
let turn = 0;
/** The Ground colour box, as `#rrggbb`: the map's colour map under a map tree. */
let ground = '#808080';
/** Mesh preview of a map tree: its season map, uploaded, and where it came from. */
let seasonMap: { texture: WebGLTexture; source: string } | undefined;
/** Why a map tree's season map is not drawn. */
let seasonProblem: string | undefined;
/**
 * The playset's seasons (`map/seasons.txt`): the tree seasons by column, the map seasons, and
 * where they came from.
 */
let treeSeasons:
  | { spans: (SeasonSpan | undefined)[]; mapSpans: (SeasonSpan | undefined)[]; source: string }
  | undefined;
/** Why the tree seasons are not used, or what of them could not be read. */
let treeSeasonsProblem: string | undefined;
/** The Date slider: the day of the year, 0 for 1 January. */
let seasonDay = 181;
/** The North slider: how much of the season colour a tree takes, 0 (the map's south) to 1. */
let north = 0;
/**
 * The Place box's province, as the host found it: its position, the colour of each map season's
 * colour map there, and its North value. While it is set it gives Ground and North.
 */
let place:
  | {
      province: number;
      x: number;
      y: number;
      colours: readonly (readonly number[])[];
      north: number;
      source: string;
    }
  | undefined;
/** Why the Place box's province gives no place. */
let placeProblem: string | undefined;
/** Whether a `controls` message waits for the Place box's answer before it answers. */
let placeControls = false;
/** What plays: an animation's file name (mesh) or a state (entity); `undefined` for the bind pose. */
let playingKey: string | undefined;
let playing = false;
/** While playing: `performance.now()` at the animation's second 0. */
let started = 0;
/** The second of the animation every instance is posed at; playing resumes from it. */
let position = 0;
let wireframe = false;
/**
 * Which of the materials' maps are drawn (the Diffuse, Normal and Spec buttons). Without the
 * diffuse map a part is plain grey, and what its alpha marks (a flag, see-through parts, a map
 * tree's cut-out leaves) goes with it; without the specular map, the highlight and a
 * `PdxMeshColor` part's country colours, which its R, G and B mask.
 */
const maps = { diffuse: true, normal: true, specular: true };
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
/** The Region box, as `#rrggbb`: a colonial nation's region colour; `undefined` when off. */
let region: string | undefined;
/** The flag on `PdxMeshTextureAtlas` parts: a tag's, or none for the country colours' stripes. */
let flag: { tag: string; texture: WebGLTexture; source: string } | undefined;
/**
 * The Country box's tag whose colours the colour boxes hold, with where each came from; undefined
 * when the colours are the defaults or set by hand.
 */
let countryOf: { tag: string; from: readonly string[] } | undefined;
/** The tag last asked for, so that Enter in the Country box asks again for the same tag. */
let askedTag = '';
/** Whether a `controls` message waits for the host's answer to the Country box's tag. */
let tagControls = false;

/** Whether the camera has framed a mesh yet: a reload keeps the user's view. */
let framed = false;

function fail(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
  vscode.postMessage({ type: 'failed', message });
}

function compile(
  context: WebGL2RenderingContext,
  vertex = VERTEX,
  fragment = FRAGMENT,
): WebGLProgram {
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
  context.attachShader(linked, shader(context.VERTEX_SHADER, vertex));
  context.attachShader(linked, shader(context.FRAGMENT_SHADER, fragment));
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
        snow: /^PdxMeshSnow/.test(part.material.shader),
        atlas: /^PdxMeshTextureAtlas/.test(part.material.shader) && part.uvs1 !== undefined,
        blend: /^PdxMeshAlphaBlendNoZWrite/.test(part.material.shader)
          ? 'noDepthWrite'
          : /^PdxMeshAlphaBlend/.test(part.material.shader)
            ? 'blend'
            : 'none',
      });
    }
  }
  return parts;
}

/** The warnings of the drawn mesh or entity, and why the flag asked for is not shown. */
let warningLines: string[] = [];
let flagProblem: string | undefined;
/** Why the Country box's tag gives no colours. */
let colourProblem: string | undefined;

function showWarnings(warnings: ReadonlySet<string>, problems: readonly string[] = []): void {
  warningLines = [];
  if (problems.length > 0) warningLines.push('Not resolved:', ...problems);
  if (warnings.size > 0) warningLines.push('Textures not shown:', ...warnings);
  showErrorBox();
}

function showErrorBox(): void {
  const parts = instances.flatMap((i) => i.parts);
  const lines = [
    warningLines,
    parts.some((d) => d.atlas) ? (flagProblem ?? []) : [],
    parts.some((d) => d.countryColours) ? (colourProblem ?? []) : [],
    tintProblem ?? [],
    seasonProblem ?? [],
    treeSeasonsProblem ?? [],
    placeProblem ?? [],
  ].flat();
  errorBox.hidden = lines.length === 0;
  errorBox.textContent = lines.join('\n');
}

/** The level of detail picked in the LOD box; each mesh shows its nearest (`shownLevel`). */
let lodLevel = 0;
/**
 * Whether the LOD box is on Auto: each mesh shows the level its `loddist` gives at the camera's
 * distance to its origin, as the game picks it (`levelAtDistance`).
 */
let lodAuto = false;

/** The levels of detail of an instance's mesh, most detailed first; empty without levels. */
function levelsOf(instance: Instance): number[] {
  const levels = instance.mesh.shapes.flatMap((s) => (s.lod === undefined ? [] : [s.lod]));
  return [...new Set(levels)].sort((a, b) => a - b);
}

/** The level of detail an instance shows now: by the camera's distance on Auto, else the pick. */
function levelShown(instance: Instance): number | undefined {
  const levels = levelsOf(instance);
  if (lodAuto) {
    // The origin in the drawn space mirrors the model's Z, as the camera's space does.
    const m = instance.model;
    const [ex = 0, ey = 0, ez = 0] = eyeOf(camera);
    const distance = Math.hypot(ex - (m[12] ?? 0), ey - (m[13] ?? 0), ez + (m[14] ?? 0));
    const level = levelAtDistance(distance, instance.mesh.lodDistances ?? []);
    if (level !== undefined) return shownLevel(levels, level);
  }
  return shownLevel(levels, lodLevel);
}

/** The parts drawn now: those of shapes without a level, and of the level the instance shows. */
function drawnParts(instance: Instance): DrawnPart[] {
  const level = levelShown(instance);
  return instance.parts.filter((d) => d.shape.lod === undefined || d.shape.lod === level);
}

/** Offers the levels of detail of the drawn meshes, keeping the pick when it is still offered. */
function offerLevels(): void {
  const levels = [...new Set(instances.flatMap(levelsOf))].sort((a, b) => a - b);
  if (!levels.includes(lodLevel)) lodLevel = levels[0] ?? 0;
  const distances = instances.some((i) => (i.mesh.lodDistances?.length ?? 0) > 0);
  if (!distances) lodAuto = false;
  lodSelect.replaceChildren(
    ...(distances ? [new Option('LOD auto', 'auto')] : []),
    ...levels.map((level) => new Option(`LOD ${String(level)}`, String(level))),
  );
  lodSelect.value = lodAuto ? 'auto' : String(lodLevel);
  lodSelect.hidden = levels.length < 2;
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
    // The skeletons for the Bones button, placed once the instance's model is known.
    const skeletons: { skeleton: MeshShape['skeleton']; world: Float32Array[] }[] = [];
    for (const shape of instance.mesh.shapes) {
      if (shape.skeleton.length === 0) continue;
      const world = boneWorldMatrices(shape.skeleton, animation, frame);
      // Shapes of one mesh share their skeleton: each bone once.
      if (shape.skeleton.some((bone) => !bones.has(bone.name))) {
        skeletons.push({ skeleton: shape.skeleton, world });
      }
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
    instance.boneMatrices = bones;
    const parent = instance.parent;
    const bone =
      parent === undefined || instance.bone === undefined
        ? undefined
        : worlds.get(parent)?.get(instance.bone);
    instance.model = placement(instance.scale, parent, bone);
    const placed = new Map<string, PlacedBone>();
    for (const { skeleton, world } of skeletons) {
      for (const one of placedBones(skeleton, world, instance.model)) {
        if (!placed.has(one.name)) placed.set(one.name, one);
      }
    }
    instance.bones = [...placed.values()];
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
      drawnParts(instance).map((item) => ({ model: instance.model, positions: item.posed })),
    ),
  );
}

function frameView(): void {
  const bounds = boundsOf();
  if (bounds === undefined) return;
  camera = framing(bounds, canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1);
  fitDistance = camera.distance;
  framed = true;
}

/**
 * The camera's distance when the whole mesh fits in, from the framing as it opened or as Reset
 * view or Fit last set it: 100 % in the zoom's level.
 */
let fitDistance: number | undefined;

/** Fits the whole mesh in again from where the camera looks, keeping its turn (Ctrl+Shift+0). */
function fitModel(): void {
  const bounds = boundsOf();
  if (bounds === undefined) return;
  const fitted = framing(
    bounds,
    canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 1,
  );
  fitDistance = fitted.distance;
  camera = { ...camera, distance: fitted.distance, target: fitted.target };
  redraw();
}

/** How far one step of − or + (and of Ctrl+- or Ctrl+=) moves the camera. */
const ZOOM_STEP = 1.25;

function dolly(factor: number): void {
  camera.distance *= factor;
  redraw();
}

/** The zoom's level: the mesh's size against the fitted view, `Fit` when it is that view. */
function showZoom(): void {
  if (fitDistance === undefined || camera.distance <= 0) {
    zoomLevel.textContent = 'Fit';
    return;
  }
  const percent = Math.round((fitDistance / camera.distance) * 100);
  const label =
    Math.abs(camera.distance - fitDistance) < fitDistance * 1e-3 ? 'Fit' : `${String(percent)} %`;
  if (zoomLevel.textContent !== label) zoomLevel.textContent = label;
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
  status.textContent = `${entity === undefined ? '' : 'State '}${playingKey}: ${where}${particleWords()}`;
}

/** The status line's words on the state's particle effects. */
function particleWords(): string {
  if (playingKey === undefined) return '';
  const named = entity?.particles[playingKey] ?? [];
  if (named.length === 0) return '';
  const drawn = particleLayer?.of(playingKey).length ?? 0;
  if (drawn === 0) return ` · particles not drawn: ${named.join(', ')}`;
  if (particleLayer?.on !== true) return ` · particles off: ${named.join(', ')}`;
  const alive = `${String(particleLayer.count)} alive`;
  return ` · particles (approximate, ${alive}): ${named.join(', ')}`;
}

/**
 * The seconds one loop of the playing state lasts for a node: its own animation's, else the root
 * mesh's (a musket plays none of its own in the soldier's hand), if either plays one.
 */
function clipOf(node: number): number | undefined {
  const instance = instances[node];
  const own = instance === undefined ? undefined : animationOf(instance);
  const animation = own ?? rootAnimation();
  return animation === undefined || animation.fps <= 0
    ? undefined
    : animation.frames / animation.fps;
}

/**
 * The matrix in the file's space, as posed now, of the bone or else the locator (a musket's
 * `muzzle`, on its bone if it names one) an event starts on; the node's origin without either.
 */
function nodeMatrix(node: number, bone: string | undefined): Float32Array | undefined {
  const instance = instances[node];
  if (instance === undefined) return undefined;
  if (bone === undefined) return instance.model;
  const matrix = instance.boneMatrices.get(bone);
  if (matrix !== undefined) return multiply(instance.model, matrix);
  const locator = instance.mesh.locators.find((one) => one.name === bone);
  if (locator === undefined) return instance.model;
  const local = poseMatrix({ t: locator.position, q: locator.rotation, s: [1, 1, 1] });
  const parent =
    locator.parent === undefined ? undefined : instance.boneMatrices.get(locator.parent);
  return multiply(instance.model, parent === undefined ? local : multiply(parent, local));
}

/** The animation the frame slider moves through: the root mesh's. */
function rootAnimation(): PdxAnimation | undefined {
  const root = instances[0];
  return root === undefined ? undefined : animationOf(root);
}

/** The whole frame of `animation` that `seconds` falls in. */
function frameAt(animation: PdxAnimation, seconds: number): number {
  // A frame stepped to is `frame / fps` seconds, which can read back a hair under the frame.
  const frame = Math.floor(frameOf(animation, seconds) + 1e-6);
  return Math.max(0, Math.min(animation.frames - 1, frame));
}

/** The frame slider: over the root mesh's animation, at the frame shown; hidden without one. */
function showFrame(seconds: number): void {
  const animation = rootAnimation();
  frameInput.hidden = animation === undefined || animation.frames < 2;
  if (animation === undefined) return;
  const frame = frameAt(animation, seconds);
  frameInput.max = String(Math.max(0, animation.frames - 1));
  frameInput.value = String(frame);
  frameInput.setAttribute(
    'aria-valuetext',
    `frame ${String(frame)} of ${String(animation.frames)}`,
  );
}

/** Poses every instance `seconds` into the animation and shows where on the status line and slider. */
function showAt(context: WebGL2RenderingContext, seconds: number): void {
  position = seconds;
  pose(context, seconds);
  particleLayer?.advance(
    entity === undefined ? undefined : playingKey,
    seconds,
    clipOf,
    nodeMatrix,
  );
  showStatus(seconds);
  showFrame(seconds);
}

/** Plays or pauses; playing goes on from the frame shown. */
function setPlaying(on: boolean): void {
  playing = on && playingKey !== undefined;
  playButton.setAttribute('aria-pressed', String(playing));
  playButton.textContent = playing ? 'Pause' : 'Play';
  if (playing) {
    started = performance.now() - position * 1000;
    requestAnimationFrame(draw);
  }
}

/** Pauses and poses every instance at a frame of the root mesh's animation. */
function goToFrame(frame: number): void {
  const animation = rootAnimation();
  if (gl === null || animation === undefined || animation.fps <= 0) return;
  setPlaying(false);
  const frames = Math.max(1, animation.frames);
  const wrapped = ((Math.round(frame) % frames) + frames) % frames;
  showAt(gl, wrapped / animation.fps);
  redraw();
}

/** The canvas's clear colour, behind the mesh. */
const BACKGROUND = [0.16, 0.17, 0.19] as const;

/** Draws a frame and asks for the next while an animation plays. */
function draw(now: number): void {
  render(now);
  if (playing) requestAnimationFrame(draw);
}

/**
 * The canvas pixels the mesh covers (those that differ from the background colour) and their
 * mean colour; read at once after `render`, before the browser shows the frame and clears it.
 */
function drawnColour(context: WebGL2RenderingContext): {
  pixels: number;
  mean: [number, number, number];
} {
  const width = context.drawingBufferWidth;
  const height = context.drawingBufferHeight;
  const rgba = new Uint8Array(width * height * 4);
  context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, rgba);
  const [br, bg, bb] = BACKGROUND.map((v) => Math.round(v * 255)) as [number, number, number];
  let pixels = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const pr = rgba[i] ?? 0;
    const pg = rgba[i + 1] ?? 0;
    const pb = rgba[i + 2] ?? 0;
    if (Math.abs(pr - br) + Math.abs(pg - bg) + Math.abs(pb - bb) <= 3) continue;
    pixels++;
    r += pr;
    g += pg;
    b += pb;
  }
  if (pixels === 0) return { pixels, mean: [0, 0, 0] };
  return {
    pixels,
    mean: [r / pixels, g / pixels, b / pixels].map(Math.round) as [number, number, number],
  };
}

function render(now: number): void {
  if (gl === null || program === undefined) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  if (playing) showAt(gl, (now - started) / 1000);
  gl.viewport(0, 0, width, height);
  gl.clearColor(...BACKGROUND, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  // Back faces culled, as the game's rasterizer state does (see the notes at the top).
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.frontFace(gl.CW);
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
  const [rr, rg, rb] = region === undefined ? [0, 0, 0] : hexColour(region);
  gl.uniform4f(uniform('region'), rr ?? 0, rg ?? 0, rb ?? 0, region === undefined ? 0 : 1);
  gl.uniform1i(uniform('tree'), tree === undefined ? 0 : 1);
  gl.uniform1f(uniform('snow'), snowAmount);
  gl.uniform1i(uniform('tintMap'), 4);
  gl.uniform1i(uniform('tinted'), tree !== undefined && tint !== undefined ? 1 : 0);
  gl.uniform1f(uniform('turn'), turn);
  vector('ground', hexColour(ground));
  gl.uniform1i(uniform('seasonMap'), 5);
  gl.uniform1i(uniform('seasoned'), tree !== undefined && seasonMap !== undefined ? 1 : 0);
  gl.uniform1f(uniform('seasonTime'), (seasonValue()?.value ?? 0) / 8);
  gl.uniform1f(uniform('north'), north);
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, seasonMap?.texture ?? null);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, tint?.texture ?? null);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, flag?.texture ?? null);
  const lines = uniform('lines');
  // Opaque parts first, then the blended ones over them, as the game draws its alpha-blended
  // effects after the opaque ones. A map tree is drawn by the tree shader, which does not blend.
  const items = instances.flatMap((instance) =>
    drawnParts(instance).map((item) => ({
      instance,
      item,
      blend: tree === undefined ? item.blend : 'none',
    })),
  );
  const opaque = items.filter((entry) => entry.blend === 'none');
  const blended = items.filter((entry) => entry.blend !== 'none');
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
  for (const { instance, item, blend } of [...opaque, ...blended]) {
    gl.uniformMatrix4fv(uniform('model'), false, instance.model);
    if (blend === 'none') gl.disable(gl.BLEND);
    else gl.enable(gl.BLEND);
    gl.depthMask(blend !== 'noDepthWrite');
    gl.uniform1i(uniform('blended'), blend === 'none' ? 0 : 1);
    gl.uniform1i(uniform('snowy'), item.snow || tree !== undefined ? 1 : 0);
    gl.bindVertexArray(item.vao);
    gl.uniform1i(lines, 0);
    const texture = maps.diffuse ? item.texture : undefined;
    const normalMap = maps.normal ? item.normalMap : undefined;
    const specularMap = maps.specular ? item.specularMap : undefined;
    gl.uniform1i(uniform('textured'), texture === undefined ? 0 : 1);
    gl.uniform1i(uniform('normalMapped'), normalMap === undefined ? 0 : 1);
    gl.uniform1i(uniform('specularMapped'), specularMap === undefined ? 0 : 1);
    gl.uniform1i(uniform('countryColours'), item.countryColours && tree === undefined ? 1 : 0);
    gl.uniform1i(uniform('atlas'), item.atlas && tree === undefined ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture ?? null);
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
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  particleLayer?.draw(
    viewProjection(camera, width / height),
    eyeOf(camera),
    instances[0]?.scale ?? 1,
  );
  drawSkeleton(gl, viewProjection(camera, width / height), ratio);
  gl.bindVertexArray(null);
  if (skeletonShown) showBoneTip();
}

/** The bones of an instance that attachments hang on, with the names of what hangs there. */
function attachmentBones(instance: Instance): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const child of instances) {
    if (child.parent !== instance || child.bone === undefined) continue;
    found.set(child.bone, [...(found.get(child.bone) ?? []), child.name]);
  }
  return found;
}

/**
 * The Bones button: a line from each bone to its parent, a dot on each joint and a bigger one in
 * another colour where an attachment hangs, all over the model (no depth test), so that bones
 * inside it show.
 */
function drawSkeleton(
  context: WebGL2RenderingContext,
  projection: Float32Array,
  ratio: number,
): void {
  if (!skeletonShown || bonePass === undefined) return;
  const lines: number[] = [];
  const joints: number[] = [];
  const marked: number[] = [];
  for (const instance of instances) {
    const carried = attachmentBones(instance);
    for (const bone of instance.bones) {
      if (bone.parent !== undefined) lines.push(...bone.parent, ...bone.at);
      (carried.has(bone.name) ? marked : joints).push(...bone.at);
    }
  }
  const pass = bonePass;
  context.useProgram(pass.program);
  context.disable(context.DEPTH_TEST);
  context.uniformMatrix4fv(
    context.getUniformLocation(pass.program, 'viewProjection'),
    false,
    projection,
  );
  context.bindVertexArray(pass.vao);
  context.bindBuffer(context.ARRAY_BUFFER, pass.buffer);
  const draw = (
    data: readonly number[],
    mode: number,
    [r = 0, g = 0, b = 0]: readonly number[],
    size: number,
  ): void => {
    if (data.length === 0) return;
    context.bufferData(context.ARRAY_BUFFER, new Float32Array(data), context.STREAM_DRAW);
    context.uniform3f(context.getUniformLocation(pass.program, 'tint'), r, g, b);
    context.uniform1f(context.getUniformLocation(pass.program, 'pointSize'), size * ratio);
    context.uniform1i(
      context.getUniformLocation(pass.program, 'round'),
      mode === context.POINTS ? 1 : 0,
    );
    context.drawArrays(mode, 0, data.length / 3);
  };
  draw(lines, context.LINES, BONE_COLOURS.line, 1);
  draw(joints, context.POINTS, BONE_COLOURS.joint, 5);
  draw(marked, context.POINTS, BONE_COLOURS.attachment, 10);
  context.enable(context.DEPTH_TEST);
}

function redraw(): void {
  // On Auto the level follows the camera, so the bar's level does too.
  if (lodAuto) showFacts();
  showZoom();
  if (!playing) requestAnimationFrame(draw);
}

function summary(): MeshSummary {
  const shapes = instances.flatMap((i) => i.mesh.shapes);
  const parts = instances.flatMap(drawnParts);
  const meshParts = parts.map((d) => d.part);
  let base: MeshSummary = {
    shapes: new Set(parts.map((d) => d.shape)).size,
    collisionShapes: shapes.filter((s) => s.collision).length,
    vertices: meshParts.reduce((sum, p) => sum + p.positions.length / 3, 0),
    triangles: meshParts.reduce((sum, p) => sum + p.indices.length / 3, 0),
    bones: shapes.reduce((sum, s) => sum + s.skeleton.length, 0),
    textured: parts.filter((d) => d.texture !== undefined).length,
    normalMapped: parts.filter((d) => d.normalMap !== undefined).length,
    specularMapped: parts.filter((d) => d.specularMap !== undefined).length,
    animation: entity === undefined ? playingKey : undefined,
    animations: offered,
    textures: textureSources,
    maps: { ...maps },
  };
  if (skeletonShown) {
    base = {
      ...base,
      skeleton: {
        bones: instances.reduce((sum, i) => sum + i.bones.length, 0),
        attachments: instances.flatMap((i) => [...attachmentBones(i).keys()]),
      },
    };
  }
  const atlasParts = parts.filter((d) => d.atlas).length;
  if (atlasParts > 0) base = { ...base, flag: { parts: atlasParts, tag: flag?.tag } };
  const regionParts = parts.filter((d) => d.atlas || d.countryColours).length;
  if (regionParts > 0 && region !== undefined && tree === undefined) base = { ...base, region };
  if (parts.some((d) => d.countryColours)) {
    const [primary = '', secondary = '', tertiary = ''] = colourInputs.map(([, i]) => i.value);
    base = {
      ...base,
      country: { tag: countryOf?.tag, colours: [primary, secondary, tertiary] },
    };
  }
  const levels = [...new Set(instances.flatMap(levelsOf))].sort((a, b) => a - b);
  if (levels.length > 0) {
    const from = instances
      .map((i) => i.mesh.lodDistances?.[levelShown(i) ?? -1])
      .find((distance) => distance !== undefined);
    const shown = lodAuto
      ? (instances.map(levelShown).find((level) => level !== undefined) ?? lodLevel)
      : lodLevel;
    base = {
      ...base,
      lod: {
        level: shown,
        levels,
        ...(from === undefined ? {} : { from }),
        ...(lodAuto ? { auto: true } : {}),
      },
    };
  }
  if (tree !== undefined) base = { ...base, tree };
  const animation = rootAnimation();
  if (animation !== undefined) {
    base = {
      ...base,
      frame: { at: frameAt(animation, position), of: animation.frames, playing },
    };
  }
  const blendedParts = tree === undefined ? parts.filter((d) => d.blend !== 'none').length : 0;
  if (blendedParts > 0) base = { ...base, blended: blendedParts };
  const snowyParts = parts.filter((d) => d.snow || tree !== undefined).length;
  if (snowyParts > 0) base = { ...base, snow: { parts: snowyParts, amount: snowAmount } };
  if (tree !== undefined) {
    base = {
      ...base,
      tint: { source: tint?.source, turn },
      ground,
      season: {
        source: seasonMap?.source,
        seasons: treeSeasons?.source,
        day: seasonDay,
        value: seasonValue()?.value,
        north,
      },
    };
    if (place !== undefined) {
      base = {
        ...base,
        place: { province: place.province, source: place.source, ground, north },
      };
    }
  }
  if (entity === undefined) return base;
  return {
    ...base,
    entity: {
      name: entity.name,
      nodes: instances.map((i) => (i.bone === undefined ? i.name : `${i.name} on ${i.bone}`)),
      states: entity.states,
      state: playingKey,
      problems: entity.problems,
      particles: playingKey === undefined ? [] : [...(entity.particles[playingKey] ?? [])],
      ...(particleLayer?.any === true && particleLayer.on
        ? { liveParticles: particleLayer.count }
        : {}),
    },
  };
}

/** Where a colour came from, for the bar: a `common/country_colors` file's name, or `flag`. */
function shortSource(from: string): string {
  return from === 'the flag' ? 'flag' : (from.split('/').pop() ?? from);
}

function showFacts(): void {
  const s = summary();
  const parts = instances.flatMap(drawnParts);
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
    tree === undefined
      ? shaders.join(', ')
      : `${tree}: the map's tree shader${shaders.length > 0 ? `, not ${shaders.join(', ')}` : ''}`,
  );
  const off = (['diffuse', 'normal', 'specular'] as const).filter((key) => !maps[key]);
  if (off.length > 0) {
    const coloured = tree === undefined && parts.some((d) => d.countryColours);
    items.push(
      `maps off: ${off.join(', ')}${!maps.specular && coloured ? ' (no country colours without the specular map)' : ''}`,
    );
  }
  if (instances[0] !== undefined && instances[0].scale !== 1) {
    items.push(`scale ${String(instances[0].scale)}`);
  }
  if (s.flag !== undefined) {
    items.push(
      flag === undefined ? 'flag: the country colours' : `flag: ${flag.tag} (${flag.source})`,
    );
  }
  if (s.country !== undefined) {
    items.push(
      countryOf === undefined
        ? 'colours: set by hand'
        : `colours: ${countryOf.tag} (${[...new Set(countryOf.from.map(shortSource))].join(', ')})`,
    );
  }
  if (s.lod !== undefined && s.lod.levels.length > 1) {
    const from = s.lod.from === undefined ? '' : ` (from ${String(s.lod.from)})`;
    const auto = s.lod.auto === true ? ' by distance' : '';
    items.push(`LOD ${String(s.lod.level)}${auto} of ${s.lod.levels.join(', ')}${from}`);
  }
  if (s.collisionShapes > 0) items.push(`${String(s.collisionShapes)} collision (hidden)`);
  if (tree !== undefined && tint !== undefined) items.push(`Tree_tint.bmp (${tint.source})`);
  if (tree !== undefined && seasonMap !== undefined) {
    items.push(`Tree_season.bmp (${seasonMap.source})`);
  }
  if (tree !== undefined && treeSeasons !== undefined) {
    items.push(`seasons.txt (${treeSeasons.source})`);
  }
  if (tree !== undefined && place !== undefined) {
    items.push(
      `province ${String(place.province)} at ${String(place.x)}, ${String(place.y)}: colormap_*.dds (${place.source})`,
    );
  }
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
  playButton.hidden = key === undefined;
  position = 0;
  if (gl !== null) showAt(gl, 0);
  setPlaying(key !== undefined);
  if (!playing) redraw();
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
      bones: [],
      boneMatrices: new Map(),
    });
  }
  showWarnings(warnings, problems);
  colours.hidden = !instances.some((i) => i.parts.some((d) => d.countryColours || d.atlas));
  flagLabel.hidden = colours.hidden;
  regionLabel.hidden = colours.hidden;
  snowLabel.hidden = tree === undefined && !instances.some((i) => i.parts.some((d) => d.snow));
  tintLabel.hidden = tree === undefined || tint === undefined;
  placeLabel.hidden = tree === undefined;
  groundLabel.hidden = tree === undefined;
  seasonLabel.hidden = tree === undefined || seasonMap === undefined;
  const has = (map: (d: DrawnPart) => WebGLTexture | undefined): boolean =>
    instances.some((i) => i.parts.some((d) => map(d) !== undefined));
  mapButtons.diffuse.disabled = !has((d) => d.texture);
  mapButtons.normal.disabled = !has((d) => d.normalMap);
  mapButtons.specular.disabled = !has((d) => d.specularMap);
  skeletonButton.disabled = !instances.some((i) =>
    i.mesh.shapes.some((s) => s.skeleton.length > 0),
  );
  offerLevels();
  pose(context, 0);
}

window.addEventListener('message', (event: MessageEvent<MeshHostMessage>) => {
  const message = event.data;
  if (gl === null || program === undefined) return;
  try {
    if (message.type === 'mesh') {
      title = message.name;
      entity = undefined;
      tree = message.tree;
      if (tint !== undefined) gl.deleteTexture(tint.texture);
      tint = undefined;
      tintProblem = undefined;
      if (message.tint?.ok === true) {
        const texture = textureOf(gl, message.tint);
        if (texture !== undefined) tint = { texture, source: message.tint.source };
      } else if (message.tint !== undefined) {
        tintProblem = `Tree tint: ${message.tint.message}`;
      }
      if (seasonMap !== undefined) gl.deleteTexture(seasonMap.texture);
      seasonMap = undefined;
      seasonProblem = undefined;
      if (message.season?.ok === true) {
        const texture = textureOf(gl, message.season);
        if (texture !== undefined) seasonMap = { texture, source: message.season.source };
      } else if (message.season !== undefined) {
        seasonProblem = `Tree season: ${message.season.message}`;
      }
      treeSeasons = undefined;
      treeSeasonsProblem = undefined;
      if (message.seasons?.ok === true) {
        treeSeasons = {
          spans: message.seasons.spans.map((span) => span ?? undefined),
          mapSpans: message.seasons.mapSpans.map((span) => span ?? undefined),
          source: message.seasons.source,
        };
        if (message.seasons.problems.length > 0) {
          treeSeasonsProblem = `Tree seasons: map/seasons.txt: ${message.seasons.problems.join('; ')}`;
        }
      } else if (message.seasons !== undefined) {
        treeSeasonsProblem = `Tree seasons: ${message.seasons.message}`;
      }
      showSeasonDate();
      applyPlace();
      const keep = playingKey;
      playing = false;
      playingKey = undefined;
      animations.clear();
      const mesh = readMesh(Uint8Array.from(message.bytes));
      particleLayer?.load([], {}, () => undefined);
      particlesButton.hidden = true;
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
    } else if (message.type === 'controls') {
      const {
        maps: mapsOn,
        region: regionColour,
        colours: countryColours,
        snow,
        turn: turned,
        ground: groundColour,
        day,
        north: northward,
        place: province,
        lod: lodPick,
        distance,
        frame,
        skeleton,
        particles,
        tag: countryTag,
      } = message.controls;
      if (particles !== undefined) setParticles(particles);
      if (frame !== undefined) goToFrame(frame);
      if (skeleton !== undefined) setSkeleton(skeleton);
      if (lodPick !== undefined) {
        lodAuto = lodPick === 'auto' && lodSelect.querySelector('option[value="auto"]') !== null;
        if (lodPick !== 'auto') lodLevel = lodPick;
        lodSelect.value = lodAuto ? 'auto' : String(lodLevel);
      }
      if (distance !== undefined) camera.distance = distance;
      if (lodPick !== undefined || distance !== undefined) showFacts();
      // An empty Place box first, so that Ground and North below are the user's again.
      if (province === null) askPlace('');
      for (const key of ['diffuse', 'normal', 'specular'] as const) {
        const on = mapsOn?.[key];
        if (on !== undefined) setMap(key, on);
      }
      if (regionColour !== undefined) {
        region = regionColour ?? undefined;
        regionOn.checked = regionColour !== null;
        if (regionColour !== null) regionInput.value = regionColour;
      }
      for (const [key, input] of colourInputs) {
        const value = countryColours?.[key];
        if (value === undefined) continue;
        input.value = value;
        country[key] = hexColour(value);
        // As a colour box changed by hand: the colours are no longer the tag's.
        countryOf = undefined;
      }
      if (snow !== undefined) {
        snowAmount = snow;
        snowInput.value = String(snow);
      }
      if (turned !== undefined) {
        turn = turned;
        tintInput.value = String(turned);
      }
      if (groundColour !== undefined) {
        ground = groundColour;
        groundInput.value = groundColour;
      }
      if (day !== undefined) {
        seasonDay = day;
        seasonDayInput.value = String(day);
        showSeasonDate();
      }
      if (northward !== undefined) {
        north = northward;
        seasonNorthInput.value = String(northward);
      }
      applyPlace();
      if (typeof province === 'number' && askPlace(String(province))) {
        // The answer comes with the host's reply.
        placeControls = true;
        return;
      }
      if (countryTag !== undefined) {
        flagInput.value = countryTag;
        if (askCountry()) {
          // The answer comes with the host's reply.
          tagControls = true;
          return;
        }
      }
      render(performance.now());
      vscode.postMessage({ type: 'shown', summary: { ...summary(), drawn: drawnColour(gl) } });
    } else if (message.type === 'place') {
      // Only the province still asked for: a reply to an earlier one is dropped.
      if (String(message.province) !== placeInput.value) return;
      const found = message.place;
      place = found.ok
        ? {
            province: found.province,
            x: found.x,
            y: found.y,
            colours: found.colours,
            north: found.north,
            source: found.source,
          }
        : undefined;
      placeProblem = found.ok ? undefined : `Place ${String(message.province)}: ${found.message}`;
      placeShown();
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
      if (message.colours.ok) {
        // The tag's colours fill the colour boxes; a box changed by hand after this is the user's.
        message.colours.colours.forEach((value, i) => {
          const [key, input] = colourInputs[i] ?? [];
          if (key === undefined || input === undefined) return;
          input.value = value;
          country[key] = hexColour(value);
        });
        countryOf = { tag: message.tag, from: message.colours.from };
        colourProblem = undefined;
      } else {
        // The colour boxes keep their colours, and the bar where they came from.
        colourProblem = `Country ${message.tag}: ${message.colours.message}`;
      }
      countryShown();
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
      problems.push(...unfitStates(nodes, meshes));
      entity = {
        name: message.name,
        states: [...message.states],
        problems,
        particles: message.particles,
      };
      const context = gl;
      particleLayer?.load(message.effects, message.particleTextures, (texture) =>
        textureOf(context, texture),
      );
      particlesButton.hidden = particleLayer?.any !== true;
      tree = undefined;
      tintProblem = undefined;
      seasonProblem = undefined;
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

/**
 * The states whose animation the game would not play on the node's mesh: another joint count
 * than the skeleton's bone count. The node then keeps its bind pose.
 */
function unfitStates(
  nodes: readonly Omit<EntityNode, 'bytes'>[],
  meshes: readonly PdxMesh[],
): string[] {
  const out: string[] = [];
  for (const [index, node] of nodes.entries()) {
    const skeletons = (meshes[index]?.shapes ?? []).filter((shape) => shape.skeleton.length > 0);
    for (const [state, key] of Object.entries(node.states)) {
      const animation = key === undefined ? undefined : animations.get(key);
      if (key === undefined || animation === undefined) continue;
      const unfit = skeletons.find((shape) => !animationFits(shape.skeleton, animation));
      if (unfit === undefined) continue;
      out.push(
        `${node.name}: state ${state}: ${key} has ${String(animation.joints.length)} joints, ` +
          `${node.meshName} ${String(unfit.skeleton.length)} bones; the game plays nothing`,
      );
    }
  }
  return out;
}

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

snowInput.addEventListener('input', () => {
  snowAmount = Number(snowInput.value);
  redraw();
});
snowInput.addEventListener('change', () => {
  vscode.postMessage({ type: 'shown', summary: summary() });
});
tintInput.addEventListener('input', () => {
  turn = Number(tintInput.value);
  redraw();
});
tintInput.addEventListener('change', () => {
  vscode.postMessage({ type: 'shown', summary: summary() });
});
/** A colour from 0 to 255 per channel as `#rrggbb`. */
function hexOf(rgb: readonly number[]): string {
  return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * With a place set, Ground and North follow it: Ground the colour of the map seasons' colour
 * maps there, mixed for the Date slider's day, North its value. Without one, both are the
 * user's to set.
 */
function applyPlace(): void {
  groundInput.disabled = place !== undefined;
  seasonNorthInput.disabled = place !== undefined;
  if (place === undefined) return;
  const season = treeSeasons === undefined ? undefined : seasonAt(treeSeasons.mapSpans, seasonDay);
  const colour = colourMapAt(place.colours, season);
  if (colour !== undefined) {
    ground = hexOf(colour);
    groundInput.value = ground;
  }
  north = place.north;
  seasonNorthInput.value = String(north);
}

/**
 * Takes the Place box's text: asks the host for a province's place and answers `true`, or
 * clears the place (an empty box) or names what is wrong with the text and answers `false`.
 */
function askPlace(text: string): boolean {
  placeInput.value = text;
  if (/^[1-9][0-9]*$/.test(text)) {
    vscode.postMessage({ type: 'place', province: Number(text) });
    return true;
  }
  place = undefined;
  placeProblem = text === '' ? undefined : `Place ${text}: a province ID is a whole number from 1`;
  applyPlace();
  showErrorBox();
  showFacts();
  return false;
}

/** After the Place box changed: draws, and answers a waiting `controls` message or the host. */
function placeShown(): void {
  applyPlace();
  showErrorBox();
  showFacts();
  if (gl !== null && placeControls) {
    placeControls = false;
    render(performance.now());
    vscode.postMessage({ type: 'shown', summary: { ...summary(), drawn: drawnColour(gl) } });
    return;
  }
  redraw();
  vscode.postMessage({ type: 'shown', summary: summary() });
}

placeInput.addEventListener('change', () => {
  if (!askPlace(placeInput.value.trim())) placeShown();
});

groundInput.addEventListener('input', () => {
  ground = groundInput.value;
  redraw();
});
groundInput.addEventListener('change', () => {
  vscode.postMessage({ type: 'shown', summary: summary() });
});
/** The season value the game takes for the Date slider's day, from the tree seasons. */
function seasonValue(): SeasonValue | undefined {
  return treeSeasons === undefined ? undefined : seasonAt(treeSeasons.spans, seasonDay);
}

/** Shows the Date slider's day and the tree season it falls in, or between which two. */
function showSeasonDate(): void {
  const value = seasonValue();
  const at =
    value === undefined
      ? 'no tree season'
      : value.lerp === 0
        ? (TREE_SEASONS[value.first] ?? '')
        : `${TREE_SEASONS[value.first] ?? ''} to ${TREE_SEASONS[value.second] ?? ''}, ${String(Math.round(value.lerp * 100))}%`;
  seasonDateOutput.textContent = dayName(seasonDay);
  seasonDateOutput.title = at;
  seasonDayInput.setAttribute('aria-valuetext', `${dayName(seasonDay)}, ${at}`);
}

for (const input of [seasonDayInput, seasonNorthInput]) {
  input.addEventListener('input', () => {
    seasonDay = Number(seasonDayInput.value);
    showSeasonDate();
    north = Number(seasonNorthInput.value);
    applyPlace();
    redraw();
  });
  input.addEventListener('change', () => {
    vscode.postMessage({ type: 'shown', summary: summary() });
  });
}

lodSelect.addEventListener('change', () => {
  lodAuto = lodSelect.value === 'auto';
  if (!lodAuto) lodLevel = Number(lodSelect.value);
  showFacts();
  redraw();
  vscode.postMessage({ type: 'shown', summary: summary() });
});

playButton.addEventListener('click', () => {
  setPlaying(!playing);
  vscode.postMessage({ type: 'shown', summary: summary() });
});

/** Whether a drag of the frame slider began while playing: playing goes on when it ends. */
let resumeAfterDrag = false;
frameInput.addEventListener('pointerdown', () => {
  resumeAfterDrag = playing;
});
frameInput.addEventListener('keydown', () => {
  resumeAfterDrag = false;
});
frameInput.addEventListener('input', () => {
  goToFrame(Number(frameInput.value));
});
frameInput.addEventListener('change', () => {
  if (resumeAfterDrag) setPlaying(true);
  resumeAfterDrag = false;
  vscode.postMessage({ type: 'shown', summary: summary() });
});
// , and . step one frame back and forward, as in a video player; not while typing in a box.
document.addEventListener('keydown', (event) => {
  if (event.key !== ',' && event.key !== '.') return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === 'text') return;
  const animation = rootAnimation();
  if (animation === undefined) return;
  event.preventDefault();
  goToFrame(frameAt(animation, position) + (event.key === '.' ? 1 : -1));
  vscode.postMessage({ type: 'shown', summary: summary() });
});

/** Turns one of the materials' maps on or off, as its button shows. */
function setMap(key: keyof typeof maps, on: boolean): void {
  maps[key] = on;
  mapButtons[key].setAttribute('aria-pressed', String(on));
  showFacts();
}

for (const key of ['diffuse', 'normal', 'specular'] as const) {
  mapButtons[key].addEventListener('click', () => {
    setMap(key, !maps[key]);
    redraw();
    vscode.postMessage({ type: 'shown', summary: summary() });
  });
}

/** A colour box's `#rrggbb` as red, green and blue from 0 to 1. */
function hexColour(value: string): number[] {
  const hex = value.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

for (const [key, input] of colourInputs) {
  input.addEventListener('input', () => {
    country[key] = hexColour(input.value);
    if (countryOf !== undefined) {
      countryOf = undefined;
      showFacts();
    }
    redraw();
  });
  input.addEventListener('change', () => {
    vscode.postMessage({ type: 'shown', summary: summary() });
  });
}

for (const input of [regionOn, regionInput]) {
  input.addEventListener('input', () => {
    if (input === regionInput) regionOn.checked = true;
    region = regionOn.checked ? regionInput.value : undefined;
    redraw();
  });
  input.addEventListener('change', () => {
    vscode.postMessage({ type: 'shown', summary: summary() });
  });
}

/**
 * Asks the host for the Country box's tag: its flag and its colours. False when the box holds no
 * tag: the flag is then off and the colour boxes keep their colours.
 */
function askCountry(): boolean {
  const tag = flagInput.value.trim().toUpperCase();
  flagInput.value = tag;
  askedTag = tag;
  if (/^[A-Z0-9]{3}$/.test(tag)) {
    vscode.postMessage({ type: 'flag', tag });
    return true;
  }
  if (flag !== undefined) gl?.deleteTexture(flag.texture);
  flag = undefined;
  const problem = tag === '' ? undefined : `${tag}: a country tag has three letters or digits`;
  flagProblem = problem === undefined ? undefined : `Flag ${problem}`;
  colourProblem = problem === undefined ? undefined : `Country ${problem}`;
  return false;
}

/** Shows what the Country box's tag gave, and answers a `controls` message waiting for it. */
function countryShown(): void {
  showErrorBox();
  showFacts();
  if (gl !== null && tagControls) {
    tagControls = false;
    render(performance.now());
    vscode.postMessage({ type: 'shown', summary: { ...summary(), drawn: drawnColour(gl) } });
    return;
  }
  redraw();
  vscode.postMessage({ type: 'shown', summary: summary() });
}

flagInput.addEventListener('change', () => {
  if (!askCountry()) countryShown();
});
// Enter asks again for the same tag, which gives its colours back after a hand change.
flagInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || flagInput.value.trim().toUpperCase() !== askedTag) return;
  if (!askCountry()) countryShown();
});

wireButton.addEventListener('click', () => {
  wireframe = !wireframe;
  wireButton.setAttribute('aria-pressed', String(wireframe));
  redraw();
});

/** Shows or hides the bones (the Bones button). */
function setSkeleton(on: boolean): void {
  skeletonShown = on;
  skeletonButton.setAttribute('aria-pressed', String(on));
  if (!on) boneTip.hidden = true;
}

/** Draws the particle effects or not (the Particles button). */
function setParticles(on: boolean): void {
  if (particleLayer !== undefined) particleLayer.on = on;
  particlesButton.setAttribute('aria-pressed', String(on));
  if (gl !== null) showStatus(position);
}

particlesButton.addEventListener('click', () => {
  setParticles(particleLayer?.on !== true);
  redraw();
  vscode.postMessage({ type: 'shown', summary: summary() });
});

skeletonButton.addEventListener('click', () => {
  setSkeleton(!skeletonShown);
  redraw();
  vscode.postMessage({ type: 'shown', summary: summary() });
});

/**
 * The bone nearest a point of the canvas (CSS pixels from its top left), within `reach` pixels:
 * its name and what hangs on it.
 */
function boneAt(
  x: number,
  y: number,
  reach: number,
): { name: string; carries: string[] } | undefined {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return undefined;
  const projection = viewProjection(camera, width / height);
  let nearest: { name: string; carries: string[]; distance: number } | undefined;
  for (const instance of instances) {
    const carried = attachmentBones(instance);
    for (const bone of instance.bones) {
      const point = onScreen(projection, bone.at, width, height);
      if (point === undefined) continue;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance > reach || (nearest !== undefined && distance >= nearest.distance)) continue;
      nearest = { name: bone.name, carries: carried.get(bone.name) ?? [], distance };
    }
  }
  return nearest;
}

/** Where the pointer is over the canvas, in CSS pixels from its top left; `undefined` off it. */
let pointer: { x: number; y: number } | undefined;

/**
 * With the bones shown, names the bone under the pointer beside it. Called as the pointer moves
 * and after each frame drawn, since the bones move under a still pointer as the animation plays
 * or the camera turns.
 */
function showBoneTip(): void {
  const bone =
    skeletonShown && dragging === undefined && pointer !== undefined
      ? boneAt(pointer.x, pointer.y, 10)
      : undefined;
  boneTip.hidden = bone === undefined;
  if (bone === undefined || pointer === undefined) return;
  boneTip.textContent =
    bone.carries.length === 0 ? bone.name : `${bone.name}: ${bone.carries.join(', ')}`;
  boneTip.style.left = `${String(Math.round(pointer.x + 14))}px`;
  boneTip.style.top = `${String(Math.round(pointer.y + 14))}px`;
}

canvas.addEventListener('pointerleave', () => {
  pointer = undefined;
  boneTip.hidden = true;
});

resetButton.addEventListener('click', () => {
  frameView();
  redraw();
});

// The zoom, as in the other previews: − and + move the camera a step, the level fits the mesh in
// again and keeps its turn; the keys are the same (Ctrl+0 is the fitted view too).
zoomOutButton.addEventListener('click', () => {
  dolly(ZOOM_STEP);
});
zoomInButton.addEventListener('click', () => {
  dolly(1 / ZOOM_STEP);
});
zoomLevel.addEventListener('click', fitModel);
listenForZoomKeys({
  zoomIn: () => {
    dolly(1 / ZOOM_STEP);
  },
  zoomOut: () => {
    dolly(ZOOM_STEP);
  },
  actualSize: fitModel,
  fit: fitModel,
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
  const rect = canvas.getBoundingClientRect();
  pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  showBoneTip();
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
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufferOfBones = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferOfBones);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    bonePass = { program: compile(gl, BONE_VERTEX, BONE_FRAGMENT), vao, buffer: bufferOfBones };
    const shaders = ParticleLayer.shaders();
    particleLayer = new ParticleLayer(gl, compile(gl, shaders.vertex, shaders.fragment));
    vscode.postMessage({ type: 'ready' });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
