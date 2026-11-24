// `pnpm media evidence`: screenshots, and on request a recording, of Etch in VS Code for a pull
// request's Evidence (CONTRIBUTING.md, "Evidence"; docs/media.md, "Evidence for a pull request").
// A scenario file names the mod, the settings and the steps; the same steps run against the
// checkout's Etch and, with `--before`, against another checkout's, so the pictures compare like
// with like. The window is the captures' (2560 × 1440 at device scale 1) and every picture is
// Playwright's screenshot of it, cropped at 1:1 by the step's `clip`, never scaled.
import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import * as path from 'node:path';
import { VSCODE_VERSION, WINDOW } from './config.ts';
import { run } from './ffmpeg.ts';
import { Workbench } from './workbench.ts';

/** A part of the window, in its pixels. */
export interface Clip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Action =
  | { readonly kind: 'wait'; readonly ms: number }
  | { readonly kind: 'open'; readonly file: string }
  | { readonly kind: 'find'; readonly text: string; readonly caret: 'start' | 'end' | undefined }
  | { readonly kind: 'hover' }
  | { readonly kind: 'command'; readonly title: string }
  | { readonly kind: 'key'; readonly key: string; readonly times: number }
  | { readonly kind: 'type'; readonly text: string; readonly delayMs: number }
  | { readonly kind: 'click'; readonly button: string }
  | { readonly kind: 'shot'; readonly name: string; readonly clip: Clip | undefined };

/** A step: its action, then, with `until`, a wait until that CSS selector shows. */
export type Step = Action & { readonly until: string | undefined };

export interface Scenario {
  /** The scenario file (absolute). */
  readonly file: string;
  /** The scenario file's name without `.json`: the output folder's. */
  readonly name: string;
  /** The mod copied into the throwaway workspace (absolute). */
  readonly mod: string;
  /** The file VS Code opens first, relative to the mod. */
  readonly open: string;
  /** User settings over the captures' and `EVIDENCE_SETTINGS`. */
  readonly settings: Readonly<Record<string, unknown>>;
  /**
   * Folders of other unpacked extensions that VS Code loads beside Etch (absolute), for a change
   * that meets one, such as CWTools; none by default, as in the captures.
   */
  readonly extensions: readonly string[];
  readonly steps: readonly Step[];
}

/**
 * Settings evidence needs over the captures': hovers on, since a hover is often what a change
 * shows (the captures turn them off so the pointer shows none by chance; here only the `hover`
 * step opens one).
 */
export const EVIDENCE_SETTINGS: Readonly<Record<string, unknown>> = {
  'editor.hover.enabled': 'on',
};

/**
 * The default work folder, at the root of the temporary folder's drive (`C:\etch-evidence`): VS
 * Code shows the workspace's path in peek and Refactor Preview headers, and a path under the
 * user's folder would put their account name into public pictures.
 */
export function defaultWork(): string {
  return path.join(path.parse(tmpdir()).root, 'etch-evidence');
}

const ACTIONS = ['wait', 'open', 'find', 'hover', 'command', 'key', 'type', 'click', 'shot'];
const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  find: ['caret'],
  key: ['times'],
  type: ['delayMs'],
  shot: ['clip'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${where} is not a text`);
  return value;
}

function count(value: unknown, where: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new Error(`${where} is not a whole number from ${String(min)}`);
  }
  return value;
}

function clip(value: unknown, where: string): Clip {
  if (!isRecord(value)) throw new Error(`${where} is not { x, y, width, height }`);
  const box = {
    x: count(value['x'], `${where}.x`, 0),
    y: count(value['y'], `${where}.y`, 0),
    width: count(value['width'], `${where}.width`, 1),
    height: count(value['height'], `${where}.height`, 1),
  };
  if (box.x + box.width > WINDOW.width || box.y + box.height > WINDOW.height) {
    throw new Error(
      `${where} reaches past the window (${String(WINDOW.width)} × ${String(WINDOW.height)})`,
    );
  }
  return box;
}

function action(step: Record<string, unknown>, kind: string, where: string): Action {
  const value = step[kind];
  switch (kind) {
    case 'wait':
      return { kind, ms: count(value, where, 0) };
    case 'open':
      return { kind, file: text(value, where) };
    case 'find': {
      const caret = step['caret'];
      if (caret !== undefined && caret !== 'start' && caret !== 'end') {
        throw new Error(`${where}: caret is "start" or "end"`);
      }
      return { kind, text: text(value, where), caret };
    }
    case 'hover':
      if (value !== true) throw new Error(`${where} is not true`);
      return { kind };
    case 'command':
      return { kind, title: text(value, where) };
    case 'key':
      return {
        kind,
        key: text(value, where),
        times: step['times'] === undefined ? 1 : count(step['times'], `${where}: times`, 1),
      };
    case 'type':
      return {
        kind,
        text: text(value, where),
        delayMs: step['delayMs'] === undefined ? 0 : count(step['delayMs'], `${where}: delayMs`, 0),
      };
    case 'click':
      return { kind, button: text(value, where) };
    default: {
      const name = text(value, where);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        throw new Error(`${where}: "${name}" is not a file name of a-z, 0-9 and -`);
      }
      return {
        kind: 'shot',
        name,
        clip: step['clip'] === undefined ? undefined : clip(step['clip'], `${where}: clip`),
      };
    }
  }
}

/**
 * Reads a scenario file's JSON. `mod` and `extensions` are relative to the file (default:
 * `demoMod`, none); every step has one action and that action's options, and `until` on any step.
 */
export function parseScenario(json: string, file: string, demoMod: string): Scenario {
  const where = path.basename(file);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    throw new Error(`${where} is not JSON: ${(error as Error).message}`, { cause: error });
  }
  if (!isRecord(data)) throw new Error(`${where} is not an object`);
  for (const key of Object.keys(data)) {
    if (!['$comment', 'mod', 'open', 'settings', 'extensions', 'steps'].includes(key)) {
      throw new Error(`${where}: unknown key "${key}"`);
    }
  }
  const settings = data['settings'] ?? {};
  if (!isRecord(settings)) throw new Error(`${where}: settings is not an object`);
  const extensions = data['extensions'] ?? [];
  if (!Array.isArray(extensions)) throw new Error(`${where}: extensions is not a list`);
  const steps = data['steps'];
  if (!Array.isArray(steps) || steps.length === 0) throw new Error(`${where}: steps is empty`);
  const parsed = steps.map((step: unknown, index): Step => {
    const at = `${where}: steps[${String(index)}]`;
    if (!isRecord(step)) throw new Error(`${at} is not an object`);
    const kinds = Object.keys(step).filter((key) => ACTIONS.includes(key));
    const [kind] = kinds;
    if (kind === undefined || kinds.length > 1) {
      throw new Error(`${at} has ${String(kinds.length)} actions; one of ${ACTIONS.join(', ')}`);
    }
    for (const key of Object.keys(step)) {
      if (key !== kind && key !== 'until' && !(OPTIONS[kind] ?? []).includes(key)) {
        throw new Error(`${at}: "${key}" is not an option of ${kind}`);
      }
    }
    const until = step['until'] === undefined ? undefined : text(step['until'], `${at}: until`);
    return { ...action(step, kind, `${at}.${kind}`), until };
  });
  const names = parsed.flatMap((step) => (step.kind === 'shot' ? [step.name] : []));
  const twice = names.find((name, index) => names.indexOf(name) !== index);
  if (twice !== undefined) throw new Error(`${where}: two shots are named "${twice}"`);
  if (names.length === 0) throw new Error(`${where}: no step is a shot`);
  return {
    file: path.resolve(file),
    name: path.basename(file, '.json'),
    mod:
      data['mod'] === undefined
        ? demoMod
        : path.resolve(path.dirname(file), text(data['mod'], `${where}: mod`)),
    open: text(data['open'], `${where}: open`),
    settings,
    extensions: extensions.map((folder: unknown, index) =>
      path.resolve(path.dirname(file), text(folder, `${where}: extensions[${String(index)}]`)),
    ),
    steps: parsed,
  };
}

/** FFmpeg's arguments that cut a span (seconds into Playwright's WebM) to an MP4 at its size. */
export function trimArgs(video: string, from: number, to: number, out: string): string[] {
  const start = Math.max(0, from - 0.5);
  return [
    '-y',
    '-ss',
    start.toFixed(2),
    '-i',
    video,
    '-t',
    (to + 1 - start).toFixed(2),
    '-an',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    out,
  ];
}

/** One side's result: its checkout's commit, its shots by name, and its recording. */
export interface Side {
  readonly commit: string;
  readonly shots: readonly string[];
  readonly recording: string | undefined;
}

const slashes = (file: string): string => file.replaceAll('\\', '/');

/**
 * The Evidence section, ready for `gh pr edit` or `gh pr comment` with `--body-file` and one
 * `--attach` per file: each picture is referenced by the path `--attach` takes.
 */
export function evidenceMarkdown(options: {
  readonly scenario: string;
  readonly out: string;
  readonly after: Side;
  readonly before: Side | undefined;
}): string {
  const { out, after, before } = options;
  const file = (side: string, name: string): string => slashes(path.join(out, side, name));
  const builds =
    before === undefined
      ? `Etch at \`${after.commit}\``
      : `"before" is Etch at \`${before.commit}\`, "after" at \`${after.commit}\``;
  const lines = [
    '## Evidence',
    '',
    `Made with \`pnpm media evidence ${slashes(options.scenario)}\`: VS Code ${VSCODE_VERSION}, ` +
      `${String(WINDOW.width)} × ${String(WINDOW.height)} at device scale 1; ${builds}. ` +
      'Screenshots are cropped at 1:1, never scaled.',
    '',
  ];
  if (before === undefined) {
    for (const name of after.shots) lines.push(`![${name}](${file('after', `${name}.png`)})`, '');
  } else {
    lines.push('| Before | After |', '| --- | --- |');
    for (const name of after.shots) {
      lines.push(
        `| ![Before: ${name}](${file('before', `${name}.png`)}) | ![After: ${name}](${file('after', `${name}.png`)}) |`,
      );
    }
    lines.push('');
  }
  for (const [label, side] of [
    ['Before', before],
    ['After', after],
  ] as const) {
    if (side?.recording !== undefined) {
      lines.push(`![${label}: the steps, recorded](${slashes(side.recording)})`, '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/** The files an Evidence body references, for its `--attach` flags. */
export function attachments(markdown: string): string[] {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1] ?? '');
}

export interface EvidenceOptions {
  readonly scenario: Scenario;
  /** The checkout whose Etch is "after" (this repository). */
  readonly after: string;
  /** The checkout whose Etch is "before", built and installed (`pnpm install`); none: only after. */
  readonly before: string | undefined;
  readonly record: boolean;
  readonly ffmpeg: string;
  readonly work: string;
  readonly gamePath: string;
  /** `packages/media/out/evidence/<scenario>`. */
  readonly out: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** How long a step waits after its `until` element shows, for the element to take the focus. */
const UNTIL_SETTLE_MS = 500;

/** Words that would put the user's account into a public picture. */
function privateWords(): string[] {
  const home = homedir();
  return [home, slashes(home)];
}

async function perform(wb: Workbench, step: Step, shots: string): Promise<string | undefined> {
  const page = wb.page;
  switch (step.kind) {
    case 'wait':
      await sleep(step.ms);
      break;
    case 'open':
      await wb.quickOpen(step.file);
      break;
    case 'find':
      await wb.find(step.text);
      if (step.caret !== undefined) {
        await page.keyboard.press(step.caret === 'start' ? 'ArrowLeft' : 'ArrowRight');
      }
      break;
    case 'hover':
      await wb.command('Show or Focus Hover');
      await page.locator('.monaco-hover').filter({ visible: true }).first().waitFor();
      // Its thumbnails load after it opens.
      await sleep(1_000);
      break;
    case 'command':
      await wb.command(step.title);
      break;
    case 'key':
      await wb.press(step.key, step.times, 100);
      break;
    case 'type':
      await page.keyboard.type(step.text, { delay: step.delayMs });
      break;
    case 'click':
      await page.getByRole('button', { name: step.button, exact: true }).first().click();
      break;
    case 'shot': {
      const file = path.join(shots, `${step.name}.png`);
      await wb.screenshot(file, step.clip);
      const shown = await page.evaluate(() => document.body.innerText);
      const leak = privateWords().find((word) => shown.includes(word));
      if (leak !== undefined) {
        console.warn(
          `  ${step.name}: the window shows your home folder; crop it out before posting.`,
        );
      }
      console.log(`  ${step.name}.png`);
      return step.name;
    }
  }
  if (step.until !== undefined) {
    await page.locator(step.until).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    // An element shows before it takes the focus: F2's rename box did, and Control+A then
    // selected the editor's text instead of the box's.
    await sleep(UNTIL_SETTLE_MS);
  }
  return undefined;
}

async function side(
  label: 'before' | 'after',
  checkout: string,
  options: EvidenceOptions,
): Promise<Side> {
  const extension = path.join(checkout, 'packages', 'extension');
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: checkout,
    encoding: 'utf8',
  }).trim();
  console.log(`${label}: building Etch at ${commit}…`);
  await run(process.execPath, ['build.mts'], extension);
  const shots = path.join(options.out, label);
  await rm(shots, { recursive: true, force: true });
  await mkdir(shots, { recursive: true });
  const wb = await Workbench.launch({
    work: options.work,
    extensionPath: extension,
    demoMod: options.scenario.mod,
    overrides: [],
    open: options.scenario.open,
    gamePath: options.gamePath,
    videoDir: options.record ? path.join(shots, 'video') : undefined,
    settings: { ...EVIDENCE_SETTINGS, ...options.scenario.settings },
    ...(options.scenario.extensions.length === 0 ? {} : { helpers: options.scenario.extensions }),
  });
  const taken: string[] = [];
  const span = { from: 0, to: 0 };
  let failure: unknown;
  try {
    span.from = Date.now();
    for (const [index, step] of options.scenario.steps.entries()) {
      try {
        const name = await perform(wb, step, shots);
        if (name !== undefined) taken.push(name);
      } catch (error) {
        throw new Error(`step ${String(index)} (${step.kind}): ${(error as Error).message}`, {
          cause: error,
        });
      }
    }
    span.to = Date.now();
  } catch (error) {
    failure = error;
    await wb.screenshot(path.join(shots, 'failed.png')).catch(() => undefined);
  }
  const video = await wb.close();
  if (failure !== undefined) {
    throw new Error(
      `${label}: ${(failure as Error).message}; the window is in ${path.join(shots, 'failed.png')}`,
      {
        cause: failure,
      },
    );
  }
  let recording: string | undefined;
  if (video !== undefined) {
    recording = path.join(shots, 'recording.mp4');
    await run(
      options.ffmpeg,
      trimArgs(video, (span.from - wb.openedAt) / 1000, (span.to - wb.openedAt) / 1000, recording),
    );
    await rm(path.dirname(video), { recursive: true, force: true });
    console.log('  recording.mp4');
  }
  return { commit, shots: taken, recording };
}

/** Runs the scenario on each side and writes `evidence.md` into `out`; resolves to its path. */
export async function evidence(
  options: EvidenceOptions,
): Promise<{ markdown: string; file: string }> {
  await mkdir(options.out, { recursive: true });
  const before =
    options.before === undefined ? undefined : await side('before', options.before, options);
  const after = await side('after', options.after, options);
  const markdown = evidenceMarkdown({
    scenario: path.relative(options.after, options.scenario.file),
    out: options.out,
    after,
    before,
  });
  const file = path.join(options.out, 'evidence.md');
  await writeFile(file, markdown);
  return { markdown, file };
}
