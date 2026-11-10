// The pinned builds this Etch carries (pins/game-builds.json), by id: build.mts bakes their
// release tags into the bundle, for **Report to Etch** (spec v3 section 4). Node only, no vscode.

declare const ETCH_PINS: Readonly<Record<string, string>> | undefined;

/** Each pinned build's release tag by its id (`anvil`, `tongs`); empty outside the bundle. */
export const PINNED_TAGS: Readonly<Record<string, string>> =
  typeof ETCH_PINS === 'undefined' ? {} : ETCH_PINS;
