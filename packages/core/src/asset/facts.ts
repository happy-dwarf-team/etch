// One line of facts about a mesh or an animation, for hovers: what a modder checks first (size,
// skeleton, shaders and the textures a material names; frames, speed and joints).

import type { PdxAnimation } from './anim.ts';
import type { PdxMesh } from './mesh.ts';

const count = (n: number, one: string, many = `${one}s`): string =>
  `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** Size, skeleton, shaders and diffuse textures of the drawn shapes; collision shapes counted apart. */
export function meshFacts(mesh: PdxMesh): {
  summary: string;
  shaders: string[];
  textures: string[];
} {
  const drawn = mesh.shapes.filter((shape) => !shape.collision);
  const parts = drawn.flatMap((shape) => shape.parts);
  const vertices = parts.reduce((sum, part) => sum + part.positions.length / 3, 0);
  const triangles = parts.reduce((sum, part) => sum + part.indices.length / 3, 0);
  const bones = drawn.reduce((sum, shape) => sum + shape.skeleton.length, 0);
  const collision = mesh.shapes.length - drawn.length;
  const items = [
    count(drawn.length, 'shape'),
    count(vertices, 'vertex', 'vertices'),
    count(triangles, 'triangle'),
    bones > 0 ? count(bones, 'bone') : 'no skeleton',
  ];
  if (collision > 0) items.push(count(collision, 'collision shape'));
  const unique = (values: (string | undefined)[]): string[] => [
    ...new Set(values.filter((v): v is string => v !== undefined && v !== '')),
  ];
  return {
    summary: items.join(' · '),
    shaders: unique(parts.map((part) => part.material.shader)),
    textures: unique(parts.map((part) => part.material.diffuse)),
  };
}

/** Frames, speed, length and joints. */
export function animationFacts(animation: PdxAnimation): string {
  const seconds = animation.fps > 0 ? animation.frames / animation.fps : 0;
  return [
    `${count(animation.frames, 'frame')} at ${String(animation.fps)} fps (${seconds.toFixed(1)} s)`,
    count(animation.joints.length, 'joint'),
  ].join(' · ');
}
