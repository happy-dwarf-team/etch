/**
 * The layers of a window profile (ADR 0006, spec section 4): vanilla, then each mod of the
 * playset in playset order, then the mod project's own file. A later layer replaces a whole entry
 * by its key, adds one, or removes one with `null`; nothing is merged deeply.
 */
import {
  PROFILE_SECTIONS,
  type Layered,
  type ProfileFile,
  type ProfileMod,
  type SectionEntries,
  type WindowProfile,
  type Written,
} from './format.ts';

/**
 * Applies the files of one window in layer order, bottom first. A replaced entry keeps its place
 * among the others, so rules keep their order; a new one goes last.
 */
export function layerProfiles(window: string, files: readonly ProfileFile[]): WindowProfile {
  const sections = {
    selectors: new Map<string, SectionEntries['selectors']>(),
    groups: new Map<string, SectionEntries['groups']>(),
    rules: new Map<string, SectionEntries['rules']>(),
    views: new Map<string, SectionEntries['views']>(),
    content: new Map<string, SectionEntries['content']>(),
    repeaters: new Map<string, SectionEntries['repeaters']>(),
    links: new Map<string, SectionEntries['links']>(),
  };
  let defaultView: string | undefined;
  let defaultViewAt: Written | undefined;
  for (const file of files) {
    for (const section of PROFILE_SECTIONS) {
      const entries = sections[section] as Map<string, unknown>;
      for (const entry of file[section] as readonly Layered<{ id: string }>[]) {
        if ('removed' in entry) entries.delete(entry.id);
        else entries.set(entry.id, entry);
      }
    }
    if (file.defaultView !== undefined) {
      defaultView = file.defaultView.id;
      defaultViewAt = { origin: file.origin, range: file.defaultView.range };
    }
  }
  const views = [...sections.views.values()];
  return {
    window,
    selectors: [...sections.selectors.values()],
    groups: [...sections.groups.values()],
    rules: [...sections.rules.values()],
    views,
    content: [...sections.content.values()],
    repeaters: [...sections.repeaters.values()],
    links: [...sections.links.values()],
    defaultView: defaultView ?? views[0]?.id,
    ...(defaultViewAt === undefined ? {} : { defaultViewAt }),
    layers: files.map((file) => file.origin),
  };
}

/** A mod of the playset, as far as matching it with a profile source goes. */
export interface PlaysetModKey {
  /** The descriptor's `name`. */
  readonly name: string;
  /** Its Workshop item id. */
  readonly workshopId?: string;
}

/**
 * Whether a source's mod is this mod of the playset: by Workshop `remote_file_id`, else by the
 * descriptor's name, ignoring case (a local copy has no Workshop id).
 */
export function profileModMatches(mod: ProfileMod, playsetMod: PlaysetModKey): boolean {
  if (mod.remoteFileId !== undefined && playsetMod.workshopId !== undefined) {
    return mod.remoteFileId === playsetMod.workshopId;
  }
  return (
    mod.name !== undefined && mod.name.trim().toLowerCase() === playsetMod.name.trim().toLowerCase()
  );
}
