/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import {
  InterfaceIndex,
  layoutWindow,
  parseScript,
  readGfxFile,
  readGuiFile,
  type DrawList,
  type TextureSize,
  type WindowLayout,
} from '../../src/index.ts';
import {
  PIXEL,
  compareCapture,
  corpusSummary,
  decodePng,
  differenceImage,
  encodePng,
  parseCorpusManifest,
  planCapture,
  spriteShaderOf,
  windowReport,
  type CaptureComparison,
  type CaptureOutcome,
  type CaptureRecord,
  type CapturedWidget,
  type CorpusManifest,
  type PlanWindow,
  type RgbaImage,
  type WidgetComparison,
} from '../../src/corpus/index.ts';
import { set } from './json-edit.ts';

const EXE = '9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A';
const SCREEN = { width: 200, height: 100 };

const GFX = `
spriteTypes = {
  spriteType = { name = "GFX_bg" texturefile = "gfx/interface/bg.dds" }
  spriteType = { name = "GFX_icon" texturefile = "gfx/interface/icon.dds" }
  spriteType = { name = "GFX_target" texturefile = "gfx/interface/icon.dds" effectFile = "gfx/FX/gui_rendertarget.shader" }
}`;
const TEXTURES: Record<string, TextureSize> = {
  'gfx/interface/bg.dds': { width: 100, height: 50 },
  'gfx/interface/icon.dds': { width: 10, height: 10 },
};
/** The solid colour each texture is drawn with by {@link paint}. */
const COLOURS: Record<string, readonly [number, number, number]> = {
  'gfx/interface/bg.dds': [40, 50, 60],
  'gfx/interface/icon.dds': [200, 100, 0],
};

const GUI = `
guiTypes = {
  windowType = {
    name = "panel" position = { x = 10 y = 20 } size = { x = 100 y = 50 }
    iconType = { name = "bg" spriteType = "GFX_bg" }
    iconType = { name = "icon" spriteType = "GFX_icon" position = { x = 5 y = 5 } }
    iconType = { name = "icon" spriteType = "GFX_icon" position = { x = 20 y = 5 } }
    iconType = { name = "flag" spriteType = "GFX_icon" position = { x = 40 y = 5 } }
    listboxType = { name = "list" position = { x = 60 y = 5 } size = { x = 30 y = 30 } }
    iconType = { name = "target" spriteType = "GFX_target" position = { x = 5 y = 30 } }
  }
}`;

function laidOut(guiText = GUI): PlanWindow {
  const file = readGuiFile(parseScript(guiText));
  const index = InterfaceIndex.of(
    [{ path: 'interface/test.gfx', file: readGfxFile(parseScript(GFX)) }],
    [{ path: 'interface/test.gui', file }],
  );
  const window = file.definitions[0];
  if (window === undefined) throw new Error('no window');
  const layout = layoutWindow(window, {
    file,
    index,
    exists: (path) => path.toLowerCase() in TEXTURES,
    assets: { textureSize: (path) => TEXTURES[path], font: () => undefined },
    screen: SCREEN,
  });
  return {
    layout,
    shaderOf: (widget) =>
      spriteShaderOf(widget, { constants: file.constants, index, screen: SCREEN }),
  };
}

function manifestWith(
  edit: (json: Record<string, unknown>) => void = () => undefined,
): CorpusManifest {
  const json: Record<string, unknown> = {
    formatVersion: 1,
    game: { version: '1.37.5', exeSha256: EXE },
    tongs: { version: '0.14.1' },
    uiScale: 1,
    resolutions: [{ width: 200, height: 100, confirmed: true, evidence: 'a test' }],
    codeFilledKinds: ['listboxType'],
    notCovered: [{ shader: 'gui_rendertarget', reason: 'a test' }],
    playsets: [
      {
        id: 'vanilla',
        title: 'Vanilla',
        gate: 'release',
        save: { file: 'a.eu4', sha256: 'A'.repeat(64), description: 'a save' },
        mods: [],
        disabledDlcs: [],
        windows: ['panel'],
      },
    ],
    windows: [
      {
        id: 'panel',
        title: 'The panel',
        files: ['interface/test.gui'],
        why: 'a test',
        views: [
          {
            id: 'panel',
            title: 'Panel',
            recipe: { from: 'main-menu', steps: [], verified: true, evidence: 'a test' },
            roots: ['panel'],
            codeFilled: [],
          },
        ],
      },
    ],
    knownDeviations: [],
  };
  edit(json);
  const { manifest, problems } = parseCorpusManifest(json);
  expect(problems).toEqual([]);
  if (manifest === undefined) throw new Error('no manifest');
  return manifest;
}

/** The capture the game would give for a layout: every widget visible, at its rounded rect. */
function captureOf(layout: WindowLayout): CapturedWidget {
  const build = (at: number, path: string): CapturedWidget => {
    const w = layout.widgets[at];
    if (w === undefined) throw new Error('no widget');
    const kids = layout.widgets.flatMap((k, i) => (k.parent === at ? [i] : []));
    const children = kids.map((kid, position) => {
      const name = layout.widgets[kid]?.widget.name ?? '';
      const same = kids.filter((k) => layout.widgets[k]?.widget.name === name);
      const step = same.length > 1 ? `${name}[${String(same.indexOf(kid) + 1)}]` : name;
      return build(kid, `${path}/${step === '' ? `[${String(position + 1)}]` : step}`);
    });
    return {
      path,
      name: w.widget.name ?? '',
      type: 'icon',
      visible: true,
      rect: {
        x: Math.round(w.x),
        y: Math.round(w.y),
        w: Math.round(w.width),
        h: Math.round(w.height),
      },
      ...(children.length > 0 ? { children } : {}),
    };
  };
  return build(0, layout.widgets[0]?.widget.name ?? '');
}

function recordOf(root: CapturedWidget): CaptureRecord {
  return {
    formatVersion: 1,
    playset: 'vanilla',
    resolution: SCREEN,
    view: 'panel',
    takenAt: '2026-10-21T00:00:00Z',
    game: { exeSha256: EXE },
    tongs: { version: '0.14.1' },
    mods: [],
    disabledDlcs: [],
    recipe: { from: 'main-menu', steps: [], verified: true, evidence: 'a test' },
    window: { ...SCREEN, dpi: 96 },
    screenshot: { sha256: 'C'.repeat(64), ...SCREEN, shots: 2 },
    widgets: [root],
  };
}

/** Paints a draw list the way the renderer would for solid textures: opaque rects. */
function paint(list: DrawList): RgbaImage {
  const data = new Uint8Array(list.width * list.height * 4);
  for (const draw of list.draws) {
    if (draw.kind !== 'sprite') continue;
    const colour = COLOURS[list.textures[draw.texture] ?? ''] ?? [255, 255, 255];
    for (let y = draw.y; y < draw.y + draw.height; y++) {
      for (let x = draw.x; x < draw.x + draw.width; x++) {
        data.set([...colour, 255], (y * list.width + x) * 4);
      }
    }
  }
  return { width: list.width, height: list.height, data };
}

/** The render as the game would show it: opaque, black where nothing is drawn. */
function screenshotOf(render: RgbaImage): RgbaImage {
  const data = Uint8Array.from(render.data);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { ...render, data };
}

function fill(image: RgbaImage, x: number, y: number, w: number, h: number, rgb: number[]): void {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) image.data.set(rgb, (row * image.width + col) * 4);
  }
}

function compare(
  options: {
    manifest?: CorpusManifest;
    window?: PlanWindow;
    capture?: (root: CapturedWidget) => CapturedWidget;
    render?: (image: RgbaImage) => void;
    game?: (image: RgbaImage) => void;
    unstable?: RgbaImage;
  } = {},
): CaptureComparison {
  const manifest = options.manifest ?? manifestWith();
  const window = options.window ?? laidOut();
  const truth = captureOf(window.layout);
  const record = recordOf(options.capture?.(truth) ?? truth);
  const plan = planCapture({ manifest, record, windows: [window] });
  const render = paint(plan.drawList);
  // The game's screenshot comes from the unchanged layout.
  const game = screenshotOf(
    paint(planCapture({ manifest, record: recordOf(truth), windows: [window] }).drawList),
  );
  options.render?.(render);
  options.game?.(game);
  return compareCapture(manifest, plan, render, game, options.unstable).comparison;
}

function widget(comparison: CaptureComparison, path: string): WidgetComparison {
  const found = comparison.widgets.find((w) => w.path === path);
  if (found === undefined) throw new Error(`no widget ${path}`);
  return found;
}

/** A captured widget's copy with `edit` applied to the descendant at `path`. */
function editWidget(
  root: CapturedWidget,
  path: string,
  edit: (w: CapturedWidget) => CapturedWidget | undefined,
): CapturedWidget {
  const walk = (w: CapturedWidget): CapturedWidget | undefined => {
    if (w.path === path) return edit(w);
    if (w.children === undefined) return w;
    const children = w.children.flatMap((c) => {
      const changed = walk(c);
      return changed === undefined ? [] : [changed];
    });
    return { ...w, children };
  };
  return walk(root) ?? root;
}

describe('planCapture', () => {
  it('pairs the capture with the layout by name, same names in order', () => {
    const window = laidOut();
    const plan = planCapture({
      manifest: manifestWith(),
      record: recordOf(captureOf(window.layout)),
      windows: [window],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.widgets.map((w) => [w.path, w.laidOut?.x, w.captured?.rect.x])).toEqual([
      ['panel', 10, 10],
      ['panel/bg', 10, 10],
      ['panel/icon[1]', 15, 15],
      ['panel/icon[2]', 30, 30],
      ['panel/flag', 50, 50],
      ['panel/list', 70, 70],
      ['panel/target', 15, 15],
    ]);
    expect(plan.drawOwners).toHaveLength(plan.drawList.draws.length);
  });

  it('matches names ignoring case and marks code-filled kinds and not-covered shaders', () => {
    const window = laidOut();
    const record = recordOf(
      editWidget(captureOf(window.layout), 'panel/flag', (w) => ({
        ...w,
        path: 'panel/FLAG',
        name: 'FLAG',
      })),
    );
    const plan = planCapture({ manifest: manifestWith(), record, windows: [window] });
    const byPath = new Map(plan.widgets.map((w) => [w.path, w]));
    expect(byPath.get('panel/FLAG')?.laidOut?.widget.name).toBe('flag');
    expect(byPath.get('panel/list')?.codeFilled).toBe('listboxType');
    expect(byPath.get('panel/target')?.notCovered).toBe('gui_rendertarget shader');
  });

  it('leaves the widgets the game hides out of the render', () => {
    const window = laidOut();
    const record = recordOf(
      editWidget(captureOf(window.layout), 'panel/flag', (w) => ({ ...w, visible: false })),
    );
    const plan = planCapture({ manifest: manifestWith(), record, windows: [window] });
    const flag = plan.widgets.findIndex((w) => w.path === 'panel/flag');
    expect(plan.widgets[flag]?.hidden).toBe(true);
    expect(plan.drawOwners).not.toContain(flag);
    expect(plan.drawList.draws).toHaveLength(window.layout.drawList.draws.length - 1);
  });

  it('reports a root the playset does not define', () => {
    const window = laidOut();
    const record = recordOf({ ...captureOf(window.layout), path: 'other', name: 'other' });
    const plan = planCapture({ manifest: manifestWith(), record, windows: [window] });
    expect(plan.problems).toEqual(['The playset defines no window "other" for the root "other".']);
    expect(plan.drawList.draws).toEqual([]);
  });

  it('takes a code-filled root the code creates, which no file defines (etch#44)', () => {
    const window = laidOut();
    const shield: CapturedWidget = {
      path: 'shield[1]',
      name: 'shield',
      type: 'button',
      visible: true,
      rect: { x: 150, y: 60, w: 0, h: 20 },
    };
    const record = { ...recordOf(captureOf(window.layout)) };
    const manifest = manifestWith((json) => {
      set(json, 'windows.0.views.0.roots', ['panel', 'shield']);
      set(json, 'windows.0.views.0.codeFilled', ['shield']);
    });
    const plan = planCapture({
      manifest,
      record: { ...record, widgets: [...record.widgets, shield] },
      windows: [window],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.widgets.find((w) => w.path === 'shield[1]')?.codeFilled).toBe('shield');
  });

  it('finds a root below a top-level window', () => {
    const window = laidOut();
    const root = captureOf(window.layout).children?.[1];
    if (root === undefined) throw new Error('no root');
    const plan = planCapture({
      manifest: manifestWith(),
      record: recordOf(root),
      windows: [window],
    });
    expect(plan.problems).toEqual([]);
    expect(plan.widgets.map((w) => w.path)).toEqual(['panel/icon[1]']);
    expect(plan.drawList.draws).toHaveLength(1);
  });
});

describe('compareCapture', () => {
  it('passes a render equal to the game', () => {
    const result = compare();
    expect(result.passed).toBe(true);
    expect(result.totals.widgets).toMatchObject({ pass: 5, fail: 0, 'code-filled': 1 });
    expect(widget(result, 'panel/target').status).toBe('not-covered');
    expect(widget(result, 'panel/icon[1]').pixels).toEqual({
      compared: 100,
      within: 100,
      meanDifference: 0,
      partial: 0,
      masked: 0,
      unstable: 0,
    });
    // The background's pixels are those no icon covers, outside the list's game rect.
    expect(widget(result, 'panel/bg').pixels).toMatchObject({
      compared: 100 * 50 - 4 * 100 - 30 * 30,
      masked: 30 * 30,
    });
    // The not-covered target gates nothing.
    expect(result.totals.pixels.compared).toBe(100 * 50 - 100 - 30 * 30);
  });

  it('accepts ±2 per channel and fails a widget below 99 % within it', () => {
    const near = compare({
      game: (g) => {
        fill(g, 15, 25, 10, 10, [202, 98, 2]);
      },
    });
    expect(widget(near, 'panel/icon[1]').status).toBe('pass');

    // One pixel in 100 off is still 99 %; two are not.
    const one = compare({
      game: (g) => {
        fill(g, 15, 25, 1, 1, [0, 0, 0]);
      },
    });
    expect(widget(one, 'panel/icon[1]').status).toBe('pass');
    expect(widget(one, 'panel/icon[1]').pixels.meanDifference).toBeCloseTo(2);
    const two = compare({
      game: (g) => {
        fill(g, 15, 25, 2, 1, [0, 0, 0]);
      },
    });
    const icon = widget(two, 'panel/icon[1]');
    expect(icon.status).toBe('fail');
    expect(icon.problems).toEqual(['98.00 % of 100 pixels are within ±2 (mean difference 4.00).']);
    expect(two.passed).toBe(false);
    expect(two.totals.widgets.fail).toBe(1);
  });

  it("fails a widget whose rect is not the game's, even with equal pixels", () => {
    const result = compare({
      capture: (root) =>
        editWidget(root, 'panel/flag', (w) => ({ ...w, rect: { ...w.rect, w: 12 } })),
    });
    expect(widget(result, 'panel/flag').problems).toEqual([
      "The rect is (50, 25) 10×10; the game's is (50, 25) 12×10.",
    ]);
    expect(widget(result, 'panel/flag').status).toBe('fail');
  });

  it("compares a window's position but not its size (etch#44)", () => {
    const resized = compare({
      capture: (root) => ({ ...root, rect: { ...root.rect, w: 1921, h: 80 } }),
    });
    expect(widget(resized, 'panel').status).toBe('pass');
    const moved = compare({
      capture: (root) => ({ ...root, rect: { ...root.rect, x: root.rect.x + 1 } }),
    });
    expect(widget(moved, 'panel').problems).toEqual([
      "The rect is (10, 20) 100×50; the game's is (11, 20) 100×50.",
    ]);
  });

  it('leaves out pixels the render covers only partly', () => {
    const result = compare({
      render: (r) => {
        // Half-transparent edge pixels of an icon, different from the game.
        for (let y = 25; y < 35; y++) r.data.set([0, 0, 0, 128], (y * 200 + 15) * 4);
      },
    });
    const icon = widget(result, 'panel/icon[1]');
    expect(icon.status).toBe('pass');
    expect(icon.pixels).toMatchObject({ compared: 90, partial: 10 });
  });

  it('compares no unstable pixel and fails a widget with more than 5 % of them', () => {
    // The capture's mask marks 3 pixels of icon[1], 6 of icon[2] and one of the list, whose
    // code-filled content is masked anyway.
    const unstable = { ...SCREEN, data: new Uint8Array(SCREEN.width * SCREEN.height * 4) };
    const marks: (readonly [number, number])[] = [
      [15, 25],
      [16, 25],
      [17, 30],
      [75, 30],
      ...[0, 1, 2, 3, 4, 5].map((i) => [30 + i, 26] as const),
    ];
    for (const [x, y] of marks) unstable.data[(y * SCREEN.width + x) * 4] = 255;
    const result = compare({ unstable });
    expect(widget(result, 'panel/icon[1]')).toMatchObject({
      status: 'pass',
      pixels: { compared: 97, unstable: 3 },
    });
    const icon = widget(result, 'panel/icon[2]');
    expect(icon.status).toBe('fail');
    expect(icon.pixels).toMatchObject({ compared: 94, unstable: 6 });
    expect(icon.problems).toEqual([
      "6 of its pixels changed between the capture's shots, more than 5.00 %; recapture it, or mask what the game animates there.",
    ]);
    expect(result.passed).toBe(false);
    expect(result.totals.pixels.unstable).toBe(9);
  });

  it('masks code-filled content under its game rect, even over static widgets', () => {
    const manifest = manifestWith((json) => {
      set(json, 'windows.0.views.0.codeFilled', ['panel/flag']);
    });
    // The game draws the flag elsewhere and larger, over the background and an icon.
    const result = compare({
      manifest,
      capture: (root) =>
        editWidget(root, 'panel/flag', (w) => ({ ...w, rect: { x: 25, y: 25, w: 30, h: 10 } })),
      game: (g) => {
        fill(g, 25, 25, 30, 10, [255, 255, 255]);
      },
    });
    expect(result.passed).toBe(true);
    expect(widget(result, 'panel/flag')).toMatchObject({
      status: 'code-filled',
      reason: 'panel/flag',
    });
    expect(widget(result, 'panel/icon[2]').pixels).toMatchObject({ compared: 0, masked: 100 });
    // The flag's game rect over the background, less the icon and the flag's own draw.
    expect(widget(result, 'panel/bg').pixels.masked).toBe(30 * 10 - 100 - 50 + 30 * 30);
  });

  it('masks a code-filled shield Tongs gives no width as a square (etch#44)', () => {
    const manifest = manifestWith((json) => {
      set(json, 'windows.0.views.0.codeFilled', ['panel/flag']);
    });
    // The game draws the flag 10 × 10 at (70, 40) over the background; Tongs says 0 × 10.
    const result = compare({
      manifest,
      capture: (root) =>
        editWidget(root, 'panel/flag', (w) => ({ ...w, rect: { x: 70, y: 40, w: 0, h: 10 } })),
      game: (g) => {
        fill(g, 70, 40, 10, 10, [255, 255, 255]);
      },
    });
    expect(result.passed).toBe(true);
    expect(widget(result, 'panel/bg').status).toBe('pass');
  });

  it('does not draw a code-filled widget the game did not create (etch#44)', () => {
    const manifest = manifestWith((json) => {
      set(json, 'windows.0.views.0.codeFilled', ['panel/icon[2]']);
    });
    // The game has no icon[2]: the background shows there.
    const result = compare({
      manifest,
      capture: (root) => editWidget(root, 'panel/icon[2]', () => undefined),
      game: (g) => {
        fill(g, 30, 25, 10, 10, [40, 50, 60]);
      },
    });
    expect(result.passed).toBe(true);
    expect(widget(result, 'panel/icon[2]').status).toBe('code-filled');
    // The background is compared where the icon would have been: all of it but icon[1], the
    // flag, the target and the code-filled list.
    expect(widget(result, 'panel/bg').pixels.compared).toBe(100 * 50 - 3 * 100 - 30 * 30);
  });

  it('compares a widget the game moves where the game shows it (codeMoved)', () => {
    // The game draws the flag 15 px lower than the layout puts it.
    const capture = (root: CapturedWidget): CapturedWidget =>
      editWidget(root, 'panel/flag', (w) => ({ ...w, rect: { ...w.rect, y: w.rect.y + 15 } }));
    const game = (g: RgbaImage): void => {
      fill(g, 50, 25, 10, 10, [40, 50, 60]);
      fill(g, 50, 40, 10, 10, [200, 100, 0]);
    };
    expect(widget(compare({ capture, game }), 'panel/flag').status).toBe('fail');

    const manifest = manifestWith((json) => {
      set(json, 'windows.0.views.0.codeMoved', ['panel/flag']);
    });
    const result = compare({ manifest, capture, game });
    expect(result.passed).toBe(true);
    expect(widget(result, 'panel/flag')).toMatchObject({
      status: 'pass',
      moved: { x: 0, y: 15 },
      renderRect: { x: 50, y: 40, w: 10, h: 10 },
      pixels: { compared: 100, within: 100 },
    });
    expect(widget(result, 'panel/bg').status).toBe('pass');
  });

  it('masks the widgets the game disables or checks: its code sets their state', () => {
    const result = compare({
      capture: (root) =>
        editWidget(
          editWidget(root, 'panel/flag', (w) => ({ ...w, enabled: false })),
          'panel/icon[1]',
          (w) => ({ ...w, checked: true }),
        ),
      game: (g) => {
        // A disabled widget in grey, a checked one in another frame.
        fill(g, 50, 25, 10, 10, [128, 128, 128]);
        fill(g, 15, 25, 10, 10, [9, 9, 9]);
      },
    });
    expect(result.passed).toBe(true);
    expect(widget(result, 'panel/flag')).toMatchObject({
      status: 'code-filled',
      reason: 'disabled by the game',
    });
    expect(widget(result, 'panel/icon[1]')).toMatchObject({
      status: 'code-filled',
      reason: 'checked by the game',
    });
    expect(widget(result, 'panel/icon[2]').status).toBe('pass');
  });

  it('treats what is inside a code-filled widget as code-filled', () => {
    const window = laidOut();
    const result = compare({
      window,
      capture: (root) =>
        editWidget(root, 'panel/list', (w) => ({
          ...w,
          children: [
            {
              path: 'panel/list/row',
              name: 'row',
              type: 'text',
              visible: true,
              rect: { x: 70, y: 25, w: 30, h: 10 },
            },
          ],
        })),
      game: (g) => {
        fill(g, 70, 25, 30, 10, [9, 9, 9]);
      },
    });
    expect(widget(result, 'panel/list/row')).toMatchObject({
      status: 'code-filled',
      reason: 'inside panel/list',
    });
    expect(result.passed).toBe(true);
  });

  it('reports hidden widgets and leaves their pixels to what is below', () => {
    const result = compare({
      capture: (root) => editWidget(root, 'panel/flag', (w) => ({ ...w, visible: false })),
      // The game shows the background where the flag would be.
      game: (g) => {
        fill(g, 50, 25, 10, 10, [40, 50, 60]);
      },
    });
    expect(widget(result, 'panel/flag').status).toBe('hidden');
    expect(result.passed).toBe(true);
    expect(widget(result, 'panel/bg').pixels.compared).toBe(100 * 50 - 3 * 100 - 30 * 30);
  });

  it('fails a widget only the game has, and one only the render draws', () => {
    const result = compare({
      capture: (root) =>
        editWidget(root, 'panel', (w) => ({
          ...w,
          children: [
            ...(w.children ?? []).filter((c) => c.name !== 'flag'),
            {
              path: 'panel/extra',
              name: 'extra',
              type: 'icon',
              visible: true,
              rect: { x: 0, y: 0, w: 5, h: 5 },
            },
            {
              path: 'panel/empty',
              name: 'empty',
              type: 'other',
              visible: true,
              rect: { x: 0, y: 0, w: 0, h: 0 },
            },
            {
              path: 'panel/negative',
              name: 'negative',
              type: 'window',
              visible: true,
              rect: { x: 0, y: 0, w: 300, h: -100 },
            },
          ],
        })),
    });
    expect(widget(result, 'panel/extra')).toMatchObject({
      status: 'fail',
      problems: ['The render has no such widget.'],
    });
    expect(widget(result, 'panel/empty').status).toBe('absent');
    expect(widget(result, 'panel/negative').status).toBe('absent');
    expect(widget(result, 'panel/flag')).toMatchObject({
      status: 'fail',
      problems: ['The game has no such widget, but the render draws it.'],
    });
  });

  it('reports a widget only the layout has that draws nothing as absent', () => {
    const result = compare({
      capture: (root) =>
        editWidget(root, 'panel', (w) => ({
          ...w,
          children: (w.children ?? []).filter((c) => c.name !== 'list'),
        })),
    });
    expect(widget(result, 'panel/list').status).toBe('code-filled');
    const plain = compare({
      manifest: manifestWith((json) => {
        set(json, 'codeFilledKinds', []);
      }),
      capture: (root) =>
        editWidget(root, 'panel', (w) => ({
          ...w,
          children: (w.children ?? []).filter((c) => c.name !== 'list'),
        })),
    });
    expect(widget(plain, 'panel/list').status).toBe('absent');
    expect(plain.passed).toBe(true);
  });

  it('honours a known deviation that covers a failing widget', () => {
    const manifest = manifestWith((json) => {
      set(json, 'knownDeviations', [
        {
          id: 'icons-darker',
          widgets: 'panel/icon',
          kinds: ['iconType'],
          difference: 'Icons are darker.',
          issue: 'https://github.com/happy-dwarf-team/etch/issues/1',
          consent: 'https://github.com/happy-dwarf-team/etch/issues/1#issuecomment-1',
        },
      ]);
    });
    const result = compare({
      manifest,
      game: (g) => {
        fill(g, 15, 25, 10, 10, [100, 50, 0]);
        fill(g, 50, 25, 10, 10, [100, 50, 0]);
      },
    });
    expect(widget(result, 'panel/icon[1]')).toMatchObject({
      status: 'deviation',
      deviations: ['icons-darker'],
    });
    expect(widget(result, 'panel/flag').status).toBe('fail');
    expect(result.totals.widgets).toMatchObject({ deviation: 1, fail: 1 });
  });

  it('refuses images of another size', () => {
    const manifest = manifestWith();
    const window = laidOut();
    const plan = planCapture({
      manifest,
      record: recordOf(captureOf(window.layout)),
      windows: [window],
    });
    const small = { width: 10, height: 10, data: new Uint8Array(400) };
    expect(() => compareCapture(manifest, plan, small, small)).toThrow(
      'The render is 10x10, not 200x100.',
    );
  });

  it('maps every pixel for the difference image', () => {
    const manifest = manifestWith();
    const window = laidOut();
    const plan = planCapture({
      manifest,
      record: recordOf(captureOf(window.layout)),
      windows: [window],
    });
    const render = paint(plan.drawList);
    const game = screenshotOf(render);
    fill(game, 15, 25, 1, 1, [0, 0, 0]);
    const { map } = compareCapture(manifest, plan, render, game);
    expect(map.classes[25 * 200 + 15]).toBe(PIXEL.different);
    expect(map.differences[25 * 200 + 15]).toBe(200);
    expect(map.classes[25 * 200 + 16]).toBe(PIXEL.equal);
    expect(map.classes[0]).toBe(PIXEL.empty);
    expect(map.classes[30 * 200 + 80]).toBe(PIXEL.masked);
    const image = differenceImage(map, game);
    expect(Array.from(image.data.subarray((25 * 200 + 15) * 4, (25 * 200 + 15) * 4 + 4))).toEqual([
      255, 0, 0, 255,
    ]);
  });
});

describe('reports', () => {
  it('writes a window report and a summary with the gate', () => {
    const manifest = manifestWith();
    const passing = compare();
    const failing = compare({
      game: (g) => {
        fill(g, 15, 25, 5, 5, [0, 0, 0]);
      },
    });
    const key = { playset: 'vanilla', resolution: SCREEN, view: 'panel' };
    const outcomes = (comparison: CaptureComparison): CaptureOutcome[] => [
      { kind: 'compared', key, comparison },
    ];

    expect(corpusSummary(manifest, outcomes(passing)).passed).toBe(true);
    const failed = corpusSummary(manifest, outcomes(failing));
    expect(failed.passed).toBe(false);
    expect(failed.markdown).toContain('| [panel](panel.md) | vanilla | release | **0/1** |');

    const page = windowReport(manifest, 'panel', outcomes(failing));
    expect(page).toContain('| vanilla | 200x100 | panel | release | **fail** | 4 | 1 |');
    expect(page).toContain(
      '| `panel/icon[1]` | iconType | fail | 75.00 % of 100 pixels are within ±2',
    );

    const missing = corpusSummary(manifest, [
      { kind: 'not-compared', key, reasons: ['No capture record.'] },
    ]);
    expect(missing.passed).toBe(false);
    expect(
      windowReport(manifest, 'panel', [
        { kind: 'not-compared', key, reasons: ['No capture record.'] },
      ]),
    ).toContain('- No capture record.');
  });
});

describe('PNG', () => {
  it('writes and reads back straight RGBA', () => {
    const image: RgbaImage = {
      width: 3,
      height: 2,
      data: Uint8Array.from([
        1, 2, 3, 255, 4, 5, 6, 128, 7, 8, 9, 0, 10, 11, 12, 255, 13, 14, 15, 255, 16, 17, 18, 1,
      ]),
    };
    expect(decodePng(encodePng(image))).toEqual(image);
  });

  it('reads every row filter and RGB images', async () => {
    const { deflateSync } = await import('node:zlib');
    // 2×5 RGB, one row per filter type: none, sub, up, average, Paeth.
    const rows = [
      [0, 10, 20, 30, 40, 50, 60],
      [1, 10, 20, 30, 1, 1, 1],
      [2, 1, 1, 1, 1, 1, 1],
      [3, 5, 5, 5, 5, 5, 5],
      [4, 1, 2, 3, 4, 5, 6],
    ];
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(5, 4);
    ihdr.set([8, 2, 0, 0, 0], 8);
    const png = Buffer.concat([
      encodePng({ width: 1, height: 1, data: new Uint8Array(4) }).subarray(0, 8),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(Uint8Array.from(rows.flat()))),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const { width, height, data } = decodePng(png);
    expect([width, height]).toEqual([2, 5]);
    const rgb = (x: number, y: number): number[] =>
      Array.from(data.subarray((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
    expect(rgb(0, 0)).toEqual([10, 20, 30, 255]);
    expect(rgb(1, 1)).toEqual([11, 21, 31, 255]);
    expect(rgb(0, 2)).toEqual([11, 21, 31, 255]);
    // Average of left (absent: 0) and up: floor(up / 2) + 5.
    expect(rgb(0, 3)).toEqual([10, 15, 20, 255]);
    expect(rgb(1, 4)[3]).toBe(255);
  });

  it('refuses what it does not read', () => {
    expect(() => decodePng(Uint8Array.from([1, 2, 3]))).toThrow('Not a PNG file.');
  });
});

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  // The reader does not check CRCs.
  return out;
}
