/// <reference types="node" />
// Local only: the province view laid out offline against the corpus captures, in the four corpus
// playsets. Every widget of provinceview the game shows, laid out in its profile's view at the
// capture's selector values and size, is where the game drew it (within 1 px); the 2.0.0 trial
// found the base values 62 to 75 px off, as the game's code moves them (the profile's base-values
// rule). With ETCH_CORPUS_SAVES naming a folder that holds the corpus saves, every text the profile
// fills from the save is also the one the game shows in that widget. Read in place from an
// installed game and its Workshop items (ETCH_GAME_PATH); skipped in CI, which has no game.
import { readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Widget } from '../src/index.ts';
import {
  GameFiles,
  PlaysetAssets,
  PlaysetInterface,
  layOutPreview,
  loadPlaysetLocalisation,
} from '../src/playset/index.ts';
import {
  SaveChoice,
  checkProfile,
  evaluateView,
  layerProfiles,
  layoutViewOf,
  readProfile,
  windowPaths,
  type ProfileFile,
} from '../src/profile/index.ts';
import { readSave } from '../src/save/index.ts';
import {
  findView,
  parseCorpusManifest,
  profileSaveTexts,
  viewInPlayset,
  type CapturedWidget,
} from '../src/corpus/index.ts';

const gamePath = process.env['ETCH_GAME_PATH'] ?? '';
const workshop =
  process.env['ETCH_WORKSHOP_PATH'] ?? join(gamePath, '..', '..', 'workshop', 'content', '236850');
const saves = process.env['ETCH_CORPUS_SAVES'];

const PLAYSETS: Record<string, { mods: string[]; sources: string[] }> = {
  vanilla: { mods: [], sources: ['vanilla'] },
  'proper-2k-ui-enhanced': { mods: ['3290499798'], sources: ['vanilla'] },
  anbennar: {
    mods: ['1385440355', '3290499798', '3777997797'],
    sources: ['vanilla', 'anbennar', 'p2ke-patch-anbennar'],
  },
  'anbennar-alone': { mods: ['1385440355'], sources: ['vanilla', 'anbennar'] },
};

/**
 * Save texts the game shows otherwise, known: the game cuts Heroes' Rest's trade power 3.19 to
 * 3.1 where the profile's one decimal rounds it to 3.2 (docs/release-2.0.0.md).
 */
const KNOWN_TEXTS = new Set(['provinceview/province_window/tradepower_value 3.2 3.1']);

const profiles = new URL('../../../profiles/', import.meta.url);

function shipped(source: string): ProfileFile[] {
  const text = readFileSync(new URL(`${source}/provinceview.jsonc`, profiles), 'utf8');
  const file = readProfile(text, { layer: 0, source, file: 'provinceview.jsonc' }).file;
  return file === undefined ? [] : [file];
}

const manifest = parseCorpusManifest(
  JSON.parse(readFileSync(new URL('../../../corpus/manifest.json', import.meta.url), 'utf8')),
).manifest;

describe.skipIf(gamePath === '')('the province view laid out offline', () => {
  for (const [id, playset] of Object.entries(PLAYSETS)) {
    it(`puts every widget and save text where the game does in ${id}`, async () => {
      const files = new GameFiles([
        { name: 'game', root: gamePath, replacePaths: [] },
        ...playset.mods.map((mod) => ({ name: mod, root: join(workshop, mod), replacePaths: [] })),
      ]);
      const ui = await PlaysetInterface.load(files);
      const gui = ui.index.guiFiles.find((f) =>
        f.file.definitions.some((d) => d.name === 'provinceview'),
      );
      const window = gui?.file.definitions.find((d) => d.name === 'provinceview') as Widget;
      if (gui === undefined) throw new Error('no provinceview');
      const profile = checkProfile(
        layerProfiles('provinceview', playset.sources.flatMap(shipped)),
        {
          window,
          positionType: () => true,
          template: (n) => ui.index.guiType(n)?.item,
          windowExists: () => true,
        },
      ).profile;
      const assets = new PlaysetAssets(ui);
      const pinned = manifest?.playsets.find((p) => p.id === id)?.save;
      const save =
        saves === undefined || pinned === undefined
          ? undefined
          : await readSave(await readFile(join(saves, pinned.file)));
      const localisation =
        save === undefined ? undefined : await loadPlaysetLocalisation(files, 'english');
      const off: string[] = [];
      const texts: string[] = [];
      const folder = new URL(`../../../corpus/captures/${id}/`, import.meta.url);
      for (const resolution of readdirSync(folder)) {
        const [width, height] = resolution.split('x').map(Number) as [number, number];
        for (const viewName of ['province', 'province-foreign']) {
          const capture = JSON.parse(
            readFileSync(new URL(`${resolution}/${viewName}.json`, folder), 'utf8'),
          ) as { widgets: CapturedWidget[] };
          const found = manifest === undefined ? undefined : findView(manifest, viewName);
          const corpusView = found === undefined ? undefined : viewInPlayset(found.view, { id });
          const selectors = corpusView?.selectors ?? {};
          const own = new Set(profile.selectors.map((s) => s.id));
          const set = Object.fromEntries(Object.entries(selectors).filter(([k]) => own.has(k)));
          const screen = { width, height };
          const view = evaluateView(profile, window, screen, { set });
          const layout = await layOutPreview(ui, assets, gui.file, window, {
            screen,
            view: layoutViewOf(view),
          });
          const root = capture.widgets.find((w) => w.path === 'provinceview');
          if (root === undefined) throw new Error('no provinceview in the capture');
          const shown = new Map<string, CapturedWidget>();
          const walk = (w: CapturedWidget, parent: boolean): void => {
            const visible = parent && w.visible;
            if (visible) shown.set(w.path.toLowerCase(), w);
            for (const child of w.children ?? []) walk(child, visible);
          };
          walk(root, true);
          for (const entry of windowPaths(window)) {
            const game = shown.get(entry.path.toLowerCase());
            if (game === undefined) continue;
            const laid = layout.widgets.find(
              (w) => w.widget === entry.widget && w.row === undefined,
            );
            if (laid === undefined) continue;
            const dx = Math.round(laid.x - game.rect.x);
            const dy = Math.round(laid.y - game.rect.y);
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
              off.push(`${resolution} ${viewName} ${entry.path}: ${String(dx)}, ${String(dy)} px`);
            }
          }
          const province = corpusView?.data?.province;
          if (save === undefined || province === undefined) continue;
          const choice = new SaveChoice(save, save.meta.player, province);
          const report = profileSaveTexts(
            profile,
            window,
            screen,
            set,
            choice,
            (key) => localisation?.get(key),
            root,
          );
          expect(report.compared).toBeGreaterThan(5);
          for (const d of report.differences) {
            const line = `${d.path} ${d.sample} ${d.game}`;
            if (!KNOWN_TEXTS.has(line)) texts.push(`${resolution} ${viewName} ${line}`);
          }
        }
      }
      expect(off).toEqual([]);
      expect(texts).toEqual([]);
    }, 300_000);
  }
});
