/**
 * Finding the game, the mods and the playset (spec sections 2 and 8). Uses Node's file system, so it
 * is a separate entry point, `@etch/core/playset`, that the browser-side renderer never imports.
 */
export { parseModDescriptor, decodeDescriptor, type ModDescriptor } from './descriptor.ts';
export type { PlaysetDiagnostic, PlaysetDiagnosticSeverity } from './diagnostics.ts';
export { GameFiles, type GameFile, type GameFilesLayer } from './game-files.ts';
export {
  EU4_STEAM_APP_ID,
  SUPPORTED_GAME_EXE_SHA256,
  findGameInSteam,
  findProfileFolder,
  readGameBuild,
  readSteamLibraries,
  systemEnvironment,
  workshopFolderFor,
  type DiscoveryEnvironment,
  type GameBuild,
} from './locate.ts';
export type { Mod, ModSource } from './mods.ts';
export { findPlayset, type FindPlaysetOptions, type Playset } from './playset.ts';
export { parseVdf, type VdfObject } from './vdf.ts';
