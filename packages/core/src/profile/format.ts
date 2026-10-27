/**
 * The window profile format, `formatVersion` 1 (ADR 0006, spec section 4): what one JSONC file of
 * one source says about one top-level window, and the profile its layers make together. Every
 * entry has a key (its id) and keeps where it was written, so that a load check can point at it
 * and a later layer can replace or remove it.
 *
 * `profiles/window-profile.schema.json` describes the same format for VS Code's completion; the
 * reader checks it itself and the two are kept in step by a test.
 */
import type { SourceRange } from '../script/tree.ts';

/** The format version this Etch reads; a file with a newer one is skipped with a notice. */
export const PROFILE_FORMAT_VERSION = 1;

/**
 * What decides a selector's value: the preview's screen size (`resolution`), a fact Etch reads
 * from a save (`data`), what the player clicked open (`ui`), or a mod's scripted interface
 * (`scripted`, hand-written: Etch never evaluates a trigger).
 */
export type SelectorKind = 'resolution' | 'data' | 'ui' | 'scripted';

export const SELECTOR_KINDS: readonly SelectorKind[] = ['resolution', 'data', 'ui', 'scripted'];

/** Where an entry was written: one layer's file. */
export interface ProfileOrigin {
  /** The layer's place: 0 for vanilla, then each mod of the playset, then the mod project. */
  readonly layer: number;
  /** What the layer is, for messages: `vanilla`, a mod's name or `mod project`. */
  readonly source: string;
  /** The file, as the caller names it (a path or a URI). */
  readonly file: string;
}

/** An entry as written: the file it came from and its range there. */
export interface Written {
  readonly origin: ProfileOrigin;
  readonly range: SourceRange;
}

/** A range of the screen a `resolution` selector value covers; each bound is inclusive. */
export interface ScreenBounds {
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
}

export interface SelectorValue extends ScreenBounds {
  readonly id: string;
  readonly label: string;
}

export interface Selector extends Written {
  readonly id: string;
  readonly kind: SelectorKind;
  readonly label: string;
  readonly values: readonly SelectorValue[];
  /** The value when nothing else sets it; the first value when the file names none. */
  readonly default: string;
  /** For a `data` selector, the fact it reads (`province.ownedByPlayer`). */
  readonly fact?: string;
  /** What decides the value in the game, such as a scripted `potential`; shown, never evaluated. */
  readonly note?: string;
}

/** A widget path pattern as written, with its range: names from the top-level window, `*`, `**`. */
export interface PathRef {
  readonly path: string;
  readonly range: SourceRange;
}

/**
 * An exclusive group: the member of the selector's value shows and the others are hidden. With
 * `none`, a value may have no member and then none shows.
 */
export interface Group extends Written {
  readonly id: string;
  readonly label?: string;
  readonly selector: string;
  readonly members: readonly (PathRef & { readonly value: string })[];
  readonly none: boolean;
}

/** A condition of a rule: the selector has one of the values. */
export interface Condition {
  readonly selector: string;
  readonly values: readonly string[];
  readonly range: SourceRange;
}

/** A rule: when every condition holds, its effects apply to the paths they name. */
export interface Rule extends Written {
  readonly id: string;
  readonly when: readonly Condition[];
  readonly show: readonly PathRef[];
  readonly hide: readonly PathRef[];
  /** Widgets the game does not create at all in this case, such as the other of a `_large` pair. */
  readonly notCreated: readonly PathRef[];
  /** Widgets the game's code moves to a `positionType` of the window's file. */
  readonly position: readonly (PathRef & { readonly positionType: string })[];
  /** Sprite frames (from 1) the game's code sets. */
  readonly frame: readonly (PathRef & { readonly frame: number })[];
}

export interface SelectorSetting {
  readonly selector: string;
  readonly value: string;
  readonly range: SourceRange;
}

/** A named view: selector values and hand toggles (a path shown or hidden by hand). */
export interface View extends Written {
  readonly id: string;
  readonly label: string;
  readonly set: readonly SelectorSetting[];
  readonly toggles: readonly (PathRef & { readonly shown: boolean })[];
}

/** The mod a source's profiles belong to, matched with the playset's mods. */
export interface ProfileMod {
  /** The Workshop item, `remote_file_id` in the descriptor. */
  readonly remoteFileId?: string;
  /** The descriptor's `name`, for a local copy without a Workshop id. */
  readonly name?: string;
}

/** The sections whose entries are keyed by id and layered (ADR 0006). */
export type ProfileSection = 'selectors' | 'groups' | 'rules' | 'views';

export const PROFILE_SECTIONS: readonly ProfileSection[] = [
  'selectors',
  'groups',
  'rules',
  'views',
];

export interface SectionEntries {
  readonly selectors: Selector;
  readonly groups: Group;
  readonly rules: Rule;
  readonly views: View;
}

/**
 * An entry of a layer, or its removal: `null` in a later layer removes the entry of that key
 * from the layers below.
 */
export type Layered<T> = T | ({ readonly removed: true; readonly id: string } & Written);

/** One file, as read: its entries in file order. */
export interface ProfileFile {
  readonly origin: ProfileOrigin;
  readonly window: string;
  /** The game's or the mod's version the file was checked with. */
  readonly checkedWith?: string;
  readonly mod?: ProfileMod;
  readonly selectors: readonly Layered<Selector>[];
  readonly groups: readonly Layered<Group>[];
  readonly rules: readonly Layered<Rule>[];
  readonly views: readonly Layered<View>[];
  readonly defaultView?: { readonly id: string; readonly range: SourceRange };
}

/** A window's profile: its layers applied in order. */
export interface WindowProfile {
  readonly window: string;
  readonly selectors: readonly Selector[];
  readonly groups: readonly Group[];
  readonly rules: readonly Rule[];
  readonly views: readonly View[];
  /** The view the preview opens on; the first view when no layer names one. */
  readonly defaultView: string | undefined;
  /** Where the layer that named the default view named it. */
  readonly defaultViewAt?: Written;
  /** The files it was made from, bottom layer first. */
  readonly layers: readonly ProfileOrigin[];
}

export type ProfileDiagnosticCode =
  /** Not JSONC, or not the format: a wrong type, a missing or unknown property. */
  | 'profile-format'
  /** A `formatVersion` newer than this Etch reads: the file is skipped. */
  | 'profile-newer-format'
  /** A path that matches no widget of the window. */
  | 'profile-unknown-path'
  /** A selector, group, view or `positionType` no layer defines. */
  | 'profile-unknown-name'
  /** A selector value the selector does not have. */
  | 'profile-unknown-value'
  /** A fact Etch does not implement, or values that are not the fact's. */
  | 'profile-unknown-fact'
  /** The file was checked with another version of its game or mod; it still applies. */
  | 'profile-other-version';

/** A problem of one profile file; the range is in that file's text. */
export interface ProfileDiagnostic extends SourceRange {
  readonly severity: 'error' | 'warning' | 'information';
  readonly code: ProfileDiagnosticCode;
  readonly message: string;
  /** The file, as its origin names it. */
  readonly file: string;
}
