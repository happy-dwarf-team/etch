/**
 * A capture record, `corpus/captures/<playset>/<WxH>/<view>.json` (ADR 0002, etch#41): the text
 * side of one capture. It holds what the capture was taken with (game build, Tongs, save, mods,
 * recipe), what Tongs' `window` reported, the screenshot's hash and the widget tree from
 * `ui tree ROOT all`. The screenshot itself stays in the local corpus folder.
 */
import type { Screen } from '../model/gui.ts';
import { Checker, SHA256, field, type CorpusProblem, type Json } from './check.ts';
import {
  CORPUS_FORMAT_VERSION,
  checkRecipe,
  findView,
  resolutionKey,
  viewInPlayset,
  type CaptureKey,
  type CorpusManifest,
  type Recipe,
} from './manifest.ts';
import { matchesWidgetPattern, parentWidgetPath, splitWidgetPath } from './widget-path.ts';

/** The coarse widget kinds Tongs tells apart (tongs README, "Widgets"). */
export const TONGS_WIDGET_TYPES = [
  'window',
  'button',
  'icon',
  'text',
  'listbox',
  'checkbox',
  'editbox',
  'other',
] as const;
export type TongsWidgetType = (typeof TONGS_WIDGET_TYPES)[number];

/** A widget as Tongs' `ui tree … all` reports it, without `click_point` (the centre of `rect`). */
export interface CapturedWidget {
  /** The widget path; it resolves back to this widget as a Tongs selector. */
  readonly path: string;
  /** The `.gui` name, case kept; empty for a widget without a usable name. */
  readonly name: string;
  readonly type: TongsWidgetType;
  /** The widget and all its ancestors are shown. */
  readonly visible: boolean;
  /** Client pixels: position as drawn, size from the `.gui` (tongs#50). */
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Displayed text, UTF-8, without colour codes; icons stay as `£name`. */
  readonly text?: string;
  readonly enabled?: boolean;
  readonly checked?: boolean;
  readonly children?: readonly CapturedWidget[];
}

export interface CaptureRecord {
  readonly formatVersion: typeof CORPUS_FORMAT_VERSION;
  readonly playset: string;
  readonly resolution: Screen;
  readonly view: string;
  /** When the capture was taken, ISO 8601 in UTC. */
  readonly takenAt: string;
  readonly game: { readonly exeSha256: string };
  readonly tongs: { readonly version: string };
  /** The save loaded, when the recipe starts from one. */
  readonly save?: { readonly sha256: string };
  /** The playset's mods in load order, with their content hashes at capture time. */
  readonly mods: readonly { readonly name: string; readonly sha256: string }[];
  readonly disabledDlcs: readonly string[];
  /** The recipe as it was run. */
  readonly recipe: Recipe;
  /** Tongs' `window`: the client area and DPI. */
  readonly window: { readonly width: number; readonly height: number; readonly dpi: number };
  /** The screenshot: the first of the shots the driver took of the view. */
  readonly screenshot: CapturedScreenshot;
  /** The trees of the view's roots. */
  readonly widgets: readonly CapturedWidget[];
}

export interface CapturedScreenshot {
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  /** How many shots the driver took and compared, at least two (ADR 0002). */
  readonly shots: number;
  /**
   * The pixels that were not the same in every shot (an animated background or map, etch#18), as
   * a mask next to the screenshot (`unstableMaskFile`). Left out when every shot was identical.
   * The comparison compares no unstable pixel.
   */
  readonly unstable?: { readonly pixels: number; readonly sha256: string };
}

export interface CaptureResult {
  readonly capture?: CaptureRecord;
  readonly problems: readonly CorpusProblem[];
}

/** The capture a record is of. */
export function captureKeyOf(record: CaptureRecord): CaptureKey {
  return { playset: record.playset, resolution: record.resolution, view: record.view };
}

/** Every widget of a capture, parents before their children. */
export function* capturedWidgets(widgets: readonly CapturedWidget[]): Generator<CapturedWidget> {
  for (const widget of widgets) {
    yield widget;
    if (widget.children !== undefined) yield* capturedWidgets(widget.children);
  }
}

/** Checks a parsed capture record on its own; the record comes back only when it has no problems. */
export function parseCaptureRecord(value: unknown): CaptureResult {
  const c = new Checker();
  const root = c.object(
    value,
    '',
    [
      'formatVersion',
      'playset',
      'resolution',
      'view',
      'takenAt',
      'game',
      'tongs',
      'mods',
      'disabledDlcs',
      'recipe',
      'window',
      'screenshot',
      'widgets',
    ],
    ['save'],
  );
  if (root === undefined) return { problems: c.problems };

  if ('formatVersion' in root && root['formatVersion'] !== CORPUS_FORMAT_VERSION) {
    c.fail('formatVersion', `Expected ${String(CORPUS_FORMAT_VERSION)}.`);
  }
  c.string(root['playset'], 'playset');
  c.string(root['view'], 'view');
  size(c, root['resolution'], 'resolution', ['width', 'height']);
  c.string(
    root['takenAt'],
    'takenAt',
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/,
    'an ISO 8601 time in UTC',
  );
  const game = c.object(root['game'], 'game', ['exeSha256']);
  if (game !== undefined)
    c.string(game['exeSha256'], 'game.exeSha256', SHA256, 'an uppercase SHA-256');
  const tongs = c.object(root['tongs'], 'tongs', ['version']);
  if (tongs !== undefined)
    c.string(tongs['version'], 'tongs.version', /^\d+\.\d+\.\d+$/, 'a version');
  if ('save' in root) {
    const save = c.object(root['save'], 'save', ['sha256']);
    if (save !== undefined) c.string(save['sha256'], 'save.sha256', SHA256, 'an uppercase SHA-256');
  }
  c.array(root['mods'], 'mods', (v, at) => {
    const mod = c.object(v, at, ['name', 'sha256']);
    if (mod === undefined) return undefined;
    c.string(mod['name'], field(at, 'name'));
    return c.string(mod['sha256'], field(at, 'sha256'), SHA256, 'an uppercase SHA-256');
  });
  c.array(root['disabledDlcs'], 'disabledDlcs', (v, at) => c.string(v, at));
  const recipe = checkRecipe(c, root['recipe'], 'recipe');
  if (recipe !== undefined && !recipe.verified) {
    c.fail('recipe.verified', 'A capture is taken only with a recipe that worked.');
  }
  size(c, root['window'], 'window', ['width', 'height', 'dpi']);
  const screenshot = c.object(
    root['screenshot'],
    'screenshot',
    ['sha256', 'width', 'height', 'shots'],
    ['unstable'],
  );
  if (screenshot !== undefined) {
    c.string(screenshot['sha256'], 'screenshot.sha256', SHA256, 'an uppercase SHA-256');
    c.integer(screenshot['width'], 'screenshot.width', 1);
    c.integer(screenshot['height'], 'screenshot.height', 1);
    c.integer(screenshot['shots'], 'screenshot.shots', 2);
    if ('unstable' in screenshot) {
      const unstable = c.object(screenshot['unstable'], 'screenshot.unstable', [
        'pixels',
        'sha256',
      ]);
      if (unstable !== undefined) {
        c.integer(unstable['pixels'], 'screenshot.unstable.pixels', 1);
        c.string(unstable['sha256'], 'screenshot.unstable.sha256', SHA256, 'an uppercase SHA-256');
      }
    }
  }

  const paths = new Set<string>();
  c.array(root['widgets'], 'widgets', (v, at) => checkWidget(c, v, at, undefined, paths), true);

  return c.problems.length === 0
    ? { capture: root as unknown as CaptureRecord, problems: [] }
    : { problems: c.problems };
}

/**
 * What makes a checked capture record unusable for the manifest, or out of date: a playset, view
 * or resolution the manifest does not have; a different game build, Tongs version, save, mod,
 * disabled DLC or recipe (ADR 0002 recaptures on each); a client area other than the resolution
 * or a DPI other than 96 (the only one checked); and roots that do not match the tree.
 */
export function captureProblems(manifest: CorpusManifest, record: CaptureRecord): CorpusProblem[] {
  const problems: CorpusProblem[] = [];
  const fail = (at: string, message: string): void => {
    problems.push({ at, message });
  };

  const playset = manifest.playsets.find((p) => p.id === record.playset);
  const found = findView(manifest, record.view);
  const key = resolutionKey(record.resolution);
  if (playset === undefined) fail('playset', `The manifest has no playset "${record.playset}".`);
  if (found === undefined) fail('view', `The manifest has no view "${record.view}".`);
  if (!manifest.resolutions.some((r) => resolutionKey(r) === key)) {
    fail('resolution', `The manifest has no resolution ${key}.`);
  } else if (playset?.resolutions !== undefined && !playset.resolutions.includes(key)) {
    fail('resolution', `The playset "${playset.id}" is not captured at ${key}.`);
  }
  if (playset !== undefined && found !== undefined && !playset.windows.includes(found.window.id)) {
    fail('view', `The playset "${playset.id}" does not capture the window "${found.window.id}".`);
  }

  if (record.game.exeSha256 !== manifest.game.exeSha256) {
    fail('game.exeSha256', 'Taken with another eu4.exe than the manifest pins.');
  }
  if (record.tongs.version !== manifest.tongs.version) {
    fail(
      'tongs.version',
      `Taken with Tongs ${record.tongs.version}; the manifest pins ${manifest.tongs.version}.`,
    );
  }

  if (playset !== undefined) {
    const wantsSave =
      (found === undefined ? undefined : viewInPlayset(found.view, playset))?.recipe.from ===
      'save';
    if (wantsSave && playset.save === undefined) {
      fail('save', `The playset "${playset.id}" pins no save for a view opened from one.`);
    } else if (wantsSave && record.save?.sha256 !== playset.save?.sha256) {
      fail('save', 'Taken with another save than the playset pins.');
    } else if (!wantsSave && record.save !== undefined) {
      fail('save', 'The view opens from the main menu; no save is loaded.');
    }
    const names = record.mods.map((m) => m.name);
    if (names.join('\n') !== playset.mods.map((m) => m.name).join('\n')) {
      fail('mods', 'The mods or their order differ from the playset.');
    } else {
      playset.mods.forEach((mod, i) => {
        if (mod.sha256 !== undefined && mod.sha256 !== record.mods[i]?.sha256) {
          fail(`mods[${String(i)}].sha256`, `"${mod.name}" differs from the playset's pin.`);
        }
      });
    }
    if (
      [...record.disabledDlcs].sort().join('\n') !== [...playset.disabledDlcs].sort().join('\n')
    ) {
      fail('disabledDlcs', 'The disabled DLCs differ from the playset.');
    }
  }

  const view =
    found === undefined
      ? undefined
      : playset === undefined
        ? found.view
        : viewInPlayset(found.view, playset);
  if (view !== undefined && !sameRecipe(view.recipe, record.recipe)) {
    fail('recipe', 'The recipe differs from the manifest.');
  }
  if (
    record.window.width !== record.resolution.width ||
    record.window.height !== record.resolution.height
  ) {
    fail('window', `The client area is not ${key}.`);
  }
  if (record.window.dpi !== 96) fail('window.dpi', 'Only DPI 96 is checked (etch#5).');
  if (
    record.screenshot.width !== record.resolution.width ||
    record.screenshot.height !== record.resolution.height
  ) {
    fail('screenshot', `The screenshot is not ${key}.`);
  }

  if (view !== undefined) {
    const roots = view.roots;
    record.widgets.forEach((widget, i) => {
      if (!roots.some((root) => matchesWidgetPattern(root, widget.path))) {
        fail(`widgets[${String(i)}]`, `"${widget.path}" is not one of the view's roots.`);
      }
    });
    for (const root of roots) {
      if (!record.widgets.some((widget) => matchesWidgetPattern(root, widget.path))) {
        fail('widgets', `The root "${root}" is missing from the tree.`);
      }
    }
  }
  return problems;
}

function sameRecipe(a: Recipe, b: Recipe): boolean {
  return a.from === b.from && JSON.stringify(a.steps) === JSON.stringify(b.steps);
}

function size(c: Checker, value: unknown, at: string, keys: readonly string[]): Json | undefined {
  const json = c.object(value, at, keys);
  if (json === undefined) return undefined;
  for (const key of keys) c.integer(json[key], field(at, key), 1);
  return json;
}

function checkWidget(
  c: Checker,
  value: unknown,
  at: string,
  parent: string | undefined,
  paths: Set<string>,
): true | undefined {
  const json = c.object(
    value,
    at,
    ['path', 'name', 'type', 'visible', 'rect'],
    ['text', 'enabled', 'checked', 'children', 'stale', 'children_count'],
  );
  if (json === undefined) return undefined;
  if ('stale' in json) {
    c.fail(field(at, 'stale'), 'A stale widget: the tree was read after a reload (ADR 0002).');
  }
  if ('children_count' in json) {
    c.fail(field(at, 'children_count'), 'A tree cut by depth=; captures read the whole tree.');
  }
  const path = c.string(json['path'], field(at, 'path'));
  if (path !== undefined) {
    if (splitWidgetPath(path) === undefined)
      c.fail(field(at, 'path'), `"${path}" is not a widget path.`);
    if (paths.has(path)) c.fail(field(at, 'path'), `The path "${path}" occurs more than once.`);
    paths.add(path);
    // A root may be any widget its selector matched; below it, paths extend the parent's.
    if (parent !== undefined && parentWidgetPath(path) !== parent) {
      c.fail(field(at, 'path'), `"${path}" is not a child of "${parent}".`);
    }
  }
  if (typeof json['name'] !== 'string') c.fail(field(at, 'name'), 'Expected a string.');
  c.oneOf(json['type'], field(at, 'type'), TONGS_WIDGET_TYPES);
  c.boolean(json['visible'], field(at, 'visible'));
  const rect = c.object(json['rect'], field(at, 'rect'), ['x', 'y', 'w', 'h']);
  if (rect !== undefined) {
    c.integer(rect['x'], field(at, 'rect.x'));
    c.integer(rect['y'], field(at, 'rect.y'));
    // Sizes are the .gui's, which can be negative (provinceview's foreign_province_window).
    c.integer(rect['w'], field(at, 'rect.w'));
    c.integer(rect['h'], field(at, 'rect.h'));
  }
  if ('text' in json && typeof json['text'] !== 'string')
    c.fail(field(at, 'text'), 'Expected a string.');
  if ('enabled' in json) c.boolean(json['enabled'], field(at, 'enabled'));
  if ('checked' in json) c.boolean(json['checked'], field(at, 'checked'));
  if ('children' in json) {
    c.array(json['children'], field(at, 'children'), (v, childAt) =>
      checkWidget(c, v, childAt, path, paths),
    );
  }
  return true;
}
