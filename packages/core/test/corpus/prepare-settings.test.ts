/// <reference types="node" />
// What Prepare writes into the host's Tongs settings: nothing Anvil moves at the start, so the host
// keeps the hashes host.json records (Assert-Host).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Tongs 0.35's [retired.*] settings: Anvil 1.23 moves a saved value of one into anvil.toml once.
const TONGS_RETIRED = ['game_calls', 'game_calls_ironman', 'game_calls_multiplayer'];

describe('corpus Prepare', () => {
  it("writes no retired Tongs setting into the host's settings.toml", async () => {
    const script = await readFile(
      join(import.meta.dirname, '../../src/corpus/driver/game.ps1'),
      'utf8',
    );
    const line = script
      .split('\n')
      .find((l) => l.includes("'settings.toml'") && l.includes('Set-Content'));
    expect(line).toBeDefined();
    const names = [...(line ?? '').matchAll(/'(\w+) = [^']*'/g)].map((m) => m[1]);
    expect(names).toEqual(['enabled', 'input']);
    for (const name of TONGS_RETIRED) expect(names).not.toContain(name);
  });
});
