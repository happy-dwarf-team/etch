import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Step {
  id: string;
  title: string;
  description: string;
  media: { svg?: string; altText?: string };
  completionEvents?: string[];
}

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')) as {
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
  'etch.widgetOutline.focus',
]);

/** The commands of a text's `command:` links. */
function linked(text: string): string[] {
  return [...text.matchAll(/\(command:([\w.]+)/g)].map((m) => m[1] ?? '');
}

describe('the walkthrough', () => {
  const [walkthrough] = contributes.walkthroughs;

  it('has five steps, each ticking itself and with a picture of its own', () => {
    expect(walkthrough?.id).toBe('gettingStarted');
    expect(walkthrough?.steps.map((step) => step.title)).toEqual([
      'Find the game',
      'Open your first preview',
      'Find a widget in the Widget Outline',
      'Fill texts with sample data',
      'Start the live game (optional)',
    ]);
    for (const step of walkthrough?.steps ?? []) {
      expect(step.completionEvents?.length, step.id).toBeGreaterThan(0);
      const svg = step.media.svg ?? '';
      expect(existsSync(new URL(svg, root)), svg).toBe(true);
      expect(step.media.altText, step.id).toBeTruthy();
      // Etch's own drawings: no game art, nothing loaded from elsewhere.
      const picture = readFileSync(new URL(svg, root), 'utf8');
      expect(picture, svg).not.toMatch(/<image|href=|url\(/);
    }
    expect(walkthrough?.steps[0]?.completionEvents).toEqual(['onContext:etch.gameFound']);
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
