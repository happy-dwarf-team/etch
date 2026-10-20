// Checks the sampler table against the game's gfx/FX/*.shader files of a local
// EU4 install, read in place. Runs only when ETCH_EU4_DIR names the game folder.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHADER_SAMPLERS, type SamplerState, type ShaderName } from '../src/index.ts';

const gameDir = process.env['ETCH_EU4_DIR'];

/** The samplers of a shader file's pixel shader, by `Index`. */
function samplers(source: string): SamplerState[] {
  const block = /Samplers\s*=\s*\{([\s\S]*?)\n\t\}/.exec(source)?.[1] ?? '';
  const found: SamplerState[] = [];
  for (const [, body = ''] of block.matchAll(/\w+\s*=\s*\{([^}]*)\}/g)) {
    const value = (key: string): string =>
      new RegExp(`${key}\\s*=\\s*"(\\w+)"`, 'i').exec(body)?.[1]?.toLowerCase() ?? '';
    const filter = (key: string): SamplerState['min'] =>
      value(key) === 'point' ? 'point' : 'linear';
    const index = Number(/Index\s*=\s*(\d+)/.exec(body)?.[1]);
    found[index] = {
      min: filter('MinFilter'),
      mag: filter('MagFilter'),
      wrap: value('AddressU') === 'wrap',
    };
  }
  return found;
}

describe.runIf(gameDir !== undefined)('vanilla shaders', () => {
  const names = Object.keys(SHADER_SAMPLERS).filter((name) => name !== 'default');

  it.each(names)('%s samples as gfx/FX says', (name) => {
    const source = readFileSync(join(gameDir ?? '', 'gfx/FX', `${name}.shader`), 'latin1');
    const table = SHADER_SAMPLERS[name as ShaderName];
    expect(samplers(source).slice(0, table.length)).toEqual(table);
  });
});
