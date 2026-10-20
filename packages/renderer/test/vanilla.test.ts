// Reads every interface and font texture of a local EU4 install, in place and
// read-only. Runs only when ETCH_EU4_DIR names the game folder; CI has no game.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeDxt, readTexture, TextureReadError } from '../src/index.ts';

const gameDir = process.env['ETCH_EU4_DIR'];

function* textures(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* textures(path);
    else if (/\.(dds|tga)$/i.test(entry.name)) yield path;
  }
}

describe.runIf(gameDir !== undefined)('vanilla textures', () => {
  it('reads every texture in gfx/interface and gfx/fonts', { timeout: 300_000 }, () => {
    const root = gameDir ?? '';
    const failures: string[] = [];
    const formats = new Map<string, number>();
    for (const folder of ['gfx/interface', 'gfx/fonts']) {
      for (const path of textures(join(root, folder))) {
        try {
          const image = readTexture(path, readFileSync(path));
          const key = image.kind === 'dxt' ? image.format : image.layout;
          formats.set(key, (formats.get(key) ?? 0) + 1);
          if (image.kind === 'dxt') decodeDxt(image.format, image.width, image.height, image.data);
        } catch (error) {
          if (!(error instanceof TextureReadError)) throw error;
          failures.push(`${path.slice(root.length)}: ${error.message}`);
        }
      }
    }
    console.log(Object.fromEntries(formats));
    expect(failures).toEqual([]);
  });
});
