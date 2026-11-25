/**
 * Where a file names a font (ADR 0008): the `.gui` keys that name one (`font`, `buttonFont`, the
 * keys `guiDiagnostics` checks as fonts and completion offers fonts for) and, in a `.gfx` file,
 * the `font` of an `objectTypes` entry's `textblock` (vanilla's `animatedmaptext`, the floating
 * texts of the map). Font names are matched without regard to case, as `InterfaceIndex` looks
 * them up.
 */
import type { BlockNode, ParsedScript, PropertyNode, ScalarNode } from '../script/tree.ts';
import { allWidgets, type GuiFile } from './gui.ts';
import { isFontKey } from './references.ts';
import { keyOf, propertiesOf, scalarText } from './properties.ts';

/** A font a file names: the value node and its text (through an `@constant` in a `.gui` file). */
export interface FontReference {
  readonly node: ScalarNode;
  readonly name: string;
}

/**
 * The font names of a `.gui` file: every widget's `font` and `buttonFont`, including those inside
 * `if_resolution` blocks, in text order.
 */
export function guiFontReferences(file: GuiFile): FontReference[] {
  const out: FontReference[] = [];
  for (const { widget } of allWidgets(file)) {
    const properties = [
      ...widget.properties,
      ...widget.resolutionBlocks.flatMap((block) => block.entries),
    ];
    for (const property of properties) {
      if (!isFontKey(keyOf(property)) || property.value?.kind !== 'scalar') continue;
      const name = scalarText(property.value, file.constants);
      if (name !== undefined && name !== '') out.push({ node: property.value, name });
    }
  }
  return out.sort((a, b) => a.node.start - b.node.start);
}

/**
 * The font names of a `.gfx` file: the `font` of each `textblock` in an `objectTypes` entry, such
 * as vanilla's `animatedmaptext` in `interface/core.gfx`, in text order.
 */
export function gfxFontReferences(parsed: ParsedScript): FontReference[] {
  const out: FontReference[] = [];
  for (const top of parsed.entries) {
    if (top.kind !== 'property' || keyOf(top) !== 'objecttypes') continue;
    if (top.value?.kind !== 'block') continue;
    for (const object of propertiesOf(top.value)) {
      if (object.value?.kind !== 'block') continue;
      for (const block of textBlocks(object.value)) {
        for (const property of propertiesOf(block)) {
          if (keyOf(property) !== 'font' || property.value?.kind !== 'scalar') continue;
          const name = property.value.text;
          if (name !== '') out.push({ node: property.value, name });
        }
      }
    }
  }
  return out;
}

function textBlocks(block: BlockNode): BlockNode[] {
  return propertiesOf(block)
    .filter((p: PropertyNode) => keyOf(p) === 'textblock')
    .flatMap((p) => (p.value?.kind === 'block' ? [p.value] : []));
}
