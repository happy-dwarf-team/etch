import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import { decodePng, encodePng, type RgbaImage } from '@etch/core/corpus';
import { HeadlessRenderer, runCorpus } from '../src/index.ts';

type Rgba = readonly [number, number, number, number];

const BG: Rgba = [40, 50, 60, 255];
const ICON: Rgba = [200, 100, 0, 255];

/** An uncompressed BGRA8 DDS file of one colour. */
function dds(width: number, height: number, [r, g, b, a]: Rgba): Uint8Array {
  const header = new Uint8Array(128);
  const view = new DataView(header.buffer);
  const put = (offset: number, value: number): void => {
    view.setUint32(offset, value, true);
  };
  put(0, 0x20534444);
  put(4, 124);
  put(8, 0x1007);
  put(12, height);
  put(16, width);
  put(76, 32);
  put(80, 0x41);
  put(88, 32);
  [0xff0000, 0xff00, 0xff, 0xff000000].forEach((mask, i) => {
    put(92 + i * 4, mask);
  });
  put(108, 0x1000);
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([b, g, r, a], i);
  const out = new Uint8Array(header.length + data.length);
  out.set(header);
  out.set(data, header.length);
  return out;
}

async function tree(root: string, files: Record<string, string | Uint8Array>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, ...path.split('/'));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
}

function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

/** A screen of the game: black, with the panel's background and icon. */
function screen(icon: Rgba): RgbaImage {
  const data = new Uint8Array(200 * 100 * 4);
  for (let p = 0; p < 200 * 100; p++) data.set([0, 0, 0, 255], p * 4);
  const fill = (x: number, y: number, w: number, h: number, rgba: Rgba): void => {
    for (let row = y; row < y + h; row++) {
      for (let col = x; col < x + w; col++) data.set(rgba, (row * 200 + col) * 4);
    }
  };
  fill(10, 20, 100, 50, BG);
  fill(15, 25, 10, 10, icon);
  return { width: 200, height: 100, data };
}

test('draws a draw list headless as the preview does', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'etch-compare-'));
  try {
    await tree(folder, { 'icon.dds': dds(4, 4, ICON) });
    const renderer = await HeadlessRenderer.launch();
    try {
      expect(renderer.gpu).toContain('SwiftShader');
      const { image, problems } = await renderer.paint(
        {
          version: 1,
          width: 8,
          height: 4,
          textures: ['gfx/icon.dds', 'gfx/missing.dds'],
          draws: [
            {
              kind: 'sprite',
              source: 0,
              texture: 0,
              x: 2,
              y: 0,
              width: 4,
              height: 4,
              sx: 0,
              sy: 0,
              sw: 4,
              sh: 4,
              shader: 'default',
            },
            {
              kind: 'sprite',
              source: 0,
              texture: 1,
              x: 0,
              y: 0,
              width: 1,
              height: 1,
              sx: 0,
              sy: 0,
              sw: 1,
              sh: 1,
              shader: 'default',
            },
          ],
        },
        (path) => (path === 'gfx/icon.dds' ? join(folder, 'icon.dds') : undefined),
      );
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain('missing/gfx/missing.dds');
      const at = (x: number, y: number): number[] =>
        Array.from(image.data.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
      expect(at(1, 1)).toEqual([0, 0, 0, 0]);
      expect(at(2, 0)).toEqual([...ICON]);
      expect(at(5, 3)).toEqual([...ICON]);
    } finally {
      await renderer.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('compares a corpus of a fixture game and writes the reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'etch-compare-'));
  try {
    const game = join(root, 'game');
    const corpus = join(root, 'corpus');
    const local = join(root, 'local');
    const exe = 'not the game';
    await tree(game, {
      'eu4.exe': exe,
      'interface/test.gfx': `spriteTypes = {
        spriteType = { name = "GFX_bg" texturefile = "gfx/interface/bg.dds" }
        spriteType = { name = "GFX_icon" texturefile = "gfx/interface/icon.dds" }
      }`,
      'interface/test.gui': `guiTypes = {
        windowType = {
          name = "panel" position = { x = 10 y = 20 } size = { x = 100 y = 50 }
          iconType = { name = "bg" spriteType = "GFX_bg" }
          iconType = { name = "icon" spriteType = "GFX_icon" position = { x = 5 y = 5 } }
        }
      }`,
      'gfx/interface/bg.dds': dds(100, 50, BG),
      'gfx/interface/icon.dds': dds(10, 10, ICON),
    });
    const view = (id: string): object => ({
      id,
      title: id,
      recipe: { from: 'main-menu', steps: [], verified: true, evidence: 'a fixture' },
      roots: ['panel'],
      codeFilled: [],
    });
    const manifest = {
      formatVersion: 1,
      game: { version: '1.37.5', exeSha256: sha256(exe) },
      tongs: { version: '0.14.1' },
      uiScale: 1,
      resolutions: [
        { width: 200, height: 100, confirmed: true, evidence: 'a fixture' },
        { width: 300, height: 100, confirmed: true, evidence: 'a fixture' },
      ],
      codeFilledKinds: [],
      notCovered: [],
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
          why: 'a fixture',
          views: [view('panel'), view('panel-off')],
        },
      ],
      knownDeviations: [],
    };
    const capture = async (id: string, icon: Rgba): Promise<void> => {
      const png = encodePng(screen(icon));
      const widget = (path: string, x: number, y: number, w: number, h: number): object => ({
        path,
        name: path.split('/').pop(),
        type: 'icon',
        visible: true,
        rect: { x, y, w, h },
      });
      const record = {
        formatVersion: 1,
        playset: 'vanilla',
        resolution: { width: 200, height: 100 },
        view: id,
        takenAt: '2026-10-21T00:00:00Z',
        game: { exeSha256: sha256(exe) },
        tongs: { version: '0.14.1' },
        mods: [],
        disabledDlcs: [],
        recipe: { from: 'main-menu', steps: [], verified: true, evidence: 'a fixture' },
        window: { width: 200, height: 100, dpi: 96 },
        screenshot: { sha256: sha256(png), width: 200, height: 100 },
        widgets: [
          {
            ...widget('panel', 10, 20, 100, 50),
            type: 'window',
            children: [widget('panel/bg', 10, 20, 100, 50), widget('panel/icon', 15, 25, 10, 10)],
          },
        ],
      };
      await tree(corpus, { [`captures/vanilla/200x100/${id}.json`]: JSON.stringify(record) });
      await tree(local, { [`captures/vanilla/200x100/${id}.png`]: png });
    };
    await tree(corpus, { 'manifest.json': JSON.stringify(manifest) });
    await capture('panel', ICON);
    // The game showed the icon darker than the render draws it.
    await capture('panel-off', [100, 50, 0, 255]);

    const lines: string[] = [];
    const result = await runCorpus({
      corpusFolder: corpus,
      localFolder: local,
      gamePath: game,
      environment: { readRegistryValue: () => Promise.resolve(undefined), env: {}, homedir: root },
      log: (line) => lines.push(line),
    });

    expect(result.outcomes.map((o) => [o.key.view, o.key.resolution.width, o.kind])).toEqual([
      ['panel', 200, 'compared'],
      ['panel-off', 200, 'compared'],
      ['panel', 300, 'not-compared'],
      ['panel-off', 300, 'not-compared'],
    ]);
    const [same, off, missing] = result.outcomes;
    expect(same?.kind === 'compared' && same.comparison.passed).toBe(true);
    expect(same?.kind === 'compared' && same.comparison.totals.widgets.pass).toBe(3);
    expect(off?.kind === 'compared' && off.comparison.widgets.map((w) => w.status)).toEqual([
      'pass',
      'pass',
      'fail',
    ]);
    expect(missing?.kind === 'not-compared' && missing.reasons).toEqual(['No capture record.']);
    expect(result.passed).toBe(false);
    expect(lines).toContain('captures/vanilla/200x100/panel-off: FAIL');

    const render = decodePng(
      await readFile(join(local, 'renders/captures/vanilla/200x100/panel.png')),
    );
    expect(Array.from(render.data.subarray((25 * 200 + 15) * 4, (25 * 200 + 15) * 4 + 4))).toEqual([
      ...ICON,
    ]);
    const diff = decodePng(
      await readFile(join(local, 'diffs/captures/vanilla/200x100/panel-off.png')),
    );
    expect(diff.data[(25 * 200 + 15) * 4]).toBe(228);
    const json = JSON.parse(
      await readFile(join(local, 'reports/captures/vanilla/200x100/panel-off.json'), 'utf8'),
    ) as { passed: boolean; renderer: string };
    expect(json.passed).toBe(false);
    expect(json.renderer).toContain('SwiftShader');
    expect(await readFile(join(local, 'reports/panel.md'), 'utf8')).toContain(
      '| `panel/icon` | iconType | fail | 0.00 % of 100 pixels are within ±2 (mean difference 100.00). |',
    );
    expect(await readFile(join(local, 'reports/README.md'), 'utf8')).toContain(
      '| [panel](panel.md) | vanilla | release | **1/2** | **0/2** |',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
