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
  /** Which of the materials' maps are drawn: the Diffuse, Normal and Spec buttons. */
  readonly maps: MeshMaps;
  /** For an entity: its meshes in drawing order and the states offered. */
  readonly entity?: EntitySummary;
  /** When `PdxMeshTextureAtlas` parts are drawn: how many, and the flag on them. */
  readonly flag?: FlagSummary;
  /**
   * The Region colour (`#rrggbb`) when it is on and a `PdxMeshColor` or `PdxMeshTextureAtlas`
   * part shows it: a colonial nation's region colour, which the game draws on the flag's far half
   * and in place of the tertiary colour.
   */
  readonly region?: string;
  /**
   * When a mesh has levels of detail (shapes with a `lod` property): the level picked and the
   * levels offered, and the camera distance the mesh's `loddist` gives that level, if it has one.
   * Only the picked level's shapes are drawn and counted.
   */
  readonly lod?: {
    readonly level: number;
    readonly levels: readonly number[];
    readonly from?: number;
    /** The LOD box is on Auto: `level` is the one the camera's distance gives, as the game. */
    readonly auto?: boolean;
  };
  /**
   * The map tree type (`mapobject_<n>`) that draws the mesh: it is drawn as the game's tree
   * shader draws it.
   */
  readonly tree?: string;
  /**
   * While the root mesh plays an animation: the whole frame every mesh is posed at (the frame
   * slider's), the animation's frame count and whether it plays or is paused.
   */
  readonly frame?: { readonly at: number; readonly of: number; readonly playing: boolean };
  /** Drawn `PdxMeshAlphaBlend` parts, blended by their diffuse alpha after the opaque ones. */
  readonly blended?: number;
  /** Drawn parts that take snow (`PdxMeshSnow`, or a map tree's), and the Snow slider's amount. */
  readonly snow?: { readonly parts: number; readonly amount: number };
  /**
   * A map tree's tint map (`map/terrain/Tree_tint.bmp`): where it came from (`the game`, a mod), or
   * `undefined` when it was not found or read, and the Turn slider's value.
   */
  readonly tint?: { readonly source: string | undefined; readonly turn: number };
  /**
   * A map tree: the Ground colour (`#rrggbb`) standing in for the map's colour map at the tree's
   * place, which the game lays over it at 0.25; `#808080` changes nothing.
   */
  readonly ground?: string;
  /**
   * A map tree's season colour: where its season map (`map/terrain/Tree_season.bmp`) and its
   * tree seasons (`map/seasons.txt`) came from (`undefined` when not found or read), the Date
   * slider's day of the year (0 for 1 January), the season value the game takes for that day
   * (`undefined` without the tree seasons) and the North slider's value.
   */
  readonly season?: {
    readonly source: string | undefined;
    readonly seasons: string | undefined;
    readonly day: number;
    readonly value: number | undefined;
    readonly north: number;
  };
  /**
   * A map tree's place (the Place box): the province, where its colour maps came from, and the
   * Ground colour (`#rrggbb`) and North value it gives on the Date slider's day.
   */
  readonly place?: {
    readonly province: number;
    readonly source: string;
    readonly ground: string;
    readonly north: number;
  };
  /**
   * Only in the answer to a `controls` message: the canvas pixels the mesh covers (those not of
   * the background colour) and their mean colour, read back right after a frame drawn with the
   * new controls.
   */
  readonly drawn?: { readonly pixels: number; readonly mean: readonly [number, number, number] };
}

/**
 * The tree blocks of the playset's `map/seasons.txt` (`tree_winter` to `tree_autumn2`) as days of
 * the year, by column of the season map (`null` for a block that is missing or unreadable), with
 * what could not be read; or why the file was not read.
 */
export type MeshTreeSeasons =
  | {
      readonly ok: true;
      /** The eight tree seasons, by column of the season map. */
      readonly spans: readonly ({ readonly start: number; readonly end: number } | null)[];
      /** The four map seasons (winter, spring, summer, autumn), whose colour maps the tree takes. */
      readonly mapSpans: readonly ({ readonly start: number; readonly end: number } | null)[];
      readonly source: string;
      readonly problems: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

/**
 * A place on the map for a map tree: a province's position (`map/positions.txt`, the first
 * pair, in map pixels from the map's south-west corner), the colour of each map season's colour
 * map there (`map/terrain/colormap_<season>.dds`, red, green and blue from 0 to 255, in winter,
 * spring, summer, autumn order) and how much of the season colour a tree there takes (`north`).
 */
export type MeshPlace =
  | {
      readonly ok: true;
      readonly province: number;
      readonly x: number;
      readonly y: number;
      readonly colours: readonly (readonly number[])[];
      readonly north: number;
      /** Where the colour maps came from (`the game`, a mod). */
      readonly source: string;
    }
  | { readonly ok: false; readonly message: string };

/**
 * The preview's controls, set as a user would set them: Snow, Turn, Ground (`#rrggbb`), Date
 * (a day of the year, 0 for 1 January), North, the Diffuse, Normal and Spec buttons and the
 * three country colours (`#rrggbb`). Etch's tests set them
 * through `MeshPreviewApi.control`.
 */
export interface MeshControls {
  /** The Diffuse, Normal and Spec buttons; a map left out keeps its button. */
  readonly maps?: Partial<MeshMaps>;
  /** The Region box: a colonial nation's region colour (`#rrggbb`), or `null` for off. */
  readonly region?: string | null;
  readonly colours?: {
    readonly primary?: string;
    readonly secondary?: string;
    readonly tertiary?: string;
  };
  readonly snow?: number;
  readonly turn?: number;
  readonly ground?: string;
  readonly day?: number;
  readonly north?: number;
  /**
   * The Place box: a province ID whose place gives Ground (from Date) and North, or `null` to
   * clear it. The preview answers once the host has looked the place up.
   */
  readonly place?: number | null;
  /** The LOD box: a level, or `auto` for the level the camera's distance gives. */
  readonly lod?: number | 'auto';
  /** The camera's distance from the point it orbits, in the drawn space's units. */
  readonly distance?: number;
  /**
   * The frame slider: pauses and poses every mesh at this frame of the root mesh's animation
   * (wrapped into its frames); nothing without one.
   */
  readonly frame?: number;
}

/**
 * Which of a material's maps the preview draws. Without the diffuse map a part is plain grey, and
 * what its alpha marks goes with it (a flag, see-through parts, a map tree's cut-out leaves);
 * without the specular map, the highlight and a `PdxMeshColor` part's country colours, which its
 * R, G and B mask.
 */
export interface MeshMaps {
  readonly diffuse: boolean;
  readonly normal: boolean;
  readonly specular: boolean;
}

export interface FlagSummary {
  readonly parts: number;
  /** The tag whose `gfx/flags` flag is drawn, or `undefined` for the country colours' stripes. */
  readonly tag: string | undefined;
}

export interface EntitySummary {
  readonly name: string;
  /** `entity` for the root, `entity on bone` for an attachment. */
  readonly nodes: readonly string[];
  readonly states: readonly string[];
  readonly state: string | undefined;
  /** What the host could not resolve or read. */
  readonly problems: readonly string[];
  /** The particle effects the shown state starts, which are not drawn. */
  readonly particles: readonly string[];
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
  /** The flag of a country tag for `PdxMeshTextureAtlas` parts. */
  | { readonly type: 'flag'; readonly tag: string }
  /** A map tree's place: the province ID typed in the Place box. */
  | { readonly type: 'place'; readonly province: number }
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
      /**
       * The map tree type (`mapobject_<n>`) of the playset that names this mesh: the game draws
       * it with its tree shader (`gfx/FX/tree.shader`), not the shader its materials name.
       */
      readonly tree: string | undefined;
      /** For a map tree: the playset's tint map, decoded; `undefined` for another mesh. */
      readonly tint: MeshTexture | undefined;
      /** For a map tree: the playset's season map, decoded; `undefined` for another mesh. */
      readonly season: MeshTexture | undefined;
      /** For a map tree: the playset's tree seasons; `undefined` for another mesh. */
      readonly seasons: MeshTreeSeasons | undefined;
    }
  | { readonly type: 'animation'; readonly name: string; readonly bytes: Uint8Array }
  | { readonly type: 'flag'; readonly tag: string; readonly texture: MeshTexture }
  | { readonly type: 'place'; readonly province: number; readonly place: MeshPlace }
  /** Sets the controls, draws a frame and answers `shown` with `drawn` (for Etch's tests). */
  | { readonly type: 'controls'; readonly controls: MeshControls }
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
      /**
       * The particle effects each state's `event`s start, by state name, in words: Etch does not
       * draw particles, so the preview names them.
       */
      readonly particles: Readonly<Record<string, readonly string[]>>;
    };
