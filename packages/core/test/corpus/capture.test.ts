/// <reference types="node" />
import { createHash } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  captureProblems,
  capturedWidgets,
  hashModFolder,
  localCorpusFolder,
  matchesWidgetPattern,
  parseCaptureRecord,
  parseCorpusManifest,
  screenshotFile,
  widgetPatternProblem,
  type CaptureRecord,
  type CorpusManifest,
} from '../../src/corpus/index.ts';
import { makeTree, removeTree } from '../playset/fixture.ts';
import { set } from './json-edit.ts';

const EXE = '9AD3EFE1AF169F40EE577F9DAE5DEBBC87AF6FB8B5450FB345EBF110DC4D771A';
const SAVE = 'A'.repeat(64);
const MOD = 'B'.repeat(64);

const manifest = parseCorpusManifest({
  formatVersion: 1,
  game: { version: '1.37.5', exeSha256: EXE },
  tongs: { version: '0.14.1' },
  uiScale: 1,
  resolutions: [{ width: 3440, height: 1440, confirmed: true, evidence: 'the lab monitor' }],
  codeFilledKinds: [],
  notCovered: [],
  playsets: [
    {
      id: 'modded',
      title: 'Modded',
      gate: 'release',
      save: { file: 'a.eu4', sha256: SAVE, description: 'a save' },
      mods: [{ name: 'A mod', sha256: MOD }],
      disabledDlcs: [],
      windows: ['court'],
    },
  ],
  windows: [
    {
      id: 'court',
      title: 'Court',
      files: ['interface/countrycourtview.gui'],
      why: 'a pie chart',
      views: [
        {
          id: 'court',
          title: 'Court',
          recipe: { from: 'save', steps: [{ key: 'f1' }], verified: true, evidence: 'live' },
          roots: ['countrycourtview'],
          codeFilled: [],
        },
      ],
    },
  ],
  knownDeviations: [],
}).manifest as CorpusManifest;

function record(): Record<string, unknown> {
  return {
    formatVersion: 1,
    playset: 'modded',
    resolution: { width: 3440, height: 1440 },
    view: 'court',
    takenAt: '2026-10-22T10:00:00Z',
    game: { exeSha256: EXE },
    tongs: { version: '0.14.1' },
    save: { sha256: SAVE },
    mods: [{ name: 'A mod', sha256: MOD }],
    disabledDlcs: [],
    recipe: { from: 'save', steps: [{ key: 'f1' }], verified: true, evidence: 'live' },
    window: { width: 3440, height: 1440, dpi: 96 },
    screenshot: { sha256: 'C'.repeat(64), width: 3440, height: 1440, shots: 2 },
    widgets: [
      {
        path: 'countrycourtview',
        name: 'countrycourtview',
        type: 'window',
        visible: true,
        rect: { x: 0, y: 92, w: 1229, h: 120 },
        children: [
          {
            path: 'countrycourtview/close',
            name: 'close',
            type: 'button',
            visible: true,
            rect: { x: 600, y: 100, w: 32, h: 32 },
            enabled: true,
          },
          {
            path: 'countrycourtview/advisor[2]',
            name: 'advisor',
            type: 'text',
            visible: false,
            rect: { x: -40, y: 0, w: 0, h: 0 },
            text: '£adm£ Advisor',
          },
        ],
      },
    ],
  };
}

function parsed(edit: (r: Record<string, unknown>) => void = () => undefined): CaptureRecord {
  const r = record();
  edit(r);
  const { capture, problems } = parseCaptureRecord(r);
  expect(problems).toEqual([]);
  return capture as CaptureRecord;
}

function problemsOf(edit: (r: Record<string, unknown>) => void): string[] {
  const r = record();
  edit(r);
  return parseCaptureRecord(r).problems.map((p) => `${p.at}: ${p.message}`);
}

describe('parseCaptureRecord', () => {
  it('accepts a record with its widget tree', () => {
    const capture = parsed();
    expect([...capturedWidgets(capture.widgets)].map((w) => w.path)).toEqual([
      'countrycourtview',
      'countrycourtview/close',
      'countrycourtview/advisor[2]',
    ]);
  });

  it('holds how many shots were taken and the unstable pixels', () => {
    expect(
      parsed((r) => {
        set(r, 'screenshot.unstable', { pixels: 12, sha256: 'D'.repeat(64) });
      }).screenshot.unstable,
    ).toEqual({ pixels: 12, sha256: 'D'.repeat(64) });
    expect(
      problemsOf((r) => {
        set(r, 'screenshot.shots', 1);
        set(r, 'screenshot.unstable', { pixels: 0, sha256: 'd' });
      }),
    ).toEqual([
      'screenshot.shots: Expected at least 2.',
      'screenshot.unstable.pixels: Expected at least 1.',
      'screenshot.unstable.sha256: "d" is not an uppercase SHA-256.',
    ]);
    expect(
      problemsOf((r) => {
        r['screenshot'] = { width: 3440, height: 1440 };
      }),
    ).toEqual(['screenshot: Missing field "sha256".', 'screenshot: Missing field "shots".']);
  });

  it('rejects stale widgets and trees cut by depth', () => {
    expect(
      problemsOf((r) => {
        set(r, 'widgets.0.children.0.stale', true);
        set(r, 'widgets.0.children.1.children_count', 3);
      }),
    ).toEqual([
      'widgets[0].children[0].stale: A stale widget: the tree was read after a reload (ADR 0002).',
      'widgets[0].children[1].children_count: A tree cut by depth=; captures read the whole tree.',
    ]);
  });

  it('checks paths against their parents and each other', () => {
    expect(
      problemsOf((r) => {
        set(r, 'widgets.0.children.0.path', 'countryview/close');
        set(r, 'widgets.0.children.1.path', 'countryview/close');
      }),
    ).toEqual([
      'widgets[0].children[0].path: "countryview/close" is not a child of "countrycourtview".',
      'widgets[0].children[1].path: The path "countryview/close" occurs more than once.',
      'widgets[0].children[1].path: "countryview/close" is not a child of "countrycourtview".',
    ]);
  });

  it('checks widget fields and the capture fields', () => {
    expect(
      problemsOf((r) => {
        set(r, 'widgets.0.type', 'guiButtonType');
        set(r, 'widgets.0.rect.w', 1.5);
        set(r, 'widgets.0.rect.h', -100);
        set(r, 'takenAt', '22 October 2026');
        set(r, 'recipe.verified', false);
      }),
    ).toEqual([
      'takenAt: "22 October 2026" is not an ISO 8601 time in UTC.',
      'recipe.verified: A capture is taken only with a recipe that worked.',
      expect.stringMatching(/^widgets\[0\]\.type: Expected one of "window"/),
      'widgets[0].rect.w: Expected an integer.',
    ]);
  });
});

describe('captureProblems', () => {
  it('finds nothing in a capture that matches the manifest', () => {
    expect(captureProblems(manifest, parsed())).toEqual([]);
  });

  it('asks for a recapture when what it was taken with changed', () => {
    const capture = parsed((r) => {
      set(r, 'game.exeSha256', 'D'.repeat(64));
      set(r, 'tongs.version', '0.14.0');
      set(r, 'save.sha256', 'E'.repeat(64));
      set(r, 'mods.0.sha256', 'F'.repeat(64));
      r['disabledDlcs'] = ['Golden Century'];
      set(r, 'recipe.steps', [{ key: 'f2' }]);
    });
    expect(captureProblems(manifest, capture).map((p) => p.at)).toEqual([
      'game.exeSha256',
      'tongs.version',
      'save',
      'mods[0].sha256',
      'disabledDlcs',
      'recipe',
    ]);
  });

  it("asks for the view's own save where it has one", () => {
    const event = { file: 'event.eu4', sha256: 'E'.repeat(64), description: 'an event open' };
    const own = parseCorpusManifest({
      ...JSON.parse(JSON.stringify(manifest)),
      windows: manifest.windows.map((w) => ({
        ...w,
        views: w.views.map((v) => ({ ...v, save: event })),
      })),
    }).manifest as CorpusManifest;
    expect(captureProblems(own, parsed()).map((p) => `${p.at}: ${p.message}`)).toEqual([
      'save: Taken with another save than the view pins in this playset.',
    ]);
    expect(
      captureProblems(
        own,
        parsed((r) => {
          set(r, 'save.sha256', event.sha256);
        }),
      ),
    ).toEqual([]);
  });

  it('checks the client area, the DPI, the screenshot and the roots', () => {
    const capture = parsed((r) => {
      r['window'] = { width: 3440, height: 1400, dpi: 120 };
      set(r, 'screenshot.height', 1400);
      set(r, 'widgets.0.path', 'countryview');
      set(r, 'widgets.0.children', []);
    });
    expect(captureProblems(manifest, capture).map((p) => `${p.at}: ${p.message}`)).toEqual([
      'window: The client area is not 3440x1440.',
      'window.dpi: Only DPI 96 is checked (etch#5).',
      'screenshot: The screenshot is not 3440x1440.',
      'widgets[0]: "countryview" is not one of the view\'s roots.',
      'widgets: The root "countrycourtview" is missing from the tree.',
    ]);
  });

  it('reports a playset, view or resolution the manifest does not have', () => {
    const capture = parsed((r) => {
      r['playset'] = 'other';
      r['view'] = 'ledger';
      r['resolution'] = { width: 1920, height: 1080 };
    });
    expect(
      captureProblems(manifest, capture)
        .slice(0, 3)
        .map((p) => p.at),
    ).toEqual(['playset', 'view', 'resolution']);
  });
});

describe('widget patterns', () => {
  it.each([
    ['countrycourtview', 'countrycourtview', true],
    ['countrycourtview', 'countrycourtview/close', false],
    ['CountryCourtView/Close', 'countrycourtview/close', true],
    ['countrycourtview/*', 'countrycourtview/close', true],
    ['countrycourtview/cl?se', 'countrycourtview/close', true],
    ['countrycourtview//close', 'countrycourtview/a/b/close', true],
    ['//close', 'countrycourtview/a/close', true],
    ['//close', 'close', true],
    ['close', 'countrycourtview/close', false],
    ['a/entry', 'a/entry[2]', true],
    ['a/entry[2]', 'a/entry[2]', true],
    ['a/entry[2]', 'a/entry[3]', false],
    ['a/entry[2]', 'a/entry', false],
    ['a/[3]', 'a/[3]', true],
    ['a/[3]', 'a/b[3]', true],
    ['a//*', 'a', false],
    ['//*', 'a', true],
  ])('%s against %s is %s', (pattern, path, expected) => {
    expect(matchesWidgetPattern(pattern, path)).toBe(expected);
  });

  it.each([
    ['', 'A pattern is not empty and has no surrounding spaces.'],
    ['a/', '"a/" ends with a slash.'],
    ['a///b', '"a///b" has more than two slashes in a row.'],
    ['a/b[0]', '"b[0]" in "a/b[0]" is not a name with an optional [n].'],
    ['a/[type=button]', '"[type=button]" in "a/[type=button]" is not a name with an optional [n].'],
  ])('rejects %j', (pattern, problem) => {
    expect(widgetPatternProblem(pattern)).toBe(problem);
    expect(matchesWidgetPattern(pattern, 'a/b')).toBe(false);
  });
});

describe('hashModFolder', () => {
  const trees: string[] = [];
  afterEach(async () => {
    await Promise.all(trees.splice(0).map(removeTree));
  });
  const tree = async (files: Record<string, string>): Promise<string> => {
    const root = await makeTree(files);
    trees.push(root);
    return root;
  };

  it('depends on paths and contents, not on where the folder is', async () => {
    const files = { 'descriptor.mod': 'name="A"', 'interface/a.gui': 'guiTypes = {}' };
    const a = await tree(files);
    const b = await tree(files);
    const hash = await hashModFolder(a);
    expect(hash).toMatch(/^[0-9A-F]{64}$/);
    expect(await hashModFolder(b)).toBe(hash);

    await writeFile(join(b, 'interface', 'a.gui'), 'guiTypes = { }');
    const changed = await hashModFolder(b);
    expect(changed).not.toBe(hash);
    await rename(join(b, 'interface', 'a.gui'), join(b, 'interface', 'b.gui'));
    expect(await hashModFolder(b)).not.toBe(changed);
  });

  it('is the hash of the sorted listing of file hashes', async () => {
    // The definition in corpus/README.md: one "<file SHA-256> <path>\n" per file, by path.
    const sha = (text: string): string =>
      createHash('sha256').update(text).digest('hex').toUpperCase();
    const listing = `${sha('2')} C/c\n${sha('1')} a\n${sha('3')} b\n`;
    expect(await hashModFolder(await tree({ a: '1', 'C/c': '2', b: '3' }))).toBe(sha(listing));
  });
});

describe('the local corpus folder', () => {
  const repository = resolve('/repos/etch');

  it('is unset without ETCH_CORPUS_PATH', () => {
    expect(localCorpusFolder({}, repository)).toBeUndefined();
    expect(localCorpusFolder({ ETCH_CORPUS_PATH: ' ' }, repository)).toBeUndefined();
  });

  it('is an absolute folder outside the repository', () => {
    const folder = resolve('/corpus/etch');
    expect(localCorpusFolder({ ETCH_CORPUS_PATH: folder }, repository)).toBe(folder);
    expect(() => localCorpusFolder({ ETCH_CORPUS_PATH: 'corpus' }, repository)).toThrow(/absolute/);
    expect(() =>
      localCorpusFolder({ ETCH_CORPUS_PATH: join(repository, 'corpus') }, repository),
    ).toThrow(/outside the repository/);
    expect(() => localCorpusFolder({ ETCH_CORPUS_PATH: repository }, repository)).toThrow(
      /outside the repository/,
    );
  });

  it('holds screenshots at the capture paths', () => {
    const key = { playset: 'vanilla', resolution: { width: 3440, height: 1440 }, view: 'court' };
    expect(screenshotFile(resolve('/corpus'), key)).toBe(
      join(resolve('/corpus'), 'captures', 'vanilla', '3440x1440', 'court.png'),
    );
  });
});
