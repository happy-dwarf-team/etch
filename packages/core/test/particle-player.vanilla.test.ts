/// <reference types="node" />
// Local only: reads every particle system of the installed game's `gfx/particles` for drawing and
// runs each for a few seconds, read in place and read only. Runs when ETCH_GAME_PATH names the
// game folder and is skipped otherwise (CI has no game). Game files never enter the repository.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findParticleBlock, ParticleEffect, readParticleSystem } from '../src/asset/index.ts';
import { decodeGameText, parseScript } from '../src/index.ts';
import { keyOf } from '../src/model/properties.ts';

const gamePath = process.env['ETCH_GAME_PATH'];
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe.skipIf(gamePath === undefined)('particle systems of the installed game', () => {
  it('reads and runs every system', () => {
    const folder = join(gamePath ?? '', 'gfx', 'particles');
    let systems = 0;
    let alive = 0;
    for (const file of readdirSync(folder).filter((name) => name.endsWith('.asset'))) {
      const tree = parseScript(decodeGameText(readFileSync(join(folder, file)), 'script').text);
      for (const entry of tree.entries) {
        if (entry.kind !== 'property' || keyOf(entry) !== 'particle') continue;
        if (entry.value?.kind !== 'block') continue;
        const system = readParticleSystem(entry.value);
        systems++;
        const effect = new ParticleEffect(system, 1, systems);
        let most = 0;
        for (let i = 0; i < 90; i++) {
          effect.step(1 / 30, IDENTITY);
          most = Math.max(most, effect.count);
          for (let s = 0; s < system.subsystems.length; s++) {
            for (const q of effect.quads(s)) {
              expect(Number.isFinite(q.x + q.y + q.z + q.size + q.rotation)).toBe(true);
              expect(q.a).toBeGreaterThanOrEqual(0);
              expect(q.a).toBeLessThanOrEqual(255);
            }
          }
        }
        if (most > 0) alive++;
      }
    }
    expect(systems).toBeGreaterThanOrEqual(9);
    // Every system emits something in its first three seconds.
    expect(alive).toBe(systems);
  });

  it('reads musket_muzzle as the lab read it', () => {
    const text = decodeGameText(
      readFileSync(join(gamePath ?? '', 'gfx/particles/musket_muzzle.asset')),
      'script',
    ).text;
    const block = findParticleBlock(parseScript(text).entries, 'musket_muzzle');
    expect(block).toBeDefined();
    if (block === undefined) return;
    const system = readParticleSystem(block);
    const smoke = system.subsystems.find((s) => s.texture.file?.toLowerCase().includes('cloud'));
    expect(smoke).toMatchObject({ maxAmount: 100, texture: { shader: 'alpha' } });
    expect(smoke?.emission.base).toBe(1000);
    expect(smoke?.life.base).toBe(5);
    expect(smoke?.velocity).toMatchObject({ base: 15, variation: 14 });
    const effect = new ParticleEffect(system);
    effect.step(0.1, IDENTITY);
    const index = smoke === undefined ? -1 : system.subsystems.indexOf(smoke);
    expect(effect.quads(index)).toHaveLength(100);
  });
});
