// The entity preview's particle effects (etch#631): an approximate player of the particle systems
// a state's events start, drawn as the game's particle shader draws them (`gfx/FX/particle.shader`
// of EU4 1.37.5, read, not copied). The simulation is `@etch/core/asset`'s `ParticleEffect`; this
// file starts the effects on their bones at their events' times and draws their quads.
//
// - An event starts its effect as the game's code does (read by the EU4 engine lab): on the step
//   whose time span [from, to) holds the event's `time`, in every loop of the state's animation
//   (or of its `state_time`, for a state with none; once without either). An event timed past
//   the loop's end, or before 0, starts on each wrap to the loop's start. Each start is a new
//   effect, even while earlier ones still emit, with no limit on the copies (step 7), until
//   `PARTICLE_BUDGET` particles are alive; `trigger_once` events start in the first loop
//   only. The effect follows the bone's or locator's matrix as it moves (a musket's `muzzle` is a
//   locator of its mesh; the entity's origin without either).
// - A new state ends every effect, except those of `keep_particle` events, which stop emitting and
//   live out their particles.
// - A `trail = yes` subsystem is a band through its particles, oldest to newest, 2 × size wide,
//   facing the camera (or, with `billboard = no`, lying flat), with the texture along it.
// - A quad faces the camera: its corners are added in clip space, the size times the
//   pdxparticle's scale, turned by the particle's roll. Its texture is the subsystem's sprite
//   sheet tile, times the particle's colour. `ParticleAlphaBlend` blends over what is behind it,
//   `ParticlePreAlphaBlend` as premultiplied alpha, `ParticleAdditive` adds. Particles test depth
//   and do not write it, and are drawn after the meshes, each subsystem in its `sort` order.
// - Paused on a frame, the effects are run again from the state's start to that frame with the
//   same random numbers, so a frame always draws the same.

import {
  ParticleEffect,
  type ParticleQuad,
  type ParticleShader,
  type ParticleSubsystem,
} from '@etch/core/asset';
import type { EntityParticleEffect, MeshTexture } from '../src/mesh-protocol.ts';
import { fires, withinBudget } from './particle-firing.ts';

const TRAIL_VERTEX = `#version 300 es
in vec3 position;
in vec2 uv;
in vec4 colour;
uniform mat4 viewProjection;
out vec2 vUv;
out vec4 vColour;
void main() {
  gl_Position = viewProjection * vec4(position, 1.0);
  vUv = uv;
  vColour = colour / 255.0;
}`;

const VERTEX = `#version 300 es
in vec2 corner;
in vec3 position;
in vec4 shape;
in vec4 colour;
uniform mat4 viewProjection;
uniform vec2 projection;
uniform float scale;
uniform vec2 grid;
out vec2 vUv;
out vec4 vColour;
void main() {
  // shape: size, roll in degrees, tile column, tile row.
  vec4 clip = viewProjection * vec4(position * vec3(1.0, 1.0, -1.0), 1.0);
  float roll = radians(shape.y);
  vec2 offset = (corner - 0.5) * shape.x * scale;
  offset = vec2(offset.x * cos(roll) - offset.y * sin(roll), offset.x * sin(roll) + offset.y * cos(roll));
  clip.xy += offset * projection;
  gl_Position = clip;
  vUv = (shape.zw + vec2(corner.x, 1.0 - corner.y)) / grid;
  vColour = colour / 255.0;
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vColour;
uniform sampler2D sheet;
uniform bool premultiplied;
out vec4 outColor;
void main() {
  vec4 texel = texture(sheet, vUv) * vColour;
  outColor = premultiplied ? vec4(texel.rgb * texel.a, texel.a) : texel;
}`;

/** Floats per quad: position 3, shape 4, colour 4. */
const STRIDE = 11;
/** Floats per trail vertex: position 3, uv 2, colour 4. */
const TRAIL_STRIDE = 9;
/** The step the effects are run again with when the preview is paused on a frame. */
const REPLAY_STEP = 1 / 30;

interface Running {
  readonly effect: ParticleEffect;
  readonly event: EntityParticleEffect;
}

/** Where an event's effect is: its node's world matrix in the file's space, by node and bone. */
export type NodeMatrix = (node: number, bone: string | undefined) => ArrayLike<number> | undefined;

export class ParticleLayer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly corners: WebGLBuffer;
  private readonly quads: WebGLBuffer;
  private readonly trailProgram: WebGLProgram;
  private readonly trailVao: WebGLVertexArrayObject;
  private readonly trail: WebGLBuffer;
  private readonly white: WebGLTexture | null;
  private events: readonly EntityParticleEffect[] = [];
  private textures = new Map<string, WebGLTexture>();
  private running: Running[] = [];
  /** The state's time the effects were run to, in seconds. */
  private at = 0;
  private state: string | undefined;
  private starts = 0;
  /** Whether an effect did not start since the state began, the particle budget being full. */
  heldBack = false;
  /** Whether the Particles button is on. */
  on = true;

  constructor(gl: WebGL2RenderingContext, program: WebGLProgram, trailProgram: WebGLProgram) {
    this.gl = gl;
    this.program = program;
    this.trailProgram = trailProgram;
    this.trailVao = gl.createVertexArray();
    this.trail = gl.createBuffer();
    gl.bindVertexArray(this.trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trail);
    for (const [name, size, offset] of [
      ['position', 3, 0],
      ['uv', 2, 3],
      ['colour', 4, 5],
    ] as const) {
      const location = gl.getAttribLocation(trailProgram, name);
      if (location < 0) continue;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, TRAIL_STRIDE * 4, offset * 4);
    }
    gl.bindVertexArray(null);
    this.vao = gl.createVertexArray();
    this.corners = gl.createBuffer();
    this.quads = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const corner = gl.getAttribLocation(program, 'corner');
    gl.enableVertexAttribArray(corner);
    gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quads);
    const attribute = (name: string, size: number, offset: number): void => {
      const location = gl.getAttribLocation(program, name);
      if (location < 0) return;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, STRIDE * 4, offset * 4);
      gl.vertexAttribDivisor(location, 1);
    };
    attribute('position', 3, 0);
    attribute('shape', 4, 3);
    attribute('colour', 4, 7);
    gl.bindVertexArray(null);
    this.white = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.white);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
  }

  static shaders(): { vertex: string; fragment: string; trailVertex: string } {
    return { vertex: VERTEX, fragment: FRAGMENT, trailVertex: TRAIL_VERTEX };
  }

  /** The entity's effects and their textures; clears what runs. */
  load(
    events: readonly EntityParticleEffect[],
    textures: Readonly<Record<string, MeshTexture>>,
    upload: (texture: MeshTexture) => WebGLTexture | undefined,
  ): void {
    for (const texture of this.textures.values()) this.gl.deleteTexture(texture);
    this.textures = new Map();
    for (const [file, texture] of Object.entries(textures)) {
      const uploaded = upload(texture);
      if (uploaded !== undefined) this.textures.set(file, uploaded);
    }
    this.events = events;
    this.clear();
  }

  /** Whether the entity has an effect the player can draw. */
  get any(): boolean {
    return this.events.length > 0;
  }

  /** The effects of a state. */
  of(state: string | undefined): EntityParticleEffect[] {
    return this.events.filter((event) => event.state === state);
  }

  /** Clears every running effect; the state starts again from its beginning. */
  clear(): void {
    this.running = [];
    this.at = 0;
    this.starts = 0;
    this.heldBack = false;
  }

  /** The particles alive. */
  get count(): number {
    return this.running.reduce((sum, run) => sum + run.effect.count, 0);
  }

  /**
   * Runs the state's effects on to `seconds` into the state, each event's clip being `clip(node)`
   * seconds long (`undefined` for a node that plays no animation). Going back, or a jump of more
   * than a second, runs them again from the state's start in steps of 1/30 s.
   */
  advance(
    state: string | undefined,
    seconds: number,
    clip: (node: number) => number | undefined,
    matrix: NodeMatrix,
  ): void {
    if (state !== this.state) {
      // The effects of `keep_particle` events stop emitting and go on; the rest end.
      const kept = this.running.filter((run) => run.event.keepParticle);
      for (const run of kept) run.effect.stop();
      this.state = state;
      this.clear();
      this.running = kept;
    }
    const events = this.of(state);
    if (seconds < this.at || seconds - this.at > 1) {
      this.clear();
      let t = this.at;
      while (t + REPLAY_STEP < seconds) {
        this.step(events, t, t + REPLAY_STEP, clip, matrix);
        t += REPLAY_STEP;
      }
      this.step(events, t, seconds, clip, matrix);
      return;
    }
    this.step(events, this.at, seconds, clip, matrix);
  }

  private step(
    events: readonly EntityParticleEffect[],
    from: number,
    to: number,
    clip: (node: number) => number | undefined,
    matrix: NodeMatrix,
  ): void {
    for (const event of events) {
      const loop =
        clip(event.node) ??
        (event.stateTime !== undefined && event.stateTime > 0 ? event.stateTime : undefined);
      // `trigger_once`: only while the state's time is within its first loop.
      if (event.triggerOnce && (loop === undefined || to > loop)) continue;
      if (!fires(event.time, from, to, loop)) continue;
      if (!withinBudget(this.count)) {
        this.heldBack = true;
        continue;
      }
      this.starts++;
      this.running.push({
        event,
        effect: new ParticleEffect(event.system, event.scale, 0x9e3779b9 + this.starts * 7919),
      });
    }
    const dt = Math.max(0, to - from);
    for (const run of this.running) {
      const node = matrix(run.event.node, run.event.bone);
      if (node !== undefined) run.effect.step(dt, node);
    }
    this.running = this.running.filter((run) => !run.effect.finished);
    this.at = to;
  }

  /** Draws the running effects over the meshes drawn so far. */
  draw(viewProjection: Float32Array, eye: readonly number[], entityScale: number): void {
    if (!this.on || this.running.length === 0) return;
    const { gl } = this;
    gl.useProgram(this.program);
    const uniform = (name: string): WebGLUniformLocation | null =>
      gl.getUniformLocation(this.program, name);
    gl.uniformMatrix4fv(uniform('viewProjection'), false, viewProjection);
    // The projection's x and y scales: P00 and P11 of the perspective in `viewProjection`'s
    // projection part, which the clip-space corners are scaled by.
    const [p00, p11] = projectionScales(viewProjection);
    gl.uniform2f(uniform('projection'), p00, p11);
    gl.uniform1i(uniform('sheet'), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    // The drawn space mirrors the file's Z.
    const [ex = 0, ey = 0, ez = 0] = eye;
    const distance = (q: ParticleQuad): number =>
      (q.x - ex) ** 2 + (q.y - ey) ** 2 + (-q.z - ez) ** 2;
    for (const run of this.running) {
      for (const [index, subsystem] of run.event.system.subsystems.entries()) {
        const quads = run.effect.quads(index);
        if (quads.length === 0) continue;
        if (subsystem.trail) {
          this.drawTrail(quads, subsystem, eye, run.event.scale * entityScale, viewProjection);
          gl.useProgram(this.program);
          gl.bindVertexArray(this.vao);
          continue;
        }
        if (subsystem.sort === 'depth' || subsystem.sort === 'distance') {
          quads.sort((a, b) => distance(b) - distance(a));
        } else if (subsystem.sort === 'age') {
          quads.sort((a, b) => b.age - a.age);
        }
        if (subsystem.invert) quads.reverse();
        const data = new Float32Array(quads.length * STRIDE);
        for (const [i, q] of quads.entries()) {
          data.set(
            [q.x, q.y, q.z, q.size, q.rotation, q.tileX, q.tileY, q.r, q.g, q.b, q.a],
            i * STRIDE,
          );
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quads);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
        this.blend(subsystem.texture.shader, uniform('premultiplied'));
        gl.uniform2f(uniform('grid'), subsystem.texture.columns, subsystem.texture.rows);
        // A local-space subsystem's sprites also follow the entity's scale.
        gl.uniform1f(uniform('scale'), run.event.scale * (subsystem.localSpace ? entityScale : 1));
        const file = subsystem.texture.file;
        gl.bindTexture(
          gl.TEXTURE_2D,
          (file === undefined ? undefined : this.textures.get(file)) ?? this.white,
        );
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, quads.length);
      }
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  /**
   * A trail subsystem's band: a strip through its particles in the order they came out, each
   * giving the two points size away on either side, facing the camera (`billboard`, the default)
   * or across the path in the ground's plane. The texture runs along it, one repeat a particle.
   */
  private drawTrail(
    quads: readonly ParticleQuad[],
    subsystem: ParticleSubsystem,
    eye: readonly number[],
    localScale: number,
    viewProjection: Float32Array,
  ): void {
    if (quads.length < 2) return;
    const { gl } = this;
    // In the drawn space, which mirrors the file's Z.
    const points = quads.map((q) => [q.x, q.y, -q.z] as const);
    const data = new Float32Array(quads.length * 2 * TRAIL_STRIDE);
    let previous: [number, number, number] | undefined;
    for (const [i, q] of quads.entries()) {
      const p = points[i] ?? [0, 0, 0];
      const next = points[i + 1];
      const before = points[i - 1] ?? p;
      const d = next === undefined ? sub(p, before) : sub(next, p);
      let side: [number, number, number];
      if (subsystem.billboard) {
        side = unit(cross(sub([eye[0] ?? 0, eye[1] ?? 0, eye[2] ?? 0], p), d));
      } else {
        const flat = unit(cross(d, [0, 1, 0]));
        side = previous === undefined ? flat : unit(add(flat, previous));
        previous = flat;
      }
      // World-space trails are not scaled by the pdxparticle's scale; local-space ones are.
      const half = q.size * (subsystem.localSpace ? localScale : 1);
      for (const [k, sign] of [1, -1].entries()) {
        data.set(
          [
            p[0] + sign * half * side[0],
            p[1] + sign * half * side[1],
            p[2] + sign * half * side[2],
            i,
            k === 0 ? 1 : 0,
            q.r,
            q.g,
            q.b,
            q.a,
          ],
          (i * 2 + k) * TRAIL_STRIDE,
        );
      }
    }
    gl.useProgram(this.trailProgram);
    const uniform = (name: string): WebGLUniformLocation | null =>
      gl.getUniformLocation(this.trailProgram, name);
    gl.uniformMatrix4fv(uniform('viewProjection'), false, viewProjection);
    gl.uniform1i(uniform('sheet'), 0);
    this.blend(subsystem.texture.shader, uniform('premultiplied'));
    gl.bindVertexArray(this.trailVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trail);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    const file = subsystem.texture.file;
    gl.bindTexture(
      gl.TEXTURE_2D,
      (file === undefined ? undefined : this.textures.get(file)) ?? this.white,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, quads.length * 2);
  }

  private blend(shader: ParticleShader, premultiplied: WebGLUniformLocation | null): void {
    const { gl } = this;
    if (shader === 'additive') gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
    else if (shader === 'premultiplied') {
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    } else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.uniform1i(premultiplied, shader === 'premultiplied' ? 1 : 0);
  }
}

type Vector = readonly [number, number, number];

function sub(a: Vector, b: Vector): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: Vector, b: Vector): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function cross(a: Vector, b: Vector): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Vector): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0];
}

/**
 * P00 and P11 of the projection in a perspective × view matrix whose view part is a rotation
 * and translation: the lengths of the first two rows' 3 × 3 parts.
 */
function projectionScales(m: Float32Array): [number, number] {
  const row = (r: number): number => Math.hypot(m[r] ?? 0, m[4 + r] ?? 0, m[8 + r] ?? 0);
  return [row(0), row(1)];
}
