import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { attachments, evidenceMarkdown, parseScenario, trimArgs } from '../src/evidence.ts';

const DEMO = path.resolve('demo');
const scenario = (data: unknown): ReturnType<typeof parseScenario> =>
  parseScenario(JSON.stringify(data), path.resolve('dir', 'case.json'), DEMO);
const error = (data: unknown): string => {
  try {
    scenario(data);
  } catch (caught) {
    return (caught as Error).message;
  }
  throw new Error('the scenario was accepted');
};

describe('evidence scenarios', () => {
  it('reads every action with its options and defaults', () => {
    const read = scenario({
      open: 'interface/a.gui',
      settings: { 'etch.editor.spriteThumbnails': true },
      steps: [
        { wait: 500 },
        { open: 'a.gfx' },
        { find: 'GFX_a', caret: 'start' },
        { hover: true },
        { command: 'View: Close Primary Side Bar' },
        { key: 'Shift+F12', until: '.peekview-widget' },
        { key: 'Tab', times: 3 },
        { type: 'GFX_b', delayMs: 60 },
        { click: 'Apply' },
        { shot: 'after-1', clip: { x: 0, y: 10, width: 100, height: 50 } },
        { shot: 'whole' },
      ],
    });
    expect(read).toMatchObject({
      name: 'case',
      file: path.resolve('dir', 'case.json'),
      mod: DEMO,
      open: 'interface/a.gui',
      settings: { 'etch.editor.spriteThumbnails': true },
    });
    expect(read.steps).toEqual([
      { kind: 'wait', ms: 500, until: undefined },
      { kind: 'open', file: 'a.gfx', until: undefined },
      { kind: 'find', text: 'GFX_a', caret: 'start', until: undefined },
      { kind: 'hover', until: undefined },
      { kind: 'command', title: 'View: Close Primary Side Bar', until: undefined },
      { kind: 'key', key: 'Shift+F12', times: 1, until: '.peekview-widget' },
      { kind: 'key', key: 'Tab', times: 3, until: undefined },
      { kind: 'type', text: 'GFX_b', delayMs: 60, until: undefined },
      { kind: 'click', button: 'Apply', until: undefined },
      {
        kind: 'shot',
        name: 'after-1',
        clip: { x: 0, y: 10, width: 100, height: 50 },
        until: undefined,
      },
      { kind: 'shot', name: 'whole', clip: undefined, until: undefined },
    ]);
  });

  it('takes the mod relative to the scenario file', () => {
    expect(scenario({ mod: '../mod', open: 'a.gui', steps: [{ shot: 'a' }] }).mod).toBe(
      path.resolve('mod'),
    );
  });

  it('loads no other extension by default, and the listed ones relative to the scenario file', () => {
    expect(scenario({ open: 'a.gui', steps: [{ shot: 'a' }] }).extensions).toEqual([]);
    expect(
      scenario({ open: 'a.gui', extensions: ['../ext/cwtools'], steps: [{ shot: 'a' }] })
        .extensions,
    ).toEqual([path.resolve('ext', 'cwtools')]);
    expect(error({ open: 'a.gui', extensions: 'cwtools', steps: [{ shot: 'a' }] })).toBe(
      'case.json: extensions is not a list',
    );
    expect(error({ open: 'a.gui', extensions: [3], steps: [{ shot: 'a' }] })).toBe(
      'case.json: extensions[0] is not a text',
    );
  });

  it('refuses what it cannot run, naming the step', () => {
    const shot = { shot: 'a' };
    expect(error({ steps: [shot] })).toBe('case.json: open is not a text');
    expect(error({ open: 'a.gui', steps: [] })).toBe('case.json: steps is empty');
    expect(error({ open: 'a.gui', steps: [{ wait: 1 }] })).toBe('case.json: no step is a shot');
    expect(error({ open: 'a.gui', step: [shot] })).toBe('case.json: unknown key "step"');
    expect(error({ open: 'a.gui', steps: [shot, { wait: 1, key: 'F2' }] })).toBe(
      'case.json: steps[1] has 2 actions; one of wait, open, find, hover, command, key, type, click, shot',
    );
    expect(error({ open: 'a.gui', steps: [shot, { key: 'F2', delayMs: 5 }] })).toBe(
      'case.json: steps[1]: "delayMs" is not an option of key',
    );
    expect(error({ open: 'a.gui', steps: [shot, { find: 'x', caret: 'middle' }] })).toBe(
      'case.json: steps[1].find: caret is "start" or "end"',
    );
    expect(error({ open: 'a.gui', steps: [shot, { shot: 'a' }] })).toBe(
      'case.json: two shots are named "a"',
    );
    expect(error({ open: 'a.gui', steps: [{ shot: 'A b' }] })).toBe(
      'case.json: steps[0].shot: "A b" is not a file name of a-z, 0-9 and -',
    );
    expect(
      error({
        open: 'a.gui',
        steps: [{ shot: 'a', clip: { x: 2000, y: 0, width: 600, height: 1 } }],
      }),
    ).toBe('case.json: steps[0].shot: clip reaches past the window (2560 × 1440)');
  });

  it('reads the scenarios in packages/media/evidence', () => {
    const folder = path.join(import.meta.dirname, '..', 'evidence');
    const files = readdirSync(folder).filter((file) => file.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const full = path.join(folder, file);
      expect(() => parseScenario(readFileSync(full, 'utf8'), full, DEMO)).not.toThrow();
    }
  });
});

describe('evidence output', () => {
  const out = 'C:\\etch\\packages\\media\\out\\evidence\\case';

  it('pairs before and after in a table and references each file by its --attach path', () => {
    const markdown = evidenceMarkdown({
      scenario: 'packages\\media\\evidence\\case.json',
      out,
      before: { commit: 'aaa1111', shots: ['hover'], recording: undefined },
      after: { commit: 'bbb2222', shots: ['hover'], recording: `${out}\\after\\recording.mp4` },
    });
    expect(markdown).toContain(
      '`pnpm media evidence packages/media/evidence/case.json`: VS Code 1.142.0, 2560 × 1440 at device scale 1; "before" is Etch at `aaa1111`, "after" at `bbb2222`.',
    );
    expect(markdown).toContain(
      '| ![Before: hover](C:/etch/packages/media/out/evidence/case/before/hover.png) | ![After: hover](C:/etch/packages/media/out/evidence/case/after/hover.png) |',
    );
    expect(attachments(markdown)).toEqual([
      'C:/etch/packages/media/out/evidence/case/before/hover.png',
      'C:/etch/packages/media/out/evidence/case/after/hover.png',
      'C:/etch/packages/media/out/evidence/case/after/recording.mp4',
    ]);
  });

  it('lists the shots alone without a before', () => {
    const markdown = evidenceMarkdown({
      scenario: 'case.json',
      out,
      before: undefined,
      after: { commit: 'bbb2222', shots: ['a', 'b'], recording: undefined },
    });
    expect(markdown).not.toContain('| Before |');
    expect(attachments(markdown)).toHaveLength(2);
  });

  it('cuts the recording from half a second before the steps to a second after, unscaled', () => {
    const args = trimArgs('v.webm', 4.25, 20, 'r.mp4');
    expect(args.slice(0, 7)).toEqual(['-y', '-ss', '3.75', '-i', 'v.webm', '-t', '17.25']);
    expect(args.join(' ')).not.toContain('scale');
    expect(trimArgs('v.webm', 0.2, 1, 'r.mp4')[2]).toBe('0.00');
  });
});
