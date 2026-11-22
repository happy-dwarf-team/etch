/**
 * The canals of `map/default.map` (`canal_definition = { name = … x = … y = … }`) that stop the
 * game loading the map or write outside its canal map when they are built. When it loads the map,
 * the game opens `map/<name>_river.bmp` for every canal definition; without the
 * file it throws a file exception, and the load stops at "Initializing Maplogic..." with
 * `Could not open file` in `error.log` (the EU4 engine lab, `bmtest-r17`, 19.11.2026). When a canal
 * is built (`add_canal`), the game copies the canal's bitmap into a bitmap of the river
 * map's size at `x`, `y` (its bottom left corner) without a check: a canal that does not fit writes
 * past the map's edge, and past the bitmap's end or before its start (Suez's 64 × 64 bitmap at
 * `y = 2040` on vanilla's 2048 rows faulted the game when an event built it, and at vanilla's
 * `y = 1118` it did not; `bmtest-r15` and `r16`). Vanilla's three canals and those of the lab's
 * Workshop mods all fit.
 */
import type { ParsedScript, ScalarNode, SourceRange } from './tree.ts';

/** A bitmap's size in pixels. */
export interface BitmapSize {
  readonly width: number;
  readonly height: number;
}

/** A `canal_definition` block of `map/default.map`, with the scalars it sets. */
export interface CanalDefinition {
  readonly name: ScalarNode | undefined;
  readonly x: ScalarNode | undefined;
  readonly y: ScalarNode | undefined;
}

export type CanalDiagnosticCode =
  /** A canal whose `map/<name>_river.bmp` the playset does not have. */
  | 'canal-bitmap-missing'
  /** A canal whose bitmap does not fit in the river map at its `x` and `y`. */
  | 'canal-outside-map';

/** A canal the game cannot load or build; the range is its name, `x` or `y`. */
export interface CanalDiagnostic extends SourceRange {
  readonly severity: 'warning';
  readonly code: CanalDiagnosticCode;
  readonly message: string;
  /** The canal's name. */
  readonly name: string;
  /** The key the range is the value of: `name`, `x` or `y`. */
  readonly key: string;
}

/** The bitmaps a canal check needs, as the playset has them. */
export interface CanalBitmaps {
  /** The river map's size (`map/default.map`'s `rivers`), when it was read. */
  readonly rivers: BitmapSize | undefined;
  /** The river map's game path, for the messages. */
  readonly riversPath: string;
  /**
   * A canal bitmap's size by the canal's name in lower case; `null` when the playset has no
   * `map/<name>_river.bmp`. A name that was not looked up is not checked.
   */
  readonly canals: ReadonlyMap<string, BitmapSize | null>;
}

/** The canal definitions of a parsed `map/default.map`, in file order. */
export function readCanalDefinitions(parsed: ParsedScript): CanalDefinition[] {
  const found: CanalDefinition[] = [];
  for (const entry of parsed.entries) {
    if (entry.kind !== 'property' || entry.key.text.toLowerCase() !== 'canal_definition') continue;
    if (entry.value?.kind !== 'block') continue;
    const members = new Map<string, ScalarNode>();
    for (const member of entry.value.entries) {
      if (member.kind === 'property' && member.value?.kind === 'scalar') {
        members.set(member.key.text.toLowerCase(), member.value);
      }
    }
    found.push({ name: members.get('name'), x: members.get('x'), y: members.get('y') });
  }
  return found;
}

/** The game path of a canal's bitmap. */
export function canalBitmapPath(name: string): string {
  return `map/${name}_river.bmp`;
}

/**
 * The size of a BMP file from its header (`BM`, then the info header's width and height at bytes
 * 18 and 22); `undefined` when the bytes are no BMP header.
 */
export function bmpSize(bytes: Uint8Array): BitmapSize | undefined {
  if (bytes.length < 26 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getInt32(18, true), height: Math.abs(view.getInt32(22, true)) };
}

/** The canals of a parsed `map/default.map` that the game cannot load or build. */
export function checkCanals(parsed: ParsedScript, bitmaps: CanalBitmaps): CanalDiagnostic[] {
  const found: CanalDiagnostic[] = [];
  for (const canal of readCanalDefinitions(parsed)) {
    if (canal.name === undefined) continue;
    const name = canal.name.text;
    const size = bitmaps.canals.get(name.toLowerCase());
    if (size === null) {
      found.push({
        severity: 'warning',
        code: 'canal-bitmap-missing',
        message:
          `The playset has no ${canalBitmapPath(name)}. The game opens it for every canal ` +
          'definition while it loads the map, and without it the load stops with "Could not ' +
          'open file" in error.log.',
        name,
        key: 'name',
        start: canal.name.start,
        end: canal.name.end,
      });
      continue;
    }
    const rivers = bitmaps.rivers;
    if (size === undefined || rivers === undefined) continue;
    const x = integerOf(canal.x);
    const y = integerOf(canal.y);
    const fits = (at: number, length: number, room: number) => at >= 0 && at + length <= room;
    const outside: [ScalarNode, string][] = [];
    if (canal.x !== undefined && x !== undefined && !fits(x, size.width, rivers.width)) {
      outside.push([canal.x, 'x']);
    }
    if (canal.y !== undefined && y !== undefined && !fits(y, size.height, rivers.height)) {
      outside.push([canal.y, 'y']);
    }
    for (const [scalar, key] of outside) {
      found.push({
        severity: 'warning',
        code: 'canal-outside-map',
        message:
          `The canal's bitmap (${String(size.width)} × ${String(size.height)}) at x = ` +
          `${String(x)}, y = ${String(y)} does not fit in ${bitmaps.riversPath} ` +
          `(${String(rivers.width)} × ${String(rivers.height)}). When the canal is built, the ` +
          'game copies its pixels there without a check, past the map, which can crash it.',
        name,
        key,
        start: scalar.start,
        end: scalar.end,
      });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

function integerOf(scalar: ScalarNode | undefined): number | undefined {
  return scalar !== undefined && /^[+-]?\d+$/.test(scalar.text) ? Number(scalar.text) : undefined;
}
