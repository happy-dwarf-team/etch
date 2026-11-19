// Messages between the mesh preview (src/mesh-preview.ts), the entity preview
// (src/entity-preview.ts) and their webview script (webview/mesh.ts). Types only, so that both
// sides can import them.

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
  /** For an entity: its meshes in drawing order and the states offered. */
  readonly entity?: EntitySummary;
}

export interface EntitySummary {
  readonly name: string;
  /** `entity` for the root, `entity on bone` for an attachment. */
  readonly nodes: readonly string[];
  readonly states: readonly string[];
  readonly state: string | undefined;
  /** What the host could not resolve or read. */
  readonly problems: readonly string[];
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

/** One mesh of an entity: the entity's own, or an attachment on a bone of an earlier node. */
export interface EntityNode {
  /** The entity's name. */
  readonly name: string;
  /** The index of the node it hangs on, earlier in the list; `undefined` for the root. */
  readonly parent: number | undefined;
  /** The parent mesh's bone it hangs on. */
  readonly bone: string | undefined;
  /** The `.mesh` file's name, for the bar. */
  readonly meshName: string;
  readonly bytes: Uint8Array;
  /** By the file name a material's `diff`, `n` or `spec` gives. */
  readonly textures: Readonly<Record<string, MeshTexture>>;
  /** The pdxmesh's `scale` times the entity's. */
  readonly scale: number;
  /** For each state the entity has: the key in `animations` of what it plays, if anything. */
  readonly states: Readonly<Record<string, string | undefined>>;
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
  | { readonly type: 'animation'; readonly name: string; readonly bytes: Uint8Array }
  | {
      readonly type: 'entity';
      readonly name: string;
      /** Parents before their attachments. */
      readonly nodes: readonly EntityNode[];
      /** `.anim` bytes by game-relative path. */
      readonly animations: Readonly<Record<string, Uint8Array>>;
      /** Every state name of the root entity, in its order. */
      readonly states: readonly string[];
      /** The state shown first: the entity's `default_state`, else `idle` when it has one. */
      readonly state: string | undefined;
      readonly problems: readonly string[];
    };
