/**
 * The colours a `.gfx` file writes where the model reads a colour (ADR 0008, "Colours"): the
 * `textcolors` of `bitmapfonts` and of each `bitmapfont` (`G = { 0 255 0 }`, 0–255 per channel),
 * and a `bitmapfont`'s `color` and `border_color` (`0xAARRGGBB`). Other colour-like values
 * (`objectTypes`, a `color = { 0.0 0.5 0.0 }` elsewhere) are left out: the model does not read
 * them.
 */
import { parseScript } from '../script/parse.ts';
import type { BlockNode, EntryNode, PropertyNode } from '../script/tree.ts';
import { parseColour } from './gfx.ts';

/** A colour as written: its offsets, its channels 0–255 and how it is written. */
export interface GfxColour {
  readonly start: number;
  readonly end: number;
  /** Red, green, blue and alpha, each 0–255. */
  readonly rgba: readonly [number, number, number, number];
  /** `{ R G B }` (no alpha) or `0xAARRGGBB`. */
  readonly form: 'rgb' | 'hex';
}

function blockProperties(block: BlockNode): (PropertyNode & { value: BlockNode })[] {
  return block.entries.filter(
    (e): e is PropertyNode & { value: BlockNode } =>
      e.kind === 'property' && e.value?.kind === 'block',
  );
}

function keyOf(entry: PropertyNode): string {
  return entry.key.text.toLowerCase();
}

function channel(entry: EntryNode): number | undefined {
  if (entry.kind !== 'scalar' || !/^\d{1,3}$/.test(entry.text)) return undefined;
  const n = Number(entry.text);
  return n <= 255 ? n : undefined;
}

function textColours(property: PropertyNode & { value: BlockNode }, out: GfxColour[]): void {
  for (const colour of blockProperties(property.value)) {
    const channels = colour.value.entries.map(channel);
    const [r, g, b] = channels;
    if (channels.length !== 3 || r === undefined || g === undefined || b === undefined) continue;
    out.push({
      start: colour.value.start,
      end: colour.value.end,
      rgba: [r, g, b, 255],
      form: 'rgb',
    });
  }
}

function hexColour(entry: EntryNode, out: GfxColour[]): void {
  if (entry.kind !== 'property' || entry.value?.kind !== 'scalar') return;
  const key = keyOf(entry);
  if (key !== 'color' && key !== 'border_color') return;
  if (!/^0x[0-9a-f]{1,8}$/i.test(entry.value.text)) return;
  const value = parseColour(entry.value.text);
  if (value === undefined) return;
  out.push({
    start: entry.value.start,
    end: entry.value.end,
    rgba: [(value >>> 16) & 255, (value >>> 8) & 255, value & 255, value >>> 24],
    form: 'hex',
  });
}

/** The colours of a `.gfx` file's `bitmapfonts`, in text order. */
export function gfxColours(text: string): GfxColour[] {
  const out: GfxColour[] = [];
  for (const top of parseScript(text).entries) {
    if (top.kind !== 'property' || top.value?.kind !== 'block') continue;
    if (keyOf(top) !== 'bitmapfonts') continue;
    for (const entry of blockProperties(top.value)) {
      const key = keyOf(entry);
      if (key === 'textcolors') textColours(entry, out);
      else if (key === 'bitmapfont') {
        for (const inner of entry.value.entries) {
          if (inner.kind === 'property' && inner.value?.kind === 'block') {
            if (keyOf(inner) === 'textcolors') {
              textColours(inner as PropertyNode & { value: BlockNode }, out);
            }
          } else {
            hexColour(inner, out);
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** A colour written back in its form: `{ R G B }` (alpha dropped) or `0xAARRGGBB`. */
export function formatGfxColour(
  form: GfxColour['form'],
  rgba: readonly [number, number, number, number],
): string {
  const [r, g, b, a] = rgba.map((c) => Math.max(0, Math.min(255, Math.round(c)))) as [
    number,
    number,
    number,
    number,
  ];
  if (form === 'rgb') return `{ ${String(r)} ${String(g)} ${String(b)} }`;
  const hex = (n: number): string => n.toString(16).padStart(2, '0');
  return `0x${hex(a)}${hex(r)}${hex(g)}${hex(b)}`;
}
