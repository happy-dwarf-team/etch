// PROTOTYPE (etch#159), throwaway: loads the Anbennar playset (Anbennar, Proper 2K UI Enhanced,
// P2KE Patch - Anbennar) read only and lays out `provinceview` with sample texts. Never merged.
import { join } from 'node:path';
import type { Screen } from '@etch/core';
import { decodeGameText, laidOutPath, widgetLabel } from '@etch/core';
import {
  PlaysetAssets,
  PlaysetInterface,
  findGameInSteam,
  findPlayset,
  layOutPreview,
  loadPlaysetLocalisation,
  systemEnvironment,
  workshopFolderFor,
} from '@etch/core/playset';

const WINDOW = 'provinceview';
/** Anbennar, Proper 2K UI Enhanced, P2KE Patch - Anbennar (Workshop ids), in load order. */
const MODS = ['1385440355', '3290499798', '3777997797'];
const TEXT_KINDS = new Set(['instantTextBoxType', 'textBoxType', 'editBoxType']);

export interface ProtoWidget {
  readonly path: string;
  readonly name: string;
  readonly kind: string;
  readonly parent: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly drawStart: number;
  readonly drawEnd: number;
  readonly line: number;
  /** For text boxes: the `.gui` text as written (often a placeholder the game's code replaces). */
  readonly text?: string;
}

export async function openPlayset() {
  const environment = systemEnvironment();
  const gameFolder = process.env.ETCH_GAME_PATH ?? (await findGameInSteam(environment));
  if (gameFolder === undefined) throw new Error('EU4 not found; set ETCH_GAME_PATH');
  const workshop = workshopFolderFor(gameFolder);
  const found = await findPlayset({
    gamePath: gameFolder,
    workspaceFolder: gameFolder,
    playsetOverride: MODS.map((id) => join(workshop, id)),
    environment,
  });
  const ui = await PlaysetInterface.load(found.files);
  const assets = new PlaysetAssets(ui);
  const localisation = await loadPlaysetLocalisation(found.files, 'english').catch(() => undefined);
  const definition = ui.index.guiTypeDefinitions(WINDOW)[0];
  if (definition === undefined) throw new Error(`no ${WINDOW}`);
  const located = ui.index.guiFiles.find((f) => f.path === definition.path);
  if (located === undefined) throw new Error(`no file for ${WINDOW}`);
  const bytes = await found.files.read(definition.path);
  if (bytes === undefined) throw new Error(`cannot read ${definition.path}`);
  const source = decodeGameText(bytes, 'gui').text;
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) lineStarts.push(i + 1);
  const lineOf = (offset: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const localise = (t: string): string => localisation?.text(t) ?? t;
  const layOut = (screen: Screen, sample?: (source: number) => string | undefined) =>
    layOutPreview(ui, assets, located.file, definition.item, {
      screen,
      localise,
      ...(sample === undefined ? {} : { sample }),
    });

  async function layout(screen: Screen, samples: ReadonlyMap<string, string>) {
    // Samples are keyed by widget path; layout asks by source offset.
    const bySource = new Map<number, string>();
    if (samples.size > 0) {
      const first = await layOut(screen);
      first.widgets.forEach((w, i) => {
        const s = samples.get(pathOf(first.widgets, i));
        if (s !== undefined) bySource.set(w.widget.node.start, s);
      });
    }
    const laid = await layOut(screen, (offset) => bySource.get(offset));
    const widgets: ProtoWidget[] = laid.widgets.map((w, i) => ({
      path: pathOf(laid.widgets, i),
      name: widgetLabel(w.widget),
      kind: w.widget.kind,
      parent: w.parent,
      x: w.x,
      y: w.y,
      width: w.width,
      height: w.height,
      drawStart: w.drawStart,
      drawEnd: w.drawEnd,
      line: lineOf(w.widget.node.start),
      ...(TEXT_KINDS.has(w.widget.kind)
        ? { text: ownText(source, w.widget.node.start, w.widget.node.end) }
        : {}),
    }));
    const files = laid.drawList.textures.map((p) => ui.gameFile(p)?.absolutePath);
    return { drawList: laid.drawList, files, widgets, file: definition!.path };
  }

  return { layout, localise };
}

function pathOf(widgets: Parameters<typeof laidOutPath>[0], index: number): string {
  return laidOutPath(widgets, index)
    .map((s) => widgetLabel(s.widget))
    .join('/');
}

/** The widget's own `text` (not its children's), as written. */
function ownText(text: string, start: number, end: number): string {
  const block = text.slice(start, end);
  const open = block.indexOf('{');
  let depth = 0;
  let own = '';
  for (let i = open + 1; i < block.length; i++) {
    const c = block[i];
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0) own += c;
  }
  return /\btext\s*=\s*"([^"]*)"/i.exec(own)?.[1] ?? '';
}
