// A small software render of a mesh for thumbnails (a hover cannot run WebGL): the drawn shapes
// with their diffuse textures and one directional light, on a transparent background, seen from
// front right and above (yaw 0.6, pitch 0.35 radians) through a 40° perspective, far enough back
// for the whole mesh to be in front, then zoomed and centred so its drawn vertices fill 90 % of the
// image. The game's files are left-handed with Y up; Z is mirrored so the mesh
// does not show mirrored. Rendered at twice the size and box-filtered down.

import type { MeshPart, PdxMesh } from './mesh.ts';

/** Tightly packed RGBA rows, top row first. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

type Vec3 = [number, number, number];

const YAW = 0.6;
const PITCH = 0.35;
const FOV = (40 * Math.PI) / 180;
const LIGHT = normalise([0.4, 0.8, 0.45]);
const UNTEXTURED = [184, 184, 184, 255] as const;

function normalise(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** The texel at a UV, repeating as a GL texture does; v = 0 is the image's top row. */
function sample(image: RgbaImage, u: number, v: number): [number, number, number, number] {
  const x = Math.min(image.width - 1, Math.floor((u - Math.floor(u)) * image.width));
  const y = Math.min(image.height - 1, Math.floor((v - Math.floor(v)) * image.height));
  const i = (y * image.width + x) * 4;
  const { rgba } = image;
  return [rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0, rgba[i + 3] ?? 0];
}

/**
 * Renders the mesh's drawn shapes, `size` × `size` pixels: of a mesh with levels of detail, only
 * the most detailed level and the shapes without one, as the mesh preview first shows it.
 * `textures` holds the decoded diffuse textures by the material's `diff` name; a part without one
 * is drawn grey.
 */
export function renderMeshThumbnail(
  mesh: PdxMesh,
  textures: ReadonlyMap<string, RgbaImage>,
  size = 128,
): RgbaImage {
  const scale = 2;
  const big = size * scale;
  const colour = new Uint8Array(big * big * 4);
  const depth = new Float32Array(big * big).fill(Infinity);

  const rgba = new Uint8Array(size * size * 4);
  // A mesh with nothing drawn (only collision shapes) renders transparent.
  if (mesh.bounds === undefined) return { width: size, height: size, rgba };
  // The camera of the preview's first frame, around the bounds with Z mirrored.
  const [x0 = 0, y0 = 0, z0 = 0] = mesh.bounds.min;
  const [x1 = 0, y1 = 0, z1 = 0] = mesh.bounds.max;
  const target: Vec3 = [(x0 + x1) / 2, (y0 + y1) / 2, -(z0 + z1) / 2];
  // Far enough for the bounding sphere to fit the square image.
  const radius = Math.max(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2, 0.005);
  const distance = (radius / Math.sin(FOV / 2)) * 1.05;
  const eye: Vec3 = [
    target[0] + distance * Math.cos(PITCH) * Math.sin(YAW),
    target[1] + distance * Math.sin(PITCH),
    target[2] + distance * Math.cos(PITCH) * Math.cos(YAW),
  ];
  const forward = normalise([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const side = normalise(cross(forward, [0, 1, 0]));
  const up = cross(side, forward);
  const focal = 1 / Math.tan(FOV / 2);
  const near = distance / 100;

  // Each drawn part's vertices on the image plane (x right, y down, in units of the half-image)
  // and their view depth.
  const projected: { part: MeshPart; sx: Float32Array; sy: Float32Array; sz: Float32Array }[] = [];
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const levels = mesh.shapes.flatMap((s) => (s.collision || s.lod === undefined ? [] : [s.lod]));
  const level = levels.length === 0 ? undefined : Math.min(...levels);
  for (const shape of mesh.shapes) {
    if (shape.collision || (shape.lod !== undefined && shape.lod !== level)) continue;
    for (const part of shape.parts) {
      const count = part.positions.length / 3;
      const sx = new Float32Array(count);
      const sy = new Float32Array(count);
      const sz = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const p: Vec3 = [
          (part.positions[i * 3] ?? 0) - eye[0],
          (part.positions[i * 3 + 1] ?? 0) - eye[1],
          -(part.positions[i * 3 + 2] ?? 0) - eye[2],
        ];
        const z = dot(p, forward);
        const x = (focal * dot(p, side)) / z;
        const y = -(focal * dot(p, up)) / z;
        sx[i] = x;
        sy[i] = y;
        sz[i] = z;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      projected.push({ part, sx, sy, sz });
    }
  }
  // Zoom and centre: the projected extent fills 90 % of the longer side, in pixels.
  const zoom = (0.9 * big) / Math.max(maxX - minX, maxY - minY, 1e-6);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  for (const { sx, sy } of projected) {
    for (let i = 0; i < sx.length; i++) {
      sx[i] = big / 2 + ((sx[i] ?? 0) - centreX) * zoom;
      sy[i] = big / 2 + ((sy[i] ?? 0) - centreY) * zoom;
    }
  }

  for (const { part, sx, sy, sz } of projected) {
    const name = part.material.diffuse;
    const texture = name === undefined || part.uvs === undefined ? undefined : textures.get(name);
    const alphaTest = /alpha/i.test(part.material.shader);
    const { indices, normals, uvs } = part;
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const a = indices[t] ?? 0;
      const b = indices[t + 1] ?? 0;
      const c = indices[t + 2] ?? 0;
      const za = sz[a] ?? 0;
      const zb = sz[b] ?? 0;
      const zc = sz[c] ?? 0;
      // Triangles that reach behind the near plane are skipped: the whole mesh is in front.
      if (za < near || zb < near || zc < near) continue;
      const ax = sx[a] ?? 0;
      const ay = sy[a] ?? 0;
      const bx = sx[b] ?? 0;
      const by = sy[b] ?? 0;
      const cx = sx[c] ?? 0;
      const cy = sy[c] ?? 0;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (area === 0) continue;
      const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const maxX = Math.min(big - 1, Math.ceil(Math.max(ax, bx, cx)));
      const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const maxY = Math.min(big - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          // Barycentric weights in screen space, either winding.
          const wa = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
          const wb = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
          const wc = 1 - wa - wb;
          if (wa < 0 || wb < 0 || wc < 0) continue;
          // Perspective-correct: interpolate 1 / z and attributes over z.
          const ia = wa / za;
          const ib = wb / zb;
          const ic = wc / zc;
          const inverse = ia + ib + ic;
          const z = 1 / inverse;
          const at = y * big + x;
          if (z >= (depth[at] ?? Infinity)) continue;
          let base: readonly number[] = UNTEXTURED;
          if (texture !== undefined && uvs !== undefined) {
            const u =
              ((uvs[a * 2] ?? 0) * ia + (uvs[b * 2] ?? 0) * ib + (uvs[c * 2] ?? 0) * ic) * z;
            const v =
              ((uvs[a * 2 + 1] ?? 0) * ia +
                (uvs[b * 2 + 1] ?? 0) * ib +
                (uvs[c * 2 + 1] ?? 0) * ic) *
              z;
            base = sample(texture, u, v);
            if (alphaTest && (base[3] ?? 0) < 128) continue;
          }
          let lit = 1;
          if (normals !== undefined) {
            const n = normalise([
              ((normals[a * 3] ?? 0) * ia +
                (normals[b * 3] ?? 0) * ib +
                (normals[c * 3] ?? 0) * ic) *
                z,
              ((normals[a * 3 + 1] ?? 0) * ia +
                (normals[b * 3 + 1] ?? 0) * ib +
                (normals[c * 3 + 1] ?? 0) * ic) *
                z,
              -(
                ((normals[a * 3 + 2] ?? 0) * ia +
                  (normals[b * 3 + 2] ?? 0) * ib +
                  (normals[c * 3 + 2] ?? 0) * ic) *
                z
              ),
            ]);
            lit = 0.35 + 0.65 * Math.abs(dot(n, LIGHT));
          }
          depth[at] = z;
          colour[at * 4] = Math.round((base[0] ?? 0) * lit);
          colour[at * 4 + 1] = Math.round((base[1] ?? 0) * lit);
          colour[at * 4 + 2] = Math.round((base[2] ?? 0) * lit);
          colour[at * 4 + 3] = 255;
        }
      }
    }
  }

  // Box-filter the double-size image down, weighting colour by coverage.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((y * scale + dy) * big + x * scale + dx) * 4;
          const a = colour[i + 3] ?? 0;
          r += (colour[i] ?? 0) * a;
          g += (colour[i + 1] ?? 0) * a;
          b += (colour[i + 2] ?? 0) * a;
          alpha += a;
        }
      }
      const o = (y * size + x) * 4;
      if (alpha > 0) {
        rgba[o] = Math.round(r / alpha);
        rgba[o + 1] = Math.round(g / alpha);
        rgba[o + 2] = Math.round(b / alpha);
        rgba[o + 3] = Math.round(alpha / (scale * scale));
      }
    }
  }
  return { width: size, height: size, rgba };
}
