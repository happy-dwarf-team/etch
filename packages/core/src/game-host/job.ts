/**
 * What a game host job (spec section 4) takes from the offline renderer's model: the crop
 * rectangle, from the layout, and the names `reloadtexture` takes for a texture saved to disk.
 */
import type { DrawRect } from '../draw-list.ts';
import type { InterfaceIndex } from '../model/interface-index.ts';
import type { Screen } from '../model/gui.ts';
import { textureCandidates } from '../model/references.ts';

/** A rectangle of the game host's screen, in whole pixels. */
export interface CropRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The part of the screen a job captures: every laid-out widget of the previewed window (windows
 * do not clip their children), widened to whole pixels and clamped to the screen. `undefined`
 * when nothing of the window is on the screen.
 */
export function previewCrop(widgets: readonly DrawRect[], screen: Screen): CropRect | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const w of widgets) {
    if (!(w.width > 0 && w.height > 0)) continue;
    left = Math.min(left, w.x);
    top = Math.min(top, w.y);
    right = Math.max(right, w.x + w.width);
    bottom = Math.max(bottom, w.y + w.height);
  }
  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  const x2 = Math.min(screen.width, Math.ceil(right));
  const y2 = Math.min(screen.height, Math.ceil(bottom));
  if (!(x2 > x && y2 > y)) return undefined;
  return { x, y, width: x2 - x, height: y2 - y };
}

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
