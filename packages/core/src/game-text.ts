// Game text (GLOSSARY.md, etch#15): the characters the game reads from a file,
// as the bytes are on disk or as the next save from the editor would write
// them. Core takes bytes and decodes them itself; the extension supplies the
// bytes of an open document through a SaveEncoding.

import { decodeWindows1252, encodeWindows1252 } from './windows-1252.ts';

/** Interface files are read as Windows-1252, localisation as UTF-8. */
export type GameTextKind = 'interface' | 'localisation';

/**
 * Which kind of game text a file holds, by its path: `.gui`, `.gfx` and `.fnt`
 * anywhere are interface files, `.yml` inside a `localisation` folder is
 * localisation. Other files are not game text.
 */
export function gameTextKind(path: string): GameTextKind | undefined {
  const segments = path.toLowerCase().split(/[\\/]/);
  const name = segments.pop() ?? '';
  if (/\.(?:gui|gfx|fnt)$/.test(name)) {
    return 'interface';
  }
  if (name.endsWith('.yml') && segments.includes('localisation')) {
    return 'localisation';
  }
  return undefined;
}

export interface GameText {
  /** The characters the game reads, without a leading UTF-8 byte order mark. */
  readonly text: string;
  /** Whether the bytes start with a UTF-8 byte order mark. */
  readonly bom: boolean;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF8 = new TextDecoder('utf-8', { ignoreBOM: true });

/**
 * Reads bytes as the game reads them. A leading UTF-8 BOM is skipped in both
 * kinds; for interface files what the game does with it is unverified, so
 * `bom` lets the caller report it.
 */
export function decodeGameText(bytes: Uint8Array, kind: GameTextKind): GameText {
  const bom = UTF8_BOM.every((byte, i) => bytes[i] === byte);
  return { text: decode(bom ? bytes.subarray(UTF8_BOM.length) : bytes, kind), bom };
}

function decode(bytes: Uint8Array, kind: GameTextKind): string {
  return kind === 'interface' ? decodeWindows1252(bytes) : UTF8.decode(bytes);
}

/** How the next save from the editor writes a document. */
export interface SaveEncoding {
  /** VS Code's id of the encoding, as `TextDocument.encoding` gives it. */
  readonly id: string;
  /** Encodes text as a save writes it, without the byte order mark. */
  encode(text: string): Uint8Array;
}

const UTF8_ENCODER = new TextEncoder();

function encodeUtf8(text: string): Uint8Array {
  return UTF8_ENCODER.encode(text);
}

function encodeUtf16(text: string, littleEndian: boolean): Uint8Array {
  const bytes = new Uint8Array(text.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < text.length; i++) {
    view.setUint16(i * 2, text.charCodeAt(i), littleEndian);
  }
  return bytes;
}

const BUILT_IN: Readonly<Record<string, (text: string) => Uint8Array>> = {
  utf8: encodeUtf8,
  utf8bom: encodeUtf8,
  utf16le: (text) => encodeUtf16(text, true),
  utf16be: (text) => encodeUtf16(text, false),
  windows1252: encodeWindows1252,
};

/** The byte order mark VS Code writes for each encoding that has one. */
const BOMS: Readonly<Record<string, readonly number[]>> = {
  utf8bom: UTF8_BOM,
  utf16le: [0xff, 0xfe],
  utf16be: [0xfe, 0xff],
};

/** Encodings in which a character is not one byte per ASCII character. */
const UNREADABLE = new Set(['utf16le', 'utf16be']);

const LABELS: Readonly<Record<string, string>> = {
  utf8: 'UTF-8',
  utf8bom: 'UTF-8 with BOM',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  windows1252: 'Windows 1252',
};

/**
 * Core's own encoder for an encoding that interface and localisation files
 * use (UTF-8 with or without BOM, Windows-1252, UTF-16), so that the common
 * case needs no asynchronous call. Other encodings return `undefined`; the
 * extension encodes those through VS Code.
 */
export function builtInSaveEncoding(id: string): SaveEncoding | undefined {
  const encode = BUILT_IN[id];
  return encode && { id, encode };
}

/** The bytes a save writes: the byte order mark of the encoding, then the text. */
export function encodeForSave(text: string, encoding: SaveEncoding): Uint8Array {
  const bom = BOMS[encoding.id] ?? [];
  const body = encoding.encode(text);
  const bytes = new Uint8Array(bom.length + body.length);
  bytes.set(bom);
  bytes.set(body, bom.length);
  return bytes;
}

/** A human name of a VS Code encoding id, for messages. */
export function encodingLabel(id: string): string {
  return LABELS[id] ?? id;
}

/** A run of the editor text, as UTF-16 offsets. */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}

/**
 * The maximal runs of characters outside ASCII. In every encoding except
 * UTF-16, an ASCII character is saved as its own byte and the game reads it
 * back unchanged, so the game text can only differ from the editor text inside
 * these runs, and each run can be encoded and read on its own.
 */
export function nonAsciiRuns(text: string): TextRange[] {
  const runs: TextRange[] = [];
  let start = -1;
  for (let i = 0; i <= text.length; i++) {
    const outside = i < text.length && text.charCodeAt(i) >= 0x80;
    if (outside && start < 0) {
      start = i;
    } else if (!outside && start >= 0) {
      runs.push({ start, end: i });
      start = -1;
    }
  }
  return runs;
}

export type GameTextDiagnosticCode =
  /** The game reads other characters than the editor shows (Warning). */
  | 'game-text-differs'
  /** The editor shows U+FFFD, so the file was read with the wrong encoding (Error). */
  | 'replacement-character'
  /** UTF-16, which the game cannot read at all (Error). */
  | 'unreadable-encoding'
  /** A UTF-8 BOM in an interface file (Warning). */
  | 'interface-bom'
  /** Localisation that is not saved as UTF-8 with BOM (Warning). */
  | 'localisation-encoding';

export interface GameTextDiagnostic {
  readonly code: GameTextDiagnosticCode;
  readonly severity: 'error' | 'warning';
  /** UTF-16 offsets into the editor text. */
  readonly range: TextRange;
  readonly message: string;
}

const MAX_QUOTED = 40;

/** Quotes game text for a message, with control characters made visible. */
function quote(text: string): string {
  const shown = text.length > MAX_QUOTED ? `${text.slice(0, MAX_QUOTED)}…` : text;
  // eslint-disable-next-line no-control-regex -- control characters are what this makes visible
  const visible = shown.replace(/[\u0000-\u001f\u007f-\u009f]/g, (char) => {
    return `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
  return `"${visible}"`;
}

/**
 * Where the game text of an open document differs from what the editor shows,
 * and whether the document is in an encoding the game expects (etch#15). The
 * encoding is the document's own, so the result describes the next save.
 */
export function diagnoseGameText(
  text: string,
  kind: GameTextKind,
  encoding: SaveEncoding,
): GameTextDiagnostic[] {
  const label = encodingLabel(encoding.id);
  if (UNREADABLE.has(encoding.id)) {
    return [
      {
        code: 'unreadable-encoding',
        severity: 'error',
        range: { start: 0, end: text.length },
        message: `Saved as ${label}; the game reads every character as two or more bytes.`,
      },
    ];
  }

  const diagnostics: GameTextDiagnostic[] = [];
  if (kind === 'interface' && encoding.id === 'utf8bom') {
    diagnostics.push({
      code: 'interface-bom',
      severity: 'warning',
      range: { start: 0, end: 0 },
      message:
        "Saved with a UTF-8 BOM; the game's handling of a BOM in an interface file is unverified.",
    });
  }
  if (kind === 'localisation' && encoding.id !== 'utf8bom') {
    diagnostics.push({
      code: 'localisation-encoding',
      severity: 'warning',
      range: { start: 0, end: 0 },
      message: `Saved as ${label}; the game expects localisation in UTF-8 with BOM.`,
    });
  }

  for (const range of nonAsciiRuns(text)) {
    const editor = text.slice(range.start, range.end);
    // Not decodeGameText: a U+FEFF inside the text is no byte order mark.
    const game = decode(encoding.encode(editor), kind);
    const reads = `Saved as ${label}; the game reads ${quote(game)}.`;
    if (editor.includes('�')) {
      diagnostics.push({
        code: 'replacement-character',
        severity: 'error',
        range,
        message:
          'The editor shows U+FFFD: the file was read with the wrong encoding, and saving ' +
          `destroys its original bytes.${game === editor ? '' : ` ${reads}`}`,
      });
    } else if (game !== editor) {
      diagnostics.push({ code: 'game-text-differs', severity: 'warning', range, message: reads });
    }
  }
  return diagnostics;
}

/**
 * Maps offsets between an editor text and its game text. The model, layout
 * and the draw list's `source` count UTF-16 offsets in the game text; the
 * editor counts them in its own text. They differ only after a run of
 * characters outside ASCII that the game reads as another number of
 * characters, such as `é` saved as UTF-8 (`Ã©`).
 */
export interface GameTextOffsets {
  /** The game text offset of an editor offset; inside a changed run, its start. */
  toGame(editorOffset: number): number;
  /** The editor offset of a game text offset; inside a changed run, its start. */
  toEditor(gameOffset: number): number;
}

interface ChangedRun {
  readonly editorStart: number;
  readonly editorEnd: number;
  readonly gameStart: number;
  readonly gameEnd: number;
}

/** The game text of an editor text, with the map between their offsets. */
export interface MappedGameText extends GameTextOffsets {
  /** The characters the game reads, without a byte order mark. */
  readonly text: string;
}

/**
 * The game text the next save of an editor text gives, read as the game reads
 * it, with the offset map between the two; `undefined` in UTF-16, which the
 * game cannot read. Only the runs outside ASCII are encoded, so an encoding
 * from the extension needs only those (see {@link nonAsciiRuns}).
 */
export function mapGameText(
  text: string,
  kind: GameTextKind,
  encoding: SaveEncoding,
): MappedGameText | undefined {
  if (UNREADABLE.has(encoding.id)) {
    return undefined;
  }
  const runs: ChangedRun[] = [];
  const parts: string[] = [];
  let shift = 0;
  let copied = 0;
  for (const range of nonAsciiRuns(text)) {
    // Not decodeGameText: a U+FEFF inside the text is no byte order mark.
    const game = decode(encoding.encode(text.slice(range.start, range.end)), kind);
    if (game === text.slice(range.start, range.end)) {
      continue;
    }
    const gameStart = range.start + shift;
    runs.push({
      editorStart: range.start,
      editorEnd: range.end,
      gameStart,
      gameEnd: gameStart + game.length,
    });
    parts.push(text.slice(copied, range.start), game);
    copied = range.end;
    shift += game.length - (range.end - range.start);
  }
  if (runs.length === 0) {
    return { text, toGame: (offset) => offset, toEditor: (offset) => offset };
  }
  parts.push(text.slice(copied));
  return {
    text: parts.join(''),
    toGame: (offset) => mapOffset(runs, offset, 'editorStart', 'editorEnd', 'gameStart', 'gameEnd'),
    toEditor: (offset) =>
      mapOffset(runs, offset, 'gameStart', 'gameEnd', 'editorStart', 'editorEnd'),
  };
}

type RunEdge = keyof ChangedRun;

function mapOffset(
  runs: readonly ChangedRun[],
  offset: number,
  fromStart: RunEdge,
  fromEnd: RunEdge,
  toStart: RunEdge,
  toEnd: RunEdge,
): number {
  // The last run that starts at or before the offset.
  let low = 0;
  let high = runs.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((runs[middle] as ChangedRun)[fromStart] <= offset) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0) {
    return offset;
  }
  const run = runs[found] as ChangedRun;
  return offset < run[fromEnd] ? run[toStart] : offset - run[fromEnd] + run[toEnd];
}
