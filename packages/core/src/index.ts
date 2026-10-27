/**
 * The game build Etch checks its results against (spec section 1). The game
 * host refuses any other build; the offline renderer warns on one.
 */
export const SUPPORTED_GAME_VERSION = '1.37.5';

/** Whether a game version string, such as the launcher shows, is the supported build. */
export function isSupportedGameVersion(version: string): boolean {
  return version.trim().replace(/^v/i, '') === SUPPORTED_GAME_VERSION;
}

export * from './script/index.ts';
export * from './text/index.ts';
export * from './game-text.ts';
export * from './localisation.ts';
export * from './draw-list.ts';
export * from './model/index.ts';
export * from './layout/index.ts';
export * from './resolution.ts';
export * from './live-game/index.ts';
