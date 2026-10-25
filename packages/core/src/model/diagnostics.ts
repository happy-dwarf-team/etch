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
  | 'missing-icon'
  /** Game host: a top-level kind other than `windowType` and `eu3dialogtype`, which `window open` cannot show (etch#16). */
  | 'game-host-window-kind'
  /** Game host: no preview copy, because the file or window cannot be copied (not an interface `.gui`, no such window, unclosed block). */
  | 'not-previewable'
  /** Game host: a name the preview copy defines is already defined, by the file itself or by the playset. */
  | 'copy-name-taken'
  /** Game host: what the preview copy leaves out of the original (a second definition of a name, `default_*sound`). */
  | 'copy-leaves-out'
  /** Game host: a previewed window with `parent`, which inside the backdrop wrapper names a sibling instead. */
  | 'wrapped-parent'
  /** Game host: a line the game wrote to `error.log` during a preview job (etch#52). */
  | 'game-error-log'
  /** Game host: a console command of a preview job that the game refused (etch#52). */
  | 'game-console-answer'
  /** Game host: the game's own window of that name may not be the edited text (H6 of etch#16). */
  | 'game-original-differs'
  /** Game host: the crop reaches the corner where the game draws its FPS counter (etch#22). */
  | 'fps-counter-corner';

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
