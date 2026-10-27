/**
 * The precision corpus manifest, `corpus/manifest.json` (ADR 0002, etch#10, etch#41): the game
 * build and Tongs version captures are taken with, the resolutions, the playsets with their pinned
 * mods and save, the corpus windows with the recipe of each view, the widget kinds that are drawn
 * but not measured, and the known deviations. `corpus/README.md` describes the format.
 */
import { WIDGET_KINDS, type Screen, type WidgetKind } from '../model/gui.ts';
import { isSide } from '../resolution.ts';
import { Checker, ID, SHA256, field, type CorpusProblem, type Json } from './check.ts';
import { matchesWidgetPattern, widgetPatternProblem } from './widget-path.ts';

export const CORPUS_FORMAT_VERSION = 1;

export interface CorpusManifest {
  readonly formatVersion: typeof CORPUS_FORMAT_VERSION;
  /** The game build every capture is taken from. */
  readonly game: { readonly version: string; readonly exeSha256: string };
  /** The Tongs release every capture is taken with. */
  readonly tongs: { readonly version: string };
  /** `game_ui_scale`; only 1.0 is checked (ADR 0002). */
  readonly uiScale: 1;
  readonly resolutions: readonly CorpusResolution[];
  /**
   * Widget kinds whose content the game's code always fills (lists, grids, overlapping
   * elements), masked in every view in addition to each view's own `codeFilled` paths.
   */
  readonly codeFilledKinds: readonly WidgetKind[];
  readonly notCovered: readonly NotCovered[];
  readonly playsets: readonly CorpusPlayset[];
  readonly windows: readonly CorpusWindow[];
  readonly knownDeviations: readonly KnownDeviation[];
}

export interface CorpusResolution extends Screen {
  /**
   * Whether captures at this size are known to be pixel-exact. Only confirmed resolutions gate a
   * release; etch#18 confirmed the sizes smaller than the lab's monitor.
   */
  readonly confirmed: boolean;
  /** Why it is confirmed, or what will confirm it. */
  readonly evidence: string;
}

/** A widget kind, or a shader, that the offline renderer draws but the corpus does not measure. */
export type NotCovered =
  | { readonly widgetKind: WidgetKind; readonly reason: string }
  | { readonly shader: string; readonly reason: string };

export type PlaysetGate = 'release' | 'report';

export interface CorpusPlayset {
  readonly id: string;
  readonly title: string;
  /** `release`: must pass for a release (ADR 0002); `report`: reported, blocks nothing. */
  readonly gate: PlaysetGate;
  /** The save loaded for views opened from a save; required for a release playset. */
  readonly save?: CorpusSave;
  /** The mods in load order, a later one winning. Empty for vanilla. */
  readonly mods: readonly CorpusMod[];
  /** `dlc_load.json`'s `disabled_dlcs` while capturing. */
  readonly disabledDlcs: readonly string[];
  /** The ids of the corpus windows captured with this playset. */
  readonly windows: readonly string[];
  /**
   * Patterns of top-level windows the game shows over every view opened from the save, such as
   * the events the save opens with, which no recipe can close: each such view reads them as roots
   * too, and the comparison masks them as code-filled.
   */
  readonly covers?: readonly string[];
  /**
   * Pixels around each cover's rect masked with it: what its sprites draw past the rect Tongs reads
   * from the `.gui` (the frame of an event window).
   */
  readonly coverMargin?: number;
  readonly note?: string;
}

export interface CorpusSave {
  /** The save's file name in the profile's `save games` folder. */
  readonly file: string;
  readonly sha256: string;
  /** What the save is, such as `Russia, 17 March 1719`. */
  readonly description: string;
  /**
   * A widget pattern the capture driver clicks when it shows while the save loads: a dialog that
   * asks before the game goes on loading, such as Anbennar's achievements warning (etch#55).
   */
  readonly confirm?: string;
}

export interface CorpusMod {
  /** The descriptor's `name`. */
  readonly name: string;
  readonly workshopId?: string;
  /**
   * The pin: the mod folder's content hash (`hashModFolder`). Descriptor versions such as
   * `v1.37.*.*` do not change when a mod updates, so the hash is the version. Required for a
   * release playset.
   */
  readonly sha256?: string;
  readonly note?: string;
}

export interface CorpusWindow {
  readonly id: string;
  readonly title: string;
  /** The game-relative `.gui` files whose windows its views show. */
  readonly files: readonly string[];
  /** What the window adds to the corpus (etch#10). */
  readonly why: string;
  readonly views: readonly CorpusView[];
}

/** One state of a corpus window that a recipe opens and one capture records. */
export interface CorpusView {
  /** Unique among all views; names the capture record and the screenshot. */
  readonly id: string;
  readonly title: string;
  readonly recipe: Recipe;
  /** Selectors of the top-level widgets whose trees the capture reads (`ui tree ROOT all`). */
  readonly roots: readonly string[];
  /** Patterns of the widgets whose content the game's code fills or hides; masked by game rect. */
  readonly codeFilled: readonly string[];
  /**
   * Patterns of the widgets the game's code moves: the comparison draws each, and everything inside
   * it, where the game shows it, and compares it there.
   */
  readonly codeMoved?: readonly string[];
  /**
   * The values of the window profiles' selectors this view is captured with, by selector id, where
   * a profile has a choice the screen does not make (`resolution` selectors come from the capture's
   * size). The visibility gate evaluates each profiled root's profile with them (ADR 0006).
   */
  readonly selectors?: Readonly<Record<string, string>>;
  /**
   * What of the playset's save the view shows, for the report of the profiles' `save` texts
   * against the capture's: the province by id, and the country by tag (the save's player when
   * left out).
   */
  readonly data?: ViewData;
  /** What differs in one playset, by playset id: its own recipe, selector values or note. */
  readonly byPlayset?: Readonly<Record<string, PlaysetView>>;
  readonly note?: string;
}

export interface ViewData {
  readonly province?: number;
  readonly country?: string;
}

/**
 * A view's own recipe and selectors in one playset (spec v2 section 11): the Anbennar playset's
 * save has no ship in construction, so its province views open another way.
 */
export interface PlaysetView {
  /** Replaces the view's recipe in this playset. */
  readonly recipe?: Recipe;
  /** Replaces the values of these selectors in this playset; the others stay the view's. */
  readonly selectors?: Readonly<Record<string, string>>;
  /** Replaces the view's `data` in this playset. */
  readonly data?: ViewData;
  readonly note?: string;
}

/**
 * A view as one playset captures it: the view with its recipe, selectors and data of that playset
 * (`byPlayset`) in place of the defaults, and, opened from the save, the playset's `covers` among
 * its roots and code-filled patterns.
 */
export function viewInPlayset(
  view: CorpusView,
  playset: Pick<CorpusPlayset, 'id' | 'covers'>,
): CorpusView {
  const own = view.byPlayset?.[playset.id];
  const recipe = own?.recipe ?? view.recipe;
  const covers = recipe.from === 'save' ? (playset.covers ?? []) : [];
  if (own === undefined && covers.length === 0) return view;
  return {
    ...view,
    recipe,
    ...(covers.length === 0
      ? {}
      : { roots: [...view.roots, ...covers], codeFilled: [...view.codeFilled, ...covers] }),
    ...(own?.data !== undefined ? { data: own.data } : {}),
    ...(view.selectors !== undefined || own?.selectors !== undefined
      ? { selectors: { ...view.selectors, ...own?.selectors } }
      : {}),
  };
}

/** The start state of a recipe: the main menu of a fresh start, or the playset's save loaded and paused. */
export type RecipeStart = 'main-menu' | 'save';

export interface Recipe {
  readonly from: RecipeStart;
  /** Tongs input, in order; the driver moves the pointer away after the last one. */
  readonly steps: readonly RecipeStep[];
  /** Whether the steps and roots were seen to work in the game. */
  readonly verified: boolean;
  /** Where that was seen, or what is still unknown. */
  readonly evidence: string;
}

/**
 * `key NAME`, `ui click SELECTOR`, or `click X Y` at a point of the client area given as fractions
 * of its width and height (`{ "x": 0.5, "y": 0.5 }` is the centre), for what has no widget, such as
 * a province on the map. `map` and `wheel` name a point of the map instead: its distance from the
 * client area's centre in client heights. The map's scale follows the client height, so such a
 * point is the same place of the map at every resolution, beside a window that covers the centre.
 * `wheel` turns the mouse wheel there (positive steps zoom in towards the point). `text` types into
 * the focused text field, such as the Goto box's (`f`), which finds a province by its name.
 */
export type RecipeStep =
  | { readonly key: TongsKey }
  | { readonly click: string }
  | { readonly point: { readonly x: number; readonly y: number } }
  | { readonly text: string }
  | { readonly map: MapPoint }
  | { readonly wheel: MapPoint & { readonly steps: number } };

/** A point of the map: its distance from the client area's centre, in client heights. */
export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

/** The key names Tongs' `key` command accepts (tongs README). */
export const TONGS_KEYS = [
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
  ...Array.from({ length: 12 }, (_, i) => `f${String(i + 1)}`),
  'space',
  'return',
  'escape',
  'tab',
  'backspace',
  'delete',
  'minus',
  'equals',
  'grave',
  'kp_plus',
  'kp_minus',
  'kp_enter',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'page_up',
  'page_down',
] as const;
export type TongsKey = (typeof TONGS_KEYS)[number];

/**
 * An accepted difference between the offline renderer and the game, with its issue and the
 * maintainer's consent (ADR 0002). Optional scopes left out mean all.
 */
export interface KnownDeviation {
  readonly id: string;
  /** A pattern of the widget paths it covers. */
  readonly widgets: string;
  /** Only widgets of these `.gui` kinds, as the offline renderer's model reads them. */
  readonly kinds?: readonly WidgetKind[];
  readonly views?: readonly string[];
  readonly playsets?: readonly string[];
  /** Resolutions as `3440x1440`. */
  readonly resolutions?: readonly string[];
  /** What differs, such as `text drawn 1 px lower`. */
  readonly difference: string;
  /** The issue that tracks it. */
  readonly issue: string;
  /** The link to the maintainer's consent, such as a comment. */
  readonly consent: string;
}

/** One capture the corpus wants: a view, at a resolution, with a playset. */
export interface CaptureKey {
  readonly playset: string;
  readonly resolution: Screen;
  readonly view: string;
}

export interface ManifestResult {
  /** The manifest, when it has no problems. */
  readonly manifest?: CorpusManifest;
  readonly problems: readonly CorpusProblem[];
}

/** A resolution as it is written in the corpus: `3440x1440`. */
export function resolutionKey(screen: Screen): string {
  return `${String(screen.width)}x${String(screen.height)}`;
}

/**
 * The folder-relative path of a capture, without extension: `captures/<playset>/<WxH>/<view>`. The
 * capture record is that path with `.json` in the repository's `corpus/` folder; the screenshot is
 * that path with `.png` in the local corpus folder.
 */
export function capturePath(key: CaptureKey): string {
  return `captures/${key.playset}/${resolutionKey(key.resolution)}/${key.view}`;
}

/** The window and view of a view id. */
export function findView(
  manifest: CorpusManifest,
  viewId: string,
): { window: CorpusWindow; view: CorpusView } | undefined {
  for (const window of manifest.windows) {
    const view = window.views.find((v) => v.id === viewId);
    if (view !== undefined) return { window, view };
  }
  return undefined;
}

/**
 * Every capture the corpus wants, by playset, resolution and view in manifest order. With
 * `gating`, only those a release needs: release playsets at confirmed resolutions.
 */
export function requiredCaptures(
  manifest: CorpusManifest,
  options: { gating?: boolean } = {},
): CaptureKey[] {
  const keys: CaptureKey[] = [];
  for (const playset of manifest.playsets) {
    if (options.gating === true && playset.gate !== 'release') continue;
    for (const resolution of manifest.resolutions) {
      if (options.gating === true && !resolution.confirmed) continue;
      for (const window of manifest.windows) {
        if (!playset.windows.includes(window.id)) continue;
        for (const view of window.views) {
          keys.push({
            playset: playset.id,
            resolution: { width: resolution.width, height: resolution.height },
            view: view.id,
          });
        }
      }
    }
  }
  return keys;
}

/** Whether a known deviation covers a widget, given by path and `.gui` kind, in a capture. */
export function deviationCovers(
  deviation: KnownDeviation,
  key: CaptureKey,
  widgetPath: string,
  widgetKind: WidgetKind | undefined,
): boolean {
  if (deviation.views !== undefined && !deviation.views.includes(key.view)) return false;
  if (deviation.playsets !== undefined && !deviation.playsets.includes(key.playset)) return false;
  if (
    deviation.resolutions !== undefined &&
    !deviation.resolutions.includes(resolutionKey(key.resolution))
  ) {
    return false;
  }
  if (
    deviation.kinds !== undefined &&
    (widgetKind === undefined || !deviation.kinds.includes(widgetKind))
  ) {
    return false;
  }
  return matchesWidgetPattern(deviation.widgets, widgetPath);
}

/** Checks a parsed `manifest.json`; the manifest comes back only when it has no problems. */
export function parseCorpusManifest(value: unknown): ManifestResult {
  const c = new Checker();
  const root = c.object(value, '', [
    'formatVersion',
    'game',
    'tongs',
    'uiScale',
    'resolutions',
    'codeFilledKinds',
    'notCovered',
    'playsets',
    'windows',
    'knownDeviations',
  ]);
  if (root === undefined) return { problems: c.problems };

  if ('formatVersion' in root && root['formatVersion'] !== CORPUS_FORMAT_VERSION) {
    c.fail('formatVersion', `Expected ${String(CORPUS_FORMAT_VERSION)}.`);
  }
  const game = c.object(root['game'], 'game', ['version', 'exeSha256']);
  if (game !== undefined) {
    c.string(game['version'], 'game.version', /^\d+\.\d+\.\d+$/, 'a version such as 1.37.5');
    c.string(game['exeSha256'], 'game.exeSha256', SHA256, 'an uppercase SHA-256');
  }
  const tongs = c.object(root['tongs'], 'tongs', ['version']);
  if (tongs !== undefined) {
    c.string(tongs['version'], 'tongs.version', /^\d+\.\d+\.\d+$/, 'a version such as 0.14.1');
  }
  if ('uiScale' in root && root['uiScale'] !== 1) {
    c.fail('uiScale', 'Only a UI scale of 1 is checked (ADR 0002).');
  }

  const resolutions =
    c.array(root['resolutions'], 'resolutions', (v, at) => checkResolution(c, v, at), true) ?? [];
  c.unique(
    resolutions.map((r) => resolutionKey(r)),
    (i) => `resolutions[${String(i)}]`,
    'resolution',
  );
  const resolutionKeys = new Set(resolutions.map((r) => resolutionKey(r)));

  c.array(root['codeFilledKinds'], 'codeFilledKinds', (v, at) => c.oneOf(v, at, WIDGET_KINDS));
  c.array(root['notCovered'], 'notCovered', (v, at) => checkNotCovered(c, v, at));

  const windows = c.array(root['windows'], 'windows', (v, at) => checkWindow(c, v, at), true) ?? [];
  c.unique(
    windows.map((w) => w.id),
    (i) => `windows[${String(i)}].id`,
    'window id',
  );
  const views = windows.flatMap((w) => w.views);
  c.unique(
    views.map((v) => v.id),
    () => 'windows',
    'view id',
  );
  const windowIds = ids(windows.map((w) => w.id));
  const viewIds = ids(views.map((v) => v.id));

  const playsets =
    c.array(root['playsets'], 'playsets', (v, at) => checkPlayset(c, v, at, windowIds), true) ?? [];
  c.unique(
    playsets.map((p) => p.id),
    (i) => `playsets[${String(i)}].id`,
    'playset id',
  );
  const playsetIds = ids(playsets.map((p) => p.id));
  for (const own of views.flatMap((v) => v.playsets)) {
    if (!playsetIds.has(own.id)) c.fail(own.at, `The manifest has no playset "${own.id}".`);
  }

  const deviations =
    c.array(root['knownDeviations'], 'knownDeviations', (v, at) =>
      checkDeviation(c, v, at, { viewIds, playsetIds, resolutionKeys }),
    ) ?? [];
  c.unique(
    deviations.map((d) => d.id),
    (i) => `knownDeviations[${String(i)}].id`,
    'deviation id',
  );

  return c.problems.length === 0
    ? { manifest: root as unknown as CorpusManifest, problems: [] }
    : { problems: c.problems };
}

function checkResolution(c: Checker, value: unknown, at: string): Screen | undefined {
  const json = c.object(value, at, ['width', 'height', 'confirmed', 'evidence']);
  if (json === undefined) return undefined;
  const width = c.integer(json['width'], field(at, 'width'));
  const height = c.integer(json['height'], field(at, 'height'));
  c.boolean(json['confirmed'], field(at, 'confirmed'));
  c.string(json['evidence'], field(at, 'evidence'));
  if (width === undefined || height === undefined) return undefined;
  if (!isSide(width) || !isSide(height)) {
    c.fail(at, 'A side is out of range.');
    return undefined;
  }
  return { width, height };
}

function checkNotCovered(c: Checker, value: unknown, at: string): true | undefined {
  const json = c.object(value, at, ['reason'], ['widgetKind', 'shader']);
  if (json === undefined) return undefined;
  c.string(json['reason'], field(at, 'reason'));
  const hasKind = 'widgetKind' in json;
  if (hasKind === 'shader' in json) {
    c.fail(at, 'Give either "widgetKind" or "shader".');
    return undefined;
  }
  if (hasKind) c.oneOf(json['widgetKind'], field(at, 'widgetKind'), WIDGET_KINDS);
  else c.string(json['shader'], field(at, 'shader'), /^[a-z0-9_]+$/, 'a shader name in lower case');
  return true;
}

function checkPlayset(
  c: Checker,
  value: unknown,
  at: string,
  windowIds: ReadonlySet<string>,
): { id: string | undefined } | undefined {
  const json = c.object(
    value,
    at,
    ['id', 'title', 'gate', 'mods', 'disabledDlcs', 'windows'],
    ['save', 'covers', 'coverMargin', 'note'],
  );
  if (json === undefined) return undefined;
  const id = c.string(json['id'], field(at, 'id'), ID, 'an id in lowercase words joined by -');
  c.string(json['title'], field(at, 'title'));
  optionalString(c, json, at, 'note');
  const gate = c.oneOf(json['gate'], field(at, 'gate'), ['release', 'report'] as const);
  const release = gate === 'release';

  if ('save' in json) {
    const saveAt = field(at, 'save');
    const save = c.object(json['save'], saveAt, ['file', 'sha256', 'description'], ['confirm']);
    if (save !== undefined) {
      c.string(save['file'], field(saveAt, 'file'), /^[^/\\]+\.eu4$/, 'a save file name');
      c.string(save['sha256'], field(saveAt, 'sha256'), SHA256, 'an uppercase SHA-256');
      c.string(save['description'], field(saveAt, 'description'));
      if ('confirm' in save) pattern(c, save['confirm'], field(saveAt, 'confirm'));
    }
  } else if (release) {
    c.fail(at, 'A release playset pins its save.');
  }

  c.array(json['mods'], field(at, 'mods'), (v, modAt) => {
    const mod = c.object(v, modAt, ['name'], ['workshopId', 'sha256', 'note']);
    if (mod === undefined) return undefined;
    c.string(mod['name'], field(modAt, 'name'));
    optionalString(c, mod, modAt, 'note');
    if ('workshopId' in mod) {
      c.string(mod['workshopId'], field(modAt, 'workshopId'), /^\d+$/, 'a Workshop item id');
    }
    if ('sha256' in mod) {
      c.string(mod['sha256'], field(modAt, 'sha256'), SHA256, 'an uppercase SHA-256');
    } else if (release) {
      c.fail(modAt, 'A release playset pins every mod by its content hash.');
    }
    return true;
  });
  c.array(json['disabledDlcs'], field(at, 'disabledDlcs'), (v, dlcAt) => c.string(v, dlcAt));
  if ('covers' in json) {
    c.array(json['covers'], field(at, 'covers'), (v, coverAt) => pattern(c, v, coverAt), true);
  }
  if ('coverMargin' in json) c.integer(json['coverMargin'], field(at, 'coverMargin'), 0);

  const windows =
    c.array(
      json['windows'],
      field(at, 'windows'),
      (v, windowAt) => {
        const window = c.string(v, windowAt);
        if (window !== undefined && !windowIds.has(window)) {
          c.fail(windowAt, `No corpus window has the id "${window}".`);
        }
        return window;
      },
      true,
    ) ?? [];
  c.unique(windows, () => field(at, 'windows'), 'window');
  return { id };
}

function checkWindow(
  c: Checker,
  value: unknown,
  at: string,
):
  | {
      id: string | undefined;
      views: { id: string | undefined; playsets: { id: string; at: string }[] }[];
    }
  | undefined {
  const json = c.object(value, at, ['id', 'title', 'files', 'why', 'views']);
  if (json === undefined) return undefined;
  const id = c.string(json['id'], field(at, 'id'), ID, 'an id in lowercase words joined by -');
  c.string(json['title'], field(at, 'title'));
  c.string(json['why'], field(at, 'why'));
  c.array(
    json['files'],
    field(at, 'files'),
    (v, fileAt) =>
      c.string(v, fileAt, /^interface\/[^\\]+\.gui$/, 'a game-relative interface/*.gui path'),
    true,
  );
  const views =
    c.array(json['views'], field(at, 'views'), (v, viewAt) => checkView(c, v, viewAt), true) ?? [];
  return { id, views };
}

function checkView(
  c: Checker,
  value: unknown,
  at: string,
): { id: string | undefined; playsets: { id: string; at: string }[] } | undefined {
  const json = c.object(
    value,
    at,
    ['id', 'title', 'recipe', 'roots', 'codeFilled'],
    ['codeMoved', 'selectors', 'data', 'byPlayset', 'note'],
  );
  if (json === undefined) return undefined;
  const id = c.string(json['id'], field(at, 'id'), ID, 'an id in lowercase words joined by -');
  c.string(json['title'], field(at, 'title'));
  optionalString(c, json, at, 'note');
  const recipe = checkRecipe(c, json['recipe'], field(at, 'recipe'));
  const roots =
    c.array(json['roots'], field(at, 'roots'), (v, rootAt) => pattern(c, v, rootAt)) ?? [];
  if (recipe?.verified === true && roots.length === 0) {
    c.fail(field(at, 'roots'), 'A verified recipe names the roots it reads.');
  }
  c.array(json['codeFilled'], field(at, 'codeFilled'), (v, pathAt) => pattern(c, v, pathAt));
  if (json['codeMoved'] !== undefined) {
    c.array(json['codeMoved'], field(at, 'codeMoved'), (v, pathAt) => pattern(c, v, pathAt));
  }
  if ('selectors' in json) checkSelectors(c, json['selectors'], field(at, 'selectors'));
  if ('data' in json) checkData(c, json['data'], field(at, 'data'));
  const playsets: { id: string; at: string }[] = [];
  if ('byPlayset' in json) {
    const byAt = field(at, 'byPlayset');
    const by = c.map(json['byPlayset'], byAt);
    for (const [playset, own] of Object.entries(by ?? {})) {
      const ownAt = field(byAt, playset);
      playsets.push({ id: playset, at: ownAt });
      const entry = c.object(own, ownAt, [], ['recipe', 'selectors', 'data', 'note']);
      if (entry === undefined) continue;
      optionalString(c, entry, ownAt, 'note');
      if ('recipe' in entry) checkRecipe(c, entry['recipe'], field(ownAt, 'recipe'));
      if ('selectors' in entry) checkSelectors(c, entry['selectors'], field(ownAt, 'selectors'));
      if ('data' in entry) checkData(c, entry['data'], field(ownAt, 'data'));
    }
  }
  return { id, playsets };
}

/** The save's province by id and country by tag that a view shows. */
function checkData(c: Checker, value: unknown, at: string): void {
  const json = c.object(value, at, [], ['province', 'country']);
  if (json === undefined) return;
  if ('province' in json) c.integer(json['province'], field(at, 'province'), 1);
  if ('country' in json) {
    c.string(json['country'], field(at, 'country'), /^[A-Z0-9]{3}$/, 'a country tag');
  }
}

/** Selector values by selector id: ids and values as window profiles write them. */
function checkSelectors(c: Checker, value: unknown, at: string): void {
  const json = c.map(value, at);
  for (const [selector, selected] of Object.entries(json ?? {})) {
    if (!/^[A-Za-z][\w-]*$/.test(selector)) c.fail(field(at, selector), 'Not a selector id.');
    c.string(selected, field(at, selector), /^[\w-]+$/, 'a selector value');
  }
}

/** Checks a recipe, in the manifest or copied into a capture record. */
export function checkRecipe(
  c: Checker,
  value: unknown,
  at: string,
): { verified: boolean } | undefined {
  const json = c.object(value, at, ['from', 'steps', 'verified', 'evidence']);
  if (json === undefined) return undefined;
  c.oneOf(json['from'], field(at, 'from'), ['main-menu', 'save'] as const);
  c.string(json['evidence'], field(at, 'evidence'));
  c.array(json['steps'], field(at, 'steps'), (v, stepAt) => {
    const step = c.object(v, stepAt, [], ['key', 'click', 'point', 'text', 'map', 'wheel']);
    if (step === undefined) return undefined;
    if (Object.keys(step).length !== 1) {
      c.fail(stepAt, 'Give one of "key", "click", "point", "text", "map" or "wheel".');
      return undefined;
    }
    if ('text' in step) {
      // Tongs' `text` types U+0020-U+007E and U+00A0-U+00FF.
      return c.string(
        step['text'],
        field(stepAt, 'text'),
        /^[\x20-\x7e\xa0-\xff]+$/,
        'Latin-1 text',
      );
    }
    if ('map' in step || 'wheel' in step) {
      const wheel = 'wheel' in step;
      const pointAt = field(stepAt, wheel ? 'wheel' : 'map');
      const point = c.object(
        step[wheel ? 'wheel' : 'map'],
        pointAt,
        wheel ? ['x', 'y', 'steps'] : ['x', 'y'],
      );
      if (point === undefined) return undefined;
      for (const axis of ['x', 'y']) {
        const value = point[axis];
        if (typeof value !== 'number' || !(Math.abs(value) <= 2)) {
          c.fail(field(pointAt, axis), 'Expected client heights from the centre, from -2 to 2.');
        }
      }
      if (wheel) {
        const steps = c.integer(point['steps'], field(pointAt, 'steps'));
        if (steps === 0) c.fail(field(pointAt, 'steps'), 'Turn the wheel at least one step.');
      }
      return true;
    }
    if ('key' in step) return c.oneOf(step['key'], field(stepAt, 'key'), TONGS_KEYS);
    if ('point' in step) {
      const point = c.object(step['point'], field(stepAt, 'point'), ['x', 'y']);
      if (point === undefined) return undefined;
      for (const axis of ['x', 'y']) {
        const value = point[axis];
        if (typeof value !== 'number' || !(value >= 0 && value <= 1)) {
          c.fail(field(stepAt, `point.${axis}`), 'Expected a fraction from 0 to 1.');
        }
      }
      return true;
    }
    return pattern(c, step['click'], field(stepAt, 'click'));
  });
  const verified = c.boolean(json['verified'], field(at, 'verified'));
  return verified === undefined ? undefined : { verified };
}

function checkDeviation(
  c: Checker,
  value: unknown,
  at: string,
  known: {
    viewIds: ReadonlySet<string>;
    playsetIds: ReadonlySet<string>;
    resolutionKeys: ReadonlySet<string>;
  },
): { id: string | undefined } | undefined {
  const json = c.object(
    value,
    at,
    ['id', 'widgets', 'difference', 'issue', 'consent'],
    ['kinds', 'views', 'playsets', 'resolutions'],
  );
  if (json === undefined) return undefined;
  const id = c.string(json['id'], field(at, 'id'), ID, 'an id in lowercase words joined by -');
  pattern(c, json['widgets'], field(at, 'widgets'));
  c.string(json['difference'], field(at, 'difference'));
  c.string(
    json['issue'],
    field(at, 'issue'),
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/,
    'a GitHub issue link',
  );
  c.string(json['consent'], field(at, 'consent'), /^https:\/\/\S+$/, 'a link');
  if ('kinds' in json) {
    c.array(
      json['kinds'],
      field(at, 'kinds'),
      (v, kindAt) => c.oneOf(v, kindAt, WIDGET_KINDS),
      true,
    );
  }
  const scopes = [
    ['views', known.viewIds, 'view'],
    ['playsets', known.playsetIds, 'playset'],
    ['resolutions', known.resolutionKeys, 'resolution'],
  ] as const;
  for (const [key, ids, what] of scopes) {
    if (!(key in json)) continue;
    c.array(
      json[key],
      field(at, key),
      (v, scopeAt) => {
        const id = c.string(v, scopeAt);
        if (id !== undefined && !ids.has(id))
          c.fail(scopeAt, `The manifest has no ${what} "${id}".`);
        return id;
      },
      true,
    );
  }
  return { id };
}

function pattern(c: Checker, value: unknown, at: string): string | undefined {
  const text = c.string(value, at);
  if (text === undefined) return undefined;
  const problem = widgetPatternProblem(text);
  if (problem === undefined) return text;
  c.fail(at, problem);
  return undefined;
}

function ids(values: readonly (string | undefined)[]): Set<string> {
  return new Set(values.filter((v) => v !== undefined));
}

function optionalString(c: Checker, json: Json, at: string, key: string): void {
  if (key in json) c.string(json[key], field(at, key));
}
