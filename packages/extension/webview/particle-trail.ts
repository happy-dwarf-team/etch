// The band a `trail = yes` subsystem draws (etch#631), as the game builds it (read by the EU4
// engine lab): a triangle strip through the particles in the order they came out, two vertices
// per particle at ± its size across the band.
//
// The game draws the band with the texture's `shader` effect plus `Trail` (and `NoBillboard`),
// and the base game's `gfx/FX/particle.shader` has none, so it draws with no effect at all
// (seen in the game, Steam 1.37.5, step 8): one flat, opaque colour whatever the particles'
// colour, alpha and texture, and only the triangles whose front faces the camera. A straight
// band facing the camera (`billboard = yes`) is drawn whole; a flat one (`billboard = no`, the
// trail's default) seen from above is not drawn, and only scraps of it show where particles
// overtake each other.

/** The band's colour in the game, over the map (sRGB 0–255). */
export const TRAIL_COLOUR: readonly [number, number, number] = [118, 112, 124];

/**
 * The layers of one effect in the order the preview draws them (step 11). The game draws an
 * effect's sprite layers in their order and then its trail layers, but a trail is not seen
 * where the same effect drew a sprite in the frame (seen in the game, Steam 1.37.5: a band with
 * a second subsystem of sprites, listed before or after it, was gone, while the band with a
 * second band or with a second subsystem that never emits was drawn). So the trails come only
 * while no sprite layer holds a particle.
 */
export function drawOrder<
  L extends { readonly subsystem: { readonly trail: boolean }; readonly quads: readonly unknown[] },
>(layers: readonly L[]): L[] {
  const sprites = layers.filter((layer) => !layer.subsystem.trail);
  if (sprites.some((layer) => layer.quads.length > 0)) return sprites;
  return [...sprites, ...layers.filter((layer) => layer.subsystem.trail)];
}

type Vector = readonly [number, number, number];

/**
 * The strip's vertex positions in the file's space (the game's), three floats each, two per
 * point, oldest first: the point plus and minus its
 * half-width times the side. With `billboard`, the side is across the path and the line to the
 * eye; without, across the path in the ground's plane, averaged with the previous segment's.
 * The last point takes the last segment's side.
 */
export function trailStrip(
  points: readonly Vector[],
  halfWidths: readonly number[],
  billboard: boolean,
  eye: Vector,
): Float32Array {
  const data = new Float32Array(points.length * 6);
  let previous: [number, number, number] | undefined;
  for (const [i, p] of points.entries()) {
    const next = points[i + 1];
    const before = points[i - 1] ?? p;
    const d = next === undefined ? sub(p, before) : sub(next, p);
    let side: [number, number, number];
    if (billboard) {
      side = unit(cross(sub(eye, p), d));
    } else {
      const flat = unit(cross(d, [0, 1, 0]));
      side = previous === undefined ? flat : unit(add(flat, previous));
      previous = flat;
    }
    const half = halfWidths[i] ?? 0;
    for (const [k, sign] of [1, -1].entries()) {
      data.set(
        [p[0] + sign * half * side[0], p[1] + sign * half * side[1], p[2] + sign * half * side[2]],
        (i * 2 + k) * 3,
      );
    }
  }
  return data;
}

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
  return length === 0 ? [0, 0, 0] : [v[0] / length, v[1] / length, v[2] / length];
}
