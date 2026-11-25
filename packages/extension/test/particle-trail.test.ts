// The band of a `trail = yes` subsystem (etch#631, step 8): the game's strip, and which way its
// triangles face. The game draws a trail without a `Trail` shader effect only where the band's
// front faces the camera: a straight band facing the camera is drawn whole, a straight flat one
// seen from above is not drawn at all.
import { describe, expect, it } from 'vitest';
import { drawOrder, trailStrip } from '../webview/particle-trail.ts';

type Vector = [number, number, number];

function vertex(strip: Float32Array, i: number): Vector {
  return [strip[i * 3] ?? 0, strip[i * 3 + 1] ?? 0, strip[i * 3 + 2] ?? 0];
}

/** The right-hand normal of the strip's triangle that starts at vertex i, as a strip turns it. */
function normal(strip: Float32Array, i: number): Vector {
  const [a, b, c] = [vertex(strip, i), vertex(strip, i + 1), vertex(strip, i + 2)];
  // A strip's odd triangles are wound the other way round.
  const [p, q, r] = i % 2 === 0 ? [a, b, c] : [b, a, c];
  const u: Vector = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const v: Vector = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

const dot = (a: Vector, b: Vector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Four points along +X at height 1, one apart. */
const line: Vector[] = [0, 1, 2, 3].map((x) => [x, 1, 0]);
const eye: Vector = [1.5, 10, -5];

describe('a trail’s band', () => {
  it('puts two vertices per point, size away on either side', () => {
    const strip = trailStrip(line, [0.5, 0.5, 0.5, 0.5], false, eye);
    expect(strip.length).toBe(8 * 3);
    expect(vertex(strip, 0)).toEqual([0, 1, 0.5]);
    expect(vertex(strip, 1)).toEqual([0, 1, -0.5]);
    expect(vertex(strip, 7)).toEqual([3, 1, -0.5]);
  });

  it('faces the camera with billboard: every triangle turns the same way, towards the eye', () => {
    const strip = trailStrip(line, [0.5, 0.5, 0.5, 0.5], true, eye);
    for (let i = 0; i < 6; i++) {
      const p = vertex(strip, i);
      expect(dot(normal(strip, i), [eye[0] - p[0], eye[1] - p[1], eye[2] - p[2]])).toBeGreaterThan(
        0,
      );
    }
  });

  it('lies flat without billboard, every triangle turned the other way: down', () => {
    const strip = trailStrip(line, [0.5, 0.5, 0.5, 0.5], false, eye);
    for (let i = 0; i < 6; i++) {
      const n = normal(strip, i);
      expect(n[1]).toBeLessThan(0);
      expect(Math.abs(n[0]) + Math.abs(n[2])).toBe(0);
    }
  });
});

describe('drawOrder (step 11)', () => {
  const layer = (name: string, trail: boolean, particles: number) => ({
    name,
    subsystem: { trail },
    quads: Array.from({ length: particles }),
  });
  const names = (layers: { name: string }[]): string[] => layers.map((l) => l.name);

  it('draws the sprite layers in order and then the trails while no sprite is drawn', () => {
    expect(names(drawOrder([layer('band', true, 5), layer('quiet', false, 0)]))).toEqual([
      'quiet',
      'band',
    ]);
    expect(names(drawOrder([layer('a', true, 5), layer('b', true, 5)]))).toEqual(['a', 'b']);
  });

  it('draws no trail of an effect that draws a sprite, whichever comes first in the file', () => {
    expect(names(drawOrder([layer('band', true, 5), layer('tiles', false, 3)]))).toEqual(['tiles']);
    expect(
      names(
        drawOrder([layer('tiles', false, 3), layer('band', true, 5), layer('child', false, 0)]),
      ),
    ).toEqual(['tiles', 'child']);
  });

  it('draws a trail with its own shader effect next to the sprites (step 22)', () => {
    const own = (subsystem: { trail: boolean; name?: string }): boolean => subsystem.name === 'own';
    const ownLayer = { name: 'own', subsystem: { trail: true, name: 'own' }, quads: [1, 2] };
    expect(
      names(drawOrder([layer('band', true, 5), ownLayer, layer('tiles', false, 3)], own)),
    ).toEqual(['tiles', 'own']);
  });

  it('draws a trail without its effect after a trail with its own effect that holds particles (step 24)', () => {
    const own = (subsystem: { trail: boolean; name?: string }): boolean => subsystem.name === 'own';
    const ownLayer = (particles: number) => ({
      name: 'own',
      subsystem: { trail: true, name: 'own' },
      quads: Array.from({ length: particles }),
    });
    const tiles = layer('tiles', false, 3);
    expect(names(drawOrder([tiles, ownLayer(2), layer('after', true, 5)], own))).toEqual([
      'tiles',
      'own',
      'after',
    ]);
    expect(names(drawOrder([tiles, layer('before', true, 5), ownLayer(2)], own))).toEqual([
      'tiles',
      'own',
    ]);
    expect(names(drawOrder([tiles, ownLayer(0), layer('after', true, 5)], own))).toEqual([
      'tiles',
      'own',
    ]);
  });
});
