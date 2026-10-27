/**
 * What the live game's reload policy (spec section 6) takes from the extension's model: the
 * names `reloadtexture` takes for a texture saved to disk.
 */
import type { InterfaceIndex } from '../model/interface-index.ts';
import { textureCandidates } from '../model/references.ts';

/**
 * The `texturefile` values, as their `.gfx` files write them, of every sprite drawn from a
 * texture file at a game-relative path: `reloadtexture` takes the name as written
 * (`gfx//interface//topbar_UL.tga`), also when it names a `.tga` that only exists as `.dds`
 * (etch#6). Without a sprite that names it, the path itself.
 */
export function textureReloadNames(index: InterfaceIndex, path: string): string[] {
  const key = path.replace(/[\\/]+/g, '/').toLowerCase();
  const names = new Set<string>();
  for (const file of index.gfxFiles) {
    for (const sprite of file.file.sprites) {
      for (const texture of sprite.textures) {
        if (textureCandidates(texture.path).some((candidate) => candidate.toLowerCase() === key)) {
          names.add(texture.path);
        }
      }
    }
  }
  return names.size > 0 ? [...names] : [path.replace(/\\/g, '/')];
}
