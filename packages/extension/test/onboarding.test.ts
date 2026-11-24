import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCRIPT_LANGUAGE_EXTENSIONS } from '../src/script-language.ts';

interface Step {
  id: string;
  title: string;
  description: string;
  media: { svg?: string; altText?: string };
  completionEvents?: string[];
}

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
  publisher: string;
  name: string;
  activationEvents: string[];
  contributes: {
    commands: { command: string }[];
    views: { explorer: { id: string }[] };
    viewsWelcome: { view: string; contents: string }[];
    walkthroughs: { id: string; title: string; steps: Step[] }[];
    configuration: {
      id: string;
      title: string;
      order: number;
      properties: Record<string, { order?: number }>;
    }[];
  };
};
const { contributes } = manifest;
const contributed = new Set(contributes.commands.map((c) => c.command));
/** VS Code's own commands the walkthrough and the welcome view link to. */
const WORKBENCH = new Set([
  'workbench.action.quickOpen',
  'workbench.action.openSettings',
  'workbench.extensions.installExtension',
  'etch.widgetOutline.focus',
]);
/** How the welcome view counts the walkthrough's steps. */
const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** The commands of a text's `command:` links. */
function linked(text: string): string[] {
  return [...text.matchAll(/\(command:([\w.]+)/g)].map((m) => m[1] ?? '');
}

describe('the walkthrough', () => {
  const [walkthrough] = contributes.walkthroughs;

  it('has six steps, each ticking itself and with a picture of its own', () => {
    expect(walkthrough?.id).toBe('gettingStarted');
    expect(walkthrough?.steps.map((step) => step.title)).toEqual([
      'Find the game',
      'Open your first preview',
      'Find a widget in the Widget Outline',
      'Fill texts with sample data',
      'Start the live game (optional)',
      'Colour your script files',
    ]);
    for (const step of walkthrough?.steps ?? []) {
      expect(step.completionEvents?.length, step.id).toBeGreaterThan(0);
      const svg = step.media.svg ?? '';
      expect(existsSync(new URL(svg, root)), svg).toBe(true);
      expect(step.media.altText, step.id).toBeTruthy();
      // Etch's own drawings: no game art, nothing loaded from elsewhere.
      const picture = readFileSync(new URL(svg, root), 'utf8');
      expect(picture, svg).not.toMatch(/<image|href=|url\(/);
      // VS Code shows it under a content security policy that blocks styles without its nonce:
      // presentation attributes only.
      expect(picture, svg).not.toMatch(/<style|style=|class=/);
      // The page renders links and bold only: a backtick shows as itself.
      expect(step.description, step.id).not.toContain('`');
    }
  });

  it('ticks a context step also when the page opens after the context was set', () => {
    // VS Code registers an extension's walkthrough up to 5 s after start-up (it waits for an
    // experiment's answer), and a context that already holds then never ticks its step in that
    // session. The same context together with the Get Started page as the active editor ticks it
    // when the page opens.
    const events = (id: string): string[] | undefined =>
      walkthrough?.steps.find((step) => step.id === id)?.completionEvents;
    expect(events('findGame')).toEqual([
      'onContext:etch.gameFound',
      "onContext:etch.gameFound && activeEditor == 'gettingStartedPage'",
    ]);
    expect(events('openPreview')).toContain(
      "onContext:etch.previewOpen && activeEditor == 'gettingStartedPage'",
    );
  });

  it('offers the extensions of the script language notice and ticks when one is installed', () => {
    const step = walkthrough?.steps.find(({ id }) => id === 'colourScripts');
    const description = step?.description ?? '';
    // Its buttons install the extensions the notice offers, by the same names and ids.
    const buttons = [
      ...description.matchAll(
        /\n\[Install ([^\]]+)\]\(command:workbench\.extensions\.installExtension\?([^)]+)\)/g,
      ),
    ].map(([, name, args]) => ({
      name,
      id: (JSON.parse(decodeURIComponent(args ?? '')) as string[])[0],
    }));
    expect(buttons).toEqual(SCRIPT_LANGUAGE_EXTENSIONS.map(({ name, id }) => ({ name, id })));
    for (const { name } of SCRIPT_LANGUAGE_EXTENSIONS) expect(description).toContain(`**${name}**`);
    // VS Code's onExtensionInstalled; onboarding.ts ticks the step for one installed before.
    expect(step?.completionEvents).toEqual(
      SCRIPT_LANGUAGE_EXTENSIONS.map(({ id }) => `extensionInstalled:${id}`),
    );
  });

  it('has the ids by which Etch ticks the first and the sixth step', () => {
    // onboarding.ts ticks them with VS Code's welcome.markStepComplete, by the step's full id.
    const full = (step: Step | undefined): string =>
      `${manifest.publisher}.${manifest.name}#${walkthrough?.id ?? ''}#${step?.id ?? ''}`;
    expect(full(walkthrough?.steps[0])).toBe('happy-dwarf-team.etch#gettingStarted#findGame');
    expect(full(walkthrough?.steps[5])).toBe('happy-dwarf-team.etch#gettingStarted#colourScripts');
  });

  it('starts Etch when the walkthrough opens, so its steps tick in a window without mod files', () => {
    // The first step ticks from activate(), and the Widget Outline shows only while Etch runs.
    expect(manifest.activationEvents).toContain(`onWalkthrough:${walkthrough?.id ?? ''}`);
  });

  it('links only to commands that exist', () => {
    const links = [
      ...(walkthrough?.steps ?? []).flatMap((step) => linked(step.description)),
      ...contributes.viewsWelcome.flatMap((welcome) => linked(welcome.contents)),
    ];
    expect(links.length).toBeGreaterThan(0);
    for (const command of links) {
      expect(contributed.has(command) || WORKBENCH.has(command), command).toBe(true);
    }
  });
});

describe('the Widget Outline', () => {
  it('has a welcome view with a button and the way to the walkthrough', () => {
    expect(contributes.views.explorer.map((view) => view.id)).toContain('etch.widgetOutline');
    const [welcome] = contributes.viewsWelcome;
    expect(welcome?.view).toBe('etch.widgetOutline');
    expect(welcome?.contents).toContain('\n[Open a .gui File…](command:workbench.action.quickOpen');
    expect(welcome?.contents).toContain('(command:etch.getStarted)');
    // It says how many steps the walkthrough has.
    const steps = contributes.walkthroughs[0]?.steps.length ?? 0;
    expect(welcome?.contents).toContain(`in ${NUMBERS[steps] ?? ''} steps.`);
  });
});

describe('the settings', () => {
  it('come in four categories, Game first with Game Path first', () => {
    const categories = [...contributes.configuration].sort((a, b) => a.order - b.order);
    expect(categories.map((c) => c.title)).toEqual(['Game', 'Editor', 'Preview', 'Live Game']);
    const game = categories[0]?.properties ?? {};
    const first = Object.entries(game).sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))[0];
    expect(first?.[0]).toBe('etch.gamePath');
    // The keys stay the same: no setting moves to a new key.
    const keys = categories.flatMap((c) => Object.keys(c.properties));
    expect(keys).toContain('etch.previewResolution');
    expect(keys).toContain('etch.liveGame.pickModeKey');
    expect(new Set(keys).size).toBe(keys.length);
  });
});
