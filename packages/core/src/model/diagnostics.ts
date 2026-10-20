import type { SourceRange } from '../script/tree.ts';

export type ModelDiagnosticSeverity = 'error' | 'warning' | 'information';

export type ModelDiagnosticCode =
  /** A top-level name defined twice in one `.gui` file (etch#16). */
  | 'duplicate-top-level-name'
  /** A sprite name defined again; the first definition is used (unverified). */
  | 'duplicate-sprite'
  /** A font name defined again; the first definition is used (unverified). */
  | 'duplicate-font'
  /** A sprite reference that no `.gfx` file of the playset defines. */
  | 'missing-sprite'
  /** A font reference that no `bitmapfonts` block of the playset defines. */
  | 'missing-font'
  /** A texture path, or a referenced sprite's texture, that no layer of the playset has. */
  | 'missing-texture'
  /** A font whose `.fnt` file or texture no layer of the playset has. */
  | 'missing-font-file'
  /** A reference to a top-level definition (`scrollbartype`, top-level `parent`) that the playset lacks. */
  | 'missing-gui-type'
  /** A reference to a sibling or child widget (`background`, scroll bar parts, nested `parent`) that is not there. */
  | 'missing-widget'
  /** A reference that resolves only when case is ignored. */
  | 'reference-case'
  /** A `@name` value with no `@name = …` definition in the file. */
  | 'unknown-constant'
  /** A named block whose kind vanilla 1.37.5 does not use; Etch neither models nor draws it. */
  | 'unknown-widget-kind'
  /** A named block in `spriteTypes` whose kind vanilla 1.37.5 does not use. */
  | 'unknown-sprite-kind'
  /** Layout: a sprite's `effectFile` names a shader the renderer does not port; it draws with `default`. */
  | 'unhandled-shader'
  /** Layout: an `orientation` value the game's token table does not list; Etch anchors it upper left. */
  | 'unknown-orientation'
  /** Layout: a property that changes how a widget looks but that Etch does not apply (`rotation`, `origo`). */
  | 'not-applied'
  /** Layout: a texture or `.fnt` file that exists but cannot be read. */
  | 'unreadable-file'
  /** Layout: a character of a widget's text that its font has no glyph for. */
  | 'missing-glyph'
  /** Layout: a character of a widget's text outside Windows-1252. */
  | 'not-cp1252'
  /** Layout: a `§` colour letter no `textcolors` table defines. */
  | 'unknown-colour'
  /** Layout: a `£key£` text icon whose `GFX_text_key` sprite the playset lacks. */
  | 'missing-icon';

/** A problem the extension's model finds in one `.gui` or `.gfx` file; the range is in that file's game text. */
export interface ModelDiagnostic extends SourceRange {
  readonly severity: ModelDiagnosticSeverity;
  readonly code: ModelDiagnosticCode;
  readonly message: string;
}

export function diagnostic(
  severity: ModelDiagnosticSeverity,
  code: ModelDiagnosticCode,
  range: SourceRange,
  message: string,
): ModelDiagnostic {
  return { severity, code, message, start: range.start, end: range.end };
}
