/**
 * The game host's backdrop (etch#22): the overlay mod's solid black and white sprites, drawn by a
 * full-screen wrapper window under the previewed window. The plugin captures the window over both
 * and recovers straight RGBA from the pair. `.gfx` files and textures load only at startup, so
 * the overlay mod carries these files from the first start of the game host.
 */

/** The colour under the previewed window in one of the two preview copies. */
export type BackdropColour = 'black' | 'white';

export const BACKDROP_COLOURS: readonly BackdropColour[] = ['black', 'white'];

/** Side of the backdrop textures, in pixels. */
export const BACKDROP_TEXTURE_SIZE = 32;

/** The sprite the wrapper of a copy over `colour` draws. */
export function backdropSprite(colour: BackdropColour): string {
  return `GFX_etch_backdrop_${colour}`;
}

/** A file of the overlay mod: its path inside the mod, with `/`, and its bytes. */
export interface OverlayFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Path of the `.gfx` file that defines the backdrop sprites, inside the overlay mod. */
export const BACKDROP_GFX_PATH = 'interface/etch_backdrop.gfx';

function texturePath(colour: BackdropColour): string {
  return `gfx/interface/etch_backdrop_${colour}.tga`;
}

/**
 * The backdrop's files for the overlay mod: `interface/etch_backdrop.gfx` with one plain
 * `spriteType` per colour, and their 32×32 opaque textures as uncompressed 32-bit TGA. The
 * sprites are what etch#22 verified; the wrapper scales them to cover the screen.
 */
export function backdropFiles(): OverlayFile[] {
  const gfx = ['spriteTypes = {'];
  for (const colour of BACKDROP_COLOURS) {
    gfx.push(
      '\tspriteType = {',
      `\t\tname = "${backdropSprite(colour)}"`,
      `\t\ttexturefile = "${texturePath(colour)}"`,
      '\t}',
    );
  }
  gfx.push('}', '');
  return [
    { path: BACKDROP_GFX_PATH, bytes: new TextEncoder().encode(gfx.join('\r\n')) },
    ...BACKDROP_COLOURS.map((colour) => ({
      path: texturePath(colour),
      bytes: solidTga(BACKDROP_TEXTURE_SIZE, colour === 'black' ? 0 : 255),
    })),
  ];
}

/** An opaque grey-level square as an uncompressed 32-bit TGA, top-left origin, BGRA. */
function solidTga(side: number, level: number): Uint8Array {
  const bytes = new Uint8Array(18 + side * side * 4);
  bytes[2] = 2; // uncompressed true colour
  bytes[12] = side & 0xff;
  bytes[13] = side >> 8;
  bytes[14] = side & 0xff;
  bytes[15] = side >> 8;
  bytes[16] = 32; // bits per pixel
  bytes[17] = 0x28; // 8 alpha bits, top-left origin
  for (let i = 18; i < bytes.length; i += 4) {
    bytes[i] = level;
    bytes[i + 1] = level;
    bytes[i + 2] = level;
    bytes[i + 3] = 255;
  }
  return bytes;
}
