/** How serious a problem in finding the game, the mods or the playset is. */
export type PlaysetDiagnosticSeverity = 'error' | 'warning' | 'information';

/** A problem in finding the game, the mods or the playset, for the Problems panel or the log. */
export interface PlaysetDiagnostic {
  severity: PlaysetDiagnosticSeverity;
  /** Stable identifier, such as `unsupported-game-build`. */
  code: string;
  message: string;
  /** The file or folder the problem is about, if any. */
  path?: string;
}
