/// <reference types="node" />
// Local only: Etch's window profiles against the corpus playsets, read in place from an installed
// game and its Workshop items (ETCH_GAME_PATH; the Workshop folder beside it, or
// ETCH_WORKSHOP_PATH). Each profiled window's layers pass the load checks in each playset, and for
// every corpus capture the visibility the profile predicts for each path it names matches the
// capture's, as the 2.0.0 gate will ask (spec section 14). Skipped in CI, which has no game.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Widget } from '../src/index.ts';
import { GameFiles, PlaysetInterface } from '../src/playset/index.ts';
import {
  checkProfile,
  evaluateView,
  layerProfiles,
  readProfile,
  widgetsAt,
  windowPaths,
  type ProfileFile,
  type WindowProfile,
} from '../src/profile/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'];
const workshop =
  process.env['ETCH_WORKSHOP_PATH'] ??
  (gamePath === undefined ? '' : join(gamePath, '..', '..', 'workshop', 'content', '236850'));

const PLAYSETS: Record<string, { mods: string[]; sources: string[] }> = {
  vanilla: { mods: [], sources: ['vanilla'] },
  'proper-2k-ui-enhanced': { mods: ['3290499798'], sources: ['vanilla'] },
  anbennar: { mods: ['1385440355', '3290499798', '3777997797'], sources: ['vanilla', 'anbennar'] },
};

/** The selectors each corpus view was captured with, where a profile has a choice. */
const CAPTURED: Record<string, Record<string, string>> = {
  'main-menu': { page: 'main-menu' },
  lobby: { page: 'lobby' },
  'esc-menu': { page: 'esc-menu' },
  'message-settings': { page: 'message-settings' },
  // Macedonia, the player's own, with a ship in construction (the recipe's).
  province: { owner: 'yes', tab: 'province', side: 'buildings', construction: 'yes' },
};

const profiles = new URL('../../../profiles/', import.meta.url);

function shipped(source: string): ProfileFile[] {
  return readdirSync(new URL(`${source}/`, profiles)).flatMap((name) => {
    const text = readFileSync(new URL(`${source}/${name}`, profiles), 'utf8');
    const file = readProfile(text, { layer: 0, source, file: `${source}/${name}` }).file;
    return file === undefined ? [] : [file];
  });
}

interface Captured {
  readonly path: string;
  readonly visible: boolean;
  readonly children?: readonly Captured[];
}

describe.skipIf(gamePath === undefined)("Etch's profiles in the corpus playsets", () => {
  for (const [id, playset] of Object.entries(PLAYSETS)) {
    it(`check cleanly and predict the captures' visibility in ${id}`, async () => {
      const files = new GameFiles([
        { name: 'game', root: gamePath ?? '', replacePaths: [] },
        ...playset.mods.map((mod) => ({ name: mod, root: join(workshop, mod), replacePaths: [] })),
      ]);
      const ui = await PlaysetInterface.load(files);
      const layers = playset.sources.map((source) => shipped(source));
      const windows = new Set(layers.flat().map((f) => f.window));
      const checked = new Map<string, { profile: WindowProfile; window: Widget }>();
      const problems: string[] = [];
      for (const name of windows) {
        const gui = ui.index.guiFiles.find((f) => f.file.definitions.some((d) => d.name === name));
        const window = gui?.file.definitions.find((d) => d.name === name);
        if (gui === undefined || window === undefined) {
          problems.push(`${name}: no such window`);
          continue;
        }
        const files = layers.flatMap((l) => l.filter((f) => f.window === name));
        const result = checkProfile(layerProfiles(name, files), {
          window,
          positionType: (type) =>
            gui.file.definitions.some(
              (d) => d.kind === 'positionType' && d.name?.toLowerCase() === type.toLowerCase(),
            ),
          template: (template) => ui.index.guiType(template)?.item,
          windowExists: (other) => ui.index.guiType(other) !== undefined,
        });
        problems.push(...result.diagnostics.map((d) => `${d.file}: ${d.message}`));
        checked.set(name.toLowerCase(), { profile: result.profile, window });
      }
      expect(problems).toEqual([]);

      const folder = new URL(`../../../corpus/captures/${id}/`, import.meta.url);
      const mismatches: string[] = [];
      let compared = 0;
      for (const resolution of readdirSync(folder)) {
        const [width, height] = resolution.split('x').map(Number);
        for (const name of readdirSync(new URL(`${resolution}/`, folder))) {
          const capture = JSON.parse(
            readFileSync(new URL(`${resolution}/${name}`, folder), 'utf8'),
          ) as { view: string; widgets: Captured[] };
          for (const root of capture.widgets) {
            const found = checked.get(root.path.toLowerCase());
            if (found === undefined) continue;
            const shown = new Map<string, boolean>();
            const walk = (w: Captured, parent: boolean): void => {
              const visible = parent && w.visible;
              shown.set(w.path.toLowerCase(), visible);
              for (const child of w.children ?? []) walk(child, visible);
            };
            walk(root, true);
            const view = evaluateView(
              found.profile,
              found.window,
              { width: width ?? 0, height: height ?? 0 },
              { set: CAPTURED[capture.view] ?? {} },
            );
            const named = new Set<Widget>();
            const { profile } = found;
            for (const rule of profile.rules) {
              for (const ref of [...rule.show, ...rule.hide, ...rule.notCreated]) {
                for (const w of widgetsAt(found.window, ref.path)) named.add(w);
              }
            }
            for (const group of profile.groups) {
              for (const member of group.members) {
                for (const w of widgetsAt(found.window, member.path)) named.add(w);
              }
            }
            for (const entry of windowPaths(found.window)) {
              if (!named.has(entry.widget)) continue;
              const game = shown.get(entry.path.toLowerCase());
              if (game === undefined) continue;
              compared++;
              if (view.drawn(entry.widget) !== game) {
                mismatches.push(
                  `${resolution} ${capture.view} ${entry.path}: game ${game ? 'shows' : 'hides'} it`,
                );
              }
            }
          }
        }
      }
      expect(mismatches).toEqual([]);
      console.log(`${id}: ${String(compared)} predicted paths match the captures`);
      expect(compared).toBeGreaterThan(100);
    }, 120_000);
  }
});
