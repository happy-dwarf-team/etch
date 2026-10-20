/**
 * Localisation of the playset in one language (spec sections 2 and 3).
 *
 * Input is game text: each `.yml` file already decoded as UTF-8 (etch#15),
 * from disk or from the unsaved editor buffer. Values keep `$…$`, `[…]`, `§`
 * and `£` as written, because the game's code fills the substitutions and the
 * text layout draws the colours and icons.
 *
 * Which file wins (hypothesis, not checked in the game): a file hides any file
 * at the same path in an earlier layer, as for other game files. Of the
 * visible files, those under `localisation/replace/` win over the others, and
 * within each group a later layer wins over an earlier one, then a later path
 * over an earlier one in the same layer.
 */

/** The languages of EU4 1.37.5; mods may add others. */
export const GAME_LANGUAGES = ['english', 'french', 'german', 'spanish'] as const;

/** The default of `etch.language`. */
export const DEFAULT_LANGUAGE = 'english';

/** One localisation file of the playset. */
export interface LocalisationFile {
  /** Path relative to the game or mod folder, e.g. `localisation/replace/x_l_english.yml`. */
  readonly path: string;
  /** The folder that provides the file: 0 for the game, then each mod in playset order. */
  readonly layer: number;
  /** The file's game text. */
  readonly text: string;
}

/** Something in a localisation file that the game may read differently from Etch. */
export interface LocalisationProblem {
  readonly path: string;
  readonly layer: number;
  /** Zero-based line in the file. */
  readonly line: number;
  readonly message: string;
}

/** Whether `language` can name a localisation language (`english` for `l_english`). */
export function isLanguageName(language: string): boolean {
  return /^[a-z][a-z_]*$/.test(language);
}

/**
 * Whether a path, relative to a game or mod folder, is a localisation file to
 * read for `language`: a `.yml` file under `localisation/` whose name ends in
 * `_l_<language>.yml` or names no language at all (as `languages.yml`, which
 * holds one section per language).
 */
export function isLocalisationPath(path: string, language: string): boolean {
  const p = normalisePath(path);
  if (!p.startsWith('localisation/') || !p.endsWith('.yml')) return false;
  const named = /_l_([a-z_]+)\.yml$/.exec(p);
  return named === null || named[1] === language;
}

/** The localisation of a playset in one language. */
export class Localisation {
  readonly language: string;
  private readonly files = new Map<string, ParsedFile>();
  private readonly winners = new Map<string, ParsedFile>();

  private constructor(language: string) {
    this.language = language;
  }

  /**
   * Builds the localisation of `language` from the playset's files. Files that
   * {@link isLocalisationPath} rejects are skipped, so callers may pass more.
   */
  static load(language: string, files: Iterable<LocalisationFile>): Localisation {
    if (!isLanguageName(language)) throw new Error(`Not a localisation language: ${language}`);
    const loc = new Localisation(language);
    const shown = new Map<string, LocalisationFile>();
    for (const file of files) {
      if (!isLocalisationPath(file.path, language)) continue;
      const id = normalisePath(file.path);
      const other = shown.get(id);
      if (other === undefined || other.layer <= file.layer) shown.set(id, file);
    }
    for (const [id, file] of shown) loc.files.set(id, parseFile(file, language));
    const order = [...loc.files.values()].sort(precedence);
    for (const file of order) for (const key of file.entries.keys()) loc.winners.set(key, file);
    return loc;
  }

  /** The number of keys. */
  get size(): number {
    return this.winners.size;
  }

  /** The value of a key, or `undefined` when no file defines it. */
  get(key: string): string | undefined {
    return this.winners.get(key)?.entries.get(key);
  }

  /** The value of `text` as a key, else `text` itself, as the game shows a `.gui` text. */
  text(text: string): string {
    return this.get(text) ?? text;
  }

  /** Where the value of a key comes from. */
  source(key: string): { path: string; layer: number } | undefined {
    const file = this.winners.get(key);
    return file && { path: file.source, layer: file.layer };
  }

  /** The problems found in the files that are read. */
  problems(): LocalisationProblem[] {
    return [...this.files.values()].flatMap((file) => file.problems);
  }

  /**
   * Adds a file or replaces one after an edit. A file hidden by one at the same
   * path in a later layer changes nothing. Returns whether the file is read.
   */
  update(file: LocalisationFile): boolean {
    if (!isLocalisationPath(file.path, this.language)) return false;
    const id = normalisePath(file.path);
    const old = this.files.get(id);
    if (old !== undefined && old.layer > file.layer) return false;
    const next = parseFile(file, this.language);
    this.files.set(id, next);
    for (const key of next.entries.keys()) {
      const winner = this.winners.get(key);
      if (winner === undefined || winner === old || precedence(next, winner) > 0) {
        this.winners.set(key, next);
      }
    }
    if (old !== undefined) {
      for (const key of old.entries.keys()) {
        if (this.winners.get(key) === old) this.elect(key);
      }
    }
    return true;
  }

  /**
   * Removes a file, for example after it was deleted. The caller passes the
   * file that the removed one hid, if any, to {@link update}.
   */
  remove(path: string, layer: number): void {
    const id = normalisePath(path);
    const old = this.files.get(id);
    if (old?.layer !== layer) return;
    this.files.delete(id);
    for (const key of old.entries.keys()) {
      if (this.winners.get(key) === old) this.elect(key);
    }
  }

  /** Sets the winner of a key among all files, after the previous one changed. */
  private elect(key: string): void {
    let best: ParsedFile | undefined;
    for (const file of this.files.values()) {
      if (file.entries.has(key) && (best === undefined || precedence(file, best) > 0)) best = file;
    }
    if (best === undefined) this.winners.delete(key);
    else this.winners.set(key, best);
  }
}

interface ParsedFile {
  /** The path as the caller gave it. */
  readonly source: string;
  /** The normalised path, which identifies the file and orders files of one layer. */
  readonly path: string;
  readonly layer: number;
  readonly replace: boolean;
  readonly entries: Map<string, string>;
  readonly problems: LocalisationProblem[];
}

function normalisePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').toLowerCase();
}

/** Positive when `a` wins over `b`. */
function precedence(a: ParsedFile, b: ParsedFile): number {
  return (
    Number(a.replace) - Number(b.replace) ||
    a.layer - b.layer ||
    (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  );
}

// ` KEY:0 "value"`: the value runs to the last quote on the line, because the
// game's own files have unescaped quotes inside values.
const ENTRY = /^[ \t]*([^\s:"#]+):\d*[ \t]*"(.*)"[ \t]*(?:#.*)?$/;
const HEADER = /^[ \t]*l_([a-z_]+):[ \t]*(?:#.*)?$/;
const BLANK = /^[ \t]*(?:#.*)?$/;

function parseFile(file: LocalisationFile, language: string): ParsedFile {
  const path = normalisePath(file.path);
  const entries = new Map<string, string>();
  const problems: LocalisationProblem[] = [];
  const problem = (line: number, message: string): void => {
    problems.push({ path: file.path, layer: file.layer, line, message });
  };
  const text = file.text.charCodeAt(0) === 0xfeff ? file.text.slice(1) : file.text;
  // null before the first header; then whether the section is this language's.
  let inSection: boolean | null = null;
  let line = 0;
  for (let start = 0; start <= text.length; line++) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const raw = text.slice(start, end > start && text.charCodeAt(end - 1) === 13 ? end - 1 : end);
    start = end + 1;
    const entry = ENTRY.exec(raw);
    if (entry !== null) {
      if (inSection === null) problem(line, 'Entry before the `l_<language>:` header.');
      else if (inSection) entries.set(entry[1] ?? '', unescape(entry[2] ?? '', line, problem));
      continue;
    }
    const header = HEADER.exec(raw);
    if (header !== null) {
      inSection = header[1] === language;
      continue;
    }
    if (!BLANK.test(raw)) problem(line, 'Not a localisation entry; the game may skip it.');
  }
  return {
    source: file.path,
    path,
    layer: file.layer,
    replace: path.startsWith('localisation/replace/'),
    entries,
    problems,
  };
}

function unescape(
  value: string,
  line: number,
  problem: (line: number, message: string) => void,
): string {
  if (!value.includes('\\')) return value;
  return value.replace(/\\(.?)/g, (all, c: string) => {
    if (c === 'n') return '\n';
    // Vanilla writes `\t` in tooltips.
    if (c === 't') return '\t';
    if (c === '"' || c === '\\') return c;
    problem(line, `Unknown escape \`${all}\`; the game may break the value.`);
    return all;
  });
}
