import {
  DRAW_LIST_VERSION,
  GLYPH_STRIDE,
  type Draw,
  type DrawList,
  type MaskedDraw,
  type MaskedShader,
  type ProgressFill,
  type SpriteDraw,
  type SpriteShader,
} from '@etch/core/draw-list';
import { TextureCache, type TextureProblem } from '../textures/cache.ts';
import { SAMPLE_LAYOUT_CODES, type GpuTexture } from '../textures/gpu.ts';
import { FRAGMENT_SHADER, KIND, OP, VERTEX_SHADER } from './glsl.ts';
import {
  SHADER_EFFECTS,
  SHADER_SAMPLERS,
  type EffectPass,
  type SamplerState,
  type ShaderName,
} from './shaders.ts';

export interface PaintResult {
  /** False when a later paint began before this one's textures loaded; nothing was drawn. */
  readonly painted: boolean;
  /** Textures that could not be loaded, for the extension to report. */
  readonly problems: readonly TextureProblem[];
  /** Indices of draws left out because a texture they use is missing. */
  readonly skipped: readonly number[];
}

/** Floats per vertex: position, uv, uv2, colour. */
const FLOATS = 10;
const WHITE = 0xffffffff;

type Rgba = readonly [number, number, number, number];

/** `0xAARRGGBB` to RGBA from 0 to 1. */
export function unpackColour(argb: number): Rgba {
  return [
    ((argb >>> 16) & 0xff) / 255,
    ((argb >>> 8) & 0xff) / 255,
    (argb & 0xff) / 255,
    ((argb >>> 24) & 0xff) / 255,
  ];
}

/**
 * Draws draw lists into one WebGL2 context. The canvas takes the list's
 * screen size; the image is transparent where nothing is drawn and is held
 * premultiplied, as a context from {@link createContext} expects.
 */
export class Painter {
  readonly gl: WebGL2RenderingContext;
  readonly textures: TextureCache;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly indexBuffer: WebGLBuffer;
  private indexQuads = 0;
  private readonly samplers = new Map<string, WebGLSampler>();
  private readonly at: (name: string) => WebGLUniformLocation | null;
  private generation = 0;

  constructor(gl: WebGL2RenderingContext, textures: TextureCache = new TextureCache(gl)) {
    this.gl = gl;
    this.textures = textures;
    this.program = link(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const program = this.program;
    const locations = new Map<string, WebGLUniformLocation | null>();
    this.at = (name) => {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
      return locations.get(name) ?? null;
    };

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const attribute = (name: string, size: number, offset: number): void => {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, FLOATS * 4, offset * 4);
    };
    attribute('position', 2, 0);
    attribute('uv', 2, 2);
    attribute('uv2', 2, 4);
    attribute('colour', 4, 6);
    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
  }

  /**
   * Loads the list's textures (each URL once, through the texture cache) and
   * draws it. When paints overlap, only the latest one draws.
   */
  async paint(list: DrawList): Promise<PaintResult> {
    // The list comes from another bundle through postMessage; its type is not proof.
    const version: number = list.version;
    if (version !== DRAW_LIST_VERSION) {
      throw new Error(
        `draw list version ${String(version)}, expected ${String(DRAW_LIST_VERSION)}`,
      );
    }
    const generation = ++this.generation;
    const results = await Promise.all(list.textures.map((url) => this.textures.get(url)));
    if (generation !== this.generation) return { painted: false, problems: [], skipped: [] };
    const textures = results.map((result) => (result.ok ? result.texture : undefined));
    const problems = results.flatMap((result) => (result.ok ? [] : [result.problem]));
    return { painted: true, problems, skipped: this.draw(list, textures) };
  }

  /**
   * Draws a list with its textures already on the GPU, by index; a draw whose
   * texture is undefined is left out. Returns the indices of those draws.
   */
  draw(list: DrawList, textures: readonly (GpuTexture | undefined)[]): number[] {
    const gl = this.gl;
    const canvas = gl.canvas;
    if (canvas.width !== list.width || canvas.height !== list.height) {
      canvas.width = list.width;
      canvas.height = list.height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, list.width, list.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const skipped: number[] = [];
    const quads: number[] = [];
    let total = 0;
    list.draws.forEach((draw, index) => {
      const count = usable(draw, textures) ? quadCount(draw) : -1;
      if (count < 0) skipped.push(index);
      quads.push(count);
      total += Math.max(count, 0);
    });
    if (total === 0) return skipped;

    const vertices = new Float32Array(total * 4 * FLOATS);
    let offset = 0;
    const quad = (
      x: number,
      y: number,
      w: number,
      h: number,
      u: Rect,
      u2: Rect | undefined,
      colour: Rgba,
    ): void => {
      const corners: readonly [number, number][] = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ];
      for (const [cx, cy] of corners) {
        vertices[offset++] = x + cx * w;
        vertices[offset++] = y + cy * h;
        vertices[offset++] = u.x + cx * u.w;
        vertices[offset++] = u.y + cy * u.h;
        vertices[offset++] = u2 === undefined ? 0 : u2.x + cx * u2.w;
        vertices[offset++] = u2 === undefined ? 0 : u2.y + cy * u2.h;
        vertices[offset++] = colour[0];
        vertices[offset++] = colour[1];
        vertices[offset++] = colour[2];
        vertices[offset++] = colour[3];
      }
    };
    const white = unpackColour(WHITE);
    list.draws.forEach((draw, index) => {
      if ((quads[index] ?? -1) < 0) return;
      switch (draw.kind) {
        case 'sprite': {
          const source: Rect = draw.repeat
            ? { x: draw.sx, y: draw.sy, w: draw.width, h: draw.height }
            : { x: draw.sx, y: draw.sy, w: draw.sw, h: draw.sh };
          const colour = passOf(draw).pass.colour ?? unpackColour(draw.colour ?? WHITE);
          quad(draw.x, draw.y, draw.width, draw.height, source, undefined, colour);
          break;
        }
        case 'masked': {
          const m = draw.maskRect;
          const colour = passOf(draw).pass.colour ?? unpackColour(draw.colour ?? WHITE);
          quad(
            draw.x,
            draw.y,
            draw.width,
            draw.height,
            { x: draw.sx, y: draw.sy, w: draw.sw, h: draw.sh },
            { x: m.sx, y: m.sy, w: m.sw, h: m.sh },
            colour,
          );
          break;
        }
        case 'progress':
          quad(draw.x, draw.y, draw.width, draw.height, UNIT, undefined, white);
          break;
        case 'text': {
          const g = draw.glyphs;
          for (let i = 0; i + GLYPH_STRIDE <= g.length; i += GLYPH_STRIDE) {
            const w = g[i + 2] ?? 0;
            const h = g[i + 3] ?? 0;
            const atlas = { x: g[i + 4] ?? 0, y: g[i + 5] ?? 0, w, h };
            quad(g[i] ?? 0, g[i + 1] ?? 0, w, h, atlas, undefined, unpackColour(g[i + 6] ?? 0));
          }
          break;
        }
      }
    });

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
    this.ensureIndices(total);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(this.at('screen'), list.width, list.height);
    gl.uniform1i(this.at('image0'), 0);
    gl.uniform1i(this.at('image1'), 1);

    let first = 0;
    list.draws.forEach((draw, index) => {
      const count = quads[index] ?? -1;
      if (count <= 0) return;
      this.setDraw(draw, textures);
      gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_INT, first * 6 * 4);
      first += count;
    });

    gl.bindVertexArray(null);
    gl.bindSampler(0, null);
    gl.bindSampler(1, null);
    gl.disable(gl.BLEND);
    return skipped;
  }

  private setDraw(draw: Draw, textures: readonly (GpuTexture | undefined)[]): void {
    const gl = this.gl;
    const shader: ShaderName =
      draw.kind === 'progress' || draw.kind === 'text' ? draw.kind : passOf(draw).shader;
    const samplers = SHADER_SAMPLERS[shader];
    const units: (GpuTexture | undefined)[] = [];
    let op: number = OP.plain;
    let repeat = false;

    switch (draw.kind) {
      case 'sprite':
      case 'masked':
        units.push(textures[draw.texture]);
        if (draw.kind === 'masked') units.push(textures[draw.mask]);
        op = OP[passOf(draw).pass.op];
        if (draw.kind === 'sprite' && draw.repeat === true) {
          repeat = true;
          gl.uniform4f(this.at('sourceRect'), draw.sx, draw.sy, draw.sw, draw.sh);
        }
        break;
      case 'progress': {
        const fills = [draw.first, draw.second];
        fills.forEach((fill, i) => {
          units.push('texture' in fill ? textures[fill.texture] : undefined);
          const colour = 'colour' in fill ? unpackColour(fill.colour) : unpackColour(0);
          gl.uniform4f(this.at(`fillColour${String(i)}`), ...colour);
        });
        gl.uniform2i(this.at('fillIsColour'), isColour(draw.first), isColour(draw.second));
        gl.uniform1f(this.at('progress'), draw.value);
        gl.uniform1i(this.at('vertical'), draw.vertical === true ? 1 : 0);
        break;
      }
      case 'text':
        units.push(textures[draw.texture]);
        gl.uniform4f(this.at('border'), ...unpackColour(draw.border ?? 0));
        break;
    }

    gl.uniform1i(this.at('kind'), KIND[draw.kind]);
    gl.uniform1i(this.at('op'), op);
    gl.uniform1i(this.at('repeatSource'), repeat ? 1 : 0);
    const layouts = [0, 0];
    const wraps = [0, 0];
    for (let unit = 0; unit < 2; unit++) {
      const texture = units[unit];
      const sampler = samplers[unit] ?? samplers[0];
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture?.texture ?? null);
      if (texture === undefined || sampler === undefined) {
        gl.bindSampler(unit, null);
        continue;
      }
      gl.bindSampler(unit, this.sampler(sampler));
      layouts[unit] = SAMPLE_LAYOUT_CODES[texture.layout];
      wraps[unit] = sampler.wrap ? 1 : 0;
      gl.uniform4f(
        this.at(`size${String(unit)}`),
        texture.width,
        texture.height,
        texture.storedWidth,
        texture.storedHeight,
      );
    }
    gl.uniform2i(this.at('texelLayouts'), layouts[0] ?? 0, layouts[1] ?? 0);
    gl.uniform2i(this.at('wrap'), wraps[0] ?? 0, wraps[1] ?? 0);
  }

  private sampler(state: SamplerState): WebGLSampler {
    const key = `${state.min}/${state.mag}/${String(state.wrap)}`;
    let sampler = this.samplers.get(key);
    if (sampler === undefined) {
      const gl = this.gl;
      sampler = gl.createSampler();
      const filter = (f: SamplerState['min']): number => (f === 'point' ? gl.NEAREST : gl.LINEAR);
      const wrap = state.wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, filter(state.min));
      gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, filter(state.mag));
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrap);
      gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrap);
      this.samplers.set(key, sampler);
    }
    return sampler;
  }

  /** Two triangles per quad, for at least `quads` quads. */
  private ensureIndices(quads: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    if (quads <= this.indexQuads) return;
    const capacity = Math.max(quads, this.indexQuads * 2, 256);
    const indices = new Uint32Array(capacity * 6);
    for (let q = 0; q < capacity; q++) {
      const v = q * 4;
      indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], q * 6);
    }
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.indexQuads = capacity;
  }
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const UNIT: Rect = { x: 0, y: 0, w: 1, h: 1 };

const EFFECTS: Readonly<Record<string, Readonly<Record<string, EffectPass>> | undefined>> =
  SHADER_EFFECTS;

/**
 * The shader and pass a sprite or masked draw runs. The list arrives through
 * `postMessage`, so a name this renderer does not know falls back to the
 * default shader (`maskedflag` for masks) and an unknown effect to `up`.
 */
function passOf(draw: SpriteDraw | MaskedDraw): {
  shader: SpriteShader | MaskedShader;
  pass: EffectPass;
} {
  const known = EFFECTS[draw.shader] !== undefined && Object.hasOwn(EFFECTS, draw.shader);
  const shader = known ? draw.shader : draw.kind === 'masked' ? 'maskedflag' : 'default';
  const passes = SHADER_EFFECTS[shader] as Readonly<Record<string, EffectPass | undefined>>;
  return { shader, pass: passes[draw.effect ?? 'up'] ?? SHADER_EFFECTS[shader].up };
}

function isColour(fill: ProgressFill): number {
  return 'colour' in fill ? 1 : 0;
}

function quadCount(draw: Draw): number {
  return draw.kind === 'text' ? Math.floor(draw.glyphs.length / GLYPH_STRIDE) : 1;
}

/** Whether every texture the draw samples is loaded. */
function usable(draw: Draw, textures: readonly (GpuTexture | undefined)[]): boolean {
  const has = (index: number): boolean => textures[index] !== undefined;
  switch (draw.kind) {
    case 'sprite':
    case 'text':
      return has(draw.texture);
    case 'masked':
      return has(draw.texture) && has(draw.mask);
    case 'progress':
      return [draw.first, draw.second].every((fill) => !('texture' in fill) || has(fill.texture));
  }
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type);
    if (shader === null) throw new Error('cannot create a shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
      throw new Error(`shader does not compile: ${gl.getShaderInfoLog(shader) ?? ''}`);
    }
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    throw new Error(`program does not link: ${gl.getProgramInfoLog(program) ?? ''}`);
  }
  return program;
}

/**
 * Reads the canvas back as straight RGBA, top row first: the form the
 * diff view and the game host's capture use (spec section 5). Call it in the
 * same task as the draw, before the browser presents the canvas.
 */
export function readPixels(gl: WebGL2RenderingContext): Uint8Array {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const raw = new Uint8Array(width * height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const out = new Uint8Array(raw.length);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * row;
    for (let i = 0; i < row; i += 4) {
      const a = raw[from + i + 3] ?? 0;
      const to = y * row + i;
      if (a === 0) continue;
      for (let c = 0; c < 3; c++) {
        out[to + c] = Math.min(255, Math.round(((raw[from + i + c] ?? 0) * 255) / a));
      }
      out[to + 3] = a;
    }
  }
  return out;
}
