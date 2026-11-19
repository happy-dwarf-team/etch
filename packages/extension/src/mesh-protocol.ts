// Messages between the mesh preview (src/mesh-preview.ts) and its webview script
// (webview/mesh.ts). Types only, so that both sides can import them.

/** What the mesh webview drew, for Etch's tests. */
export interface MeshSummary {
  readonly shapes: number;
  readonly collisionShapes: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly bones: number;
  readonly textured: number;
  /** Drawn parts with a normal map (and tangents), and with a specular map. */
  readonly normalMapped: number;
  readonly specularMapped: number;
  readonly animation: string | undefined;
  /** The animations offered: the `.anim` files beside the mesh that name its bones. */
  readonly animations: readonly string[];
  /**
   * Where each texture a material names (diffuse, normal, specular) came from (`the game`, a mod,
   * `beside the mesh`), or `not found`.
   */
  readonly textures: Readonly<Record<string, string>>;
}

/** A texture the host decoded, or why it could not. */
export type MeshTexture =
  | {
      readonly ok: true;
      readonly width: number;
      readonly height: number;
      readonly rgba: Uint8Array;
      /** The playset layer it came from (`the game`, a mod's name) or `beside the mesh`. */
      readonly source: string;
    }
  | { readonly ok: false; readonly message: string };

/** An animation beside the mesh that names its bones. */
export interface MeshAnimationEntry {
  readonly name: string;
  readonly frames: number;
  readonly fps: number;
}

/** Messages from the mesh webview. */
export type MeshWebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'animation'; readonly name: string }
  | { readonly type: 'shown'; readonly summary: MeshSummary }
  | { readonly type: 'failed'; readonly message: string };

/** Messages to the mesh webview. */
export type MeshHostMessage =
  | {
      readonly type: 'mesh';
      readonly name: string;
      readonly bytes: Uint8Array;
      /** By the file name a material's `diff`, `n` or `spec` gives. */
      readonly textures: Readonly<Record<string, MeshTexture>>;
      readonly animations: readonly MeshAnimationEntry[];
    }
  | { readonly type: 'animation'; readonly name: string; readonly bytes: Uint8Array };
